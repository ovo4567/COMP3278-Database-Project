import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './sqlite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const runMigrations = async (): Promise<void> => {
  const db = await getDb();
  await db.exec('DROP TABLE IF EXISTS comment_likes; DROP TABLE IF EXISTS comment_collections; DROP TABLE IF EXISTS post_views; DROP TABLE IF EXISTS sessions; DROP INDEX IF EXISTS idx_posts_like_count; DROP INDEX IF EXISTS idx_posts_feed_popular; DROP INDEX IF EXISTS idx_posts_collect_count; DROP INDEX IF EXISTS idx_comments_parent_comment_id;');

  const commentColumns = await db.all<{ name: string }[]>('PRAGMA table_info(comments)');
  const hasLegacyCommentReplies = commentColumns.some((column) => column.name === 'parent_comment_id');
  if (hasLegacyCommentReplies) {
    await db.exec('PRAGMA foreign_keys = OFF;');
    try {
      await db.exec(`
        DROP TABLE IF EXISTS comments_new;
        CREATE TABLE comments_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          user_id TEXT NOT NULL,
          text TEXT NOT NULL CHECK (length(trim(text)) > 0),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          author_ip TEXT,
          author_country TEXT,
          author_region TEXT,
          author_city TEXT,
          FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(username) ON DELETE CASCADE
        );

        INSERT INTO comments_new (
          id, post_id, user_id, text, created_at, author_ip, author_country, author_region, author_city
        )
        SELECT
          id, post_id, user_id, text, created_at, author_ip, author_country, author_region, author_city
        FROM comments;

        DROP TABLE comments;
        ALTER TABLE comments_new RENAME TO comments;
      `);

      await db.exec("DELETE FROM sqlite_sequence WHERE name = 'comments';");
      await db.exec("INSERT INTO sqlite_sequence(name, seq) SELECT 'comments', COALESCE(MAX(id), 0) FROM comments;");
    } finally {
      await db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  const notificationTable = await db.get<{ sql: string | null }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notifications'");
  const hasLegacyCommentReplyNotifications = Boolean(notificationTable?.sql?.includes("'comment_reply'"));
  if (hasLegacyCommentReplyNotifications) {
    await db.exec('PRAGMA foreign_keys = OFF;');
    try {
      await db.exec(`
        DROP TABLE IF EXISTS notifications_new;
        CREATE TABLE notifications_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('friend_request_received', 'friend_request_accepted', 'comment_mention')),
          actor_user_id TEXT REFERENCES users(username) ON DELETE SET NULL,
          entity_type TEXT,
          entity_id INTEGER,
          is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          CHECK (
            (entity_type IS NULL AND entity_id IS NULL)
            OR (entity_type IN ('user', 'post') AND entity_id IS NOT NULL AND entity_id > 0)
          )
        );

        INSERT INTO notifications_new (
          id, user_id, type, actor_user_id, entity_type, entity_id, is_read, created_at
        )
        SELECT
          id, user_id, type, actor_user_id, entity_type, entity_id, is_read, created_at
        FROM notifications
        WHERE type != 'comment_reply';

        DROP TABLE notifications;
        ALTER TABLE notifications_new RENAME TO notifications;
      `);

      await db.exec("DELETE FROM sqlite_sequence WHERE name = 'notifications';");
      await db.exec("INSERT INTO sqlite_sequence(name, seq) SELECT 'notifications', COALESCE(MAX(id), 0) FROM notifications;");
    } finally {
      await db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  const postColumns = await db.all<{ name: string }[]>('PRAGMA table_info(posts)');
  const hasLegacyPostCounters = postColumns.some((column) => column.name === 'like_count' || column.name === 'collect_count');
  if (hasLegacyPostCounters) {
    await db.exec('PRAGMA foreign_keys = OFF;');
    try {
      await db.exec(`
        DROP TABLE IF EXISTS posts_new;
        CREATE TABLE posts_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
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

        INSERT INTO posts_new (
          id, user_id, text, image_url, created_at, updated_at, visibility, category, status,
          scheduled_publish_at, published_at, draft_saved_at, author_ip, author_country, author_region, author_city
        )
        SELECT
          id, user_id, text, image_url, created_at, updated_at, visibility, category, status,
          scheduled_publish_at, published_at, draft_saved_at, author_ip, author_country, author_region, author_city
        FROM posts;

        DROP TABLE posts;
        ALTER TABLE posts_new RENAME TO posts;
      `);

      await db.exec("DELETE FROM sqlite_sequence WHERE name = 'posts';");
      await db.exec("INSERT INTO sqlite_sequence(name, seq) SELECT 'posts', COALESCE(MAX(id), 0) FROM posts;");
    } finally {
      await db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  const schemaPath = path.resolve(__dirname, '../../schema.sql');
  const sql = await readFile(schemaPath, 'utf8');
  await db.exec(sql);
};
