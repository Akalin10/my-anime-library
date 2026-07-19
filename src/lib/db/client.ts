import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

type DatabaseGlobal = typeof globalThis & {
  animeDatabase?: AppDatabase;
};

const databaseGlobal = globalThis as DatabaseGlobal;

export function getDatabase(): AppDatabase {
  if (databaseGlobal.animeDatabase) {
    return databaseGlobal.animeDatabase;
  }

  const databasePath = process.env.DATABASE_URL ?? "./data/anime.db";
  const sqlite = new Database(databasePath, { fileMustExist: true });
  sqlite.pragma("foreign_keys = ON");

  const database = drizzle(sqlite, { schema });
  databaseGlobal.animeDatabase = database;

  return database;
}
