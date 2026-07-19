// @vitest-environment jsdom

import axe from "axe-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import {
  act,
  createElement,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnimeCard } from "@/components/anime/AnimeCard";
import { AnimeDetailModal } from "@/components/anime/AnimeDetailModal";
import { EmptyLibraryState } from "@/components/anime/EmptyLibraryState";
import { AnimeStatusText } from "@/components/anime/AnimeStatusText";
import { ErrorState } from "@/components/common/ErrorState";
import { SearchEmptyState } from "@/components/search/SearchEmptyState";
import { SearchImportModal } from "@/components/search/SearchImportModal";
import { SearchSourceFailures } from "@/components/search/SearchSourceFailures";
import type { AnimeDetailData, AnimeListItem } from "@/types/anime";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const originalFetch = globalThis.fetch;
const roots: Root[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.innerHTML = "";
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(node));
  return container;
}

function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function relativeLuminance(hex: string) {
  const channels = hex
    .replace("#", "")
    .match(/../g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 20));
  });
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
  franchiseId: null,
  franchiseName: null,
  relatedAnime: [],
  relatedAnimeUnavailable: false,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const listItem: AnimeListItem = {
  id: detail.id,
  titleChinese: detail.titleChinese,
  titleNative: detail.titleNative,
  titleEnglish: detail.titleEnglish,
  year: detail.year,
  mediaType: detail.mediaType,
  defaultPosterUrl: null,
  defaultPosterPath: null,
  customPosterPath: null,
  status: "WATCHING",
  createdAt: detail.createdAt,
};

function DetailKeyboardHarness() {
  const mainRef = useRef<HTMLElement>(null);
  const [animeId, setAnimeId] = useState<number | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <main ref={mainRef} tabIndex={-1}>
        <AnimeCard
          anime={listItem}
          onOpen={(id, trigger) => {
            setReturnFocus(trigger);
            setAnimeId(id);
          }}
        />
      </main>
      {animeId ? (
        <AnimeDetailModal
          animeId={animeId}
          fallbackFocusRef={mainRef}
          onClose={() => setAnimeId(null)}
          onSelectAnime={setAnimeId}
          returnFocus={returnFocus}
        />
      ) : null}
    </>
  );
}

describe("round 14 empty, error and accessibility states", () => {
  it("renders all three required state copies and a neutral empty-library visual", () => {
    const markup = [
      renderToStaticMarkup(
        createElement(EmptyLibraryState, { onAddAnime: () => undefined }),
      ),
      renderToStaticMarkup(createElement(SearchEmptyState, { kind: "empty" })),
      renderToStaticMarkup(
        createElement(ErrorState, { onRetry: () => undefined }),
      ),
    ].join("");

    expect(markup).toContain("你的动漫库还是空的。");
    expect(markup).toContain("搜索并添加第一部动漫。");
    expect(markup).toContain("添加动漫");
    expect(markup).toContain("没有找到相关动漫。");
    expect(markup).toContain("可以尝试使用其他语言名称搜索。");
    expect(markup).toContain("暂时无法从该数据源获取结果。");
    expect(markup).toContain("重试");
    expect(markup).not.toMatch(/<img|https?:\/\//);
  });

  it("shows a failed source, keeps a readable source label, and retries", () => {
    const onRetry = vi.fn();
    const container = mount(
      <SearchSourceFailures
        onRetry={onRetry}
        sources={[
          {
            source: "bangumi",
            label: "Bangumi",
            status: "ERROR",
            message: "Bangumi 请求失败，其他数据源结果仍可使用。",
          },
          {
            source: "anilist",
            label: "AniList",
            status: "SUCCESS",
            message: null,
          },
        ]}
      />,
    );

    expect(container.textContent).toContain("Bangumi 请求失败");
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "重试 Bangumi",
    );
    expect(retry).toBeTruthy();
    act(() => retry?.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("passes axe for the required empty and error state markup", async () => {
    const container = document.createElement("main");
    container.innerHTML = [
      renderToStaticMarkup(
        createElement(EmptyLibraryState, { onAddAnime: () => undefined }),
      ),
      renderToStaticMarkup(createElement(SearchEmptyState, { kind: "empty" })),
      renderToStaticMarkup(
        createElement(ErrorState, { onRetry: () => undefined }),
      ),
    ].join("");
    document.body.append(container);

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it("keeps all text tokens and semantic messages at WCAG AA contrast", () => {
    const normalTextPairs = [
      ["#1c1c1a", "#f7f5f0"],
      ["#6f6d68", "#f7f5f0"],
      ["#706d67", "#f7f5f0"],
      ["#65715f", "#ffffff"],
      ["#5f715f", "#f7f5f0"],
      ["#9e4535", "#f7f5f0"],
      ["#8f3e32", "#fdebeb"],
      ["#8b4534", "#ffffff"],
      ["#706a62", "#fbfaf7"],
      ["#346538", "#fbfaf7"],
      ["#9f2f2d", "#fbfaf7"],
    ] as const;

    for (const [foreground, background] of normalTextPairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio("#c96b4b", "#f7f5f0")).toBeGreaterThanOrEqual(3);
  });

  it("keeps visible focus, reduced motion, alt text, and text status cues", () => {
    const globalCss = readFileSync(
      "src/app/globals.css",
      "utf8",
    );
    const cardMarkup = renderToStaticMarkup(
      createElement(AnimeCard, { anime: listItem, onOpen: () => undefined }),
    );
    const statusMarkup = renderToStaticMarkup(
      createElement(AnimeStatusText, { status: "COMPLETED" }),
    );

    expect(globalCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globalCss).toContain("outline: 2px solid var(--color-accent)");
    expect(cardMarkup).toContain('aria-label="查看 示例动画 详情"');
    expect(cardMarkup).toContain('alt="示例动画海报"');
    expect(statusMarkup).toContain("已看完");
  });

  it("moves focus into search, traps Tab, closes with Escape, and restores focus", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "添加动漫";
    document.body.append(trigger);
    trigger.focus();
    const fallback = document.createElement("main");
    fallback.tabIndex = -1;
    document.body.append(fallback);
    const fallbackFocusRef = { current: fallback } as RefObject<HTMLElement>;

    function Harness() {
      const [open, setOpen] = useState(true);
      return open ? (
        <QueryClientProvider client={testQueryClient()}>
          <SearchImportModal
            fallbackFocusRef={fallbackFocusRef}
            onClose={() => setOpen(false)}
            returnFocus={trigger}
          />
        </QueryClientProvider>
      ) : null;
    }

    const container = mount(<Harness />);
    await settle();
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const input = container.querySelector<HTMLInputElement>('input[type="search"]');
    expect(dialog).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect((await axe.run(dialog!)).violations).toEqual([]);

    const focusables = Array.from(
      dialog!.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusables[0];
    const last = focusables.at(-1);
    last?.focus();
    act(() => {
      last?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(first);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await settle();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("walks home to detail, changes status, closes, and returns focus", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (method === "PATCH") {
        return Response.json({
          data: { id: 1, status: "COMPLETED", updatedAt: new Date().toISOString() },
        });
      }
      return Response.json({ data: detail });
    }) as typeof fetch;

    const container = mount(
      <QueryClientProvider client={testQueryClient()}>
        <DetailKeyboardHarness />
      </QueryClientProvider>,
    );
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="查看 示例动画 详情"]',
    );
    expect(trigger?.tagName).toBe("BUTTON");
    trigger?.focus();
    act(() => {
      trigger?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      trigger?.click();
    });
    await settle();

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const close = container.querySelector<HTMLButtonElement>(
      'button[aria-label="关闭动漫详情"]',
    );
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(close);
    expect((await axe.run(dialog!)).violations).toEqual([]);

    const status = container.querySelector<HTMLSelectElement>(
      "#anime-detail-status",
    );
    expect(status).toBeTruthy();
    act(() => {
      status!.value = "COMPLETED";
      status!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(requests).toContainEqual({ url: "/api/anime/1/status", method: "PATCH" });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await settle();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
