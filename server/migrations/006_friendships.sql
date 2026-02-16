-- Friend system

CREATE TABLE IF NOT EXISTS friendships (
  user_id1 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id2 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  action_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  PRIMARY KEY (user_id1, user_id2),
  CHECK (user_id1 < user_id2),
  CHECK (status IN ('pending', 'accepted', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_friendships_user1_status ON friendships(user_id1, status);
CREATE INDEX IF NOT EXISTS idx_friendships_user2_status ON friendships(user_id2, status);
CREATE INDEX IF NOT EXISTS idx_friendships_pair ON friendships(user_id1, user_id2);
