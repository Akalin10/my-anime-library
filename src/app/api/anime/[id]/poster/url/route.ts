import { apiFailure } from "@/server/http/api-response";
import { handleImportAnimePosterUrlRequest } from "@/server/http/anime-handlers";
import { getAnimePosterService } from "@/server/services/anime-poster-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return await handleImportAnimePosterUrlRequest(
      id,
      request,
      getAnimePosterService(),
    );
  } catch {
    return apiFailure("INTERNAL_ERROR", "通过网址设置封面失败。", 500);
  }
}
