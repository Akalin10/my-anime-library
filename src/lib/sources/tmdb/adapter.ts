import type { z } from "zod";

import { SourceAdapterError } from "@/lib/sources/errors";
import {
  normalizeTmdbMovie,
  normalizeTmdbPosterCandidates,
} from "@/lib/sources/normalize/tmdb";
import {
  tmdbMovieSchema,
  tmdbGenreListSchema,
  tmdbSearchResponseSchema,
  type TmdbMovie,
} from "@/lib/sources/tmdb/schemas";
import { TtlCache } from "@/lib/sources/ttl-cache";
import {
  TMDB_SOURCE,
  type AnimeSourceAdapter,
  type NormalizedAnime,
  type NormalizedAnimeRelation,
  type PosterCandidate,
} from "@/lib/sources/types";

const DEFAULT_API_URL = "https://api.themoviedb.org/3";
const DEFAULT_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_SEARCH_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_DETAIL_TTL_MS = 30 * 60 * 1_000;
const DEFAULT_MAX_CACHE_ENTRIES = 100;

export type TmdbAdapterOptions = {
  apiKey: string;
  apiUrl?: string;
  imageBaseUrl?: string;
  timeoutMs?: number;
  searchTtlMs?: number;
  detailTtlMs?: number;
  maxCacheEntries?: number;
  fetchImplementation?: typeof fetch;
  now?: () => number;
};

function requireSourceId(sourceId: string): string {
  const normalized = sourceId.trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new TypeError("TMDB sourceId must be a positive integer string");
  }
  return normalized;
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.ceil(numeric);
  const date = Date.parse(value);
  return Number.isNaN(date)
    ? undefined
    : Math.max(0, Math.ceil((date - Date.now()) / 1_000));
}

export class TmdbAdapter implements AnimeSourceAdapter {
  private readonly apiKey: string;
  private readonly useQueryApiKey: boolean;
  private readonly apiUrl: string;
  private readonly imageBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly searchTtlMs: number;
  private readonly detailTtlMs: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly cache: TtlCache<Promise<unknown>>;

  constructor(options: TmdbAdapterOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new TypeError("TMDB apiKey is required");
    this.useQueryApiKey = /^[a-f\d]{32}$/i.test(this.apiKey);
    this.apiUrl = (options.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    this.imageBaseUrl = (options.imageBaseUrl ?? DEFAULT_IMAGE_BASE_URL).replace(
      /\/$/,
      "",
    );
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
    const [response, animationGenreId] = await Promise.all([
      this.cached(
        `search:${normalizedQuery.toLocaleLowerCase("und")}`,
        this.searchTtlMs,
        () =>
          this.requestJson(
            "/search/movie",
            {
              query: normalizedQuery,
              include_adult: "false",
              language: "zh-CN",
              page: "1",
            },
            tmdbSearchResponseSchema,
          ),
      ),
      this.getAnimationGenreId(),
    ]);
    return response.results
      .filter(({ genre_ids: genreIds }) => genreIds.includes(animationGenreId))
      .map((movie) => normalizeTmdbMovie(movie, this.imageBaseUrl));
  }

  async getAnimeDetail(sourceId: string): Promise<NormalizedAnime> {
    return normalizeTmdbMovie(
      await this.getMovie(requireSourceId(sourceId)),
      this.imageBaseUrl,
    );
  }

  async getAnimeRelations(
    _sourceId: string,
  ): Promise<NormalizedAnimeRelation[]> {
    requireSourceId(_sourceId);
    return [];
  }

  async getPosterCandidates(sourceId: string): Promise<PosterCandidate[]> {
    return normalizeTmdbPosterCandidates(
      await this.getMovie(requireSourceId(sourceId)),
      this.imageBaseUrl,
    );
  }

  clearCache(): void {
    this.cache.clear();
  }

  private getMovie(sourceId: string): Promise<TmdbMovie> {
    return this.cached(`detail:${sourceId}`, this.detailTtlMs, () =>
      this.requestJson(
        `/movie/${sourceId}`,
        { language: "zh-CN", append_to_response: "external_ids" },
        tmdbMovieSchema,
      ),
    );
  }

  private async getAnimationGenreId(): Promise<number> {
    const response = await this.cached(
      "genres:movie:en",
      this.detailTtlMs,
      () =>
        this.requestJson(
          "/genre/movie/list",
          { language: "en" },
          tmdbGenreListSchema,
        ),
    );
    const animation = response.genres.find(
      ({ name }) => name.trim().toLocaleLowerCase("en") === "animation",
    );
    if (!animation) {
      throw new SourceAdapterError(
        TMDB_SOURCE,
        "UNAVAILABLE",
        "TMDB did not return the Animation movie genre",
      );
    }
    return animation.id;
  }

  private async cached<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const existing = this.cache.get(key) as Promise<T> | undefined;
    if (existing) return existing;
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
    path: string,
    parameters: Record<string, string>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const url = new URL(`${this.apiUrl}${path}`);
    for (const [key, value] of Object.entries(parameters)) {
      url.searchParams.set(key, value);
    }
    if (this.useQueryApiKey) url.searchParams.set("api_key", this.apiKey);

    const headers = new Headers({ Accept: "application/json" });
    if (!this.useQueryApiKey) {
      headers.set("Authorization", `Bearer ${this.apiKey}`);
    }
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImplementation(url, {
        headers,
        signal: controller.signal,
      });
      if (response.status === 429) {
        throw new SourceAdapterError(
          TMDB_SOURCE,
          "RATE_LIMIT",
          "TMDB request was rate limited",
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
          TMDB_SOURCE,
          "UNAVAILABLE",
          "TMDB is currently unavailable",
          { statusCode: response.status },
        );
      }
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new SourceAdapterError(
          TMDB_SOURCE,
          "UNAVAILABLE",
          "TMDB returned an unexpected response type",
          { statusCode: response.status },
        );
      }
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) {
        throw new SourceAdapterError(
          TMDB_SOURCE,
          "UNAVAILABLE",
          "TMDB returned an invalid response",
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
          TMDB_SOURCE,
          "TIMEOUT",
          "TMDB request timed out",
          { cause: error },
        );
      }
      throw new SourceAdapterError(
        TMDB_SOURCE,
        "UNAVAILABLE",
        "TMDB is currently unavailable",
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
