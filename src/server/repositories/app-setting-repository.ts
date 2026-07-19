import { eq } from "drizzle-orm";

import type { AppDatabase } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";

export const SETTING_KEYS = {
  enabledSources: "enabled_sources",
  sourcePriority: "source_priority",
  posterStoragePath: "poster_storage_path",
} as const;

export class AppSettingRepository {
  constructor(private readonly database: AppDatabase) {}

  get(key: string): string | null {
    return (
      this.database
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, key))
        .get()?.value ?? null
    );
  }

  setMany(entries: Array<{ key: string; value: string }>): void {
    this.database.transaction((transaction) => {
      for (const entry of entries) {
        transaction
          .insert(appSettings)
          .values(entry)
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { value: entry.value, updatedAt: new Date() },
          })
          .run();
      }
    });
  }
}
