import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './sqlite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const runMigrations = async (): Promise<void> => {
  const db = await getDb();
  await db.exec('DROP TABLE IF EXISTS comment_likes; DROP TABLE IF EXISTS comment_collections; DROP TABLE IF EXISTS post_views; DROP TABLE IF EXISTS sessions;');
  const schemaPath = path.resolve(__dirname, '../../schema.sql');
  const sql = await readFile(schemaPath, 'utf8');
  await db.exec(sql);
};
