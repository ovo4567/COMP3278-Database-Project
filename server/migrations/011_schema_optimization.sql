-- Schema hardening and query-path indexes for SQLite.
-- This migration avoids destructive table rebuilds on an existing DB file by:
-- 1) normalizing obviously invalid data in place
-- 2) adding indexes for common feed/profile/notification queries
-- 3) adding triggers to enforce enum-like and cross-row integrity rules

-- Normalize legacy or malformed rows before constraints are enforced.
UPDATE users
SET role = 'user'
WHERE role IS NULL
   OR role NOT IN ('user', 'admin');

UPDATE users
SET is_banned = CASE WHEN COALESCE(is_banned, 0) = 0 THEN 0 ELSE 1 END
WHERE is_banned IS NULL
   OR is_banned NOT IN (0, 1);

UPDATE posts
SET visibility = 'public'
WHERE visibility IS NULL
   OR visibility NOT IN ('public', 'friends');

UPDATE posts
SET category = 'all'
WHERE category IS NULL
   OR category NOT IN ('all', 'food', 'studies', 'jobs', 'travel', 'others');

UPDATE posts
SET like_count = CASE WHEN COALESCE(like_count, 0) < 0 THEN 0 ELSE COALESCE(like_count, 0) END,
    collect_count = CASE WHEN COALESCE(collect_count, 0) < 0 THEN 0 ELSE COALESCE(collect_count, 0) END,
    view_count = CASE WHEN COALESCE(view_count, 0) < 0 THEN 0 ELSE COALESCE(view_count, 0) END;

UPDATE posts
SET status = 'published',
    scheduled_publish_at = NULL,
    published_at = COALESCE(published_at, created_at)
WHERE status IS NULL
   OR status NOT IN ('draft', 'scheduled', 'published');

UPDATE posts
SET scheduled_publish_at = NULL,
    published_at = NULL
WHERE status = 'draft';

UPDATE posts
SET status = 'draft',
    scheduled_publish_at = NULL,
    published_at = NULL
WHERE status = 'scheduled'
  AND scheduled_publish_at IS NULL;

UPDATE posts
SET published_at = NULL
WHERE status = 'scheduled';

UPDATE posts
SET scheduled_publish_at = NULL,
    published_at = COALESCE(published_at, created_at)
WHERE status = 'published';

UPDATE comments
SET like_count = CASE WHEN COALESCE(like_count, 0) < 0 THEN 0 ELSE COALESCE(like_count, 0) END,
    collect_count = CASE WHEN COALESCE(collect_count, 0) < 0 THEN 0 ELSE COALESCE(collect_count, 0) END;

UPDATE comments
SET parent_comment_id = NULL
WHERE parent_comment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM comments parent
    WHERE parent.id = comments.parent_comment_id
      AND parent.post_id = comments.post_id
  );

UPDATE notifications
SET is_read = CASE WHEN COALESCE(is_read, 0) = 0 THEN 0 ELSE 1 END
WHERE is_read IS NULL
   OR is_read NOT IN (0, 1);

UPDATE notifications
SET entity_type = NULL,
    entity_id = NULL
WHERE entity_type IS NULL
   OR entity_type NOT IN ('user', 'post')
   OR entity_id IS NULL
   OR entity_id <= 0;

UPDATE friendships
SET action_user_id = NULL
WHERE action_user_id IS NOT NULL
  AND action_user_id NOT IN (user_id1, user_id2);

-- Query-path indexes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(lower(username));
CREATE INDEX IF NOT EXISTS idx_sessions_user_last_used ON sessions(user_id, last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_status_created ON posts(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_status_visibility_category_created ON posts(status, visibility, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_id_cursor ON comments(post_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_cursor ON notifications(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_entity_read ON notifications(user_id, entity_type, entity_id, is_read, id DESC);
CREATE INDEX IF NOT EXISTS idx_likes_post_created ON likes(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_collections_post_created ON post_collections(post_id, created_at DESC);

-- User integrity.
CREATE TRIGGER IF NOT EXISTS trg_users_validate_insert
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.username IS NULL OR length(trim(NEW.username)) = 0 THEN RAISE(ABORT, 'username is required')
  END;
  SELECT CASE
    WHEN NEW.role NOT IN ('user', 'admin') THEN RAISE(ABORT, 'invalid user role')
  END;
  SELECT CASE
    WHEN COALESCE(NEW.is_banned, 0) NOT IN (0, 1) THEN RAISE(ABORT, 'invalid user ban flag')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_users_validate_update
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.username IS NULL OR length(trim(NEW.username)) = 0 THEN RAISE(ABORT, 'username is required')
  END;
  SELECT CASE
    WHEN NEW.role NOT IN ('user', 'admin') THEN RAISE(ABORT, 'invalid user role')
  END;
  SELECT CASE
    WHEN COALESCE(NEW.is_banned, 0) NOT IN (0, 1) THEN RAISE(ABORT, 'invalid user ban flag')
  END;
END;

-- Friendships must record the acting user as one of the participants.
CREATE TRIGGER IF NOT EXISTS trg_friendships_validate_insert
BEFORE INSERT ON friendships
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.action_user_id IS NOT NULL AND NEW.action_user_id NOT IN (NEW.user_id1, NEW.user_id2)
      THEN RAISE(ABORT, 'friendship action user must be part of the friendship')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_friendships_validate_update
BEFORE UPDATE ON friendships
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.action_user_id IS NOT NULL AND NEW.action_user_id NOT IN (NEW.user_id1, NEW.user_id2)
      THEN RAISE(ABORT, 'friendship action user must be part of the friendship')
  END;
END;

-- Post integrity and lifecycle consistency.
CREATE TRIGGER IF NOT EXISTS trg_posts_validate_insert
BEFORE INSERT ON posts
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.visibility NOT IN ('public', 'friends') THEN RAISE(ABORT, 'invalid post visibility')
  END;
  SELECT CASE
    WHEN NEW.category NOT IN ('all', 'food', 'studies', 'jobs', 'travel', 'others') THEN RAISE(ABORT, 'invalid post category')
  END;
  SELECT CASE
    WHEN NEW.status NOT IN ('draft', 'scheduled', 'published') THEN RAISE(ABORT, 'invalid post status')
  END;
  SELECT CASE
    WHEN COALESCE(NEW.like_count, 0) < 0 OR COALESCE(NEW.collect_count, 0) < 0 OR COALESCE(NEW.view_count, 0) < 0
      THEN RAISE(ABORT, 'post counters cannot be negative')
  END;
  SELECT CASE
    WHEN NEW.status = 'draft' AND (NEW.scheduled_publish_at IS NOT NULL OR NEW.published_at IS NOT NULL)
      THEN RAISE(ABORT, 'draft posts cannot have publish timestamps')
  END;
  SELECT CASE
    WHEN NEW.status = 'scheduled' AND (NEW.scheduled_publish_at IS NULL OR NEW.published_at IS NOT NULL)
      THEN RAISE(ABORT, 'scheduled posts require only a scheduled publish time')
  END;
  SELECT CASE
    WHEN NEW.status = 'published' AND NEW.published_at IS NULL
      THEN RAISE(ABORT, 'published posts require published_at')
  END;
  SELECT CASE
    WHEN NEW.status IN ('scheduled', 'published')
      AND length(trim(COALESCE(NEW.text, ''))) = 0
      AND length(trim(COALESCE(NEW.image_url, ''))) = 0
      THEN RAISE(ABORT, 'published or scheduled posts require text or image')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_posts_validate_update
BEFORE UPDATE ON posts
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.visibility NOT IN ('public', 'friends') THEN RAISE(ABORT, 'invalid post visibility')
  END;
  SELECT CASE
    WHEN NEW.category NOT IN ('all', 'food', 'studies', 'jobs', 'travel', 'others') THEN RAISE(ABORT, 'invalid post category')
  END;
  SELECT CASE
    WHEN NEW.status NOT IN ('draft', 'scheduled', 'published') THEN RAISE(ABORT, 'invalid post status')
  END;
  SELECT CASE
    WHEN COALESCE(NEW.like_count, 0) < 0 OR COALESCE(NEW.collect_count, 0) < 0 OR COALESCE(NEW.view_count, 0) < 0
      THEN RAISE(ABORT, 'post counters cannot be negative')
  END;
  SELECT CASE
    WHEN NEW.status = 'draft' AND (NEW.scheduled_publish_at IS NOT NULL OR NEW.published_at IS NOT NULL)
      THEN RAISE(ABORT, 'draft posts cannot have publish timestamps')
  END;
  SELECT CASE
    WHEN NEW.status = 'scheduled' AND (NEW.scheduled_publish_at IS NULL OR NEW.published_at IS NOT NULL)
      THEN RAISE(ABORT, 'scheduled posts require only a scheduled publish time')
  END;
  SELECT CASE
    WHEN NEW.status = 'published' AND NEW.published_at IS NULL
      THEN RAISE(ABORT, 'published posts require published_at')
  END;
  SELECT CASE
    WHEN NEW.status IN ('scheduled', 'published')
      AND length(trim(COALESCE(NEW.text, ''))) = 0
      AND length(trim(COALESCE(NEW.image_url, ''))) = 0
      THEN RAISE(ABORT, 'published or scheduled posts require text or image')
  END;
END;

-- Comment integrity.
CREATE TRIGGER IF NOT EXISTS trg_comments_validate_insert
BEFORE INSERT ON comments
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN COALESCE(NEW.like_count, 0) < 0 OR COALESCE(NEW.collect_count, 0) < 0
      THEN RAISE(ABORT, 'comment counters cannot be negative')
  END;
  SELECT CASE
    WHEN NEW.parent_comment_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM comments parent
        WHERE parent.id = NEW.parent_comment_id
          AND parent.post_id = NEW.post_id
      )
      THEN RAISE(ABORT, 'parent comment must belong to the same post')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_comments_validate_update
BEFORE UPDATE ON comments
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN COALESCE(NEW.like_count, 0) < 0 OR COALESCE(NEW.collect_count, 0) < 0
      THEN RAISE(ABORT, 'comment counters cannot be negative')
  END;
  SELECT CASE
    WHEN NEW.parent_comment_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM comments parent
        WHERE parent.id = NEW.parent_comment_id
          AND parent.post_id = NEW.post_id
      )
      THEN RAISE(ABORT, 'parent comment must belong to the same post')
  END;
END;

-- Notification integrity.
CREATE TRIGGER IF NOT EXISTS trg_notifications_validate_insert
BEFORE INSERT ON notifications
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.type NOT IN ('friend_request_received', 'friend_request_accepted', 'comment_reply', 'comment_mention')
      THEN RAISE(ABORT, 'invalid notification type')
  END;
  SELECT CASE
    WHEN COALESCE(NEW.is_read, 0) NOT IN (0, 1)
      THEN RAISE(ABORT, 'invalid notification read flag')
  END;
  SELECT CASE
    WHEN (NEW.entity_type IS NULL AND NEW.entity_id IS NOT NULL)
      OR (NEW.entity_type IS NOT NULL AND NEW.entity_id IS NULL)
      THEN RAISE(ABORT, 'notification entity type and id must be provided together')
  END;
  SELECT CASE
    WHEN NEW.entity_type IS NOT NULL AND NEW.entity_type NOT IN ('user', 'post')
      THEN RAISE(ABORT, 'invalid notification entity type')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_notifications_validate_update
BEFORE UPDATE ON notifications
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.type NOT IN ('friend_request_received', 'friend_request_accepted', 'comment_reply', 'comment_mention')
      THEN RAISE(ABORT, 'invalid notification type')
  END;
  SELECT CASE
    WHEN COALESCE(NEW.is_read, 0) NOT IN (0, 1)
      THEN RAISE(ABORT, 'invalid notification read flag')
  END;
  SELECT CASE
    WHEN (NEW.entity_type IS NULL AND NEW.entity_id IS NOT NULL)
      OR (NEW.entity_type IS NOT NULL AND NEW.entity_id IS NULL)
      THEN RAISE(ABORT, 'notification entity type and id must be provided together')
  END;
  SELECT CASE
    WHEN NEW.entity_type IS NOT NULL AND NEW.entity_type NOT IN ('user', 'post')
      THEN RAISE(ABORT, 'invalid notification entity type')
  END;
END;
