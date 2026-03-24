-- Post category support

ALTER TABLE posts ADD COLUMN category TEXT NOT NULL DEFAULT 'all';

UPDATE posts
SET category = 'all'
WHERE category IS NULL
   OR category NOT IN ('all', 'food', 'studies', 'jobs', 'travel', 'others');

CREATE INDEX IF NOT EXISTS idx_posts_category_created ON posts(category, created_at DESC);
