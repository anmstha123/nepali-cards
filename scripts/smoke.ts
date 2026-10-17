// End-to-end smoke test: for every game, two real socket clients + bots play one round.
// Usage: start the server, then `npx tsx scripts/smoke.ts [url]`.
import { io, Socket } from 'socket.io-client';
import { cardId } from '../shared/cards.ts';
import { GAMES, GameType } from '../shared/games.ts';
import { autoArrange } from '../shared/kitti.ts';
import type { ClientToServer, GameAction, RoomView, ServerToClient } from '../shared/protocol.ts';

const URL = process.argv[2] ?? 'http://localhost:3001';
type S = Socket<ServerToClient, ClientToServer>;

function fail(msg: string): never {
  console.error('FAIL:', msg);
  process.exit(1);
}

const until = async (cond: () => boolean, ms = 120000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) fail('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
};

/** A dumb but legal player driven purely by the view the server sends. */
function client(name: string, token: string) {
  const socket: S = io(URL, { transports: ['websocket'], forceNew: true });
  let latest: RoomView | null = null;
  let busy = false;
  const send = (a: GameAction) =>
    new Promise<boolean>((res) => socket.emit('act', a, (r) => res(r.ok)));

  const think = async (v: RoomView) => {
    const g = v.game;
    if (!g || busy) return;
    const me = v.mySeat;
    if (g.phase === 'roundEnd' && me === v.hostSeat) socket.emit('nextRound');
    busy = true;
    try {
      if (g.type === 'callbreak' && g.turn === me) {
        if (g.phase === 'bidding') await send({ type: 'bid', bid: 2 });
        else if (g.legal.length) await send({ type: 'play', card: g.legal[0] });
      } else if (g.type === 'dhumbal' && g.turn === me) {
        if (g.phase === 'throw') {
          if (!(g.canShow && (await send({ type: 'show' })))) {
            const high = g.hand.slice().sort((a, b) => b.rank - a.rank)[0];
            if (!(await send({ type: 'throw', cards: [cardId(high)] }))) fail(`${name} dhumbal throw`);
          }
        } else if (g.phase === 'pick') await send({ type: 'pick', card: null });
      } else if (g.type === 'kitti' && g.phase === 'arrange' && !g.myArrangement) {
        const groups = autoArrange(g.hand).map((h) => h.map(cardId));
        if (!(await send({ type: 'arrange', groups }))) fail(`${name} kitti arrange`);
      } else if (g.type === 'marriage' && g.turn === me) {
        if (g.phase === 'draw') await send({ type: 'draw', from: 'deck' });
        else if (g.phase === 'discard') {
          if (!g.seen[me]) await send({ type: 'show' }); // fails quietly if not possible
          const fresh = latest!.game as typeof g;
          if (!(await send({ type: 'discard', card: cardId(fresh.hand[0]) }))) fail(`${name} marriage discard`);
        }
      }
    } finally {
      busy = false;
    }
    // A newer state may have arrived while we were waiting for the ack.
    if (latest && latest !== v) void think(latest);
  };

  socket.on('state', (v) => {
    latest = v;
    void think(v);
  });
  const join = (code?: string) =>
    new Promise<string>((res, rej) =>
      socket.emit('join', { name, token, code }, (r) => (r.ok ? res(r.code!) : rej(new Error(r.error)))),
    );
  return { socket, join, view: () => latest };
}

const a = client('Alice', 'token-alice-123');
const b = client('Bikash', 'token-bikash-123');
const code = await a.join();
await b.join(code);

for (const type of Object.keys(GAMES) as GameType[]) {
  const info = GAMES[type];
  a.socket.emit('setGame', type);
  await until(() => a.view()?.gameType === type);
  const rounds = Math.min(...info.roundOptions);
  a.socket.emit('setRounds', rounds);
  for (let i = 2; i < Math.max(info.minPlayers, 3); i++) a.socket.emit('addBot');
  await until(() => (a.view()?.seats.filter(Boolean).length ?? 0) >= Math.max(info.minPlayers, 3));
  await new Promise<void>((res) => a.socket.emit('start', (r) => (r.ok ? res() : fail(`${type} start: ${r.error}`))));
  const t0 = Date.now();

  if (type === 'callbreak') {
    // Bikash "refreshes" mid-game and must get his seat and hand back.
    await until(() => ((a.view()?.game as { handCounts?: number[] })?.handCounts?.[0] ?? 13) < 12);
    b.socket.disconnect();
    await b.socket.connect();
    await b.join(code);
    await until(() => (b.view()?.game?.type === 'callbreak' && b.view()!.game!.phase !== undefined));
    console.log('  reconnect ok');
  }

  await until(() => a.view()?.game?.phase === 'gameOver', 300000);
  const g = a.view()!.game!;
  console.log(`${info.name}: ${a.view()!.seats.length} players, scores ${JSON.stringify(g.scores)} (${Date.now() - t0}ms)`);
  if (g.scores.length !== rounds) fail(`${type}: expected ${rounds} rounds`);

  a.socket.emit('newGame');
  await until(() => a.view()?.game === null);
  // Clear bots for the next game.
  for (const [i, s] of a.view()!.seats.entries()) if (s?.bot) a.socket.emit('removeSeat', i);
  await until(() => a.view()!.seats.every((s) => !s?.bot));
}

console.log('PASS');
process.exit(0);
