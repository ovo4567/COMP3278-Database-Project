import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './sqlite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const runMigrations = async (): Promise<void> => {
  const db = await getDb();

  // Ensure migrations table exists first.
  await db.exec(
    "CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT (datetime('now')));",
  );

  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const migrationFiles = [
    '001_init.sql',
    '004_user_status.sql',
    '005_user_ban.sql',
    '006_friendships.sql',
    '007_post_visibility_notifications.sql',
    '008_visibility_no_private.sql',
  ];

  for (const name of migrationFiles) {
    const row = await db.get<{ name: string }>('SELECT name FROM migrations WHERE name = ?', name);
    if (row) continue;

    const sqlPath = path.join(migrationsDir, name);
    const sql = await readFile(sqlPath, 'utf8');
    await db.exec('BEGIN');
    try {
      await db.exec(sql);
      await db.run('INSERT INTO migrations(name) VALUES (?)', name);
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  }
};
