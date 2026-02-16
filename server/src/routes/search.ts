import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { optionalAuth, type MaybeAuthedRequest } from '../middleware/auth.js';

export const searchRouter = Router();

const querySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

searchRouter.get('/', optionalAuth, async (req, res) => {
  const parsed = querySchema.safeParse({ q: req.query.q, limit: req.query.limit });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const q = parsed.data.q;
  const limit = parsed.data.limit ?? 20;
  const like = `%${q}%`;

  const maybeUserId = (req as MaybeAuthedRequest).user?.sub ? Number((req as MaybeAuthedRequest).user?.sub) : null;

  const db = await getDb();

  const users = await db.all<
    {
      id: number;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      status_text: string | null;
    }[]
  >(
    `SELECT id, username, display_name, avatar_url, status_text
     FROM users
     WHERE username LIKE ? OR display_name LIKE ?
     ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END, username ASC
     LIMIT ?`,
    like,
    like,
    q,
    limit,
  );

  const posts = await db.all<
    {
      id: number;
      text: string;
      image_url: string | null;
      like_count: number;
      created_at: string;
      updated_at: string | null;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      liked_by_me: 0 | 1;
    }[]
  >(
    maybeUserId
      ? `SELECT p.id, p.text, p.image_url, p.like_count, p.created_at, p.updated_at,
                u.username, u.display_name, u.avatar_url,
                CASE WHEN l.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_me
         FROM posts p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN likes l ON l.post_id = p.id AND l.user_id = ?
         WHERE p.text LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?
         ORDER BY p.created_at DESC
         LIMIT ?`
      : `SELECT p.id, p.text, p.image_url, p.like_count, p.created_at, p.updated_at,
                u.username, u.display_name, u.avatar_url,
                0 AS liked_by_me
         FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE p.text LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?
         ORDER BY p.created_at DESC
         LIMIT ?`,
    ...(maybeUserId ? [maybeUserId, like, like, like, limit] : [like, like, like, limit]),
  );

  return res.json({
    q,
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
      status: u.status_text,
    })),
    posts: posts.map((p) => ({
      id: p.id,
      text: p.text,
      imageUrl: p.image_url,
      likeCount: p.like_count,
      likedByMe: Boolean(p.liked_by_me),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      user: { username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url },
    })),
  });
});
