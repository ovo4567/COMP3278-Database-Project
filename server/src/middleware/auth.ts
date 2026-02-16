import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type AccessTokenClaims } from '../auth/tokens.js';

export type AuthedRequest = Request & { user: AccessTokenClaims };
export type MaybeAuthedRequest = Request & { user?: AccessTokenClaims };

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const token = header.slice('Bearer '.length);
  try {
    const claims = verifyAccessToken(token);
    (req as AuthedRequest).user = claims;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next();

  const token = header.slice('Bearer '.length);
  try {
    const claims = verifyAccessToken(token);
    (req as MaybeAuthedRequest).user = claims;
  } catch {
    // Ignore invalid tokens for optional auth.
  }
  next();
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as AuthedRequest).user;
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
};
