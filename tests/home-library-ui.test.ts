import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  Children,
  createElement,
  isValidElement,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getDefaultPoster } from "@/app/api/posters/default/[filename]/route";
import { AnimeCard } from "@/components/anime/AnimeCard";
import { AnimePoster } from "@/components/anime/AnimePoster";
import { buildAnimeListUrl } from "@/components/anime/AnimeLibraryHome";
import { EmptyLibraryState } from "@/components/anime/EmptyLibraryState";
import { SortSelect } from "@/components/anime/SortSelect";
import { StatusTabs } from "@/components/anime/StatusTabs";
import { AppSidebar } from "@/components/layout/AppSidebar";
import type { AnimeListItem } from "@/types/anime";

afterEach(() => {
  vi.unstubAllEnvs();
});

function childElements(element: ReactElement): ReactElement[] {
  const props = element.props as { children?: unknown };
  return Children.toArray(props.children as ReactNode).filter(
    (child): child is ReactElement => isValidElement(child),
  );
}

describe("home poster wall components", () => {
  it("renders real sidebar counts including zeros", () => {
    const markup = renderToStaticMarkup(
      createElement(AppSidebar, {
        activeFilter: "ALL",
        counts: { all: 12, watching: 0, completed: 12 },
        onFilterChange: () => undefined,
        onOpenSettings: () => undefined,
        settingsActive: false,
      }),
    );

    expect(markup).toContain("全部");
    expect(markup).toContain("在看");
    expect(markup).toContain("已看完");
    expect(markup).toContain(">12<");
    expect(markup).toContain(">0<");
  });

  it("changes the status filter through the status tabs", () => {
    const changes: string[] = [];
    const tabs = StatusTabs({
      activeFilter: "ALL",
      onChange: (value) => changes.push(value),
    }) as ReactElement;
    const buttons = childElements(tabs);

    (buttons[1]?.props as { onClick: () => void }).onClick();

    expect(changes).toEqual(["WATCHING"]);
    expect(buttons[0]?.props).toMatchObject({
      "aria-selected": true,
      "data-active": true,
    });
  });

  it("changes only among the three allowed sort modes", () => {
    const changes: string[] = [];
    const field = SortSelect({
      value: "RECENT",
      onChange: (value) => changes.push(value),
    }) as ReactElement;
    const select = childElements(field).find((child) => child.type === "select");

    (select?.props as { onChange: (event: ChangeEvent<HTMLSelectElement>) => void })
      .onChange({ target: { value: "YEAR" } } as ChangeEvent<HTMLSelectElement>);

    expect(changes).toEqual(["YEAR"]);
    expect(
      childElements(select as ReactElement).map(
        (option) => (option.props as { value: string }).value,
      ),
    ).toEqual(["RECENT", "TITLE", "YEAR"]);
  });

  it("builds the local API URL for filter, sort and trimmed search", () => {
    expect(
      buildAnimeListUrl({
        filter: "COMPLETED",
        sort: "TITLE",
        query: "  进击的巨人  ",
      }),
    ).toBe(
      "/api/anime?status=COMPLETED&sort=TITLE&query=%E8%BF%9B%E5%87%BB%E7%9A%84%E5%B7%A8%E4%BA%BA",
    );
  });

  it("keeps cards limited to poster, title and status with lazy images", () => {
    const anime: AnimeListItem = {
      id: 1,
      titleChinese: "测试动画",
      titleNative: "テストアニメ",
      titleEnglish: null,
      year: 2026,
      mediaType: "TV",
      defaultPosterUrl: "https://images.test/poster.jpg",
      defaultPosterPath: "default/bangumi-101.jpg",
      customPosterPath: null,
      status: "WATCHING",
      createdAt: new Date(0).toISOString(),
    };
    const markup = renderToStaticMarkup(
      createElement(AnimeCard, { anime, onOpen: () => undefined }),
    );

    expect(markup).toContain("测试动画");
    expect(markup).toContain("在看");
    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain("/api/posters/default/bangumi-101.jpg");
    expect(markup).toContain("<button");
    expect(markup).toContain("aria-label=");
    expect(markup).not.toContain("2026");
    expect(markup).not.toContain("TV");
  });

  it("renders the required empty-library copy without fake anime", () => {
    const markup = renderToStaticMarkup(
      createElement(EmptyLibraryState, { onAddAnime: () => undefined }),
    );

    expect(markup).toContain("你的动漫库还是空的。");
    expect(markup).toContain("搜索并添加第一部动漫。");
    expect(markup).toContain("<button type=\"button\">添加动漫</button>");
  });

  it("serves only controlled local default-poster filenames with browser caching", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "poster-route-test-"));
    const directory = resolve(root, "default");
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, "bangumi-101.jpg"), new Uint8Array([1, 2, 3]));
    await writeFile(resolve(directory, "tmdb-129.png"), new Uint8Array([4, 5]));
    vi.stubEnv("POSTER_STORAGE_PATH", root);

    try {
      const response = await getDefaultPoster(new Request("http://localhost"), {
        params: Promise.resolve({ filename: "bangumi-101.jpg" }),
      });
      const rejected = await getDefaultPoster(new Request("http://localhost"), {
        params: Promise.resolve({ filename: "..%2Fsecret.jpg" }),
      });
      const tmdbPoster = await getDefaultPoster(new Request("http://localhost"), {
        params: Promise.resolve({ filename: "tmdb-129.png" }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      expect(response.headers.get("cache-control")).toContain("immutable");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3]),
      );
      expect(rejected.status).toBe(404);
      expect(tmdbPoster.status).toBe(200);
      expect(tmdbPoster.headers.get("content-type")).toBe("image/png");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses the neutral placeholder when no poster source exists", () => {
    const markup = renderToStaticMarkup(
      createElement(AnimePoster, {
        title: "暂无资料",
        customPosterPath: null,
        defaultPosterPath: null,
        defaultPosterUrl: null,
      }),
    );

    expect(markup).toContain("/placeholders/anime-poster.svg");
    expect(markup).toContain("暂无资料海报");
  });
});
