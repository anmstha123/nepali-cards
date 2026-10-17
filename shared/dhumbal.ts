import { Card, cardId, fullDeck, shuffle, sortHand, takeCards, without } from './cards.ts';
import { Engine, finishRound } from './engine.ts';
import { RuleError } from './callbreak.ts';

/**
 * Dhumbal (Jhyap) — lowest hand wins.
 * - 5 cards each; A = 1 … K = 13.
 * - Turn: throw 1 card, 2–4 of a kind, or a run of 3+ in one suit; then take one
 *   card from what the previous player threw, or draw from the deck.
 * - Instead of throwing, a player with ≤ SHOW_LIMIT points may call Jhyap.
 */

export const HAND_SIZE = 5;
export const SHOW_LIMIT = 10;
export const CAUGHT_PENALTY = 20;

export interface Throw {
  seat: number;
  cards: Card[];
}

export interface DhumbalResult {
  caller: number;
  caught: boolean;
  /** Who caught the caller (lowest other hand), when caught. */
  catcher: number;
  totals: number[];
  hands: Card[][];
}

export interface DhumbalState {
  phase: 'throw' | 'pick' | 'roundEnd' | 'gameOver';
  n: number;
  round: number;
  totalRounds: number;
  scores: number[][];
  dealer: number;
  turn: number;
  hands: Card[][];
  deck: Card[];
  pile: Card[];
  /** What the previous player threw — the current player may pick from it. */
  available: Throw | null;
  /** What the current player just threw (during 'pick'). */
  thrown: Throw | null;
  result: DhumbalResult | null;
  log: string;
}

export type DhumbalAction =
  | { type: 'throw'; cards: string[] }
  | { type: 'pick'; card: string | null } // null = draw from deck
  | { type: 'show' };

export interface DhumbalView {
  type: 'dhumbal';
  phase: DhumbalState['phase'];
  round: number;
  totalRounds: number;
  scores: number[][];
  dealer: number;
  turn: number;
  hand: Card[];
  handCounts: number[];
  available: Throw | null;
  thrown: Throw | null;
  deckCount: number;
  myTotal: number;
  canShow: boolean;
  result: DhumbalResult | null;
  log: string;
}

export const cardValue = (c: Card) => (c.rank === 14 ? 1 : c.rank);
export const handTotal = (h: Card[]) => h.reduce((s, c) => s + cardValue(c), 0);

export function isValidThrow(cards: Card[]): boolean {
  if (cards.length === 0) return false;
  if (cards.length === 1) return true;
  if (cards.every((c) => c.rank === cards[0].rank)) return true;
  if (cards.length < 3 || !cards.every((c) => c.suit === cards[0].suit)) return false;
  // Run in one suit; ace may be low (A-2-3) or high (Q-K-A).
  for (const aceHigh of [true, false]) {
    const ranks = cards.map((c) => (c.rank === 14 && !aceHigh ? 1 : c.rank)).sort((a, b) => a - b);
    if (ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1)) return true;
  }
  return false;
}

function deal(s: DhumbalState, rand: () => number): void {
  const deck = shuffle(fullDeck(), rand);
  s.hands = Array.from({ length: s.n }, () => sortHand(deck.splice(0, HAND_SIZE)));
  s.available = { seat: -1, cards: [deck.pop()!] };
  s.deck = deck;
  s.pile = [];
  s.thrown = null;
  s.result = null;
  s.turn = (s.dealer + 1) % s.n;
  s.phase = 'throw';
  s.log = '';
}

function create(n: number, totalRounds: number, rand: () => number = Math.random): DhumbalState {
  const s: DhumbalState = {
    phase: 'throw', n, round: 1, totalRounds, scores: [], dealer: Math.floor(rand() * n), turn: 0,
    hands: [], deck: [], pile: [], available: null, thrown: null, result: null, log: '',
  };
  deal(s, rand);
  return s;
}

function show(s: DhumbalState, seat: number): void {
  const totals = s.hands.map(handTotal);
  const mine = totals[seat];
  if (mine > SHOW_LIMIT) throw new RuleError(`You need ${SHOW_LIMIT} points or less to call Jhyap`);
  let catcher = -1;
  for (let k = 1; k < s.n; k++) {
    const p = (seat + k) % s.n;
    if (totals[p] <= mine && (catcher < 0 || totals[p] < totals[catcher])) catcher = p;
  }
  const caught = catcher >= 0;
  const round = totals.map((t, p) => {
    if (p === seat) return caught ? t + CAUGHT_PENALTY : 0;
    if (p === catcher) return 0;
    return t;
  });
  s.result = { caller: seat, caught, catcher, totals, hands: s.hands };
  s.turn = -1;
  finishRound(s, round);
}

function act(s: DhumbalState, seat: number, a: DhumbalAction): void {
  if (s.turn !== seat) throw new RuleError('Not your turn');
  const hand = s.hands[seat];

  if (a?.type === 'show') {
    if (s.phase !== 'throw') throw new RuleError('Call Jhyap at the start of your turn');
    show(s, seat);
    return;
  }

  if (a?.type === 'throw') {
    if (s.phase !== 'throw') throw new RuleError('You already threw this turn');
    const cards = takeCards(hand, a.cards ?? [], (m) => new RuleError(m));
    if (!isValidThrow(cards)) throw new RuleError('Throw one card, a set of the same rank, or a run of 3+ in one suit');
    if (cards.length === hand.length) throw new RuleError('You must keep at least one card');
    s.hands[seat] = without(hand, cards);
    s.thrown = { seat, cards };
    s.phase = 'pick';
    return;
  }

  if (a?.type === 'pick') {
    if (s.phase !== 'pick') throw new RuleError('Throw first, then pick');
    let card: Card;
    if (a.card) {
      const c = s.available?.cards.find((x) => cardId(x) === a.card);
      if (!c) throw new RuleError('That card is not available to pick');
      card = c;
      s.available!.cards = without(s.available!.cards, [c]);
      s.log = `picked ${cardId(c)}`;
    } else {
      if (s.deck.length === 0) {
        s.deck = shuffle(s.pile);
        s.pile = [];
      }
      if (s.deck.length === 0) throw new RuleError('The deck is empty — pick from the thrown cards');
      card = s.deck.pop()!;
      s.log = 'drew from the deck';
    }
    s.hands[seat] = sortHand([...s.hands[seat], card]);
    s.pile.push(...(s.available?.cards ?? []));
    s.available = s.thrown;
    s.thrown = null;
    s.turn = (seat + 1) % s.n;
    s.phase = 'throw';
    return;
  }

  throw new RuleError('Unknown action');
}

/** All throwable groups in a hand. */
export function throwOptions(hand: Card[]): Card[][] {
  const opts: Card[][] = hand.map((c) => [c]);
  const byRank = new Map<number, Card[]>();
  for (const c of hand) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
  for (const g of byRank.values()) if (g.length >= 2) opts.push(g);
  for (let i = 0; i < hand.length; i++) {
    for (let j = 0; j < hand.length; j++) {
      for (let k = 0; k < hand.length; k++) {
        if (i < j && j < k && isValidThrow([hand[i], hand[j], hand[k]]) && hand[i].rank !== hand[j].rank) {
          const run = [hand[i], hand[j], hand[k]];
          opts.push(run);
          // Extend to 4/5-card runs.
          for (const extra of hand) {
            if (!run.includes(extra) && isValidThrow([...run, extra])) opts.push([...run, extra]);
          }
        }
      }
    }
  }
  return opts;
}

function bot(s: DhumbalState, seat: number): DhumbalAction {
  const hand = s.hands[seat];
  if (s.phase === 'throw') {
    if (handTotal(hand) <= Math.min(SHOW_LIMIT, 7)) return { type: 'show' };
    const opts = throwOptions(hand).filter((g) => g.length < hand.length);
    opts.sort((a, b) => handTotal(b) - handTotal(a));
    return { type: 'throw', cards: opts[0].map(cardId) };
  }
  // Pick a low card, or one that pairs with something we hold; otherwise draw.
  const avail = s.available?.cards ?? [];
  const good = avail
    .filter((c) => cardValue(c) <= 3 || hand.some((h) => h.rank === c.rank))
    .sort((a, b) => cardValue(a) - cardValue(b))[0];
  if (good) return { type: 'pick', card: cardId(good) };
  if (s.deck.length + s.pile.length === 0 && avail.length) return { type: 'pick', card: cardId(avail[0]) };
  return { type: 'pick', card: null };
}

export const dhumbalEngine: Engine<DhumbalState, DhumbalAction, DhumbalView> = {
  create,
  act,
  auto: () => null,
  waitingOn: (s) => (s.phase === 'throw' || s.phase === 'pick' ? [s.turn] : []),
  bot,
  nextRound(s, rand: () => number = Math.random) {
    if (s.phase !== 'roundEnd') throw new RuleError('Round is not over');
    s.round++;
    s.dealer = (s.dealer + 1) % s.n;
    deal(s, rand);
  },
  view: (s, seat) => ({
    type: 'dhumbal',
    phase: s.phase,
    round: s.round,
    totalRounds: s.totalRounds,
    scores: s.scores,
    dealer: s.dealer,
    turn: s.turn,
    hand: s.hands[seat] ?? [],
    handCounts: s.hands.map((h) => h.length),
    available: s.available,
    thrown: s.thrown,
    deckCount: s.deck.length + s.pile.length,
    myTotal: handTotal(s.hands[seat] ?? []),
    canShow: s.phase === 'throw' && s.turn === seat && handTotal(s.hands[seat]) <= SHOW_LIMIT,
    result: s.result,
    log: s.log,
  }),
};
