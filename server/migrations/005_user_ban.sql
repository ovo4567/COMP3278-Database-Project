ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);
