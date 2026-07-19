import { resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import type { AnimeSourceAdapter } from "@/lib/sources/types";
import {
  handleGetAnimeDetailRequest,
  handleListAnimeRequest,
  handleUpdateAnimeStatusRequest,
} from "@/server/http/anime-handlers";
import { AnimeRepository } from "@/server/repositories/anime-repository";
import { AnimeDetailService } from "@/server/services/anime-detail-service";
import { AnimeReadService } from "@/server/services/anime-read-service";
import { AnimeStatusService } from "@/server/services/anime-status-service";
import type { ApiResponse } from "@/types/api";
import type {
  AnimeDetailData,
  AnimeListData,
  AnimeStatusUpdateData,
} from "@/types/anime";

async function responseBody<T>(response: Response) {
  return (await response.json()) as ApiResponse<T>;
}

describe("anime detail and status API", () => {
  let sqlite: Database.Database;
  let repository: AnimeRepository;
  let detailService: AnimeDetailService;
  let readService: AnimeReadService;
  let statusService: AnimeStatusService;
  let mainId: number;
  let sequelId: number;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite, { schema });
    migrate(database, { migrationsFolder: resolve(process.cwd(), "drizzle") });

    const franchiseId = Number(
      sqlite
        .prepare("insert into franchise (name) values (?)")
        .run("示例系列").lastInsertRowid,
    );
    const insert = sqlite.prepare(`
      insert into anime (
        source, source_id, title_chinese, title_native, aliases, year,
        media_type, episode_count, studio, synopsis, status, franchise_id
      ) values (?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?)
    `);
    mainId = Number(
      insert.run(
        "bangumi",
        "100",
        "示例正传",
        "サンプル",
        2024,
        "TV",
        12,
        "示例动画",
        "只含需求允许的简介。",
        "WATCHING",
        franchiseId,
      ).lastInsertRowid,
    );
    sequelId = Number(
      insert.run(
        "bangumi",
        "200",
        "示例续作",
        "サンプル 2",
        2025,
        "TV",
        12,
        "示例动画",
        null,
        "WATCHING",
        franchiseId,
      ).lastInsertRowid,
    );
    sqlite
      .prepare(
        `insert into anime_relation
          (anime_id, related_anime_id, relation_type, source)
         values (?, ?, 'SEQUEL', 'bangumi')`,
      )
      .run(mainId, sequelId);

    const adapter: AnimeSourceAdapter = {
      searchAnime: async () => [],
      getAnimeDetail: async () => {
        throw new Error("not used");
      },
      getPosterCandidates: async () => [],
      getAnimeRelations: async () => [
        {
          source: "bangumi",
          sourceId: "200",
          relationType: "续集",
          titleChinese: "示例续作",
          titleNative: "サンプル 2",
          mediaType: null,
          posterUrl: null,
        },
        {
          source: "bangumi",
          sourceId: "300",
          relationType: "剧场版",
          titleChinese: "示例剧场版",
          titleNative: null,
          mediaType: "MOVIE",
          posterUrl: "https://images.test/300.jpg",
        },
      ],
    };

    repository = new AnimeRepository(database);
    detailService = new AnimeDetailService(repository, adapter);
    readService = new AnimeReadService(repository);
    statusService = new AnimeStatusService(repository);
  });

  afterEach(() => sqlite.close());

  it("returns allowed detail fields, franchise name and merged related works", async () => {
    const response = await handleGetAnimeDetailRequest(
      String(mainId),
      detailService,
    );
    const body = await responseBody<AnimeDetailData>(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      id: mainId,
      titleChinese: "示例正传",
      franchiseName: "示例系列",
      relatedAnimeUnavailable: false,
    });
    expect(body.data?.relatedAnime).toEqual([
      expect.objectContaining({
        animeId: sequelId,
        sourceId: "200",
        relationType: "续集",
        year: 2025,
        isImported: true,
      }),
      expect.objectContaining({
        animeId: null,
        sourceId: "300",
        relationType: "剧场版",
        isImported: false,
      }),
    ]);
  });

  it("keeps local related works available when the source is not configured", async () => {
    const localOnly = new AnimeDetailService(repository, null);
    const response = await handleGetAnimeDetailRequest(String(mainId), localOnly);
    const body = await responseBody<AnimeDetailData>(response);

    expect(body.data?.relatedAnimeUnavailable).toBe(true);
    expect(body.data?.relatedAnime).toEqual([
      expect.objectContaining({ animeId: sequelId, isImported: true }),
    ]);
  });

  it("persists a status change, updates counts and removes the card from WATCHING", async () => {
    const before = await responseBody<AnimeListData>(
      handleListAnimeRequest(
        new Request("http://localhost/api/anime?status=WATCHING"),
        readService,
      ),
    );
    expect(before.data?.items.map(({ id }) => id)).toContain(mainId);
    expect(before.data?.counts).toEqual({ all: 2, watching: 2, completed: 0 });

    const updatedResponse = await handleUpdateAnimeStatusRequest(
      String(mainId),
      new Request("http://localhost/api/anime/1/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      }),
      statusService,
    );
    const updated = await responseBody<AnimeStatusUpdateData>(updatedResponse);
    expect(updated.data).toMatchObject({ id: mainId, status: "COMPLETED" });
    expect(
      sqlite.prepare("select status from anime where id = ?").get(mainId),
    ).toEqual({ status: "COMPLETED" });

    const after = await responseBody<AnimeListData>(
      handleListAnimeRequest(
        new Request("http://localhost/api/anime?status=WATCHING"),
        readService,
      ),
    );
    expect(after.data?.items.map(({ id }) => id)).not.toContain(mainId);
    expect(after.data?.counts).toEqual({ all: 2, watching: 1, completed: 1 });
  });

  it("rejects invalid status payloads and missing anime", async () => {
    const invalid = await handleUpdateAnimeStatusRequest(
      String(mainId),
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ status: "PAUSED" }),
      }),
      statusService,
    );
    const missing = await handleUpdateAnimeStatusRequest(
      "999",
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ status: "COMPLETED" }),
      }),
      statusService,
    );

    expect(invalid.status).toBe(400);
    expect((await responseBody(invalid)).error?.code).toBe(
      "INVALID_STATUS_BODY",
    );
    expect(missing.status).toBe(404);
  });
});
