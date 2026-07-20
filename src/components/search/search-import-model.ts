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

function sortResultsWithinGroup(items: ExternalSearchResult[]): ExternalSearchResult[] {
  const titleForSort = (item: ExternalSearchResult) =>
    item.titleChinese ?? item.titleNative ?? item.titleEnglish ?? "";

  return [...items].sort((left, right) => {
    const leftType = left.mediaType?.trim().toUpperCase() ?? "";
    const rightType = right.mediaType?.trim().toUpperCase() ?? "";
    if (leftType !== rightType) {
      const rank = (type: string) => {
        if (type === "TV" || type === "MAIN") return 0;
        if (type === "OVA" || type === "OAD") return 2;
        if (type === "MOVIE" || type === "剧场版" || type === "映画") return 3;
        if (type === "SPECIAL" || type === "SP" || type === "TVSP" || type === "特别篇") return 4;
        if (type === "RECAP" || type === "总集篇") return 5;
        if (type === "SIDE STORY" || type === "SIDE_STORY" || type === "SPIN-OFF" || type === "SPIN_OFF" || type === "外传") return 6;
        return 7;
      };
      return rank(leftType) - rank(rightType);
    }

    const leftYear = left.year ?? 0;
    const rightYear = right.year ?? 0;
    if (leftYear !== rightYear) return rightYear - leftYear;

    return titleForSort(left).localeCompare(titleForSort(right), "zh-CN");
  });
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
      ? [{ key, label: SEARCH_GROUP_LABELS[key], items: sortResultsWithinGroup(groupedItems) }]
      : [];
  });
}

export function buildExternalSearchUrl(query: string, sources?: string[]) {
  const parameters = new URLSearchParams({ query: query.trim() });
  for (const source of sources ?? []) {
    parameters.append("sources", source);
  }
  return `/api/search?${parameters.toString()}`;
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
      const source = (ANIME_SOURCES as readonly string[]).includes(possibleSource)
        ? possibleSource
        : "bangumi";
      return {
        source,
        sourceId: possibleSourceId ?? key,
        status: itemStatus,
      };
    }),
  };
}
