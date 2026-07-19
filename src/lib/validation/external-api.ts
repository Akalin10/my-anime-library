import { z } from "zod";

import { ANIME_STATUSES } from "@/lib/db/schema";
import { ANIME_SOURCES } from "@/lib/sources/types";

const sourceIdSchema = z.string().regex(/^[1-9]\d*$/);
const sourceReferenceSchema = z
  .object({
    source: z.enum(ANIME_SOURCES),
    sourceId: sourceIdSchema,
  })
  .strict();

export const externalSearchQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(200),
  })
  .strict();

export const importBatchRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            source: z.enum(ANIME_SOURCES),
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
