import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/sqlite.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import {
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../auth/tokens.js';
import { config } from '../config.js';
import { lookupLocation } from '../services/location.js';
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

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
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

  const sessionId = uuidv4();
  const refreshToken = signRefreshToken({ sub: sessionId, uid: String(userId), role });
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const location = lookupLocation(req.ip);

  await db.run(
    "INSERT INTO sessions(id, user_id, refresh_token_hash, expires_at, user_agent, ip, country, region, city) VALUES (?, ?, ?, datetime('now', ?), ?, ?, ?, ?, ?)",
    sessionId,
    userId,
    refreshTokenHash,
    `+${config.refreshTokenTtlSeconds} seconds`,
    req.header('user-agent') ?? null,
    req.ip,
    location.country,
    location.region,
    location.city,
  );

  const accessToken = signAccessToken({ sub: String(userId), username, role, sid: sessionId });

  return res.json({
    accessToken,
    refreshToken,
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

  const sessionId = uuidv4();
  const refreshToken = signRefreshToken({ sub: sessionId, uid: String(user.id), role: user.role });
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const location = lookupLocation(req.ip);

  await db.run(
    "INSERT INTO sessions(id, user_id, refresh_token_hash, expires_at, user_agent, ip, country, region, city) VALUES (?, ?, ?, datetime('now', ?), ?, ?, ?, ?, ?)",
    sessionId,
    user.id,
    refreshTokenHash,
    `+${config.refreshTokenTtlSeconds} seconds`,
    req.header('user-agent') ?? null,
    req.ip,
    location.country,
    location.region,
    location.city,
  );

  const accessToken = signAccessToken({ sub: String(user.id), username: user.username, role: user.role, sid: sessionId });

  return res.json({
    accessToken,
    refreshToken,
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

authRouter.post('/refresh', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { refreshToken } = parsed.data;
  let claims;
  try {
    claims = verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const sessionId = claims.sub;
  const userId = Number(claims.uid);

  const db = await getDb();
  const session = await db.get<{ id: string; refresh_token_hash: string; expires_at: string; expired: number }>(
    "SELECT id, refresh_token_hash, expires_at, (expires_at <= datetime('now')) AS expired FROM sessions WHERE id = ? AND user_id = ?",
    sessionId,
    userId,
  );
  if (!session) return res.status(401).json({ error: 'Session not found' });
  if (session.expired) return res.status(401).json({ error: 'Session expired' });

  const incomingHash = hashRefreshToken(refreshToken);
  if (incomingHash !== session.refresh_token_hash) return res.status(401).json({ error: 'Session revoked' });

  const user = await db.get<{ username: string; role: 'user' | 'admin'; is_banned: 0 | 1 }>(
    'SELECT username, role, is_banned FROM users WHERE id = ?',
    userId,
  );
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.is_banned) return res.status(403).json({ error: 'Account banned' });

  await db.run("UPDATE sessions SET last_used_at = datetime('now') WHERE id = ?", sessionId);

  const accessToken = signAccessToken({ sub: String(userId), username: user.username, role: user.role, sid: sessionId });
  return res.json({ accessToken });
});

authRouter.post('/logout', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { refreshToken } = parsed.data;
  try {
    const claims = verifyRefreshToken(refreshToken);
    const db = await getDb();
    await db.run('DELETE FROM sessions WHERE id = ?', claims.sub);
  } catch {
    // ignore
  }

  return res.json({ ok: true });
});
