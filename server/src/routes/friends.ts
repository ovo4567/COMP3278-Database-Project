import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { createNotification, markNotificationsReadByActor, type NotificationPayload } from '../services/notifications.js';
import { emitToUserRoom } from '../realtime.js';

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

const emitNotification = (userId: string, notification: NotificationPayload) => {
  emitToUserRoom(userId, { type: 'notification_created', notification });
};

type FriendshipRow = {
  username1: string;
  username2: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string | null;
};

const getFriendshipByPair = async (db: Awaited<ReturnType<typeof getDb>>, userA: string, userB: string): Promise<FriendshipRow | undefined> => {
  return db.get<FriendshipRow>(
    `SELECT username1, username2, status, created_at, updated_at
     FROM friendships
     WHERE (username1 = ? AND username2 = ?)
        OR (username1 = ? AND username2 = ?)
     LIMIT 1`,
    userA,
    userB,
    userB,
    userA,
  );
};

const listUserSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.coerce.number().int().min(1).optional(),
});

friendsRouter.get('/', async (req, res) => {
  const userId = String((req as unknown as AuthedRequest).user.sub).toLowerCase();

  const parsed = listUserSchema.safeParse({ limit: req.query.limit, cursor: req.query.cursor });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const limit = parsed.data.limit ?? 30;
  const cursor = parsed.data.cursor ?? null;
  const db = await getDb();

  const rows = await db.all<
    {
      cursor: number;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      status_text: string | null;
      created_at: string;
    }[]
  >(
    `SELECT f.rowid AS cursor, u.username, u.display_name, u.avatar_url, u.status_text, f.created_at
     FROM friendships f
     JOIN users u ON u.username = CASE WHEN f.username1 = ? THEN f.username2 ELSE f.username1 END
     WHERE f.status = 'accepted'
       AND (f.username1 = ? OR f.username2 = ?)
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
      id: r.username,
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
  const userId = String((req as unknown as AuthedRequest).user.sub).toLowerCase();
  const parsed = listUserSchema.safeParse({ limit: req.query.limit, cursor: req.query.cursor });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const limit = parsed.data.limit ?? 30;
  const cursor = parsed.data.cursor ?? null;
  const db = await getDb();

  const rows = await db.all<
    {
      cursor: number;
      other_username: string;
      display_name: string | null;
      avatar_url: string | null;
      status_text: string | null;
      created_at: string;
    }[]
  >(
    `SELECT
       f.rowid AS cursor,
       f.username1 AS other_username,
       u.display_name, u.avatar_url, u.status_text,
       f.created_at
     FROM friendships f
     JOIN users u ON u.username = f.username1
     WHERE f.status = 'pending'
       AND f.username2 = ?
       AND (? IS NULL OR f.rowid < ?)
     ORDER BY f.rowid DESC
     LIMIT ?`,
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
        id: r.other_username,
        username: r.other_username,
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
  const userId = String((req as unknown as AuthedRequest).user.sub).toLowerCase();
  const parsed = listUserSchema.safeParse({ limit: req.query.limit, cursor: req.query.cursor });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const limit = parsed.data.limit ?? 30;
  const cursor = parsed.data.cursor ?? null;
  const db = await getDb();

  const rows = await db.all<
    {
      cursor: number;
      other_username: string;
      display_name: string | null;
      avatar_url: string | null;
      status_text: string | null;
      created_at: string;
    }[]
  >(
    `SELECT
       f.rowid AS cursor,
       f.username2 AS other_username,
       u.display_name, u.avatar_url, u.status_text,
       f.created_at
     FROM friendships f
     JOIN users u ON u.username = f.username2
     WHERE f.status = 'pending'
       AND f.username1 = ?
       AND (? IS NULL OR f.rowid < ?)
     ORDER BY f.rowid DESC
     LIMIT ?`,
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
        id: r.other_username,
        username: r.other_username,
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
  const actorId = String((req as unknown as AuthedRequest).user.sub).toLowerCase();
  const targetUserId = String(req.params.userId ?? '').toLowerCase();
  if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
  if (actorId === targetUserId) return res.status(400).json({ error: 'Cannot friend yourself' });

  const db = await getDb();
  const target = await db.get<{ username: string }>('SELECT username FROM users WHERE username = ?', targetUserId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const existing = await getFriendshipByPair(db, actorId, targetUserId);

  if (!existing) {
    await db.run(
      "INSERT INTO friendships(username1, username2, status, created_at, updated_at) VALUES (?, ?, 'pending', datetime('now'), datetime('now'))",
      actorId,
      targetUserId,
    );

    const n = await createNotification({
      userId: targetUserId,
      type: 'friend_request_received',
      actorUsername: actorId,
    });
    if (n) emitNotification(targetUserId, n);

    return res.json({ ok: true, status: 'pending' });
  }

  if (existing.status === 'accepted') {
    return res.status(400).json({ error: 'Already friends' });
  }

  if (existing.status === 'pending') {
    if (existing.username1 === actorId) return res.json({ ok: true, status: 'pending' });

    await db.run(
      "UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE username1 = ? AND username2 = ?",
      existing.username1,
      existing.username2,
    );

    await markNotificationsReadByActor({ userId: actorId, actorUsername: targetUserId, types: ['friend_request_received'] });

    const n = await createNotification({
      userId: targetUserId,
      type: 'friend_request_accepted',
      actorUsername: actorId,
    });
    if (n) emitNotification(targetUserId, n);

    return res.json({ ok: true, status: 'accepted' });
  }

  await db.run('DELETE FROM friendships WHERE username1 = ? AND username2 = ?', existing.username1, existing.username2);
  await db.run(
    "INSERT INTO friendships(username1, username2, status, created_at, updated_at) VALUES (?, ?, 'pending', datetime('now'), datetime('now'))",
    actorId,
    targetUserId,
  );

  const n = await createNotification({
    userId: targetUserId,
    type: 'friend_request_received',
    actorUsername: actorId,
  });
  if (n) emitNotification(targetUserId, n);

  return res.json({ ok: true, status: 'pending' });
});

friendsRouter.put('/request/:userId/accept', async (req, res) => {
  const actorId = String((req as unknown as AuthedRequest).user.sub).toLowerCase();
  const otherId = String(req.params.userId ?? '').toLowerCase();
  if (!otherId) return res.status(400).json({ error: 'Invalid user id' });
  if (actorId === otherId) return res.status(400).json({ error: 'Invalid' });

  const db = await getDb();

  const row = await getFriendshipByPair(db, actorId, otherId);
  if (!row) return res.status(404).json({ error: 'No request' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'Not pending' });
  if (row.username1 === actorId) return res.status(400).json({ error: 'Cannot accept your own request' });

  await db.run(
    "UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE username1 = ? AND username2 = ?",
    row.username1,
    row.username2,
  );

  await markNotificationsReadByActor({ userId: actorId, actorUsername: otherId, types: ['friend_request_received'] });

  const n = await createNotification({
    userId: otherId,
    type: 'friend_request_accepted',
    actorUsername: actorId,
  });
  if (n) emitNotification(otherId, n);

  return res.json({ ok: true });
});

friendsRouter.put('/request/:userId/reject', async (req, res) => {
  const actorId = String((req as unknown as AuthedRequest).user.sub).toLowerCase();
  const otherId = String(req.params.userId ?? '').toLowerCase();
  if (!otherId) return res.status(400).json({ error: 'Invalid user id' });
  if (actorId === otherId) return res.status(400).json({ error: 'Invalid' });

  const db = await getDb();

  const row = await getFriendshipByPair(db, actorId, otherId);
  if (!row) return res.status(404).json({ error: 'No request' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'Not pending' });
  if (row.username1 === actorId) return res.status(400).json({ error: 'Cannot reject your own request' });

  await db.run(
    "UPDATE friendships SET status = 'rejected', updated_at = datetime('now') WHERE username1 = ? AND username2 = ?",
    row.username1,
    row.username2,
  );

  return res.json({ ok: true });
});

friendsRouter.delete('/request/:userId/cancel', async (req, res) => {
  const actorId = String((req as unknown as AuthedRequest).user.sub).toLowerCase();
  const otherId = String(req.params.userId ?? '').toLowerCase();
  if (!otherId) return res.status(400).json({ error: 'Invalid user id' });
  if (actorId === otherId) return res.status(400).json({ error: 'Invalid' });

  const db = await getDb();

  const row = await getFriendshipByPair(db, actorId, otherId);
  if (!row) return res.status(404).json({ error: 'No request' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'Not pending' });
  if (row.username1 !== actorId) return res.status(400).json({ error: 'Only sender can cancel' });

  await db.run('DELETE FROM friendships WHERE username1 = ? AND username2 = ?', row.username1, row.username2);
  return res.json({ ok: true });
});

friendsRouter.delete('/:friendId', async (req, res) => {
  const actorId = String((req as unknown as AuthedRequest).user.sub).toLowerCase();
  const otherId = String(req.params.friendId ?? '').toLowerCase();
  if (!otherId) return res.status(400).json({ error: 'Invalid user id' });
  if (actorId === otherId) return res.status(400).json({ error: 'Invalid' });

  const db = await getDb();

  const row = await getFriendshipByPair(db, actorId, otherId);
  if (!row) return res.status(404).json({ error: 'Not friends' });
  if (row.status !== 'accepted') return res.status(400).json({ error: 'Not friends' });

  await db.run('DELETE FROM friendships WHERE username1 = ? AND username2 = ?', row.username1, row.username2);
  return res.json({ ok: true });
});