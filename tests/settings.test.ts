import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import Database from "better-sqlite3";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsEditor } from "@/components/settings/SettingsForm";
import * as schema from "@/lib/db/schema";
import type {
  AnimeSourceAdapter,
  NormalizedAnime,
} from "@/lib/sources/types";
import {
  handleClearSearchCacheRequest,
  handleGetSourcesRequest,
  handleUpdateSettingsRequest,
} from "@/server/http/settings-handlers";
import { AnimeImportRepository } from "@/server/repositories/anime-import-repository";
import {
  AppSettingRepository,
  SETTING_KEYS,
} from "@/server/repositories/app-setting-repository";
import { ExternalSearchService } from "@/server/services/external-search-service";
import { SettingsService } from "@/server/services/settings-service";
import type { ApiResponse } from "@/types/api";
import type {
  SettingsData,
  SourceAvailability,
} from "@/types/settings";

function anime(source: "bangumi" | "anilist" | "tmdb", studio: string): NormalizedAnime {
  return {
    source,
    sourceId: `${source}-1`,
    sourceReferences: [{ source, sourceId: `${source}-1` }],
    externalIds: {},
    titleChinese: "设置测试动画",
    titleNative: "Settings Test Anime",
    titleEnglish: "Settings Test Anime",
    aliases: [],
    year: 2026,
    mediaType: "TV",
    episodeCount: 12,
    studio,
    synopsis: null,
    posterUrl: null,
    relations: [],
  };
}

function adapter(options: {
  item: NormalizedAnime;
  onRequest: () => void;
}): AnimeSourceAdapter {
  let cached: NormalizedAnime[] | undefined;
  return {
    async searchAnime() {
      if (!cached) {
        options.onRequest();
        cached = [options.item];
      }
      return cached;
    },
    async getAnimeDetail() {
      return options.item;
    },
    async getAnimeRelations() {
      return [];
    },
    async getPosterCandidates() {
      return [];
    },
    clearCache() {
      cached = undefined;
    },
  };
}

async function responseBody<T>(response: Response) {
  return (await response.json()) as ApiResponse<T>;
}

describe("settings", () => {
  let sqlite: Database.Database;
  let repository: AppSettingRepository;
  let importRepository: AnimeImportRepository;
  let sandboxRoot: string;

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(resolve(tmpdir(), "anime-settings-test-"));
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite, { schema });
    migrate(database, { migrationsFolder: resolve(process.cwd(), "drizzle") });
    repository = new AppSettingRepository(database);
    importRepository = new AnimeImportRepository(database);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    sqlite.close();
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  it("persists every non-sensitive setting and recreates writable poster directories", async () => {
    const resetStorage = vi.fn();
    const service = new SettingsService(repository, {
      databasePath: resolve(sandboxRoot, "anime.db"),
      posterStorageDefault: resolve(sandboxRoot, "posters-default"),
      onPosterPathChanged: resetStorage,
    });
    const posterPath = resolve(sandboxRoot, "new-posters");
    const request = new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabledSources: ["anilist", "tmdb"],
        sourcePriority: ["tmdb", "anilist", "bangumi"],
        posterStoragePath: posterPath,
        theme: "dark",
      }),
    });
    const response = await handleUpdateSettingsRequest(request, service);
    const result = await responseBody<SettingsData>(response);

    expect(response.status).toBe(200);
    expect(result.data).toEqual({
      enabledSources: ["anilist", "tmdb"],
      sourcePriority: ["tmdb", "anilist", "bangumi"],
      customSources: [],
      posterStoragePath: posterPath,
      databasePath: resolve(sandboxRoot, "anime.db"),
      theme: "dark",
    });
    expect(repository.get(SETTING_KEYS.enabledSources)).toBe(
      '["anilist","tmdb"]',
    );
    expect(repository.get(SETTING_KEYS.sourcePriority)).toBe(
      '["tmdb","anilist","bangumi"]',
    );
    expect(repository.get(SETTING_KEYS.posterStoragePath)).toBe(posterPath);
    await expect(access(resolve(posterPath, "default"))).resolves.toBeUndefined();
    await expect(access(resolve(posterPath, "custom"))).resolves.toBeUndefined();
    expect(resetStorage).toHaveBeenCalledOnce();

    const reloaded = new SettingsService(repository, {
      databasePath: resolve(sandboxRoot, "anime.db"),
    });
    expect(reloaded.get()).toEqual(result.data);
  });

  it("rejects invalid priority and a poster path that points to a file", async () => {
    const filePath = resolve(sandboxRoot, "not-a-directory");
    await writeFile(filePath, "file");
    const invalidPriority = await handleUpdateSettingsRequest(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabledSources: ["bangumi"],
          sourcePriority: ["bangumi", "bangumi", "tmdb"],
          posterStoragePath: sandboxRoot,
          theme: "light",
        }),
      }),
      new SettingsService(repository),
    );
    const invalidPath = await handleUpdateSettingsRequest(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabledSources: [],
          sourcePriority: ["bangumi", "anilist", "tmdb"],
          posterStoragePath: filePath,
          theme: "light",
        }),
      }),
      new SettingsService(repository),
    );

    expect(invalidPriority.status).toBe(400);
    expect((await responseBody(invalidPriority)).error?.code).toBe(
      "INVALID_SETTINGS_BODY",
    );
    expect(invalidPath.status).toBe(400);
    expect((await responseBody(invalidPath)).error?.code).toBe(
      "INVALID_POSTER_STORAGE_PATH",
    );
    expect(repository.get(SETTING_KEYS.enabledSources)).toBeNull();
  });

  it("uses enabled sources and persisted priority in the next search", async () => {
    let bangumiRequests = 0;
    let tmdbRequests = 0;
    const service = new ExternalSearchService(
      [
        {
          source: "bangumi",
          adapter: adapter({
            item: anime("bangumi", "Bangumi Studio"),
            onRequest: () => bangumiRequests++,
          }),
        },
        {
          source: "tmdb",
          adapter: adapter({
            item: anime("tmdb", "TMDB Studio"),
            onRequest: () => tmdbRequests++,
          }),
        },
      ],
      importRepository,
      () => ({
        enabledSources: ["tmdb"],
        sourcePriority: ["tmdb", "bangumi", "anilist"],
      }),
    );
    const onlyTmdb = await service.search("test");
    expect(bangumiRequests).toBe(0);
    expect(tmdbRequests).toBe(1);
    expect(onlyTmdb.items[0]?.source).toBe("tmdb");

    const mergedService = new ExternalSearchService(
      [
        {
          source: "bangumi",
          adapter: adapter({
            item: anime("bangumi", "Bangumi Studio"),
            onRequest: () => undefined,
          }),
        },
        {
          source: "tmdb",
          adapter: adapter({
            item: anime("tmdb", "TMDB Studio"),
            onRequest: () => undefined,
          }),
        },
      ],
      importRepository,
      () => ({
        enabledSources: ["bangumi", "tmdb"],
        sourcePriority: ["tmdb", "bangumi", "anilist"],
      }),
    );
    const merged = await mergedService.search("test");
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]?.source).toBe("tmdb");
    expect(merged.items[0]?.studio).toBe("TMDB Studio");
  });

  it("clears adapter caches so an identical search makes a new request", async () => {
    let requests = 0;
    const service = new ExternalSearchService(
      [
        {
          source: "bangumi",
          adapter: adapter({
            item: anime("bangumi", "Cache Studio"),
            onRequest: () => requests++,
          }),
        },
      ],
      importRepository,
    );

    await service.search("same query");
    await service.search("same query");
    expect(requests).toBe(1);
    const response = handleClearSearchCacheRequest(service);
    expect(response.status).toBe(200);
    await service.search("same query");
    expect(requests).toBe(2);
  });

  it("returns configuration status and renders instructions without secret values or forbidden settings", async () => {
    vi.stubEnv("BANGUMI_USER_AGENT", "settings-test/app/1.0");
    vi.stubEnv("BANGUMI_API_TOKEN", "bangumi-secret-value");
    vi.stubEnv("ANILIST_API_URL", "https://graphql.anilist.co");
    vi.stubEnv("TMDB_API_KEY", "tmdb-secret-value");
    const service = new SettingsService(repository, {
      databasePath: resolve(sandboxRoot, "anime.db"),
      posterStorageDefault: resolve(sandboxRoot, "posters"),
    });
    const response = handleGetSourcesRequest(service);
    const sources = await responseBody<SourceAvailability[]>(response);
    const serialized = JSON.stringify(sources);

    expect(response.status).toBe(200);
    expect(sources.data?.every(({ available }) => available)).toBe(true);
    expect(serialized).not.toContain("bangumi-secret-value");
    expect(serialized).not.toContain("tmdb-secret-value");

    const queryClient = new QueryClient();
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(SettingsEditor, {
          initialSettings: service.get(),
          sources: sources.data!,
        }),
      ),
    );
    expect(markup).toContain("启用的数据源");
    expect(markup).toContain("默认数据源优先级");
    expect(markup).toContain("海报本地保存目录");
    expect(markup).toContain("清理搜索缓存");
    expect(markup).toContain("SQLite 数据库");
    expect(markup).toContain("TMDB_API_KEY");
    expect(markup).not.toContain("bangumi-secret-value");
    expect(markup).not.toContain("tmdb-secret-value");
    expect(markup).not.toMatch(/用户资料|头像|邮箱|密码|会员|通知|成就|统计设置/);
  });
});
