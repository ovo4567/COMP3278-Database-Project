import { getDb } from '../db/sqlite.js';

export type NotificationPayload = {
  id: number;
  type: string;
  createdAt: string;
  isRead: boolean;
  actorUser?: { id: string; username: string; displayName: string | null; avatarUrl: string | null } | null;
};

type NotificationJoinedRow = {
  id: number;
  type: string;
  created_at: string;
  is_read: 0 | 1;
  actor_username: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
};

const mapJoinedRow = (row: NotificationJoinedRow): NotificationPayload => {
  const actor = row.actor_username
    ? {
        id: row.actor_username,
        username: row.actor_username,
        displayName: row.actor_display_name,
        avatarUrl: row.actor_avatar_url,
      }
    : null;

  return {
    id: row.id,
    type: row.type,
    createdAt: row.created_at,
    isRead: Boolean(row.is_read),
    actorUser: actor,
  };
};

export const getNotificationById = async (id: number): Promise<NotificationPayload | null> => {
  const db = await getDb();
  const row = await db.get<NotificationJoinedRow>(
      `SELECT n.id, n.type, n.created_at, n.is_read, n.actor_username,
        u.display_name AS actor_display_name, u.avatar_url AS actor_avatar_url
     FROM notifications n
     LEFT JOIN users u ON u.username = n.actor_username
     WHERE n.id = ?`,
    id,
  );
  if (!row) return null;
  return mapJoinedRow(row);
};

export const createNotification = async (input: {
  userId: string;
  type: string;
  actorUsername?: string | null;
}): Promise<NotificationPayload | null> => {
  const db = await getDb();
  const result = await db.run(
    'INSERT INTO notifications(username, type, actor_username) VALUES (?, ?, ?)',
    input.userId,
    input.type,
    input.actorUsername ?? null,
  );

  const id = result.lastID as number;
  return getNotificationById(id);
};

export const markNotificationsReadByActor = async (input: {
  userId: string;
  actorUsername: string;
  types?: string[];
}): Promise<void> => {
  const db = await getDb();

  if (input.types && input.types.length > 0) {
    const placeholders = input.types.map(() => '?').join(', ');
    await db.run(
      `UPDATE notifications
       SET is_read = 1
       WHERE username = ?
         AND is_read = 0
         AND actor_username = ?
         AND type IN (${placeholders})`,
      input.userId,
      input.actorUsername,
      ...input.types,
    );
    return;
  }

  await db.run(
    `UPDATE notifications
     SET is_read = 1
     WHERE username = ?
       AND is_read = 0
       AND actor_username = ?`,
    input.userId,
    input.actorUsername,
  );
};

export const listNotifications = async (userId: string, limit: number, cursor: number | null): Promise<{ items: NotificationPayload[]; nextCursor: number | null }> => {
  const db = await getDb();
  const rows = await db.all<NotificationJoinedRow[]>(
      `SELECT n.id, n.type, n.created_at, n.is_read, n.actor_username,
        u.display_name AS actor_display_name, u.avatar_url AS actor_avatar_url
     FROM notifications n
    LEFT JOIN users u ON u.username = n.actor_username
     WHERE n.username = ?
       AND (? IS NULL OR n.id < ?)
     ORDER BY n.id DESC
     LIMIT ?`,
    userId,
    cursor,
    cursor,
    limit + 1,
  );

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]!.id : null;

  return {
    items: page.map(mapJoinedRow),
    nextCursor,
  };
};
