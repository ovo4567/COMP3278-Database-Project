import { Router } from 'express';
import { getDb } from '../db/sqlite.js';
import { optionalAuth, type MaybeAuthedRequest } from '../middleware/auth.js';
import { areFriends } from '../social/visibility.js';

export const usersRouter = Router();

usersRouter.get('/:username', optionalAuth, async (req, res) => {
  const username = String(req.params.username ?? '').toLowerCase();
  if (!username) return res.status(400).json({ error: 'Invalid username' });

  const viewerUsername = (req as MaybeAuthedRequest).user?.sub ? String((req as MaybeAuthedRequest).user?.sub).toLowerCase() : null;

  const db = await getDb();
  const user = await db.get<{
    username: string;
    role: 'user' | 'admin';
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    status_text: string | null;
    created_at: string;
    friend_count: number;
  }>(
        `SELECT u.username, u.role, u.display_name, u.bio, u.avatar_url, u.status_text, u.created_at,
          (SELECT COUNT(*) FROM friendships f WHERE f.status = 'accepted' AND (f.user_id1 = u.username OR f.user_id2 = u.username)) AS friend_count
     FROM users u
         WHERE u.username = ?`,
    username,
  );

  if (!user) return res.status(404).json({ error: 'Not found' });

  const viewerIsOwner = viewerUsername === user.username;
  const viewerCanSeeFriendsPosts = viewerIsOwner || (viewerUsername ? await areFriends(viewerUsername, user.username) : false);

  let friendship: { status: 'pending' | 'accepted' | 'rejected'; actionUserId: string | null } | null = null;
  if (viewerUsername && !viewerIsOwner) {
    const low = viewerUsername < user.username ? viewerUsername : user.username;
    const high = viewerUsername < user.username ? user.username : viewerUsername;
    const row = await db.get<{ status: 'pending' | 'accepted' | 'rejected'; action_user_id: string | null }>(
      'SELECT status, action_user_id FROM friendships WHERE user_id1 = ? AND user_id2 = ?',
      low,
      high,
    );
    if (row) friendship = { status: row.status, actionUserId: row.action_user_id };
  }

  const visiblePostsWhere = viewerIsOwner
    ? ''
    : viewerCanSeeFriendsPosts
      ? "AND p.status = 'published' AND p.visibility IN ('public', 'friends')"
      : "AND p.status = 'published' AND p.visibility = 'public'";
  const visibleLikesWhere = viewerIsOwner
    ? ''
    : viewerCanSeeFriendsPosts
      ? "AND p2.status = 'published' AND p2.visibility IN ('public', 'friends')"
      : "AND p2.status = 'published' AND p2.visibility = 'public'";

  const stats = await db.get<{ post_count: number; likes_received: number }>(
    `SELECT
       (SELECT COUNT(*) FROM posts p WHERE p.user_id = ? ${visiblePostsWhere}) AS post_count,
       (SELECT COUNT(*)
        FROM likes l
        JOIN posts p2 ON p2.id = l.post_id
        WHERE p2.user_id = ? ${visibleLikesWhere}) AS likes_received`,
    user.username,
    user.username,
  );

  return res.json({
    id: user.username,
    username: user.username,
    role: user.role,
    displayName: user.display_name,
    bio: user.bio,
    avatarUrl: user.avatar_url,
    status: user.status_text,
    createdAt: user.created_at,
    friendCount: user.friend_count,
    friendship,
    stats: {
      postCount: stats?.post_count ?? 0,
      likesReceived: stats?.likes_received ?? 0,
    },
  });
});
