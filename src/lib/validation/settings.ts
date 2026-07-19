import { z } from "zod";

import { ANIME_SOURCES } from "@/lib/sources/types";

const sourceSchema = z.enum(ANIME_SOURCES);

export const settingsUpdateSchema = z
  .object({
    enabledSources: z
      .array(sourceSchema)
      .max(ANIME_SOURCES.length)
      .refine((items) => new Set(items).size === items.length),
    sourcePriority: z
      .array(sourceSchema)
      .length(ANIME_SOURCES.length)
      .refine(
        (items) =>
          new Set(items).size === ANIME_SOURCES.length &&
          ANIME_SOURCES.every((source) => items.includes(source)),
      ),
    posterStoragePath: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => !value.includes("\0")),
  })
  .strict();
