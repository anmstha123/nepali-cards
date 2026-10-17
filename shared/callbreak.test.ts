import { describe, expect, it } from 'vitest';
import {
  botBid,
  botPlay,
  collectTrick,
  legalCards,
  newGame,
  nextRound,
  placeBid,
  playCard,
  roundScore,
  totals,
  trickIsComplete,
  winningIndex,
  type Play,
} from './callbreak.ts';
import { cardId, parseCardId } from './cards.ts';

const cards = (ids: string) => ids.split(' ').map(parseCardId);
const trick = (ids: string): Play[] => cards(ids).map((card, seat) => ({ seat, card }));
const ids = (cs: ReturnType<typeof cards>) => cs.map(cardId).sort();

describe('winningIndex', () => {
  it('highest card of led suit wins', () => {
    expect(winningIndex(trick('H5 H12 D14 H9'))).toBe(1);
  });
  it('any spade beats the led suit', () => {
    expect(winningIndex(trick('H14 S2 H13 D3'))).toBe(1);
    expect(winningIndex(trick('H14 S2 S10 D3'))).toBe(2);
  });
});

describe('legalCards', () => {
  it('anything can be led', () => {
    const hand = cards('S2 H5 D9');
    expect(legalCards(hand, [])).toHaveLength(3);
  });
  it('must follow suit and beat the winning card if possible', () => {
    const hand = cards('H3 H11 H14 S5 D2');
    expect(ids(legalCards(hand, trick('H10')))).toEqual(ids(cards('H11 H14')));
  });
  it('must follow suit with any card when unable to beat', () => {
    const hand = cards('H3 H4 S5');
    expect(ids(legalCards(hand, trick('H10')))).toEqual(ids(cards('H3 H4')));
  });
  it('need not beat when the trick has been trumped', () => {
    const hand = cards('H3 H14 S5');
    expect(ids(legalCards(hand, trick('H10 S2')))).toEqual(ids(cards('H3 H14')));
  });
  it('must trump when void in the led suit', () => {
    const hand = cards('S3 S9 D4');
    expect(ids(legalCards(hand, trick('H10')))).toEqual(ids(cards('S3 S9')));
  });
  it('must over-trump when possible', () => {
    const hand = cards('S3 S9 D4');
    expect(ids(legalCards(hand, trick('H10 S5')))).toEqual(ids(cards('S9')));
  });
  it('can play anything when unable to over-trump', () => {
    const hand = cards('S3 D4');
    expect(ids(legalCards(hand, trick('H10 S5')))).toEqual(ids(cards('S3 D4')));
  });
  it('can play anything when void in led suit and spades', () => {
    const hand = cards('D4 C9');
    expect(legalCards(hand, trick('H10'))).toHaveLength(2);
  });
});

describe('scoring', () => {
  it('made bid: bid + 0.1 per extra trick', () => {
    expect(roundScore(3, 3)).toBe(30);
    expect(roundScore(3, 5)).toBe(32);
  });
  it('missed bid: minus bid', () => {
    expect(roundScore(4, 3)).toBe(-40);
  });
});

describe('full game with bots', () => {
  it('plays 5 rounds legally to game over', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const g = newGame(5, 0, rand);
    let guard = 0;
    while (g.phase !== 'gameOver' && guard++ < 10000) {
      if (g.phase === 'bidding') {
        expect(g.hands.every((h) => h.some((c) => c.suit === 'S'))).toBe(true);
        placeBid(g, g.turn, botBid(g.hands[g.turn]));
      } else if (g.phase === 'playing') {
        if (trickIsComplete(g)) collectTrick(g);
        else playCard(g, g.turn, botPlay(g, g.turn));
      } else {
        expect(g.tricksWon.reduce((a, b) => a + b)).toBe(13);
        nextRound(g, rand);
      }
    }
    expect(g.phase).toBe('gameOver');
    expect(g.scores).toHaveLength(5);
    expect(totals(g.scores)).toHaveLength(4);
  });
});
