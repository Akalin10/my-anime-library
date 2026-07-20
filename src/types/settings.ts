export type SourceEnvironmentStatus = {
  name: string;
  configured: boolean;
  sensitive: boolean;
};

export type SourceAvailability = {
  source: string;
  label: string;
  enabled: boolean;
  available: boolean;
  environment: SourceEnvironmentStatus[];
};

export type ThemeMode = "light" | "dark" | "system";

export type CustomSourceConfig = {
  id: string;
  name: string;
  apiUrl: string;
};

export type SettingsData = {
  enabledSources: string[];
  sourcePriority: string[];
  customSources: CustomSourceConfig[];
  posterStoragePath: string;
  databasePath: string;
  theme: ThemeMode;
};

export type SettingsUpdateInput = Pick<
  SettingsData,
  "enabledSources" | "sourcePriority" | "posterStoragePath" | "theme"
> & {
  customSources?: CustomSourceConfig[];
};

export type SearchCacheClearData = {
  cleared: true;
};
