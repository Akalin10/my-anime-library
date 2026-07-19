import { apiFailure } from "@/server/http/api-response";
import { handleGetSourcesRequest } from "@/server/http/settings-handlers";
import { getSettingsService } from "@/server/services/settings-service";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    return handleGetSourcesRequest(getSettingsService());
  } catch {
    return apiFailure("INTERNAL_ERROR", "无法读取数据源状态。", 500);
  }
}
