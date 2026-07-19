import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SearchSourceFailures } from "@/components/search/SearchSourceFailures";
import * as schema from "@/lib/db/schema";
import { SourceAdapterError } from "@/lib/sources/errors";
import { deduplicateAnimeResults } from "@/lib/sources/normalize/deduplicate";
import type {
  AnimeSource,
  AnimeSourceAdapter,
  NormalizedAnime,
} from "@/lib/sources/types";
import { handleExternalSearchRequest } from "@/server/http/external-handlers";
import { AnimeImportRepository } from "@/server/repositories/anime-import-repository";
import { ExternalSearchService } from "@/server/services/external-search-service";
import type { ApiResponse } from "@/types/api";
import type { ExternalSearchData } from "@/types/external";

function anime(
  source: AnimeSource,
  sourceId: string,
  overrides: Partial<NormalizedAnime> = {},
): NormalizedAnime {
  return {
    source,
    sourceId,
    sourceReferences: [{ source, sourceId }],
    externalIds: {},
    titleChinese: source === "bangumi" ? "星际牛仔" : null,
    titleNative: "カウボーイビバップ",
    titleEnglish: "Cowboy Bebop",
    aliases: [],
    year: 1998,
    mediaType: "TV",
    episodeCount: 26,
    studio: null,
    synopsis: null,
    posterUrl: null,
    relations: null,
    ...overrides,
  };
}

function adapter(
  results: NormalizedAnime[] | Error,
): AnimeSourceAdapter {
  return {
    async searchAnime() {
      if (results instanceof Error) throw results;
      return results;
    },
    async getAnimeDetail() {
      throw new Error("not used");
    },
    async getAnimeRelations() {
      return [];
    },
    async getPosterCandidates() {
      return [];
    },
  };
}

async function responseBody<T>(response: Response) {
  return (await response.json()) as ApiResponse<T>;
}

describe("multi-source search", () => {
  let sqlite: Database.Database;
  let repository: AnimeImportRepository;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite, { schema });
    migrate(database, { migrationsFolder: resolve(process.cwd(), "drizzle") });
    repository = new AnimeImportRepository(database);
  });

  afterEach(() => sqlite.close());

  it("merges confirmed matches and retains every source reference", () => {
    const bangumi = anime("bangumi", "777", {
      externalIds: { myAnimeList: "1" },
    });
    const aniList = anime("anilist", "1", {
      externalIds: { myAnimeList: "1" },
    });

    const results = deduplicateAnimeResults([bangumi, aniList]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ source: "bangumi", sourceId: "777" });
    expect(results[0]?.sourceReferences).toEqual([
      { source: "bangumi", sourceId: "777" },
      { source: "anilist", sourceId: "1" },
    ]);
  });

  it("can confirm a cross-source match from original title, year, type and episodes", () => {
    const results = deduplicateAnimeResults([
      anime("bangumi", "777"),
      anime("anilist", "1", {
        titleNative: "カウボーイ・ビバップ",
        aliases: ["カウボーイビバップ"],
      }),
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.sourceReferences).toHaveLength(2);
  });

  it("merges all three movie sources while keeping Bangumi and AniList ahead of TMDB", () => {
    const commonMovie = {
      titleChinese: null,
      titleNative: "千と千尋の神隠し",
      titleEnglish: "Spirited Away",
      aliases: [],
      year: 2001,
      mediaType: "MOVIE",
    } satisfies Partial<NormalizedAnime>;
    const tmdb = anime("tmdb", "129", {
      ...commonMovie,
      episodeCount: null,
      studio: "Studio Ghibli",
      relations: null,
    });
    const aniList = anime("anilist", "199", {
      ...commonMovie,
      episodeCount: 1,
      studio: "Studio Ghibli",
      relations: [
        {
          source: "anilist",
          sourceId: "1",
          relationType: "OTHER",
          titleChinese: null,
          titleNative: "Related anime",
          mediaType: "MOVIE",
          posterUrl: null,
        },
      ],
    });
    const bangumi = anime("bangumi", "1122", {
      ...commonMovie,
      episodeCount: 1,
      titleChinese: "千与千寻",
      relations: [],
    });

    const results = deduplicateAnimeResults([tmdb, aniList, bangumi]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      source: "bangumi",
      sourceId: "1122",
      titleChinese: "千与千寻",
      relations: [],
    });
    expect(results[0]?.sourceReferences).toEqual([
      { source: "bangumi", sourceId: "1122" },
      { source: "anilist", sourceId: "199" },
      { source: "tmdb", sourceId: "129" },
    ]);
  });

  it("keeps uncertain same-Chinese-title results independent", () => {
    const results = deduplicateAnimeResults([
      anime("bangumi", "100", {
        titleChinese: "相同标题",
        titleNative: "作品 A",
        titleEnglish: null,
        aliases: [],
      }),
      anime("anilist", "200", {
        titleChinese: "相同标题",
        titleNative: "作品 B",
        titleEnglish: null,
        aliases: [],
      }),
    ]);

    expect(results).toHaveLength(2);
  });

  it("starts enabled source searches in parallel", async () => {
    const started = new Set<AnimeSource>();
    let releaseBangumi!: (items: NormalizedAnime[]) => void;
    let releaseAniList!: (items: NormalizedAnime[]) => void;
    let releaseTmdb!: (items: NormalizedAnime[]) => void;

    const delayedAdapter = (
      source: AnimeSource,
      setRelease: (release: (items: NormalizedAnime[]) => void) => void,
    ): AnimeSourceAdapter => ({
      async searchAnime() {
        started.add(source);
        return new Promise<NormalizedAnime[]>((resolve) => setRelease(resolve));
      },
      async getAnimeDetail() {
        throw new Error("not used");
      },
      async getAnimeRelations() {
        return [];
      },
      async getPosterCandidates() {
        return [];
      },
    });

    const service = new ExternalSearchService(
      [
        {
          source: "bangumi",
          adapter: delayedAdapter("bangumi", (release) => {
            releaseBangumi = release;
          }),
        },
        {
          source: "anilist",
          adapter: delayedAdapter("anilist", (release) => {
            releaseAniList = release;
          }),
        },
        {
          source: "tmdb",
          adapter: delayedAdapter("tmdb", (release) => {
            releaseTmdb = release;
          }),
        },
      ],
      repository,
    );

    const search = service.search("Cowboy Bebop");
    await Promise.resolve();

    expect(started).toEqual(
      new Set<AnimeSource>(["bangumi", "anilist", "tmdb"]),
    );
    releaseBangumi([anime("bangumi", "777")]);
    releaseAniList([anime("anilist", "1")]);
    releaseTmdb([anime("tmdb", "2", { titleNative: "Different movie" })]);
    await expect(search).resolves.toMatchObject({
      sources: [
        { source: "bangumi", status: "SUCCESS" },
        { source: "anilist", status: "SUCCESS" },
        { source: "tmdb", status: "SUCCESS" },
      ],
    });
  });

  it("adds explicit related anime to a source search without title guessing", async () => {
    const relatedById: Record<string, NormalizedAnime> = {
      "2": anime("anilist", "2", { mediaType: "TV", year: 2017 }),
      "3": anime("anilist", "3", { mediaType: "OVA", year: 2013 }),
      "4": anime("anilist", "4", { mediaType: "SPECIAL", year: 2014 }),
      "5": anime("anilist", "5", { mediaType: "MOVIE", year: 2020 }),
    };
    const sourceAdapter: AnimeSourceAdapter = {
      async searchAnime() {
        return [anime("anilist", "1")];
      },
      async getAnimeRelations(sourceId) {
        if (sourceId !== "1") return [];
        return Object.values(relatedById).map((item) => ({
          source: item.source,
          sourceId: item.sourceId,
          relationType: item.mediaType ?? "OTHER",
          titleChinese: item.titleChinese,
          titleNative: item.titleNative,
          year: item.year,
          mediaType: item.mediaType,
          posterUrl: item.posterUrl,
        }));
      },
      async getAnimeDetail(sourceId) {
        const item = relatedById[sourceId];
        if (!item) throw new Error("missing related fixture");
        return item;
      },
      async getPosterCandidates() {
        return [];
      },
    };
    const service = new ExternalSearchService(
      [{ source: "anilist", adapter: sourceAdapter }],
      repository,
    );

    const result = await service.search("进击的巨人");

    expect(result.sources).toEqual([
      expect.objectContaining({ source: "anilist", status: "SUCCESS" }),
    ]);
    expect(result.items.map(({ sourceId }) => sourceId)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(result.items.map(({ mediaType }) => mediaType)).toEqual([
      "TV",
      "TV",
      "OVA",
      "SPECIAL",
      "MOVIE",
    ]);
  });

  it("isolates one source failure while returning the other source results", async () => {
    const service = new ExternalSearchService(
      [
        {
          source: "bangumi",
          adapter: adapter(
            new SourceAdapterError(
              "bangumi",
              "UNAVAILABLE",
              "mock failure",
            ),
          ),
        },
        { source: "anilist", adapter: adapter([anime("anilist", "1")]) },
      ],
      repository,
    );

    const response = await handleExternalSearchRequest(
      new Request("http://localhost/api/search?query=Cowboy%20Bebop"),
      service,
    );
    const body = await responseBody<ExternalSearchData>(response);

    expect(response.status).toBe(200);
    expect(body.data?.items).toEqual([
      expect.objectContaining({ source: "anilist", sourceId: "1" }),
    ]);
    expect(body.data?.sources).toEqual([
      expect.objectContaining({
        source: "bangumi",
        status: "ERROR",
        message: "Bangumi 请求失败。",
      }),
      expect.objectContaining({ source: "anilist", status: "SUCCESS" }),
    ]);

    const markup = renderToStaticMarkup(
      createElement(SearchSourceFailures, {
        sources: body.data?.sources ?? [],
        onRetry: () => undefined,
      }),
    );
    expect(markup).toContain("Bangumi 请求失败。");
    expect(markup).toContain("重试 Bangumi");
  });
});
