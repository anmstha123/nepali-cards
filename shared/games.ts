export type GameType = 'callbreak' | 'marriage' | 'dhumbal' | 'kitti';

export interface GameInfo {
  type: GameType;
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  roundOptions: number[];
  defaultRounds: number;
  /** Scores are stored in tenths (Callbreak's 3.2 = 32). */
  tenths: boolean;
  lowerIsBetter: boolean;
  /** Length of the client deal animation; the server holds bots back until it finishes. */
  dealAnimMs: number;
  rules: string[];
}

export const GAMES: Record<GameType, GameInfo> = {
  callbreak: {
    type: 'callbreak',
    name: 'Callbreak',
    tagline: 'Bid and win tricks · spades are trump',
    minPlayers: 4,
    maxPlayers: 4,
    roundOptions: [1, 3, 5, 7, 10],
    defaultRounds: 5,
    tenths: true,
    lowerIsBetter: false,
    dealAnimMs: 2400,
    rules: [
      '4 players, 13 cards each. Spades (♠) are always trump.',
      'Everyone bids how many tricks (1–8) they will win.',
      'Follow the suit led and beat the best card on the table if you can.',
      "Can't follow? You must play a spade, beating any spade already played if you can.",
      'Make your bid: score bid + 0.1 per extra trick. Miss it: lose your bid.',
    ],
  },
  marriage: {
    type: 'marriage',
    name: 'Marriage',
    tagline: '21 cards · 3 decks · jokers & maal',
    minPlayers: 2,
    maxPlayers: 5,
    roundOptions: [1, 3, 5, 7, 10],
    defaultRounds: 5,
    tenths: false,
    lowerIsBetter: false,
    dealAnimMs: 0,
    rules: [
      '3 decks, 21 cards each. On your turn draw (deck or discard), then discard one.',
      'Show 3 pure sequences or tunnelas (3 identical cards) to "see" the Tiplu (joker).',
      'After seeing, all cards of the Tiplu rank, plus the Jhiplu (one below) and Poplu (one above) of its suit, are wild.',
      'Finish by arranging all 21 cards into 7 sets — sequences, trials (3 suits of a rank) or tunnelas — and discarding your 22nd card.',
      'Maal: Tiplu 3, Poplu 2, Jhiplu 2, Alter (same rank & colour) 5, full marriage +3, each shown tunnela 5.',
      'Everyone settles maal differences; the winner also collects 3 from each seen player and 10 from each unseen one.',
    ],
  },
  dhumbal: {
    type: 'dhumbal',
    name: 'Dhumbal',
    tagline: 'Jhyap! · lowest hand wins',
    minPlayers: 2,
    maxPlayers: 6,
    roundOptions: [3, 5, 7, 10],
    defaultRounds: 5,
    tenths: false,
    lowerIsBetter: true,
    dealAnimMs: 0,
    rules: [
      '5 cards each. A = 1, J = 11, Q = 12, K = 13.',
      'On your turn throw one card, a pair/three/four of a kind, or a run of 3+ in one suit.',
      'Then pick one card the previous player threw, or draw from the deck.',
      'With 10 points or less, call Jhyap instead of throwing. Lowest hand scores 0, everyone else scores their hand.',
      'Caught (someone ties or beats you)? You score your hand + 20 and they score 0.',
      'Lowest total after all rounds wins.',
    ],
  },
  kitti: {
    type: 'kitti',
    name: 'Kitti',
    tagline: '9 cards · three hands of three',
    minPlayers: 2,
    maxPlayers: 5,
    roundOptions: [3, 5, 7, 10],
    defaultRounds: 5,
    tenths: false,
    lowerIsBetter: false,
    dealAnimMs: 0,
    rules: [
      '9 cards each. Arrange them into three hands of 3 cards.',
      'Hands rank: Trial > Pure sequence > Sequence > Colour > Pair > High card (A-K-Q, then A-2-3 are top runs).',
      'Hand 1 is compared with everyone’s hand 1, then hand 2, then hand 3.',
      'Each hand you win scores 1 point (exact ties score nothing). Most points after all rounds wins.',
    ],
  },
};

export const GAME_LIST: GameInfo[] = [GAMES.callbreak, GAMES.marriage, GAMES.dhumbal, GAMES.kitti];

export function formatScore(type: GameType, v: number): string {
  return GAMES[type].tenths ? (v / 10).toFixed(1) : String(v);
}
