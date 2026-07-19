import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BangumiAdapter,
  createBangumiAdapterFromEnv,
} from "@/lib/sources/bangumi";
import { SourceAdapterError } from "@/lib/sources/errors";

const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/bangumi");
const searchFixture = readFixture("search.json");
const detailFixture = readFixture("detail.json");
const relationsFixture = readFixture("relations.json");

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

function adapterWithResponse(
  body: unknown,
  overrides: Partial<ConstructorParameters<typeof BangumiAdapter>[0]> = {},
) {
  const fetchImplementation = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse(body);
    },
  );
  const adapter = new BangumiAdapter({
    userAgent: "test-user/my-anime-library/0.1.0",
    fetchImplementation: fetchImplementation as typeof fetch,
    ...overrides,
  });
  return { adapter, fetchImplementation };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Bangumi adapter", () => {
  it("searches the current v0 endpoint and normalizes a real response fixture", async () => {
    const { adapter, fetchImplementation } = adapterWithResponse(searchFixture, {
      token: "fixture-token",
    });

    const results = await adapter.searchAnime("  进击的巨人  ");

    expect(results).toEqual([
      {
        source: "bangumi",
        sourceId: "55770",
        sourceReferences: [{ source: "bangumi", sourceId: "55770" }],
        externalIds: {},
        titleChinese: "进击的巨人",
        titleNative: "進撃の巨人",
        titleEnglish: null,
        aliases: [
          "自由之翼",
          "進擊的巨人",
          "Attack on Titan",
          "Shingeki no Kyojin",
        ],
        year: 2013,
        mediaType: "TV",
        episodeCount: 25,
        studio: null,
        synopsis: expect.any(String),
        posterUrl:
          "https://lain.bgm.tv/pic/cover/l/78/c9/55770_HsJfh.jpg",
        relations: null,
      },
    ]);

    const [url, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.bgm.tv/v0/search/subjects?limit=20&offset=0",
    );
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({
      keyword: "进击的巨人",
      sort: "match",
      filter: { type: [2], nsfw: false },
    });
    const headers = new Headers(request?.headers);
    expect(headers.get("user-agent")).toBe(
      "test-user/my-anime-library/0.1.0",
    );
    expect(headers.get("authorization")).toBe("Bearer fixture-token");
  });

  it("keeps unlabelled Latin aliases as aliases instead of guessing an English title", async () => {
    const { adapter } = adapterWithResponse(detailFixture);

    const detail = await adapter.getAnimeDetail("55770");

    expect(detail).toMatchObject({
      titleEnglish: null,
      studio: null,
      episodeCount: 25,
    });
    expect(detail.aliases).toContain("Attack on Titan");
  });

  it("returns normalized anime relations from the official relations shape", async () => {
    const { adapter } = adapterWithResponse(relationsFixture);

    const relations = await adapter.getAnimeRelations("55770");

    expect(relations).toHaveLength(3);
    expect(relations[0]).toEqual({
      source: "bangumi",
      sourceId: "310656",
      relationType: "总集篇",
      titleChinese: "进击的巨人 编年史",
      titleNative: "「進撃の巨人」〜クロニクル〜",
      mediaType: null,
      posterUrl:
        "https://lain.bgm.tv/pic/cover/l/af/9b/310656_Lr7hk.jpg",
    });
  });

  it("returns unique poster candidates in quality order and reuses the detail cache", async () => {
    const { adapter, fetchImplementation } = adapterWithResponse(detailFixture);

    await adapter.getAnimeDetail("55770");
    const candidates = await adapter.getPosterCandidates("55770");

    expect(candidates.map(({ size }) => size)).toEqual([
      "large",
      "common",
      "medium",
      "small",
      "grid",
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("caches equal searches until the search TTL expires", async () => {
    let now = 1_000;
    const { adapter, fetchImplementation } = adapterWithResponse(searchFixture, {
      now: () => now,
      searchTtlMs: 500,
    });

    await adapter.searchAnime("进击的巨人");
    await adapter.searchAnime("进击的巨人");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    now += 501;
    await adapter.searchAnime("进击的巨人");
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("does not call the source for an empty search", async () => {
    const { adapter, fetchImplementation } = adapterWithResponse(searchFixture);

    await expect(adapter.searchAnime("   ")).resolves.toEqual([]);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("returns a typed rate-limit error without caching the failure", async () => {
    const fetchImplementation = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return jsonResponse(
          {},
          { status: 429, headers: { "retry-after": "3" } },
        );
      },
    );
    const adapter = new BangumiAdapter({
      userAgent: "test-user/my-anime-library/0.1.0",
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(adapter.searchAnime("进击的巨人")).rejects.toMatchObject({
      code: "RATE_LIMIT",
      source: "bangumi",
      statusCode: 429,
      retryAfterSeconds: 3,
    });
    await expect(adapter.searchAnime("进击的巨人")).rejects.toBeInstanceOf(
      SourceAdapterError,
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("returns a typed unavailable error for HTTP and response-shape failures", async () => {
    const unavailable = adapterWithResponse({}, {
      fetchImplementation: vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          void input;
          void init;
          return jsonResponse({}, { status: 503 });
        },
      ) as unknown as typeof fetch,
    }).adapter;
    const invalidShape = adapterWithResponse({ unexpected: true }).adapter;

    await expect(unavailable.getAnimeDetail("55770")).rejects.toMatchObject({
      code: "UNAVAILABLE",
      statusCode: 503,
    });
    await expect(invalidShape.getAnimeDetail("55770")).rejects.toMatchObject({
      code: "UNAVAILABLE",
      statusCode: 200,
    });
  });

  it("returns a typed timeout error", async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const adapter = new BangumiAdapter({
      userAgent: "test-user/my-anime-library/0.1.0",
      timeoutMs: 50,
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    const request = expect(adapter.getAnimeDetail("55770")).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(51);

    await request;
  });

  it("reads the token only through the server environment factory", async () => {
    vi.stubEnv("BANGUMI_USER_AGENT", "env-user/my-anime-library/0.1.0");
    vi.stubEnv("BANGUMI_API_TOKEN", "env-test-token");
    const fetchImplementation = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return jsonResponse(detailFixture);
      },
    );
    const adapter = createBangumiAdapterFromEnv({
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await adapter.getAnimeDetail("55770");

    const request = fetchImplementation.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get("authorization")).toBe(
      "Bearer env-test-token",
    );
  });
});
