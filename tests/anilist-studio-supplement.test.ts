import { describe, expect, it, vi } from "vitest";

import type {
  AnimeSourceAdapter,
  NormalizedAnime,
} from "@/lib/sources/types";
import { findConfirmedAniListStudio } from "@/server/services/anilist-studio-supplement";

function anime(
  source: "bangumi" | "anilist",
  studio: string | null,
): NormalizedAnime {
  return {
    source,
    sourceId: source === "bangumi" ? "55770" : "16498",
    sourceReferences: [
      { source, sourceId: source === "bangumi" ? "55770" : "16498" },
    ],
    externalIds: {},
    titleChinese: "进击的巨人",
    titleNative: "進撃の巨人",
    titleEnglish: "Attack on Titan",
    aliases: [],
    year: 2013,
    mediaType: "TV",
    episodeCount: 25,
    studio,
    synopsis: null,
    posterUrl: null,
    relations: null,
  };
}

function adapterWith(results: NormalizedAnime[]): AnimeSourceAdapter {
  return {
    searchAnime: vi.fn(async () => results),
    getAnimeDetail: vi.fn(async () => results[0] ?? anime("anilist", null)),
    getAnimeRelations: vi.fn(async () => []),
    getPosterCandidates: vi.fn(async () => []),
  };
}

describe("AniList studio supplement", () => {
  it("uses AniList's main studio only for a confirmed cross-source match", async () => {
    const aniList = adapterWith([anime("anilist", "WIT STUDIO")]);

    await expect(
      findConfirmedAniListStudio(anime("bangumi", null), aniList),
    ).resolves.toBe("WIT STUDIO");
  });

  it("refuses a same-title candidate when its episode evidence conflicts", async () => {
    const conflicting = { ...anime("anilist", "Different Studio"), episodeCount: 12 };
    const aniList = adapterWith([conflicting]);

    await expect(
      findConfirmedAniListStudio(anime("bangumi", null), aniList),
    ).resolves.toBeNull();
  });

  it("does not overwrite an existing production studio", async () => {
    const aniList = adapterWith([anime("anilist", "MAPPA")]);

    await expect(
      findConfirmedAniListStudio(anime("bangumi", "WIT STUDIO"), aniList),
    ).resolves.toBeNull();
    expect(aniList.searchAnime).not.toHaveBeenCalled();
  });
});
