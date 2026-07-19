import { isConfirmedSameAnime } from "@/lib/sources/normalize/deduplicate";
import {
  ANILIST_SOURCE,
  type AnimeSourceAdapter,
  type NormalizedAnime,
} from "@/lib/sources/types";

function searchTerms(anime: NormalizedAnime): string[] {
  return [anime.titleNative, anime.titleEnglish, anime.titleChinese]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
}

function confirmedStudio(
  anime: NormalizedAnime,
  candidate: NormalizedAnime,
): string | null {
  if (candidate.source !== ANILIST_SOURCE) {
    return null;
  }

  return isConfirmedSameAnime(anime, candidate) ? candidate.studio : null;
}

/**
 * Returns AniList's explicitly marked main studio only when its item can be
 * conservatively confirmed to be the same anime. It deliberately never maps
 * Bangumi's broad "製作" field to an animation studio.
 */
export async function findConfirmedAniListStudio(
  anime: NormalizedAnime,
  aniList: AnimeSourceAdapter | undefined,
  knownAniListIds: string[] = [],
): Promise<string | null> {
  if (anime.studio || !aniList) {
    return null;
  }

  for (const sourceId of [...new Set(knownAniListIds)]) {
    try {
      const candidate = await aniList.getAnimeDetail(sourceId);
      const studio = confirmedStudio(anime, candidate);
      if (studio) return studio;
    } catch {
      // A local record remains usable when AniList is temporarily unavailable.
    }
  }

  for (const term of searchTerms(anime)) {
    try {
      const candidates = await aniList.searchAnime(term);
      for (const candidate of candidates) {
        const studio = confirmedStudio(anime, candidate);
        if (studio) return studio;
      }
    } catch {
      // Try the next title variant, if available.
    }
  }

  return null;
}
