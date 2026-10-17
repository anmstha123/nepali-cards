import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import { RuleError } from '../shared/callbreak.ts';
import type { Ack, ClientToServer, ServerToClient } from '../shared/protocol.ts';
import { Room } from './rooms.ts';

const PORT = Number(process.env.PORT ?? 3001);
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;

const app = express();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(http, { cors: { origin: true } });

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const rooms = new Map<string, Room>();
/** socket.id -> { room code, player token } */
const sessions = new Map<string, { code: string; token: string }>();

function broadcast(room: Room): void {
  for (const seat of room.seats) {
    if (seat?.socketId) io.to(seat.socketId).emit('state', room.viewFor(seat.token));
  }
}

function newCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function errorMessage(err: unknown): string {
  if (err instanceof RuleError) return err.message;
  console.error(err);
  return 'Something went wrong';
}

io.on('connection', (socket: Socket<ClientToServer, ServerToClient>) => {
  const current = () => {
    const s = sessions.get(socket.id);
    const room = s && rooms.get(s.code);
    return s && room ? { room, token: s.token } : null;
  };

  /** Run a room action; push fresh state to everyone; report errors via ack if given. */
  const act = (fn: (room: Room, token: string) => void, ack?: Ack) => {
    const c = current();
    if (!c) return ack?.({ ok: false, error: 'Not in a room' });
    try {
      fn(c.room, c.token);
      broadcast(c.room);
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: errorMessage(err) });
    }
  };

  socket.on('join', (req, ack) => {
    try {
      const name = String(req.name ?? '').trim().slice(0, 16);
      const token = String(req.token ?? '');
      if (!name) throw new RuleError('Please enter your name');
      if (token.length < 8) throw new RuleError('Invalid session');

      let room: Room | undefined;
      if (req.code) {
        room = rooms.get(req.code.toUpperCase());
        if (!room) throw new RuleError(`Room ${req.code.toUpperCase()} doesn't exist`);
      } else {
        room = new Room(newCode(), broadcast);
        rooms.set(room.code, room);
      }

      // A socket can only sit in one room at a time.
      const prev = current();
      if (prev && prev.room !== room) {
        prev.room.disconnect(socket.id);
        broadcast(prev.room);
      }

      room.join(token, name, socket.id);
      sessions.set(socket.id, { code: room.code, token });
      ack({ ok: true, code: room.code });
      broadcast(room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('leave', () => {
    act((room, token) => room.leave(token));
    sessions.delete(socket.id);
  });
  socket.on('addBot', () => act((room, token) => room.addBot(token)));
  socket.on('removeSeat', (seat) => act((room, token) => room.removeSeat(token, seat)));
  socket.on('setGame', (type) => act((room, token) => room.setGame(token, type)));
  socket.on('setRounds', (n) => act((room, token) => room.setRounds(token, n)));
  socket.on('start', (ack) => act((room, token) => room.start(token), ack));
  socket.on('act', (action, ack) => act((room, token) => room.act(token, action), ack));
  socket.on('nextRound', () => act((room, token) => room.nextRound(token)));
  socket.on('takeOver', (seat) => act((room, token) => room.takeOver(token, seat)));
  socket.on('newGame', () => act((room, token) => room.newGame(token)));

  socket.on('disconnect', () => {
    const c = current();
    sessions.delete(socket.id);
    if (!c) return;
    c.room.disconnect(socket.id);
    broadcast(c.room);
  });
});

// Clean up rooms nobody is connected to.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.connectedCount === 0 && now - room.lastActivity > (room.game ? ROOM_IDLE_MS : 10 * 60 * 1000)) {
      room.dispose();
      rooms.delete(code);
    }
  }
}, 60 * 1000).unref();

http.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — is another copy of the server (npm start / npm run dev) still running?`);
    process.exit(1);
  }
  throw err;
});

http.listen(PORT, () => {
  console.log(`Taas server listening on http://localhost:${PORT}`);
});
