import type { AnimeStatus } from "@/lib/db/schema";
import { ANIME_SOURCES, type AnimeSource } from "@/lib/sources/types";
import type {
  ExternalSearchResult,
  ImportBatchRequest,
} from "@/types/external";

export const SEARCH_GROUP_ORDER = [
  "MAIN",
  "OVA_OAD",
  "MOVIE",
  "SPECIAL",
  "RECAP",
  "SIDE_STORY",
  "OTHER",
] as const;

export type SearchGroupKey = (typeof SEARCH_GROUP_ORDER)[number];

export const SEARCH_GROUP_LABELS: Record<SearchGroupKey, string> = {
  MAIN: "正传",
  OVA_OAD: "OVA / OAD",
  MOVIE: "剧场版",
  SPECIAL: "特别篇",
  RECAP: "总集篇",
  SIDE_STORY: "外传 / 衍生",
  OTHER: "其他搜索结果",
};

export type ImportSelection = Record<string, AnimeStatus>;

export function searchResultKey(
  result: Pick<ExternalSearchResult, "source" | "sourceId">,
) {
  return `${result.source}:${result.sourceId}`;
}

function groupFromExplicitMediaType(mediaType: string | null): SearchGroupKey {
  const value = mediaType?.trim().toUpperCase();

  if (value === "OVA" || value === "OAD") {
    return "OVA_OAD";
  }
  if (value === "MOVIE" || value === "剧场版" || value === "映画") {
    return "MOVIE";
  }
  if (
    value === "SPECIAL" ||
    value === "SP" ||
    value === "TVSP" ||
    value === "特别篇"
  ) {
    return "SPECIAL";
  }
  if (value === "RECAP" || value === "总集篇") {
    return "RECAP";
  }
  if (
    value === "SIDE STORY" ||
    value === "SIDE_STORY" ||
    value === "SPIN-OFF" ||
    value === "SPIN_OFF" ||
    value === "外传"
  ) {
    return "SIDE_STORY";
  }
  if (value === "MAIN" || value === "正传") {
    return "MAIN";
  }
  return "OTHER";
}

export function groupSearchResults(items: ExternalSearchResult[]) {
  const groups = new Map<SearchGroupKey, ExternalSearchResult[]>();

  for (const item of items) {
    const group = groupFromExplicitMediaType(item.mediaType);
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }

  return SEARCH_GROUP_ORDER.flatMap((key) => {
    const groupedItems = groups.get(key);
    return groupedItems?.length
      ? [{ key, label: SEARCH_GROUP_LABELS[key], items: groupedItems }]
      : [];
  });
}

export function buildExternalSearchUrl(query: string) {
  return `/api/search?${new URLSearchParams({ query: query.trim() }).toString()}`;
}

export function buildImportRequest(
  selection: ImportSelection,
  status: AnimeStatus,
  results: ExternalSearchResult[] = [],
): ImportBatchRequest {
  const resultByKey = new Map(
    results.map((result) => [searchResultKey(result), result]),
  );

  return {
    status,
    items: Object.entries(selection).map(([key, itemStatus]) => {
      const result = resultByKey.get(key);
      if (result) {
        return {
          source: result.source,
          sourceId: result.sourceId,
          sourceReferences: result.sourceReferences,
          status: itemStatus,
        };
      }

      const [possibleSource, possibleSourceId] = key.split(":", 2);
      const source = ANIME_SOURCES.includes(possibleSource as AnimeSource)
        ? (possibleSource as AnimeSource)
        : "bangumi";
      return {
        source,
        sourceId: possibleSourceId ?? key,
        status: itemStatus,
      };
    }),
  };
}
