import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { AppDatabase } from "@/lib/db/client";
import {
  anime,
  animeRelations,
  franchises,
  sourceReferences,
  type AnimeStatus,
} from "@/lib/db/schema";
import type { AnimeListQuery } from "@/types/anime";

const listSelection = {
  id: anime.id,
  titleChinese: anime.titleChinese,
  titleNative: anime.titleNative,
  titleEnglish: anime.titleEnglish,
  year: anime.year,
  mediaType: anime.mediaType,
  defaultPosterUrl: anime.defaultPosterUrl,
  defaultPosterPath: anime.defaultPosterPath,
  customPosterPath: anime.customPosterPath,
  status: anime.status,
  createdAt: anime.createdAt,
};

const chineseTitleCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

type AnimeRecord = typeof anime.$inferSelect;
type AnimeListRow = Pick<
  AnimeRecord,
  | "id"
  | "titleChinese"
  | "titleNative"
  | "titleEnglish"
  | "year"
  | "mediaType"
  | "defaultPosterUrl"
  | "defaultPosterPath"
  | "customPosterPath"
  | "status"
  | "createdAt"
>;

function preferredTitle(row: AnimeListRow) {
  return row.titleChinese ?? row.titleNative ?? row.titleEnglish;
}

function compareTitles(left: AnimeListRow, right: AnimeListRow) {
  const leftTitle = preferredTitle(left);
  const rightTitle = preferredTitle(right);

  if (leftTitle === null && rightTitle === null) {
    return left.id - right.id;
  }
  if (leftTitle === null) {
    return 1;
  }
  if (rightTitle === null) {
    return -1;
  }

  return chineseTitleCollator.compare(leftTitle, rightTitle) || left.id - right.id;
}

export class AnimeRepository {
  constructor(private readonly database: AppDatabase) {}

  list(options: AnimeListQuery): AnimeListRow[] {
    const filters: SQL[] = [];

    if (options.status !== "ALL") {
      filters.push(eq(anime.status, options.status));
    }

    if (options.query) {
      filters.push(sql`(
        instr(lower(coalesce(${anime.titleChinese}, '')), lower(${options.query})) > 0
        or instr(lower(coalesce(${anime.titleNative}, '')), lower(${options.query})) > 0
        or instr(lower(coalesce(${anime.titleEnglish}, '')), lower(${options.query})) > 0
        or exists (
          select 1
          from json_each(${anime.aliases}) as alias_entry
          where instr(
            lower(cast(alias_entry.value as text)),
            lower(${options.query})
          ) > 0
        )
      )`);
    }

    const query = this.database
      .select(listSelection)
      .from(anime)
      .where(and(...filters));

    if (options.sort === "RECENT") {
      return query.orderBy(desc(anime.createdAt), desc(anime.id)).all();
    }

    if (options.sort === "YEAR") {
      return query
        .orderBy(sql`${anime.year} is null`, asc(anime.year), asc(anime.id))
        .all();
    }

    return query.all().sort(compareTitles);
  }

  countByStatus() {
    const rows = this.database
      .select({
        status: anime.status,
        value: count(),
      })
      .from(anime)
      .groupBy(anime.status)
      .all();

    let watching = 0;
    let completed = 0;

    for (const row of rows) {
      if (row.status === "WATCHING") {
        watching = row.value;
      } else {
        completed = row.value;
      }
    }

    return {
      all: watching + completed,
      watching,
      completed,
    };
  }

  findById(id: number) {
    return this.database.select().from(anime).where(eq(anime.id, id)).get();
  }

  findDetailById(id: number) {
    return this.database
      .select({
        ...getTableColumns(anime),
        franchiseName: franchises.name,
      })
      .from(anime)
      .leftJoin(franchises, eq(anime.franchiseId, franchises.id))
      .where(eq(anime.id, id))
      .get();
  }

  findBySourceIds(source: string, sourceIds: string[]) {
    if (sourceIds.length === 0) {
      return [];
    }

    return this.database
      .select()
      .from(anime)
      .where(
        and(eq(anime.source, source), inArray(anime.sourceId, sourceIds)),
      )
      .all();
  }

  findBySourceReferenceIds(source: string, sourceIds: string[]) {
    if (sourceIds.length === 0) {
      return [];
    }

    return this.database
      .select({
        ...getTableColumns(anime),
        referenceSourceId: sourceReferences.sourceId,
      })
      .from(sourceReferences)
      .innerJoin(anime, eq(sourceReferences.animeId, anime.id))
      .where(
        and(
          eq(sourceReferences.source, source),
          inArray(sourceReferences.sourceId, sourceIds),
        ),
      )
      .all();
  }

  findSourceReferencesByAnimeId(id: number) {
    return this.database
      .select({
        source: sourceReferences.source,
        sourceId: sourceReferences.sourceId,
      })
      .from(sourceReferences)
      .where(eq(sourceReferences.animeId, id))
      .all();
  }

  updateStudioIfMissing(id: number, studio: string) {
    return this.database
      .update(anime)
      .set({ studio, updatedAt: new Date() })
      .where(and(eq(anime.id, id), isNull(anime.studio)))
      .returning({ studio: anime.studio })
      .get();
  }

  findLocalRelatedAnime(id: number) {
    const relationRows = this.database
      .select()
      .from(animeRelations)
      .where(
        or(
          eq(animeRelations.animeId, id),
          eq(animeRelations.relatedAnimeId, id),
        ),
      )
      .all();

    const relatedIds = Array.from(
      new Set(
        relationRows.map((relation) =>
          relation.animeId === id
            ? relation.relatedAnimeId
            : relation.animeId,
        ),
      ),
    );

    if (relatedIds.length === 0) {
      return [];
    }

    const relatedRows = this.database
      .select()
      .from(anime)
      .where(inArray(anime.id, relatedIds))
      .all();
    const relatedById = new Map(relatedRows.map((row) => [row.id, row]));

    return relationRows.flatMap((relation) => {
      const targetId =
        relation.animeId === id
          ? relation.relatedAnimeId
          : relation.animeId;
      const target = relatedById.get(targetId);

      if (!target) {
        return [];
      }

      return [
        {
          ...target,
          relationType:
            relation.animeId === id
              ? relation.relationType
              : invertRelationType(relation.relationType),
        },
      ];
    });
  }

  updateStatus(id: number, status: AnimeStatus) {
    return this.database
      .update(anime)
      .set({ status, updatedAt: new Date() })
      .where(eq(anime.id, id))
      .returning({
        id: anime.id,
        status: anime.status,
        updatedAt: anime.updatedAt,
      })
      .get();
  }

  updateCustomPosterPath(id: number, customPosterPath: string | null) {
    return this.database
      .update(anime)
      .set({ customPosterPath, updatedAt: new Date() })
      .where(eq(anime.id, id))
      .returning({
        id: anime.id,
        customPosterPath: anime.customPosterPath,
        defaultPosterPath: anime.defaultPosterPath,
        defaultPosterUrl: anime.defaultPosterUrl,
        updatedAt: anime.updatedAt,
      })
      .get();
  }

  findOtherCustomPosterPaths(id: number) {
    return this.database
      .select({
        id: anime.id,
        customPosterPath: anime.customPosterPath,
      })
      .from(anime)
      .where(isNotNull(anime.customPosterPath))
      .all()
      .flatMap((row) =>
        row.id !== id && row.customPosterPath ? [row.customPosterPath] : [],
      );
  }

  deleteById(id: number) {
    return this.database.transaction((transaction) => {
      const existing = transaction
        .select({ id: anime.id })
        .from(anime)
        .where(eq(anime.id, id))
        .get();
      if (!existing) {
        return undefined;
      }

      transaction
        .delete(animeRelations)
        .where(
          or(
            eq(animeRelations.animeId, id),
            eq(animeRelations.relatedAnimeId, id),
          ),
        )
        .run();
      transaction
        .delete(sourceReferences)
        .where(eq(sourceReferences.animeId, id))
        .run();

      return transaction
        .delete(anime)
        .where(eq(anime.id, id))
        .returning({ id: anime.id })
        .get();
    });
  }
}

function invertRelationType(relationType: string) {
  if (relationType === "PREQUEL") {
    return "SEQUEL";
  }

  if (relationType === "SEQUEL") {
    return "PREQUEL";
  }

  return relationType;
}
