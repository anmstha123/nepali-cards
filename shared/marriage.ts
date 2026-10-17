import { Card, cardId, fullDeck, isRed, sameCard, shuffle, sortHand, takeCards, without } from './cards.ts';
import { Engine, finishRound } from './engine.ts';
import { RuleError } from './callbreak.ts';

/**
 * Marriage (Nepali 21-card rummy), 2–5 players, 3 decks, no printed jokers.
 * - Turn: draw from the deck or take the top discard, then discard one card.
 * - To "see" the Tiplu (joker), show 3 pure sequences / tunnelas.
 * - After seeing: every card of the Tiplu's rank, plus the Jhiplu (rank − 1) and
 *   Poplu (rank + 1) of the Tiplu's suit, are wild.
 * - Finish: once seen, arrange the remaining 12 cards into 4 sets (sequence,
 *   trial or tunnela, jokers allowed) and discard the last card.
 */

export const MARRIAGE_HAND = 21;

export const TUNNELA_BONUS = 5;
export const SEEN_FEE = 3;
export const UNSEEN_FEE = 10;

export interface MarriageResult {
  winner: number;
  maal: number[];
  net: number[];
  seen: boolean[];
  hands: Card[][];
  /** The winner's final 4 sets (besides their shown sets). */
  winningSets: Card[][];
}

export interface MarriageState {
  phase: 'draw' | 'discard' | 'roundEnd' | 'gameOver';
  n: number;
  round: number;
  totalRounds: number;
  scores: number[][];
  dealer: number;
  turn: number;
  hands: Card[][];
  shown: Card[][][];
  seen: boolean[];
  deck: Card[];
  discard: Card[];
  tiplu: Card;
  result: MarriageResult | null;
  log: string;
}

export type MarriageAction =
  | { type: 'draw'; from: 'deck' | 'discard' }
  | { type: 'show'; cards?: string[] }
  | { type: 'discard'; card: string }
  | { type: 'finish'; card: string };

export interface MarriageView {
  type: 'marriage';
  phase: MarriageState['phase'];
  round: number;
  totalRounds: number;
  scores: number[][];
  dealer: number;
  turn: number;
  hand: Card[];
  handCounts: number[];
  shown: Card[][][];
  seen: boolean[];
  discardTop: Card | null;
  deckCount: number;
  /** Only revealed once you've seen (or the round is over). */
  tiplu: Card | null;
  result: MarriageResult | null;
  log: string;
}

// ---------- Set logic ----------

const up = (r: number) => (r === 14 ? 2 : r + 1);
const down = (r: number) => (r === 2 ? 14 : r - 1);

export function isJoker(c: Card, t: Card): boolean {
  return c.rank === t.rank || (c.suit === t.suit && (c.rank === up(t.rank) || c.rank === down(t.rank)));
}

/** Maal value of a single card. */
export function maalValue(c: Card, t: Card): number {
  if (sameCard(c, t)) return 3;
  if (c.suit === t.suit && (c.rank === up(t.rank) || c.rank === down(t.rank))) return 2;
  if (c.rank === t.rank && isRed(c.suit) === isRed(t.suit)) return 5;
  return 0;
}

export function maalLabel(c: Card, t: Card): string | null {
  if (sameCard(c, t)) return 'Tiplu';
  if (c.suit === t.suit && c.rank === up(t.rank)) return 'Poplu';
  if (c.suit === t.suit && c.rank === down(t.rank)) return 'Jhiplu';
  if (c.rank === t.rank && isRed(c.suit) === isRed(t.suit)) return 'Alter';
  if (c.rank === t.rank) return 'Joker';
  return null;
}

function isRun(ranks: number[]): boolean {
  for (const aceHigh of [true, false]) {
    const r = ranks.map((x) => (x === 14 && !aceHigh ? 1 : x)).sort((a, b) => a - b);
    if (r.every((x, i) => i === 0 || x === r[i - 1] + 1)) return true;
  }
  return false;
}

export const isTunnela = (cs: Card[]) => cs.length === 3 && cs.every((c) => sameCard(c, cs[0]));

export function isPureSet(cs: Card[]): boolean {
  if (cs.length !== 3) return false;
  if (isTunnela(cs)) return true;
  return cs.every((c) => c.suit === cs[0].suit) && isRun(cs.map((c) => c.rank));
}

function isTrial(cs: Card[]): boolean {
  return cs.every((c) => c.rank === cs[0].rank) && new Set(cs.map((c) => c.suit)).size === cs.length;
}

/** Any finishing set: pure set, trial, or a sequence/trial completed with jokers. */
export function isValidSet(cs: Card[], t: Card): boolean {
  if (cs.length !== 3) return false;
  if (isPureSet(cs) || isTrial(cs)) return true;
  const natural = cs.filter((c) => !isJoker(c, t));
  if (natural.length === 0) return true;
  if (isTrial(natural)) return true;
  if (!natural.every((c) => c.suit === natural[0].suit)) return false;
  if (new Set(natural.map((c) => c.rank)).size !== natural.length) return false;
  for (const aceHigh of [true, false]) {
    const r = natural.map((c) => (c.rank === 14 && !aceHigh ? 1 : c.rank));
    if (Math.max(...r) - Math.min(...r) <= 2) return true;
  }
  return false;
}

/** Split cards into sets of 3 satisfying `ok`, or null if impossible. */
export function partition(cards: Card[], ok: (cs: Card[]) => boolean): Card[][] | null {
  if (cards.length === 0) return [];
  if (cards.length % 3 !== 0) return null;
  const [first, ...rest] = cards;
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      const set = [first, rest[i], rest[j]];
      if (!ok(set)) continue;
      const sub = partition(
        rest.filter((_, k) => k !== i && k !== j),
        ok,
      );
      if (sub) return [set, ...sub];
    }
  }
  return null;
}

/** Find 3 disjoint pure sets in a hand (tunnelas preferred, for the bonus). */
export function findPureShow(hand: Card[]): Card[][] | null {
  const cands: Card[][] = [];
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++)
      for (let k = j + 1; k < hand.length; k++) {
        const set = [hand[i], hand[j], hand[k]];
        if (isPureSet(set)) cands.push(set);
      }
  cands.sort((a, b) => Number(isTunnela(b)) - Number(isTunnela(a)));
  const pick = (start: number, used: Set<Card>, acc: Card[][]): Card[][] | null => {
    if (acc.length === 3) return acc;
    for (let i = start; i < cands.length; i++) {
      if (cands[i].some((c) => used.has(c))) continue;
      const r = pick(i + 1, new Set([...used, ...cands[i]]), [...acc, cands[i]]);
      if (r) return r;
    }
    return null;
  };
  return pick(0, new Set(), []);
}

export function playerMaal(hand: Card[], shown: Card[][], t: Card): number {
  const all = [...hand, ...shown.flat()];
  let m = all.reduce((s, c) => s + maalValue(c, t), 0);
  const count = (r: number) => all.filter((c) => c.suit === t.suit && c.rank === r).length;
  m += Math.min(count(t.rank), count(up(t.rank)), count(down(t.rank))) * 3; // full marriage = 10
  m += shown.filter(isTunnela).length * TUNNELA_BONUS;
  return m;
}

/** Net points for each player: maal differences, plus the winner's fees. */
export function settle(maal: number[], seen: boolean[], winner: number): number[] {
  const n = maal.length;
  const m = maal.map((v, i) => (seen[i] ? v : 0));
  const total = m.reduce((a, b) => a + b, 0);
  const net = m.map((v) => n * v - total);
  for (let i = 0; i < n; i++) {
    if (i === winner) continue;
    const fee = seen[i] ? SEEN_FEE : UNSEEN_FEE;
    net[i] -= fee;
    net[winner] += fee;
  }
  return net;
}

// ---------- Game flow ----------

function deal(s: MarriageState, rand: () => number): void {
  const deck = shuffle(fullDeck(3), rand);
  s.hands = Array.from({ length: s.n }, () => sortHand(deck.splice(0, MARRIAGE_HAND)));
  s.shown = Array.from({ length: s.n }, () => []);
  s.seen = Array(s.n).fill(false);
  s.tiplu = deck.pop()!;
  s.discard = [deck.pop()!];
  s.deck = deck;
  s.result = null;
  s.turn = (s.dealer + 1) % s.n;
  s.phase = 'draw';
  s.log = '';
}

function create(n: number, totalRounds: number, rand: () => number = Math.random): MarriageState {
  const s = {
    phase: 'draw', n, round: 1, totalRounds, scores: [], dealer: Math.floor(rand() * n), turn: 0,
    hands: [], shown: [], seen: [], deck: [], discard: [], tiplu: { suit: 'S', rank: 2 }, result: null, log: '',
  } as MarriageState;
  deal(s, rand);
  return s;
}

function act(s: MarriageState, seat: number, a: MarriageAction): void {
  if (s.turn !== seat) throw new RuleError('Not your turn');
  const hand = s.hands[seat];
  const err = (m: string) => new RuleError(m);

  switch (a?.type) {
    case 'draw': {
      if (s.phase !== 'draw') throw err('You already drew this turn');
      let card: Card;
      if (a.from === 'discard') {
        if (!s.discard.length) throw err('The discard pile is empty');
        card = s.discard.pop()!;
        s.log = `took ${cardId(card)} from the discard pile`;
      } else {
        if (!s.deck.length) {
          const top = s.discard.pop()!;
          s.deck = shuffle(s.discard);
          s.discard = top ? [top] : [];
        }
        if (!s.deck.length) throw err('No cards left to draw');
        card = s.deck.pop()!;
        s.log = 'drew from the deck';
      }
      s.hands[seat] = sortHand([...hand, card]);
      s.phase = 'discard';
      return;
    }
    case 'show': {
      if (s.phase !== 'discard') throw err('Draw a card first');
      if (s.seen[seat]) throw err('You have already seen the joker');
      let sets: Card[][] | null;
      if (a.cards?.length) {
        if (a.cards.length !== 9) throw err('Select exactly 9 cards (3 sets of 3) to show');
        sets = partition(takeCards(hand, a.cards, err), isPureSet);
        if (!sets) throw err('Those 9 cards must make 3 pure sequences or tunnelas');
      } else {
        sets = findPureShow(hand);
        if (!sets) throw err("You don't have 3 pure sequences or tunnelas yet");
      }
      s.shown[seat] = sets;
      s.hands[seat] = without(hand, sets.flat());
      s.seen[seat] = true;
      s.log = 'showed 3 sets and saw the joker';
      return;
    }
    case 'discard': {
      if (s.phase !== 'discard') throw err('Draw a card first');
      const [card] = takeCards(hand, [a.card], err);
      s.hands[seat] = without(hand, [card]);
      s.discard.push(card);
      s.turn = (seat + 1) % s.n;
      s.phase = 'draw';
      s.log = '';
      return;
    }
    case 'finish': {
      if (s.phase !== 'discard') throw err('Draw a card first');
      if (!s.seen[seat]) throw err('Show your 3 sets first');
      const [card] = takeCards(hand, [a.card], err);
      const rest = without(hand, [card]);
      const sets = partition(rest, (cs) => isValidSet(cs, s.tiplu));
      if (!sets) throw err("Your cards don't make 7 sets yet");
      s.hands[seat] = rest;
      s.discard.push(card);
      const maal = s.hands.map((h, i) => playerMaal(h, s.shown[i], s.tiplu));
      const net = settle(maal, s.seen, seat);
      s.result = { winner: seat, maal, net, seen: s.seen.slice(), hands: s.hands, winningSets: sets };
      s.turn = -1;
      finishRound(s, net);
      return;
    }
    default:
      throw err('Unknown action');
  }
}

// ---------- Bot ----------

function usefulness(c: Card, hand: Card[], seen: boolean, t: Card): number {
  if (seen && isJoker(c, t)) return 1000;
  let score = 0;
  for (const o of hand) {
    if (o === c) continue;
    if (sameCard(o, c)) score += 15;
    else if (o.suit === c.suit) {
      const d = Math.abs(o.rank - c.rank);
      const dLow = Math.abs((o.rank === 14 ? 1 : o.rank) - (c.rank === 14 ? 1 : c.rank));
      const near = Math.min(d, dLow);
      if (near === 1) score += 12;
      else if (near === 2) score += 6;
    } else if (seen && o.rank === c.rank) score += 5;
  }
  return score;
}

function completesPure(hand: Card[], c: Card): boolean {
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++) if (isPureSet([c, hand[i], hand[j]])) return true;
  return false;
}

function bot(s: MarriageState, seat: number): MarriageAction {
  const hand = s.hands[seat];
  const seen = s.seen[seat];
  if (s.phase === 'draw') {
    const top = s.discard[s.discard.length - 1];
    const want = top && ((seen && isJoker(top, s.tiplu)) || completesPure(hand, top));
    return { type: 'draw', from: want ? 'discard' : 'deck' };
  }
  if (!seen) {
    const show = findPureShow(hand);
    if (show) return { type: 'show', cards: show.flat().map(cardId) };
  } else {
    for (const c of hand) {
      if (partition(without(hand, [c]), (cs) => isValidSet(cs, s.tiplu))) return { type: 'finish', card: cardId(c) };
    }
  }
  const worst = hand
    .map((c) => ({ c, u: usefulness(c, hand, seen, s.tiplu) - c.rank * 0.1 }))
    .sort((a, b) => a.u - b.u)[0].c;
  return { type: 'discard', card: cardId(worst) };
}

export const marriageEngine: Engine<MarriageState, MarriageAction, MarriageView> = {
  create,
  act,
  auto: () => null,
  waitingOn: (s) => (s.phase === 'draw' || s.phase === 'discard' ? [s.turn] : []),
  bot,
  nextRound(s, rand: () => number = Math.random) {
    if (s.phase !== 'roundEnd') throw new RuleError('Round is not over');
    s.round++;
    s.dealer = (s.dealer + 1) % s.n;
    deal(s, rand);
  },
  view: (s, seat) => {
    const over = s.phase === 'roundEnd' || s.phase === 'gameOver';
    return {
      type: 'marriage',
      phase: s.phase,
      round: s.round,
      totalRounds: s.totalRounds,
      scores: s.scores,
      dealer: s.dealer,
      turn: s.turn,
      hand: s.hands[seat] ?? [],
      handCounts: s.hands.map((h) => h.length),
      shown: s.shown,
      seen: s.seen,
      discardTop: s.discard[s.discard.length - 1] ?? null,
      deckCount: s.deck.length,
      tiplu: over || s.seen[seat] ? s.tiplu : null,
      result: s.result,
      log: s.log,
    };
  },
};
