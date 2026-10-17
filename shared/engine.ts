/** Fields every game's state shares so the room and scoreboard can stay game-agnostic. */
export interface BaseState {
  /** Game-specific phases, plus the shared 'roundEnd' and 'gameOver'. */
  phase: string;
  round: number;
  totalRounds: number;
  /** One row per completed round, one column per player. */
  scores: number[][];
}

/**
 * A card game the room server can host. All methods are pure state transitions
 * except `auto`, whose `run` mutates state after a delay (e.g. collecting a trick).
 * Illegal actions throw RuleError.
 */
export interface Engine<S extends BaseState, A, V> {
  create(players: number, totalRounds: number, rand?: () => number): S;
  act(state: S, seat: number, action: A): void;
  /** A timed step that needs nobody's input (collecting a trick, revealing a hand), or null. */
  auto(state: S): { delayMs: number; run: () => void } | null;
  /** Seats whose action the game is waiting for. */
  waitingOn(state: S): number[];
  bot(state: S, seat: number): A;
  nextRound(state: S): void;
  view(state: S, seat: number): V;
}

export function isOver(state: BaseState): boolean {
  return state.phase === 'roundEnd' || state.phase === 'gameOver';
}

/** Mark a round finished and move to roundEnd / gameOver. */
export function finishRound(state: BaseState, roundScores: number[]): void {
  state.scores.push(roundScores);
  state.phase = state.round >= state.totalRounds ? 'gameOver' : 'roundEnd';
}

export function seededRandom(seed: number): () => number {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}
