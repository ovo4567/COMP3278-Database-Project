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
    '009_post_category.sql',
    '010_social_features.sql',
    '011_schema_optimization.sql',
    '012_schema_rebuild.sql',
  ];

  const migrationsWithForeignKeysDisabled = new Set(['012_schema_rebuild.sql']);

  for (const name of migrationFiles) {
    const row = await db.get<{ name: string }>('SELECT name FROM migrations WHERE name = ?', name);
    if (row) continue;

    const sqlPath = path.join(migrationsDir, name);
    const sql = await readFile(sqlPath, 'utf8');

    if (migrationsWithForeignKeysDisabled.has(name)) {
      // SQLite does not allow toggling PRAGMA foreign_keys inside an active transaction.
      await db.exec('PRAGMA foreign_keys = OFF;');
      await db.exec('BEGIN');
      try {
        await db.exec(sql);
        const issues = await db.all<
          {
            table: string;
            rowid: number;
            parent: string;
            fkid: number;
          }[]
        >('PRAGMA foreign_key_check;');
        if (issues.length > 0) {
          throw new Error(`Foreign key check failed after ${name}: ${JSON.stringify(issues.slice(0, 10))}`);
        }
        await db.run('INSERT INTO migrations(name) VALUES (?)', name);
        await db.exec('COMMIT');
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      } finally {
        await db.exec('PRAGMA foreign_keys = ON;');
      }
      continue;
    }

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
