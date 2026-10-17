import { ReactNode, useEffect, useState } from 'react';
import { Card, cardId } from '../shared/cards.ts';
import { GAMES, formatScore } from '../shared/games.ts';
import type { GameAction, GameView, RoomView } from '../shared/protocol.ts';
import { CardView } from './CardView.tsx';
import { socket } from './socket.ts';

export interface TableProps {
  view: RoomView;
  onLeave: () => void;
  onError: (msg: string) => void;
}

export function sendAction(action: GameAction, onError: (msg: string) => void, onOk?: () => void): void {
  socket.emit('act', action, (res) => {
    if (res.ok) onOk?.();
    else onError(res.error);
  });
}

export function totals(scores: number[][], n: number): number[] {
  return Array.from({ length: n }, (_, i) => scores.reduce((sum, row) => sum + (row[i] ?? 0), 0));
}

export function useWidth(): number {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export function TopBar({ view, onLeave, onScores }: { view: RoomView; onLeave: () => void; onScores: () => void }) {
  const g = view.game!;
  const info = GAMES[view.gameType];
  return (
    <header className="topbar">
      <span>
        <b>{info.name}</b> · {view.code} · Round {g.round}/{g.totalRounds}
      </span>
      <span className="topbar-actions">
        <button className="small" onClick={onScores}>
          Scores
        </button>
        <button
          className="small link"
          onClick={() => {
            if (confirm('Leave the game? The computer will play your seat.')) onLeave();
          }}
        >
          Leave
        </button>
      </span>
    </header>
  );
}

/** Screen position (% of the felt) for each opponent, spread over the top arc; me at the bottom. */
export function ringPosition(rel: number, n: number): { left: string; top: string } {
  const others = n - 1;
  const theta = Math.PI - (rel * Math.PI) / (others + 1);
  return { left: `${50 + 40 * Math.cos(theta)}%`, top: `${48 - 38 * Math.sin(theta)}%` };
}

export function PlayerBadge({
  view,
  seat,
  active,
  sub,
  children,
  style,
  className = '',
}: {
  view: RoomView;
  seat: number;
  active: boolean;
  sub?: ReactNode;
  children?: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  const s = view.seats[seat];
  const g = view.game!;
  const isHost = view.mySeat === view.hostSeat;
  return (
    <div className={`badge-player ${active ? 'active' : ''} ${className}`} style={style}>
      <div className="pname">
        {s?.name}
        {'dealer' in g && seat === g.dealer && (
          <span className="dealer" title="Dealer">
            D
          </span>
        )}
      </div>
      {sub && <div className="pstats">{sub}</div>}
      {s && !s.connected && (
        <div className="offline">
          {s.autoplay ? 'bot playing' : 'offline'}
          {isHost && !s.autoplay && (
            <button className="link small" onClick={() => socket.emit('takeOver', seat)}>
              let bot play
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function MiniHand({ count }: { count: number }) {
  return (
    <div className="mini-hand" aria-label={`${count} cards`}>
      {Array.from({ length: Math.min(count, 13) }, (_, i) => (
        <span key={i} className="back" />
      ))}
      {count > 13 && <span className="more">{count}</span>}
    </div>
  );
}

/** The player's own cards, overlapped to fit the screen, wrapping into rows for big hands. */
export function FanHand({
  cards,
  isPlayable,
  isSelected,
  isDimmed,
  badge,
  isNew,
  onCard,
  perRow = 13,
}: {
  cards: Card[];
  isPlayable?: (c: Card) => boolean;
  isSelected?: (c: Card) => boolean;
  isDimmed?: (c: Card) => boolean;
  badge?: (c: Card) => string | null;
  isNew?: (c: Card) => boolean;
  onCard?: (c: Card) => void;
  perRow?: number;
}) {
  const width = useWidth();
  const cardW = width < 600 ? 52 : 72;
  const rows: Card[][] = [];
  const rowCount = Math.max(1, Math.ceil(cards.length / perRow));
  const per = Math.ceil(cards.length / rowCount);
  for (let i = 0; i < cards.length; i += per) rows.push(cards.slice(i, i + per));
  const avail = Math.min(width - 32, 900);

  return (
    <div className="hand" style={{ ['--card-w' as string]: `${cardW}px` }}>
      {rows.map((row, r) => {
        const step = Math.min(cardW + 6, (avail - cardW) / Math.max(row.length - 1, 1));
        return (
          <div className="hand-row" key={r}>
            {row.map((c, i) => (
              <CardView
                key={cardId(c)}
                card={c}
                playable={isPlayable ? isPlayable(c) : undefined}
                selected={isSelected?.(c)}
                dimmed={isDimmed?.(c)}
                badge={badge?.(c)}
                className={isNew?.(c) ? 'new' : ''}
                onClick={onCard ? () => onCard(c) : undefined}
                style={{ marginLeft: i === 0 ? 0 : step - cardW }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Scoreboard modal. Pops up automatically when a round ends; can be dismissed to look at the table. */
export function ScoreBoard({
  view,
  open,
  onClose,
  summary,
  onLeave,
}: {
  view: RoomView;
  open: boolean;
  onClose: () => void;
  summary?: ReactNode;
  onLeave: () => void;
}) {
  const game = view.game as GameView;
  const info = GAMES[view.gameType];
  const n = view.seats.length;
  const over = game.phase === 'roundEnd' || game.phase === 'gameOver';
  const isHost = view.mySeat === view.hostSeat;
  const tot = totals(game.scores, n);
  const best = info.lowerIsBetter ? Math.min(...tot) : Math.max(...tot);
  const [dismissedRound, setDismissedRound] = useState<string | null>(null);
  const roundKey = `${game.round}-${game.phase}`;
  const show = open || (over && dismissedRound !== roundKey);

  const footer =
    game.phase === 'roundEnd' ? (
      isHost ? (
        <button className="primary" onClick={() => socket.emit('nextRound')}>
          Deal round {game.round + 1}
        </button>
      ) : (
        <p className="muted center">Waiting for the host to deal the next round…</p>
      )
    ) : game.phase === 'gameOver' ? (
      <>
        {isHost ? (
          <button className="primary" onClick={() => socket.emit('newGame')}>
            Back to lobby
          </button>
        ) : (
          <p className="muted center">Waiting for the host…</p>
        )}
        <button className="link center" onClick={onLeave}>
          Leave room
        </button>
      </>
    ) : null;

  if (!show) {
    return over ? (
      <div className="round-bar">
        <span>{game.phase === 'gameOver' ? 'Game over' : `Round ${game.round} finished`}</span>
        <button className="primary small" onClick={() => setDismissedRound(null)}>
          Results
        </button>
      </div>
    ) : null;
  }

  const close = () => {
    if (over) setDismissedRound(roundKey);
    onClose();
  };

  const title =
    game.phase === 'gameOver'
      ? `🏆 ${view.seats
          .map((s, i) => (tot[i] === best ? s?.name : null))
          .filter(Boolean)
          .join(' & ')} wins!`
      : game.phase === 'roundEnd'
        ? `Round ${game.round} complete`
        : 'Scoreboard';

  return (
    <div className="modal-bg" onClick={close}>
      <div className="panel modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {over && summary && <div className="summary">{summary}</div>}
        <div className="score-scroll">
          <table className="scores">
            <thead>
              <tr>
                <th>Rnd</th>
                {view.seats.map((s, i) => (
                  <th key={i} className={i === view.mySeat ? 'me' : ''}>
                    {s?.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {game.scores.map((row, r) => (
                <tr key={r}>
                  <td>{r + 1}</td>
                  {row.map((v, i) => (
                    <td key={i} className={v < 0 ? 'neg' : ''}>
                      {formatScore(view.gameType, v)}
                    </td>
                  ))}
                </tr>
              ))}
              {game.scores.length === 0 && (
                <tr>
                  <td colSpan={n + 1} className="muted">
                    No rounds finished yet
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                {tot.map((v, i) => (
                  <td key={i} className={v === best && game.scores.length ? 'best' : ''}>
                    {formatScore(view.gameType, v)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        {info.lowerIsBetter && <p className="muted small center">Lowest total wins.</p>}
        {footer}
        <button className="link center" onClick={close}>
          {over ? 'View table' : 'Close'}
        </button>
      </div>
    </div>
  );
}

/** Keep a selection of card ids, dropping ids that leave the hand. */
export function useSelection(hand: Card[]) {
  const [sel, setSel] = useState<string[]>([]);
  const ids = hand.map(cardId).join(',');
  useEffect(() => {
    const present = new Set(ids.split(','));
    setSel((s) => s.filter((id) => present.has(id)));
  }, [ids]);
  const toggle = (c: Card) =>
    setSel((s) => (s.includes(cardId(c)) ? s.filter((x) => x !== cardId(c)) : [...s, cardId(c)]));
  return { sel, setSel, toggle, has: (c: Card) => sel.includes(cardId(c)) };
}

/** Ids that appeared in the hand since the last change (e.g. the card just drawn). */
export function useNewCards(hand: Card[]): Set<string> {
  const ids = hand.map(cardId);
  const key = ids.join(',');
  const [state, setState] = useState<{ prev: string; fresh: Set<string> }>({ prev: key, fresh: new Set() });
  if (state.prev !== key) {
    const old = new Set(state.prev.split(','));
    const fresh = new Set(ids.filter((id) => !old.has(id)));
    // A whole new deal isn't "new cards".
    setState({ prev: key, fresh: fresh.size > 3 ? new Set() : fresh });
  }
  return state.fresh;
}
