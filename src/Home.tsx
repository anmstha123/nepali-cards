import { FormEvent, useState } from 'react';
import { GAME_LIST } from '../shared/games.ts';
import { getSavedName, roomFromUrl } from './socket.ts';

export function Home({ onJoin }: { onJoin: (name: string, code?: string) => void }) {
  const [name, setName] = useState(getSavedName());
  const [code, setCode] = useState(roomFromUrl() ?? '');
  const invited = !!roomFromUrl();

  const submit = (e: FormEvent, create: boolean) => {
    e.preventDefault();
    if (!name.trim()) return;
    onJoin(name.trim(), create ? undefined : code.trim().toUpperCase());
  };

  return (
    <main className="home">
      <div className="panel">
        <h1>
          <span className="logo">♠</span> Taas
        </h1>
        <p className="muted">
          Play Callbreak, Marriage, Dhumbal and Kitti with friends — share a room code and go.
        </p>

        <form onSubmit={(e) => submit(e, !code.trim())}>
          <label>
            Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              placeholder="e.g. Anish"
              autoFocus
            />
          </label>

          {!invited && (
            <button type="button" className="primary" disabled={!name.trim()} onClick={(e) => submit(e, true)}>
              Create a new room
            </button>
          )}

          <div className="divider">{invited ? 'You were invited to' : 'or join a friend'}</div>

          <div className="row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="ROOM CODE"
              className="code-input"
            />
            <button type="submit" className={invited ? 'primary' : ''} disabled={!name.trim() || code.trim().length !== 4}>
              Join
            </button>
          </div>
        </form>
      </div>
      <Rules />
    </main>
  );
}

function Rules() {
  return (
    <div className="panel rules">
      <b>Games</b>
      {GAME_LIST.map((g) => (
        <details key={g.type}>
          <summary>
            {g.name} <span className="muted small">— {g.tagline}</span>
          </summary>
          <ul>
            {g.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
