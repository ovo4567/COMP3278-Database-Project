import { getDb } from '../db/sqlite.js';

export type PostVisibility = 'public' | 'friends';

type PostRow = { user_id: string; visibility: PostVisibility; status: 'draft' | 'scheduled' | 'published' };

export const areFriends = async (viewerUsername: string, otherUsername: string): Promise<boolean> => {
  if (viewerUsername === otherUsername) return true;
  const low = viewerUsername < otherUsername ? viewerUsername : otherUsername;
  const high = viewerUsername < otherUsername ? otherUsername : viewerUsername;
  const db = await getDb();
  const row = await db.get('SELECT 1 FROM friendships WHERE user_id1 = ? AND user_id2 = ? AND status = \'accepted\'', low, high);
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
  const row = await db.get<PostRow>('SELECT user_id, visibility, status FROM posts WHERE id = ?', postId);
  if (!row) return false;
  if (row.status !== 'published') return viewerUsername === row.user_id;
  return canViewPostByOwner(viewerUsername, row.user_id, row.visibility);
};
