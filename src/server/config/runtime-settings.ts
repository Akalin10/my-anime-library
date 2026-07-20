import { resolve } from "node:path";

import { getDatabase } from "@/lib/db/client";
import {
  ANIME_SOURCES,
  type CustomSourceConfig,
} from "@/lib/sources/types";
import {
  AppSettingRepository,
  SETTING_KEYS,
} from "@/server/repositories/app-setting-repository";

function parseStringArray(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string" && item.length > 0) &&
      new Set(parsed).size === parsed.length
    ) {
      return parsed as string[];
    }
  } catch {
    // Invalid local values fall back to safe defaults.
  }
  return null;
}

function parseCustomSources(value: string | null): CustomSourceConfig[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).id === "string" &&
          typeof (item as Record<string, unknown>).name === "string" &&
          typeof (item as Record<string, unknown>).apiUrl === "string",
      )
    ) {
      return parsed as CustomSourceConfig[];
    }
  } catch {
    // Invalid local values fall back to safe defaults.
  }
  return null;
}

export function getSourceRuntimeSettings(
  repository = new AppSettingRepository(getDatabase()),
) {
  const customSources =
    parseCustomSources(repository.get(SETTING_KEYS.customSources)) ?? [];
  const allKnownIds = [
    ...ANIME_SOURCES,
    ...customSources.map((cs) => cs.id),
  ];

  const rawEnabled = parseStringArray(
    repository.get(SETTING_KEYS.enabledSources),
  );
  const enabledSources =
    rawEnabled?.filter((id) => allKnownIds.includes(id)) ?? [...ANIME_SOURCES];

  const storedPriority = parseStringArray(
    repository.get(SETTING_KEYS.sourcePriority),
  );
  const sourcePriority =
    storedPriority?.length === allKnownIds.length &&
    allKnownIds.every((id) => storedPriority.includes(id))
      ? storedPriority
      : [...allKnownIds];

  return { enabledSources, sourcePriority, customSources };
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
