import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type AccessTokenClaims = {
  sub: string; // user id
  username: string;
  role: 'user' | 'admin';
};

export const signAccessToken = (claims: AccessTokenClaims): string => {
  return jwt.sign(claims, config.jwtAccessSecret, { expiresIn: config.accessTokenTtlSeconds });
};

export const verifyAccessToken = (token: string): AccessTokenClaims => {
  return jwt.verify(token, config.jwtAccessSecret) as AccessTokenClaims;
};
