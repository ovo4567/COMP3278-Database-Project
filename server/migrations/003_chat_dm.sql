PRAGMA foreign_keys = ON;

-- Direct message threads are represented as private groups + a unique pair mapping.
CREATE TABLE IF NOT EXISTS chat_direct_threads (
  user_low_id INTEGER NOT NULL,
  user_high_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_low_id, user_high_id),
  FOREIGN KEY (user_low_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_high_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_direct_threads_group_id ON chat_direct_threads(group_id);
