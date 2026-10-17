export type Suit = 'S' | 'H' | 'D' | 'C';

export interface Card {
  suit: Suit;
  /** 2–14, where 11 = J, 12 = Q, 13 = K, 14 = A */
  rank: number;
  /** Which deck the card came from, for multi-deck games (Marriage). Omitted for deck 0. */
  d?: number;
}

export const SUITS: Suit[] = ['S', 'H', 'C', 'D'];

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function cardId(c: Card): string {
  return c.d ? `${c.suit}${c.rank}.${c.d}` : `${c.suit}${c.rank}`;
}

export function parseCardId(id: string): Card {
  const [base, d] = id.split('.');
  const card: Card = { suit: base[0] as Suit, rank: Number(base.slice(1)) };
  if (d) card.d = Number(d);
  return card;
}

/** Pull cards out of `hand` by id; throws if any id is missing or repeated. */
export function takeCards(hand: Card[], ids: string[], err: (msg: string) => Error): Card[] {
  if (new Set(ids).size !== ids.length) throw err('Same card chosen twice');
  return ids.map((id) => {
    const c = hand.find((h) => cardId(h) === id);
    if (!c) throw err("You don't have that card");
    return c;
  });
}

export function without(hand: Card[], cards: Card[]): Card[] {
  return hand.filter((c) => !cards.includes(c));
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function rankLabel(rank: number): string {
  return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[rank] ?? String(rank);
}

export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

export function fullDeck(decks = 1): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (let rank = 2; rank <= 14; rank++) deck.push(d ? { suit, rank, d } : { suit, rank });
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sort for display: alternating colours, high to low within a suit. */
export function sortHand(hand: Card[]): Card[] {
  const order: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };
  return hand.slice().sort((a, b) => order[a.suit] - order[b.suit] || b.rank - a.rank);
}
