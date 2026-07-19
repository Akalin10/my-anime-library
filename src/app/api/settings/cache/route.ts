import { apiFailure } from "@/server/http/api-response";
import { handleClearSearchCacheRequest } from "@/server/http/settings-handlers";
import { getExternalSearchService } from "@/server/services/external-search-service";

export const dynamic = "force-dynamic";

export function DELETE() {
  try {
    return handleClearSearchCacheRequest(getExternalSearchService());
  } catch {
    return apiFailure("INTERNAL_ERROR", "无法清理搜索缓存。", 500);
  }
}
