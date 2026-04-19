import 'dotenv/config';

const envOr = (key: string, fallback: string): string => {
  const value = process.env[key];
  if (value) return value;
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') {
    throw new Error(`Missing env var: ${key}`);
  }
  return fallback;
};

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',

  jwtAccessSecret: envOr('JWT_ACCESS_SECRET', 'dev_access_secret_change_me'),
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30),

  sqlitePath: process.env.SQLITE_PATH ?? './data/app.db',

  adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'admin123',
};
