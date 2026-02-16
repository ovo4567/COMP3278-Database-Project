import { io, type Socket } from 'socket.io-client';
import { config } from './config';
import type { NotifyEvent, RealtimeEvent } from './types';
import { AUTH_TOKEN_CHANGED_EVENT, tokenStorage } from './storage';

let socket: Socket | null = null;
let lastAuthToken: string | null = null;

const applyLatestAuthAndReconnectIfNeeded = () => {
  if (!socket) return;
  const token = tokenStorage.getAccessToken();

  // Always keep socket.auth in sync; Socket.IO uses this on (re)connect.
  socket.auth = { token };

  // If the token changes, we must reconnect to re-run the handshake.
  if (token !== lastAuthToken) {
    lastAuthToken = token;
    if (socket.connected) socket.disconnect();
    if (token) socket.connect();
  } else {
    // If we have a token and the socket is currently disconnected, ensure it connects.
    if (token && !socket.connected) socket.connect();
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, () => {
    applyLatestAuthAndReconnectIfNeeded();
  });
}

export const getSocket = (): Socket => {
  const token = tokenStorage.getAccessToken();

  if (!socket) {
    socket = io(config.socketUrl, {
      transports: ['websocket'],
      auth: {
        token,
      },
    });
    lastAuthToken = token;
    return socket;
  }

  applyLatestAuthAndReconnectIfNeeded();
  return socket;
};

export const onRealtimeEvent = (handler: (event: RealtimeEvent) => void) => {
  const s = getSocket();
  const listener = (event: RealtimeEvent) => handler(event);
  s.on('event', listener);
  return () => {
    s.off('event', listener);
  };
};

export const onNotifyEvent = (handler: (event: NotifyEvent) => void) => {
  const s = getSocket();
  const listener = (event: NotifyEvent) => handler(event);
  s.on('notify:event', listener);
  return () => {
    s.off('notify:event', listener);
  };
};

export const onNotifyEventBuffered = (
  handler: (events: NotifyEvent[]) => void,
  options: { intervalMs?: number; maxBatch?: number } = {},
) => {
  const intervalMs = options.intervalMs ?? 250;
  const maxBatch = options.maxBatch ?? 50;

  const s = getSocket();
  let queue: NotifyEvent[] = [];
  let timer: number | null = null;

  const flush = () => {
    timer = null;
    if (queue.length === 0) return;
    const batch = queue.slice(0, maxBatch);
    queue = queue.slice(batch.length);
    handler(batch);
    if (queue.length > 0) timer = window.setTimeout(flush, intervalMs);
  };

  const listener = (event: NotifyEvent) => {
    queue.push(event);
    if (timer === null) timer = window.setTimeout(flush, intervalMs);
  };

  s.on('notify:event', listener);
  return () => {
    s.off('notify:event', listener);
    if (timer !== null) window.clearTimeout(timer);
  };
};
