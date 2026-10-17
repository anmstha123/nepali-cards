import { Card, cardId, fullDeck, shuffle, sortHand } from './cards.ts';
import type { Engine } from './engine.ts';

/**
 * Callbreak rules implemented here (common Nepali rules):
 * - 4 players, 13 cards each, spades are always trump.
 * - Each player bids 1–8 tricks, starting left of the dealer.
 * - You must follow the led suit, and must beat the highest card of that suit
 *   if you can (unless the trick has already been trumped).
 * - If you can't follow suit you must play a spade; if a spade is already
 *   winning you must over-trump if you can, otherwise play anything.
 * - Making your bid scores bid + 0.1 per extra trick; missing it scores −bid.
 * - A hand with no spades triggers an automatic redeal.
 */

export const NUM_PLAYERS = 4;
export const MIN_BID = 1;
export const MAX_BID = 8;

export type Phase = 'bidding' | 'playing' | 'roundEnd' | 'gameOver';

export interface Play {
  seat: number;
  card: Card;
}

export interface CallbreakState {
  phase: Phase;
  round: number;
  totalRounds: number;
  dealer: number;
  hands: Card[][];
  bids: (number | null)[];
  tricksWon: number[];
  /** Seat whose turn it is; -1 while a finished trick is waiting to be collected. */
  turn: number;
  trick: Play[];
  lastTrick: { plays: Play[]; winner: number } | null;
  /** Scores in tenths (e.g. 32 = 3.2), one row per completed round. */
  scores: number[][];
}

export class RuleError extends Error {}

export function newGame(totalRounds = 5, dealer = 0, rand: () => number = Math.random): CallbreakState {
  const state: CallbreakState = {
    phase: 'bidding',
    round: 1,
    totalRounds,
    dealer,
    hands: [],
    bids: [],
    tricksWon: [],
    turn: 0,
    trick: [],
    lastTrick: null,
    scores: [],
  };
  dealRound(state, rand);
  return state;
}

export function dealRound(state: CallbreakState, rand: () => number = Math.random): void {
  let hands: Card[][];
  do {
    const deck = shuffle(fullDeck(), rand);
    hands = Array.from({ length: NUM_PLAYERS }, (_, i) => sortHand(deck.slice(i * 13, i * 13 + 13)));
  } while (hands.some((h) => !h.some((c) => c.suit === 'S')));

  state.hands = hands;
  state.bids = Array(NUM_PLAYERS).fill(null);
  state.tricksWon = Array(NUM_PLAYERS).fill(0);
  state.trick = [];
  state.lastTrick = null;
  state.phase = 'bidding';
  state.turn = (state.dealer + 1) % NUM_PLAYERS;
}

export function placeBid(state: CallbreakState, seat: number, bid: number): void {
  if (state.phase !== 'bidding') throw new RuleError('Not bidding right now');
  if (state.turn !== seat) throw new RuleError('Not your turn');
  if (!Number.isInteger(bid) || bid < MIN_BID || bid > MAX_BID) {
    throw new RuleError(`Bid must be between ${MIN_BID} and ${MAX_BID}`);
  }
  state.bids[seat] = bid;
  if (state.bids.every((b) => b !== null)) {
    state.phase = 'playing';
    state.turn = (state.dealer + 1) % NUM_PLAYERS;
  } else {
    state.turn = (seat + 1) % NUM_PLAYERS;
  }
}

/** Index into `plays` of the card currently winning the trick. */
export function winningIndex(plays: Play[]): number {
  let best = 0;
  for (let i = 1; i < plays.length; i++) {
    const a = plays[best].card;
    const b = plays[i].card;
    if (b.suit === a.suit ? b.rank > a.rank : b.suit === 'S') best = i;
  }
  return best;
}

export function legalCards(hand: Card[], trick: Play[]): Card[] {
  if (trick.length === 0) return hand;
  const led = trick[0].card.suit;
  const winning = trick[winningIndex(trick)].card;

  const sameSuit = hand.filter((c) => c.suit === led);
  if (sameSuit.length > 0) {
    if (winning.suit !== led) return sameSuit; // already trumped: any card of the led suit
    const higher = sameSuit.filter((c) => c.rank > winning.rank);
    return higher.length > 0 ? higher : sameSuit;
  }

  const spades = hand.filter((c) => c.suit === 'S');
  if (spades.length > 0) {
    if (winning.suit !== 'S') return spades;
    const higher = spades.filter((c) => c.rank > winning.rank);
    return higher.length > 0 ? higher : hand;
  }

  return hand;
}

export function playCard(state: CallbreakState, seat: number, id: string): void {
  if (state.phase !== 'playing') throw new RuleError('Not playing right now');
  if (state.turn !== seat) throw new RuleError('Not your turn');
  const hand = state.hands[seat];
  const card = hand.find((c) => cardId(c) === id);
  if (!card) throw new RuleError("You don't have that card");
  if (!legalCards(hand, state.trick).includes(card)) throw new RuleError("You can't play that card now");

  state.hands[seat] = hand.filter((c) => c !== card);
  state.trick.push({ seat, card });
  state.turn = state.trick.length === NUM_PLAYERS ? -1 : (seat + 1) % NUM_PLAYERS;
}

export function trickIsComplete(state: CallbreakState): boolean {
  return state.phase === 'playing' && state.trick.length === NUM_PLAYERS;
}

/** Collect a completed trick. Ends the round (and possibly the game) after the 13th trick. */
export function collectTrick(state: CallbreakState): void {
  if (!trickIsComplete(state)) throw new RuleError('Trick is not complete');
  const winner = state.trick[winningIndex(state.trick)].seat;
  state.tricksWon[winner]++;
  state.lastTrick = { plays: state.trick, winner };
  state.trick = [];
  state.turn = winner;

  if (state.hands.every((h) => h.length === 0)) {
    state.scores.push(state.bids.map((b, i) => roundScore(b!, state.tricksWon[i])));
    state.phase = state.round >= state.totalRounds ? 'gameOver' : 'roundEnd';
    state.turn = -1;
  }
}

export function nextRound(state: CallbreakState, rand: () => number = Math.random): void {
  if (state.phase !== 'roundEnd') throw new RuleError('Round is not over');
  state.round++;
  state.dealer = (state.dealer + 1) % NUM_PLAYERS;
  dealRound(state, rand);
}

/** Score in tenths. */
export function roundScore(bid: number, tricks: number): number {
  return tricks >= bid ? bid * 10 + (tricks - bid) : -bid * 10;
}

export function totals(scores: number[][]): number[] {
  return Array.from({ length: NUM_PLAYERS }, (_, i) => scores.reduce((sum, row) => sum + row[i], 0));
}

export function formatScore(tenths: number): string {
  return (tenths / 10).toFixed(1);
}

// ---------- Simple bot ----------

export function botBid(hand: Card[]): number {
  let est = 0;
  const spades = hand.filter((c) => c.suit === 'S');
  for (const c of spades) if (c.rank >= 12) est += c.rank === 14 ? 1 : 0.75;
  est += Math.max(0, spades.length - 3) * 0.6;
  for (const c of hand) {
    if (c.suit === 'S') continue;
    const suitLen = hand.filter((x) => x.suit === c.suit).length;
    if (c.rank === 14) est += suitLen <= 5 ? 0.9 : 0.6;
    else if (c.rank === 13) est += suitLen >= 2 && suitLen <= 4 ? 0.6 : 0.2;
  }
  return Math.min(MAX_BID, Math.max(MIN_BID, Math.round(est)));
}

export function botPlay(state: CallbreakState, seat: number): string {
  const legal = legalCards(state.hands[seat], state.trick);
  const byRank = legal.slice().sort((a, b) => (a.suit === 'S' ? 100 : 0) + a.rank - ((b.suit === 'S' ? 100 : 0) + b.rank));
  const needMore = state.tricksWon[seat] < (state.bids[seat] ?? 0);
  // When not chasing tricks, shed the highest card that still loses.

  if (state.trick.length === 0) {
    // Lead: cash a non-spade ace if we still need tricks, otherwise lead low.
    const ace = legal.find((c) => c.rank === 14 && c.suit !== 'S');
    return cardId(needMore && ace ? ace : byRank[0]);
  }

  const winners = byRank.filter((c) => {
    const trial = [...state.trick, { seat, card: c }];
    return winningIndex(trial) === trial.length - 1;
  });
  if (needMore && winners.length > 0) return cardId(winners[0]);
  const losers = byRank.filter((c) => !winners.includes(c));
  if (losers.length === 0) return cardId(byRank[0]);
  return cardId(needMore ? losers[0] : losers[losers.length - 1]);
}

// ---------- Engine adapter ----------

export type CallbreakAction = { type: 'bid'; bid: number } | { type: 'play'; card: string };

export interface CallbreakView {
  type: 'callbreak';
  phase: Phase;
  round: number;
  totalRounds: number;
  dealer: number;
  turn: number;
  bids: (number | null)[];
  tricksWon: number[];
  handCounts: number[];
  trick: Play[];
  lastTrick: { plays: Play[]; winner: number } | null;
  scores: number[][];
  hand: Card[];
  /** Card ids you're allowed to play right now (empty when it isn't your turn). */
  legal: string[];
}

const TRICK_PAUSE_MS = 1300;

export const callbreakEngine: Engine<CallbreakState, CallbreakAction, CallbreakView> = {
  create: (_players, rounds, rand = Math.random) => newGame(rounds, Math.floor(rand() * NUM_PLAYERS), rand),
  act(s, seat, a) {
    if (a?.type === 'bid') placeBid(s, seat, a.bid);
    else if (a?.type === 'play') playCard(s, seat, a.card);
    else throw new RuleError('Unknown action');
  },
  auto: (s) => (trickIsComplete(s) ? { delayMs: TRICK_PAUSE_MS, run: () => collectTrick(s) } : null),
  waitingOn: (s) => ((s.phase === 'bidding' || s.phase === 'playing') && s.turn >= 0 ? [s.turn] : []),
  bot: (s, seat) =>
    s.phase === 'bidding' ? { type: 'bid', bid: botBid(s.hands[seat]) } : { type: 'play', card: botPlay(s, seat) },
  nextRound: (s) => nextRound(s),
  view: (g, seat) => ({
    type: 'callbreak',
    phase: g.phase,
    round: g.round,
    totalRounds: g.totalRounds,
    dealer: g.dealer,
    turn: g.turn,
    bids: g.bids,
    tricksWon: g.tricksWon,
    handCounts: g.hands.map((h) => h.length),
    trick: g.trick,
    lastTrick: g.lastTrick,
    scores: g.scores,
    hand: seat >= 0 ? g.hands[seat] : [],
    legal: seat >= 0 && g.phase === 'playing' && g.turn === seat ? legalCards(g.hands[seat], g.trick).map(cardId) : [],
  }),
};
