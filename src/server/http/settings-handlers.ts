import { settingsUpdateSchema } from "@/lib/validation/settings";
import type { ExternalSearchService } from "@/server/services/external-search-service";
import {
  InvalidPosterStoragePathError,
  type SettingsService,
} from "@/server/services/settings-service";

import { apiFailure, apiSuccess } from "./api-response";

type SettingsReadUseCase = Pick<SettingsService, "get">;
type SettingsWriteUseCase = Pick<SettingsService, "update">;
type SourceStatusUseCase = Pick<SettingsService, "getSources">;
type SearchCacheUseCase = Pick<ExternalSearchService, "clearCache">;

export function handleGetSettingsRequest(service: SettingsReadUseCase) {
  return apiSuccess(service.get());
}

export async function handleUpdateSettingsRequest(
  request: Request,
  service: SettingsWriteUseCase,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiFailure(
      "INVALID_SETTINGS_BODY",
      "设置请求必须是有效 JSON。",
      400,
    );
  }
  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiFailure(
      "INVALID_SETTINGS_BODY",
      "数据源、优先级或海报保存目录设置无效。",
      400,
    );
  }
  try {
    return apiSuccess(await service.update(parsed.data));
  } catch (error) {
    if (error instanceof InvalidPosterStoragePathError) {
      return apiFailure(
        "INVALID_POSTER_STORAGE_PATH",
        "海报保存目录必须是可写的本地目录，且不能使用符号链接目录。",
        400,
      );
    }
    throw error;
  }
}

export function handleGetSourcesRequest(service: SourceStatusUseCase) {
  return apiSuccess(service.getSources());
}

export function handleClearSearchCacheRequest(service: SearchCacheUseCase) {
  service.clearCache();
  return apiSuccess({ cleared: true as const });
}
