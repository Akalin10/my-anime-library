import { resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import {
  handleGetAnimeRequest,
  handleListAnimeRequest,
} from "@/server/http/anime-handlers";
import { AnimeRepository } from "@/server/repositories/anime-repository";
import { AnimeReadService } from "@/server/services/anime-read-service";
import type { ApiResponse } from "@/types/api";
import type { AnimeDetail, AnimeListData } from "@/types/anime";

type AnimeFixture = {
  sourceId: string;
  titleChinese: string | null;
  titleNative: string | null;
  titleEnglish: string | null;
  aliases: string[];
  year: number | null;
  status: "WATCHING" | "COMPLETED";
  createdAt: number;
};

function insertFixture(sqlite: Database.Database, fixture: AnimeFixture) {
  return Number(
    sqlite
      .prepare(
        `insert into anime (
          source, source_id, title_chinese, title_native, title_english,
          aliases, year, status, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "test-source",
        fixture.sourceId,
        fixture.titleChinese,
        fixture.titleNative,
        fixture.titleEnglish,
        JSON.stringify(fixture.aliases),
        fixture.year,
        fixture.status,
        fixture.createdAt,
        fixture.createdAt,
      ).lastInsertRowid,
  );
}

async function responseBody<T>(response: Response) {
  return (await response.json()) as ApiResponse<T>;
}

describe("local anime read API", () => {
  let sqlite: Database.Database;
  let service: AnimeReadService;
  let ids: { akira: number; shirobako: number; mushishi: number };

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");

    const database = drizzle(sqlite, { schema });
    migrate(database, {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });

    ids = {
      shirobako: insertFixture(sqlite, {
        sourceId: "shirobako",
        titleChinese: "白箱",
        titleNative: "SHIROBAKO",
        titleEnglish: "Shirobako",
        aliases: ["白盒"],
        year: 2014,
        status: "WATCHING",
        createdAt: 200,
      }),
      akira: insertFixture(sqlite, {
        sourceId: "akira",
        titleChinese: "阿基拉",
        titleNative: "アキラ",
        titleEnglish: "Akira",
        aliases: ["AKIRA"],
        year: 1988,
        status: "COMPLETED",
        createdAt: 100,
      }),
      mushishi: insertFixture(sqlite, {
        sourceId: "mushishi",
        titleChinese: null,
        titleNative: "虫師",
        titleEnglish: "Mushishi",
        aliases: ["蟲師"],
        year: null,
        status: "WATCHING",
        createdAt: 300,
      }),
    };

    service = new AnimeReadService(new AnimeRepository(database));
  });

  afterEach(() => {
    sqlite.close();
  });

  it("returns a real empty result and zero counts for an empty library", async () => {
    sqlite.exec("delete from anime");
    const response = handleListAnimeRequest(
      new Request("http://localhost/api/anime"),
      service,
    );

    expect(response.status).toBe(200);
    expect(await responseBody<AnimeListData>(response)).toEqual({
      data: {
        items: [],
        counts: { all: 0, watching: 0, completed: 0 },
      },
      error: null,
    });
  });

  it("filters status while returning unfiltered real counts", async () => {
    const response = handleListAnimeRequest(
      new Request("http://localhost/api/anime?status=WATCHING"),
      service,
    );
    const body = await responseBody<AnimeListData>(response);

    expect(body.data?.items.map(({ id }) => id)).toEqual([
      ids.mushishi,
      ids.shirobako,
    ]);
    expect(body.data?.counts).toEqual({
      all: 3,
      watching: 2,
      completed: 1,
    });
  });

  it("sorts by most recently added by default", async () => {
    const response = handleListAnimeRequest(
      new Request("http://localhost/api/anime"),
      service,
    );
    const body = await responseBody<AnimeListData>(response);

    expect(body.data?.items.map(({ id }) => id)).toEqual([
      ids.mushishi,
      ids.shirobako,
      ids.akira,
    ]);
  });

  it("sorts Chinese titles with a Chinese collator", async () => {
    const response = handleListAnimeRequest(
      new Request("http://localhost/api/anime?sort=TITLE"),
      service,
    );
    const body = await responseBody<AnimeListData>(response);

    expect(body.data?.items.map(({ id }) => id)).toEqual([
      ids.akira,
      ids.shirobako,
      ids.mushishi,
    ]);
  });

  it("sorts by year and places missing years last", async () => {
    const response = handleListAnimeRequest(
      new Request("http://localhost/api/anime?sort=YEAR"),
      service,
    );
    const body = await responseBody<AnimeListData>(response);

    expect(body.data?.items.map(({ id }) => id)).toEqual([
      ids.shirobako,
      ids.akira,
      ids.mushishi,
    ]);
  });

  it.each([
    ["白箱", "shirobako"],
    ["アキラ", "akira"],
    ["akira", "akira"],
    ["白盒", "shirobako"],
  ])("searches local titles and aliases for %s", async (query, sourceId) => {
    const response = handleListAnimeRequest(
      new Request(
        `http://localhost/api/anime?query=${encodeURIComponent(query)}`,
      ),
      service,
    );
    const body = await responseBody<AnimeListData>(response);

    expect(body.data?.items).toHaveLength(1);
    expect(
      sqlite
        .prepare("select source_id as sourceId from anime where id = ?")
        .get(body.data?.items[0]?.id),
    ).toEqual({ sourceId });
  });

  it("returns a consistent detail response", async () => {
    const response = handleGetAnimeRequest(String(ids.akira), service);
    const body = await responseBody<AnimeDetail>(response);

    expect(response.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data).toMatchObject({
      id: ids.akira,
      titleChinese: "阿基拉",
      status: "COMPLETED",
    });
  });

  it("returns 404 in the shared response format", async () => {
    const response = handleGetAnimeRequest("999", service);

    expect(response.status).toBe(404);
    expect(await responseBody<AnimeDetail>(response)).toEqual({
      data: null,
      error: {
        code: "ANIME_NOT_FOUND",
        message: "未找到该动漫。",
      },
    });
  });

  it("rejects invalid and duplicate query parameters", async () => {
    const invalidStatus = handleListAnimeRequest(
      new Request("http://localhost/api/anime?status=PAUSED"),
      service,
    );
    const duplicateSort = handleListAnimeRequest(
      new Request("http://localhost/api/anime?sort=TITLE&sort=YEAR"),
      service,
    );

    expect(invalidStatus.status).toBe(400);
    expect(duplicateSort.status).toBe(400);
  });

  it("rejects an invalid detail id", () => {
    const response = handleGetAnimeRequest("not-a-number", service);

    expect(response.status).toBe(400);
  });
});
