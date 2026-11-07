import {
  canChi,
  canHu,
  canUseSameTiles,
  getWaitingTiles,
} from './hand-validator';
import {
  countTiles,
  createWall,
  isValidTile,
  removeTiles,
  sortTiles,
} from './tile';
import {
  ActionRequest,
  ActionType,
  EngineResult,
  MahjongGameState,
  Meld,
  OperationWindow,
  PlayerState,
  RuleOptions,
  Seat,
  Tile,
} from './types';

const DEFAULT_RULES: RuleOptions = {
  enableQidui: false,
  gangScore: false,
  huOnly: true,
  bankerContinueOnDraw: true,
};

const ACTION_PRIORITY: ActionType[] = ['HU', 'MING_GANG', 'PENG', 'CHI', 'PASS'];

export class MahjongEngine {
  start(
    gameId: string,
    userId: string,
    rules: Partial<RuleOptions> = {},
    random: () => number = Math.random,
  ): MahjongGameState {
    const wall = createWall(random);
    const dealerSeat: Seat = 0;
    const players: PlayerState[] = [0, 1, 2, 3].map((seat) => ({
      seat: seat as Seat,
      kind: seat === 0 ? 'HUMAN' : 'BOT',
      userId: seat === 0 ? userId : undefined,
      hand: [],
      melds: [],
      discards: [],
      isDealer: seat === dealerSeat,
      isListening: false,
      waitingTiles: [],
      hasWon: false,
    }));
    const state: MahjongGameState = {
      gameId,
      phase: 'DEALING',
      rules: { ...DEFAULT_RULES, ...rules },
      players,
      wall,
      wallIndex: 0,
      dice: [this.rollDie(random), this.rollDie(random)],
      openingIndex: 0,
      dealerSeat,
      currentSeat: dealerSeat,
      turn: 0,
      eventSeq: 1,
      stateVersion: 1,
    };
    state.openingIndex = ((dealerSeat + state.dice[0] + state.dice[1]) % 4) as Seat;

    // 开局先按麻将的 4、4、4、1、1 轮次发牌，再给庄家补第 14 张。
    for (let round = 0; round < 3; round += 1) {
      for (const player of players) this.drawToHand(state, player.seat, 4);
    }
    for (const player of players) this.drawToHand(state, player.seat, 1);
    this.drawToHand(state, dealerSeat, 1);
    for (const player of players) player.hand = sortTiles(player.hand);
    state.phase = 'WAITING_DISCARD';
    this.refreshListening(state);
    return state;
  }

  applyAction(state: MahjongGameState, request: ActionRequest): EngineResult {
    const player = state.players[request.seat];
    if (!player) return this.failure(state, 'INVALID_SEAT', '座位不存在');
    if (state.phase === 'ENDED')
      return this.failure(state, 'GAME_ALREADY_ENDED', '牌局已经结束');

    switch (request.type) {
      case 'DISCARD':
        return this.discard(state, player.seat, request.tile, request.requestId);
      case 'HU':
        return this.hu(state, player.seat, request.requestId);
      case 'CHI':
        return this.chi(state, player.seat, request.tiles ?? [], request.requestId);
      case 'PENG':
        return this.peng(state, player.seat, request.requestId);
      case 'MING_GANG':
        return this.mingGang(state, player.seat, request.requestId);
      case 'AN_GANG':
        return this.anGang(state, player.seat, request.requestId);
      case 'BU_GANG':
        return this.buGang(state, player.seat, request.requestId);
      case 'PASS':
        return this.pass(state, player.seat, request.requestId);
      default:
        return this.failure(state, 'UNSUPPORTED_ACTION', '不支持的操作');
    }
  }

  getEligibleActions(state: MahjongGameState, seat: Seat): ActionType[] {
    const player = state.players[seat];
    if (!player || state.phase !== 'WAITING_RESPONSE' || !state.operationWindow)
      return [];
    const { sourceSeat, tile } = state.operationWindow;
    const actions: ActionType[] = ['PASS'];
    if (canHu([...player.hand, tile], player.melds, state.rules).isHu) actions.push('HU');
    if (canUseSameTiles(player.hand, tile, 3)) actions.push('MING_GANG');
    if (canUseSameTiles(player.hand, tile, 2)) actions.push('PENG');
    if (this.isNextSeat(sourceSeat, seat) && this.canAnyChi(player.hand, tile)) {
      actions.push('CHI');
    }
    return actions;
  }

  resolveResponses(
    state: MahjongGameState,
    responses: ActionRequest[],
  ): EngineResult | undefined {
    if (!state.operationWindow) return undefined;
    for (const response of responses) {
      if (state.operationWindow.eligible[response.seat]) {
        state.operationWindow.responses[response.seat] = response;
      }
    }
    const expected = Object.keys(state.operationWindow.eligible).length;
    if (Object.keys(state.operationWindow.responses).length < expected) {
      return this.success(state, 'waiting_response');
    }
    const valid = Object.values(state.operationWindow.responses).filter(Boolean).filter((request) =>
      this.getEligibleActions(state, request.seat).includes(request.type),
    ) as ActionRequest[];
    const selected = valid.sort((left, right) => {
      const priority =
        ACTION_PRIORITY.indexOf(left.type) - ACTION_PRIORITY.indexOf(right.type);
      if (priority !== 0) return priority;
      return this.distanceFromSource(state.operationWindow!.sourceSeat, left.seat) -
        this.distanceFromSource(state.operationWindow!.sourceSeat, right.seat);
    })[0];
    if (!selected || selected.type === 'PASS') {
      state.operationWindow = undefined;
      return this.nextTurn(state);
    }
    return this.applyAction(state, selected);
  }

  private discard(
    state: MahjongGameState,
    seat: Seat,
    tile: Tile | undefined,
    requestId: string,
  ): EngineResult {
    if (state.phase !== 'WAITING_DISCARD' || state.currentSeat !== seat)
      return this.failure(state, 'NOT_YOUR_TURN', '当前不是你的出牌回合');
    if (tile === undefined || !isValidTile(tile))
      return this.failure(state, 'INVALID_TILE', '牌值无效');
    const player = state.players[seat];
    if (!removeTiles(player.hand, [tile]))
      return this.failure(state, 'TILE_NOT_IN_HAND', '手牌中没有这张牌');
    player.discards.push({ tile, turn: state.turn });
    state.lastDiscard = { seat, tile, turn: state.turn };
    state.phase = 'WAITING_RESPONSE';
    state.operationWindow = this.createOperationWindow(state, seat, tile);
    this.bump(state);
    if (this.noResponseAvailable(state)) return this.nextTurn(state);
    return this.success(state, 'chu_pai', requestId, this.nextResponseSeat(state));
  }

  private hu(state: MahjongGameState, seat: Seat, requestId: string): EngineResult {
    const player = state.players[seat];
    const isSelfDraw = state.phase === 'WAITING_DISCARD' && state.currentSeat === seat;
    const winningTile = state.operationWindow?.tile;
    const winningHand = isSelfDraw
      ? player.hand
      : winningTile === undefined ? player.hand : [...player.hand, winningTile];
    const valid = canHu(winningHand, player.melds, state.rules).isHu;
    if (!valid || (!isSelfDraw && !this.isEligible(state, seat, 'HU')))
      return this.failure(state, 'INVALID_HU', '当前不能胡牌');
    player.hasWon = true;
    state.winnerSeat = seat;
    state.winType = isSelfDraw ? 'ZIMO' : 'DIANPAO';
    state.phase = 'ENDED';
    state.operationWindow = undefined;
    this.bump(state);
    return this.success(state, 'hu', requestId);
  }

  private chi(state: MahjongGameState, seat: Seat, tiles: Tile[], requestId: string): EngineResult {
    const window = state.operationWindow;
    const selectedTiles = tiles.length ? tiles : this.findChiTiles(state.players[seat].hand, window?.tile);
    if (!window || !this.isEligible(state, seat, 'CHI') || !selectedTiles || !canChi(state.players[seat].hand, window.tile, selectedTiles))
      return this.failure(state, 'INVALID_CHI', '吃牌组合不合法');
    const player = state.players[seat];
    removeTiles(player.hand, selectedTiles);
    player.melds.push({ type: 'CHI', tiles: sortTiles([...selectedTiles, window.tile]), fromSeat: window.sourceSeat });
    this.claimDiscard(state, window.sourceSeat, window.tile, seat);
    state.operationWindow = undefined;
    state.currentSeat = seat;
    state.phase = 'WAITING_DISCARD';
    this.bump(state);
    return this.success(state, 'chi', requestId, seat);
  }

  private peng(state: MahjongGameState, seat: Seat, requestId: string): EngineResult {
    const window = state.operationWindow;
    if (!window || !this.isEligible(state, seat, 'PENG'))
      return this.failure(state, 'INVALID_PENG', '碰牌条件不满足');
    const player = state.players[seat];
    removeTiles(player.hand, [window.tile, window.tile]);
    player.melds.push({ type: 'PENG', tiles: [window.tile, window.tile, window.tile], fromSeat: window.sourceSeat });
    this.claimDiscard(state, window.sourceSeat, window.tile, seat);
    state.operationWindow = undefined;
    state.currentSeat = seat;
    state.phase = 'WAITING_DISCARD';
    this.bump(state);
    return this.success(state, 'peng', requestId, seat);
  }

  private mingGang(state: MahjongGameState, seat: Seat, requestId: string): EngineResult {
    const window = state.operationWindow;
    if (!window || !this.isEligible(state, seat, 'MING_GANG'))
      return this.failure(state, 'INVALID_GANG', '明杠条件不满足');
    const player = state.players[seat];
    removeTiles(player.hand, [window.tile, window.tile, window.tile]);
    player.melds.push({ type: 'MING_GANG', tiles: [window.tile, window.tile, window.tile, window.tile], fromSeat: window.sourceSeat });
    this.claimDiscard(state, window.sourceSeat, window.tile, seat);
    state.operationWindow = undefined;
    this.bump(state);
    return this.drawAfterGang(state, seat, requestId);
  }

  private anGang(state: MahjongGameState, seat: Seat, requestId: string): EngineResult {
    if (state.phase !== 'WAITING_DISCARD' || state.currentSeat !== seat)
      return this.failure(state, 'NOT_YOUR_TURN', '当前不是你的摸牌后操作阶段');
    const player = state.players[seat];
    const groups = [...countTiles(player.hand).entries()].find(([, count]) => count === 4);
    if (!groups) return this.failure(state, 'INVALID_GANG', '没有可暗杠的牌');
    const [tile] = groups;
    removeTiles(player.hand, [tile, tile, tile, tile]);
    player.melds.push({ type: 'AN_GANG', tiles: [tile, tile, tile, tile] });
    this.bump(state);
    return this.drawAfterGang(state, seat, requestId);
  }

  private buGang(state: MahjongGameState, seat: Seat, requestId: string): EngineResult {
    if (state.phase !== 'WAITING_DISCARD' || state.currentSeat !== seat)
      return this.failure(state, 'NOT_YOUR_TURN', '当前不是你的摸牌后操作阶段');
    const player = state.players[seat];
    const peng = player.melds.find((meld) => meld.type === 'PENG' && player.hand.includes(meld.tiles[0]));
    if (!peng) return this.failure(state, 'INVALID_GANG', '没有可补杠的碰牌');
    const tile = peng.tiles[0];
    removeTiles(player.hand, [tile]);
    peng.type = 'BU_GANG';
    peng.tiles.push(tile);
    this.bump(state);
    return this.drawAfterGang(state, seat, requestId);
  }

  private pass(state: MahjongGameState, seat: Seat, requestId: string): EngineResult {
    if (!state.operationWindow || !this.isEligible(state, seat, 'PASS'))
      return this.failure(state, 'ACTION_NOT_ALLOWED', '当前不能过');
    state.operationWindow.responses[seat] = { type: 'PASS', seat, requestId };
    const responses = Object.values(state.operationWindow.responses).filter(Boolean) as ActionRequest[];
    const expected = Object.keys(state.operationWindow.eligible).length;
    if (responses.length < expected) return this.success(state, 'pass', requestId);
    return this.resolveResponses(state, responses) ?? this.success(state, 'pass', requestId);
  }

  private drawAfterGang(state: MahjongGameState, seat: Seat, requestId: string): EngineResult {
    if (state.wallIndex >= state.wall.length) return this.endDraw(state, requestId);
    this.drawToHand(state, seat, 1);
    state.currentSeat = seat;
    state.phase = 'WAITING_DISCARD';
    state.operationWindow = undefined;
    this.refreshListening(state);
    this.bump(state);
    return this.success(state, 'gang', requestId, seat);
  }

  private nextTurn(state: MahjongGameState): EngineResult {
    state.operationWindow = undefined;
    const nextSeat = ((state.lastDiscard?.seat ?? state.currentSeat) + 1) % 4 as Seat;
    if (state.wallIndex >= state.wall.length) return this.endDraw(state);
    this.drawToHand(state, nextSeat, 1);
    state.currentSeat = nextSeat;
    state.phase = 'WAITING_DISCARD';
    this.refreshListening(state);
    this.bump(state);
    return this.success(state, 'next_turn', undefined, nextSeat);
  }

  private endDraw(state: MahjongGameState, requestId?: string): EngineResult {
    state.phase = 'ENDED';
    state.operationWindow = undefined;
    this.bump(state);
    return this.success(state, 'liuju', requestId);
  }

  private createOperationWindow(state: MahjongGameState, sourceSeat: Seat, tile: Tile): OperationWindow {
    const eligible: Partial<Record<Seat, ActionType[]>> = {};
    for (const player of state.players) {
      if (player.seat === sourceSeat) continue;
      const actions = this.getEligibleActionsForDiscard(state, player.seat, sourceSeat, tile);
      if (actions.length > 1) eligible[player.seat] = actions;
    }
    return { sourceSeat, tile, eligible, responses: {}, deadlineAt: Date.now() + 10000 };
  }

  private getEligibleActionsForDiscard(state: MahjongGameState, seat: Seat, sourceSeat: Seat, tile: Tile): ActionType[] {
    const player = state.players[seat];
    const actions: ActionType[] = ['PASS'];
    if (canHu([...player.hand, tile], player.melds, state.rules).isHu) actions.push('HU');
    if (canUseSameTiles(player.hand, tile, 2)) actions.push('PENG');
    if (canUseSameTiles(player.hand, tile, 3)) actions.push('MING_GANG');
    if (this.isNextSeat(sourceSeat, seat) && this.canAnyChi(player.hand, tile)) actions.push('CHI');
    return actions.length > 1 ? actions : [];
  }

  private canAnyChi(hand: Tile[], tile: Tile): boolean {
    for (const candidate of this.chiCandidates(tile)) {
      if (canChi(hand, tile, candidate)) return true;
    }
    return false;
  }

  private findChiTiles(hand: Tile[], tile: Tile | undefined): Tile[] | undefined {
    if (tile === undefined) return undefined;
    for (const candidate of this.chiCandidates(tile)) {
      if (canChi(hand, tile, candidate)) return candidate;
    }
    return undefined;
  }

  private chiCandidates(tile: Tile): Tile[][] {
    return [
      [tile - 2, tile - 1],
      [tile - 1, tile + 1],
      [tile + 1, tile + 2],
    ];
  }

  private isEligible(state: MahjongGameState, seat: Seat, action: ActionType): boolean {
    return state.operationWindow?.eligible[seat]?.includes(action) ?? false;
  }

  private noResponseAvailable(state: MahjongGameState): boolean {
    return Object.keys(state.operationWindow?.eligible ?? {}).length === 0;
  }

  private nextResponseSeat(state: MahjongGameState): Seat | undefined {
    const seats = Object.keys(state.operationWindow?.eligible ?? {}).map(Number);
    return seats.length > 0 ? (seats[0] as Seat) : undefined;
  }

  private claimDiscard(state: MahjongGameState, sourceSeat: Seat, tile: Tile, claimedBy: Seat): void {
    const discard = state.players[sourceSeat].discards.find((item) => item.tile === tile && item.turn === state.turn);
    if (discard) discard.claimedBy = claimedBy;
  }

  private drawToHand(state: MahjongGameState, seat: Seat, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const tile = state.wall[state.wallIndex];
      if (tile === undefined) return;
      state.players[seat].hand.push(tile);
      state.wallIndex += 1;
    }
  }

  private refreshListening(state: MahjongGameState): void {
    for (const player of state.players) {
      player.hand = sortTiles(player.hand);
      player.waitingTiles = getWaitingTiles(player.hand, player.melds, state.rules);
      player.isListening = player.waitingTiles.length > 0;
    }
  }

  private isNextSeat(source: Seat, target: Seat): boolean {
    return ((source + 1) % 4) === target;
  }

  private distanceFromSource(source: Seat, target: Seat): number {
    return (target - source + 4) % 4;
  }

  private rollDie(random: () => number): number {
    return Math.floor(random() * 6) + 1;
  }

  private bump(state: MahjongGameState): void {
    state.eventSeq += 1;
    state.stateVersion = state.eventSeq;
  }

  private success(state: MahjongGameState, event: string, _requestId?: string, nextOperateSeat?: Seat): EngineResult {
    return { success: true, event, state, nextOperateSeat };
  }

  private failure(state: MahjongGameState, code: string, message: string): EngineResult {
    return { success: false, code, message, event: 'error', state };
  }
}
