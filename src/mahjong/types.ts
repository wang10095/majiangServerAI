export type Seat = 0 | 1 | 2 | 3;
export type PlayerKind = 'HUMAN' | 'BOT';
export type GamePhase =
  | 'DEALING'
  | 'WAITING_DISCARD'
  | 'WAITING_RESPONSE'
  | 'ENDED';
export type ActionType =
  | 'DISCARD'
  | 'CHI'
  | 'PENG'
  | 'MING_GANG'
  | 'AN_GANG'
  | 'BU_GANG'
  | 'HU'
  | 'PASS';
export type Tile = number;

export interface RuleOptions {
  enableQidui: boolean;
  gangScore: boolean;
  huOnly: boolean;
  bankerContinueOnDraw: boolean;
}

export interface Meld {
  type: 'CHI' | 'PENG' | 'MING_GANG' | 'AN_GANG' | 'BU_GANG';
  tiles: Tile[];
  fromSeat?: Seat;
}

export interface Discard {
  tile: Tile;
  turn: number;
  claimedBy?: Seat;
}

export interface PlayerState {
  seat: Seat;
  kind: PlayerKind;
  userId?: string;
  hand: Tile[];
  melds: Meld[];
  discards: Discard[];
  isDealer: boolean;
  isListening: boolean;
  waitingTiles: Tile[];
  hasWon: boolean;
}

export interface OperationWindow {
  sourceSeat: Seat;
  tile: Tile;
  eligible: Partial<Record<Seat, ActionType[]>>;
  responses: Partial<Record<Seat, ActionRequest>>;
  deadlineAt: number;
}

export interface ActionRequest {
  type: ActionType;
  seat: Seat;
  tile?: Tile;
  tiles?: Tile[];
  requestId: string;
}

export interface MahjongGameState {
  gameId: string;
  phase: GamePhase;
  rules: RuleOptions;
  players: PlayerState[];
  wall: Tile[];
  wallIndex: number;
  dice: [number, number];
  openingIndex: number;
  dealerSeat: Seat;
  currentSeat: Seat;
  turn: number;
  eventSeq: number;
  stateVersion: number;
  lastDiscard?: { seat: Seat; tile: Tile; turn: number };
  operationWindow?: OperationWindow;
  winnerSeat?: Seat;
  winType?: 'ZIMO' | 'DIANPAO';
}

export interface EngineResult {
  success: boolean;
  code?: string;
  message?: string;
  event: string;
  state: MahjongGameState;
  nextOperateSeat?: Seat;
}
