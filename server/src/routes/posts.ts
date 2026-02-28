import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { optionalAuth, requireAuth, type AuthedRequest, type MaybeAuthedRequest } from '../middleware/auth.js';
import { emitEvent } from '../realtime.js';
import { areFriends, canViewPostByOwner, type PostVisibility } from '../social/visibility.js';

export const postsRouter = Router();

const createPostSchema = z.object({
  text: z.string().min(1).max(5000),
  imageUrl: z.string().url().max(500).optional().or(z.literal('')),
  visibility: z.enum(['public', 'friends']).optional(),
});

const editPostSchema = z.object({
  text: z.string().min(1).max(5000).optional(),
  imageUrl: z.string().url().max(500).optional().or(z.literal('')),
  visibility: z.enum(['public', 'friends']).optional(),
});

postsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const userId = Number((req as AuthedRequest).user.sub);
  const { text, imageUrl } = parsed.data;
  const visibility: PostVisibility = (parsed.data.visibility ?? 'public') as PostVisibility;

  const db = await getDb();
  const result = await db.run(
    'INSERT INTO posts(user_id, text, image_url, visibility) VALUES (?, ?, ?, ?)',
    userId,
    text,
    imageUrl ? imageUrl : null,
    visibility,
  );

  const postId = result.lastID as number;
  emitEvent({ type: 'post_created', postId });
  return res.json({ id: postId });
});

postsRouter.get('/feed', optionalAuth, async (req, res) => {
  const sort = String(req.query.sort ?? 'new');
  const scope = String(req.query.scope ?? 'global');
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const cursor = req.query.cursor ? String(req.query.cursor) : null;

  const maybeUserId = (req as MaybeAuthedRequest).user?.sub ? Number((req as MaybeAuthedRequest).user?.sub) : null;
  if (scope === 'friends' && !maybeUserId) return res.status(401).json({ error: 'Login required' });

  const db = await getDb();

  const orderBy = sort === 'popular' ? 'p.like_count DESC, p.created_at DESC' : 'p.created_at DESC';

  // Cursor is ISO datetime of last post in previous batch.
  const whereCursor = cursor ? "WHERE p.created_at < ?" : '';
  const params = cursor ? [cursor, limit + 1] : [limit + 1];

  const rows = await db.all<{
    id: number;
    text: string;
    image_url: string | null;
    visibility: PostVisibility;
    like_count: number;
    created_at: string;
    updated_at: string | null;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    liked_by_me: 0 | 1;
  }[]>(
    maybeUserId
      ? scope === 'friends'
        ? `SELECT p.id, p.text, p.image_url, p.visibility, p.like_count, p.created_at, p.updated_at,
                  u.username, u.display_name, u.avatar_url,
                  CASE WHEN l.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_me
           FROM posts p
           JOIN users u ON u.id = p.user_id
           LEFT JOIN likes l ON l.post_id = p.id AND l.user_id = ?
           WHERE (
             p.user_id = ?
             OR (
               p.visibility IN ('public', 'friends')
               AND EXISTS (
                 SELECT 1 FROM friendships f
                 WHERE f.status = 'accepted'
                   AND f.user_id1 = min(p.user_id, ?)
                   AND f.user_id2 = max(p.user_id, ?)
               )
             )
           )
           ${whereCursor}
           ORDER BY ${orderBy}
           LIMIT ?`
        : `SELECT p.id, p.text, p.image_url, p.visibility, p.like_count, p.created_at, p.updated_at,
                u.username, u.display_name, u.avatar_url,
                CASE WHEN l.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_me
         FROM posts p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN likes l ON l.post_id = p.id AND l.user_id = ?
         WHERE (
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
         ${whereCursor}
         ORDER BY ${orderBy}
         LIMIT ?`
      : `SELECT p.id, p.text, p.image_url, p.visibility, p.like_count, p.created_at, p.updated_at,
                u.username, u.display_name, u.avatar_url,
                0 AS liked_by_me
         FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE p.visibility = 'public'
         ${whereCursor}
         ORDER BY ${orderBy}
         LIMIT ?`,
    ...(maybeUserId
      ? scope === 'friends'
        ? [maybeUserId, maybeUserId, maybeUserId, maybeUserId, ...params]
        : [maybeUserId, maybeUserId, maybeUserId, maybeUserId, ...params]
      : params),
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.created_at ?? null : null;

  return res.json({
    items: items.map((r) => ({
      id: r.id,
      text: r.text,
      imageUrl: r.image_url,
      likeCount: r.like_count,
      likedByMe: Boolean(r.liked_by_me),
      visibility: (r.visibility ?? 'public') as PostVisibility,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      user: { username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url },
    })),
    nextCursor,
  });
});

postsRouter.get('/user/:username', optionalAuth, async (req, res) => {
  const username = String(req.params.username ?? '').toLowerCase();
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const cursor = req.query.cursor ? String(req.query.cursor) : null;

  const maybeUserId = (req as MaybeAuthedRequest).user?.sub ? Number((req as MaybeAuthedRequest).user?.sub) : null;

  const db = await getDb();
  const whereCursor = cursor ? "AND p.created_at < ?" : '';

  const owner = await db.get<{ id: number }>('SELECT id FROM users WHERE lower(username) = lower(?)', username);
  if (!owner) return res.status(404).json({ error: 'Not found' });

  let visibilityWhere = "AND p.visibility = 'public'";
  const params: Array<string | number> = [owner.id];
  if (maybeUserId) {
    if (maybeUserId === owner.id) {
      visibilityWhere = '';
    } else {
      const isFriend = await areFriends(maybeUserId, owner.id);
      visibilityWhere = isFriend ? "AND p.visibility IN ('public','friends')" : "AND p.visibility = 'public'";
    }
  }

  const rows = await db.all<{
    id: number;
    text: string;
    image_url: string | null;
    like_count: number;
    created_at: string;
    updated_at: string | null;
    visibility: PostVisibility;
  }[]>(
    `SELECT p.id, p.text, p.image_url, p.like_count, p.created_at, p.updated_at, p.visibility
     FROM posts p
     WHERE p.user_id = ?
     ${visibilityWhere}
     ${whereCursor}
     ORDER BY p.created_at DESC
     LIMIT ?`,
    ...(cursor ? [...params, cursor, limit + 1] : [...params, limit + 1]),
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.created_at ?? null : null;

  return res.json({
    items: items.map((r) => ({
      id: r.id,
      text: r.text,
      imageUrl: r.image_url,
      likeCount: r.like_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      visibility: (r.visibility ?? 'public') as PostVisibility,
    })),
    nextCursor,
  });
});

postsRouter.get('/:id', optionalAuth, async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

  const viewerId = (req as MaybeAuthedRequest).user?.sub ? Number((req as MaybeAuthedRequest).user?.sub) : null;

  const db = await getDb();
  const row = await db.get<{
    id: number;
    text: string;
    image_url: string | null;
    visibility: PostVisibility;
    like_count: number;
    created_at: string;
    updated_at: string | null;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    comment_count: number;
    user_id: number;
  }>(
    `SELECT p.id, p.text, p.image_url, p.visibility, p.like_count, p.created_at, p.updated_at,
            u.username, u.display_name, u.avatar_url,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
     FROM posts p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = ?`,
    postId,
  );

  if (!row) return res.status(404).json({ error: 'Not found' });

  const visibility = (row.visibility ?? 'public') as PostVisibility;
  const canView = await canViewPostByOwner(viewerId, row.user_id, visibility);
  if (!canView) return res.status(403).json({ error: 'Forbidden' });

  return res.json({
    id: row.id,
    text: row.text,
    imageUrl: row.image_url,
    likeCount: row.like_count,
    visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: { username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url },
    commentCount: row.comment_count,
  });
});

postsRouter.put('/:id', requireAuth, async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

  const parsed = editPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const userId = Number((req as AuthedRequest).user.sub);
  const role = (req as AuthedRequest).user.role;

  const db = await getDb();
  const post = await db.get<{ user_id: number }>('SELECT user_id FROM posts WHERE id = ?', postId);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (post.user_id !== userId && role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { text, imageUrl } = parsed.data;
  const visibility = parsed.data.visibility as PostVisibility | undefined;
  await db.run(
    "UPDATE posts SET text = COALESCE(?, text), image_url = COALESCE(?, image_url), visibility = COALESCE(?, visibility), updated_at = datetime('now') WHERE id = ?",
    text ?? null,
    imageUrl === '' ? null : (imageUrl ?? null),
    visibility ?? null,
    postId,
  );

  emitEvent({ type: 'post_updated', postId });
  return res.json({ ok: true });
});

postsRouter.delete('/:id', requireAuth, async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

  const userId = Number((req as AuthedRequest).user.sub);
  const role = (req as AuthedRequest).user.role;

  const db = await getDb();
  const post = await db.get<{ user_id: number }>('SELECT user_id FROM posts WHERE id = ?', postId);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (post.user_id !== userId && role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  await db.run('DELETE FROM posts WHERE id = ?', postId);
  emitEvent({ type: 'post_deleted', postId });
  return res.json({ ok: true });
});

postsRouter.post('/:id/like', requireAuth, async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

  const userId = Number((req as AuthedRequest).user.sub);
  const db = await getDb();

  const postOwner = await db.get<{ user_id: number; visibility: PostVisibility }>('SELECT user_id, visibility FROM posts WHERE id = ?', postId);
  if (!postOwner) return res.status(404).json({ error: 'Post not found' });
  if (!(await canViewPostByOwner(userId, postOwner.user_id, postOwner.visibility))) return res.status(403).json({ error: 'Forbidden' });

  await db.exec('BEGIN');
  try {
    const existing = await db.get('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?', userId, postId);

    if (existing) {
      await db.run('DELETE FROM likes WHERE user_id = ? AND post_id = ?', userId, postId);
      await db.run('UPDATE posts SET like_count = MAX(like_count - 1, 0) WHERE id = ?', postId);
    } else {
      await db.run('INSERT INTO likes(user_id, post_id) VALUES (?, ?)', userId, postId);
      await db.run('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', postId);
    }

    const row = await db.get<{ like_count: number }>('SELECT like_count FROM posts WHERE id = ?', postId);
    if (!row) {
      await db.exec('ROLLBACK');
      return res.status(404).json({ error: 'Post not found' });
    }

    await db.exec('COMMIT');

    const liked = !existing;
    emitEvent({ type: 'post_liked', postId, likeCount: row.like_count, userId, liked });
    return res.json({
      liked,
      likeCount: row.like_count,
    });
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
});
