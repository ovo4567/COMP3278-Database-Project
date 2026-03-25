-- Collections, comment interactions, post drafts/scheduling, analytics, and IP/location metadata

ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE posts ADD COLUMN scheduled_publish_at TEXT;
ALTER TABLE posts ADD COLUMN published_at TEXT;
ALTER TABLE posts ADD COLUMN draft_saved_at TEXT;
ALTER TABLE posts ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN collect_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN author_ip TEXT;
ALTER TABLE posts ADD COLUMN author_country TEXT;
ALTER TABLE posts ADD COLUMN author_region TEXT;
ALTER TABLE posts ADD COLUMN author_city TEXT;

UPDATE posts
SET status = 'published',
    published_at = COALESCE(published_at, created_at)
WHERE status NOT IN ('draft', 'scheduled', 'published')
   OR status IS NULL;

ALTER TABLE comments ADD COLUMN parent_comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE;
ALTER TABLE comments ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN collect_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN author_ip TEXT;
ALTER TABLE comments ADD COLUMN author_country TEXT;
ALTER TABLE comments ADD COLUMN author_region TEXT;
ALTER TABLE comments ADD COLUMN author_city TEXT;

ALTER TABLE sessions ADD COLUMN country TEXT;
ALTER TABLE sessions ADD COLUMN region TEXT;
ALTER TABLE sessions ADD COLUMN city TEXT;

CREATE TABLE IF NOT EXISTS post_collections (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS post_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  viewer_session TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comment_likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, comment_id)
);

CREATE TABLE IF NOT EXISTS comment_collections (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_posts_status_published ON posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_publish ON posts(status, scheduled_publish_at);
CREATE INDEX IF NOT EXISTS idx_posts_collect_count ON posts(collect_count);
CREATE INDEX IF NOT EXISTS idx_post_collections_user_created ON post_collections(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_views_post_created ON post_views(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_collections_comment_id ON comment_collections(comment_id);
