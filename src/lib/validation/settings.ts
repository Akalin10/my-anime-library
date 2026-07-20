import { z } from "zod";

import { ANIME_SOURCES } from "@/lib/sources/types";

const sourceIdSchema = z.string().min(1).max(50);

const customSourceConfigSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[a-z][a-z0-9_-]*$/, "ID must be lowercase alphanumeric with hyphens/underscores"),
    name: z.string().min(1).max(100),
    apiUrl: z.string().url().min(1).max(500),
  })
  .strict();

export const settingsUpdateSchema = z
  .object({
    enabledSources: z
      .array(sourceIdSchema)
      .max(20)
      .refine((items) => new Set(items).size === items.length, {
        message: "enabledSources must not contain duplicates",
      }),
    sourcePriority: z
      .array(sourceIdSchema)
      .min(1)
      .max(20)
      .refine((items) => new Set(items).size === items.length, {
        message: "sourcePriority must not contain duplicates",
      }),
    customSources: z.array(customSourceConfigSchema).max(20).optional(),
    posterStoragePath: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => !value.includes("\0")),
    theme: z.enum(["light", "dark", "system"]),
  })
  .strict()
  .refine(
    (data) => {
      const customIds = data.customSources?.map((cs) => cs.id) ?? [];
      const knownIds = [...ANIME_SOURCES, ...customIds];
      return data.enabledSources.every((id) => knownIds.includes(id));
    },
    {
      message: "enabledSources contains IDs not in built-in sources or customSources",
      path: ["enabledSources"],
    },
  )
  .refine(
    (data) => {
      const customIds = data.customSources?.map((cs) => cs.id) ?? [];
      const knownIds = [...ANIME_SOURCES, ...customIds];
      return data.sourcePriority.every((id) => knownIds.includes(id));
    },
    {
      message: "sourcePriority contains IDs not in built-in sources or customSources",
      path: ["sourcePriority"],
    },
  );
