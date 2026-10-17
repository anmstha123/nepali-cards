import { Card, cardId, fullDeck, shuffle, sortHand, takeCards } from './cards.ts';
import { Engine, finishRound } from './engine.ts';
import { RuleError } from './callbreak.ts';

/**
 * Kitti (9 cards): everyone arranges 9 cards into three 3-card hands at once,
 * then hand 1s are compared, then hand 2s, then hand 3s (Teen Patti rankings).
 * Each showdown won scores 1 point; an exact tie for best scores nobody.
 */

export const KITTI_CARDS = 9;
const REVEAL_MS = 2200;

export const CATEGORY_NAMES = ['High card', 'Pair', 'Colour', 'Sequence', 'Pure sequence', 'Trial'];

export interface HandRank {
  cat: number;
  /** Tie-breakers, compared left to right. */
  kick: number[];
}

export interface Showdown {
  /** Each player's 3 cards for this showdown. */
  hands: Card[][];
  ranks: HandRank[];
  winner: number | null;
}

export interface KittiState {
  phase: 'arrange' | 'reveal' | 'roundEnd' | 'gameOver';
  n: number;
  round: number;
  totalRounds: number;
  scores: number[][];
  dealer: number;
  hands: Card[][];
  arranged: (Card[][] | null)[];
  showdowns: Showdown[];
}

export type KittiAction = { type: 'arrange'; groups: string[][] };

export interface KittiView {
  type: 'kitti';
  phase: KittiState['phase'];
  round: number;
  totalRounds: number;
  scores: number[][];
  dealer: number;
  turn: number;
  hand: Card[];
  myArrangement: Card[][] | null;
  submitted: boolean[];
  showdowns: Showdown[];
}

/** Value of a run's top card: A-K-Q is best, then A-2-3, then K-Q-J … 4-3-2. */
function runValue(ranks: number[]): number | null {
  const r = ranks.slice().sort((a, b) => a - b);
  if (r[0] === 2 && r[1] === 3 && r[2] === 14) return 14; // A-2-3
  if (r[1] === r[0] + 1 && r[2] === r[1] + 1) return r[2] === 14 ? 15 : r[2];
  return null;
}

export function rankHand(cards: Card[]): HandRank {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const run = runValue(ranks);
  if (ranks[0] === ranks[2]) return { cat: 5, kick: [ranks[0]] };
  if (run !== null && flush) return { cat: 4, kick: [run] };
  if (run !== null) return { cat: 3, kick: [run] };
  if (flush) return { cat: 2, kick: ranks };
  if (ranks[0] === ranks[1]) return { cat: 1, kick: [ranks[0], ranks[2]] };
  if (ranks[1] === ranks[2]) return { cat: 1, kick: [ranks[1], ranks[0]] };
  return { cat: 0, kick: ranks };
}

export function compareRank(a: HandRank, b: HandRank): number {
  if (a.cat !== b.cat) return a.cat - b.cat;
  for (let i = 0; i < Math.max(a.kick.length, b.kick.length); i++) {
    const d = (a.kick[i] ?? 0) - (b.kick[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Rough strength used by the auto-arranger. */
function strength(r: HandRank): number {
  return r.cat * 100 + (r.kick[0] ?? 0) * 4 + (r.kick[1] ?? 0) * 0.2;
}

/** Best split of 9 cards into three hands, strongest hand first. */
export function autoArrange(hand: Card[]): Card[][] {
  let best: Card[][] = [hand.slice(0, 3), hand.slice(3, 6), hand.slice(6, 9)];
  let bestScore = -Infinity;
  const idx = hand.map((_, i) => i);
  const combos = (arr: number[], k: number): number[][] =>
    k === 0 ? [[]] : arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map((c) => [x, ...c]));

  const [first, ...rest] = idx;
  // Fix the first card's group to avoid counting permutations of the same split.
  for (const a of combos(rest, 2)) {
    const g1 = [first, ...a];
    const left = idx.filter((i) => !g1.includes(i));
    const [f2, ...rest2] = left;
    for (const b of combos(rest2, 2)) {
      const g2 = [f2, ...b];
      const g3 = left.filter((i) => !g2.includes(i));
      const groups = [g1, g2, g3].map((g) => g.map((i) => hand[i]));
      const ranks = groups.map(rankHand).map(strength).sort((x, y) => y - x);
      // Favour having two strong hands (winning 2 of 3 takes the round).
      const score = ranks[0] + ranks[1] * 1.2 + ranks[2] * 0.6;
      if (score > bestScore) {
        bestScore = score;
        best = groups;
      }
    }
  }
  return best
    .map((g) => ({ g: sortHand(g), r: rankHand(g) }))
    .sort((x, y) => compareRank(y.r, x.r))
    .map((x) => x.g);
}

function deal(s: KittiState, rand: () => number): void {
  const deck = shuffle(fullDeck(), rand);
  s.hands = Array.from({ length: s.n }, () => sortHand(deck.splice(0, KITTI_CARDS)));
  s.arranged = Array(s.n).fill(null);
  s.showdowns = [];
  s.phase = 'arrange';
}

function create(n: number, totalRounds: number, rand: () => number = Math.random): KittiState {
  const s: KittiState = {
    phase: 'arrange', n, round: 1, totalRounds, scores: [], dealer: Math.floor(rand() * n),
    hands: [], arranged: [], showdowns: [],
  };
  deal(s, rand);
  return s;
}

function act(s: KittiState, seat: number, a: KittiAction): void {
  if (a?.type !== 'arrange') throw new RuleError('Unknown action');
  if (s.phase !== 'arrange') throw new RuleError('Hands are already being shown');
  if (s.arranged[seat]) throw new RuleError('You already locked in your hands');
  const groups = a.groups;
  if (!Array.isArray(groups) || groups.length !== 3 || groups.some((g) => !Array.isArray(g) || g.length !== 3)) {
    throw new RuleError('Make three hands of 3 cards');
  }
  const cards = takeCards(s.hands[seat], groups.flat(), (m) => new RuleError(m));
  s.arranged[seat] = [cards.slice(0, 3), cards.slice(3, 6), cards.slice(6, 9)];
  if (s.arranged.every(Boolean)) s.phase = 'reveal';
}

function revealNext(s: KittiState): void {
  const k = s.showdowns.length;
  const hands = s.arranged.map((a) => a![k]);
  const ranks = hands.map(rankHand);
  const best = ranks.reduce((b, r) => (compareRank(r, b) > 0 ? r : b));
  const top = ranks.flatMap((r, i) => (compareRank(r, best) === 0 ? [i] : []));
  s.showdowns.push({ hands, ranks, winner: top.length === 1 ? top[0] : null });
  if (s.showdowns.length === 3) {
    const pts = Array(s.n).fill(0);
    for (const sd of s.showdowns) if (sd.winner !== null) pts[sd.winner]++;
    finishRound(s, pts);
  }
}

export const kittiEngine: Engine<KittiState, KittiAction, KittiView> = {
  create,
  act,
  auto: (s) => (s.phase === 'reveal' ? { delayMs: REVEAL_MS, run: () => revealNext(s) } : null),
  waitingOn: (s) => (s.phase === 'arrange' ? s.arranged.flatMap((a, i) => (a ? [] : [i])) : []),
  bot: (s, seat) => ({ type: 'arrange', groups: autoArrange(s.hands[seat]).map((g) => g.map(cardId)) }),
  nextRound(s, rand: () => number = Math.random) {
    if (s.phase !== 'roundEnd') throw new RuleError('Round is not over');
    s.round++;
    s.dealer = (s.dealer + 1) % s.n;
    deal(s, rand);
  },
  view: (s, seat) => ({
    type: 'kitti',
    phase: s.phase,
    round: s.round,
    totalRounds: s.totalRounds,
    scores: s.scores,
    dealer: s.dealer,
    turn: -1,
    hand: s.hands[seat] ?? [],
    myArrangement: s.arranged[seat] ?? null,
    submitted: s.arranged.map(Boolean),
    showdowns: s.showdowns,
  }),
};
