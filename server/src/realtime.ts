import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.js';
import { verifyAccessToken, type AccessTokenClaims } from './auth/tokens.js';

export type RealtimeEvent =
  | { type: 'post_created'; postId: number }
  | { type: 'post_updated'; postId: number }
  | { type: 'post_deleted'; postId: number }
  | { type: 'post_liked'; postId: number; likeCount: number; userId: string; liked: boolean }
  | { type: 'comment_created'; postId: number; commentId: number };

export type UserEvent =
  | {
      type: 'notification_created';
      notification: {
        id: number;
        type: string;
        createdAt: string;
        isRead: boolean;
        actorUser?: { id: string; username: string; displayName: string | null; avatarUrl: string | null } | null;
        entity?: { type: string; id: string | number } | null;
      };
    };

let io: Server | null = null;

      type SocketUser = AccessTokenClaims & { username: string };

const tryGetSocketUser = (token: unknown): SocketUser | null => {
  if (typeof token !== 'string' || !token) return null;
  try {
    const claims = verifyAccessToken(token);
    const username = String(claims.sub ?? '').toLowerCase();
    if (!username) return null;
    return { ...claims, username };
  } catch {
    return null;
  }
};

const roomForUser = (username: string) => `user:${username}`;

export const initRealtime = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigin,
      credentials: false,
    },
  });

  io.on('connection', (socket) => {
    const user = tryGetSocketUser((socket.handshake.auth as { token?: unknown } | undefined)?.token);

    if (user) {
      void socket.join(roomForUser(user.username));
    }

    socket.on('disconnect', () => {});
  });

  return io;
};

export const emitEvent = (event: RealtimeEvent) => {
  if (!io) return;
  io.emit('event', event);
};

export const emitToUserRoom = (userId: string, event: UserEvent) => {
  if (!io) return;
  io.to(roomForUser(userId)).emit('notify:event', event);
};
