import { open, type Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

let dbPromise: Promise<Database> | null = null;
let roDbPromise: Promise<Database> | null = null;

const getSqliteFilename = async (): Promise<string> => {
  if (config.sqlitePath === ':memory:') return ':memory:';

  const filename = path.resolve(config.sqlitePath);
  await mkdir(path.dirname(filename), { recursive: true });
  return filename;
};

export const getDb = async (): Promise<Database> => {
  if (!dbPromise) {
    const filename = await getSqliteFilename();
    dbPromise = open({
      filename,
      driver: sqlite3.Database,
    });
  }
  const db = await dbPromise;
  await db.exec('PRAGMA foreign_keys = ON;');
  return db;
};

export const getReadOnlyDb = async (): Promise<Database> => {
  if (!roDbPromise) {
    const filename = await getSqliteFilename();
    roDbPromise = open({
      filename,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY,
    });
  }

  const db = await roDbPromise;
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec('PRAGMA query_only = ON;');
  return db;
};
