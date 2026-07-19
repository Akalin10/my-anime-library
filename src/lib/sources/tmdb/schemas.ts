import { z } from "zod";

const nullableText = z.string().nullable();

export const tmdbMovieSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  original_title: z.string(),
  original_language: z.string(),
  genre_ids: z.array(z.number().int().positive()).optional().default([]),
  overview: nullableText.optional().default(null),
  release_date: nullableText.optional().default(null),
  poster_path: nullableText.optional().default(null),
  production_companies: z
    .array(z.object({ name: z.string() }))
    .optional(),
  external_ids: z
    .object({
      imdb_id: nullableText.optional(),
      wikidata_id: nullableText.optional(),
    })
    .optional(),
});

export const tmdbSearchResponseSchema = z.object({
  results: z.array(tmdbMovieSchema),
});

export const tmdbGenreListSchema = z.object({
  genres: z.array(
    z.object({ id: z.number().int().positive(), name: z.string() }),
  ),
});

export type TmdbMovie = z.infer<typeof tmdbMovieSchema>;
