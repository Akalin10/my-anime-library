import type { TmdbMovie } from "@/lib/sources/tmdb/schemas";
import {
  TMDB_SOURCE,
  type NormalizedAnime,
  type PosterCandidate,
} from "@/lib/sources/types";

const HAN_TEXT = /\p{Script=Han}/u;

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function releaseYear(value: string | null | undefined): number | null {
  const match = value?.match(/^(\d{4})-/);
  return match ? Number(match[1]) : null;
}

function imageUrl(
  imageBaseUrl: string,
  size: "original" | "w780" | "w500",
  path: string | null | undefined,
): string | null {
  const normalizedPath = nonEmpty(path);
  return normalizedPath
    ? `${imageBaseUrl}/${size}/${normalizedPath.replace(/^\//, "")}`
    : null;
}

export function normalizeTmdbMovie(
  movie: TmdbMovie,
  imageBaseUrl: string,
): NormalizedAnime {
  const localizedTitle = nonEmpty(movie.title);
  const originalTitle = nonEmpty(movie.original_title);
  const titleChinese =
    localizedTitle && HAN_TEXT.test(localizedTitle) ? localizedTitle : null;
  const titleEnglish =
    movie.original_language === "en"
      ? originalTitle
      : localizedTitle && !HAN_TEXT.test(localizedTitle)
        ? localizedTitle
        : null;
  const selectedTitles = new Set(
    [titleChinese, originalTitle, titleEnglish].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const sourceId = String(movie.id);

  return {
    source: TMDB_SOURCE,
    sourceId,
    sourceReferences: [{ source: TMDB_SOURCE, sourceId }],
    externalIds: {
      ...(nonEmpty(movie.external_ids?.imdb_id)
        ? { imdb: nonEmpty(movie.external_ids?.imdb_id) ?? undefined }
        : {}),
      ...(nonEmpty(movie.external_ids?.wikidata_id)
        ? { wikidata: nonEmpty(movie.external_ids?.wikidata_id) ?? undefined }
        : {}),
    },
    titleChinese,
    titleNative: originalTitle,
    titleEnglish,
    aliases: localizedTitle && !selectedTitles.has(localizedTitle)
      ? [localizedTitle]
      : [],
    year: releaseYear(movie.release_date),
    mediaType: "MOVIE",
    episodeCount: null,
    studio:
      movie.production_companies
        ?.map(({ name }) => name.trim())
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join("、") || null,
    synopsis: nonEmpty(movie.overview),
    posterUrl: imageUrl(imageBaseUrl, "w780", movie.poster_path),
    relations: null,
  };
}

export function normalizeTmdbPosterCandidates(
  movie: TmdbMovie,
  imageBaseUrl: string,
): PosterCandidate[] {
  const sourceId = String(movie.id);
  const sizes = [
    ["extraLarge", "original"],
    ["large", "w780"],
    ["common", "w500"],
  ] as const;

  return sizes.flatMap(([size, tmdbSize]) => {
    const url = imageUrl(imageBaseUrl, tmdbSize, movie.poster_path);
    return url ? [{ source: TMDB_SOURCE, sourceId, size, url }] : [];
  });
}
