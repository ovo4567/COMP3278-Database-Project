import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { formatLocation } from '../services/location.js';

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

meRouter.get('/devices', requireAuth, async (req, res) => {
  const userId = Number((req as AuthedRequest).user.sub);
  const currentSessionId = (req as AuthedRequest).user.sid ?? null;
  const db = await getDb();
  const rows = await db.all<
    {
      id: string;
      user_agent: string | null;
      ip: string | null;
      country: string | null;
      region: string | null;
      city: string | null;
      created_at: string;
      last_used_at: string;
      expires_at: string;
    }[]
  >(
    `SELECT id, user_agent, ip, country, region, city, created_at, last_used_at, expires_at
     FROM sessions
     WHERE user_id = ?
     ORDER BY datetime(last_used_at) DESC`,
    userId,
  );

  return res.json({
    items: rows.map((row) => ({
      id: row.id,
      userAgent: row.user_agent,
      ip: row.ip,
      location: {
        country: row.country,
        region: row.region,
        city: row.city,
        label: formatLocation({ country: row.country, region: row.region, city: row.city }),
      },
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      current: currentSessionId === row.id,
    })),
  });
});

meRouter.delete('/devices/:sessionId', requireAuth, async (req, res) => {
  const userId = Number((req as AuthedRequest).user.sub);
  const sessionId = String(req.params.sessionId ?? '');
  if (!sessionId) return res.status(400).json({ error: 'Invalid session id' });

  const db = await getDb();
  const result = await db.run('DELETE FROM sessions WHERE id = ? AND user_id = ?', sessionId, userId);
  if ((result.changes ?? 0) === 0) return res.status(404).json({ error: 'Session not found' });
  return res.json({ ok: true });
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

  const updates: string[] = [];
  const params: Array<string | number | null> = [];

  if ('displayName' in parsed.data) {
    updates.push('display_name = ?');
    params.push(newDisplayName ?? null);
  }
  if ('status' in parsed.data) {
    updates.push('status_text = ?');
    params.push(newStatus ?? null);
  }
  if ('bio' in parsed.data) {
    updates.push('bio = ?');
    params.push(newBio ?? null);
  }
  if ('avatarUrl' in parsed.data) {
    updates.push('avatar_url = ?');
    params.push(newAvatarUrl ?? null);
  }

  if (updates.length > 0) {
    await db.run(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = ?`,
      ...params,
      userId,
    );
  }

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
