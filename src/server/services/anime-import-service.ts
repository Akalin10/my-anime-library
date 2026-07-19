import { getDatabase } from "@/lib/db/client";
import {
  DefaultPosterStorage,
  PosterDownloadError,
} from "@/lib/images/default-poster-storage";
import { createBangumiAdapterFromEnv } from "@/lib/sources/bangumi";
import { createAniListAdapterFromEnv } from "@/lib/sources/anilist";
import { findConfirmedAniListStudio } from "@/server/services/anilist-studio-supplement";
import { createTmdbAdapterFromEnv } from "@/lib/sources/tmdb";
import { getEffectivePosterStoragePath } from "@/server/config/runtime-settings";
import { SourceAdapterError } from "@/lib/sources/errors";
import type {
  AnimeSource,
  AnimeSourceAdapter,
  NormalizedAnime,
  NormalizedSourceReference,
} from "@/lib/sources/types";
import { BANGUMI_SOURCE, SOURCE_LABELS } from "@/lib/sources/types";
import {
  AnimeImportRepository,
  DuplicateAnimeError,
} from "@/server/repositories/anime-import-repository";
import type {
  ImportBatchRequest,
  ImportBatchResult,
  ImportItemErrorCode,
  ImportItemFailure,
  ImportItemResult,
} from "@/types/external";

function sourceFailureCode(error: SourceAdapterError): ImportItemErrorCode {
  if (error.code === "TIMEOUT") {
    return "SOURCE_TIMEOUT";
  }
  if (error.code === "RATE_LIMIT") {
    return "SOURCE_RATE_LIMITED";
  }
  return "SOURCE_UNAVAILABLE";
}

function failureMessage(
  code: ImportItemErrorCode,
  source: AnimeSource,
): string {
  const label = SOURCE_LABELS[source];
  switch (code) {
    case "ALREADY_IMPORTED":
      return "该动漫已经导入。";
    case "SOURCE_TIMEOUT":
      return `${label} 请求超时。`;
    case "SOURCE_RATE_LIMITED":
      return `${label} 请求过于频繁，请稍后重试。`;
    case "SOURCE_UNAVAILABLE":
      return `${label} 当前不可用。`;
    case "POSTER_DOWNLOAD_FAILED":
      return "默认封面下载失败。";
    default:
      return "导入失败。";
  }
}

export class AnimeImportService {
  private readonly adapters: Partial<Record<AnimeSource, AnimeSourceAdapter>>;

  constructor(
    adapterOrAdapters:
      | AnimeSourceAdapter
      | Partial<Record<AnimeSource, AnimeSourceAdapter>>,
    private readonly repository: AnimeImportRepository,
    private readonly posterStorage: DefaultPosterStorage,
  ) {
    this.adapters =
      "searchAnime" in adapterOrAdapters
        ? { [BANGUMI_SOURCE]: adapterOrAdapters }
        : adapterOrAdapters;
  }

  async importBatch(request: ImportBatchRequest): Promise<ImportBatchResult> {
    const items: ImportItemResult[] = [];

    for (const item of request.items) {
      items.push(
        await this.importOne(
          item.source,
          item.sourceId,
          item.status ?? request.status,
          item.sourceReferences,
        ),
      );
    }

    const successCount = items.filter(({ success }) => success).length;
    return {
      successCount,
      failureCount: items.length - successCount,
      items,
    };
  }

  private async importOne(
    source: AnimeSource,
    sourceId: string,
    status: ImportBatchRequest["status"],
    requestedReferences: NormalizedSourceReference[] | undefined,
  ): Promise<ImportItemResult> {
    let detail: NormalizedAnime | null = null;
    let downloadedPosterPath: string | null = null;

    try {
      const adapter = this.adapters[source];
      if (!adapter) {
        throw new SourceAdapterError(
          source,
          "UNAVAILABLE",
          `${SOURCE_LABELS[source]} configuration is unavailable`,
        );
      }

      // REQUIREMENTS 8.6: detail -> poster -> relations -> normalize.
      detail = await adapter.getAnimeDetail(sourceId);
      if (detail.source !== source || detail.sourceId !== sourceId) {
        throw new SourceAdapterError(
          source,
          "UNAVAILABLE",
          `${SOURCE_LABELS[source]} returned a mismatched item`,
        );
      }
      detail = await this.supplementBangumiStudio(detail, requestedReferences);
      const posterCandidates = await adapter.getPosterCandidates(sourceId);
      const relations = await adapter.getAnimeRelations(sourceId);
      const references = uniqueSourceReferences([
        ...detail.sourceReferences,
        ...(requestedReferences ?? []),
      ]);
      const normalized: NormalizedAnime = {
        ...detail,
        sourceReferences: references,
        relations,
      };

      // REQUIREMENTS 8.6: check and prevent duplicates before file/database writes.
      if (
        references.some((reference) =>
          this.repository.exists(reference.source, reference.sourceId),
        )
      ) {
        throw new DuplicateAnimeError();
      }

      // REQUIREMENTS 8.6: download the best available poster before saving.
      downloadedPosterPath = await this.posterStorage.downloadBest(
        normalized.sourceId,
        posterCandidates,
      );

      try {
        const animeId = this.repository.importAnime({
          anime: normalized,
          relations,
          status,
          defaultPosterPath: downloadedPosterPath,
        });

        return {
          success: true,
          source,
          sourceId,
          animeId,
          status,
          titleChinese: normalized.titleChinese,
          titleNative: normalized.titleNative,
          defaultPosterPath: downloadedPosterPath,
        };
      } catch (error) {
        if (downloadedPosterPath) {
          await this.posterStorage.remove(downloadedPosterPath);
          downloadedPosterPath = null;
        }
        throw error;
      }
    } catch (error) {
      let code: ImportItemErrorCode;
      if (error instanceof DuplicateAnimeError) {
        code = "ALREADY_IMPORTED";
      } else if (error instanceof SourceAdapterError) {
        code = sourceFailureCode(error);
      } else if (error instanceof PosterDownloadError) {
        code = "POSTER_DOWNLOAD_FAILED";
      } else {
        code = "IMPORT_FAILED";
      }

      const failure: ImportItemFailure = {
        success: false,
        source,
        sourceId,
        titleChinese: detail?.titleChinese ?? null,
        titleNative: detail?.titleNative ?? null,
        error: { code, message: failureMessage(code, source) },
      };
      return failure;
    }
  }

  private async supplementBangumiStudio(
    detail: NormalizedAnime,
    requestedReferences: NormalizedSourceReference[] | undefined,
  ): Promise<NormalizedAnime> {
    if (detail.source !== BANGUMI_SOURCE || detail.studio) {
      return detail;
    }

    const studio = await findConfirmedAniListStudio(
      detail,
      this.adapters.anilist,
      (requestedReferences ?? [])
        .filter(({ source }) => source === "anilist")
        .map(({ sourceId }) => sourceId),
    );

    return studio ? { ...detail, studio } : detail;
  }
}

let animeImportService: AnimeImportService | undefined;

export function getAnimeImportService(): AnimeImportService {
  if (!animeImportService) {
    const adapters: Partial<Record<AnimeSource, AnimeSourceAdapter>> = {};
    try {
      adapters.bangumi = createBangumiAdapterFromEnv();
    } catch {
      // The requested item receives a source-specific failure below.
    }
    try {
      adapters.anilist = createAniListAdapterFromEnv();
    } catch {
      // The requested item receives a source-specific failure below.
    }
    try {
      adapters.tmdb = createTmdbAdapterFromEnv();
    } catch {
      // The requested item receives a source-specific failure below.
    }
    animeImportService = new AnimeImportService(
      adapters,
      new AnimeImportRepository(getDatabase()),
      new DefaultPosterStorage({
        rootPath: getEffectivePosterStoragePath(),
      }),
    );
  }
  return animeImportService;
}

export function resetAnimeImportService(): void {
  animeImportService = undefined;
}

function uniqueSourceReferences(
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
