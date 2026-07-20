import { searchParamsToInput } from "@/lib/validation/anime-query";
import {
  externalSearchQuerySchema,
  importBatchRequestSchema,
} from "@/lib/validation/external-api";
import type { AnimeImportService } from "@/server/services/anime-import-service";
import type { ExternalSearchService } from "@/server/services/external-search-service";

import { apiFailure, apiSuccess } from "./api-response";
import { sourceErrorResponse } from "./source-error-response";

type ExternalSearchUseCase = Pick<ExternalSearchService, "search">;
type AnimeImportUseCase = Pick<AnimeImportService, "importBatch">;

export async function handleExternalSearchRequest(
  request: Request,
  service: ExternalSearchUseCase,
): Promise<Response> {
  const input = searchParamsToInput(new URL(request.url).searchParams);
  const parsed = externalSearchQuerySchema.safeParse(input);

  if (!parsed.success) {
    return apiFailure(
      "INVALID_SEARCH_QUERY",
      "query 必须是 1 至 200 个字符，且不能重复。",
      400,
    );
  }

  try {
    return apiSuccess(await service.search(parsed.data.query, parsed.data.sources));
  } catch (error) {
    return (
      sourceErrorResponse(error) ??
      apiFailure("INTERNAL_ERROR", "外部搜索失败。", 500)
    );
  }
}

export async function handleImportRequest(
  request: Request,
  service: AnimeImportUseCase,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiFailure("INVALID_IMPORT_BODY", "导入请求不是有效 JSON。", 400);
  }

  const parsed = importBatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiFailure(
      "INVALID_IMPORT_BODY",
      "items 必须包含 1 至 100 个已启用数据源条目；状态仅支持 WATCHING 或 COMPLETED。",
      400,
    );
  }

  try {
    return apiSuccess(await service.importBatch(parsed.data));
  } catch (error) {
    return (
      sourceErrorResponse(error) ??
      apiFailure("INTERNAL_ERROR", "导入请求处理失败。", 500)
    );
  }
}
