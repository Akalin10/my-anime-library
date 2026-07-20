import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const productionRoots = ["src", "drizzle", "public"];
const forbiddenNames = [
  "rating",
  "score",
  "review",
  "note",
  "progress",
  "currentEpisode",
  "watchDate",
  "startDate",
  "finishDate",
  "history",
  "recommendation",
  "trending",
  "popular",
  "chart",
  "statistics",
  "notification",
  "user",
  "profile",
  "login",
  "register",
  "dashboard",
  "calendar",
  "favorite",
  "collection",
  "folder",
  "tag",
] as const;

function filesBelow(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

function workspacePath(path: string) {
  return relative(workspace, path).replaceAll("\\", "/");
}

describe("round 17 final audit", () => {
  it("contains only explained third-party or migration-metadata keyword hits", () => {
    const pattern = new RegExp(`\\b(${forbiddenNames.join("|")})\\b`, "gi");
    const hits = productionRoots
      .flatMap((root) => filesBelow(resolve(workspace, root)))
      .filter((path) => !/\.(?:png|jpe?g|webp|svg|ico)$/i.test(path))
      .flatMap((path) => {
        const content = readFileSync(path, "utf8");
        return [...content.matchAll(pattern)].map(
          (match) => `${workspacePath(path)}:${match[0].toLowerCase()}`,
        );
      })
      .sort();

    expect(hits).toEqual(
      [
        "drizzle/meta/_journal.json:tag",
        "src/lib/sources/anilist/adapter.ts:startdate",
        "src/lib/sources/anilist/adapter.ts:startdate",
        "src/lib/sources/bangumi/adapter.ts:user",
        "src/lib/sources/bangumi/index.ts:user",
      ].sort(),
    );
  });

  it("has no forbidden filenames or unexplained completion markers", () => {
    const allProductionFiles = productionRoots
      .flatMap((root) => filesBelow(resolve(workspace, root)))
      .filter((path) => !/\.(?:png|jpe?g|webp|svg|ico)$/i.test(path));
    const forbiddenFilename = new RegExp(
      `\\b(${forbiddenNames.join("|")})\\b`,
      "i",
    );

    expect(
      allProductionFiles
        .map(workspacePath)
        .filter((path) => forbiddenFilename.test(path)),
    ).toEqual([]);

    const incompleteMarkers = allProductionFiles.flatMap((path) => {
      const content = readFileSync(path, "utf8");
      return /\b(TODO|FIXME|HACK|XXX)\b/.test(content)
        ? [workspacePath(path)]
        : [];
    });
    expect(incompleteMarkers).toEqual([]);
  });

  it("does not retain the decorative disabled grid button", () => {
    const topBar = readFileSync(
      resolve(workspace, "src/components/layout/TopBar.tsx"),
      "utf8",
    );
    const topBarStyles = readFileSync(
      resolve(workspace, "src/components/layout/TopBar.module.css"),
      "utf8",
    );

    expect(topBar).not.toContain("网格视图");
    expect(topBar).not.toContain("gridButton");
    expect(topBarStyles).not.toContain("gridButton");
    expect(topBarStyles).not.toContain("gridIcon");
  });

  it("documents install, configuration, migration, run and verification", () => {
    const readme = readFileSync(resolve(workspace, "README.md"), "utf8");

    for (const requiredText of [
      "npm install",
      ".env.local",
      "npm run db:migrate",
      "npm run dev",
      "npm run build",
      "npm start",
      "npm run test:e2e",
    ]) {
      expect(readme).toContain(requiredText);
    }
  });
});
