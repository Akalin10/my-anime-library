import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AniListAdapter,
  createAniListAdapterFromEnv,
} from "@/lib/sources/anilist";
import { SourceAdapterError } from "@/lib/sources/errors";

const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/anilist");

function readFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(resolve(fixtureDirectory, name), "utf8"),
  ) as unknown;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function adapterWithResponse(body: unknown) {
  const fetchImplementation = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse(body);
    },
  );
  return {
    adapter: new AniListAdapter({
      apiUrl: "https://graphql.anilist.co",
      fetchImplementation: fetchImplementation as typeof fetch,
    }),
    fetchImplementation,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("AniList adapter", () => {
  it("searches the official GraphQL endpoint and normalizes the verified response shape", async () => {
    const { adapter, fetchImplementation } = adapterWithResponse(
      readFixture("search.json"),
    );

    const results = await adapter.searchAnime("  Cowboy Bebop  ");

    expect(results).toEqual([
      expect.objectContaining({
        source: "anilist",
        sourceId: "1",
        sourceReferences: [{ source: "anilist", sourceId: "1" }],
        externalIds: { myAnimeList: "1" },
        titleChinese: null,
        titleNative: "カウボーイビバップ",
        titleEnglish: "Cowboy Bebop",
        year: 1998,
        mediaType: "TV",
        episodeCount: 26,
        studio: "Sunrise",
        relations: null,
      }),
    ]);
    expect(results[0]?.aliases).toContain("Kowboj Bebop");

    const [url, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://graphql.anilist.co/");
    expect(request?.method).toBe("POST");
    const payload = JSON.parse(String(request?.body)) as {
      query: string;
      variables: { search: string };
    };
    expect(payload.query).toContain("media(search: $search, type: ANIME");
    expect(payload.variables).toEqual({ search: "Cowboy Bebop" });
  });

  it("loads detail and returns unique poster candidates from the shared cache", async () => {
    const { adapter, fetchImplementation } = adapterWithResponse(
      readFixture("detail.json"),
    );

    const detail = await adapter.getAnimeDetail("1");
    const candidates = await adapter.getPosterCandidates("1");

    expect(detail.posterUrl).toContain("bx1-GCsPm7waJ4kS.png");
    expect(candidates.map(({ size }) => size)).toEqual([
      "extraLarge",
      "large",
      "medium",
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("normalizes anime relations and excludes related manga entries", async () => {
    const { adapter } = adapterWithResponse(readFixture("relations.json"));

    const relations = await adapter.getAnimeRelations("1");

    expect(relations).toEqual([
      expect.objectContaining({
        source: "anilist",
        sourceId: "5",
        relationType: "SIDE_STORY",
        titleNative: "カウボーイビバップ天国の扉",
        mediaType: "MOVIE",
      }),
    ]);
  });

  it("maps rate limits, GraphQL errors and timeouts to source errors", async () => {
    const rateLimited = new AniListAdapter({
      apiUrl: "https://graphql.anilist.co",
      fetchImplementation: vi.fn(async () =>
        jsonResponse(
          { errors: [{ message: "Too Many Requests." }] },
          { status: 429, headers: { "retry-after": "12" } },
        ),
      ) as typeof fetch,
    });
    const graphQlError = adapterWithResponse({
      data: null,
      errors: [{ message: "Invalid query" }],
    }).adapter;
    const timedOut = new AniListAdapter({
      apiUrl: "https://graphql.anilist.co",
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
      source: "anilist",
      code: "RATE_LIMIT",
      retryAfterSeconds: 12,
    } satisfies Partial<SourceAdapterError>);
    await expect(graphQlError.searchAnime("test")).rejects.toMatchObject({
      source: "anilist",
      code: "UNAVAILABLE",
    } satisfies Partial<SourceAdapterError>);
    await expect(timedOut.searchAnime("test")).rejects.toMatchObject({
      source: "anilist",
      code: "TIMEOUT",
    } satisfies Partial<SourceAdapterError>);
  });

  it("requires ANILIST_API_URL only at the environment factory boundary", () => {
    vi.stubEnv("ANILIST_API_URL", "https://graphql.anilist.co");
    expect(createAniListAdapterFromEnv()).toBeInstanceOf(AniListAdapter);
    vi.stubEnv("ANILIST_API_URL", "");
    expect(() => createAniListAdapterFromEnv()).toThrow("ANILIST_API_URL");
  });
});
