import { getDb } from '../db/sqlite.js';

export type PostVisibility = 'public' | 'friends';

type PostRow = { user_id: number; visibility: PostVisibility; status: 'draft' | 'scheduled' | 'published' };

export const areFriends = async (viewerId: number, otherUserId: number): Promise<boolean> => {
  if (viewerId === otherUserId) return true;
  const low = Math.min(viewerId, otherUserId);
  const high = Math.max(viewerId, otherUserId);
  const db = await getDb();
  const row = await db.get('SELECT 1 FROM friendships WHERE user_id1 = ? AND user_id2 = ? AND status = \'accepted\'', low, high);
  return Boolean(row);
};

export const canViewPostByOwner = async (viewerId: number | null, ownerUserId: number, visibility: PostVisibility): Promise<boolean> => {
  if (visibility === 'public') return true;
  if (!viewerId) return false;
  if (viewerId === ownerUserId) return true;
  return areFriends(viewerId, ownerUserId);
};

export const canViewPost = async (postId: number, viewerId: number | null): Promise<boolean> => {
  const db = await getDb();
  const row = await db.get<PostRow>('SELECT user_id, visibility, status FROM posts WHERE id = ?', postId);
  if (!row) return false;
  if (row.status !== 'published') return viewerId === row.user_id;
  return canViewPostByOwner(viewerId, row.user_id, row.visibility);
};
