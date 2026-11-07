import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { MahjongEngine } from './mahjong-engine';
import { ActionType, MahjongGameState, RuleOptions, Seat } from './types';

interface GameRecord {
  state: MahjongGameState;
  ownerId: string;
  processedRequests: Map<string, Record<string, unknown>>;
  clientSeqByUser: Map<string, number>;
  queue: Promise<void>;
  botTimer?: NodeJS.Timeout;
  botTimerToken?: string;
  actionSeq: number;
  lastAction?: {
    actionSeq: number;
    type: string;
    actorSeat: number;
    tile?: number;
    tiles: number[];
    event: string;
  };
}

type MahjongStateListener = (snapshot: Record<string, unknown>) => void;

@Injectable()
export class MahjongService {
  private readonly games = new Map<string, GameRecord>();
  private readonly stateListeners = new Map<string, Set<MahjongStateListener>>();
  private readonly engine = new MahjongEngine();

  constructor(private readonly prisma: PrismaService) {}

  async createSinglePlayerGame(userId: string, rules?: Partial<RuleOptions>): Promise<MahjongGameState> {
    const gameId = randomUUID();
    const state = this.engine.start(gameId, userId, rules);
    console.log('[Mahjong] single game started', {
      gameId,
      dealerSeat: state.dealerSeat,
      currentSeat: state.currentSeat,
      hands: state.players.map((player) => ({ seat: player.seat, hand: player.hand })),
      wallRemaining: state.wall.length - state.wallIndex,
    });
    const record: GameRecord = {
      state,
      ownerId: userId,
      processedRequests: new Map(),
      clientSeqByUser: new Map(),
      queue: Promise.resolve(),
      actionSeq: 0,
    };
    this.games.set(gameId, record);
    // 开局快照和 START 事件一起落库，保证一局牌从发牌开始就可追溯。
    await this.persistTransition(record, 'START_SINGLE_GAME', 0, userId, {
      event: 'start',
      success: true,
    });
    // 开局后立即检查是否需要机器人行动；当前庄家固定为真人 seat0，因此首步等待玩家出牌。
    this.scheduleBotIfNeeded(record);
    return state;
  }

  getGame(gameId: string, userId: string): MahjongGameState {
    const record = this.requireGame(gameId, userId);
    return record.state;
  }

  async restoreGame(gameId: string, userId: string): Promise<MahjongGameState> {
    const existing = this.games.get(gameId);
    if (existing) {
      if (existing.ownerId !== userId) throw new NotFoundException('Game not found');
      return existing.state;
    }
    const stored = await this.prisma.mahjongGame.findUnique({ where: { id: gameId } });
    if (!stored || stored.ownerId !== userId) throw new NotFoundException('Game not found');
    const state = stored.state as unknown as MahjongGameState;
    const record: GameRecord = {
      state,
      ownerId: stored.ownerId,
      processedRequests: new Map(),
      clientSeqByUser: new Map(),
      queue: Promise.resolve(),
      actionSeq: stored.actionSeq,
    };
    this.games.set(gameId, record);
    this.scheduleBotIfNeeded(record);
    return state;
  }

  async applyCommand(
    userId: string,
    gameId: string,
    requestId: string,
    action: string,
    tile?: number,
    tiles: number[] = [],
    clientSeq = 0,
  ): Promise<{ state: MahjongGameState; result: Record<string, unknown> }> {
    await this.restoreGame(gameId, userId);
    const record = this.requireGame(gameId, userId);
    return this.enqueue(record, async () => {
      const oldResult = record.processedRequests.get(requestId);
      if (oldResult) return { state: record.state, result: oldResult };
      const previousClientSeq = record.clientSeqByUser.get(userId) ?? -1;
      if (clientSeq <= previousClientSeq) {
        return {
          state: record.state,
          result: {
            gameId,
            event: 'error',
            success: false,
            code: 'STALE_CLIENT_SEQUENCE',
            message: '客户端动作序号过期',
            eventSeq: record.state.eventSeq,
            stateVersion: record.state.stateVersion,
          },
        };
      }
      record.clientSeqByUser.set(userId, clientSeq);
      const player = record.state.players.find((item) => item.userId === userId);
      if (!player) throw new NotFoundException('Player is not in this game');
      console.log('[Mahjong] player command', {
        gameId,
        userId,
        action,
        tile,
        tiles,
        clientSeq,
        currentSeat: record.state.currentSeat,
        phase: record.state.phase,
      });
      const actionTile = tile ?? record.state.operationWindow?.tile;
      const result = this.engine.applyAction(record.state, {
        type: this.commandToRequest(action),
        seat: player.seat,
        tile,
        tiles,
        requestId,
      });
      const response = {
        gameId,
        event: result.event,
        success: result.success,
        code: result.code,
        message: result.message,
        eventSeq: result.state.eventSeq,
        stateVersion: result.state.stateVersion,
        nextOperateSeat: result.nextOperateSeat,
      };
      record.processedRequests.set(requestId, response);
      await this.persistTransition(record, action, player.seat, userId, {
        ...response,
        tile: actionTile,
        tiles,
      });
      this.scheduleBotIfNeeded(record);
      return { state: record.state, result: response };
    });
  }

  projectState(gameId: string, userId: string): Record<string, unknown> {
    const record = this.requireGame(gameId, userId);
    const state = record.state;
    const viewer = state.players.find((player) => player.userId === userId);
    return {
      gameId: state.gameId,
      eventSeq: state.eventSeq,
      stateVersion: state.stateVersion,
      phase: state.phase,
      currentSeat: state.currentSeat,
      dealerSeat: state.dealerSeat,
      openingIndex: state.openingIndex,
      wallRemaining: state.wall.length - state.wallIndex,
      actionSeq: record.actionSeq,
      lastAction: record.lastAction,
      operationWindow: state.operationWindow
        ? {
            sourceSeat: state.operationWindow.sourceSeat,
            tile: state.operationWindow.tile,
            eligible: state.operationWindow.eligible[viewer?.seat ?? 0] ?? [],
          }
        : undefined,
      players: state.players.map((player) => ({
        seat: player.seat,
        bot: player.kind === 'BOT',
        hand: player.seat === viewer?.seat ? player.hand : [],
        handCount: player.hand.length,
        discards: player.discards.map((discard) => discard.tile),
        melds: player.melds,
        listening: player.seat === viewer?.seat && player.isListening,
        waitingTiles: player.seat === viewer?.seat ? player.waitingTiles : [],
      })),
    };
  }

  subscribeState(gameId: string, userId: string, listener: MahjongStateListener): () => void {
    this.requireGame(gameId, userId);
    const key = `${gameId}:${userId}`;
    const listeners = this.stateListeners.get(key) ?? new Set<MahjongStateListener>();
    listeners.add(listener);
    this.stateListeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.stateListeners.delete(key);
    };
  }

  async enqueue<T>(record: GameRecord, task: () => Promise<T>): Promise<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const result = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const run = record.queue.then(task).then(resolve, reject);
    // 保留一个永不拒绝的尾部，避免一次非法请求阻断整局后续动作。
    record.queue = run.then(() => undefined, () => undefined);
    return result;
  }

  private commandToRequest(action: string): ActionType {
    const actionMap: Record<string, ActionType> = {
      DISCARD: 'DISCARD',
      CHI: 'CHI',
      PENG: 'PENG',
      MING_GANG: 'MING_GANG',
      AN_GANG: 'AN_GANG',
      BU_GANG: 'BU_GANG',
      HU: 'HU',
      PASS: 'PASS',
    };
    const mapped = actionMap[action];
    if (!mapped) throw new Error('UNSUPPORTED_ACTION');
    return mapped;
  }

  private scheduleBotIfNeeded(record: GameRecord): void {
    const state = record.state;
    if (state.phase === 'ENDED') {
      this.clearBotTimer(record);
      return;
    }
    if (record.botTimer) return;
    const token = randomUUID();
    record.botTimerToken = token;
    // 机器人延迟任务只负责把动作放回同一局的串行队列，不能绕过状态机直接改牌。
    record.botTimer = setTimeout(() => {
      record.botTimer = undefined;
      void this.enqueue(record, async () => {
        if (record.botTimerToken !== token || record.state.phase === 'ENDED') return;
        if (record.state.phase === 'WAITING_RESPONSE') {
          const responses = Object.keys(record.state.operationWindow?.eligible ?? {})
            .filter((value) => Number(value) !== 0)
            .map((value) => {
              const seat = Number(value) as Seat;
              const eligible = this.engine.getEligibleActions(record.state, seat);
              const type = (['HU', 'MING_GANG', 'PENG', 'CHI', 'PASS'] as const)
                .find((action) => eligible.includes(action)) ?? 'PASS';
              return {
                type,
                seat,
                requestId: `bot-${type.toLowerCase()}-${token}-${value}`,
              };
            });
          const result = this.engine.resolveResponses(record.state, responses);
          if (result) {
            await this.persistTransition(record, responses[0]?.type ?? 'PASS', responses[0]?.seat ?? 0, undefined, {
              event: result.event,
              success: result.success,
              eventSeq: record.state.eventSeq,
              tile: record.state.lastDiscard?.tile,
            });
          }
        } else if (record.state.currentSeat !== 0) {
          const seat = record.state.currentSeat;
          const player = record.state.players[seat];
          const tile = player.hand[player.hand.length - 1];
          console.log('[Mahjong] bot discard', {
            gameId: record.state.gameId,
            seat,
            tile,
            phase: record.state.phase,
          });
          // 机器人动作也必须通过同一个引擎，不能直接修改手牌或回合字段。
          const result = this.engine.applyAction(record.state, {
            type: 'DISCARD',
            seat,
            tile,
            requestId: `bot-${token}`,
          });
          await this.persistTransition(record, 'DISCARD', seat, undefined, {
            event: result.event,
            success: result.success,
            eventSeq: record.state.eventSeq,
            tile,
          });
        }
        this.scheduleBotIfNeeded(record);
      });
    }, 3000);
  }

  private clearBotTimer(record: GameRecord): void {
    if (record.botTimer) clearTimeout(record.botTimer);
    record.botTimer = undefined;
    record.botTimerToken = undefined;
  }

  private requireGame(gameId: string, userId: string): GameRecord {
    const record = this.games.get(gameId);
    if (!record || record.ownerId !== userId) throw new NotFoundException('Game not found');
    return record;
  }

  private async persistTransition(
    record: GameRecord,
    action: string,
    actorSeat: number,
    actorUserId: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<void> {
    record.actionSeq += 1;
    record.lastAction = {
      actionSeq: record.actionSeq,
      type: action,
      actorSeat,
      tile: typeof payload.tile === 'number' ? payload.tile : undefined,
      tiles: Array.isArray(payload.tiles) ? payload.tiles.map(Number) : [],
      event: String(payload.event ?? 'unknown'),
    };
    const eventSeq = record.state.eventSeq;
    await this.prisma.$transaction(async (tx) => {
      await tx.mahjongGame.upsert({
        where: { id: record.state.gameId },
        create: {
          id: record.state.gameId,
          ownerId: record.ownerId,
          status: record.state.phase === 'ENDED' ? 'ENDED' : 'PLAYING',
          state: record.state as unknown as Prisma.InputJsonValue,
          eventSeq,
          actionSeq: record.actionSeq,
          endedAt: record.state.phase === 'ENDED' ? new Date() : undefined,
        },
        update: {
          status: record.state.phase === 'ENDED' ? 'ENDED' : 'PLAYING',
          state: record.state as unknown as Prisma.InputJsonValue,
          eventSeq,
          actionSeq: record.actionSeq,
          endedAt: record.state.phase === 'ENDED' ? new Date() : undefined,
        },
      });
      await tx.mahjongEvent.create({
        data: {
          gameId: record.state.gameId,
          actorUserId,
          actionSeq: record.actionSeq,
          eventSeq,
          actorSeat,
          action,
          event: String(payload.event ?? 'unknown'),
          tile: typeof payload.tile === 'number' ? payload.tile : undefined,
          tiles: (Array.isArray(payload.tiles) ? payload.tiles : []) as Prisma.InputJsonValue,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    });
    this.publishState(record);
  }

  private publishState(record: GameRecord): void {
    const listeners = this.stateListeners.get(`${record.state.gameId}:${record.ownerId}`);
    if (!listeners) return;
    const snapshot = this.projectState(record.state.gameId, record.ownerId);
    listeners.forEach((listener) => listener(snapshot));
  }
}
