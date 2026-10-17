import { useEffect, useState } from 'react';
import { Card, cardId } from '../shared/cards.ts';
import { CATEGORY_NAMES, autoArrange, rankHand, type KittiView } from '../shared/kitti.ts';
import { CardBack, CardView, MiniCards } from './CardView.tsx';
import { FanHand, ScoreBoard, TableProps, TopBar, sendAction } from './common.tsx';

export function KittiTable({ view, onLeave, onError }: TableProps) {
  const g = view.game as KittiView;
  const me = view.mySeat;
  const [showScores, setShowScores] = useState(false);

  return (
    <main className="table">
      <TopBar view={view} onLeave={onLeave} onScores={() => setShowScores(true)} />
      {g.phase === 'arrange' && !g.myArrangement ? (
        <Arranger key={g.round} hand={g.hand} view={view} onError={onError} />
      ) : (
        <Showdowns view={view} />
      )}
      <ScoreBoard
        view={view}
        open={showScores}
        onClose={() => setShowScores(false)}
        onLeave={onLeave}
        summary={
          <div className="center small">
            {g.showdowns.map((sd, i) => `Hand ${i + 1}: ${sd.winner === null ? 'tie' : view.seats[sd.winner]?.name}`).join(' · ')}
          </div>
        }
      />
      {g.phase === 'arrange' && g.myArrangement && (
        <p className="status-line">
          Waiting for{' '}
          {view.seats
            .filter((_, i) => !g.submitted[i] && i !== me)
            .map((s) => s?.name)
            .join(', ')}
          …
        </p>
      )}
    </main>
  );
}

function Arranger({ hand, view, onError }: { hand: Card[]; view: TableProps['view']; onError: (m: string) => void }) {
  const g = view.game as KittiView;
  const [slots, setSlots] = useState<Card[][]>([[], [], []]);
  const [target, setTarget] = useState(0);
  const placed = new Set(slots.flat());
  const loose = hand.filter((c) => !placed.has(c));
  const done = slots.every((s) => s.length === 3);

  // Keep the target on the first slot with room.
  useEffect(() => {
    if (slots[target].length === 3) {
      const next = slots.findIndex((s) => s.length < 3);
      if (next >= 0) setTarget(next);
    }
  }, [slots, target]);

  const place = (c: Card) => {
    const t = slots[target].length < 3 ? target : slots.findIndex((s) => s.length < 3);
    if (t < 0) return;
    setSlots(slots.map((s, i) => (i === t ? [...s, c] : s)));
  };
  const unplace = (c: Card) => setSlots(slots.map((s) => s.filter((x) => x !== c)));
  const auto = () => setSlots(autoArrange(hand));
  const submit = () =>
    sendAction({ type: 'arrange', groups: slots.map((s) => s.map(cardId)) }, onError);

  const ready = g.submitted.filter(Boolean).length;

  return (
    <section className="arranger">
      <p className="center">
        Arrange your 9 cards into three hands. Hand 1 plays first.{' '}
        <span className="muted small">
          ({ready}/{view.seats.length} ready)
        </span>
      </p>
      <div className="slots">
        {slots.map((s, i) => {
          const label = s.length === 3 ? CATEGORY_NAMES[rankHand(s).cat] : `${3 - s.length} more`;
          return (
            <div
              key={i}
              className={`slot ${target === i ? 'target' : ''}`}
              onClick={() => setTarget(i)}
              role="group"
              aria-label={`Hand ${i + 1}`}
            >
              <div className="slot-head">
                <b>Hand {i + 1}</b> <span className="small">{label}</span>
              </div>
              <div className="slot-cards">
                {s.map((c) => (
                  <CardView
                    key={cardId(c)}
                    card={c}
                    playable
                    onClick={() => unplace(c)}
                  />
                ))}
                {Array.from({ length: 3 - s.length }, (_, k) => (
                  <div key={k} className="card empty" />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="action-bar">
        <button onClick={auto}>Auto arrange</button>
        <button onClick={() => setSlots([[], [], []])}>Clear</button>
        <button className="primary" disabled={!done} onClick={submit}>
          Lock in
        </button>
      </div>
      <FanHand cards={loose} isPlayable={() => true} onCard={place} />
    </section>
  );
}

function Showdowns({ view }: { view: TableProps['view'] }) {
  const g = view.game as KittiView;
  const me = view.mySeat;
  const order = view.seats.map((_, i) => (i + me) % view.seats.length);
  const pts = (seat: number) => g.showdowns.filter((s) => s.winner === seat).length;

  return (
    <section className="showdowns">
      <div className="sd-grid" style={{ gridTemplateColumns: `auto repeat(${order.length}, 1fr)` }}>
        <div />
        {order.map((seat) => (
          <div key={seat} className="sd-head">
            {view.seats[seat]?.name}
            {seat === me && <span className="tag">you</span>}
            <div className="pstats">{g.phase === 'arrange' ? (g.submitted[seat] ? 'ready ✓' : 'arranging…') : `${pts(seat)} pts`}</div>
          </div>
        ))}
        {[0, 1, 2].map((k) => {
          const sd = g.showdowns[k];
          return (
            <Row key={k} k={k}>
              {order.map((seat) => {
                const mine = seat === me && g.myArrangement;
                if (sd) {
                  return (
                    <div key={seat} className={`sd-cell ${sd.winner === seat ? 'won' : ''}`}>
                      <MiniCards cards={sd.hands[seat]} />
                      <span className="small">{CATEGORY_NAMES[sd.ranks[seat].cat]}</span>
                    </div>
                  );
                }
                return (
                  <div key={seat} className="sd-cell">
                    {mine ? (
                      <MiniCards cards={g.myArrangement![k]} />
                    ) : (
                      <div className="mini-cards">
                        <CardBack size="sm" />
                        <CardBack size="sm" />
                        <CardBack size="sm" />
                      </div>
                    )}
                  </div>
                );
              })}
            </Row>
          );
        })}
      </div>
      {g.phase === 'reveal' && <p className="status-line">Revealing hand {g.showdowns.length + 1}…</p>}
    </section>
  );
}

function Row({ k, children }: { k: number; children: React.ReactNode }) {
  return (
    <>
      <div className="sd-label">Hand {k + 1}</div>
      {children}
    </>
  );
}
