import { constants } from "node:fs";
import { access, lstat, mkdir, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { ANIME_SOURCES, SOURCE_LABELS, type CustomSourceConfig } from "@/lib/sources/types";
import {
  getEffectiveDatabasePath,
  getEffectivePosterStoragePath,
  getSourceRuntimeSettings,
} from "@/server/config/runtime-settings";
import { getDatabase } from "@/lib/db/client";
import {
  AppSettingRepository,
  SETTING_KEYS,
} from "@/server/repositories/app-setting-repository";
import { resetAnimeDeleteService } from "@/server/services/anime-delete-service";
import { resetAnimeImportService } from "@/server/services/anime-import-service";
import { resetAnimePosterService } from "@/server/services/anime-poster-service";
import type {
  SettingsData,
  SettingsUpdateInput,
  SourceAvailability,
} from "@/types/settings";

export class InvalidPosterStoragePathError extends Error {
  constructor() {
    super("Poster storage path is not a writable local directory");
    this.name = "InvalidPosterStoragePathError";
  }
}

type SettingsServiceOptions = {
  databasePath?: string;
  posterStorageDefault?: string;
  onPosterPathChanged?: () => void;
};

export class SettingsService {
  private readonly databasePath: string;
  private readonly posterStorageDefault: string;
  private readonly onPosterPathChanged: () => void;

  constructor(
    private readonly repository: AppSettingRepository,
    options: SettingsServiceOptions = {},
  ) {
    this.databasePath = resolve(
      options.databasePath ?? process.env.DATABASE_URL ?? "./data/anime.db",
    );
    this.posterStorageDefault = resolve(
      options.posterStorageDefault ??
        process.env.POSTER_STORAGE_PATH ??
        "./data/posters",
    );
    this.onPosterPathChanged = options.onPosterPathChanged ?? (() => undefined);
  }

  get(): SettingsData {
    const sourceSettings = getSourceRuntimeSettings(this.repository);
    const rawTheme = this.repository.get(SETTING_KEYS.theme);
    const theme: SettingsData["theme"] =
      rawTheme === "dark" ? "dark" : rawTheme === "system" ? "system" : "light";
    return {
      ...sourceSettings,
      posterStoragePath: getEffectivePosterStoragePath(
        this.repository,
        this.posterStorageDefault,
      ),
      databasePath: this.databasePath,
      theme,
    };
  }

  getSources(): SourceAvailability[] {
    const settings = this.get();
    const enabled = new Set(settings.enabledSources);
    const bangumiUserAgent = Boolean(process.env.BANGUMI_USER_AGENT?.trim());
    const aniListConfigured = isValidUrl(process.env.ANILIST_API_URL);
    const tmdbConfigured = Boolean(process.env.TMDB_API_KEY?.trim());

    const builtinSources: SourceAvailability[] = ANIME_SOURCES.map((source) => {
      if (source === "bangumi") {
        return {
          source,
          label: SOURCE_LABELS[source],
          enabled: enabled.has(source),
          available: bangumiUserAgent,
          environment: [
            {
              name: "BANGUMI_USER_AGENT",
              configured: bangumiUserAgent,
              sensitive: false,
            },
            {
              name: "BANGUMI_API_TOKEN",
              configured: Boolean(process.env.BANGUMI_API_TOKEN?.trim()),
              sensitive: true,
            },
          ],
        };
      }
      if (source === "anilist") {
        return {
          source,
          label: SOURCE_LABELS[source],
          enabled: enabled.has(source),
          available: aniListConfigured,
          environment: [
            {
              name: "ANILIST_API_URL",
              configured: aniListConfigured,
              sensitive: false,
            },
          ],
        };
      }
      return {
        source,
        label: SOURCE_LABELS[source],
        enabled: enabled.has(source),
        available: tmdbConfigured,
        environment: [
          {
            name: "TMDB_API_KEY",
            configured: tmdbConfigured,
            sensitive: true,
          },
        ],
      };
    });

    const customSourceEntries: SourceAvailability[] = (
      settings.customSources ?? []
    ).map((cs) => ({
      source: cs.id,
      label: cs.name,
      enabled: enabled.has(cs.id),
      available: isValidUrl(cs.apiUrl),
      environment: [
        { name: cs.apiUrl, configured: isValidUrl(cs.apiUrl), sensitive: false },
      ],
    }));

    return [...builtinSources, ...customSourceEntries];
  }

  async update(input: SettingsUpdateInput): Promise<SettingsData> {
    const posterStoragePath = resolve(input.posterStoragePath);
    await ensureWritablePosterDirectories(posterStoragePath);
    const previousPosterPath = getEffectivePosterStoragePath(
      this.repository,
      this.posterStorageDefault,
    );
    this.repository.setMany([
      {
        key: SETTING_KEYS.enabledSources,
        value: JSON.stringify(input.enabledSources),
      },
      {
        key: SETTING_KEYS.sourcePriority,
        value: JSON.stringify(input.sourcePriority),
      },
      {
        key: SETTING_KEYS.customSources,
        value: JSON.stringify(input.customSources ?? []),
      },
      { key: SETTING_KEYS.posterStoragePath, value: posterStoragePath },
      { key: SETTING_KEYS.theme, value: input.theme },
    ]);
    if (previousPosterPath !== posterStoragePath) {
      this.onPosterPathChanged();
    }
    return this.get();
  }
}

async function ensureWritablePosterDirectories(rootPath: string) {
  try {
    await mkdir(rootPath, { recursive: true });
    const root = await lstat(rootPath);
    if (!root.isDirectory() || root.isSymbolicLink()) {
      throw new InvalidPosterStoragePathError();
    }
    const realRoot = await realpath(rootPath);
    for (const child of ["default", "custom"]) {
      const directory = resolve(rootPath, child);
      await mkdir(directory, { recursive: true });
      const entry = await lstat(directory);
      const realDirectory = await realpath(directory);
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        !realDirectory.startsWith(`${realRoot}${sep}`)
      ) {
        throw new InvalidPosterStoragePathError();
      }
      await access(realDirectory, constants.W_OK);
    }
  } catch (error) {
    throw error instanceof InvalidPosterStoragePathError
      ? error
      : new InvalidPosterStoragePathError();
  }
}

function isValidUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

let settingsService: SettingsService | undefined;

export function getSettingsService(): SettingsService {
  settingsService ??= new SettingsService(
    new AppSettingRepository(getDatabase()),
    {
      databasePath: getEffectiveDatabasePath(),
      onPosterPathChanged: () => {
        resetAnimeDeleteService();
        resetAnimeImportService();
        resetAnimePosterService();
      },
    },
  );
  return settingsService;
}
