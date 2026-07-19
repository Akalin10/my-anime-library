import { resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

type TableColumn = {
  name: string;
};

type TableName = {
  name: string;
};

function createMigratedDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), {
    migrationsFolder: resolve(process.cwd(), "drizzle"),
  });

  return sqlite;
}

describe("toolchain", () => {
  it("runs TypeScript tests", () => {
    const values: number[] = [1, 2, 3];

    expect(values.reduce((total, value) => total + value, 0)).toBe(6);
  });
});

describe("database schema", () => {
  it("applies the initial migration with exactly five domain tables", () => {
    const sqlite = createMigratedDatabase();

    try {
      const tables = sqlite
        .prepare(
          `select name
           from sqlite_master
           where type = 'table'
             and name not like 'sqlite_%'
             and name <> '__drizzle_migrations'
           order by name`,
        )
        .all() as TableName[];

      expect(tables.map(({ name }) => name)).toEqual([
        "anime",
        "anime_relation",
        "app_setting",
        "franchise",
        "source_reference",
      ]);

      const expectedColumns = {
        anime: [
          "id",
          "source",
          "source_id",
          "title_chinese",
          "title_native",
          "title_english",
          "aliases",
          "year",
          "media_type",
          "episode_count",
          "studio",
          "synopsis",
          "default_poster_url",
          "default_poster_path",
          "custom_poster_path",
          "status",
          "franchise_id",
          "created_at",
          "updated_at",
        ],
        anime_relation: [
          "id",
          "anime_id",
          "related_anime_id",
          "relation_type",
          "source",
          "created_at",
        ],
        app_setting: ["key", "value", "updated_at"],
        franchise: ["id", "name", "created_at", "updated_at"],
        source_reference: [
          "id",
          "anime_id",
          "source",
          "source_id",
          "url",
          "created_at",
        ],
      } as const;

      for (const [table, columns] of Object.entries(expectedColumns)) {
        const actualColumns = sqlite.pragma(`table_info(${table})`) as TableColumn[];
        expect(actualColumns.map(({ name }) => name)).toEqual(columns);
      }
    } finally {
      sqlite.close();
    }
  });

  it("rejects a duplicate Anime source and sourceId", () => {
    const sqlite = createMigratedDatabase();

    try {
      const insert = sqlite.prepare(
        "insert into anime (source, source_id, status) values (?, ?, ?)",
      );
      insert.run("test-source", "same-id", "WATCHING");

      expect(() =>
        insert.run("test-source", "same-id", "COMPLETED"),
      ).toThrow(/UNIQUE constraint failed/);
    } finally {
      sqlite.close();
    }
  });

  it("rejects an Anime status outside WATCHING and COMPLETED", () => {
    const sqlite = createMigratedDatabase();

    try {
      const insert = sqlite.prepare(
        "insert into anime (source, source_id, status) values (?, ?, ?)",
      );

      expect(() => insert.run("test-source", "one", "PAUSED")).toThrow(
        /CHECK constraint failed: anime_status_check/,
      );
    } finally {
      sqlite.close();
    }
  });

  it("rejects duplicate and invalid relation records", () => {
    const sqlite = createMigratedDatabase();

    try {
      const insertAnime = sqlite.prepare(
        "insert into anime (source, source_id, status) values (?, ?, ?)",
      );
      const firstId = insertAnime.run("test-source", "one", "WATCHING")
        .lastInsertRowid;
      const secondId = insertAnime.run("test-source", "two", "COMPLETED")
        .lastInsertRowid;
      const insertRelation = sqlite.prepare(
        `insert into anime_relation
          (anime_id, related_anime_id, relation_type, source)
         values (?, ?, ?, ?)`,
      );

      insertRelation.run(firstId, secondId, "SEQUEL", "test-source");

      expect(() =>
        insertRelation.run(firstId, secondId, "SEQUEL", "test-source"),
      ).toThrow(/UNIQUE constraint failed/);
      expect(() =>
        insertRelation.run(secondId, firstId, "UNVERIFIED", "test-source"),
      ).toThrow(/CHECK constraint failed: anime_relation_type_check/);
      expect(() =>
        insertRelation.run(firstId, firstId, "OTHER", "test-source"),
      ).toThrow(/CHECK constraint failed: anime_relation_not_self_check/);
    } finally {
      sqlite.close();
    }
  });
});
