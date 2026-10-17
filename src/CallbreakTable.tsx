import { useEffect, useRef, useState } from 'react';
import { MAX_BID, MIN_BID, type CallbreakView } from '../shared/callbreak.ts';
import { cardId } from '../shared/cards.ts';
import { CardView } from './CardView.tsx';
import { FanHand, MiniHand, PlayerBadge, ScoreBoard, TableProps, TopBar, sendAction } from './common.tsx';

/** Screen position of each seat relative to me: 0 = bottom (me), then clockwise. */
const POSITIONS = ['bottom', 'left', 'top', 'right'] as const;

export function CallbreakTable({ view, onLeave, onError }: TableProps) {
  const game = view.game as CallbreakView;
  const me = view.mySeat;
  const rel = (seat: number) => (seat - me + 4) % 4;
  const name = (seat: number) => view.seats[seat]?.name ?? '—';
  const [showScores, setShowScores] = useState(false);
  const dealt = useDealAnimation(game);
  const dealing = dealt !== null;
  const shownCount = (seat: number) => (dealing ? dealtTo(seat, game.dealer, dealt) : game.handCounts[seat]);
  const legal = new Set(game.legal);
  const myTurn = game.phase === 'playing' && game.turn === me;

  const status = dealing ? `${name(game.dealer)} is dealing…` : statusText(game, me, name);

  return (
    <main className="table">
      <TopBar view={view} onLeave={onLeave} onScores={() => setShowScores(true)} />

      <section className="felt">
        <span className="trump-chip">♠ trump</span>
        {[0, 1, 2, 3].map((seat) => {
          const pos = POSITIONS[rel(seat)];
          const bid = game.bids[seat];
          return (
            <PlayerBadge
              key={seat}
              view={view}
              seat={seat}
              active={game.turn === seat}
              className={`cb ${pos}`}
              sub={bid === null ? (game.phase === 'bidding' ? 'bidding…' : '') : `${game.tricksWon[seat]} / ${bid}`}
            >
              {pos !== 'bottom' && <MiniHand count={shownCount(seat)} />}
            </PlayerBadge>
          );
        })}

        <div className="trick">
          {game.trick.map((p) => (
            <CardView key={cardId(p.card)} card={p.card} className={`played ${POSITIONS[rel(p.seat)]}`} />
          ))}
          {game.trick.length === 0 && game.lastTrick && game.phase === 'playing' && (
            <div className="last-trick muted small">{name(game.lastTrick.winner)} won the last trick</div>
          )}
        </div>

        <div className="status">{status}</div>

        {dealing && <DealLayer dealer={game.dealer} position={(seat) => POSITIONS[rel(seat)]} />}
      </section>

      {game.phase === 'bidding' && game.turn === me && !dealing && (
        <div className="action-bar">
          <span>Your bid:</span>
          {Array.from({ length: MAX_BID - MIN_BID + 1 }, (_, i) => i + MIN_BID).map((n) => (
            <button key={n} className="bid" onClick={() => sendAction({ type: 'bid', bid: n }, onError)}>
              {n}
            </button>
          ))}
        </div>
      )}

      <FanHand
        cards={game.hand.slice(0, shownCount(me))}
        isPlayable={(c) => myTurn && legal.has(cardId(c))}
        isDimmed={(c) => myTurn && !legal.has(cardId(c))}
        onCard={(c) => sendAction({ type: 'play', card: cardId(c) }, onError)}
      />

      <ScoreBoard
        view={view}
        open={showScores}
        onClose={() => setShowScores(false)}
        onLeave={onLeave}
        summary={view.seats.map((s, i) => `${s?.name}: ${game.tricksWon[i]}/${game.bids[i]}`).join(' · ')}
      />
    </main>
  );
}

function statusText(game: CallbreakView, me: number, name: (s: number) => string): string {
  if (game.phase === 'bidding') return game.turn === me ? 'Your turn to bid' : `${name(game.turn)} is bidding…`;
  if (game.phase === 'playing') {
    if (game.turn === -1) return '';
    return game.turn === me ? 'Your turn — tap a card' : `${name(game.turn)}'s turn`;
  }
  return '';
}

// ---------- Deal animation ----------
// Keep in sync with GAMES.callbreak.dealAnimMs (bots wait for the deal to finish).
const DEAL_STEP_MS = 35;
const DEAL_FLIGHT_MS = 380;
const DECK_SIZE = 52;

/** How many of the first `k` dealt cards went to `seat` (dealing starts left of the dealer). */
function dealtTo(seat: number, dealer: number, k: number): number {
  const offset = (seat - dealer - 1 + 8) % 4;
  return Math.max(0, Math.ceil((k - offset) / 4));
}

/** Returns how many cards have landed so far while a fresh hand is being dealt, or null when not dealing. */
function useDealAnimation(game: CallbreakView): number | null {
  const fresh =
    game.phase === 'bidding' && game.bids.every((b) => b === null) && game.handCounts.every((c) => c === 13);
  const key = fresh ? game.round : null;
  const [landed, setLanded] = useState<number | null>(null);
  const played = useRef<number | null>(null);

  useEffect(() => {
    if (key === null || played.current === key) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    played.current = key;
    const t0 = performance.now();
    setLanded(0);
    const id = setInterval(() => {
      const k = Math.floor((performance.now() - t0 - DEAL_FLIGHT_MS) / DEAL_STEP_MS) + 1;
      if (k >= DECK_SIZE) {
        clearInterval(id);
        setLanded(null);
      } else setLanded(Math.max(0, k));
    }, 30);
    return () => {
      clearInterval(id);
      played.current = null;
      setLanded(null);
    };
  }, [key]);

  return landed;
}

function DealLayer({ dealer, position }: { dealer: number; position: (seat: number) => string }) {
  return (
    <div className="deal-layer" aria-hidden>
      {Array.from({ length: DECK_SIZE }, (_, i) => (
        <span
          key={i}
          className={`deal-card ${position((dealer + 1 + i) % 4)}`}
          style={{ animationDelay: `${i * DEAL_STEP_MS}ms`, animationDuration: `${DEAL_FLIGHT_MS}ms`, zIndex: DECK_SIZE - i }}
        />
      ))}
    </div>
  );
}
