import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { optionalAuth, type MaybeAuthedRequest } from '../middleware/auth.js';
import { formatLocation } from '../services/location.js';
import { publishDueScheduledPosts } from '../services/publish.js';

export const searchRouter = Router();

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
      category: string;
      visibility: 'public' | 'friends';
      status: 'published';
      scheduled_publish_at: string | null;
      published_at: string | null;
      like_count: number;
      collect_count: number;
      created_at: string;
      updated_at: string | null;
      author_ip: string | null;
      author_country: string | null;
      author_region: string | null;
      author_city: string | null;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      liked_by_me: 0 | 1;
      collected_by_me: 0 | 1;
    }[]
  >(
    maybeUserId
      ? `SELECT
           p.id, p.text, p.image_url, p.category, p.visibility, p.status, p.scheduled_publish_at, p.published_at,
           p.like_count, p.collect_count, p.created_at, p.updated_at,
           p.author_ip, p.author_country, p.author_region, p.author_city,
           u.username, u.display_name, u.avatar_url,
           CASE WHEN l.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_me,
           CASE WHEN pc.user_id IS NULL THEN 0 ELSE 1 END AS collected_by_me
         FROM posts p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN likes l ON l.post_id = p.id AND l.user_id = ?
         LEFT JOIN post_collections pc ON pc.post_id = p.id AND pc.user_id = ?
         WHERE p.status = 'published'
           AND (
             p.visibility = 'public'
             OR p.user_id = ?
             OR (
               p.visibility = 'friends'
               AND EXISTS (
                 SELECT 1 FROM friendships f
                 WHERE f.status = 'accepted'
                   AND f.user_id1 = min(p.user_id, ?)
                   AND f.user_id2 = max(p.user_id, ?)
               )
             )
           )
           AND (p.text LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?)
         ORDER BY p.created_at DESC
         LIMIT ?`
      : `SELECT
           p.id, p.text, p.image_url, p.category, p.visibility, p.status, p.scheduled_publish_at, p.published_at,
         p.like_count, p.collect_count, p.created_at, p.updated_at,
           p.author_ip, p.author_country, p.author_region, p.author_city,
           u.username, u.display_name, u.avatar_url,
           0 AS liked_by_me,
           0 AS collected_by_me
         FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE p.status = 'published'
           AND p.visibility = 'public'
           AND (p.text LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?)
         ORDER BY p.created_at DESC
         LIMIT ?`,
    ...(maybeUserId ? [maybeUserId, maybeUserId, maybeUserId, maybeUserId, maybeUserId, like, like, like, limit] : [like, like, like, limit]),
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
      authorMeta: {
        ip: p.author_ip,
        location: {
          country: p.author_country,
          region: p.author_region,
          city: p.author_city,
          label: formatLocation({ country: p.author_country, region: p.author_region, city: p.author_city }),
        },
      },
      user: { username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url },
    })),
  });
});
