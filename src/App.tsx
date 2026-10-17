import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomView } from '../shared/protocol.ts';
import { Home } from './Home.tsx';
import { Lobby } from './Lobby.tsx';
import { Table } from './Table.tsx';
import { getSavedName, getToken, roomFromUrl, saveName, setRoomInUrl, socket } from './socket.ts';

export function App() {
  const [view, setView] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout>>();

  const showError = useCallback((msg: string) => {
    setError(msg);
    clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 3500);
  }, []);

  const join = useCallback(
    (name: string, code?: string) => {
      saveName(name);
      socket.emit('join', { name, code, token: getToken() }, (res) => {
        if (res.ok) setRoomInUrl(res.code ?? null);
        else {
          showError(res.error);
          if (code) setRoomInUrl(null);
        }
      });
    },
    [showError],
  );

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      // Rejoin automatically after a refresh or a dropped connection.
      const code = roomFromUrl();
      const name = getSavedName();
      if (code && name) join(name, code);
    };
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', setView);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', setView);
    };
  }, [join]);

  const leave = () => {
    socket.emit('leave');
    setRoomInUrl(null);
    setView(null);
  };

  let screen;
  if (!view || view.mySeat < 0) screen = <Home onJoin={join} />;
  else if (!view.game) screen = <Lobby view={view} onLeave={leave} onError={showError} />;
  else screen = <Table view={view} onLeave={leave} onError={showError} />;

  return (
    <>
      {screen}
      {!connected && <div className="banner">Reconnecting…</div>}
      {error && <div className="toast" role="alert">{error}</div>}
    </>
  );
}
