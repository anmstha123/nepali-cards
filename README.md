# Taas · Nepali Card Games

Play **Callbreak, Marriage, Dhumbal and Kitti** online with friends. Create a room, pick a game,
share the link, and fill empty seats with bots.

| Game | Players | Notes |
|---|---|---|
| Callbreak | 4 | Bid & take tricks, spades trump |
| Marriage | 2–5 | 21 cards, 3 decks, Tiplu jokers & maal |
| Dhumbal (Jhyap) | 2–6 | Throw sets, lowest hand wins |
| Kitti | 2–5 | 9 cards split into three Teen Patti hands |

Rules as implemented are shown in the app (lobby → "How to play") and live in `shared/games.ts`.

## Run locally

```sh
npm install
npm run dev        # client on http://localhost:5173, server on :3001 (hot reload)
```

Friends on the same Wi-Fi can join at `http://<your-PC-IP>:5173` (Vite prints the Network URL).

Production mode (one port):

```sh
npm run build
npm start          # serves the game at http://localhost:3001
```

## Deploy (free, so friends anywhere can play)

Any Node host with WebSocket support works. On **Render**: New → Web Service → connect the repo,
build command `npm install --include=dev && npm run build`, start command `npm start`.
Rooms are kept in memory (no database), so a restart ends games in progress.

## Project layout

```
shared/engine.ts      Engine interface every game implements
shared/games.ts       game catalogue: names, player counts, rules text, scoring format
shared/callbreak.ts   \
shared/marriage.ts     |  rules engines + bots (pure, unit-tested)
shared/dhumbal.ts      |
shared/kitti.ts       /
shared/registry.ts    game type → engine
server/rooms.ts       rooms, seats, reconnects, bot turns, per-player views (hides others' cards)
server/index.ts       Express + Socket.IO server
src/                  React client: Home → Lobby → <Game>Table
scripts/smoke.ts      end-to-end test of every game: `npx tsx scripts/smoke.ts [url]` against a running server
```

## Adding another game

1. Write `shared/<game>.ts` exporting an `Engine` (create / act / auto / waitingOn / bot / nextRound / view).
2. Add it to `GameType` + `GAMES` in `shared/games.ts` and to `shared/registry.ts`.
3. Add its view/action types to `shared/protocol.ts` and a `src/<Game>Table.tsx`.

## Tests

```sh
npm test           # rules + bot-only full games for every game
```
