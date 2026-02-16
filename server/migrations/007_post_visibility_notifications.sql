-- Post visibility + notifications

ALTER TABLE posts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';

CREATE INDEX IF NOT EXISTS idx_posts_visibility_created ON posts(visibility, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id INTEGER,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
