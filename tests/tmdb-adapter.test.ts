import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SourceAdapterError } from "@/lib/sources/errors";
import { createTmdbAdapterFromEnv, TmdbAdapter } from "@/lib/sources/tmdb";

const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/tmdb");

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixtureDirectory, name), "utf8"));
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("TMDB adapter", () => {
  it("searches the official movie endpoint and normalizes only allowed fields", async () => {
    const fetchImplementation = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void init;
        if (new URL(String(input)).pathname.endsWith("/genre/movie/list")) {
          return jsonResponse({ genres: [{ id: 16, name: "Animation" }] });
        }
        return jsonResponse(readFixture("search.json"));
      },
    );
    const adapter = new TmdbAdapter({
      apiKey: "0123456789abcdef0123456789abcdef",
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    const results = await adapter.searchAnime("  千与千寻  ");

    expect(results).toEqual([
      expect.objectContaining({
        source: "tmdb",
        sourceId: "129",
        sourceReferences: [{ source: "tmdb", sourceId: "129" }],
        externalIds: {},
        titleChinese: "千与千寻",
        titleNative: "千と千尋の神隠し",
        titleEnglish: null,
        year: 2001,
        mediaType: "MOVIE",
        episodeCount: null,
        studio: null,
        relations: null,
      }),
    ]);
    expect(results[0]).not.toHaveProperty("popularity");
    expect(results[0]).not.toHaveProperty("vote_average");

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    const searchCall = fetchImplementation.mock.calls.find(([input]) =>
      new URL(String(input)).pathname.endsWith("/search/movie"),
    );
    const [input, request] = searchCall ?? [];
    const url = new URL(String(input));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.themoviedb.org/3/search/movie",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      query: "千与千寻",
      include_adult: "false",
      language: "zh-CN",
      page: "1",
      api_key: "0123456789abcdef0123456789abcdef",
    });
    expect(new Headers(request?.headers).has("Authorization")).toBe(false);
  });

  it("loads details, external IDs and poster candidates from one cached request", async () => {
    const fetchImplementation = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return jsonResponse(readFixture("detail.json"));
      },
    );
    const adapter = new TmdbAdapter({
      apiKey: "read-access-token",
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    const detail = await adapter.getAnimeDetail("129");
    const posters = await adapter.getPosterCandidates("129");
    const relations = await adapter.getAnimeRelations("129");

    expect(detail).toMatchObject({
      externalIds: { imdb: "tt0245429", wikidata: "Q155653" },
      studio: "Studio Ghibli",
    });
    expect(posters.map(({ size }) => size)).toEqual([
      "extraLarge",
      "large",
      "common",
    ]);
    expect(posters[0]?.url).toBe(
      "https://image.tmdb.org/t/p/original/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
    );
    expect(relations).toEqual([]);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [input, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(new URL(String(input)).searchParams.get("append_to_response")).toBe(
      "external_ids",
    );
    expect(new Headers(request?.headers).get("Authorization")).toBe(
      "Bearer read-access-token",
    );
  });

  it("maps rate limits, invalid responses and timeouts to source errors", async () => {
    const rateLimited = new TmdbAdapter({
      apiKey: "token",
      fetchImplementation: vi.fn(async () =>
        jsonResponse({}, { status: 429, headers: { "retry-after": "9" } }),
      ) as typeof fetch,
    });
    const invalid = new TmdbAdapter({
      apiKey: "token",
      fetchImplementation: vi.fn(async () => jsonResponse({ results: [{}] })) as typeof fetch,
    });
    const timedOut = new TmdbAdapter({
      apiKey: "token",
      timeoutMs: 5,
      fetchImplementation: vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ) as typeof fetch,
    });

    await expect(rateLimited.searchAnime("test")).rejects.toMatchObject({
      source: "tmdb",
      code: "RATE_LIMIT",
      retryAfterSeconds: 9,
    } satisfies Partial<SourceAdapterError>);
    await expect(invalid.searchAnime("test")).rejects.toMatchObject({
      source: "tmdb",
      code: "UNAVAILABLE",
    } satisfies Partial<SourceAdapterError>);
    await expect(timedOut.searchAnime("test")).rejects.toMatchObject({
      source: "tmdb",
      code: "TIMEOUT",
    } satisfies Partial<SourceAdapterError>);
  });

  it("requires TMDB_API_KEY only at the environment factory boundary", () => {
    vi.stubEnv("TMDB_API_KEY", "read-access-token");
    expect(createTmdbAdapterFromEnv()).toBeInstanceOf(TmdbAdapter);
    vi.stubEnv("TMDB_API_KEY", "");
    expect(() => createTmdbAdapterFromEnv()).toThrow("TMDB_API_KEY");
  });
});
