import { z } from "zod";

const nullableText = z.string().nullable();

const aniListTitleSchema = z.object({
  romaji: nullableText,
  english: nullableText,
  native: nullableText,
});

const aniListCoverImageSchema = z
  .object({
    extraLarge: nullableText,
    large: nullableText,
    medium: nullableText,
  })
  .nullable();

const aniListMediaCoreSchema = z.object({
  id: z.number().int().positive(),
  idMal: z.number().int().positive().nullable(),
  title: aniListTitleSchema,
  synonyms: z.array(z.string()).nullable(),
  release: z
    .object({ year: z.number().int().positive().nullable() })
    .nullable(),
  format: nullableText,
  episodes: z.number().int().positive().nullable(),
  studios: z
    .object({ nodes: z.array(z.object({ name: z.string() })) })
    .nullable(),
  description: nullableText,
  coverImage: aniListCoverImageSchema,
});

const aniListRelatedMediaSchema = z.object({
  id: z.number().int().positive(),
  idMal: z.number().int().positive().nullable(),
  type: z.string().nullable(),
  title: aniListTitleSchema,
  release: z
    .object({ year: z.number().int().positive().nullable() })
    .nullable(),
  format: nullableText,
  coverImage: aniListCoverImageSchema,
});

const aniListRelationEdgeSchema = z.object({
  relationType: z.string().nullable(),
  node: aniListRelatedMediaSchema.nullable(),
});

export const aniListSearchResponseSchema = z.object({
  data: z.object({
    Page: z.object({ media: z.array(aniListMediaCoreSchema) }),
  }),
});

export const aniListDetailResponseSchema = z.object({
  data: z.object({ Media: aniListMediaCoreSchema }),
});

export const aniListRelationsResponseSchema = z.object({
  data: z.object({
    Media: z.object({
      relations: z
        .object({ edges: z.array(aniListRelationEdgeSchema) })
        .nullable(),
    }),
  }),
});

export type AniListMedia = z.infer<typeof aniListMediaCoreSchema>;
export type AniListRelationEdge = z.infer<typeof aniListRelationEdgeSchema>;
