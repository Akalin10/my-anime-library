import { createElement, type ChangeEvent, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnimeMetadata } from "@/components/anime/AnimeMetadata";
import { AnimeStatusSelector } from "@/components/anime/AnimeStatusSelector";
import {
  RelatedAnimeList,
  groupRelatedAnime,
} from "@/components/anime/RelatedAnimeList";
import { ConfirmDialog } from "@/components/modal/ConfirmDialog";
import type { AnimeDetailData, RelatedAnimeDetail } from "@/types/anime";

function related(
  sourceId: string,
  relationType: string,
  overrides: Partial<RelatedAnimeDetail> = {},
): RelatedAnimeDetail {
  return {
    animeId: null,
    source: "bangumi",
    sourceId,
    relationType,
    titleChinese: `相关作品 ${sourceId}`,
    titleNative: null,
    year: 2025,
    mediaType: "TV",
    defaultPosterUrl: null,
    defaultPosterPath: null,
    customPosterPath: null,
    isImported: false,
    ...overrides,
  };
}

const detail: AnimeDetailData = {
  id: 1,
  source: "bangumi",
  sourceId: "1",
  titleChinese: "示例动画",
  titleNative: "サンプル",
  titleEnglish: "Sample",
  aliases: [],
  year: 2024,
  mediaType: "TV",
  episodeCount: 12,
  studio: "示例动画公司",
  synopsis: "示例简介",
  defaultPosterUrl: null,
  defaultPosterPath: null,
  customPosterPath: null,
  status: "WATCHING",
  franchiseId: 1,
  franchiseName: "示例系列",
  relatedAnime: [],
  relatedAnimeUnavailable: false,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

describe("anime detail interface", () => {
  it("groups from explicit relation types without guessing from titles", () => {
    const groups = groupRelatedAnime([
      related("1", "OVA"),
      related("2", "续集"),
      related("3", "其他", { titleChinese: "标题里写着剧场版" }),
    ]);

    expect(groups.map(({ label }) => label)).toEqual([
      "续作",
      "OVA / OAD",
      "其他相关作品",
    ]);
    expect(groups[2]?.items[0]?.sourceId).toBe("3");
  });

  it("renders only the required metadata and truthful fallbacks", () => {
    const markup = renderToStaticMarkup(
      createElement(AnimeMetadata, {
        anime: { ...detail, studio: null, synopsis: null },
      }),
    );

    expect(markup).toContain("中文名");
    expect(markup).toContain("原名");
    expect(markup).toContain("年份");
    expect(markup).toContain("类型");
    expect(markup).toContain("集数");
    expect(markup).toContain("制作公司");
    expect(markup).toContain("系列");
    expect(markup).toContain("简介");
    expect(markup).toContain("暂无资料");
    expect(markup).not.toMatch(/评分|排名|热度|声优|角色|单集/);
  });

  it("changes status immediately through the two allowed values", () => {
    const changes: string[] = [];
    const selector = AnimeStatusSelector({
      status: "WATCHING",
      isSaving: false,
      isSaved: false,
      error: null,
      onChange: (status) => changes.push(status),
    }) as ReactElement;
    const wrapper = (selector.props as { children: ReactElement[] }).children[1];
    const select = (wrapper.props as { children: ReactElement[] }).children[0];

    (select.props as {
      onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    }).onChange({ target: { value: "COMPLETED" } } as ChangeEvent<HTMLSelectElement>);

    expect(changes).toEqual(["COMPLETED"]);
    expect(renderToStaticMarkup(selector)).toContain("观看状态");
  });

  it("shows imported navigation and an explicit confirmation for unimported works", () => {
    const imported = related("2", "续集", {
      animeId: 2,
      isImported: true,
    });
    const unimported = related("3", "剧场版");
    const markup = renderToStaticMarkup(
      createElement(RelatedAnimeList, {
        items: [imported, unimported],
        unavailable: false,
        pendingItem: unimported,
        importStatus: "WATCHING",
        isImporting: false,
        importMessage: null,
        onOpenImported: () => undefined,
        onRequestImport: () => undefined,
        onCancelImport: () => undefined,
        onImportStatusChange: () => undefined,
        onConfirmImport: () => undefined,
      }),
    );

    expect(markup).toContain("已添加");
    expect(markup).toContain("未添加");
    expect(markup).toContain("确认后才会写入本地动漫库");
    expect(markup).toContain("确认导入");
    expect(markup).not.toMatch(/评分|排名|热度|声优|角色|单集/);
  });

  it("renders the exact local deletion confirmation and pending state", () => {
    const confirmation = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        animeTitle: "示例动画",
        error: null,
        isPending: false,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );
    const pending = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        animeTitle: "示例动画",
        error: null,
        isPending: true,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    expect(confirmation).toContain(
      "确定要从动漫库中删除《示例动画》吗？",
    );
    expect(confirmation).toContain("只会删除本地收藏和本地自定义封面。");
    expect(confirmation).toContain("确认删除");
    expect(confirmation).not.toContain("外部数据源");
    expect(pending).toContain("正在删除……");
    expect(pending).toContain("disabled");
  });
});
