import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { getDb, getReadOnlyDb } from '../db/sqlite.js';

export const adminRouter = Router();

const postEngagementJoin = 'LEFT JOIN post_engagement pe ON pe.post_id = p.id';

adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

const userBanSchema = z.object({
  isBanned: z.boolean(),
});

adminRouter.get('/users/:username', async (req, res) => {
  const targetUsername = String(req.params.username ?? '').toLowerCase();
  if (!targetUsername) return res.status(400).json({ error: 'Invalid username' });

  const db = await getDb();
  const user = await db.get<{ username: string; role: 'user' | 'admin'; is_banned: 0 | 1 }>(
    'SELECT username, role, is_banned FROM users WHERE username = ?',
    targetUsername,
  );

  if (!user) return res.status(404).json({ error: 'User not found' });

  return res.json({
    id: user.username,
    username: user.username,
    role: user.role,
    isBanned: Boolean(user.is_banned),
  });
});

adminRouter.patch('/users/:username', async (req, res) => {
  const targetUsername = String(req.params.username ?? '').toLowerCase();
  if (!targetUsername) return res.status(400).json({ error: 'Invalid username' });

  const parsed = userBanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const actorUsername = String((req as unknown as AuthedRequest).user.sub).toLowerCase();
  if (actorUsername === targetUsername) return res.status(400).json({ error: 'Cannot ban/unban self' });

  const db = await getDb();
  const existing = await db.get<{ username: string }>('SELECT username FROM users WHERE username = ?', targetUsername);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  await db.run('UPDATE users SET is_banned = ? WHERE username = ?', parsed.data.isBanned ? 1 : 0, targetUsername);
  return res.json({ ok: true });
});

adminRouter.delete('/users/:username', async (req, res) => {
  const targetUsername = String(req.params.username ?? '').toLowerCase();
  if (!targetUsername) return res.status(400).json({ error: 'Invalid username' });

  const actorUsername = String((req as unknown as AuthedRequest).user.sub).toLowerCase();
  if (actorUsername === targetUsername) return res.status(400).json({ error: 'Cannot delete self' });

  const db = await getDb();
  const existing = await db.get<{ username: string }>('SELECT username FROM users WHERE username = ?', targetUsername);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  await db.run('DELETE FROM users WHERE username = ?', targetUsername);
  return res.json({ ok: true });
});

const clampInt = (value: unknown, def: number, min: number, max: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

const seriesDaysSchema = z.object({
  days: z.coerce.number().int().min(7).max(365).optional(),
});

adminRouter.get('/analytics', async (req, res) => {
  const parsed = seriesDaysSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const days = clampInt(parsed.data.days, 30, 7, 365);
  const db = await getDb();

  const totals = await Promise.all([
    db.get<{ c: number }>('SELECT COUNT(*) AS c FROM users'),
    db.get<{ c: number }>('SELECT COUNT(*) AS c FROM posts'),
    db.get<{ c: number }>('SELECT COUNT(*) AS c FROM likes'),
    db.get<{ c: number }>('SELECT COUNT(*) AS c FROM comments'),
  ]);

  const totalUsers = totals[0]?.c ?? 0;
  const totalPosts = totals[1]?.c ?? 0;
  const totalLikes = totals[2]?.c ?? 0;
  const totalComments = totals[3]?.c ?? 0;

  const hasFriendships = Boolean(
    await db.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'friendships'",
    ),
  );

  const newUsersToday = (await db.get<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE date(created_at) = date('now')"))?.c ?? 0;
  const newUsersWeek = (await db.get<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE datetime(created_at) >= datetime('now', '-7 days')"))?.c ?? 0;
  const newUsersMonth = (await db.get<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE datetime(created_at) >= datetime('now', '-30 days')"))?.c ?? 0;

  const series = await db.all<
    {
      day: string;
      new_users: number;
      active_users: number;
      new_posts: number;
      likes: number;
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
       (SELECT COUNT(*) FROM users u WHERE date(u.created_at) = d) AS new_users,
       (
         SELECT COUNT(DISTINCT username) FROM (
           SELECT username FROM posts p WHERE date(p.created_at) = d
           UNION
           SELECT username FROM likes l WHERE date(l.created_at) = d
           UNION
           SELECT username FROM comments c WHERE date(c.created_at) = d
         )
       ) AS active_users,
       (SELECT COUNT(*) FROM posts p WHERE date(p.created_at) = d) AS new_posts,
       (SELECT COUNT(*) FROM likes l WHERE date(l.created_at) = d) AS likes,
       (SELECT COUNT(*) FROM comments c WHERE date(c.created_at) = d) AS comments
     FROM days
     ORDER BY d ASC`,
    `-${days - 1} days`,
  );

  const friendshipTotals = hasFriendships
    ? await Promise.all([
        db.get<{ c: number }>("SELECT COUNT(*) AS c FROM friendships WHERE status = 'accepted'"),
        db.get<{ c: number }>("SELECT COUNT(*) AS c FROM friendships WHERE status = 'pending'"),
        db.get<{ c: number }>("SELECT COUNT(*) AS c FROM friendships WHERE status = 'rejected'"),
      ])
    : [null, null, null];

  const totalFriendshipsAccepted = friendshipTotals[0]?.c ?? 0;
  const totalFriendshipsPending = friendshipTotals[1]?.c ?? 0;
  const totalFriendshipsRejected = friendshipTotals[2]?.c ?? 0;

  const friendshipRequestsToday = hasFriendships
    ? (await db.get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM friendships WHERE date(created_at) = date('now')",
      ))?.c ?? 0
    : 0;

  const friendshipRequestsWeek = hasFriendships
    ? (await db.get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM friendships WHERE datetime(created_at) >= datetime('now', '-7 days')",
      ))?.c ?? 0
    : 0;

  const friendshipRequestsMonth = hasFriendships
    ? (await db.get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM friendships WHERE datetime(created_at) >= datetime('now', '-30 days')",
      ))?.c ?? 0
    : 0;

  const friendshipAcceptedToday = hasFriendships
    ? (await db.get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM friendships WHERE status = 'accepted' AND date(updated_at) = date('now')",
      ))?.c ?? 0
    : 0;

  const friendshipAcceptedWeek = hasFriendships
    ? (await db.get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM friendships WHERE status = 'accepted' AND datetime(updated_at) >= datetime('now', '-7 days')",
      ))?.c ?? 0
    : 0;

  const friendshipAcceptedMonth = hasFriendships
    ? (await db.get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM friendships WHERE status = 'accepted' AND datetime(updated_at) >= datetime('now', '-30 days')",
      ))?.c ?? 0
    : 0;

  const friendshipRequestsInWindow = hasFriendships
    ? (await db.get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM friendships WHERE datetime(created_at) >= datetime('now', ?)",
        `-${days - 1} days`,
      ))?.c ?? 0
    : 0;

  const friendshipAcceptedInWindow = hasFriendships
    ? (await db.get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM friendships WHERE status = 'accepted' AND datetime(updated_at) >= datetime('now', ?)",
        `-${days - 1} days`,
      ))?.c ?? 0
    : 0;

  const friendshipSeries = hasFriendships
    ? await db.all<
        {
          day: string;
          requests: number;
          accepted: number;
        }[]
      >(
        `WITH RECURSIVE days(d) AS (
           SELECT date('now', ?)
           UNION ALL
           SELECT date(d, '+1 day') FROM days WHERE d < date('now')
         )
         SELECT
           d AS day,
           (SELECT COUNT(*) FROM friendships f WHERE date(f.created_at) = d) AS requests,
           (SELECT COUNT(*) FROM friendships f WHERE f.status = 'accepted' AND date(f.updated_at) = d) AS accepted
         FROM days
         ORDER BY d ASC`,
        `-${days - 1} days`,
      )
    : [];

  const topUsersByFriends = hasFriendships
    ? await db.all<{ id: string; username: string; display_name: string | null; friends: number }[]>(
        `WITH edges AS (
           SELECT username1 AS username FROM friendships WHERE status = 'accepted'
           UNION ALL
           SELECT username2 AS username FROM friendships WHERE status = 'accepted'
         )
         SELECT u.username AS id, u.username, u.display_name, COUNT(*) AS friends
         FROM edges e
         JOIN users u ON u.username = e.username
         GROUP BY u.username
         ORDER BY friends DESC
         LIMIT 10`,
      )
    : [];

  const friendshipAcceptanceRateDenom = totalFriendshipsAccepted + totalFriendshipsRejected;
  const friendshipAcceptanceRate = friendshipAcceptanceRateDenom > 0 ? totalFriendshipsAccepted / friendshipAcceptanceRateDenom : 0;
  const avgFriendsPerUser = totalUsers > 0 ? (totalFriendshipsAccepted * 2) / totalUsers : 0;

  const topUsersByPosts = await db.all<
    { id: string; username: string; display_name: string | null; posts: number }[]
  >(
    `SELECT u.username AS id, u.username, u.display_name, COUNT(*) AS posts
     FROM posts p
     JOIN users u ON u.username = p.username
     GROUP BY u.username
     ORDER BY posts DESC
     LIMIT 10`,
  );

  const topUsersByLikesReceived = await db.all<
    { id: string; username: string; display_name: string | null; likes_received: number }[]
  >(
    `SELECT u.username AS id, u.username, u.display_name, COUNT(*) AS likes_received
     FROM likes l
     JOIN posts p ON p.id = l.post_id
     JOIN users u ON u.username = p.username
     GROUP BY u.username
     ORDER BY likes_received DESC
     LIMIT 10`,
  );

  const topUsersByCommentsMade = await db.all<
    { id: string; username: string; display_name: string | null; comments_made: number }[]
  >(
    `SELECT u.username AS id, u.username, u.display_name, COUNT(*) AS comments_made
     FROM comments c
     JOIN users u ON u.username = c.username
     GROUP BY u.username
     ORDER BY comments_made DESC
     LIMIT 10`,
  );

  const mostLikedPosts = await db.all<
    { id: number; text: string; like_count: number; created_at: string; username: string }[]
  >(
    `SELECT p.id, p.text, COALESCE(pe.like_count, 0) AS like_count, p.created_at, u.username
     FROM posts p
     ${postEngagementJoin}
     JOIN users u ON u.username = p.username
     ORDER BY like_count DESC, p.created_at DESC
     LIMIT 10`,
  );

  const mostCommentedPosts = await db.all<
    { id: number; text: string; comment_count: number; created_at: string; username: string }[]
  >(
    `SELECT p.id, p.text, COUNT(c.id) AS comment_count, p.created_at, u.username
     FROM posts p
     JOIN users u ON u.username = p.username
     LEFT JOIN comments c ON c.post_id = p.id
     GROUP BY p.id
     ORDER BY comment_count DESC, p.created_at DESC
     LIMIT 10`,
  );

  const postsPerUserBuckets = await db.all<
    { bucket: string; count: number }[]
  >(
    `WITH per_user AS (
       SELECT u.username AS username, COALESCE(COUNT(p.id), 0) AS post_count
       FROM users u
       LEFT JOIN posts p ON p.username = u.username
       GROUP BY u.username
     )
     SELECT
       CASE
         WHEN post_count = 0 THEN '0'
         WHEN post_count = 1 THEN '1'
         WHEN post_count BETWEEN 2 AND 3 THEN '2-3'
         WHEN post_count BETWEEN 4 AND 5 THEN '4-5'
         WHEN post_count BETWEEN 6 AND 10 THEN '6-10'
         ELSE '11+'
       END AS bucket,
       COUNT(*) AS count
     FROM per_user
     GROUP BY bucket
     ORDER BY
       CASE bucket
         WHEN '0' THEN 0
         WHEN '1' THEN 1
         WHEN '2-3' THEN 2
         WHEN '4-5' THEN 3
         WHEN '6-10' THEN 4
         ELSE 5
       END`,
  );

  const likeToPostRatio = totalPosts > 0 ? totalLikes / totalPosts : 0;
  const commentToPostRatio = totalPosts > 0 ? totalComments / totalPosts : 0;

  const adminUserId = String((req as AuthedRequest).user.sub).toLowerCase();

  return res.json({
    generatedAt: new Date().toISOString(),
    days,
    requester: { userId: adminUserId },
    users: {
      total: totalUsers,
      new: { today: newUsersToday, week: newUsersWeek, month: newUsersMonth },
      series: series.map((r) => ({ day: r.day, newUsers: r.new_users, activeUsers: r.active_users })),
      top: {
        byPosts: topUsersByPosts.map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, value: u.posts })),
        byLikesReceived: topUsersByLikesReceived.map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.display_name,
          value: u.likes_received,
        })),
        byCommentsMade: topUsersByCommentsMade.map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.display_name,
          value: u.comments_made,
        })),
      },
    },
    posts: {
      total: totalPosts,
      series: series.map((r) => ({ day: r.day, newPosts: r.new_posts })),
      mostLiked: mostLikedPosts.map((p) => ({ id: p.id, text: p.text, likeCount: p.like_count, createdAt: p.created_at, username: p.username })),
      mostCommented: mostCommentedPosts.map((p) => ({ id: p.id, text: p.text, commentCount: p.comment_count, createdAt: p.created_at, username: p.username })),
      perUserAverage: totalUsers > 0 ? totalPosts / totalUsers : 0,
      perUserBuckets: postsPerUserBuckets.map((b) => ({ bucket: b.bucket, count: b.count })),
    },
    engagement: {
      totalLikes,
      totalComments,
      series: series.map((r) => ({ day: r.day, likes: r.likes, comments: r.comments })),
      likeToPostRatio,
      commentToPostRatio,
    },
    friends: {
      totalAccepted: totalFriendshipsAccepted,
      totalPending: totalFriendshipsPending,
      totalRejected: totalFriendshipsRejected,
      requests: {
        today: friendshipRequestsToday,
        week: friendshipRequestsWeek,
        month: friendshipRequestsMonth,
        window: friendshipRequestsInWindow,
      },
      accepted: {
        today: friendshipAcceptedToday,
        week: friendshipAcceptedWeek,
        month: friendshipAcceptedMonth,
        window: friendshipAcceptedInWindow,
      },
      acceptanceRate: friendshipAcceptanceRate,
      avgFriendsPerUser,
      series: friendshipSeries.map((r) => ({ day: r.day, requests: r.requests, accepted: r.accepted })),
      topByFriends: topUsersByFriends.map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, value: u.friends })),
    },
  });
});

const sqlSchema = z.object({
  query: z.string().min(1).max(20000),
});

const normalizeSql = (sql: string): string => {
  return sql.replace(/\s+/g, ' ').trim();
};

const isReadOnlySql = (sql: string): boolean => {
  const s = normalizeSql(sql).toLowerCase();
  if (!s) return false;

  // Disallow multiple statements.
  const semis = (sql.match(/;/g) ?? []).length;
  if (semis > 1) return false;
  if (semis === 1 && !sql.trim().endsWith(';')) return false;

  // Must be SELECT-ish.
  if (!(s.startsWith('select ') || s.startsWith('with '))) return false;

  // Block dangerous keywords even inside a WITH.
  const blocked = ['insert ', 'update ', 'delete ', 'drop ', 'alter ', 'create ', 'vacuum', 'attach ', 'detach ', 'pragma '];
  if (blocked.some((k) => s.includes(k))) return false;

  return true;
};

const enforceLimit = (sql: string, limit: number): string => {
  const trimmed = sql.trim().replace(/;\s*$/, '');
  const s = normalizeSql(trimmed).toLowerCase();
  if (s.includes(' limit ')) return trimmed;
  return `${trimmed} LIMIT ${limit}`;
};

adminRouter.post('/sql', async (req, res) => {
  const parsed = sqlSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const query = parsed.data.query;
  if (!isReadOnlySql(query)) return res.status(400).json({ error: 'Only single-statement SELECT queries are allowed' });

  const roDb = await getReadOnlyDb();
  const limited = enforceLimit(query, 200);
  const startedAt = performance.now();
  try {
    const rows = await roDb.all<Record<string, unknown>[]>(limited);
    const executionMs = performance.now() - startedAt;
    const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
    const values = rows.map((r) => columns.map((c) => r[c]));

    return res.json({
      columns,
      rows: values,
      rowCount: rows.length,
      limited: limited !== query.trim().replace(/;\s*$/, ''),
      executionMs,
    });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Query failed' });
  }
});
