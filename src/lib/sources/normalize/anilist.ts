import type {
  AniListMedia,
  AniListRelationEdge,
} from "@/lib/sources/anilist/schemas";
import {
  ANILIST_SOURCE,
  type NormalizedAnime,
  type NormalizedAnimeRelation,
  type PosterCandidate,
} from "@/lib/sources/types";

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function mediaType(format: string | null | undefined): string | null {
  switch (format) {
    case "TV":
    case "TV_SHORT":
      return "TV";
    case "MOVIE":
      return "MOVIE";
    case "SPECIAL":
      return "SPECIAL";
    case "OVA":
      return "OVA";
    case "ONA":
      return "WEB";
    case "MUSIC":
      return "MUSIC";
    default:
      return null;
  }
}

function preferredPosterUrl(media: AniListMedia): string | null {
  return (
    nonEmpty(media.coverImage?.extraLarge) ??
    nonEmpty(media.coverImage?.large) ??
    nonEmpty(media.coverImage?.medium)
  );
}

export function normalizeAniListMedia(media: AniListMedia): NormalizedAnime {
  const titleNative = nonEmpty(media.title.native) ?? nonEmpty(media.title.romaji);
  const titleEnglish = nonEmpty(media.title.english);
  const excludedTitles = new Set(
    [titleNative, titleEnglish].filter((value): value is string => Boolean(value)),
  );
  const aliases = [nonEmpty(media.title.romaji), ...(media.synonyms ?? [])]
    .map((value) => nonEmpty(value))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) =>
      !excludedTitles.has(value) && values.indexOf(value) === index,
    );
  const sourceId = String(media.id);

  return {
    source: ANILIST_SOURCE,
    sourceId,
    sourceReferences: [{ source: ANILIST_SOURCE, sourceId }],
    externalIds: media.idMal
      ? { myAnimeList: String(media.idMal) }
      : {},
    titleChinese: null,
    titleNative,
    titleEnglish,
    aliases,
    year: media.release?.year ?? null,
    mediaType: mediaType(media.format),
    episodeCount: media.episodes,
    studio:
      media.studios?.nodes
        .map(({ name }) => name.trim())
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join("、") || null,
    synopsis: nonEmpty(media.description),
    posterUrl: preferredPosterUrl(media),
    relations: null,
  };
}

export function normalizeAniListRelations(
  edges: AniListRelationEdge[],
): NormalizedAnimeRelation[] {
  return edges.flatMap((edge) => {
    if (!edge.node || edge.node.type !== "ANIME" || !edge.relationType) {
      return [];
    }

    return [
      {
        source: ANILIST_SOURCE,
        sourceId: String(edge.node.id),
        relationType: edge.relationType,
        titleChinese: null,
        titleNative:
          nonEmpty(edge.node.title.native) ?? nonEmpty(edge.node.title.romaji),
        year: edge.node.release?.year ?? null,
        mediaType: mediaType(edge.node.format),
        posterUrl:
          nonEmpty(edge.node.coverImage?.extraLarge) ??
          nonEmpty(edge.node.coverImage?.large) ??
          nonEmpty(edge.node.coverImage?.medium),
      },
    ];
  });
}

export function normalizeAniListPosterCandidates(
  media: AniListMedia,
): PosterCandidate[] {
  const sourceId = String(media.id);
  const sizes = ["extraLarge", "large", "medium"] as const;
  const seen = new Set<string>();

  return sizes.flatMap((size) => {
    const url = nonEmpty(media.coverImage?.[size]);
    if (!url || seen.has(url)) {
      return [];
    }
    seen.add(url);
    return [{ source: ANILIST_SOURCE, sourceId, size, url }];
  });
}
