import { getDb } from '../db/sqlite.js';

export type NotificationPayload = {
  id: number;
  type: string;
  createdAt: string;
  isRead: boolean;
  actorUser?: { id: string; username: string; displayName: string | null; avatarUrl: string | null } | null;
  entity?: { type: string; id: string | number } | null;
};

type NotificationJoinedRow = {
  id: number;
  type: string;
  created_at: string;
  is_read: 0 | 1;
  actor_user_id: string | null;
  entity_type: string | null;
  entity_id: number | null;
  actor_username: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
};

const mapJoinedRow = (row: NotificationJoinedRow): NotificationPayload => {
  const actor = row.actor_user_id
    ? {
        id: row.actor_username ?? row.actor_user_id,
        username: row.actor_username ?? row.actor_user_id,
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
    entity: row.entity_type && row.entity_id ? { type: row.entity_type, id: row.entity_id } : null,
  };
};

export const getNotificationById = async (id: number): Promise<NotificationPayload | null> => {
  const db = await getDb();
  const row = await db.get<NotificationJoinedRow>(
    `SELECT n.id, n.type, n.created_at, n.is_read, n.actor_user_id, n.entity_type, n.entity_id,
            u.username AS actor_username, u.display_name AS actor_display_name, u.avatar_url AS actor_avatar_url
     FROM notifications n
     LEFT JOIN users u ON u.username = n.actor_user_id
     WHERE n.id = ?`,
    id,
  );
  if (!row) return null;
  return mapJoinedRow(row);
};

export const createNotification = async (input: {
  userId: string;
  type: string;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | number | null;
}): Promise<NotificationPayload | null> => {
  const db = await getDb();
  const result = await db.run(
    'INSERT INTO notifications(user_id, type, actor_user_id, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)',
    input.userId,
    input.type,
    input.actorUserId ?? null,
    input.entityType ?? null,
    input.entityId ?? null,
  );

  const id = result.lastID as number;
  return getNotificationById(id);
};

export const listNotifications = async (userId: string, limit: number, cursor: number | null): Promise<{ items: NotificationPayload[]; nextCursor: number | null }> => {
  const db = await getDb();
  const rows = await db.all<NotificationJoinedRow[]>(
    `SELECT n.id, n.type, n.created_at, n.is_read, n.actor_user_id, n.entity_type, n.entity_id,
            u.username AS actor_username, u.display_name AS actor_display_name, u.avatar_url AS actor_avatar_url
     FROM notifications n
    LEFT JOIN users u ON u.username = n.actor_user_id
     WHERE n.user_id = ?
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
