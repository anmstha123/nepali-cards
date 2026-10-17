import type { CallbreakAction, CallbreakView } from './callbreak.ts';
import type { DhumbalAction, DhumbalView } from './dhumbal.ts';
import type { GameType } from './games.ts';
import type { KittiAction, KittiView } from './kitti.ts';
import type { MarriageAction, MarriageView } from './marriage.ts';

export interface SeatInfo {
  name: string;
  bot: boolean;
  /** A human seat temporarily played by the computer (player dropped). */
  autoplay: boolean;
  connected: boolean;
}

export type GameView = CallbreakView | MarriageView | DhumbalView | KittiView;
export type GameAction = CallbreakAction | MarriageAction | DhumbalAction | KittiAction;

export interface RoomView {
  code: string;
  mySeat: number;
  hostSeat: number;
  /** Lobby: one entry per possible seat for the chosen game. In game: one per player. */
  seats: (SeatInfo | null)[];
  gameType: GameType;
  totalRounds: number;
  game: GameView | null;
}

export interface JoinRequest {
  code?: string;
  name: string;
  token: string;
}

export type Ack = (res: { ok: true; code?: string } | { ok: false; error: string }) => void;

export interface ClientToServer {
  join: (req: JoinRequest, ack: Ack) => void;
  leave: () => void;
  addBot: () => void;
  removeSeat: (seat: number) => void;
  setGame: (type: GameType) => void;
  setRounds: (rounds: number) => void;
  start: (ack: Ack) => void;
  act: (action: GameAction, ack: Ack) => void;
  nextRound: () => void;
  takeOver: (seat: number) => void;
  newGame: () => void;
}

export interface ServerToClient {
  state: (view: RoomView) => void;
}
