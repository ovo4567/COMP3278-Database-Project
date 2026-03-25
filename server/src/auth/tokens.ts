import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config.js';

export type AccessTokenClaims = {
  sub: string; // user id
  username: string;
  role: 'user' | 'admin';
  sid?: string;
};

export const signAccessToken = (claims: AccessTokenClaims): string => {
  return jwt.sign(claims, config.jwtAccessSecret, { expiresIn: config.accessTokenTtlSeconds });
};

export const verifyAccessToken = (token: string): AccessTokenClaims => {
  return jwt.verify(token, config.jwtAccessSecret) as AccessTokenClaims;
};

export type RefreshTokenClaims = {
  sub: string; // session id
  uid: string; // user id
  role: 'user' | 'admin';
};

export const signRefreshToken = (claims: RefreshTokenClaims): string => {
  return jwt.sign(claims, config.jwtRefreshSecret, { expiresIn: config.refreshTokenTtlSeconds });
};

export const verifyRefreshToken = (token: string): RefreshTokenClaims => {
  return jwt.verify(token, config.jwtRefreshSecret) as RefreshTokenClaims;
};

export const hashRefreshToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};
