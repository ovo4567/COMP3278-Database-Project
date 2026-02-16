import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { createNotification, type NotificationPayload } from '../services/notifications.js';
import { emitToUserRoom } from '../realtime.js';

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

const emitNotification = (userId: number, notification: NotificationPayload) => {
  emitToUserRoom(userId, { type: 'notification_created', notification });
};

const normalizePair = (a: number, b: number): { user1: number; user2: number } => {
  return a < b ? { user1: a, user2: b } : { user1: b, user2: a };
};

const listUserSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.coerce.number().int().min(1).optional(),
});

friendsRouter.get('/', async (req, res) => {
  const userId = Number((req as unknown as AuthedRequest).user.sub);

  const parsed = listUserSchema.safeParse({ limit: req.query.limit, cursor: req.query.cursor });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const limit = parsed.data.limit ?? 30;
  const cursor = parsed.data.cursor ?? null;

  const db = await getDb();

  const rows = await db.all<
    {
      cursor: number;
      id: number;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      status_text: string | null;
      created_at: string;
    }[]
  >(
    `SELECT f.rowid AS cursor, u.id, u.username, u.display_name, u.avatar_url, u.status_text, f.created_at
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.user_id1 = ? THEN f.user_id2 ELSE f.user_id1 END
     WHERE f.status = 'accepted'
       AND (f.user_id1 = ? OR f.user_id2 = ?)
       AND (? IS NULL OR f.rowid < ?)
     ORDER BY f.rowid DESC
     LIMIT ?`,
    userId,
    userId,
    userId,
    cursor,
    cursor,
    limit + 1,
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.cursor : null;

  return res.json({
    items: items.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      status: r.status_text,
      friendedAt: r.created_at,
    })),
    nextCursor,
  });
});

friendsRouter.get('/requests', async (req, res) => {
  const userId = Number((req as unknown as AuthedRequest).user.sub);
  const parsed = listUserSchema.safeParse({ limit: req.query.limit, cursor: req.query.cursor });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const limit = parsed.data.limit ?? 30;
  const cursor = parsed.data.cursor ?? null;
  const db = await getDb();

  const rows = await db.all<
    {
      cursor: number;
      other_id: number;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      status_text: string | null;
      created_at: string;
      action_user_id: number;
    }[]
  >(
    `SELECT
       f.rowid AS cursor,
       CASE WHEN f.user_id1 = ? THEN f.user_id2 ELSE f.user_id1 END AS other_id,
       u.username, u.display_name, u.avatar_url, u.status_text,
       f.created_at, f.action_user_id
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.user_id1 = ? THEN f.user_id2 ELSE f.user_id1 END
     WHERE f.status = 'pending'
       AND (f.user_id1 = ? OR f.user_id2 = ?)
       AND f.action_user_id != ?
       AND (? IS NULL OR f.rowid < ?)
     ORDER BY f.rowid DESC
     LIMIT ?`,
    userId,
    userId,
    userId,
    userId,
    userId,
    cursor,
    cursor,
    limit + 1,
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.cursor : null;

  return res.json({
    items: items.map((r) => ({
      user: {
        id: r.other_id,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        status: r.status_text,
      },
      createdAt: r.created_at,
    })),
    nextCursor,
  });
});

friendsRouter.get('/requests/sent', async (req, res) => {
  const userId = Number((req as unknown as AuthedRequest).user.sub);
  const parsed = listUserSchema.safeParse({ limit: req.query.limit, cursor: req.query.cursor });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const limit = parsed.data.limit ?? 30;
  const cursor = parsed.data.cursor ?? null;
  const db = await getDb();

  const rows = await db.all<
    {
      cursor: number;
      other_id: number;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      status_text: string | null;
      created_at: string;
    }[]
  >(
    `SELECT
       f.rowid AS cursor,
       CASE WHEN f.user_id1 = ? THEN f.user_id2 ELSE f.user_id1 END AS other_id,
       u.username, u.display_name, u.avatar_url, u.status_text,
       f.created_at
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.user_id1 = ? THEN f.user_id2 ELSE f.user_id1 END
     WHERE f.status = 'pending'
       AND (f.user_id1 = ? OR f.user_id2 = ?)
       AND f.action_user_id = ?
       AND (? IS NULL OR f.rowid < ?)
     ORDER BY f.rowid DESC
     LIMIT ?`,
    userId,
    userId,
    userId,
    userId,
    userId,
    cursor,
    cursor,
    limit + 1,
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.cursor : null;

  return res.json({
    items: items.map((r) => ({
      user: {
        id: r.other_id,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        status: r.status_text,
      },
      createdAt: r.created_at,
    })),
    nextCursor,
  });
});

friendsRouter.post('/request/:userId', async (req, res) => {
  const actorId = Number((req as unknown as AuthedRequest).user.sub);
  const targetUserId = Number(req.params.userId);
  if (!Number.isFinite(targetUserId)) return res.status(400).json({ error: 'Invalid user id' });
  if (actorId === targetUserId) return res.status(400).json({ error: 'Cannot friend yourself' });

  const { user1, user2 } = normalizePair(actorId, targetUserId);

  const db = await getDb();
  const target = await db.get<{ id: number }>('SELECT id FROM users WHERE id = ?', targetUserId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const existing = await db.get<{ status: 'pending' | 'accepted' | 'rejected'; action_user_id: number | null }>(
    'SELECT status, action_user_id FROM friendships WHERE user_id1 = ? AND user_id2 = ?',
    user1,
    user2,
  );

  if (!existing) {
    await db.run(
      "INSERT INTO friendships(user_id1, user_id2, status, action_user_id, created_at, updated_at) VALUES (?, ?, 'pending', ?, datetime('now'), datetime('now'))",
      user1,
      user2,
      actorId,
    );

    const n = await createNotification({
      userId: targetUserId,
      type: 'friend_request_received',
      actorUserId: actorId,
      entityType: 'user',
      entityId: actorId,
    });
    if (n) emitNotification(targetUserId, n);

    return res.json({ ok: true, status: 'pending' });
  }

  if (existing.status === 'accepted') {
    return res.status(400).json({ error: 'Already friends' });
  }

  if (existing.status === 'pending') {
    if (existing.action_user_id === actorId) return res.json({ ok: true, status: 'pending' });

    // Crossed requests: auto-accept.
    await db.run(
      "UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE user_id1 = ? AND user_id2 = ?",
      user1,
      user2,
    );

    // Mark the prior incoming friend request notification (to the current actor) as read,
    // since the relationship is now accepted.
    await db.run(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND type = 'friend_request_received' AND actor_user_id = ? AND entity_type = 'user' AND entity_id = ?",
      actorId,
      targetUserId,
      targetUserId,
    );

    const n = await createNotification({
      userId: targetUserId,
      type: 'friend_request_accepted',
      actorUserId: actorId,
      entityType: 'user',
      entityId: actorId,
    });
    if (n) emitNotification(targetUserId, n);

    return res.json({ ok: true, status: 'accepted' });
  }

  // Re-request after rejection.
  await db.run(
    "UPDATE friendships SET status = 'pending', action_user_id = ?, updated_at = datetime('now') WHERE user_id1 = ? AND user_id2 = ?",
    actorId,
    user1,
    user2,
  );

  const n = await createNotification({
    userId: targetUserId,
    type: 'friend_request_received',
    actorUserId: actorId,
    entityType: 'user',
    entityId: actorId,
  });
  if (n) emitNotification(targetUserId, n);

  return res.json({ ok: true, status: 'pending' });
});

friendsRouter.put('/request/:userId/accept', async (req, res) => {
  const actorId = Number((req as unknown as AuthedRequest).user.sub);
  const otherId = Number(req.params.userId);
  if (!Number.isFinite(otherId)) return res.status(400).json({ error: 'Invalid user id' });
  if (actorId === otherId) return res.status(400).json({ error: 'Invalid' });

  const { user1, user2 } = normalizePair(actorId, otherId);
  const db = await getDb();

  const row = await db.get<{ status: string; action_user_id: number | null }>(
    'SELECT status, action_user_id FROM friendships WHERE user_id1 = ? AND user_id2 = ?',
    user1,
    user2,
  );
  if (!row) return res.status(404).json({ error: 'No request' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'Not pending' });
  if (row.action_user_id === actorId) return res.status(400).json({ error: 'Cannot accept your own request' });

  await db.run(
    "UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE user_id1 = ? AND user_id2 = ?",
    user1,
    user2,
  );

  // Mark the incoming request notification as read for the accepting user.
  await db.run(
    "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND type = 'friend_request_received' AND actor_user_id = ? AND entity_type = 'user' AND entity_id = ?",
    actorId,
    otherId,
    otherId,
  );

  const n = await createNotification({
    userId: otherId,
    type: 'friend_request_accepted',
    actorUserId: actorId,
    entityType: 'user',
    entityId: actorId,
  });
  if (n) emitNotification(otherId, n);

  return res.json({ ok: true });
});

friendsRouter.put('/request/:userId/reject', async (req, res) => {
  const actorId = Number((req as unknown as AuthedRequest).user.sub);
  const otherId = Number(req.params.userId);
  if (!Number.isFinite(otherId)) return res.status(400).json({ error: 'Invalid user id' });
  if (actorId === otherId) return res.status(400).json({ error: 'Invalid' });

  const { user1, user2 } = normalizePair(actorId, otherId);
  const db = await getDb();

  const row = await db.get<{ status: string; action_user_id: number | null }>(
    'SELECT status, action_user_id FROM friendships WHERE user_id1 = ? AND user_id2 = ?',
    user1,
    user2,
  );
  if (!row) return res.status(404).json({ error: 'No request' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'Not pending' });
  if (row.action_user_id === actorId) return res.status(400).json({ error: 'Cannot reject your own request' });

  await db.run(
    "UPDATE friendships SET status = 'rejected', updated_at = datetime('now') WHERE user_id1 = ? AND user_id2 = ?",
    user1,
    user2,
  );

  return res.json({ ok: true });
});

friendsRouter.delete('/request/:userId/cancel', async (req, res) => {
  const actorId = Number((req as unknown as AuthedRequest).user.sub);
  const otherId = Number(req.params.userId);
  if (!Number.isFinite(otherId)) return res.status(400).json({ error: 'Invalid user id' });
  if (actorId === otherId) return res.status(400).json({ error: 'Invalid' });

  const { user1, user2 } = normalizePair(actorId, otherId);
  const db = await getDb();

  const row = await db.get<{ status: string; action_user_id: number | null }>(
    'SELECT status, action_user_id FROM friendships WHERE user_id1 = ? AND user_id2 = ?',
    user1,
    user2,
  );
  if (!row) return res.status(404).json({ error: 'No request' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'Not pending' });
  if (row.action_user_id !== actorId) return res.status(400).json({ error: 'Only sender can cancel' });

  await db.run('DELETE FROM friendships WHERE user_id1 = ? AND user_id2 = ?', user1, user2);
  return res.json({ ok: true });
});

friendsRouter.delete('/:friendId', async (req, res) => {
  const actorId = Number((req as unknown as AuthedRequest).user.sub);
  const otherId = Number(req.params.friendId);
  if (!Number.isFinite(otherId)) return res.status(400).json({ error: 'Invalid user id' });
  if (actorId === otherId) return res.status(400).json({ error: 'Invalid' });

  const { user1, user2 } = normalizePair(actorId, otherId);
  const db = await getDb();

  const row = await db.get<{ status: string }>('SELECT status FROM friendships WHERE user_id1 = ? AND user_id2 = ?', user1, user2);
  if (!row) return res.status(404).json({ error: 'Not friends' });
  if (row.status !== 'accepted') return res.status(400).json({ error: 'Not friends' });

  await db.run('DELETE FROM friendships WHERE user_id1 = ? AND user_id2 = ?', user1, user2);
  return res.json({ ok: true });
});
