import { handleImportRequest } from "@/server/http/external-handlers";
import { getAnimeImportService } from "@/server/services/anime-import-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleImportRequest(request, {
    importBatch: (batch) => getAnimeImportService().importBatch(batch),
  });
}
