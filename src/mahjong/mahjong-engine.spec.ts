import { canChi, canHu, isSevenPairs } from './hand-validator';
import { MahjongEngine } from './mahjong-engine';
import { createWall } from './tile';
import { RuleOptions } from './types';

const rules: RuleOptions = {
  enableQidui: false,
  gangScore: false,
  huOnly: true,
  bankerContinueOnDraw: true,
};

describe('MahjongEngine', () => {
  it('creates a 108-tile wall and deals 14/13/13/13', () => {
    const engine = new MahjongEngine();
    const state = engine.start('game-1', 'user-1', rules, () => 0.5);
    expect(createWall(() => 0.5)).toHaveLength(108);
    expect(state.players.filter((player) => player.hand.length === 14)).toHaveLength(1);
    expect(state.players.filter((player) => player.hand.length === 13)).toHaveLength(3);
    expect(state.players[state.dealerSeat].hand).toHaveLength(14);
    expect(state.wallIndex).toBe(53);
    expect(state.phase).toBe('WAITING_DISCARD');
  });

  it('accepts a standard hand and rejects seven pairs', () => {
    expect(canHu([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 18], [], rules).isHu).toBe(true);
    expect(canHu([0, 0, 2, 2, 4, 4, 9, 9, 11, 11, 13, 13, 18, 18], [], rules).isHu).toBe(false);
    expect(isSevenPairs([0, 0, 2, 2, 4, 4, 9, 9, 11, 11, 13, 13, 18, 18], [])).toBe(true);
  });

  it('only allows chi for numbered consecutive tiles', () => {
    expect(canChi([1, 2], 0, [1, 2])).toBe(true);
    expect(canChi([27, 28], 29, [27, 28])).toBe(false);
    expect(canChi([1, 4], 2, [1, 4])).toBe(false);
  });

  it('rejects a discard from the wrong seat', () => {
    const state = new MahjongEngine().start('game-2', 'user-2', rules, () => 0.5);
    const result = new MahjongEngine().applyAction(state, {
      type: 'DISCARD',
      seat: 1,
      tile: state.players[1].hand[0],
      requestId: 'req-1',
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_YOUR_TURN');
  });

  it('allows the next seat to chi the middle tile of a sequence', () => {
    const engine = new MahjongEngine();
    const state = engine.start('game-3', 'user-3', rules, () => 0.5);
    state.currentSeat = 3;
    state.players[0].hand = [1, 1, 4, 4, 5, 6, 7, 19, 21, 25, 26];
    state.players[1].hand = [];
    state.players[2].hand = [];
    state.players[3].hand = [20];

    const discard = engine.applyAction(state, {
      type: 'DISCARD',
      seat: 3,
      tile: 20,
      requestId: 'req-chi-discard',
    });

    expect(discard.success).toBe(true);
    expect(state.operationWindow?.eligible[0]).toEqual(['PASS', 'CHI']);

    const chi = engine.resolveResponses(state, [{
      type: 'CHI',
      seat: 0,
      requestId: 'req-chi',
    }]);

    expect(chi?.success).toBe(true);
    expect(state.currentSeat).toBe(0);
    expect(state.phase).toBe('WAITING_DISCARD');
    expect(state.players[0].melds).toContainEqual({ type: 'CHI', tiles: [19, 20, 21], fromSeat: 3 });
  });

  it.each([
    ['PENG', [20, 20], [20, 20, 20]],
    ['MING_GANG', [20, 20, 20], [20, 20, 20, 20]],
  ] as const)('allows a bot to %s a discarded tile', (type, hand, meldTiles) => {
    const engine = new MahjongEngine();
    const state = engine.start(`game-${type}`, 'user-4', rules, () => 0.5);
    state.currentSeat = 0;
    state.players[0].hand = [20];
    state.players[1].hand = [...hand];
    state.players[2].hand = [];
    state.players[3].hand = [];

    const discard = engine.applyAction(state, {
      type: 'DISCARD',
      seat: 0,
      tile: 20,
      requestId: `req-${type.toLowerCase()}-discard`,
    });

    expect(discard.success).toBe(true);
    expect(state.operationWindow?.eligible[1]).toContain('PASS');
    expect(state.operationWindow?.eligible[1]).toContain(type);

    const response = engine.resolveResponses(state, [{
      type,
      seat: 1,
      requestId: `req-${type.toLowerCase()}`,
    }]);

    expect(response?.success).toBe(true);
    expect(state.currentSeat).toBe(1);
    expect(state.players[1].melds).toContainEqual({ type, tiles: meldTiles, fromSeat: 0 });
  });
});
