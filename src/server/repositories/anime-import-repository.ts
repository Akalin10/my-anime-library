import { and, eq, inArray } from "drizzle-orm";

import type { AppDatabase } from "@/lib/db/client";
import {
  anime,
  animeRelations,
  franchises,
  sourceReferences,
  type AnimeStatus,
  type RelationType,
} from "@/lib/db/schema";
import type {
  NormalizedAnime,
  NormalizedAnimeRelation,
} from "@/lib/sources/types";

export class DuplicateAnimeError extends Error {
  constructor() {
    super("Anime has already been imported");
    this.name = "DuplicateAnimeError";
  }
}

export type AnimeImportRecord = {
  anime: NormalizedAnime;
  relations: NormalizedAnimeRelation[];
  status: AnimeStatus;
  defaultPosterPath: string | null;
};

const BANGUMI_RELATION_TYPES: Readonly<Record<string, RelationType>> = {
  前传: "PREQUEL",
  续集: "SEQUEL",
  特别篇: "SPECIAL",
  总集篇: "RECAP",
  番外篇: "SIDE_STORY",
  衍生: "SPIN_OFF",
  PREQUEL: "PREQUEL",
  SEQUEL: "SEQUEL",
  SPECIAL: "SPECIAL",
  SUMMARY: "RECAP",
  COMPILATION: "RECAP",
  SIDE_STORY: "SIDE_STORY",
  SPIN_OFF: "SPIN_OFF",
};

function relationTypeFromSource(value: string): RelationType {
  return BANGUMI_RELATION_TYPES[value.trim()] ?? "OTHER";
}

function franchiseName(record: NormalizedAnime): string {
  return (
    record.titleChinese ??
    record.titleNative ??
    record.titleEnglish ??
    `${record.source}:${record.sourceId}`
  );
}

export class AnimeImportRepository {
  constructor(private readonly database: AppDatabase) {}

  findExistingSourceIds(source: string, sourceIds: string[]): Set<string> {
    if (sourceIds.length === 0) {
      return new Set();
    }

    const rows = this.database
      .select({ sourceId: sourceReferences.sourceId })
      .from(sourceReferences)
      .where(
        and(
          eq(sourceReferences.source, source),
          inArray(sourceReferences.sourceId, sourceIds),
        ),
      )
      .all();

    return new Set(rows.map(({ sourceId }) => sourceId));
  }

  exists(source: string, sourceId: string): boolean {
    return Boolean(
      this.database
        .select({ id: sourceReferences.id })
        .from(sourceReferences)
        .where(
          and(
            eq(sourceReferences.source, source),
            eq(sourceReferences.sourceId, sourceId),
          ),
        )
        .get(),
    );
  }

  importAnime(record: AnimeImportRecord): number {
    try {
      return this.database.transaction((transaction) => {
        const duplicate = record.anime.sourceReferences.some((reference) =>
          Boolean(
            transaction
              .select({ id: sourceReferences.id })
              .from(sourceReferences)
              .where(
                and(
                  eq(sourceReferences.source, reference.source),
                  eq(sourceReferences.sourceId, reference.sourceId),
                ),
              )
              .get(),
          ),
        );

        if (duplicate) {
          throw new DuplicateAnimeError();
        }

        const relatedSourceIds = [
          ...new Set(record.relations.map(({ sourceId }) => sourceId)),
        ];
        const relatedRows =
          relatedSourceIds.length === 0
            ? []
            : transaction
                .select({
                  animeId: anime.id,
                  franchiseId: anime.franchiseId,
                  sourceId: sourceReferences.sourceId,
                })
                .from(sourceReferences)
                .innerJoin(anime, eq(sourceReferences.animeId, anime.id))
                .where(
                  and(
                    eq(sourceReferences.source, record.anime.source),
                    inArray(sourceReferences.sourceId, relatedSourceIds),
                  ),
                )
                .all();

        let franchiseId: number | null = null;

        if (record.relations.length > 0) {
          const existingFranchiseIds = [
            ...new Set(
              relatedRows
                .map(({ franchiseId: value }) => value)
                .filter((value): value is number => value !== null),
            ),
          ].sort((left, right) => left - right);

          franchiseId = existingFranchiseIds[0] ?? null;

          if (franchiseId === null) {
            const insertedFranchise = transaction
              .insert(franchises)
              .values({ name: franchiseName(record.anime) })
              .returning({ id: franchises.id })
              .get();
            franchiseId = insertedFranchise.id;
          }

          const otherFranchiseIds = existingFranchiseIds.filter(
            (id) => id !== franchiseId,
          );
          if (otherFranchiseIds.length > 0) {
            transaction
              .update(anime)
              .set({ franchiseId })
              .where(inArray(anime.franchiseId, otherFranchiseIds))
              .run();
          }

          const ungroupedRelatedIds = relatedRows
            .filter(({ franchiseId: value }) => value === null)
            .map(({ animeId }) => animeId);
          if (ungroupedRelatedIds.length > 0) {
            transaction
              .update(anime)
              .set({ franchiseId })
              .where(inArray(anime.id, ungroupedRelatedIds))
              .run();
          }
        }

        const insertedAnime = transaction
          .insert(anime)
          .values({
            source: record.anime.source,
            sourceId: record.anime.sourceId,
            titleChinese: record.anime.titleChinese,
            titleNative: record.anime.titleNative,
            titleEnglish: record.anime.titleEnglish,
            aliases: record.anime.aliases,
            year: record.anime.year,
            mediaType: record.anime.mediaType,
            episodeCount: record.anime.episodeCount,
            studio: record.anime.studio,
            synopsis: record.anime.synopsis,
            defaultPosterUrl: record.anime.posterUrl,
            defaultPosterPath: record.defaultPosterPath,
            status: record.status,
            franchiseId,
          })
          .returning({ id: anime.id })
          .get();

        transaction
          .insert(sourceReferences)
          .values(record.anime.sourceReferences.map((reference) => ({
            animeId: insertedAnime.id,
            source: reference.source,
            sourceId: reference.sourceId,
            url: null,
          })))
          .run();

        const relatedBySourceId = new Map(
          relatedRows.map((row) => [row.sourceId, row.animeId]),
        );

        for (const relation of record.relations) {
          const relatedAnimeId = relatedBySourceId.get(relation.sourceId);
          if (!relatedAnimeId) {
            continue;
          }

          transaction
            .insert(animeRelations)
            .values({
              animeId: insertedAnime.id,
              relatedAnimeId,
              relationType: relationTypeFromSource(relation.relationType),
              source: relation.source,
            })
            .onConflictDoNothing()
            .run();
        }

        return insertedAnime.id;
      });
    } catch (error) {
      if (
        error instanceof DuplicateAnimeError ||
        (error instanceof Error &&
          error.message.includes("anime.source, anime.source_id"))
      ) {
        throw new DuplicateAnimeError();
      }
      throw error;
    }
  }
}
