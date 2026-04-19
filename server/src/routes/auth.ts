import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { signAccessToken } from '../auth/tokens.js';
import { avatarInputSchema } from '../validation/avatar.js';

const normalizeUsername = (username: string) => username.toLowerCase();

const signupSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(128),
  displayName: z.string().min(1).max(64).optional(),
  status: z.string().max(120).optional(),
  bio: z.string().max(200).optional(),
  avatarUrl: avatarInputSchema.optional(),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { username: rawUsername, password, displayName, status, bio, avatarUrl } = parsed.data;
  const username = normalizeUsername(rawUsername);
  const db = await getDb();

  const existing = await db.get('SELECT id FROM users WHERE lower(username) = lower(?)', username);
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const passwordHash = await hashPassword(password);

  const result = await db.run(
    'INSERT INTO users(username, password_hash, role, display_name, status_text, bio, avatar_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
    username,
    passwordHash,
    'user',
    displayName ?? null,
    status ?? null,
    bio ?? null,
    avatarUrl ?? null,
  );

  const userId = result.lastID as number;
  const role = 'user' as const;
  const accessToken = signAccessToken({ sub: String(userId), username, role });

  return res.json({
    accessToken,
    user: {
      id: userId,
      username,
      role,
      displayName: displayName ?? null,
      status: status ?? null,
      bio: bio ?? null,
      avatarUrl: avatarUrl ?? null,
    },
  });
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { username: rawUsername, password } = parsed.data;
  const username = normalizeUsername(rawUsername);
  const db = await getDb();
  const user = await db.get<{
    id: number;
    username: string;
    password_hash: string;
    role: 'user' | 'admin';
    display_name: string | null;
    status_text: string | null;
    bio: string | null;
    avatar_url: string | null;
    is_banned: 0 | 1;
  }>(
    'SELECT id, username, password_hash, role, display_name, status_text, bio, avatar_url, is_banned FROM users WHERE lower(username) = lower(?)',
    username,
  );

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.is_banned) return res.status(403).json({ error: 'Account banned' });
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const accessToken = signAccessToken({ sub: String(user.id), username: user.username, role: user.role });

  return res.json({
    accessToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
      status: user.status_text,
      bio: user.bio,
      avatarUrl: user.avatar_url,
    },
  });
});

authRouter.post('/logout', async (req, res) => {
  return res.json({ ok: true });
});
