import { apiFailure } from "@/server/http/api-response";
import { handleListAnimeRequest } from "@/server/http/anime-handlers";
import { getAnimeReadService } from "@/server/services/anime-read-service";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    return handleListAnimeRequest(request, getAnimeReadService());
  } catch {
    return apiFailure("INTERNAL_ERROR", "读取本地动漫库失败。", 500);
  }
}
