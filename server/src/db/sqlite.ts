import { open, type Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { config } from '../config.js';

let dbPromise: Promise<Database> | null = null;
let roDbPromise: Promise<Database> | null = null;

export const getDb = async (): Promise<Database> => {
  if (!dbPromise) {
    dbPromise = open({
      filename: config.sqlitePath,
      driver: sqlite3.Database,
    });
  }
  const db = await dbPromise;
  await db.exec('PRAGMA foreign_keys = ON;');
  return db;
};

export const getReadOnlyDb = async (): Promise<Database> => {
  if (!roDbPromise) {
    roDbPromise = open({
      filename: config.sqlitePath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY,
    });
  }

  const db = await roDbPromise;
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec('PRAGMA query_only = ON;');
  return db;
};
