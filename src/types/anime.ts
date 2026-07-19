import type { AnimeStatus } from "@/lib/db/schema";

export const ANIME_FILTERS = ["ALL", "WATCHING", "COMPLETED"] as const;
export const ANIME_SORTS = ["RECENT", "TITLE", "YEAR"] as const;

export type AnimeFilter = (typeof ANIME_FILTERS)[number];
export type AnimeSort = (typeof ANIME_SORTS)[number];

export type AnimeListQuery = {
  status: AnimeFilter;
  sort: AnimeSort;
  query?: string;
};

export type AnimeCounts = {
  all: number;
  watching: number;
  completed: number;
};

export type AnimeListItem = {
  id: number;
  titleChinese: string | null;
  titleNative: string | null;
  titleEnglish: string | null;
  year: number | null;
  mediaType: string | null;
  defaultPosterUrl: string | null;
  defaultPosterPath: string | null;
  customPosterPath: string | null;
  status: AnimeStatus;
  createdAt: string;
};

export type AnimeDetail = {
  id: number;
  source: string;
  sourceId: string;
  titleChinese: string | null;
  titleNative: string | null;
  titleEnglish: string | null;
  aliases: string[];
  year: number | null;
  mediaType: string | null;
  episodeCount: number | null;
  studio: string | null;
  synopsis: string | null;
  defaultPosterUrl: string | null;
  defaultPosterPath: string | null;
  customPosterPath: string | null;
  status: AnimeStatus;
  franchiseId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type RelatedAnimeDetail = {
  animeId: number | null;
  source: string;
  sourceId: string;
  relationType: string;
  titleChinese: string;
  titleNative: string | null;
  year: number | null;
  mediaType: string | null;
  defaultPosterUrl: string | null;
  defaultPosterPath: string | null;
  customPosterPath: string | null;
  isImported: boolean;
};

export type AnimeDetailData = AnimeDetail & {
  franchiseName: string | null;
  relatedAnime: RelatedAnimeDetail[];
  relatedAnimeUnavailable: boolean;
};

export type AnimeStatusUpdateData = {
  id: number;
  status: AnimeStatus;
  updatedAt: string;
};

export type AnimeDeleteData = {
  id: number;
};


export type AnimePosterUpdateData = {
  id: number;
  customPosterPath: string | null;
  defaultPosterPath: string | null;
  defaultPosterUrl: string | null;
  updatedAt: string;
};

export type AnimeListData = {
  items: AnimeListItem[];
  counts: AnimeCounts;
};
