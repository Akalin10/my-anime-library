import {
  ANILIST_SOURCE,
  BANGUMI_SOURCE,
  TMDB_SOURCE,
  type AnimeSource,
  type NormalizedAnime,
  type NormalizedSourceReference,
} from "@/lib/sources/types";

function normalizedTitle(value: string | null | undefined): string | null {
  const normalized = value
    ?.normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[\p{P}\p{S}\s]+/gu, "")
    .trim();
  return normalized || null;
}

function titleEvidence(anime: NormalizedAnime): Set<string> {
  return new Set(
    [anime.titleNative, anime.titleEnglish, ...anime.aliases]
      .map(normalizedTitle)
      .filter((value): value is string => Boolean(value)),
  );
}

function referencesOverlap(
  left: NormalizedSourceReference[],
  right: NormalizedSourceReference[],
): boolean {
  const leftKeys = new Set(
    left.map(({ source, sourceId }) => `${source}:${sourceId}`),
  );
  return right.some(({ source, sourceId }) =>
    leftKeys.has(`${source}:${sourceId}`),
  );
}

function externalIdsMatch(
  left: NormalizedAnime,
  right: NormalizedAnime,
): boolean {
  return Object.entries(left.externalIds).some(
    ([key, value]) =>
      Boolean(value) &&
      right.externalIds[key as keyof typeof right.externalIds] === value,
  );
}

function metadataConfirmsMatch(
  left: NormalizedAnime,
  right: NormalizedAnime,
): boolean {
  if (left.source === right.source) return false;

  const leftTitles = titleEvidence(left);
  const titleMatches = [...titleEvidence(right)].some((title) =>
    leftTitles.has(title),
  );
  if (!titleMatches) return false;

  return (
    left.year !== null &&
    right.year !== null &&
    left.year === right.year &&
    left.mediaType !== null &&
    right.mediaType !== null &&
    left.mediaType.trim().toUpperCase() ===
      right.mediaType.trim().toUpperCase() &&
    episodeEvidenceMatches(left, right)
  );
}

function episodeEvidenceMatches(
  left: NormalizedAnime,
  right: NormalizedAnime,
): boolean {
  if (left.episodeCount !== null && right.episodeCount !== null) {
    return left.episodeCount === right.episodeCount;
  }

  const bothMovies =
    left.mediaType?.trim().toUpperCase() === "MOVIE" &&
    right.mediaType?.trim().toUpperCase() === "MOVIE";
  return (
    bothMovies &&
    (left.episodeCount === null || left.episodeCount === 1) &&
    (right.episodeCount === null || right.episodeCount === 1)
  );
}

export function isConfirmedSameAnime(
  left: NormalizedAnime,
  right: NormalizedAnime,
): boolean {
  return (
    referencesOverlap(left.sourceReferences, right.sourceReferences) ||
    externalIdsMatch(left, right) ||
    metadataConfirmsMatch(left, right)
  );
}

function uniqueReferences(
  references: NormalizedSourceReference[],
): NormalizedSourceReference[] {
  const seen = new Set<string>();
  return references.filter(({ source, sourceId }) => {
    const key = `${source}:${sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeAnime(
  left: NormalizedAnime,
  right: NormalizedAnime,
  sourcePriority: AnimeSource[],
): NormalizedAnime {
  const priority = new Map(
    sourcePriority.map((source, index) => [source, index]),
  );
  const primary =
    (priority.get(left.source) ?? Number.MAX_SAFE_INTEGER) <=
    (priority.get(right.source) ?? Number.MAX_SAFE_INTEGER)
      ? left
      : right;
  const secondary = primary === left ? right : left;
  const selectedTitles = new Set(
    [
      primary.titleChinese ?? secondary.titleChinese,
      primary.titleNative ?? secondary.titleNative,
      primary.titleEnglish ?? secondary.titleEnglish,
    ].filter((value): value is string => Boolean(value)),
  );
  const aliases = [
    ...primary.aliases,
    ...secondary.aliases,
    secondary.titleChinese,
    secondary.titleNative,
    secondary.titleEnglish,
  ]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) =>
      !selectedTitles.has(value) && values.indexOf(value) === index,
    );

  return {
    ...primary,
    sourceReferences: uniqueReferences([
      ...primary.sourceReferences,
      ...secondary.sourceReferences,
    ]),
    externalIds: { ...secondary.externalIds, ...primary.externalIds },
    titleChinese: primary.titleChinese ?? secondary.titleChinese,
    titleNative: primary.titleNative ?? secondary.titleNative,
    titleEnglish: primary.titleEnglish ?? secondary.titleEnglish,
    aliases,
    year: primary.year ?? secondary.year,
    mediaType: primary.mediaType ?? secondary.mediaType,
    episodeCount: primary.episodeCount ?? secondary.episodeCount,
    studio: primary.studio ?? secondary.studio,
    synopsis: primary.synopsis ?? secondary.synopsis,
    posterUrl: primary.posterUrl ?? secondary.posterUrl,
    relations: primary.relations ?? secondary.relations,
  };
}

export function deduplicateAnimeResults(
  items: NormalizedAnime[],
  sourcePriority: AnimeSource[] = [
    BANGUMI_SOURCE,
    ANILIST_SOURCE,
    TMDB_SOURCE,
  ],
): NormalizedAnime[] {
  const deduplicated: NormalizedAnime[] = [];

  for (const item of items) {
    const matchIndex = deduplicated.findIndex((candidate) =>
      isConfirmedSameAnime(candidate, item),
    );
    if (matchIndex === -1) {
      deduplicated.push(item);
    } else {
      deduplicated[matchIndex] = mergeAnime(
        deduplicated[matchIndex],
        item,
        sourcePriority,
      );
    }
  }

  return deduplicated;
}
