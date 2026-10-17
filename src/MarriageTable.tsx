import { useState } from 'react';
import { Card, cardId, sortHand } from '../shared/cards.ts';
import { maalLabel, type MarriageView } from '../shared/marriage.ts';
import type { RoomView } from '../shared/protocol.ts';
import { CardBack, CardView, MiniCards } from './CardView.tsx';
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

type SortMode = 'suit' | 'rank';

export function MarriageTable({ view, onLeave, onError }: TableProps) {
  const g = view.game as MarriageView;
  const me = view.mySeat;
  const n = view.seats.length;
  const name = (s: number) => view.seats[s]?.name ?? '—';
  const myTurn = g.turn === me;
  const seen = g.seen[me];
  const [showScores, setShowScores] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('suit');
  const { sel, setSel, toggle, has } = useSelection(g.hand);
  const fresh = useNewCards(g.hand);

  const tiplu = g.tiplu;
  const badge = (c: Card) => (tiplu ? maalLabel(c, tiplu) : null);
  const hand = sortMode === 'suit' ? sortHand(g.hand) : g.hand.slice().sort((a, b) => b.rank - a.rank || a.suit.localeCompare(b.suit));

  const act = (a: Parameters<typeof sendAction>[0]) => sendAction(a, onError, () => setSel([]));

  let status: string;
  if (g.phase === 'roundEnd' || g.phase === 'gameOver') status = `${name(g.result!.winner)} finished the round!`;
  else if (!myTurn) status = `${name(g.turn)} is ${g.phase === 'draw' ? 'drawing' : 'thinking'}…`;
  else if (g.phase === 'draw') status = 'Your turn — draw from the deck or take the discard';
  else if (!seen) status = 'Discard a card, or show 3 pure sets to see the joker';
  else status = 'Discard a card — or select one to throw and Finish';

  return (
    <main className="table">
      <TopBar view={view} onLeave={onLeave} onScores={() => setShowScores(true)} />

      <section className="felt ring">
        {Array.from({ length: n }, (_, seat) => seat)
          .filter((s) => s !== me)
          .map((seat) => {
            const rel = (seat - me + n) % n;
            return (
              <PlayerBadge
                key={seat}
                view={view}
                seat={seat}
                active={g.turn === seat}
                style={ringPosition(rel, n)}
                sub={g.seen[seat] ? 'seen ✓' : `${g.handCounts[seat]} cards`}
              >
                <MiniHand count={g.handCounts[seat]} />
                {g.shown[seat].length > 0 && <ShownSets sets={g.shown[seat]} badge={badge} />}
              </PlayerBadge>
            );
          })}

        <div className="center-piles">
          <button
            className="pile"
            disabled={!(myTurn && g.phase === 'draw')}
            onClick={() => act({ type: 'draw', from: 'deck' })}
            aria-label="Draw from deck"
          >
            <CardBack label={String(g.deckCount)} />
            <span className="pile-label">Deck</span>
          </button>
          <div className="pile">
            {tiplu ? <CardView card={tiplu} badge="Tiplu" /> : <CardBack label="?" />}
            <span className="pile-label">Joker</span>
          </div>
          <button
            className="pile"
            disabled={!(myTurn && g.phase === 'draw' && g.discardTop)}
            onClick={() => act({ type: 'draw', from: 'discard' })}
            aria-label="Take the discard"
          >
            {g.discardTop ? <CardView card={g.discardTop} badge={badge(g.discardTop)} /> : <div className="card empty" />}
            <span className="pile-label">Discard</span>
          </button>
        </div>

        <div className="status">{status}</div>
      </section>

      {g.shown[me].length > 0 && (
        <div className="my-shown">
          <span className="small">Shown:</span>
          <ShownSets sets={g.shown[me]} badge={badge} />
        </div>
      )}

      {myTurn && g.phase === 'discard' && (
        <div className="action-bar">
          <button disabled={sel.length !== 1} onClick={() => act({ type: 'discard', card: sel[0] })}>
            Discard
          </button>
          {!seen && (
            <button
              className="primary"
              onClick={() => act({ type: 'show', cards: sel.length === 9 ? sel : undefined })}
              title="Select 9 cards, or let the game find 3 pure sets for you"
            >
              Show 3 sets{sel.length === 9 ? '' : ' (auto)'}
            </button>
          )}
          {seen && (
            <button className="primary" disabled={sel.length !== 1} onClick={() => act({ type: 'finish', card: sel[0] })}>
              Finish
            </button>
          )}
          <span className="muted small">{sel.length ? `${sel.length} selected` : 'tap cards to select'}</span>
        </div>
      )}

      <div className="hand-tools">
        <button className="small link" onClick={() => setSortMode(sortMode === 'suit' ? 'rank' : 'suit')}>
          Sort by {sortMode === 'suit' ? 'rank' : 'suit'}
        </button>
        {seen && <span className="small">Jokers are marked</span>}
      </div>

      <FanHand
        cards={hand}
        perRow={11}
        isSelected={has}
        isNew={(c) => fresh.has(cardId(c))}
        badge={badge}
        onCard={toggle}
      />

      <ScoreBoard
        view={view}
        open={showScores}
        onClose={() => setShowScores(false)}
        onLeave={onLeave}
        summary={g.result && <MarriageSummary view={view} />}
      />
    </main>
  );
}

function ShownSets({ sets, badge }: { sets: Card[][]; badge: (c: Card) => string | null }) {
  return (
    <div className="shown-sets">
      {sets.map((set, i) => (
        <MiniCards key={i} cards={set} badge={badge} />
      ))}
    </div>
  );
}

function MarriageSummary({ view }: { view: RoomView }) {
  const g = view.game as MarriageView;
  const r = g.result!;
  return (
    <>
      {g.tiplu && (
        <div className="row center">
          <span className="small">Tiplu was</span>
          <MiniCards cards={[g.tiplu]} />
        </div>
      )}
      <table className="scores compact">
        <thead>
          <tr>
            <th>Player</th>
            <th>Seen</th>
            <th>Maal</th>
            <th>Round</th>
          </tr>
        </thead>
        <tbody>
          {view.seats.map((s, i) => (
            <tr key={i} className={i === r.winner ? 'winner' : ''}>
              <td>
                {s?.name}
                {i === r.winner && ' 🏆'}
              </td>
              <td>{r.seen[i] ? '✓' : '—'}</td>
              <td>{r.seen[i] ? r.maal[i] : '—'}</td>
              <td className={r.net[i] < 0 ? 'neg' : ''}>{r.net[i] > 0 ? `+${r.net[i]}` : r.net[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small muted center">Winning sets</div>
      <div className="shown-sets center">
        {[...g.shown[r.winner], ...r.winningSets].map((set, i) => (
          <MiniCards key={i} cards={set} badge={(c) => (g.tiplu ? maalLabel(c, g.tiplu) : null)} />
        ))}
      </div>
    </>
  );
}
