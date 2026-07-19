import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { POST as importRoute } from "@/app/api/anime/import/route";
import { GET as searchRoute } from "@/app/api/search/route";
import type { AppDatabase } from "@/lib/db/client";
import { DefaultPosterStorage } from "@/lib/images/default-poster-storage";
import { buildImportRequest } from "@/components/search/search-import-model";
import { SourceAdapterError } from "@/lib/sources/errors";
import type {
  AnimeSourceAdapter,
  NormalizedAnime,
  NormalizedAnimeRelation,
} from "@/lib/sources/types";
import { handleExternalSearchRequest, handleImportRequest } from "@/server/http/external-handlers";
import { AnimeImportRepository } from "@/server/repositories/anime-import-repository";
import { AnimeRepository } from "@/server/repositories/anime-repository";
import { AnimeReadService } from "@/server/services/anime-read-service";
import { AnimeImportService } from "@/server/services/anime-import-service";
import { ExternalSearchService } from "@/server/services/external-search-service";
import type { ApiResponse } from "@/types/api";
import type {
  ExternalSearchData,
  ImportBatchResult,
} from "@/types/external";

const POSTER_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

function animeFixture(
  sourceId: string,
  overrides: Partial<NormalizedAnime> = {},
): NormalizedAnime {
  return {
    source: "bangumi",
    sourceId,
    sourceReferences: [{ source: "bangumi", sourceId }],
    externalIds: {},
    titleChinese: `测试动画 ${sourceId}`,
    titleNative: `テストアニメ ${sourceId}`,
    titleEnglish: null,
    aliases: [],
    year: 2026,
    mediaType: "TV",
    episodeCount: 12,
    studio: null,
    synopsis: null,
    posterUrl: `https://images.test/${sourceId}.jpg`,
    relations: null,
    ...overrides,
  };
}

function relationFixture(
  sourceId: string,
  relationType: string,
): NormalizedAnimeRelation {
  return {
    source: "bangumi",
    sourceId,
    relationType,
    titleChinese: `关联动画 ${sourceId}`,
    titleNative: null,
    mediaType: null,
    posterUrl: null,
  };
}

function createMockAdapter(options: {
  details?: Record<string, NormalizedAnime>;
  relations?: Record<string, NormalizedAnimeRelation[]>;
  failedSourceIds?: string[];
  searchResults?: NormalizedAnime[];
  posterlessSourceIds?: string[];
} = {}): AnimeSourceAdapter {
  const details = options.details ?? {};
  const relations = options.relations ?? {};
  const failed = new Set(options.failedSourceIds ?? []);
  const posterless = new Set(options.posterlessSourceIds ?? []);

  return {
    async searchAnime() {
      return options.searchResults ?? Object.values(details);
    },
    async getAnimeDetail(sourceId) {
      if (failed.has(sourceId)) {
        throw new SourceAdapterError(
          "bangumi",
          "UNAVAILABLE",
          "mock source unavailable",
        );
      }
      const detail = details[sourceId];
      if (!detail) {
        throw new SourceAdapterError(
          "bangumi",
          "UNAVAILABLE",
          "mock subject missing",
        );
      }
      return detail;
    },
    async getAnimeRelations(sourceId) {
      return relations[sourceId] ?? [];
    },
    async getPosterCandidates(sourceId) {
      if (posterless.has(sourceId)) {
        return [];
      }
      return [
        {
          source: details[sourceId]?.source ?? "bangumi",
          sourceId,
          size: "large",
          url: `https://images.test/${sourceId}.jpg`,
        },
      ];
    },
  };
}

function importRequest(body: unknown): Request {
  return new Request("http://localhost/api/anime/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function responseBody<T>(response: Response): Promise<ApiResponse<T>> {
  return (await response.json()) as ApiResponse<T>;
}

describe("external search and anime import API", () => {
  let sqlite: Database.Database;
  let database: AppDatabase;
  let repository: AnimeImportRepository;
  let posterRoot: string;
  let posterFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    database = drizzle(sqlite, { schema });
    migrate(database, { migrationsFolder: resolve(process.cwd(), "drizzle") });
    repository = new AnimeImportRepository(database);
    posterRoot = await mkdtemp(resolve(tmpdir(), "anime-import-test-"));
    posterFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(POSTER_BYTES, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    sqlite.close();
    await rm(posterRoot, { recursive: true, force: true });
  });

  function importService(adapter: AnimeSourceAdapter): AnimeImportService {
    return new AnimeImportService(
      adapter,
      repository,
      new DefaultPosterStorage({
        rootPath: posterRoot,
        fetchImplementation: posterFetch as typeof fetch,
      }),
    );
  }

  it("imports a batch, writes posters, source references, franchise and explicit relations", async () => {
    const adapter = createMockAdapter({
      details: {
        "101": animeFixture("101"),
        "202": animeFixture("202"),
      },
      relations: {
        "101": [relationFixture("202", "续集")],
        "202": [relationFixture("101", "前传")],
      },
    });

    const response = await handleImportRequest(
      importRequest({
        status: "WATCHING",
        items: [
          { source: "bangumi", sourceId: "101" },
          { source: "bangumi", sourceId: "202", status: "COMPLETED" },
        ],
      }),
      importService(adapter),
    );
    const body = await responseBody<ImportBatchResult>(response);

    expect(response.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data).toMatchObject({ successCount: 2, failureCount: 0 });

    const rows = sqlite
      .prepare(
        "select source_id as sourceId, status, default_poster_path as posterPath, franchise_id as franchiseId from anime order by source_id",
      )
      .all() as Array<{
      sourceId: string;
      status: string;
      posterPath: string;
      franchiseId: number;
    }>;
    expect(rows).toEqual([
      {
        sourceId: "101",
        status: "WATCHING",
        posterPath: "default/bangumi-101.jpg",
        franchiseId: expect.any(Number),
      },
      {
        sourceId: "202",
        status: "COMPLETED",
        posterPath: "default/bangumi-202.jpg",
        franchiseId: rows[0]?.franchiseId,
      },
    ]);

    expect(
      sqlite.prepare("select count(*) as count from source_reference").get(),
    ).toEqual({ count: 2 });
    expect(
      sqlite.prepare("select count(*) as count from franchise").get(),
    ).toEqual({ count: 1 });
    expect(
      sqlite
        .prepare(
          "select relation_type as relationType, source from anime_relation",
        )
        .get(),
    ).toEqual({ relationType: "PREQUEL", source: "bangumi" });

    await expect(
      readFile(resolve(posterRoot, rows[0]?.posterPath ?? "")),
    ).resolves.toEqual(Buffer.from(POSTER_BYTES));
    await expect(
      readFile(resolve(posterRoot, rows[1]?.posterPath ?? "")),
    ).resolves.toEqual(Buffer.from(POSTER_BYTES));
  });

  it("persists every confirmed source reference from a merged search result", async () => {
    const detail = animeFixture("101");
    const response = await handleImportRequest(
      importRequest({
        items: [
          {
            source: "bangumi",
            sourceId: "101",
            sourceReferences: [
              { source: "bangumi", sourceId: "101" },
              { source: "anilist", sourceId: "16498" },
              { source: "tmdb", sourceId: "129" },
            ],
          },
        ],
      }),
      importService(createMockAdapter({ details: { "101": detail } })),
    );

    expect((await responseBody<ImportBatchResult>(response)).data?.successCount).toBe(
      1,
    );
    expect(
      sqlite
        .prepare(
          "select source, source_id as sourceId from source_reference order by source",
        )
        .all(),
    ).toEqual([
      { source: "anilist", sourceId: "16498" },
      { source: "bangumi", sourceId: "101" },
      { source: "tmdb", sourceId: "129" },
    ]);
  });

  it("imports an AniList-only result through the same adapter interface", async () => {
    const detail = animeFixture("1", {
      source: "anilist",
      sourceReferences: [{ source: "anilist", sourceId: "1" }],
      externalIds: { myAnimeList: "1" },
      titleChinese: null,
      titleNative: "カウボーイビバップ",
      titleEnglish: "Cowboy Bebop",
    });
    const adapter = createMockAdapter({ details: { "1": detail } });
    const service = new AnimeImportService(
      { anilist: adapter },
      repository,
      new DefaultPosterStorage({
        rootPath: posterRoot,
        fetchImplementation: posterFetch as typeof fetch,
      }),
    );

    const response = await handleImportRequest(
      importRequest({ items: [{ source: "anilist", sourceId: "1" }] }),
      service,
    );
    const body = await responseBody<ImportBatchResult>(response);

    expect(body.data?.items[0]).toMatchObject({
      success: true,
      source: "anilist",
      sourceId: "1",
      defaultPosterPath: "default/anilist-1.jpg",
    });
    expect(
      sqlite
        .prepare("select source, source_id as sourceId from anime")
        .get(),
    ).toEqual({ source: "anilist", sourceId: "1" });
  });

  it("imports a TMDB movie without creating source-defined anime relations", async () => {
    const detail = animeFixture("129", {
      source: "tmdb",
      sourceReferences: [{ source: "tmdb", sourceId: "129" }],
      externalIds: { imdb: "tt0245429" },
      titleChinese: "千与千寻",
      titleNative: "千と千尋の神隠し",
      titleEnglish: null,
      year: 2001,
      mediaType: "MOVIE",
      episodeCount: null,
      studio: "Studio Ghibli",
    });
    const adapter = createMockAdapter({ details: { "129": detail } });
    const service = new AnimeImportService(
      { tmdb: adapter },
      repository,
      new DefaultPosterStorage({
        rootPath: posterRoot,
        fetchImplementation: posterFetch as typeof fetch,
      }),
    );

    const response = await handleImportRequest(
      importRequest({ items: [{ source: "tmdb", sourceId: "129" }] }),
      service,
    );
    const body = await responseBody<ImportBatchResult>(response);

    expect(body.data?.items[0]).toMatchObject({
      success: true,
      source: "tmdb",
      sourceId: "129",
      defaultPosterPath: "default/tmdb-129.jpg",
    });
    expect(
      sqlite.prepare("select source, source_id as sourceId from anime").get(),
    ).toEqual({ source: "tmdb", sourceId: "129" });
    expect(
      sqlite.prepare("select count(*) as count from anime_relation").get(),
    ).toEqual({ count: 0 });
  });

  it("prevents duplicate imports before downloading another poster", async () => {
    const service = importService(
      createMockAdapter({ details: { "101": animeFixture("101") } }),
    );
    const requestBody = {
      items: [{ source: "bangumi", sourceId: "101" }],
    };

    const first = await handleImportRequest(importRequest(requestBody), service);
    const second = await handleImportRequest(importRequest(requestBody), service);
    const secondBody = await responseBody<ImportBatchResult>(second);

    expect((await responseBody<ImportBatchResult>(first)).data?.successCount).toBe(1);
    expect(secondBody.data).toMatchObject({ successCount: 0, failureCount: 1 });
    expect(secondBody.data?.items[0]).toMatchObject({
      success: false,
      error: { code: "ALREADY_IMPORTED" },
    });
    expect(
      sqlite.prepare("select count(*) as count from anime").get(),
    ).toEqual({ count: 1 });
    expect(posterFetch).toHaveBeenCalledTimes(1);
  });

  it("continues a batch after one source item fails", async () => {
    const adapter = createMockAdapter({
      details: {
        "101": animeFixture("101"),
        "303": animeFixture("303"),
      },
      failedSourceIds: ["999"],
    });

    const response = await handleImportRequest(
      importRequest({
        items: [
          { source: "bangumi", sourceId: "101" },
          { source: "bangumi", sourceId: "999" },
          { source: "bangumi", sourceId: "303" },
        ],
      }),
      importService(adapter),
    );
    const body = await responseBody<ImportBatchResult>(response);

    expect(body.data).toMatchObject({ successCount: 2, failureCount: 1 });
    expect(body.data?.items.map(({ success }) => success)).toEqual([
      true,
      false,
      true,
    ]);
    expect(body.data?.items[1]).toMatchObject({
      sourceId: "999",
      error: { code: "SOURCE_UNAVAILABLE" },
    });
    expect(
      sqlite.prepare("select count(*) as count from anime").get(),
    ).toEqual({ count: 2 });
  });

  it("persists missing source fields as null without fabricating values", async () => {
    const missing = animeFixture("303", {
      titleChinese: null,
      titleNative: null,
      titleEnglish: null,
      aliases: [],
      year: null,
      mediaType: null,
      episodeCount: null,
      studio: null,
      synopsis: null,
      posterUrl: null,
    });
    const adapter = createMockAdapter({
      details: { "303": missing },
      posterlessSourceIds: ["303"],
    });

    const response = await handleImportRequest(
      importRequest({ items: [{ source: "bangumi", sourceId: "303" }] }),
      importService(adapter),
    );
    const body = await responseBody<ImportBatchResult>(response);

    expect(body.data?.successCount).toBe(1);
    expect(
      sqlite
        .prepare(
          `select title_chinese as titleChinese, title_native as titleNative,
            title_english as titleEnglish, aliases, year, media_type as mediaType,
            episode_count as episodeCount, studio, synopsis,
            default_poster_url as posterUrl, default_poster_path as posterPath,
            franchise_id as franchiseId from anime`,
        )
        .get(),
    ).toEqual({
      titleChinese: null,
      titleNative: null,
      titleEnglish: null,
      aliases: "[]",
      year: null,
      mediaType: null,
      episodeCount: null,
      studio: null,
      synopsis: null,
      posterUrl: null,
      posterPath: null,
      franchiseId: null,
    });
  });

  it("returns standardized search results with the real imported flag", async () => {
    const imported = animeFixture("101");
    const notImported = animeFixture("202");
    repository.importAnime({
      anime: imported,
      relations: [],
      status: "WATCHING",
      defaultPosterPath: null,
    });
    const service = new ExternalSearchService(
      createMockAdapter({ searchResults: [imported, notImported] }),
      repository,
    );

    const response = await handleExternalSearchRequest(
      new Request(
        `http://localhost/api/search?query=${encodeURIComponent("测试动画")}`,
      ),
      service,
    );
    const body = await responseBody<ExternalSearchData>(response);

    expect(response.status).toBe(200);
    expect(body.data?.items.map(({ sourceId, isImported }) => ({
      sourceId,
      isImported,
    }))).toEqual([
      { sourceId: "101", isImported: true },
      { sourceId: "202", isImported: false },
    ]);
  });

  it("completes search, multi-selection import and local-home refresh data", async () => {
    const first = animeFixture("101", { titleChinese: "进击的巨人" });
    const second = animeFixture("202", { titleChinese: "进击的巨人 编年史" });
    const adapter = createMockAdapter({
      details: { "101": first, "202": second },
      searchResults: [first, second],
    });
    const searchService = new ExternalSearchService(adapter, repository);

    const searchResponse = await handleExternalSearchRequest(
      new Request(
        `http://localhost/api/search?query=${encodeURIComponent("进击的巨人")}`,
      ),
      searchService,
    );
    const searchBody = await responseBody<ExternalSearchData>(searchResponse);
    const sourceIds = searchBody.data?.items.map(({ sourceId }) => sourceId) ?? [];
    const selection = Object.fromEntries(
      sourceIds.map((sourceId, index) => [
        sourceId,
        index === 0 ? "WATCHING" : "COMPLETED",
      ]),
    ) as Record<string, "WATCHING" | "COMPLETED">;

    const importResponse = await handleImportRequest(
      importRequest(buildImportRequest(selection, "WATCHING")),
      importService(adapter),
    );
    const importBody = await responseBody<ImportBatchResult>(importResponse);
    const homeData = new AnimeReadService(new AnimeRepository(database)).list({
      status: "ALL",
      sort: "RECENT",
    });

    expect(searchResponse.status).toBe(200);
    expect(sourceIds).toEqual(["101", "202"]);
    expect(importBody.data).toMatchObject({ successCount: 2, failureCount: 0 });
    expect(homeData.counts).toEqual({ all: 2, watching: 1, completed: 1 });
    expect(homeData.items).toHaveLength(2);
    expect(homeData.items.every(({ defaultPosterPath }) => defaultPosterPath)).toBe(
      true,
    );
  });

  it("rejects invalid search and import input without calling services", async () => {
    const adapter = createMockAdapter();
    const searchSpy = vi.spyOn(adapter, "searchAnime");
    const searchService = new ExternalSearchService(adapter, repository);
    const importBatch = vi.fn();

    const searchResponse = await handleExternalSearchRequest(
      new Request("http://localhost/api/search?query=&query=duplicate"),
      searchService,
    );
    const importResponse = await handleImportRequest(
      importRequest({ items: [], status: "PAUSED" }),
      { importBatch } as unknown as AnimeImportService,
    );

    expect(searchResponse.status).toBe(400);
    expect(importResponse.status).toBe(400);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(importBatch).not.toHaveBeenCalled();
  });

  it("validates route input and isolates missing source configuration", async () => {
    vi.stubEnv("BANGUMI_USER_AGENT", "");
    vi.stubEnv("BANGUMI_API_TOKEN", "");
    vi.stubEnv("ANILIST_API_URL", "");
    vi.stubEnv("TMDB_API_KEY", "");

    const invalidSearch = await searchRoute(
      new Request("http://localhost/api/search?query="),
    );
    const invalidImport = await importRoute(importRequest({ items: [] }));
    const validSearchWithoutConfiguration = await searchRoute(
      new Request("http://localhost/api/search?query=test"),
    );

    expect(invalidSearch.status).toBe(400);
    expect(invalidImport.status).toBe(400);
    expect(validSearchWithoutConfiguration.status).toBe(200);
    expect(
      (await responseBody<ExternalSearchData>(validSearchWithoutConfiguration))
        .data?.sources,
    ).toEqual([
      expect.objectContaining({ source: "bangumi", status: "ERROR" }),
      expect.objectContaining({ source: "anilist", status: "ERROR" }),
      expect.objectContaining({ source: "tmdb", status: "ERROR" }),
    ]);
  });
});
