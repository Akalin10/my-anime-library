import { z } from "zod";

const bangumiImageSchema = z.object({
  large: z.string().optional().nullable(),
  common: z.string().optional().nullable(),
  medium: z.string().optional().nullable(),
  small: z.string().optional().nullable(),
  grid: z.string().optional().nullable(),
});

const bangumiInfoboxEntrySchema = z.object({
  k: z.string().optional(),
  v: z.string(),
});

const bangumiInfoboxItemSchema = z.object({
  key: z.string(),
  value: z.union([
    z.string(),
    z.array(bangumiInfoboxEntrySchema),
  ]),
});

export const bangumiSubjectSchema = z.object({
  id: z.number().int().positive(),
  type: z.number().int(),
  name: z.string(),
  name_cn: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  platform: z.string().optional().nullable(),
  images: bangumiImageSchema.optional().nullable(),
  infobox: z.array(bangumiInfoboxItemSchema).optional().nullable(),
  eps: z.number().int().nonnegative().optional().nullable(),
  total_episodes: z.number().int().nonnegative().optional().nullable(),
});

export const bangumiSearchResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  data: z.array(bangumiSubjectSchema),
});

export const bangumiRelationSchema = z.object({
  id: z.number().int().positive(),
  type: z.number().int(),
  name: z.string(),
  name_cn: z.string().optional().nullable(),
  images: bangumiImageSchema.optional().nullable(),
  relation: z.string(),
});

export const bangumiRelationsResponseSchema = z.array(bangumiRelationSchema);

export type BangumiImages = z.infer<typeof bangumiImageSchema>;
export type BangumiInfoboxItem = z.infer<typeof bangumiInfoboxItemSchema>;
export type BangumiSubject = z.infer<typeof bangumiSubjectSchema>;
export type BangumiRelation = z.infer<typeof bangumiRelationSchema>;
