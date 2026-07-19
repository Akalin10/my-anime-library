import { handleExternalSearchRequest } from "@/server/http/external-handlers";
import { getExternalSearchService } from "@/server/services/external-search-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleExternalSearchRequest(request, {
    search: (query) => getExternalSearchService().search(query),
  });
}
