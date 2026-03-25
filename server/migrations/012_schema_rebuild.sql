-- Rebuild the core tables with native CHECK and FOREIGN KEY constraints.
-- This replaces trigger-only validation from 011 with real table-level integrity rules.

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(username)) > 0),
  password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status_text TEXT,
  is_banned INTEGER NOT NULL DEFAULT 0 CHECK (is_banned IN (0, 1))
);

INSERT INTO users_new(id, username, password_hash, role, display_name, bio, avatar_url, created_at, status_text, is_banned)
SELECT
  id,
  lower(trim(username)),
  password_hash,
  CASE WHEN role IN ('user', 'admin') THEN role ELSE 'user' END,
  display_name,
  bio,
  avatar_url,
  created_at,
  status_text,
  CASE WHEN COALESCE(is_banned, 0) = 0 THEN 0 ELSE 1 END
FROM users
ORDER BY id;

CREATE TABLE friendships_new (
  user_id1 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id2 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  action_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  PRIMARY KEY (user_id1, user_id2),
  CHECK (user_id1 < user_id2),
  CHECK (action_user_id IS NULL OR action_user_id IN (user_id1, user_id2))
);

INSERT INTO friendships_new(user_id1, user_id2, status, action_user_id, created_at, updated_at)
SELECT
  user_id1,
  user_id2,
  CASE WHEN status IN ('pending', 'accepted', 'rejected') THEN status ELSE 'pending' END,
  CASE
    WHEN action_user_id IN (user_id1, user_id2) THEN action_user_id
    ELSE NULL
  END,
  created_at,
  updated_at
FROM friendships
ORDER BY user_id1, user_id2;

CREATE TABLE sessions_new (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL CHECK (length(refresh_token_hash) > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT
);

INSERT INTO sessions_new(id, user_id, refresh_token_hash, created_at, last_used_at, expires_at, user_agent, ip, country, region, city)
SELECT
  id,
  user_id,
  refresh_token_hash,
  created_at,
  last_used_at,
  expires_at,
  user_agent,
  ip,
  country,
  region,
  city
FROM sessions
ORDER BY created_at, id;

CREATE TABLE posts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'friends')),
  category TEXT NOT NULL DEFAULT 'all' CHECK (category IN ('all', 'food', 'studies', 'jobs', 'travel', 'others')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'scheduled', 'published')),
  scheduled_publish_at TEXT,
  published_at TEXT,
  draft_saved_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  collect_count INTEGER NOT NULL DEFAULT 0 CHECK (collect_count >= 0),
  author_ip TEXT,
  author_country TEXT,
  author_region TEXT,
  author_city TEXT,
  CHECK (status <> 'draft' OR (scheduled_publish_at IS NULL AND published_at IS NULL)),
  CHECK (status <> 'scheduled' OR (scheduled_publish_at IS NOT NULL AND published_at IS NULL)),
  CHECK (status <> 'published' OR published_at IS NOT NULL),
  CHECK (
    status NOT IN ('scheduled', 'published')
    OR length(trim(text)) > 0
    OR length(trim(COALESCE(image_url, ''))) > 0
  )
);

INSERT INTO posts_new(
  id,
  user_id,
  text,
  image_url,
  like_count,
  created_at,
  updated_at,
  visibility,
  category,
  status,
  scheduled_publish_at,
  published_at,
  draft_saved_at,
  view_count,
  collect_count,
  author_ip,
  author_country,
  author_region,
  author_city
)
SELECT
  id,
  user_id,
  COALESCE(text, ''),
  image_url,
  CASE WHEN COALESCE(like_count, 0) < 0 THEN 0 ELSE COALESCE(like_count, 0) END,
  created_at,
  updated_at,
  CASE WHEN visibility IN ('public', 'friends') THEN visibility ELSE 'public' END,
  CASE WHEN category IN ('all', 'food', 'studies', 'jobs', 'travel', 'others') THEN category ELSE 'all' END,
  CASE
    WHEN status IN ('draft', 'scheduled', 'published') THEN status
    ELSE 'published'
  END,
  CASE
    WHEN status = 'scheduled' AND scheduled_publish_at IS NOT NULL THEN scheduled_publish_at
    ELSE NULL
  END,
  CASE
    WHEN status = 'published' THEN COALESCE(published_at, created_at)
    ELSE NULL
  END,
  draft_saved_at,
  CASE WHEN COALESCE(view_count, 0) < 0 THEN 0 ELSE COALESCE(view_count, 0) END,
  CASE WHEN COALESCE(collect_count, 0) < 0 THEN 0 ELSE COALESCE(collect_count, 0) END,
  author_ip,
  author_country,
  author_region,
  author_city
FROM posts
ORDER BY id;

CREATE TABLE comments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  parent_comment_id INTEGER,
  like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  collect_count INTEGER NOT NULL DEFAULT 0 CHECK (collect_count >= 0),
  author_ip TEXT,
  author_country TEXT,
  author_region TEXT,
  author_city TEXT,
  UNIQUE (id, post_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_comment_id, post_id) REFERENCES comments_new(id, post_id) ON DELETE CASCADE
);

INSERT INTO comments_new(
  id,
  post_id,
  user_id,
  text,
  created_at,
  parent_comment_id,
  like_count,
  collect_count,
  author_ip,
  author_country,
  author_region,
  author_city
)
SELECT
  id,
  post_id,
  user_id,
  text,
  created_at,
  parent_comment_id,
  CASE WHEN COALESCE(like_count, 0) < 0 THEN 0 ELSE COALESCE(like_count, 0) END,
  CASE WHEN COALESCE(collect_count, 0) < 0 THEN 0 ELSE COALESCE(collect_count, 0) END,
  author_ip,
  author_country,
  author_region,
  author_city
FROM comments
ORDER BY id;

CREATE TABLE notifications_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('friend_request_received', 'friend_request_accepted', 'comment_reply', 'comment_mention')),
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id INTEGER,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (entity_type IS NULL AND entity_id IS NULL)
    OR (entity_type IN ('user', 'post') AND entity_id IS NOT NULL AND entity_id > 0)
  )
);

INSERT INTO notifications_new(id, user_id, type, actor_user_id, entity_type, entity_id, is_read, created_at)
SELECT
  id,
  user_id,
  type,
  actor_user_id,
  entity_type,
  entity_id,
  CASE WHEN COALESCE(is_read, 0) = 0 THEN 0 ELSE 1 END,
  created_at
FROM notifications
WHERE type IN ('friend_request_received', 'friend_request_accepted', 'comment_reply', 'comment_mention')
  AND (
    (entity_type IS NULL AND entity_id IS NULL)
    OR (entity_type IN ('user', 'post') AND entity_id IS NOT NULL AND entity_id > 0)
  )
ORDER BY id;

CREATE TABLE post_views_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  viewer_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO post_views_new(id, post_id, viewer_user_id, viewer_session, created_at)
SELECT
  id,
  post_id,
  CASE
    WHEN viewer_user_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM users_new u
      WHERE u.id = post_views.viewer_user_id
    )
      THEN viewer_user_id
    ELSE NULL
  END,
  CASE
    WHEN viewer_session IS NOT NULL AND EXISTS (
      SELECT 1
      FROM sessions_new s
      WHERE s.id = post_views.viewer_session
    )
      THEN viewer_session
    ELSE NULL
  END,
  created_at
FROM post_views
ORDER BY id;

DROP TABLE post_views;
DROP TABLE notifications;
DROP TABLE comments;
DROP TABLE posts;
DROP TABLE sessions;
DROP TABLE friendships;
DROP TABLE users;

ALTER TABLE users_new RENAME TO users;
ALTER TABLE friendships_new RENAME TO friendships;
ALTER TABLE sessions_new RENAME TO sessions;
ALTER TABLE posts_new RENAME TO posts;
ALTER TABLE comments_new RENAME TO comments;
ALTER TABLE notifications_new RENAME TO notifications;
ALTER TABLE post_views_new RENAME TO post_views;

CREATE INDEX idx_users_is_banned ON users(is_banned);

CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_user_last_used ON sessions(user_id, last_used_at DESC);

CREATE INDEX idx_friendships_user1_status ON friendships(user_id1, status);
CREATE INDEX idx_friendships_user2_status ON friendships(user_id2, status);

CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_like_count ON posts(like_count DESC, created_at DESC);
CREATE INDEX idx_posts_user_status_created ON posts(user_id, status, created_at DESC);
CREATE INDEX idx_posts_status_published ON posts(status, published_at DESC);
CREATE INDEX idx_posts_scheduled_publish ON posts(status, scheduled_publish_at);
CREATE INDEX idx_posts_feed_new ON posts(status, visibility, category, created_at DESC);
CREATE INDEX idx_posts_feed_popular ON posts(status, visibility, category, like_count DESC, created_at DESC);
CREATE INDEX idx_posts_collect_count ON posts(collect_count DESC, created_at DESC);

CREATE INDEX idx_comments_post_id_cursor ON comments(post_id, id DESC);
CREATE INDEX idx_comments_parent_comment_id ON comments(parent_comment_id);
CREATE INDEX idx_comments_created_at ON comments(created_at DESC);

CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_user_id_cursor ON notifications(user_id, id DESC);
CREATE INDEX idx_notifications_user_entity_read ON notifications(user_id, entity_type, entity_id, is_read, id DESC);

CREATE INDEX idx_post_views_post_created ON post_views(post_id, created_at DESC);

DELETE FROM sqlite_sequence WHERE name IN ('users', 'posts', 'comments', 'notifications', 'post_views');
INSERT INTO sqlite_sequence(name, seq) SELECT 'users', COALESCE(MAX(id), 0) FROM users;
INSERT INTO sqlite_sequence(name, seq) SELECT 'posts', COALESCE(MAX(id), 0) FROM posts;
INSERT INTO sqlite_sequence(name, seq) SELECT 'comments', COALESCE(MAX(id), 0) FROM comments;
INSERT INTO sqlite_sequence(name, seq) SELECT 'notifications', COALESCE(MAX(id), 0) FROM notifications;
INSERT INTO sqlite_sequence(name, seq) SELECT 'post_views', COALESCE(MAX(id), 0) FROM post_views;
