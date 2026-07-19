import type { AnimeSource } from "@/lib/sources/types";

export type SourceEnvironmentStatus = {
  name: string;
  configured: boolean;
  sensitive: boolean;
};

export type SourceAvailability = {
  source: AnimeSource;
  label: string;
  enabled: boolean;
  available: boolean;
  environment: SourceEnvironmentStatus[];
};

export type SettingsData = {
  enabledSources: AnimeSource[];
  sourcePriority: AnimeSource[];
  posterStoragePath: string;
  databasePath: string;
};

export type SettingsUpdateInput = Pick<
  SettingsData,
  "enabledSources" | "sourcePriority" | "posterStoragePath"
>;

export type SearchCacheClearData = {
  cleared: true;
};
