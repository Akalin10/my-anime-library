import { z } from "zod";

import { ANIME_FILTERS, ANIME_SORTS } from "@/types/anime";
import { ANIME_STATUSES } from "@/lib/db/schema";

const optionalSearchText = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  },
  z.string().max(200).optional(),
);

export const animeListQuerySchema = z
  .object({
    status: z.enum(ANIME_FILTERS).default("ALL"),
    sort: z.enum(ANIME_SORTS).default("RECENT"),
    query: optionalSearchText,
  })
  .strict();

export const animeIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);

export const animeStatusUpdateSchema = z
  .object({ status: z.enum(ANIME_STATUSES) })
  .strict();

export function searchParamsToInput(searchParams: URLSearchParams) {
  const input: Record<string, string | string[]> = {};

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    input[key] = values.length === 1 ? values[0] : values;
  }

  return input;
}
