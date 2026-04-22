import { getDb } from '../db/sqlite.js';

export type PostVisibility = 'public' | 'friends';

type PostRow = { user_id: string; visibility: PostVisibility; status: 'draft' | 'scheduled' | 'published' };

export const areFriends = async (viewerUsername: string, otherUsername: string): Promise<boolean> => {
  if (viewerUsername === otherUsername) return true;
  const db = await getDb();
  const row = await db.get(
    `SELECT 1
     FROM friendships
     WHERE status = 'accepted'
       AND ((username1 = ? AND username2 = ?) OR (username1 = ? AND username2 = ?))
     LIMIT 1`,
    viewerUsername,
    otherUsername,
    otherUsername,
    viewerUsername,
  );
  return Boolean(row);
};

export const canViewPostByOwner = async (viewerUsername: string | null, ownerUsername: string, visibility: PostVisibility): Promise<boolean> => {
  if (visibility === 'public') return true;
  if (!viewerUsername) return false;
  if (viewerUsername === ownerUsername) return true;
  return areFriends(viewerUsername, ownerUsername);
};

export const canViewPost = async (postId: number, viewerUsername: string | null): Promise<boolean> => {
  const db = await getDb();
  const row = await db.get<PostRow>('SELECT username AS user_id, visibility, status FROM posts WHERE id = ?', postId);
  if (!row) return false;
  if (row.status !== 'published') return viewerUsername === row.user_id;
  return canViewPostByOwner(viewerUsername, row.user_id, row.visibility);
};
