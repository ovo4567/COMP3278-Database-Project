import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.js';
import { verifyAccessToken, type AccessTokenClaims } from './auth/tokens.js';
import { getDb } from './db/sqlite.js';
import { createNotification } from './services/notifications.js';

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

export type ChatMessageEvent = {
  type: 'chat_message';
  message: {
    id: number;
    groupId: number;
    type: 'text' | 'image';
    text: string | null;
    imageUrl: string | null;
    createdAt: string;
    user: { id: number; username: string; displayName: string | null; avatarUrl: string | null };
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

const roomForGroup = (groupId: number) => `group:${groupId}`;
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

    socket.on('chat:join', async (groupIdRaw: unknown, cb?: (res: { ok: true } | { ok: false; error: string }) => void) => {
      const groupId = Number(groupIdRaw);
      if (!Number.isFinite(groupId)) {
        cb?.({ ok: false, error: 'Invalid group id' });
        return;
      }
      if (!user) {
        cb?.({ ok: false, error: 'Unauthorized' });
        return;
      }

      const db = await getDb();
      const member = await db.get('SELECT 1 FROM chat_group_members WHERE group_id = ? AND user_id = ?', groupId, user.id);
      if (!member) {
        cb?.({ ok: false, error: 'Join the group first' });
        return;
      }

      await socket.join(roomForGroup(groupId));
      cb?.({ ok: true });
    });

    socket.on('chat:leave', async (groupIdRaw: unknown, cb?: (res: { ok: true } | { ok: false; error: string }) => void) => {
      const groupId = Number(groupIdRaw);
      if (!Number.isFinite(groupId)) {
        cb?.({ ok: false, error: 'Invalid group id' });
        return;
      }
      await socket.leave(roomForGroup(groupId));
      cb?.({ ok: true });
    });

    socket.on(
      'chat:send',
      async (
        payload: unknown,
        cb?: (res: { ok: true; id: number } | { ok: false; error: string }) => void,
      ) => {
        if (!user) {
          cb?.({ ok: false, error: 'Unauthorized' });
          return;
        }

        const parsed =
          typeof payload === 'object' && payload
            ? (payload as { groupId?: unknown; type?: unknown; text?: unknown; imageUrl?: unknown })
            : null;
        const groupId = Number(parsed?.groupId);
        if (!Number.isFinite(groupId)) {
          cb?.({ ok: false, error: 'Invalid group id' });
          return;
        }

        const type = parsed?.type === 'image' ? 'image' : 'text';
        const text = typeof parsed?.text === 'string' ? parsed.text.trim() : '';
        const imageUrl = typeof parsed?.imageUrl === 'string' ? parsed.imageUrl.trim() : '';
        if (type === 'text' && !text) {
          cb?.({ ok: false, error: 'Text is required' });
          return;
        }
        if (type === 'image' && !imageUrl) {
          cb?.({ ok: false, error: 'Image URL is required' });
          return;
        }

        const db = await getDb();
        const member = await db.get('SELECT 1 FROM chat_group_members WHERE group_id = ? AND user_id = ?', groupId, user.id);
        if (!member) {
          cb?.({ ok: false, error: 'Join the group first' });
          return;
        }

        const result = await db.run(
          'INSERT INTO chat_messages(group_id, user_id, type, text, image_url) VALUES (?, ?, ?, ?, ?)',
          groupId,
          user.id,
          type,
          type === 'text' ? text : null,
          type === 'image' ? imageUrl : null,
        );

        const id = result.lastID as number;
        const row = await db.get<{
          created_at: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
        }>(
          `SELECT msg.created_at, u.username, u.display_name, u.avatar_url
           FROM chat_messages msg
           JOIN users u ON u.id = msg.user_id
           WHERE msg.id = ?`,
          id,
        );

        if (row) {
          const event: ChatMessageEvent = {
            type: 'chat_message',
            message: {
              id,
              groupId,
              type,
              text: type === 'text' ? text : null,
              imageUrl: type === 'image' ? imageUrl : null,
              createdAt: row.created_at,
              user: {
                id: user.id,
                username: row.username,
                displayName: row.display_name,
                avatarUrl: row.avatar_url,
              },
            },
          };

          io?.to(roomForGroup(groupId)).emit('chat:event', event);

          // Create in-app notifications for other group members.
          const members = await db.all<{ user_id: number }[]>(
            'SELECT user_id FROM chat_group_members WHERE group_id = ? AND user_id != ?',
            groupId,
            user.id,
          );

          for (const m of members) {
            const n = await createNotification({
              userId: m.user_id,
              type: 'message_received',
              actorUserId: user.id,
              entityType: 'chat_group',
              entityId: groupId,
            });
            if (n) emitToUserRoom(m.user_id, { type: 'notification_created', notification: n });
          }
        }

        cb?.({ ok: true, id });
      },
    );

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
