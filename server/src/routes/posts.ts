import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { optionalAuth, requireAuth, type AuthedRequest, type MaybeAuthedRequest } from '../middleware/auth.js';
import { emitEvent, emitToUserRoom } from '../realtime.js';
import { areFriends, canViewPostByOwner, type PostVisibility } from '../social/visibility.js';
import { postCategories, type PostCategory } from '../social/categories.js';
import { createNotification, type NotificationPayload } from '../services/notifications.js';
import { publishDueScheduledPosts } from '../services/publish.js';
import { buildImageInputSchema } from '../validation/image.js';

export const postsRouter = Router();

type PostStatus = 'draft' | 'scheduled' | 'published';
const postImageInputSchema = buildImageInputSchema(1_500_000, 'Post image');
const emitNotification = (userId: string, notification: NotificationPayload) => {
  emitToUserRoom(userId, { type: 'notification_created', notification });
};

type PostRow = {
  id: number;
  user_id: string;
  text: string;
  image_url: string | null;
  category: PostCategory;
  visibility: PostVisibility;
  status: PostStatus;
  scheduled_publish_at: string | null;
  published_at: string | null;
  like_count: number;
  collect_count: number;
  created_at: string;
  updated_at: string | null;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  liked_by_me?: 0 | 1;
  collected_by_me?: 0 | 1;
};

const postStatusSchema = z.enum(['draft', 'scheduled', 'published']);

const createPostSchema = z.object({
  text: z.string().max(5000).optional(),
  imageUrl: postImageInputSchema.optional().nullable().or(z.literal('')),
  visibility: z.enum(['public', 'friends']).optional(),
  category: z.enum(postCategories).optional(),
  status: postStatusSchema.optional(),
  scheduledPublishAt: z.string().datetime().optional().nullable().or(z.literal('')),
});

const editPostSchema = createPostSchema;

const feedQuerySchema = z.object({
  sort: z.enum(['new', 'popular']).optional(),
  scope: z.enum(['global', 'friends']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().optional(),
  category: z.enum(postCategories).optional(),
});

const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).optional(),
});

const feedCursorSeparator = '::';
const postEngagementJoin = 'LEFT JOIN post_engagement pe ON pe.post_id = p.id';
const postBaseColumns = `
       p.id, p.text, p.image_url, p.category, p.visibility, p.status,
       p.scheduled_publish_at, p.published_at,
  p.username AS user_id,
       COALESCE(pe.like_count, 0) AS like_count,
       COALESCE(pe.collect_count, 0) AS collect_count,
  p.created_at, p.updated_at,
       u.username, u.display_name, u.avatar_url`;
const popularLikeCountExpr = 'COALESCE(pe.like_count, 0)';

const formatPost = (row: PostRow) => ({
  id: row.id,
  text: row.text,
  imageUrl: row.image_url,
  category: row.category ?? 'all',
  visibility: (row.visibility ?? 'public') as PostVisibility,
  status: row.status,
  scheduledPublishAt: row.scheduled_publish_at,
  publishedAt: row.published_at,
  likeCount: row.like_count,
  collectCount: row.collect_count,
  likedByMe: Boolean(row.liked_by_me),
  collectedByMe: Boolean(row.collected_by_me),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  user: {
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  },
});

const requirePublishableContent = (text: string, imageUrl: string) => {
  if (!text && !imageUrl) {
    throw new Error('Post requires text or image');
  }
};

const resolvePostLifecycle = (input: {
  text: string;
  imageUrl: string;
  status: PostStatus;
  scheduledPublishAt: string | null;
}) => {
  if (input.status === 'draft') {
    return {
      status: 'draft' as const,
      scheduledPublishAt: null,
      publishedAt: null,
      draftSavedAt: new Date().toISOString(),
    };
  }

  requirePublishableContent(input.text, input.imageUrl);

  if (input.status === 'scheduled') {
    if (!input.scheduledPublishAt) {
      throw new Error('Scheduled posts require a publish time');
    }
    const scheduledAt = new Date(input.scheduledPublishAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new Error('Scheduled posts require a valid publish time');
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new Error('Scheduled posts must be set in the future');
    }
    return {
      status: 'scheduled' as const,
      scheduledPublishAt: input.scheduledPublishAt,
      publishedAt: null,
      draftSavedAt: null,
    };
  }

  return {
    status: 'published' as const,
    scheduledPublishAt: null,
    publishedAt: new Date().toISOString(),
    draftSavedAt: null,
  };
};

const resolveFeedCursor = (sort: 'new' | 'popular', cursor: string | null): { clause: string; params: Array<string | number> } => {
  if (!cursor) return { clause: '', params: [] };

  if (sort === 'popular') {
    const [likeCountRaw, createdAt] = cursor.split(feedCursorSeparator);
    const likeCount = Number(likeCountRaw);
    if (!Number.isFinite(likeCount) || !createdAt) {
      throw new Error('Invalid cursor');
    }

    return {
      clause: `AND (${popularLikeCountExpr} < ? OR (${popularLikeCountExpr} = ? AND p.created_at < ?))`,
      params: [likeCount, likeCount, createdAt],
    };
  }

  return {
    clause: 'AND p.created_at < ?',
    params: [cursor],
  };
};

const encodeFeedCursor = (sort: 'new' | 'popular', row: Pick<PostRow, 'created_at' | 'like_count'>): string => {
  return sort === 'popular' ? `${row.like_count}${feedCursorSeparator}${row.created_at}` : row.created_at;
};

const assertPostEditor = async (postId: number, username: string, role: 'user' | 'admin') => {
  const db = await getDb();
  const row = await db.get<{ user_id: string }>('SELECT username AS user_id FROM posts WHERE id = ?', postId);
  if (!row) throw new Error('Not found');
  if (row.user_id !== username && role !== 'admin') throw new Error('Forbidden');
};

postsRouter.get('/collections/mine', requireAuth, async (req, res) => {
  await publishDueScheduledPosts();
  const username = String((req as AuthedRequest).user.sub).toLowerCase();
  const limit = Math.min(Number(req.query.limit ?? 30), 50);
  const cursor = req.query.cursor ? Number(req.query.cursor) : null;
  const db = await getDb();

  const rows = await db.all<(PostRow & { collection_cursor: number })[]>(
    `SELECT
       pc.rowid AS collection_cursor,
${postBaseColumns},
       CASE WHEN l.username IS NULL THEN 0 ELSE 1 END AS liked_by_me,
       1 AS collected_by_me
     FROM post_collections pc
     JOIN posts p ON p.id = pc.post_id
     JOIN users u ON u.username = p.username
     ${postEngagementJoin}
     LEFT JOIN likes l ON l.post_id = p.id AND l.username = ?
     WHERE pc.username = ?
       AND p.status = 'published'
       AND (
         p.visibility = 'public'
         OR p.username = ?
         OR (
           p.visibility = 'friends'
           AND EXISTS (
             SELECT 1 FROM friendships f
             WHERE f.status = 'accepted'
               AND f.username1 = CASE WHEN p.username < ? THEN p.username ELSE ? END
               AND f.username2 = CASE WHEN p.username < ? THEN ? ELSE p.username END
           )
         )
       )
       AND (? IS NULL OR pc.rowid < ?)
     ORDER BY pc.rowid DESC
     LIMIT ?`,
    username,
    username,
    username,
    username,
    username,
    username,
    username,
    cursor,
    cursor,
    limit + 1,
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.collection_cursor ?? null : null;

  return res.json({ items: items.map(formatPost), nextCursor });
});

postsRouter.get('/mine/manage', requireAuth, async (req, res) => {
  await publishDueScheduledPosts();
  const username = String((req as AuthedRequest).user.sub).toLowerCase();
  const db = await getDb();
  const rows = await db.all<PostRow[]>(
    `SELECT
${postBaseColumns},
       0 AS liked_by_me,
       0 AS collected_by_me
     FROM posts p
    JOIN users u ON u.username = p.username
    ${postEngagementJoin}
    WHERE p.username = ?
     ORDER BY
       CASE p.status
         WHEN 'draft' THEN 0
         WHEN 'scheduled' THEN 1
         ELSE 2
       END,
       COALESCE(p.updated_at, p.created_at) DESC
     LIMIT 50`,
    username,
  );

  return res.json({ items: rows.map(formatPost) });
});

postsRouter.get('/feed', optionalAuth, async (req, res) => {
  await publishDueScheduledPosts();
  const parsed = feedQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const sort = parsed.data.sort ?? 'new';
  const scope = parsed.data.scope ?? 'global';
  const limit = parsed.data.limit ?? 20;
  const cursor = parsed.data.cursor ?? null;
  const category = parsed.data.category ?? 'all';

  const maybeUsername = (req as MaybeAuthedRequest).user?.sub ? String((req as MaybeAuthedRequest).user?.sub).toLowerCase() : null;
  if (scope === 'friends' && !maybeUsername) return res.status(401).json({ error: 'Login required' });

  const db = await getDb();
  const orderBy = sort === 'popular' ? `${popularLikeCountExpr} DESC, p.created_at DESC` : 'p.created_at DESC';
  let cursorClause = '';
  let cursorParams: Array<string | number> = [];
  try {
    const resolvedCursor = resolveFeedCursor(sort, cursor);
    cursorClause = resolvedCursor.clause;
    cursorParams = resolvedCursor.params;
  } catch {
    return res.status(400).json({ error: 'Invalid query' });
  }
  const categoryClause = category === 'all' ? '' : 'AND p.category = ?';
  const filterParams: Array<string | number> = [...cursorParams, ...(category === 'all' ? [] : [category]), limit + 1];

  const rows = await db.all<PostRow[]>(
    maybeUsername
      ? scope === 'friends'
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
               p.username = ?
               OR (
                 p.visibility IN ('public', 'friends')
                 AND EXISTS (
                   SELECT 1 FROM friendships f
                   WHERE f.status = 'accepted'
                     AND f.username1 = CASE WHEN p.username < ? THEN p.username ELSE ? END
                     AND f.username2 = CASE WHEN p.username < ? THEN ? ELSE p.username END
                 )
               )
             )
             ${cursorClause}
             ${categoryClause}
           ORDER BY ${orderBy}
           LIMIT ?`
        : `SELECT
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
                     AND f.username1 = CASE WHEN p.username < ? THEN p.username ELSE ? END
                     AND f.username2 = CASE WHEN p.username < ? THEN ? ELSE p.username END
                 )
               )
             )
             ${cursorClause}
             ${categoryClause}
           ORDER BY ${orderBy}
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
           ${cursorClause}
           ${categoryClause}
         ORDER BY ${orderBy}
         LIMIT ?`,
    ...(maybeUsername
      ? scope === 'friends'
        ? [maybeUsername, maybeUsername, maybeUsername, maybeUsername, maybeUsername, maybeUsername, maybeUsername, ...filterParams]
        : [maybeUsername, maybeUsername, maybeUsername, maybeUsername, maybeUsername, maybeUsername, maybeUsername, ...filterParams]
      : filterParams),
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0 ? encodeFeedCursor(sort, items[items.length - 1]!) : null;
  return res.json({ items: items.map(formatPost), nextCursor });
});

postsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const username = String((req as AuthedRequest).user.sub).toLowerCase();
  const text = (parsed.data.text ?? '').trim();
  const imageUrl = (parsed.data.imageUrl ?? '').trim();
  const visibility: PostVisibility = parsed.data.visibility ?? 'public';
  const category: PostCategory = parsed.data.category ?? 'all';
  const status = parsed.data.status ?? 'published';

  let lifecycle;
  try {
    lifecycle = resolvePostLifecycle({
      text,
      imageUrl,
      status,
      scheduledPublishAt: parsed.data.scheduledPublishAt ? parsed.data.scheduledPublishAt : null,
    });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid post state' });
  }

  const db = await getDb();
  const result = await db.run(
    `INSERT INTO posts(
       username, text, image_url, visibility, category, status,
       scheduled_publish_at, published_at, draft_saved_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    username,
    text,
    imageUrl ? imageUrl : null,
    visibility,
    category,
    lifecycle.status,
    lifecycle.scheduledPublishAt,
    lifecycle.publishedAt,
    lifecycle.draftSavedAt,
  );

  const postId = result.lastID as number;
  if (lifecycle.status === 'published') emitEvent({ type: 'post_created', postId });
  return res.json({ id: postId, status: lifecycle.status });
});

postsRouter.get('/user/:username', optionalAuth, async (req, res) => {
  await publishDueScheduledPosts();
  const username = String(req.params.username ?? '').toLowerCase();
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const cursor = req.query.cursor ? String(req.query.cursor) : null;
  const maybeUsername = (req as MaybeAuthedRequest).user?.sub ? String((req as MaybeAuthedRequest).user?.sub).toLowerCase() : null;

  const db = await getDb();
  const owner = await db.get<{ username: string }>('SELECT username FROM users WHERE username = ?', username);
  if (!owner) return res.status(404).json({ error: 'Not found' });

  let visibilityWhere = "AND p.visibility = 'public'";
  if (maybeUsername) {
    if (maybeUsername === owner.username) {
      visibilityWhere = '';
    } else {
      const isFriend = await areFriends(maybeUsername, owner.username);
      visibilityWhere = isFriend ? "AND p.visibility IN ('public','friends')" : "AND p.visibility = 'public'";
    }
  }

  const rows = await db.all<PostRow[]>(
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
         WHERE p.username = ?
           AND p.status = 'published'
           ${visibilityWhere}
           ${cursor ? 'AND p.created_at < ?' : ''}
         ORDER BY p.created_at DESC
         LIMIT ?`
      : `SELECT
    ${postBaseColumns},
           0 AS liked_by_me,
           0 AS collected_by_me
         FROM posts p
         JOIN users u ON u.username = p.username
         ${postEngagementJoin}
         WHERE p.username = ?
           AND p.status = 'published'
           ${visibilityWhere}
           ${cursor ? 'AND p.created_at < ?' : ''}
         ORDER BY p.created_at DESC
         LIMIT ?`,
    ...(maybeUsername
      ? cursor
        ? [maybeUsername, maybeUsername, owner.username, cursor, limit + 1]
        : [maybeUsername, maybeUsername, owner.username, limit + 1]
      : cursor
        ? [owner.username, cursor, limit + 1]
        : [owner.username, limit + 1]),
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.created_at ?? null : null;
  return res.json({ items: items.map(formatPost), nextCursor });
});

postsRouter.get('/:id/manage', requireAuth, async (req, res) => {
  await publishDueScheduledPosts();
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });
  const username = String((req as AuthedRequest).user.sub).toLowerCase();
  const role = (req as AuthedRequest).user.role;

  try {
    await assertPostEditor(postId, username, role);
  } catch (error) {
    if (error instanceof Error && error.message === 'Not found') return res.status(404).json({ error: 'Not found' });
    return res.status(403).json({ error: 'Forbidden' });
  }

  const db = await getDb();
  const row = await db.get<PostRow>(
    `SELECT
${postBaseColumns},
       0 AS liked_by_me,
       0 AS collected_by_me
     FROM posts p
     JOIN users u ON u.username = p.username
    ${postEngagementJoin}
     WHERE p.id = ?`,
    postId,
  );
  if (!row) return res.status(404).json({ error: 'Not found' });
  return res.json(formatPost(row));
});

postsRouter.get('/:id/analytics', requireAuth, async (req, res) => {
  await publishDueScheduledPosts();
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const username = String((req as AuthedRequest).user.sub).toLowerCase();
  const role = (req as AuthedRequest).user.role;
  const days = parsed.data.days ?? 14;
  const db = await getDb();

  const post = await db.get<{ id: number; user_id: string; text: string; status: PostStatus; like_count: number; collect_count: number }>(
    `SELECT p.id, p.username AS user_id, p.text, p.status,
            COALESCE(pe.like_count, 0) AS like_count,
            COALESCE(pe.collect_count, 0) AS collect_count
     FROM posts p
     ${postEngagementJoin}
     WHERE p.id = ?`,
    postId,
  );
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (post.user_id !== username && role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const commentCount = post.status === 'published'
    ? (await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM comments WHERE post_id = ?', postId))?.count ?? 0
    : 0;
  const series = await db.all<
    {
      day: string;
      likes: number;
      collects: number;
      comments: number;
    }[]
  >(
    `WITH RECURSIVE days(d) AS (
       SELECT date('now', ?)
       UNION ALL
       SELECT date(d, '+1 day') FROM days WHERE d < date('now')
     )
     SELECT
       d AS day,
       (SELECT COUNT(*) FROM likes l WHERE l.post_id = ? AND date(l.created_at) = d) AS likes,
       (SELECT COUNT(*) FROM post_collections pc WHERE pc.post_id = ? AND date(pc.created_at) = d) AS collects,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = ? AND date(c.created_at) = d) AS comments
     FROM days
     ORDER BY d ASC`,
    `-${days - 1} days`,
    postId,
    postId,
    postId,
  );

  return res.json({
    post: { id: post.id, text: post.text, status: post.status },
    overview: {
      likes: post.like_count,
      collects: post.collect_count,
      comments: commentCount,
    },
    series: series.map((row) => ({
      day: row.day,
      likes: row.likes,
      collects: row.collects,
      comments: post.status === 'published' ? row.comments : 0,
    })),
  });
});

postsRouter.get('/:id', optionalAuth, async (req, res) => {
  await publishDueScheduledPosts();
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

  const viewerUsername = (req as MaybeAuthedRequest).user?.sub ? String((req as MaybeAuthedRequest).user?.sub).toLowerCase() : null;
  const db = await getDb();

  const row = await db.get<(PostRow & { comment_count: number })>(
    `SELECT
${postBaseColumns},
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
       CASE WHEN l.username IS NULL THEN 0 ELSE 1 END AS liked_by_me,
       CASE WHEN pc.username IS NULL THEN 0 ELSE 1 END AS collected_by_me
     FROM posts p
       JOIN users u ON u.username = p.username
       ${postEngagementJoin}
     LEFT JOIN likes l ON l.post_id = p.id AND l.username = ?
     LEFT JOIN post_collections pc ON pc.post_id = p.id AND pc.username = ?
     WHERE p.id = ?`,
      viewerUsername,
      viewerUsername,
    postId,
  );
  if (!row) return res.status(404).json({ error: 'Not found' });

  const canView =
      row.status === 'published' ? await canViewPostByOwner(viewerUsername, row.user_id, row.visibility) : viewerUsername === row.user_id;
  if (!canView) return res.status(403).json({ error: 'Forbidden' });

  return res.json({
    ...formatPost(row),
    commentCount: row.comment_count,
  });
});

postsRouter.put('/:id', requireAuth, async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });
  const parsed = editPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const username = String((req as AuthedRequest).user.sub).toLowerCase();
  const role = (req as AuthedRequest).user.role;
  try {
    await assertPostEditor(postId, username, role);
  } catch (error) {
    if (error instanceof Error && error.message === 'Not found') return res.status(404).json({ error: 'Not found' });
    return res.status(403).json({ error: 'Forbidden' });
  }

  const text = (parsed.data.text ?? '').trim();
  const imageUrl = (parsed.data.imageUrl ?? '').trim();
  const visibility: PostVisibility = parsed.data.visibility ?? 'public';
  const category: PostCategory = parsed.data.category ?? 'all';
  const status = parsed.data.status ?? 'published';

  let lifecycle;
  try {
    lifecycle = resolvePostLifecycle({
      text,
      imageUrl,
      status,
      scheduledPublishAt: parsed.data.scheduledPublishAt ? parsed.data.scheduledPublishAt : null,
    });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid post state' });
  }

  const db = await getDb();
  await db.run(
    `UPDATE posts
     SET text = ?,
         image_url = ?,
         visibility = ?,
         category = ?,
         status = ?,
         scheduled_publish_at = ?,
         published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE NULL END,
         draft_saved_at = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    text,
    imageUrl ? imageUrl : null,
    visibility,
    category,
    lifecycle.status,
    lifecycle.scheduledPublishAt,
    lifecycle.status,
    lifecycle.publishedAt,
    lifecycle.draftSavedAt,
    postId,
  );

  if (lifecycle.status === 'published') emitEvent({ type: 'post_updated', postId });
  return res.json({ ok: true, status: lifecycle.status });
});

postsRouter.delete('/:id', requireAuth, async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });
  const username = String((req as AuthedRequest).user.sub).toLowerCase();
  const role = (req as AuthedRequest).user.role;

  try {
    await assertPostEditor(postId, username, role);
  } catch (error) {
    if (error instanceof Error && error.message === 'Not found') return res.status(404).json({ error: 'Not found' });
    return res.status(403).json({ error: 'Forbidden' });
  }

  const db = await getDb();
  await db.run('DELETE FROM posts WHERE id = ?', postId);
  emitEvent({ type: 'post_deleted', postId });
  return res.json({ ok: true });
});

postsRouter.post('/:id/like', requireAuth, async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

  await publishDueScheduledPosts();
  const username = String((req as AuthedRequest).user.sub).toLowerCase();
  const db = await getDb();
  const postOwner = await db.get<{ user_id: string; visibility: PostVisibility; status: PostStatus }>(
    'SELECT username AS user_id, visibility, status FROM posts WHERE id = ?',
    postId,
  );
  if (!postOwner) return res.status(404).json({ error: 'Post not found' });
  if (postOwner.status !== 'published' || !(await canViewPostByOwner(username, postOwner.user_id, postOwner.visibility))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await db.exec('BEGIN');
  try {
    const existing = await db.get('SELECT 1 FROM likes WHERE username = ? AND post_id = ?', username, postId);
    if (existing) {
      await db.run('DELETE FROM likes WHERE username = ? AND post_id = ?', username, postId);
    } else {
      await db.run('INSERT INTO likes(username, post_id) VALUES (?, ?)', username, postId);
    }

    const row = await db.get<{ like_count: number }>('SELECT like_count FROM post_engagement WHERE post_id = ?', postId);
    let notification: NotificationPayload | null = null;
    if (!existing && postOwner.user_id !== username) {
      notification = await createNotification({
        userId: postOwner.user_id,
        type: 'post_liked',
        actorUsername: username,
      });
    }
    await db.exec('COMMIT');
    const liked = !existing;
    if (notification) emitNotification(postOwner.user_id, notification);
    emitEvent({ type: 'post_liked', postId, likeCount: row?.like_count ?? 0, userId: username, liked });
    return res.json({ liked, likeCount: row?.like_count ?? 0 });
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
});

postsRouter.post('/:id/collect', requireAuth, async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

  await publishDueScheduledPosts();
  const username = String((req as AuthedRequest).user.sub).toLowerCase();
  const db = await getDb();
  const postOwner = await db.get<{ user_id: string; visibility: PostVisibility; status: PostStatus }>(
    'SELECT username AS user_id, visibility, status FROM posts WHERE id = ?',
    postId,
  );
  if (!postOwner) return res.status(404).json({ error: 'Post not found' });
  if (postOwner.status !== 'published' || !(await canViewPostByOwner(username, postOwner.user_id, postOwner.visibility))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await db.exec('BEGIN');
  try {
    const existing = await db.get('SELECT 1 FROM post_collections WHERE username = ? AND post_id = ?', username, postId);
    if (existing) {
      await db.run('DELETE FROM post_collections WHERE username = ? AND post_id = ?', username, postId);
    } else {
      await db.run('INSERT INTO post_collections(username, post_id) VALUES (?, ?)', username, postId);
    }

    const row = await db.get<{ collect_count: number }>('SELECT collect_count FROM post_engagement WHERE post_id = ?', postId);
    await db.exec('COMMIT');
    return res.json({ collected: !existing, collectCount: row?.collect_count ?? 0 });
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
});
