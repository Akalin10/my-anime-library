import { resolve } from "node:path";

import { getDatabase } from "@/lib/db/client";
import { ANIME_SOURCES, type AnimeSource } from "@/lib/sources/types";
import {
  AppSettingRepository,
  SETTING_KEYS,
} from "@/server/repositories/app-setting-repository";

function parseSources(value: string | null): AnimeSource[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.every((item) => ANIME_SOURCES.includes(item as AnimeSource)) &&
      new Set(parsed).size === parsed.length
    ) {
      return parsed as AnimeSource[];
    }
  } catch {
    // Invalid local values fall back to safe defaults.
  }
  return null;
}

export function getSourceRuntimeSettings(
  repository = new AppSettingRepository(getDatabase()),
) {
  const enabledSources =
    parseSources(repository.get(SETTING_KEYS.enabledSources)) ??
    [...ANIME_SOURCES];
  const storedPriority = parseSources(
    repository.get(SETTING_KEYS.sourcePriority),
  );
  const sourcePriority =
    storedPriority?.length === ANIME_SOURCES.length
      ? storedPriority
      : [...ANIME_SOURCES];
  return { enabledSources, sourcePriority };
}

export function getEffectivePosterStoragePath(
  repository = new AppSettingRepository(getDatabase()),
  fallbackPath = process.env.POSTER_STORAGE_PATH ?? "./data/posters",
): string {
  return resolve(
    repository.get(SETTING_KEYS.posterStoragePath) ?? fallbackPath,
  );
}

export function getEffectiveDatabasePath(): string {
  return resolve(process.env.DATABASE_URL ?? "./data/anime.db");
}
