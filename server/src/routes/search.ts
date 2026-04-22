import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { optionalAuth, type MaybeAuthedRequest } from '../middleware/auth.js';
import { publishDueScheduledPosts } from '../services/publish.js';

export const searchRouter = Router();

const postEngagementJoin = 'LEFT JOIN post_engagement pe ON pe.post_id = p.id';
const postBaseColumns = `
           p.id, p.text, p.image_url, p.category, p.visibility, p.status, p.scheduled_publish_at, p.published_at,
           COALESCE(pe.like_count, 0) AS like_count, COALESCE(pe.collect_count, 0) AS collect_count, p.created_at, p.updated_at,
           u.username, u.display_name, u.avatar_url`;

const querySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

searchRouter.get('/', optionalAuth, async (req, res) => {
  await publishDueScheduledPosts();
  const parsed = querySchema.safeParse({ q: req.query.q, limit: req.query.limit });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const q = parsed.data.q;
  const limit = parsed.data.limit ?? 20;
  const like = `%${q}%`;
  const maybeUsername = (req as MaybeAuthedRequest).user?.sub ? String((req as MaybeAuthedRequest).user?.sub).toLowerCase() : null;
  const db = await getDb();

  const users = await db.all<
    {
      id: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      status_text: string | null;
    }[]
  >(
    `SELECT username AS id, username, display_name, avatar_url, status_text
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
      category: string;
      visibility: 'public' | 'friends';
      status: 'published';
      scheduled_publish_at: string | null;
      published_at: string | null;
      like_count: number;
      collect_count: number;
      created_at: string;
      updated_at: string | null;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      liked_by_me: 0 | 1;
      collected_by_me: 0 | 1;
    }[]
  >(
    maybeUsername
      ? `SELECT
${postBaseColumns},
             CASE WHEN l.username IS NULL THEN 0 ELSE 1 END AS liked_by_me,
             CASE WHEN pc.username IS NULL THEN 0 ELSE 1 END AS collected_by_me
         FROM posts p
           JOIN users u ON u.username = p.username
         ${postEngagementJoin}
           LEFT JOIN likes l ON l.post_id = p.id AND l.username = ?
           LEFT JOIN post_collections pc ON pc.post_id = p.id AND pc.username = ?
         WHERE p.status = 'published'
           AND (
             p.visibility = 'public'
               OR p.username = ?
             OR (
               p.visibility = 'friends'
               AND EXISTS (
                 SELECT 1 FROM friendships f
                 WHERE f.status = 'accepted'
                     AND (
                       (f.username1 = ? AND f.username2 = ?)
                       OR (f.username1 = ? AND f.username2 = ?)
                     )
               )
             )
           )
           AND (p.text LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?)
         ORDER BY p.created_at DESC
         LIMIT ?`
      : `SELECT
    ${postBaseColumns},
           0 AS liked_by_me,
           0 AS collected_by_me
         FROM posts p
           JOIN users u ON u.username = p.username
         ${postEngagementJoin}
         WHERE p.status = 'published'
           AND p.visibility = 'public'
           AND (p.text LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?)
         ORDER BY p.created_at DESC
         LIMIT ?`,
    ...(maybeUsername ? [maybeUsername, maybeUsername, maybeUsername, maybeUsername, maybeUsername, maybeUsername, maybeUsername, like, like, like, limit] : [like, like, like, limit]),
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
      category: p.category,
      visibility: p.visibility,
      status: p.status,
      scheduledPublishAt: p.scheduled_publish_at,
      publishedAt: p.published_at,
      likeCount: p.like_count,
      collectCount: p.collect_count,
      likedByMe: Boolean(p.liked_by_me),
      collectedByMe: Boolean(p.collected_by_me),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      user: { username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url },
    })),
  });
});
