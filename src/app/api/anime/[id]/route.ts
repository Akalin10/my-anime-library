import { apiFailure } from "@/server/http/api-response";
import {
  handleDeleteAnimeRequest,
  handleGetAnimeDetailRequest,
} from "@/server/http/anime-handlers";
import { getAnimeDeleteService } from "@/server/services/anime-delete-service";
import { getAnimeDetailService } from "@/server/services/anime-detail-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return await handleGetAnimeDetailRequest(id, getAnimeDetailService());
  } catch {
    return apiFailure("INTERNAL_ERROR", "读取本地动漫详情失败。", 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return await handleDeleteAnimeRequest(id, getAnimeDeleteService());
  } catch {
    return apiFailure("INTERNAL_ERROR", "删除本地动漫失败。", 500);
  }
}
