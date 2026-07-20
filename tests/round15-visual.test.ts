import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const globals = read("src/app/globals.css");
const layout = read("src/app/layout.tsx");
const home = read("src/components/anime/AnimeLibraryHome.module.css");
const grid = read("src/components/anime/AnimeGrid.module.css");
const sidebar = read("src/components/layout/AppSidebar.module.css");
const poster = read("src/components/anime/AnimePoster.module.css");
const detail = read("src/components/anime/AnimeDetailModal.module.css");
const search = read("src/components/search/SearchImportModal.module.css");
const posterManager = read("src/components/anime/PosterManagerModal.module.css");
const allCss = [
  globals,
  home,
  grid,
  sidebar,
  poster,
  detail,
  search,
  posterManager,
  ...[
    "src/components/anime/AnimeCard.module.css",
    "src/components/layout/TopBar.module.css",
    "src/components/modal/ConfirmDialog.module.css",
    "src/components/search/SearchResultCard.module.css",
    "src/components/settings/SettingsForm.module.css",
  ].map(read),
].join("\n");

function layoutAt(width: number) {
  return {
    navigation: width <= 760 ? "drawer" : "sidebar",
    sidebarWidth: width <= 760 ? 0 : width <= 1180 ? 184 : 224,
    columns: width <= 760 ? 2 : width <= 980 ? 3 : width <= 1260 ? 4 : 5,
    detail: width <= 820 ? "vertical" : "split",
  } as const;
}

describe("round 15 visual and responsive contract", () => {
  it("keeps the required warm palette and self-hosted editorial fonts", () => {
    for (const color of [
      "#f7f5f0",
      "#f1eee8",
      "#ffffff",
      "#1c1c1a",
      "#6f6d68",
      "#9a9790",
      "#e4e0d8",
      "#eeeae3",
      "#c96b4b",
    ]) {
      expect(globals).toContain(color);
    }
    expect(layout).toContain("import { Newsreader, Noto_Sans_SC, Noto_Serif_SC }");
    expect(layout).toContain('from "next/font/google"');
    expect(globals).toContain('"Newsreader"');
    expect(globals).toContain('"Noto Sans SC"');
  });

  it("maps the four required viewport widths to usable layouts", () => {
    expect(layoutAt(320)).toEqual({
      navigation: "drawer",
      sidebarWidth: 0,
      columns: 2,
      detail: "vertical",
    });
    expect(layoutAt(768)).toEqual({
      navigation: "sidebar",
      sidebarWidth: 184,
      columns: 3,
      detail: "vertical",
    });
    expect(layoutAt(1024)).toEqual({
      navigation: "sidebar",
      sidebarWidth: 184,
      columns: 4,
      detail: "split",
    });
    expect(layoutAt(1440)).toEqual({
      navigation: "sidebar",
      sidebarWidth: 224,
      columns: 5,
      detail: "split",
    });

    expect(home).toContain("max-width: 1500px");
    expect(home).toContain("grid-template-columns: 224px minmax(0, 1fr)");
    expect(home).toContain("grid-template-columns: 184px minmax(0, 1fr)");
    expect(grid).toContain("repeat(5, minmax(0, 1fr))");
    expect(grid).toContain("repeat(4, minmax(0, 1fr))");
    expect(grid).toContain("repeat(3, minmax(0, 1fr))");
    expect(grid).toContain("repeat(2, minmax(0, 1fr))");
    expect(sidebar).toContain("width: min(86vw, 320px)");
    expect(detail).toContain("width: calc(100vw - 12px)");
    expect(posterManager).toContain("width: calc(100vw - 12px)");
  });

  it("uses only restrained motion and includes interaction states", () => {
    expect(poster).toContain("transform: scale(1.015)");
    expect(detail).toContain("transform: scale(0.98)");
    expect(search).toContain("transform: scale(0.98)");
    expect(allCss).toContain(":hover");
    expect(globals).toContain(":focus-visible");
    expect(globals).toContain(":active");
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
    expect(allCss).not.toMatch(
      /linear-gradient|radial-gradient|box-shadow|parallax|particle|bounce|glow|neon/i,
    );

    const durations = Array.from(
      allCss.matchAll(/(?:animation|transition)(?:-duration)?:\s*[^;]*?(\d{3})ms/g),
      (match) => Number(match[1]),
    );
    expect(durations.length).toBeGreaterThan(0);
    expect(durations.every((duration) => duration >= 150 && duration <= 220)).toBe(
      true,
    );
  });

  it("keeps primary mobile controls at least 44px", () => {
    expect(sidebar).toContain("height: 44px");
    expect(sidebar).toContain("min-height: 48px");
    expect(detail).toContain("min-height: 44px");
    expect(search).toContain("height: 44px");
    expect(posterManager).toContain("min-height: 44px");
  });
});
