import type { AnimeStatus, RelationType } from "@/lib/db/schema";
import type {
  NormalizedAnime,
  NormalizedSourceReference,
} from "@/lib/sources/types";

export type ExternalSearchResult = NormalizedAnime & {
  isImported: boolean;
};

export type ExternalSourceState = {
  source: string;
  label: string;
  status: "SUCCESS" | "ERROR";
  message: string | null;
};

export type ExternalSearchData = {
  items: ExternalSearchResult[];
  sources: ExternalSourceState[];
};

export type ImportRequestItem = {
  source: string;
  sourceId: string;
  sourceReferences?: NormalizedSourceReference[];
  status?: AnimeStatus;
};

export type ImportBatchRequest = {
  items: ImportRequestItem[];
  status: AnimeStatus;
};

export type ImportItemErrorCode =
  | "ALREADY_IMPORTED"
  | "SOURCE_TIMEOUT"
  | "SOURCE_RATE_LIMITED"
  | "SOURCE_UNAVAILABLE"
  | "POSTER_DOWNLOAD_FAILED"
  | "IMPORT_FAILED";

export type ImportItemSuccess = {
  success: true;
  source: string;
  sourceId: string;
  animeId: number;
  status: AnimeStatus;
  titleChinese: string | null;
  titleNative: string | null;
  defaultPosterPath: string | null;
};

export type ImportItemFailure = {
  success: false;
  source: string;
  sourceId: string;
  titleChinese: string | null;
  titleNative: string | null;
  error: {
    code: ImportItemErrorCode;
    message: string;
  };
};

export type ImportItemResult = ImportItemSuccess | ImportItemFailure;

export type ImportBatchResult = {
  successCount: number;
  failureCount: number;
  items: ImportItemResult[];
};

export type PersistedRelation = {
  relatedSourceId: string;
  relationType: RelationType;
};
