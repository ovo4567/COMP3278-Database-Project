PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chat_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  is_private INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_groups_created_at ON chat_groups(created_at);

CREATE TABLE IF NOT EXISTS chat_group_members (
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_group_members_user ON chat_group_members(user_id);

CREATE TABLE IF NOT EXISTS chat_group_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  invited_user_id INTEGER NOT NULL,
  invited_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (group_id, invited_user_id),
  FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_group_invites_invited ON chat_group_invites(invited_user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  text TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_group_id ON chat_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
