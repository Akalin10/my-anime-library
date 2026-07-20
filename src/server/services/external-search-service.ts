import { getDatabase } from "@/lib/db/client";
import { createAniListAdapterFromEnv } from "@/lib/sources/anilist";
import { createBangumiAdapterFromEnv } from "@/lib/sources/bangumi";
import { createTmdbAdapterFromEnv } from "@/lib/sources/tmdb";
import { SourceAdapterError } from "@/lib/sources/errors";
import { deduplicateAnimeResults } from "@/lib/sources/normalize/deduplicate";
import {
  ANILIST_SOURCE,
  BANGUMI_SOURCE,
  TMDB_SOURCE,
  getSourceLabel,
  type AnimeSourceAdapter,
  type NormalizedAnime,
  type NormalizedAnimeRelation,
} from "@/lib/sources/types";
import { AnimeImportRepository } from "@/server/repositories/anime-import-repository";
import { getSourceRuntimeSettings } from "@/server/config/runtime-settings";
import type {
  ExternalSearchData,
  ExternalSourceState,
} from "@/types/external";

export type SearchSource = {
  source: string;
  adapter: AnimeSourceAdapter | null;
};

type SourceSearchResult = {
  state: ExternalSourceState;
  items: NormalizedAnime[];
};

const MAX_RELATION_ROOTS = 5;
const MAX_RELATED_RESULTS = 40;

function relationAsSearchResult(
  relation: NormalizedAnimeRelation,
): NormalizedAnime {
  return {
    source: relation.source,
    sourceId: relation.sourceId,
    sourceReferences: [
      { source: relation.source, sourceId: relation.sourceId },
    ],
    externalIds: {},
    titleChinese: relation.titleChinese,
    titleNative: relation.titleNative,
    titleEnglish: null,
    aliases: [],
    year: relation.year ?? null,
    mediaType: relation.mediaType,
    episodeCount: null,
    studio: null,
    synopsis: null,
    posterUrl: relation.posterUrl,
    relations: null,
  };
}

export class ExternalSearchService {
  private readonly sources: SearchSource[];

  constructor(
    adapterOrSources: AnimeSourceAdapter | SearchSource[],
    private readonly repository: AnimeImportRepository,
    private readonly sourceSettings: () => {
      enabledSources: string[];
      sourcePriority: string[];
    } = () => ({
      enabledSources: [...this.sources.map(({ source }) => source)],
      sourcePriority: [...this.sources.map(({ source }) => source)],
    }),
  ) {
    this.sources = Array.isArray(adapterOrSources)
      ? adapterOrSources
      : [{ source: BANGUMI_SOURCE, adapter: adapterOrSources }];
  }

  async search(query: string, requestedSources?: string[]): Promise<ExternalSearchData> {
    const settings = this.sourceSettings();
    const enabled = new Set(settings.enabledSources);
    const allowedSources = requestedSources?.length
      ? requestedSources.filter((source) => enabled.has(source))
      : [...enabled];
    const activeSources = this.sources.filter(({ source }) =>
      allowedSources.includes(source),
    );
    const searchedSources = await Promise.all(
      activeSources.map((source) => this.searchSource(source, query)),
    );
    const items = deduplicateAnimeResults(
      searchedSources.flatMap((result) => result.items),
      settings.sourcePriority,
    );

    const existingBySource = new Map<string, Set<string>>();
    for (const source of activeSources) {
      const sourceIds = items.flatMap((item) =>
        item.sourceReferences
          .filter((reference) => reference.source === source.source)
          .map((reference) => reference.sourceId),
      );
      existingBySource.set(
        source.source,
        this.repository.findExistingSourceIds(source.source, sourceIds),
      );
    }

    return {
      items: items.map((item) => ({
        ...item,
        isImported: item.sourceReferences.some((reference) =>
          existingBySource
            .get(reference.source)
            ?.has(reference.sourceId),
        ),
      })),
      sources: searchedSources.map(({ state }) => state),
    };
  }

  clearCache(): void {
    for (const source of this.sources) {
      source.adapter?.clearCache?.();
    }
  }

  private async searchSource(
    source: SearchSource,
    query: string,
  ): Promise<SourceSearchResult> {
    const label = getSourceLabel(source.source);
    if (!source.adapter) {
      return {
        items: [],
        state: {
          source: source.source,
          label,
          status: "ERROR",
          message: `${label} 未配置或暂时不可用。`,
        },
      };
    }

    try {
      const directItems = await source.adapter.searchAnime(query);
      return {
        items: await this.expandRelatedResults(source.adapter, directItems),
        state: {
          source: source.source,
          label,
          status: "SUCCESS",
          message: null,
        },
      };
    } catch (error) {
      return {
        items: [],
        state: {
          source: source.source,
          label,
          status: "ERROR",
          message: sourceFailureMessage(source.source, error),
        },
      };
    }
  }

  private async expandRelatedResults(
    adapter: AnimeSourceAdapter,
    directItems: NormalizedAnime[],
  ): Promise<NormalizedAnime[]> {
    const relationRequests = await Promise.allSettled(
      directItems
        .slice(0, MAX_RELATION_ROOTS)
        .map((item) => adapter.getAnimeRelations(item.sourceId)),
    );
    const seen = new Set(
      directItems.map(({ source, sourceId }) => `${source}:${sourceId}`),
    );
    const relations = relationRequests
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .filter((relation) => {
        const key = `${relation.source}:${relation.sourceId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_RELATED_RESULTS);

    const detailRequests = await Promise.allSettled(
      relations.map((relation) => adapter.getAnimeDetail(relation.sourceId)),
    );
    const relatedItems = detailRequests.map((result, index) =>
      result.status === "fulfilled"
        ? result.value
        : relationAsSearchResult(relations[index]!),
    );

    return [...directItems, ...relatedItems];
  }
}

function sourceFailureMessage(source: string, error: unknown): string {
  const label = getSourceLabel(source);
  if (error instanceof SourceAdapterError) {
    if (error.code === "TIMEOUT") return `${label} 请求超时。`;
    if (error.code === "RATE_LIMIT") {
      return `${label} 请求过于频繁，请稍后重试。`;
    }
  }
  return `${label} 请求失败。`;
}

let externalSearchService: ExternalSearchService | undefined;

export function getExternalSearchService(): ExternalSearchService {
  if (!externalSearchService) {
    let bangumi: AnimeSourceAdapter | null = null;
    let aniList: AnimeSourceAdapter | null = null;
    let tmdb: AnimeSourceAdapter | null = null;
    try {
      bangumi = createBangumiAdapterFromEnv();
    } catch {
      // Reported as an isolated source failure in the search response.
    }
    try {
      aniList = createAniListAdapterFromEnv();
    } catch {
      // Reported as an isolated source failure in the search response.
    }
    try {
      tmdb = createTmdbAdapterFromEnv();
    } catch {
      // Reported as an isolated source failure in the search response.
    }

    externalSearchService = new ExternalSearchService(
      [
        { source: BANGUMI_SOURCE, adapter: bangumi },
        { source: ANILIST_SOURCE, adapter: aniList },
        { source: TMDB_SOURCE, adapter: tmdb },
      ],
      new AnimeImportRepository(getDatabase()),
      getSourceRuntimeSettings,
    );
  }
  return externalSearchService;
}
