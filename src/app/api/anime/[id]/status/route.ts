import { apiFailure } from "@/server/http/api-response";
import { handleUpdateAnimeStatusRequest } from "@/server/http/anime-handlers";
import { getAnimeStatusService } from "@/server/services/anime-status-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return await handleUpdateAnimeStatusRequest(
      id,
      request,
      getAnimeStatusService(),
    );
  } catch {
    return apiFailure("INTERNAL_ERROR", "更新动漫状态失败。", 500);
  }
}
