import { apiFailure } from "@/server/http/api-response";
import { handleRestoreAnimePosterRequest } from "@/server/http/anime-handlers";
import { getAnimePosterService } from "@/server/services/anime-poster-service";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return await handleRestoreAnimePosterRequest(id, getAnimePosterService());
  } catch {
    return apiFailure("INTERNAL_ERROR", "恢复默认封面失败。", 500);
  }
}
