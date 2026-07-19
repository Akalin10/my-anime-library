import type { z } from "zod";

import { SourceAdapterError } from "@/lib/sources/errors";
import {
  normalizeBangumiPosterCandidates,
  normalizeBangumiRelations,
  normalizeBangumiSubject,
} from "@/lib/sources/normalize/bangumi";
import {
  bangumiRelationsResponseSchema,
  bangumiSearchResponseSchema,
  bangumiSubjectSchema,
  type BangumiRelation,
  type BangumiSubject,
} from "@/lib/sources/bangumi/schemas";
import { TtlCache } from "@/lib/sources/ttl-cache";
import {
  BANGUMI_SOURCE,
  type AnimeSourceAdapter,
  type NormalizedAnime,
  type NormalizedAnimeRelation,
  type PosterCandidate,
} from "@/lib/sources/types";

const DEFAULT_BASE_URL = "https://api.bgm.tv";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_SEARCH_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_DETAIL_TTL_MS = 30 * 60 * 1_000;
const DEFAULT_MAX_CACHE_ENTRIES = 100;
const SEARCH_LIMIT = 20;

type FetchImplementation = typeof fetch;

export type BangumiAdapterOptions = {
  userAgent: string;
  token?: string;
  baseUrl?: string;
  timeoutMs?: number;
  searchTtlMs?: number;
  detailTtlMs?: number;
  maxCacheEntries?: number;
  fetchImplementation?: FetchImplementation;
  now?: () => number;
};

type JsonRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

function requireSourceId(sourceId: string): string {
  const normalized = sourceId.trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new TypeError("Bangumi sourceId must be a positive integer string");
  }
  return normalized;
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.ceil(numeric);
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((date - Date.now()) / 1_000));
}

export class BangumiAdapter implements AnimeSourceAdapter {
  private readonly userAgent: string;
  private readonly token: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly searchTtlMs: number;
  private readonly detailTtlMs: number;
  private readonly fetchImplementation: FetchImplementation;
  private readonly cache: TtlCache<Promise<unknown>>;

  constructor(options: BangumiAdapterOptions) {
    this.userAgent = options.userAgent.trim();
    if (!this.userAgent) {
      throw new TypeError("Bangumi userAgent is required");
    }

    this.token = options.token?.trim() || undefined;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
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
    if (!normalizedQuery) {
      return [];
    }

    const cacheKey = `search:${normalizedQuery.toLowerCase()}`;
    const response = await this.cached(
      cacheKey,
      this.searchTtlMs,
      () =>
        this.requestJson(
          `/v0/search/subjects?limit=${SEARCH_LIMIT}&offset=0`,
          bangumiSearchResponseSchema,
          {
            method: "POST",
            body: {
              keyword: normalizedQuery,
              sort: "match",
              filter: { type: [2], nsfw: false },
            },
          },
        ),
    );

    return response.data.map(normalizeBangumiSubject);
  }

  async getAnimeDetail(sourceId: string): Promise<NormalizedAnime> {
    const subject = await this.getSubject(requireSourceId(sourceId));
    return normalizeBangumiSubject(subject);
  }

  async getAnimeRelations(sourceId: string): Promise<NormalizedAnimeRelation[]> {
    const normalizedSourceId = requireSourceId(sourceId);
    const relations = await this.cached<BangumiRelation[]>(
      `relations:${normalizedSourceId}`,
      this.detailTtlMs,
      () =>
        this.requestJson(
          `/v0/subjects/${normalizedSourceId}/subjects`,
          bangumiRelationsResponseSchema,
        ),
    );
    return normalizeBangumiRelations(relations);
  }

  async getPosterCandidates(sourceId: string): Promise<PosterCandidate[]> {
    const normalizedSourceId = requireSourceId(sourceId);
    const subject = await this.getSubject(normalizedSourceId);
    return normalizeBangumiPosterCandidates(
      normalizedSourceId,
      subject.images,
    );
  }

  clearCache(): void {
    this.cache.clear();
  }

  private getSubject(sourceId: string): Promise<BangumiSubject> {
    return this.cached(
      `detail:${sourceId}`,
      this.detailTtlMs,
      () =>
        this.requestJson(
          `/v0/subjects/${sourceId}`,
          bangumiSubjectSchema,
        ),
    );
  }

  private async cached<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = this.cache.get(key) as Promise<T> | undefined;
    if (cached) {
      return cached;
    }

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
    schema: z.ZodType<T>,
    options: JsonRequestOptions = {},
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    const headers = new Headers({
      Accept: "application/json",
      "User-Agent": this.userAgent,
    });
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json; charset=utf-8");
    }
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    try {
      const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      if (response.status === 429) {
        throw new SourceAdapterError(
          BANGUMI_SOURCE,
          "RATE_LIMIT",
          "Bangumi request was rate limited",
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
          BANGUMI_SOURCE,
          "UNAVAILABLE",
          "Bangumi is currently unavailable",
          { statusCode: response.status },
        );
      }

      const contentType = response.headers.get("content-type")?.toLowerCase();
      if (!contentType?.includes("application/json")) {
        throw new SourceAdapterError(
          BANGUMI_SOURCE,
          "UNAVAILABLE",
          "Bangumi returned an unexpected response type",
          { statusCode: response.status },
        );
      }

      const payload: unknown = await response.json();
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new SourceAdapterError(
          BANGUMI_SOURCE,
          "UNAVAILABLE",
          "Bangumi returned an invalid response",
          { statusCode: response.status, cause: parsed.error },
        );
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof SourceAdapterError) {
        throw error;
      }
      if (timedOut || (error instanceof DOMException && error.name === "AbortError")) {
        throw new SourceAdapterError(
          BANGUMI_SOURCE,
          "TIMEOUT",
          "Bangumi request timed out",
          { cause: error },
        );
      }
      throw new SourceAdapterError(
        BANGUMI_SOURCE,
        "UNAVAILABLE",
        "Bangumi is currently unavailable",
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
