import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { emitToUserRoom } from '../realtime.js';
import { listNotifications, type NotificationPayload } from '../services/notifications.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.coerce.number().int().min(1).optional(),
});

export const emitNotification = (userId: string, notification: NotificationPayload) => {
  emitToUserRoom(userId, { type: 'notification_created', notification });
};

notificationsRouter.get('/', async (req, res) => {
  const userId = String((req as AuthedRequest).user.sub).toLowerCase();

  const parsed = listSchema.safeParse({ limit: req.query.limit, cursor: req.query.cursor });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const limit = parsed.data.limit ?? 30;
  const cursor = parsed.data.cursor ?? null;

  const out = await listNotifications(userId, limit, cursor);
  return res.json(out);
});

notificationsRouter.get('/unread-count', async (req, res) => {
  const userId = String((req as AuthedRequest).user.sub).toLowerCase();
  const db = await getDb();
  const row = await db.get<{ c: number }>('SELECT COUNT(*) AS c FROM notifications WHERE username = ? AND is_read = 0', userId);
  return res.json({ count: row?.c ?? 0 });
});

const markSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
});

const markByEntitySchema = z.object({
  entityType: z.string().min(1).max(50),
  entityId: z.union([z.string().min(1), z.number().int().positive()]),
  types: z.array(z.string().min(1).max(80)).max(20).optional(),
});

notificationsRouter.post('/read', async (req, res) => {
  const userId = String((req as AuthedRequest).user.sub).toLowerCase();
  const parsed = markSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const db = await getDb();
  const placeholders = parsed.data.ids.map(() => '?').join(', ');
  await db.run(
    `UPDATE notifications SET is_read = 1 WHERE username = ? AND id IN (${placeholders})`,
    userId,
    ...parsed.data.ids,
  );

  return res.json({ ok: true });
});

notificationsRouter.post('/read-all', async (req, res) => {
  const userId = String((req as AuthedRequest).user.sub).toLowerCase();
  const db = await getDb();
  await db.run('UPDATE notifications SET is_read = 1 WHERE username = ?', userId);
  return res.json({ ok: true });
});

notificationsRouter.post('/read-by-entity', async (req, res) => {
  const userId = String((req as AuthedRequest).user.sub).toLowerCase();
  const parsed = markByEntitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const db = await getDb();

  if (parsed.data.types && parsed.data.types.length > 0) {
    const placeholders = parsed.data.types.map(() => '?').join(', ');
    await db.run(
      `UPDATE notifications
       SET is_read = 1
       WHERE username = ?
         AND is_read = 0
         AND entity_type = ?
         AND entity_id = ?
         AND type IN (${placeholders})`,
      userId,
      parsed.data.entityType,
      parsed.data.entityId,
      ...parsed.data.types,
    );
  } else {
    await db.run(
      `UPDATE notifications
       SET is_read = 1
       WHERE username = ?
         AND is_read = 0
         AND entity_type = ?
         AND entity_id = ?`,
      userId,
      parsed.data.entityType,
      parsed.data.entityId,
    );
  }

  return res.json({ ok: true });
});
