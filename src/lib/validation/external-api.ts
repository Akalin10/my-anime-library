import { z } from "zod";

import { ANIME_STATUSES } from "@/lib/db/schema";
import { ANIME_SOURCES } from "@/lib/sources/types";

const sourceIdSchema = z.string().regex(/^[1-9]\d*$/);
const sourceStrSchema = z.string().min(1).max(50);
const sourceReferenceSchema = z
  .object({
    source: sourceStrSchema,
    sourceId: sourceIdSchema,
  })
  .strict();

const externalSourcesParamSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value;
    return value;
  },
  z.array(sourceStrSchema).optional(),
);

export const externalSearchQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    sources: externalSourcesParamSchema,
  })
  .strict();

export const importBatchRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            source: sourceStrSchema,
            sourceId: sourceIdSchema,
            sourceReferences: z
              .array(sourceReferenceSchema)
              .min(1)
              .max(3)
              .optional(),
            status: z.enum(ANIME_STATUSES).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    status: z.enum(ANIME_STATUSES).default("WATCHING"),
  })
  .strict();
