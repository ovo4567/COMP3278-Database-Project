import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { optionalAuth, requireAuth, type AuthedRequest, type MaybeAuthedRequest } from '../middleware/auth.js';
import { emitEvent, emitToUserRoom } from '../realtime.js';
import { canViewPost } from '../social/visibility.js';
import { createNotification, type NotificationPayload } from '../services/notifications.js';
import { lookupLocation, formatLocation } from '../services/location.js';
import { publishDueScheduledPosts } from '../services/publish.js';

export const commentsRouter = Router();

const createCommentSchema = z.object({
  text: z.string().min(1).max(2000),
  parentCommentId: z.number().int().positive().optional(),
});

const emitNotification = (userId: number, notification: NotificationPayload) => {
  emitToUserRoom(userId, { type: 'notification_created', notification });
};

const mentionRegex = /(^|\s)@([a-zA-Z0-9_]+)/g;

const extractMentions = (text: string): string[] => {
  const mentions = new Set<string>();
  for (const match of text.matchAll(mentionRegex)) {
    const username = match[2]?.toLowerCase();
    if (username) mentions.add(username);
  }
  return [...mentions];
};

const getPublishedPostForDiscussion = async (postId: number) => {
  const db = await getDb();
  return db.get<{ id: number; user_id: number; status: 'draft' | 'scheduled' | 'published' }>(
    'SELECT id, user_id, status FROM posts WHERE id = ?',
    postId,
  );
};

commentsRouter.get('/post/:postId', optionalAuth, async (req, res) => {
  await publishDueScheduledPosts();
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

  const viewerId = (req as MaybeAuthedRequest).user?.sub ? Number((req as MaybeAuthedRequest).user?.sub) : null;
  const post = await getPublishedPostForDiscussion(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status !== 'published') return res.status(403).json({ error: 'Discussion is unavailable until the post is published' });
  if (!(await canViewPost(postId, viewerId))) return res.status(403).json({ error: 'Forbidden' });

  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const cursor = req.query.cursor ? Number(req.query.cursor) : null;
  const db = await getDb();

  const rows = await db.all<
    {
      id: number;
      parent_comment_id: number | null;
      text: string;
      created_at: string;
      author_ip: string | null;
      author_country: string | null;
      author_region: string | null;
      author_city: string | null;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      parent_username: string | null;
      parent_display_name: string | null;
    }[]
  >(
    `SELECT
       c.id, c.parent_comment_id, c.text, c.created_at,
       c.author_ip, c.author_country, c.author_region, c.author_city,
       u.username, u.display_name, u.avatar_url,
       pu.username AS parent_username,
       pu.display_name AS parent_display_name
     FROM comments c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN comments pc ON pc.id = c.parent_comment_id
     LEFT JOIN users pu ON pu.id = pc.user_id
     WHERE c.post_id = ?
       ${cursor ? 'AND c.id < ?' : ''}
     ORDER BY c.id DESC
     LIMIT ?`,
    ...(cursor ? [postId, cursor, limit + 1] : [postId, limit + 1]),
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

  return res.json({
    items: items.map((row) => ({
      id: row.id,
      parentCommentId: row.parent_comment_id,
      text: row.text,
      createdAt: row.created_at,
      authorMeta: {
        ip: row.author_ip,
        location: {
          country: row.author_country,
          region: row.author_region,
          city: row.author_city,
          label: formatLocation({ country: row.author_country, region: row.author_region, city: row.author_city }),
        },
      },
      parentUser: row.parent_username
        ? {
            username: row.parent_username,
            displayName: row.parent_display_name,
          }
        : null,
      user: { username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url },
    })),
    nextCursor,
  });
});

commentsRouter.post('/post/:postId', requireAuth, async (req, res) => {
  await publishDueScheduledPosts();
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const userId = Number((req as AuthedRequest).user.sub);
  const post = await getPublishedPostForDiscussion(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status !== 'published') return res.status(403).json({ error: 'You can only comment after the post is published' });
  if (!(await canViewPost(postId, userId))) return res.status(403).json({ error: 'Forbidden' });
  const db = await getDb();

  let parentCommentAuthorId: number | null = null;
  if (parsed.data.parentCommentId) {
    const parent = await db.get<{ id: number; user_id: number }>(
      'SELECT id, user_id FROM comments WHERE id = ? AND post_id = ?',
      parsed.data.parentCommentId,
      postId,
    );
    if (!parent) return res.status(404).json({ error: 'Parent comment not found' });
    parentCommentAuthorId = parent.user_id;
  }

  const location = lookupLocation(req.ip);
  const result = await db.run(
    `INSERT INTO comments(
       post_id, user_id, parent_comment_id, text,
       author_ip, author_country, author_region, author_city
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    postId,
    userId,
    parsed.data.parentCommentId ?? null,
    parsed.data.text.trim(),
    req.ip ?? null,
    location.country,
    location.region,
    location.city,
  );
  const commentId = result.lastID as number;

  if (parentCommentAuthorId && parentCommentAuthorId !== userId) {
    const notification = await createNotification({
      userId: parentCommentAuthorId,
      type: 'comment_reply',
      actorUserId: userId,
      entityType: 'post',
      entityId: postId,
    });
    if (notification) emitNotification(parentCommentAuthorId, notification);
  }

  const mentionedUsernames = extractMentions(parsed.data.text);
  if (mentionedUsernames.length > 0) {
    const placeholders = mentionedUsernames.map(() => '?').join(', ');
    const mentionedUsers = await db.all<{ id: number; username: string }[]>(
      `SELECT id, username FROM users WHERE lower(username) IN (${placeholders})`,
      ...mentionedUsernames,
    );

    for (const mentioned of mentionedUsers) {
      if (mentioned.id === userId || mentioned.id === parentCommentAuthorId) continue;
      const notification = await createNotification({
        userId: mentioned.id,
        type: 'comment_mention',
        actorUserId: userId,
        entityType: 'post',
        entityId: postId,
      });
      if (notification) emitNotification(mentioned.id, notification);
    }
  }

  emitEvent({ type: 'comment_created', postId, commentId });
  return res.json({ id: commentId });
});

