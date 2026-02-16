import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const meRouter = Router();

const updateMeSchema = z.object({
  displayName: z.string().max(64).optional().or(z.literal('')),
  status: z.string().max(120).optional().or(z.literal('')),
  bio: z.string().max(200).optional().or(z.literal('')),
  avatarUrl: z.string().url().max(500).optional().or(z.literal('')),
});

meRouter.get('/', requireAuth, async (req, res) => {
  const userId = Number((req as AuthedRequest).user.sub);
  const db = await getDb();
  const user = await db.get<{
    id: number;
    username: string;
    role: 'user' | 'admin';
    display_name: string | null;
    status_text: string | null;
    bio: string | null;
    avatar_url: string | null;
    created_at: string;
  }>(
    'SELECT id, username, role, display_name, status_text, bio, avatar_url, created_at FROM users WHERE id = ?',
    userId,
  );
  if (!user) return res.status(404).json({ error: 'Not found' });

  return res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name,
    status: user.status_text,
    bio: user.bio,
    avatarUrl: user.avatar_url,
    createdAt: user.created_at,
  });
});

meRouter.patch('/', requireAuth, async (req, res) => {
  if (typeof req.body === 'object' && req.body && 'username' in (req.body as Record<string, unknown>)) {
    return res.status(400).json({ error: 'Username cannot be changed' });
  }

  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const userId = Number((req as AuthedRequest).user.sub);
  const db = await getDb();

  const { displayName, status, bio, avatarUrl } = parsed.data;

  const toNullIfEmpty = (v: string | undefined): string | null | undefined => {
    if (v === undefined) return undefined;
    const t = v.trim();
    return t ? t : null;
  };

  const newDisplayName = toNullIfEmpty(displayName);
  const newStatus = toNullIfEmpty(status);
  const newBio = toNullIfEmpty(bio);
  const newAvatarUrl = toNullIfEmpty(avatarUrl);

  await db.run(
    `UPDATE users
     SET display_name = COALESCE(?, display_name),
         status_text = COALESCE(?, status_text),
         bio = COALESCE(?, bio),
         avatar_url = COALESCE(?, avatar_url)
     WHERE id = ?`,
    newDisplayName === undefined ? null : newDisplayName,
    newStatus === undefined ? null : newStatus,
    newBio === undefined ? null : newBio,
    newAvatarUrl === undefined ? null : newAvatarUrl,
    userId,
  );

  const user = await db.get<{
    id: number;
    username: string;
    role: 'user' | 'admin';
    display_name: string | null;
    status_text: string | null;
    bio: string | null;
    avatar_url: string | null;
    created_at: string;
  }>(
    'SELECT id, username, role, display_name, status_text, bio, avatar_url, created_at FROM users WHERE id = ?',
    userId,
  );

  if (!user) return res.status(404).json({ error: 'Not found' });

  return res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name,
    status: user.status_text,
    bio: user.bio,
    avatarUrl: user.avatar_url,
    createdAt: user.created_at,
  });
});

meRouter.delete('/', requireAuth, async (req, res) => {
  const userId = Number((req as AuthedRequest).user.sub);
  const db = await getDb();
  await db.run('DELETE FROM users WHERE id = ?', userId);
  return res.json({ ok: true });
});
