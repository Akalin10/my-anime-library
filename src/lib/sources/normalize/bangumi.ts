import type {
  BangumiImages,
  BangumiInfoboxItem,
  BangumiRelation,
  BangumiSubject,
} from "@/lib/sources/bangumi/schemas";
import {
  BANGUMI_SOURCE,
  type NormalizedAnime,
  type NormalizedAnimeRelation,
  type PosterCandidate,
} from "@/lib/sources/types";

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function infoboxValues(
  infobox: BangumiInfoboxItem[] | null | undefined,
  key: string,
): Array<{ label: string | null; value: string }> {
  return (infobox ?? [])
    .filter((item) => item.key.trim() === key)
    .flatMap((item) => {
      if (typeof item.value === "string") {
        const value = nonEmpty(item.value);
        return value ? [{ label: null, value }] : [];
      }

      return item.value.flatMap((entry) => {
        const value = nonEmpty(entry.v);
        return value
          ? [{ label: nonEmpty(entry.k), value }]
          : [];
      });
    });
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeYear(date: string | null | undefined): number | null {
  const match = date?.match(/^(\d{4})-\d{2}-\d{2}$/);
  return match ? Number(match[1]) : null;
}

function normalizeEpisodeCount(subject: BangumiSubject): number | null {
  if (subject.eps && subject.eps > 0) {
    return subject.eps;
  }
  if (subject.total_episodes && subject.total_episodes > 0) {
    return subject.total_episodes;
  }
  return null;
}

export function preferredPosterUrl(
  images: BangumiImages | null | undefined,
): string | null {
  return (
    nonEmpty(images?.large) ??
    nonEmpty(images?.common) ??
    nonEmpty(images?.medium) ??
    nonEmpty(images?.small) ??
    nonEmpty(images?.grid)
  );
}

export function normalizeBangumiSubject(subject: BangumiSubject): NormalizedAnime {
  const titleChinese = nonEmpty(subject.name_cn);
  const titleNative = nonEmpty(subject.name);
  const aliasEntries = infoboxValues(subject.infobox, "别名");
  const standaloneEnglishNames = infoboxValues(subject.infobox, "英文名");
  const labelledEnglishNames = aliasEntries.filter(
    (entry) => entry.label === "英文名",
  );
  const titleEnglish =
    standaloneEnglishNames[0]?.value ?? labelledEnglishNames[0]?.value ?? null;
  const titles = new Set(
    [titleChinese, titleNative, titleEnglish].filter(
      (value): value is string => value !== null,
    ),
  );
  const aliases = unique(aliasEntries.map(({ value }) => value)).filter(
    (value) => !titles.has(value),
  );
  const studios = infoboxValues(subject.infobox, "动画制作").map(
    ({ value }) => value,
  );
  const myAnimeListId = ["MAL", "MyAnimeList", "MyAnimeList ID"]
    .flatMap((key) => infoboxValues(subject.infobox, key))
    .map(({ value }) => value.trim())
    .find((value) => /^[1-9]\d*$/.test(value));

  return {
    source: BANGUMI_SOURCE,
    sourceId: String(subject.id),
    sourceReferences: [
      { source: BANGUMI_SOURCE, sourceId: String(subject.id) },
    ],
    externalIds: myAnimeListId
      ? { myAnimeList: myAnimeListId }
      : {},
    titleChinese,
    titleNative,
    titleEnglish,
    aliases,
    year: normalizeYear(subject.date),
    mediaType: nonEmpty(subject.platform),
    episodeCount: normalizeEpisodeCount(subject),
    studio: studios.length > 0 ? unique(studios).join("、") : null,
    synopsis: nonEmpty(subject.summary),
    posterUrl: preferredPosterUrl(subject.images),
    relations: null,
  };
}

export function normalizeBangumiRelations(
  relations: BangumiRelation[],
): NormalizedAnimeRelation[] {
  return relations
    .filter((relation) => relation.type === 2)
    .map((relation) => ({
      source: BANGUMI_SOURCE,
      sourceId: String(relation.id),
      relationType: relation.relation.trim(),
      titleChinese: nonEmpty(relation.name_cn),
      titleNative: nonEmpty(relation.name),
      mediaType: null,
      posterUrl: preferredPosterUrl(relation.images),
    }));
}

const POSTER_SIZES = ["large", "common", "medium", "small", "grid"] as const;

export function normalizeBangumiPosterCandidates(
  sourceId: string,
  images: BangumiImages | null | undefined,
): PosterCandidate[] {
  const seen = new Set<string>();

  return POSTER_SIZES.flatMap((size) => {
    const url = nonEmpty(images?.[size]);
    if (!url || seen.has(url)) {
      return [];
    }
    seen.add(url);
    return [{ source: BANGUMI_SOURCE, sourceId, size, url }];
  });
}
