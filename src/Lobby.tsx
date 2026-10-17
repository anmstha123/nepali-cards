import { useState } from 'react';
import { GAMES, GAME_LIST } from '../shared/games.ts';
import type { RoomView } from '../shared/protocol.ts';
import { socket } from './socket.ts';

interface Props {
  view: RoomView;
  onLeave: () => void;
  onError: (msg: string) => void;
}

export function Lobby({ view, onLeave, onError }: Props) {
  const isHost = view.mySeat === view.hostSeat;
  const info = GAMES[view.gameType];
  const seated = view.seats.filter(Boolean).length;
  const full = seated >= info.maxPlayers;
  const canStart = seated >= info.minPlayers;
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}?room=${view.code}`;

  const copy = async () => {
    try {
      if (navigator.share && /Mobi/.test(navigator.userAgent)) {
        await navigator.share({ title: `Play ${info.name} with me`, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this link:', link);
    }
  };

  const start = () =>
    socket.emit('start', (res) => {
      if (!res.ok) onError(res.error);
    });

  const playersText =
    info.minPlayers === info.maxPlayers ? `${info.minPlayers} players` : `${info.minPlayers}–${info.maxPlayers} players`;

  return (
    <main className="home">
      <div className="panel">
        <div className="lobby-head">
          <div>
            <div className="muted small">Room code</div>
            <div className="room-code">{view.code}</div>
          </div>
          <button onClick={copy}>{copied ? 'Copied!' : 'Invite friends'}</button>
        </div>

        <div className="game-picker" role="radiogroup" aria-label="Game">
          {GAME_LIST.map((g) => (
            <button
              key={g.type}
              role="radio"
              aria-checked={g.type === view.gameType}
              className={`game-option ${g.type === view.gameType ? 'chosen' : ''}`}
              disabled={!isHost && g.type !== view.gameType}
              onClick={() => isHost && socket.emit('setGame', g.type)}
            >
              <b>{g.name}</b>
              <span className="small">{g.tagline}</span>
            </button>
          ))}
        </div>

        <details className="rules">
          <summary>
            How to play {info.name} <span className="muted small">({playersText})</span>
          </summary>
          <ul>
            {info.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>

        <ul className="seats">
          {view.seats.map((s, i) => (
            <li key={i} className={s ? '' : 'empty'}>
              <span>
                {s ? s.name : i < info.minPlayers ? 'Empty seat' : 'Empty seat (optional)'}
                {i === view.mySeat && <span className="tag">you</span>}
                {i === view.hostSeat && <span className="tag">host</span>}
                {s?.bot && <span className="tag">bot</span>}
              </span>
              {isHost && s && i !== view.mySeat && (
                <button className="link" onClick={() => socket.emit('removeSeat', i)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        {isHost ? (
          <>
            <div className="row">
              <button disabled={full} onClick={() => socket.emit('addBot')}>
                + Add bot
              </button>
              <label className="inline">
                Rounds
                <select value={view.totalRounds} onChange={(e) => socket.emit('setRounds', Number(e.target.value))}>
                  {info.roundOptions.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <button className="primary" disabled={!canStart} onClick={start}>
              {canStart
                ? `Start ${info.name} (${seated} players)`
                : `Need ${info.minPlayers - seated} more player${info.minPlayers - seated > 1 ? 's' : ''}…`}
            </button>
          </>
        ) : (
          <p className="muted center">
            {canStart ? 'Waiting for the host to start…' : 'Waiting for players… share the room code!'} (
            {view.totalRounds} rounds)
          </p>
        )}

        <button className="link center" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </main>
  );
}
