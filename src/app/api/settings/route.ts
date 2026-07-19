import {
  handleGetSettingsRequest,
  handleUpdateSettingsRequest,
} from "@/server/http/settings-handlers";
import { getSettingsService } from "@/server/services/settings-service";
import { apiFailure } from "@/server/http/api-response";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    return handleGetSettingsRequest(getSettingsService());
  } catch {
    return apiFailure("INTERNAL_ERROR", "无法读取设置。", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    return await handleUpdateSettingsRequest(request, getSettingsService());
  } catch {
    return apiFailure("INTERNAL_ERROR", "无法保存设置。", 500);
  }
}
