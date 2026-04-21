import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { optionalAuth, requireAuth, type AuthedRequest, type MaybeAuthedRequest } from '../middleware/auth.js';
import { emitEvent, emitToUserRoom } from '../realtime.js';
import { canViewPost } from '../social/visibility.js';
import { createNotification, type NotificationPayload } from '../services/notifications.js';
import { publishDueScheduledPosts } from '../services/publish.js';

export const commentsRouter = Router();

const createCommentSchema = z.object({
  text: z.string().min(1).max(2000),
});

const emitNotification = (userId: string, notification: NotificationPayload) => {
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
  return db.get<{ id: number; user_id: string; status: 'draft' | 'scheduled' | 'published' }>(
    'SELECT id, username AS user_id, status FROM posts WHERE id = ?',
    postId,
  );
};

commentsRouter.get('/post/:postId', optionalAuth, async (req, res) => {
  await publishDueScheduledPosts();
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

  const viewerUsername = (req as MaybeAuthedRequest).user?.sub ? String((req as MaybeAuthedRequest).user?.sub).toLowerCase() : null;
  const post = await getPublishedPostForDiscussion(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status !== 'published') return res.status(403).json({ error: 'Discussion is unavailable until the post is published' });
  if (!(await canViewPost(postId, viewerUsername))) return res.status(403).json({ error: 'Forbidden' });

  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const cursor = req.query.cursor ? Number(req.query.cursor) : null;
  const db = await getDb();

  const rows = await db.all<
    {
      id: number;
      text: string;
      created_at: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
    }[]
  >(
    `SELECT
       c.id, c.text, c.created_at,
       u.username, u.display_name, u.avatar_url
     FROM comments c
     JOIN users u ON u.username = c.username
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
      text: row.text,
      createdAt: row.created_at,
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

  const username = String((req as AuthedRequest).user.sub).toLowerCase();
  const post = await getPublishedPostForDiscussion(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status !== 'published') return res.status(403).json({ error: 'You can only comment after the post is published' });
  if (!(await canViewPost(postId, username))) return res.status(403).json({ error: 'Forbidden' });
  const db = await getDb();

  const notificationsToEmit: Array<{ userId: string; notification: NotificationPayload }> = [];

  await db.exec('BEGIN');
  try {
    const result = await db.run(
      `INSERT INTO comments(
         post_id, username, text
       ) VALUES (?, ?, ?)`,
      postId,
      username,
      parsed.data.text.trim(),
    );
    const commentId = result.lastID as number;

    if (post.user_id !== username) {
      const notification = await createNotification({
        userId: post.user_id,
        type: 'post_commented',
        actorUsername: username,
      });
      if (notification) notificationsToEmit.push({ userId: post.user_id, notification });
    }

    const mentionedUsernames = extractMentions(parsed.data.text);
    if (mentionedUsernames.length > 0) {
      const placeholders = mentionedUsernames.map(() => '?').join(', ');
      const mentionedUsers = await db.all<{ username: string }[]>(
        `SELECT username FROM users WHERE username IN (${placeholders})`,
        ...mentionedUsernames,
      );

      for (const mentioned of mentionedUsers) {
        if (mentioned.username === username) continue;
        const notification = await createNotification({
          userId: mentioned.username,
          type: 'comment_mention',
          actorUsername: username,
        });
        if (notification) notificationsToEmit.push({ userId: mentioned.username, notification });
      }
    }

    await db.exec('COMMIT');
    for (const entry of notificationsToEmit) emitNotification(entry.userId, entry.notification);
    emitEvent({ type: 'comment_created', postId, commentId });
    return res.json({ id: commentId });
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
});

