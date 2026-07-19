import type { z } from "zod";

import {
  aniListDetailResponseSchema,
  aniListRelationsResponseSchema,
  aniListSearchResponseSchema,
  type AniListMedia,
} from "@/lib/sources/anilist/schemas";
import { SourceAdapterError } from "@/lib/sources/errors";
import {
  normalizeAniListMedia,
  normalizeAniListPosterCandidates,
  normalizeAniListRelations,
} from "@/lib/sources/normalize/anilist";
import { TtlCache } from "@/lib/sources/ttl-cache";
import {
  ANILIST_SOURCE,
  type AnimeSourceAdapter,
  type NormalizedAnime,
  type NormalizedAnimeRelation,
  type PosterCandidate,
} from "@/lib/sources/types";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_SEARCH_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_DETAIL_TTL_MS = 30 * 60 * 1_000;
const DEFAULT_MAX_CACHE_ENTRIES = 100;

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  synonyms
  release: startDate { year }
  format
  episodes
  studios(isMain: true) { nodes { name } }
  description(asHtml: false)
  coverImage { extraLarge large medium }
`;

const SEARCH_QUERY = `
  query SearchAnime($search: String!) {
    Page(page: 1, perPage: 20) {
      media(search: $search, type: ANIME, isAdult: false) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

const DETAIL_QUERY = `
  query AnimeDetail($id: Int!) {
    Media(id: $id, type: ANIME) {
      ${MEDIA_FIELDS}
    }
  }
`;

const RELATIONS_QUERY = `
  query AnimeRelations($id: Int!) {
    Media(id: $id, type: ANIME) {
      relations {
        edges {
          relationType(version: 2)
          node {
            id
            idMal
            type
            title { romaji english native }
            release: startDate { year }
            format
            coverImage { extraLarge large medium }
          }
        }
      }
    }
  }
`;

type FetchImplementation = typeof fetch;

export type AniListAdapterOptions = {
  apiUrl: string;
  timeoutMs?: number;
  searchTtlMs?: number;
  detailTtlMs?: number;
  maxCacheEntries?: number;
  fetchImplementation?: FetchImplementation;
  now?: () => number;
};

function requireSourceId(sourceId: string): number {
  const normalized = sourceId.trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new TypeError("AniList sourceId must be a positive integer string");
  }
  return Number(normalized);
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? Math.ceil(numeric)
    : undefined;
}

export class AniListAdapter implements AnimeSourceAdapter {
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly searchTtlMs: number;
  private readonly detailTtlMs: number;
  private readonly fetchImplementation: FetchImplementation;
  private readonly cache: TtlCache<Promise<unknown>>;

  constructor(options: AniListAdapterOptions) {
    const apiUrl = options.apiUrl.trim();
    if (!apiUrl) {
      throw new TypeError("AniList apiUrl is required");
    }
    this.apiUrl = new URL(apiUrl).toString();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.searchTtlMs = options.searchTtlMs ?? DEFAULT_SEARCH_TTL_MS;
    this.detailTtlMs = options.detailTtlMs ?? DEFAULT_DETAIL_TTL_MS;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.cache = new TtlCache<Promise<unknown>>(
      options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES,
      options.now,
    );
  }

  async searchAnime(query: string): Promise<NormalizedAnime[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    const response = await this.cached(
      `search:${normalizedQuery.toLowerCase()}`,
      this.searchTtlMs,
      () =>
        this.requestJson(
          SEARCH_QUERY,
          { search: normalizedQuery },
          aniListSearchResponseSchema,
        ),
    );
    return response.data.Page.media.map(normalizeAniListMedia);
  }

  async getAnimeDetail(sourceId: string): Promise<NormalizedAnime> {
    return normalizeAniListMedia(await this.getMedia(requireSourceId(sourceId)));
  }

  async getAnimeRelations(sourceId: string): Promise<NormalizedAnimeRelation[]> {
    const id = requireSourceId(sourceId);
    const response = await this.cached(
      `relations:${id}`,
      this.detailTtlMs,
      () =>
        this.requestJson(
          RELATIONS_QUERY,
          { id },
          aniListRelationsResponseSchema,
        ),
    );
    return normalizeAniListRelations(response.data.Media.relations?.edges ?? []);
  }

  async getPosterCandidates(sourceId: string): Promise<PosterCandidate[]> {
    return normalizeAniListPosterCandidates(
      await this.getMedia(requireSourceId(sourceId)),
    );
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async getMedia(id: number): Promise<AniListMedia> {
    const response = await this.cached(
      `detail:${id}`,
      this.detailTtlMs,
      () =>
        this.requestJson(
          DETAIL_QUERY,
          { id },
          aniListDetailResponseSchema,
        ),
    );
    return response.data.Media;
  }

  private async cached<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = this.cache.get(key) as Promise<T> | undefined;
    if (cached) return cached;

    const pending = loader();
    this.cache.set(key, pending, ttlMs);
    try {
      return await pending;
    } catch (error) {
      this.cache.delete(key);
      throw error;
    }
  }

  private async requestJson<T>(
    query: string,
    variables: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImplementation(this.apiUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      if (response.status === 429) {
        throw new SourceAdapterError(
          ANILIST_SOURCE,
          "RATE_LIMIT",
          "AniList request was rate limited",
          {
            statusCode: response.status,
            retryAfterSeconds: retryAfterSeconds(
              response.headers.get("retry-after"),
            ),
          },
        );
      }
      if (!response.ok) {
        throw new SourceAdapterError(
          ANILIST_SOURCE,
          "UNAVAILABLE",
          "AniList is currently unavailable",
          { statusCode: response.status },
        );
      }

      const contentType = response.headers.get("content-type")?.toLowerCase();
      if (!contentType?.includes("application/json")) {
        throw new SourceAdapterError(
          ANILIST_SOURCE,
          "UNAVAILABLE",
          "AniList returned an unexpected response type",
          { statusCode: response.status },
        );
      }

      const payload: unknown = await response.json();
      if (
        payload &&
        typeof payload === "object" &&
        "errors" in payload &&
        Array.isArray(payload.errors) &&
        payload.errors.length > 0
      ) {
        throw new SourceAdapterError(
          ANILIST_SOURCE,
          "UNAVAILABLE",
          "AniList returned a GraphQL error",
          { statusCode: response.status },
        );
      }

      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new SourceAdapterError(
          ANILIST_SOURCE,
          "UNAVAILABLE",
          "AniList returned an invalid response",
          { statusCode: response.status, cause: parsed.error },
        );
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof SourceAdapterError) throw error;
      if (
        timedOut ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        throw new SourceAdapterError(
          ANILIST_SOURCE,
          "TIMEOUT",
          "AniList request timed out",
          { cause: error },
        );
      }
      throw new SourceAdapterError(
        ANILIST_SOURCE,
        "UNAVAILABLE",
        "AniList is currently unavailable",
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
