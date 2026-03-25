import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type AccessTokenClaims } from '../auth/tokens.js';
import { getDb } from '../db/sqlite.js';

export type AuthedRequest = Request & { user: AccessTokenClaims };
export type MaybeAuthedRequest = Request & { user?: AccessTokenClaims };

type ActiveAccessTokenClaims = AccessTokenClaims & { sid: string };

const authenticateAccessToken = async (
  token: string,
): Promise<
  | { ok: true; claims: ActiveAccessTokenClaims }
  | { ok: false; status: number; error: string }
> => {
  try {
    const claims = verifyAccessToken(token);
    const sessionId = claims.sid;
    const userId = Number(claims.sub);

    if (!sessionId || !Number.isFinite(userId)) {
      return { ok: false, status: 401, error: 'Invalid or expired token' };
    }

    // Protected routes must honor device logout/session revocation immediately.
    const db = await getDb();
    const row = await db.get<{
      session_id: string;
      username: string;
      role: 'user' | 'admin';
      is_banned: 0 | 1;
      session_expired: 0 | 1;
    }>(
      `SELECT
         s.id AS session_id,
         u.username,
         u.role,
         u.is_banned,
         (s.expires_at <= datetime('now')) AS session_expired
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.user_id = ?`,
      sessionId,
      userId,
    );

    if (!row || row.session_expired) {
      return { ok: false, status: 401, error: 'Invalid or expired token' };
    }

    if (row.is_banned) {
      return { ok: false, status: 403, error: 'Account banned' };
    }

    return {
      ok: true,
      claims: {
        sub: String(userId),
        username: row.username,
        role: row.role,
        sid: row.session_id,
      },
    };
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired token' };
  }
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const token = header.slice('Bearer '.length);
  const auth = await authenticateAccessToken(token);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  (req as AuthedRequest).user = auth.claims;
  next();
};

export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next();

  const token = header.slice('Bearer '.length);
  const auth = await authenticateAccessToken(token);
  if (auth.ok) {
    (req as MaybeAuthedRequest).user = auth.claims;
  }
  next();
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as AuthedRequest).user;
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
};
