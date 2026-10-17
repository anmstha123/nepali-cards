import { useState } from 'react';
import { Card, cardId } from '../shared/cards.ts';
import { CAUGHT_PENALTY, SHOW_LIMIT, handTotal, isValidThrow, type DhumbalView } from '../shared/dhumbal.ts';
import type { RoomView } from '../shared/protocol.ts';
import { CardBack, MiniCards } from './CardView.tsx';
import {
  FanHand,
  MiniHand,
  PlayerBadge,
  ScoreBoard,
  TableProps,
  TopBar,
  ringPosition,
  sendAction,
  useNewCards,
  useSelection,
} from './common.tsx';

export function DhumbalTable({ view, onLeave, onError }: TableProps) {
  const g = view.game as DhumbalView;
  const me = view.mySeat;
  const n = view.seats.length;
  const name = (s: number) => view.seats[s]?.name ?? '—';
  const myTurn = g.turn === me;
  const [showScores, setShowScores] = useState(false);
  const { sel, setSel, toggle, has } = useSelection(g.hand);
  const fresh = useNewCards(g.hand);
  const selected = g.hand.filter(has);
  const canThrow = myTurn && g.phase === 'throw' && isValidThrow(selected) && selected.length < g.hand.length;

  const act = (a: Parameters<typeof sendAction>[0]) => sendAction(a, onError, () => setSel([]));
  const pickable = myTurn && g.phase === 'pick';

  let status: string;
  if (g.result) {
    const r = g.result;
    status = r.caught ? `${name(r.caller)} called Jhyap — caught by ${name(r.catcher)}!` : `${name(r.caller)} called Jhyap and won!`;
  } else if (!myTurn) status = `${name(g.turn)} is ${g.phase === 'throw' ? 'throwing' : 'picking'}…`;
  else if (g.phase === 'throw') status = g.canShow ? 'Throw cards — or call Jhyap!' : 'Select cards to throw';
  else status = 'Pick a card from the previous throw, or draw from the deck';

  return (
    <main className="table">
      <TopBar view={view} onLeave={onLeave} onScores={() => setShowScores(true)} />

      <section className="felt ring">
        {Array.from({ length: n }, (_, seat) => seat)
          .filter((s) => s !== me)
          .map((seat) => (
            <PlayerBadge
              key={seat}
              view={view}
              seat={seat}
              active={g.turn === seat}
              style={ringPosition((seat - me + n) % n, n)}
              sub={g.result ? `${handTotal(g.result.hands[seat])} pts` : `${g.handCounts[seat]} cards`}
            >
              {g.result ? <MiniCards cards={g.result.hands[seat]} /> : <MiniHand count={g.handCounts[seat]} />}
            </PlayerBadge>
          ))}

        <div className="center-piles">
          <button className="pile" disabled={!pickable} onClick={() => act({ type: 'pick', card: null })}>
            <CardBack label={String(g.deckCount)} />
            <span className="pile-label">Draw</span>
          </button>
          <div className="pile throw-pile">
            {g.available && g.available.cards.length > 0 ? (
              <MiniCards
                cards={g.available.cards}
                playable={pickable}
                onClick={pickable ? (c: Card) => act({ type: 'pick', card: cardId(c) }) : undefined}
              />
            ) : (
              <div className="card sm empty" />
            )}
            <span className="pile-label">
              {g.available && g.available.seat >= 0 ? `${name(g.available.seat)} threw` : 'Pick from'}
            </span>
          </div>
          {g.thrown && (
            <div className="pile throw-pile">
              <MiniCards cards={g.thrown.cards} />
              <span className="pile-label">{name(g.thrown.seat)} threw</span>
            </div>
          )}
        </div>

        <div className="status">{status}</div>
      </section>

      {myTurn && g.phase === 'throw' && (
        <div className="action-bar">
          <button className="primary" disabled={!canThrow} onClick={() => act({ type: 'throw', cards: sel })}>
            Throw {selected.length > 1 ? `${selected.length} cards` : ''}
          </button>
          <button className="jhyap" disabled={!g.canShow} onClick={() => act({ type: 'show' })}>
            Jhyap!
          </button>
          <span className="muted small">
            {g.canShow ? 'You can call' : `Call at ${SHOW_LIMIT} or less`}
          </span>
        </div>
      )}

      <div className="hand-tools">
        <span className="small">
          Your hand: <b>{g.myTotal}</b> points
        </span>
      </div>

      <FanHand
        cards={g.hand}
        isSelected={has}
        isNew={(c) => fresh.has(cardId(c))}
        onCard={myTurn && g.phase === 'throw' ? toggle : undefined}
      />

      <ScoreBoard
        view={view}
        open={showScores}
        onClose={() => setShowScores(false)}
        onLeave={onLeave}
        summary={g.result && <DhumbalSummary view={view} />}
      />
    </main>
  );
}

function DhumbalSummary({ view }: { view: RoomView }) {
  const g = view.game as DhumbalView;
  const r = g.result!;
  const name = (s: number) => view.seats[s]?.name ?? '—';
  return (
    <>
      <p className="center">
        {r.caught
          ? `${name(r.caller)} called Jhyap with ${r.totals[r.caller]} but ${name(r.catcher)} had ${r.totals[r.catcher]} (+${CAUGHT_PENALTY} penalty).`
          : `${name(r.caller)} called Jhyap with ${r.totals[r.caller]} — lowest hand!`}
      </p>
      <div className="reveal-list">
        {view.seats.map((s, i) => (
          <div key={i} className="row">
            <span className="reveal-name">{s?.name}</span>
            <MiniCards cards={r.hands[i]} />
            <span className="small">{r.totals[i]}</span>
          </div>
        ))}
      </div>
    </>
  );
}
