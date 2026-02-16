import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { optionalAuth, requireAuth, type AuthedRequest, type MaybeAuthedRequest } from '../middleware/auth.js';
import { emitEvent } from '../realtime.js';
import { canViewPost } from '../social/visibility.js';

export const commentsRouter = Router();

const createCommentSchema = z.object({
  text: z.string().min(1).max(2000),
});

commentsRouter.get('/post/:postId', optionalAuth, async (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

  const viewerId = (req as MaybeAuthedRequest).user?.sub ? Number((req as MaybeAuthedRequest).user?.sub) : null;
  if (!(await canViewPost(postId, viewerId))) return res.status(403).json({ error: 'Forbidden' });

  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const cursor = req.query.cursor ? Number(req.query.cursor) : null;

  const db = await getDb();

  const whereCursor = cursor ? 'AND c.id < ?' : '';
  const rows = await db.all<{
    id: number;
    text: string;
    created_at: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  }[]>(
    `SELECT c.id, c.text, c.created_at, u.username, u.display_name, u.avatar_url
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ?
     ${whereCursor}
     ORDER BY c.id DESC
     LIMIT ?`,
    ...(cursor ? [postId, cursor, limit + 1] : [postId, limit + 1]),
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

  return res.json({
    items: items.map((r) => ({
      id: r.id,
      text: r.text,
      createdAt: r.created_at,
      user: { username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url },
    })),
    nextCursor,
  });
});

commentsRouter.post('/post/:postId', requireAuth, async (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const userId = Number((req as AuthedRequest).user.sub);
  const db = await getDb();

  if (!(await canViewPost(postId, userId))) return res.status(403).json({ error: 'Forbidden' });

  const post = await db.get('SELECT id FROM posts WHERE id = ?', postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const result = await db.run('INSERT INTO comments(post_id, user_id, text) VALUES (?, ?, ?)', postId, userId, parsed.data.text);
  const commentId = result.lastID as number;

  emitEvent({ type: 'comment_created', postId, commentId });
  return res.json({ id: commentId });
});
