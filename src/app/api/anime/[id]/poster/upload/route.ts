import { apiFailure } from "@/server/http/api-response";
import { handleUploadAnimePosterRequest } from "@/server/http/anime-handlers";
import { getAnimePosterService } from "@/server/services/anime-poster-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return await handleUploadAnimePosterRequest(
      id,
      request,
      getAnimePosterService(),
    );
  } catch {
    return apiFailure("INTERNAL_ERROR", "上传自定义封面失败。", 500);
  }
}
