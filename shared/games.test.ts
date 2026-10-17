import { describe, expect, it } from 'vitest';
import { parseCardId } from './cards.ts';
import { seededRandom } from './engine.ts';
import { handTotal, isValidThrow } from './dhumbal.ts';
import { GAMES, GameType } from './games.ts';
import { compareRank, rankHand } from './kitti.ts';
import { isJoker, isPureSet, isValidSet, maalValue, partition, playerMaal, settle } from './marriage.ts';
import { ENGINES } from './registry.ts';

const cards = (ids: string) => ids.split(' ').map(parseCardId);

describe('Dhumbal', () => {
  it('values aces as 1', () => {
    expect(handTotal(cards('S14 H2 D13'))).toBe(16);
  });
  it('accepts singles, same-rank sets and same-suit runs', () => {
    expect(isValidThrow(cards('S5'))).toBe(true);
    expect(isValidThrow(cards('S5 H5'))).toBe(true);
    expect(isValidThrow(cards('S5 H5 D5 C5'))).toBe(true);
    expect(isValidThrow(cards('S4 S5 S6'))).toBe(true);
    expect(isValidThrow(cards('S14 S2 S3'))).toBe(true);
    expect(isValidThrow(cards('S12 S13 S14'))).toBe(true);
  });
  it('rejects mixed throws', () => {
    expect(isValidThrow(cards('S5 H6'))).toBe(false);
    expect(isValidThrow(cards('S4 S5'))).toBe(false);
    expect(isValidThrow(cards('S4 H5 S6'))).toBe(false);
    expect(isValidThrow(cards('S13 S14 S2'))).toBe(false);
  });
});

describe('Kitti hand ranking', () => {
  const r = (ids: string) => rankHand(cards(ids));
  it('orders categories', () => {
    const order = ['S2 H7 D9', 'S2 H2 D9', 'S2 S7 S9', 'S4 H5 D6', 'S4 S5 S6', 'S3 H3 D3'];
    for (let i = 1; i < order.length; i++) expect(compareRank(r(order[i]), r(order[i - 1]))).toBeGreaterThan(0);
  });
  it('A-K-Q beats A-2-3 beats K-Q-J', () => {
    expect(compareRank(r('S14 H13 D12'), r('S14 H2 D3'))).toBeGreaterThan(0);
    expect(compareRank(r('S14 H2 D3'), r('S13 H12 D11'))).toBeGreaterThan(0);
  });
  it('compares pairs by pair then kicker', () => {
    expect(compareRank(r('S9 H9 D2'), r('S8 H8 D14'))).toBeGreaterThan(0);
    expect(compareRank(r('S9 H9 D5'), r('C9 D9 H4'))).toBeGreaterThan(0);
  });
});

describe('Marriage', () => {
  const tiplu = parseCardId('H7');
  it('knows its jokers', () => {
    expect(isJoker(parseCardId('S7'), tiplu)).toBe(true); // same rank
    expect(isJoker(parseCardId('H8'), tiplu)).toBe(true); // poplu
    expect(isJoker(parseCardId('H6'), tiplu)).toBe(true); // jhiplu
    expect(isJoker(parseCardId('S8'), tiplu)).toBe(false);
  });
  it('scores maal', () => {
    expect(maalValue(parseCardId('H7.1'), tiplu)).toBe(3);
    expect(maalValue(parseCardId('H8'), tiplu)).toBe(2);
    expect(maalValue(parseCardId('D7'), tiplu)).toBe(5); // alter: same colour
    expect(maalValue(parseCardId('S7'), tiplu)).toBe(0);
    // Full marriage (jhiplu + tiplu + poplu) = 10
    expect(playerMaal(cards('H6 H7 H8'), [], tiplu)).toBe(10);
    // Shown tunnela bonus
    expect(playerMaal([], [cards('S2 S2.1 S2.2')], tiplu)).toBe(5);
  });
  it('validates pure and joker sets', () => {
    expect(isPureSet(cards('S2 S3 S4'))).toBe(true);
    expect(isPureSet(cards('S14 S2 S3'))).toBe(true);
    expect(isPureSet(cards('S5 S5.1 S5.2'))).toBe(true);
    expect(isPureSet(cards('S5 H5 D5'))).toBe(false);
    expect(isValidSet(cards('S5 H5 D5'), tiplu)).toBe(true); // trial
    expect(isValidSet(cards('S5 S5.1 D5'), tiplu)).toBe(false); // repeated suit
    expect(isValidSet(cards('S2 S4 C7'), tiplu)).toBe(true); // joker fills the gap
    expect(isValidSet(cards('S2 S9 C7'), tiplu)).toBe(false);
    expect(isValidSet(cards('C7 D7 H8'), tiplu)).toBe(true); // all jokers
  });
  it('finds a finishing partition', () => {
    const hand = cards('S2 S3 S4 H9 H10 H11 C5 D5 S5 D2 D4 C7');
    expect(partition(hand, (cs) => isValidSet(cs, tiplu))).not.toBeNull();
  });
  it('settles to zero sum with fees', () => {
    const net = settle([10, 4, 0], [true, true, false], 0);
    expect(net.reduce((a, b) => a + b)).toBe(0);
    // Winner: 3*10 - 14 = 16, +3 from seen, +10 from unseen
    expect(net[0]).toBe(29);
    expect(net[2]).toBe(-14 - 10);
  });
});

describe.each(Object.keys(GAMES) as GameType[])('%s bot-only game', (type) => {
  it('plays every round to game over', () => {
    const engine = ENGINES[type];
    const info = GAMES[type];
    for (const players of [info.minPlayers, info.maxPlayers]) {
      const rand = seededRandom(7 + players);
      const s = engine.create(players, 3, rand);
      let guard = 0;
      while (s.phase !== 'gameOver') {
        if (++guard > 50000) throw new Error(`${type} stuck in phase ${s.phase}`);
        if (s.phase === 'roundEnd') {
          engine.nextRound(s);
          continue;
        }
        const step = engine.auto(s);
        if (step) {
          step.run();
          continue;
        }
        const waiting = engine.waitingOn(s);
        expect(waiting.length).toBeGreaterThan(0);
        for (const seat of waiting) engine.act(s, seat, engine.bot(s, seat));
      }
      expect(s.scores).toHaveLength(3);
      expect(s.scores.every((row) => row.length === players)).toBe(true);
      if (type === 'marriage') {
        for (const row of s.scores) expect(row.reduce((a, b) => a + b)).toBe(0);
      }
    }
  });
});
