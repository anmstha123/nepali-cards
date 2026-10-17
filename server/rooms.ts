import { RuleError } from '../shared/callbreak.ts';
import type { BaseState } from '../shared/engine.ts';
import { GAMES, GameType } from '../shared/games.ts';
import type { GameAction, RoomView, SeatInfo } from '../shared/protocol.ts';
import { ENGINES } from '../shared/registry.ts';

const BOT_NAMES = ['Ram Bot', 'Sita Bot', 'Hari Bot', 'Gita Bot', 'Shyam Bot', 'Maya Bot'];
const BOT_DELAY_MS = 700;
const MAX_SEATS = Math.max(...Object.values(GAMES).map((g) => g.maxPlayers));

export interface Seat {
  token: string;
  name: string;
  bot: boolean;
  autoplay: boolean;
  socketId: string | null;
}

export class Room {
  /** In the lobby this has MAX_SEATS slots; during a game, exactly one per player. */
  seats: (Seat | null)[] = Array(MAX_SEATS).fill(null);
  hostToken: string | null = null;
  gameType: GameType = 'callbreak';
  totalRounds = GAMES.callbreak.defaultRounds;
  game: BaseState | null = null;
  lastActivity = Date.now();
  private dealtAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly code: string,
    private readonly broadcast: (room: Room) => void,
  ) {}

  private get engine() {
    return ENGINES[this.gameType];
  }

  private get info() {
    return GAMES[this.gameType];
  }

  seatOf(token: string): number {
    return this.seats.findIndex((s) => s?.token === token);
  }

  isHost(token: string): boolean {
    return this.hostToken === token;
  }

  get connectedCount(): number {
    return this.seats.filter((s) => s && !s.bot && s.socketId).length;
  }

  private get seatedCount(): number {
    return this.seats.filter(Boolean).length;
  }

  /** Seat a player (or reattach a returning one). Returns the seat index. */
  join(token: string, name: string, socketId: string): number {
    this.lastActivity = Date.now();
    const existing = this.seatOf(token);
    if (existing >= 0) {
      const seat = this.seats[existing]!;
      seat.socketId = socketId;
      seat.autoplay = false;
      seat.name = name || seat.name;
      this.reassignHost();
      this.schedule(); // cancel any pending autoplay move for this seat
      return existing;
    }
    if (this.game) throw new RuleError('A game is already in progress in this room');
    if (this.seatedCount >= this.info.maxPlayers) throw new RuleError('This room is full');
    const free = this.seats.findIndex((s) => s === null);
    this.seats[free] = { token, name, bot: false, autoplay: false, socketId };
    if (!this.hostToken) this.hostToken = token;
    return free;
  }

  disconnect(socketId: string): void {
    const i = this.seats.findIndex((s) => s?.socketId === socketId);
    if (i < 0) return;
    if (this.game) this.seats[i]!.socketId = null;
    else this.seats[i] = null;
    this.reassignHost();
  }

  leave(token: string): void {
    const i = this.seatOf(token);
    if (i < 0) return;
    if (this.game) {
      // Mid-game: the computer finishes the game for them.
      const seat = this.seats[i]!;
      seat.socketId = null;
      seat.autoplay = true;
      seat.token = `left-${seat.token}`;
      this.reassignHost();
      this.schedule();
    } else {
      this.seats[i] = null;
      this.reassignHost();
    }
  }

  private reassignHost(): void {
    const host = this.hostToken ? this.seats[this.seatOf(this.hostToken)] : null;
    if (host?.socketId) return;
    const next = this.seats.find((s) => s && !s.bot && s.socketId);
    this.hostToken = next?.token ?? null;
  }

  addBot(token: string): void {
    this.requireHost(token);
    if (this.game || this.seatedCount >= this.info.maxPlayers) return;
    const free = this.seats.findIndex((s) => s === null);
    const used = new Set(this.seats.map((s) => s?.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${free + 1}`;
    this.seats[free] = { token: `bot-${free}-${Date.now()}`, name, bot: true, autoplay: false, socketId: null };
  }

  removeSeat(token: string, index: number): void {
    this.requireHost(token);
    if (this.game || !this.seats[index] || this.seats[index]!.token === token) return;
    this.seats[index] = null;
  }

  setGame(token: string, type: GameType): void {
    this.requireHost(token);
    if (this.game || !GAMES[type] || type === this.gameType) return;
    this.gameType = type;
    this.totalRounds = GAMES[type].defaultRounds;
    // Drop bots first, then the latest-seated humans, if the new game has fewer seats.
    while (this.seatedCount > GAMES[type].maxPlayers) {
      const bot = this.seats.map((s, i) => (s?.bot ? i : -1)).filter((i) => i >= 0).pop();
      const victim = bot ?? this.seats.map((s, i) => (s && s.token !== this.hostToken ? i : -1)).filter((i) => i >= 0).pop()!;
      this.seats[victim] = null;
    }
  }

  setRounds(token: string, rounds: number): void {
    this.requireHost(token);
    if (this.game || !this.info.roundOptions.includes(rounds)) return;
    this.totalRounds = rounds;
  }

  start(token: string): void {
    this.requireHost(token);
    if (this.game) throw new RuleError('Game already started');
    const players = this.seats.filter((s): s is Seat => s !== null);
    const { minPlayers, maxPlayers, name } = this.info;
    if (players.length < minPlayers) {
      throw new RuleError(
        minPlayers === maxPlayers
          ? `${name} needs exactly ${minPlayers} players — add bots to fill empty seats`
          : `${name} needs at least ${minPlayers} players`,
      );
    }
    this.seats = players; // compact: seat index == player index in the game
    this.game = this.engine.create(players.length, this.totalRounds);
    this.dealtAt = Date.now();
    this.schedule();
  }

  act(token: string, action: GameAction): void {
    const game = this.requireGame();
    if (game.phase === 'roundEnd' || game.phase === 'gameOver') throw new RuleError('The round is over');
    this.engine.act(game, this.requireSeat(token), action);
    this.schedule();
  }

  nextRound(token: string): void {
    this.requireHost(token);
    const game = this.requireGame();
    if (game.phase !== 'roundEnd') return;
    this.engine.nextRound(game);
    this.dealtAt = Date.now();
    this.schedule();
  }

  /** Let the host hand a disconnected player's seat to the computer. */
  takeOver(token: string, index: number): void {
    this.requireHost(token);
    const seat = this.seats[index];
    if (!this.game || !seat || seat.bot || seat.socketId) return;
    seat.autoplay = true;
    this.schedule();
  }

  newGame(token: string): void {
    this.requireHost(token);
    if (this.game?.phase !== 'gameOver') return;
    this.game = null;
    // Drop players who left so new friends can sit down, and reopen all seats.
    const keep = this.seats.filter((s) => s && (s.bot || s.socketId));
    this.seats = [...keep, ...Array(MAX_SEATS - keep.length).fill(null)];
  }

  /** Advance anything that doesn't need a human: timed steps and bot turns. */
  schedule(): void {
    this.lastActivity = Date.now();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const game = this.game;
    if (!game) return;

    const step = this.engine.auto(game);
    if (step) {
      this.timer = setTimeout(() => this.runStep(step.run), step.delayMs);
      return;
    }

    const botSeats = this.engine.waitingOn(game).filter((i) => this.seats[i]?.bot || this.seats[i]?.autoplay);
    if (botSeats.length === 0) return;
    const delay = Math.max(BOT_DELAY_MS, this.dealtAt + this.info.dealAnimMs - Date.now());
    this.timer = setTimeout(
      () =>
        this.runStep(() => {
          for (const seat of botSeats) this.engine.act(game, seat, this.engine.bot(game, seat));
        }),
      delay,
    );
  }

  private runStep(fn: () => void): void {
    this.timer = null;
    try {
      fn();
    } catch (err) {
      console.error(`[room ${this.code}] automatic step failed`, err);
    }
    this.broadcast(this);
    this.schedule();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  viewFor(token: string): RoomView {
    const mySeat = this.seatOf(token);
    const seats: (SeatInfo | null)[] = (this.game ? this.seats : this.seats.slice(0, this.info.maxPlayers)).map(
      (s) => (s ? { name: s.name, bot: s.bot, autoplay: s.autoplay, connected: s.bot || !!s.socketId } : null),
    );
    return {
      code: this.code,
      mySeat,
      hostSeat: this.hostToken ? this.seatOf(this.hostToken) : -1,
      seats,
      gameType: this.gameType,
      totalRounds: this.totalRounds,
      game: this.game && this.engine.view(this.game, mySeat),
    };
  }

  private requireHost(token: string): void {
    if (!this.isHost(token)) throw new RuleError('Only the host can do that');
  }

  private requireGame(): BaseState {
    if (!this.game) throw new RuleError('No game in progress');
    return this.game;
  }

  private requireSeat(token: string): number {
    const i = this.seatOf(token);
    if (i < 0) throw new RuleError("You're not seated in this room");
    return i;
  }
}
