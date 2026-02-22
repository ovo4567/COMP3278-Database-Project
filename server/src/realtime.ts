import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.js';
import { verifyAccessToken, type AccessTokenClaims } from './auth/tokens.js';

export type RealtimeEvent =
  | { type: 'post_created'; postId: number }
  | { type: 'post_updated'; postId: number }
  | { type: 'post_deleted'; postId: number }
  | { type: 'post_liked'; postId: number; likeCount: number; userId: number; liked: boolean }
  | { type: 'comment_created'; postId: number; commentId: number };

export type UserEvent =
  | {
      type: 'notification_created';
      notification: {
        id: number;
        type: string;
        createdAt: string;
        isRead: boolean;
        actorUser?: { id: number; username: string; displayName: string | null; avatarUrl: string | null } | null;
        entity?: { type: string; id: number } | null;
      };
    };

let io: Server | null = null;

type SocketUser = AccessTokenClaims & { id: number };

const tryGetSocketUser = (token: unknown): SocketUser | null => {
  if (typeof token !== 'string' || !token) return null;
  try {
    const claims = verifyAccessToken(token);
    const id = Number(claims.sub);
    if (!Number.isFinite(id)) return null;
    return { ...claims, id };
  } catch {
    return null;
  }
};

const roomForUser = (userId: number) => `user:${userId}`;

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
      void socket.join(roomForUser(user.id));
    }

    socket.on('disconnect', () => {});
  });

  return io;
};

export const emitEvent = (event: RealtimeEvent) => {
  if (!io) return;
  io.emit('event', event);
};

export const emitToUserRoom = (userId: number, event: UserEvent) => {
  if (!io) return;
  io.to(roomForUser(userId)).emit('notify:event', event);
};
