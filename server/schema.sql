-- Current consolidated schema.
-- This file is the single source of truth for fresh database initialization.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  username TEXT NOT NULL PRIMARY KEY CHECK (username = lower(username) AND length(trim(username)) > 0),
  password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status_text TEXT,
  is_banned INTEGER NOT NULL DEFAULT 0 CHECK (is_banned IN (0, 1))
);

CREATE TABLE IF NOT EXISTS friendships (
  username1 TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  username2 TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  action_user_id TEXT REFERENCES users(username) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  PRIMARY KEY (username1, username2),
  CHECK (username1 < username2),
  CHECK (action_user_id IS NULL OR action_user_id IN (username1, username2))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'friends')),
  category TEXT NOT NULL DEFAULT 'all' CHECK (category IN ('all', 'food', 'studies', 'jobs', 'travel', 'others')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'scheduled', 'published')),
  scheduled_publish_at TEXT,
  published_at TEXT,
  draft_saved_at TEXT,
  CHECK (status <> 'draft' OR (scheduled_publish_at IS NULL AND published_at IS NULL)),
  CHECK (status <> 'scheduled' OR (scheduled_publish_at IS NOT NULL AND published_at IS NULL)),
  CHECK (status <> 'published' OR published_at IS NOT NULL),
  CHECK (
    status NOT IN ('scheduled', 'published')
    OR length(trim(text)) > 0
    OR length(trim(COALESCE(image_url, ''))) > 0
  )
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS likes (
  username TEXT NOT NULL,
  post_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (username, post_id),
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_collections (
  username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (username, post_id)
);

CREATE VIEW IF NOT EXISTS post_engagement AS
SELECT
  p.id AS post_id,
  (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
  (SELECT COUNT(*) FROM post_collections pc WHERE pc.post_id = p.id) AS collect_count
FROM posts p;

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('friend_request_received', 'friend_request_accepted', 'post_liked', 'post_commented', 'comment_mention')),
  actor_username TEXT REFERENCES users(username) ON DELETE SET NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);

CREATE INDEX IF NOT EXISTS idx_friendships_user1_status ON friendships(username1, status);
CREATE INDEX IF NOT EXISTS idx_friendships_user2_status ON friendships(username2, status);

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_status_created ON posts(username, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_status_published ON posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_publish ON posts(status, scheduled_publish_at);
CREATE INDEX IF NOT EXISTS idx_posts_feed_new ON posts(status, visibility, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_post_id_cursor ON comments(post_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_created ON likes(post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_collections_user_created ON post_collections(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_collections_post_created ON post_collections(post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(username, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_cursor ON notifications(username, id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_actor_read ON notifications(username, actor_username, is_read, type, id DESC);
