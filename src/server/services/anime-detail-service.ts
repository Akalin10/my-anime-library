import { getDatabase } from "@/lib/db/client";
import { createAniListAdapterFromEnv } from "@/lib/sources/anilist";
import { createBangumiAdapterFromEnv } from "@/lib/sources/bangumi";
import { createTmdbAdapterFromEnv } from "@/lib/sources/tmdb";
import { findConfirmedAniListStudio } from "@/server/services/anilist-studio-supplement";
import type {
  AnimeSource,
  AnimeSourceAdapter,
  NormalizedAnime,
  NormalizedAnimeRelation,
} from "@/lib/sources/types";
import { ANILIST_SOURCE, ANIME_SOURCES, BANGUMI_SOURCE } from "@/lib/sources/types";
import { AnimeRepository } from "@/server/repositories/anime-repository";
import type { AnimeDetailData, RelatedAnimeDetail } from "@/types/anime";

type DetailRow = NonNullable<
  ReturnType<AnimeRepository["findDetailById"]>
>;
type LocalRelatedRow = ReturnType<
  AnimeRepository["findLocalRelatedAnime"]
>[number];

function toRelatedFromLocal(row: LocalRelatedRow): RelatedAnimeDetail {
  return {
    animeId: row.id,
    source: row.source,
    sourceId: row.sourceId,
    relationType: row.relationType,
    titleChinese:
      row.titleChinese ?? row.titleNative ?? row.titleEnglish ?? "暂无资料",
    titleNative: row.titleNative,
    year: row.year,
    mediaType: row.mediaType,
    defaultPosterUrl: row.defaultPosterUrl,
    defaultPosterPath: row.defaultPosterPath,
    customPosterPath: row.customPosterPath,
    isImported: true,
  };
}

function toRelatedFromSource(
  relation: NormalizedAnimeRelation,
  local:
    | ReturnType<AnimeRepository["findBySourceReferenceIds"]>[number]
    | undefined,
): RelatedAnimeDetail {
  return {
    animeId: local?.id ?? null,
    source: relation.source,
    sourceId: relation.sourceId,
    relationType: relation.relationType,
    titleChinese:
      local?.titleChinese ??
      relation.titleChinese ??
      relation.titleNative ??
      "暂无资料",
    titleNative: local?.titleNative ?? relation.titleNative,
    year: local?.year ?? null,
    mediaType: local?.mediaType ?? relation.mediaType,
    defaultPosterUrl: local?.defaultPosterUrl ?? relation.posterUrl,
    defaultPosterPath: local?.defaultPosterPath ?? null,
    customPosterPath: local?.customPosterPath ?? null,
    isImported: Boolean(local),
  };
}

function toDetail(
  row: DetailRow,
  relatedAnime: RelatedAnimeDetail[],
  relatedAnimeUnavailable: boolean,
): AnimeDetailData {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    relatedAnime,
    relatedAnimeUnavailable,
  };
}

function toNormalizedAnime(
  row: DetailRow,
  sourceReferences: Array<{ source: string; sourceId: string }>,
): NormalizedAnime {
  return {
    source: row.source as AnimeSource,
    sourceId: row.sourceId,
    sourceReferences: sourceReferences.filter(
      (reference): reference is { source: AnimeSource; sourceId: string } =>
        ANIME_SOURCES.includes(reference.source as AnimeSource),
    ),
    externalIds: {},
    titleChinese: row.titleChinese,
    titleNative: row.titleNative,
    titleEnglish: row.titleEnglish,
    aliases: row.aliases,
    year: row.year,
    mediaType: row.mediaType,
    episodeCount: row.episodeCount,
    studio: row.studio,
    synopsis: row.synopsis,
    posterUrl: row.defaultPosterUrl,
    relations: null,
  };
}

export class AnimeDetailService {
  private readonly adapters: Partial<Record<AnimeSource, AnimeSourceAdapter>>;

  constructor(
    private readonly repository: AnimeRepository,
    adapterOrAdapters:
      | AnimeSourceAdapter
      | Partial<Record<AnimeSource, AnimeSourceAdapter>>
      | null,
  ) {
    this.adapters = !adapterOrAdapters
      ? {}
      : "searchAnime" in adapterOrAdapters
        ? { bangumi: adapterOrAdapters }
        : adapterOrAdapters;
  }

  async getById(id: number): Promise<AnimeDetailData | null> {
    let row = this.repository.findDetailById(id);
    if (!row) {
      return null;
    }

    if (row.source === BANGUMI_SOURCE && !row.studio) {
      const sourceReferences = this.repository.findSourceReferencesByAnimeId(id);
      const studio = await findConfirmedAniListStudio(
        toNormalizedAnime(row, sourceReferences),
        this.adapters[ANILIST_SOURCE],
        sourceReferences
          .filter(({ source }) => source === ANILIST_SOURCE)
          .map(({ sourceId }) => sourceId),
      );
      if (studio) {
        this.repository.updateStudioIfMissing(id, studio);
        row = { ...row, studio };
      }
    }

    const relatedBySourceId = new Map(
      this.repository
        .findLocalRelatedAnime(id)
        .map((related) => [
          `${related.source}:${related.sourceId}`,
          toRelatedFromLocal(related),
        ]),
    );
    let relatedAnimeUnavailable = false;

    if (ANIME_SOURCES.includes(row.source as AnimeSource)) {
      const source = row.source as AnimeSource;
      const adapter = this.adapters[source];
      if (!adapter) {
        relatedAnimeUnavailable = true;
      } else {
        try {
          const relations = await adapter.getAnimeRelations(row.sourceId);
          const importedRows = this.repository.findBySourceReferenceIds(
            source,
            relations.map(({ sourceId }) => sourceId),
          );
          const importedBySourceId = new Map(
            importedRows.map((related) => [
              related.referenceSourceId,
              related,
            ]),
          );

          for (const relation of relations) {
            const relationKey = `${relation.source}:${relation.sourceId}`;
            const imported = importedBySourceId.get(relation.sourceId);
            const existingLocal = relatedBySourceId.get(relationKey);
            if (!imported && existingLocal) {
              relatedBySourceId.set(relationKey, {
                ...existingLocal,
                relationType: relation.relationType,
              });
              continue;
            }
            relatedBySourceId.set(
              relationKey,
              toRelatedFromSource(
                relation,
                imported,
              ),
            );
          }
        } catch {
          relatedAnimeUnavailable = true;
        }
      }
    }

    return toDetail(
      row,
      [...relatedBySourceId.values()],
      relatedAnimeUnavailable,
    );
  }
}

let animeDetailService: AnimeDetailService | undefined;

export function getAnimeDetailService() {
  if (!animeDetailService) {
    const adapters: Partial<Record<AnimeSource, AnimeSourceAdapter>> = {};
    try {
      adapters.bangumi = createBangumiAdapterFromEnv();
    } catch {
      // Local details remain available when the optional external source is not configured.
    }
    try {
      adapters.anilist = createAniListAdapterFromEnv();
    } catch {
      // Local details remain available when the optional external source is not configured.
    }
    try {
      adapters.tmdb = createTmdbAdapterFromEnv();
    } catch {
      // Local details remain available when the optional external source is not configured.
    }

    animeDetailService = new AnimeDetailService(
      new AnimeRepository(getDatabase()),
      adapters,
    );
  }

  return animeDetailService;
}
