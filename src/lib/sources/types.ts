export const BANGUMI_SOURCE = "bangumi" as const;
export const ANILIST_SOURCE = "anilist" as const;
export const TMDB_SOURCE = "tmdb" as const;
export const ANIME_SOURCES = [
  BANGUMI_SOURCE,
  ANILIST_SOURCE,
  TMDB_SOURCE,
] as const;

export type AnimeSource = (typeof ANIME_SOURCES)[number];

export const SOURCE_LABELS: Record<AnimeSource, string> = {
  bangumi: "Bangumi",
  anilist: "AniList",
  tmdb: "TMDB",
};

export type NormalizedSourceReference = {
  source: AnimeSource;
  sourceId: string;
};

export type NormalizedExternalIds = {
  myAnimeList?: string;
  imdb?: string;
  wikidata?: string;
};

export type NormalizedAnimeRelation = {
  source: AnimeSource;
  sourceId: string;
  relationType: string;
  titleChinese: string | null;
  titleNative: string | null;
  year?: number | null;
  mediaType: string | null;
  posterUrl: string | null;
};

export type NormalizedAnime = {
  source: AnimeSource;
  sourceId: string;
  sourceReferences: NormalizedSourceReference[];
  externalIds: NormalizedExternalIds;
  titleChinese: string | null;
  titleNative: string | null;
  titleEnglish: string | null;
  aliases: string[];
  year: number | null;
  mediaType: string | null;
  episodeCount: number | null;
  studio: string | null;
  synopsis: string | null;
  posterUrl: string | null;
  relations: NormalizedAnimeRelation[] | null;
};

export type PosterCandidate = {
  source: AnimeSource;
  sourceId: string;
  size: "extraLarge" | "large" | "common" | "medium" | "small" | "grid";
  url: string;
};

export interface AnimeSourceAdapter {
  searchAnime(query: string): Promise<NormalizedAnime[]>;
  getAnimeDetail(sourceId: string): Promise<NormalizedAnime>;
  getAnimeRelations(sourceId: string): Promise<NormalizedAnimeRelation[]>;
  getPosterCandidates(sourceId: string): Promise<PosterCandidate[]>;
  clearCache?(): void;
}
