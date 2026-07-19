import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmptyLibraryState } from "@/components/anime/EmptyLibraryState";
import { ImportSelectionBar } from "@/components/search/ImportSelectionBar";
import { SearchEmptyState } from "@/components/search/SearchEmptyState";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import { createDebouncedCommitter } from "@/components/search/debounce";
import {
  buildExternalSearchUrl,
  buildImportRequest,
  groupSearchResults,
} from "@/components/search/search-import-model";
import { TopBar } from "@/components/layout/TopBar";
import type { ExternalSearchResult } from "@/types/external";

function searchResult(
  sourceId: string,
  overrides: Partial<ExternalSearchResult> = {},
): ExternalSearchResult {
  return {
    source: "bangumi",
    sourceId,
    sourceReferences: [{ source: "bangumi", sourceId }],
    externalIds: {},
    titleChinese: `真实条目 ${sourceId}`,
    titleNative: `実在作品 ${sourceId}`,
    titleEnglish: null,
    aliases: [],
    year: 2020,
    mediaType: "TV",
    episodeCount: 12,
    studio: null,
    synopsis: null,
    posterUrl: `https://lain.bgm.tv/poster-${sourceId}.jpg`,
    relations: null,
    isImported: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("search import interface", () => {
  it("debounces automatic search and commits only the latest input after 500ms", () => {
    vi.useFakeTimers();
    const commits: string[] = [];
    const debouncer = createDebouncedCommitter(
      (value: string) => commits.push(value),
      500,
    );

    debouncer.push("进击");
    vi.advanceTimersByTime(300);
    debouncer.push("进击的巨人");
    vi.advanceTimersByTime(499);
    expect(commits).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(commits).toEqual(["进击的巨人"]);
  });

  it("builds a trimmed external-search URL", () => {
    expect(buildExternalSearchUrl("  进击的巨人  ")).toBe(
      "/api/search?query=%E8%BF%9B%E5%87%BB%E7%9A%84%E5%B7%A8%E4%BA%BA",
    );
  });

  it("groups only from explicit source media types and never guesses from titles", () => {
    const groups = groupSearchResults([
      searchResult("1", { mediaType: "OVA" }),
      searchResult("2", { mediaType: "剧场版" }),
      searchResult("3", {
        titleChinese: "标题里写着 OVA 但来源类型是 TV",
        mediaType: "TV",
      }),
    ]);

    expect(groups.map(({ label }) => label)).toEqual([
      "OVA / OAD",
      "剧场版",
      "其他搜索结果",
    ]);
    expect(groups[2]?.items[0]?.sourceId).toBe("3");
  });

  it("renders only the allowed result fields, imported state and selection control", () => {
    const markup = renderToStaticMarkup(
      createElement(SearchResultCard, {
        result: searchResult("55770"),
        selected: true,
        status: "WATCHING",
        onSelectedChange: () => undefined,
        onStatusChange: () => undefined,
      }),
    );

    expect(markup).toContain("真实条目 55770");
    expect(markup).toContain("実在作品 55770");
    expect(markup).toContain("2020");
    expect(markup).toContain("TV");
    expect(markup).toContain("12 集");
    expect(markup).toContain("Bangumi");
    expect(markup).toContain("未添加");
    expect(markup).toContain('type="checkbox"');
    expect(markup).not.toMatch(/评分|排名|热度|用户数|收藏人数|评论数量/);
  });

  it("shows every merged data source and carries them into the import request", () => {
    const merged = searchResult("55770", {
      sourceReferences: [
        { source: "bangumi", sourceId: "55770" },
        { source: "anilist", sourceId: "16498" },
        { source: "tmdb", sourceId: "129" },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(SearchResultCard, {
        result: merged,
        selected: false,
        status: "WATCHING",
        onSelectedChange: () => undefined,
        onStatusChange: () => undefined,
      }),
    );

    expect(markup).toContain("Bangumi / AniList / TMDB");
    expect(
      buildImportRequest(
        { "bangumi:55770": "WATCHING" },
        "WATCHING",
        [merged],
      ),
    ).toEqual({
      status: "WATCHING",
      items: [
        {
          source: "bangumi",
          sourceId: "55770",
          sourceReferences: [
            { source: "bangumi", sourceId: "55770" },
            { source: "anilist", sourceId: "16498" },
            { source: "tmdb", sourceId: "129" },
          ],
          status: "WATCHING",
        },
      ],
    });
  });

  it("builds one batch with a uniform default and per-item status overrides", () => {
    expect(
      buildImportRequest(
        { "55770": "WATCHING", "310656": "COMPLETED" },
        "WATCHING",
      ),
    ).toEqual({
      status: "WATCHING",
      items: [
        { source: "bangumi", sourceId: "55770", status: "WATCHING" },
        { source: "bangumi", sourceId: "310656", status: "COMPLETED" },
      ],
    });
  });

  it("shows truthful importing and partial-result messages with item reasons", () => {
    const importing = renderToStaticMarkup(
      createElement(ImportSelectionBar, {
        selectedCount: 2,
        status: "WATCHING",
        isImporting: true,
        result: null,
        requestError: null,
        onStatusChange: () => undefined,
        onClear: () => undefined,
        onImport: () => undefined,
      }),
    );
    const completed = renderToStaticMarkup(
      createElement(ImportSelectionBar, {
        selectedCount: 1,
        status: "WATCHING",
        isImporting: false,
        requestError: null,
        result: {
          successCount: 1,
          failureCount: 1,
          items: [
            {
              success: true,
              source: "bangumi",
              sourceId: "55770",
              animeId: 1,
              status: "WATCHING",
              titleChinese: "进击的巨人",
              titleNative: "進撃の巨人",
              defaultPosterPath: "default/bangumi-55770.jpg",
            },
            {
              success: false,
              source: "bangumi",
              sourceId: "999",
              titleChinese: "失败条目",
              titleNative: null,
              error: { code: "SOURCE_UNAVAILABLE", message: "数据源暂时不可用" },
            },
          ],
        },
        onStatusChange: () => undefined,
        onClear: () => undefined,
        onImport: () => undefined,
      }),
    );

    expect(importing).toContain("正在导入……");
    expect(completed).toContain("成功导入 1 部作品");
    expect(completed).toContain("失败 1 部作品");
    expect(completed).toContain("失败条目：数据源暂时不可用");
  });

  it("uses the required empty and error copy", () => {
    const empty = renderToStaticMarkup(
      createElement(SearchEmptyState, { kind: "empty" }),
    );
    const error = renderToStaticMarkup(
      createElement(SearchEmptyState, {
        kind: "error",
        onRetry: () => undefined,
      }),
    );

    expect(empty).toContain("没有找到相关动漫。");
    expect(empty).toContain("可以尝试使用其他语言名称搜索。");
    expect(error).toContain("暂时无法从该数据源获取结果。");
    expect(error).toContain("重试");
  });

  it("enables both add-anime entry points", () => {
    const opened: string[] = [];
    const emptyState = EmptyLibraryState({
      onAddAnime: () => opened.push("empty"),
    }) as ReactNode & { props: { children: ReactNode[] } };
    const emptyButton = emptyState.props.children[3] as {
      props: {
        disabled?: boolean;
        onClick: (event: { currentTarget: HTMLButtonElement }) => void;
      };
    };
    emptyButton.props.onClick({ currentTarget: {} as HTMLButtonElement });

    const topMarkup = renderToStaticMarkup(
      createElement(TopBar, {
        query: "",
        sort: "RECENT",
        onQueryChange: () => undefined,
        onSortChange: () => undefined,
        onAddAnime: () => undefined,
      }),
    );

    expect(opened).toEqual(["empty"]);
    expect(emptyButton.props.disabled).toBeUndefined();
    expect(topMarkup).toMatch(
      /<button class="[^"]*addButton[^"]*" type="button">\+ 添加动漫<\/button>/,
    );
  });
});
