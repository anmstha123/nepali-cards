import { io, Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../shared/protocol.ts';

export const socket: Socket<ServerToClient, ClientToServer> = io({ autoConnect: true });

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. */
  }
}

/** Stable per-browser id so a refresh or dropped connection gets you back into your seat. */
export function getToken(): string {
  let t = safeGet('cb-token');
  if (!t) {
    // crypto.randomUUID needs a secure context, which LAN http:// addresses aren't.
    t = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    safeSet('cb-token', t);
  }
  return t;
}

export function getSavedName(): string {
  return safeGet('cb-name') ?? '';
}

export function saveName(name: string): void {
  safeSet('cb-name', name);
}

export function roomFromUrl(): string | null {
  return new URLSearchParams(location.search).get('room')?.toUpperCase() || null;
}

export function setRoomInUrl(code: string | null): void {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}
