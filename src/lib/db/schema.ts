import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const ANIME_STATUSES = ["WATCHING", "COMPLETED"] as const;

export const RELATION_TYPES = [
  "PREQUEL",
  "SEQUEL",
  "OVA",
  "OAD",
  "MOVIE",
  "SPECIAL",
  "RECAP",
  "SIDE_STORY",
  "SPIN_OFF",
  "OTHER",
] as const;

export type AnimeStatus = (typeof ANIME_STATUSES)[number];
export type RelationType = (typeof RELATION_TYPES)[number];

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

export const franchises = sqliteTable(
  "franchise",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("franchise_name_idx").on(table.name)],
);

export const anime = sqliteTable(
  "anime",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    titleChinese: text("title_chinese"),
    titleNative: text("title_native"),
    titleEnglish: text("title_english"),
    aliases: text("aliases", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    year: integer("year"),
    mediaType: text("media_type"),
    episodeCount: integer("episode_count"),
    studio: text("studio"),
    synopsis: text("synopsis"),
    defaultPosterUrl: text("default_poster_url"),
    defaultPosterPath: text("default_poster_path"),
    customPosterPath: text("custom_poster_path"),
    status: text("status", { enum: ANIME_STATUSES })
      .notNull()
      .default("WATCHING"),
    franchiseId: integer("franchise_id").references(() => franchises.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("anime_source_source_id_unique").on(
      table.source,
      table.sourceId,
    ),
    index("anime_status_idx").on(table.status),
    index("anime_created_at_idx").on(table.createdAt),
    index("anime_title_chinese_idx").on(table.titleChinese),
    index("anime_year_idx").on(table.year),
    index("anime_franchise_id_idx").on(table.franchiseId),
    check(
      "anime_status_check",
      sql`${table.status} in ('WATCHING', 'COMPLETED')`,
    ),
    check(
      "anime_aliases_json_array_check",
      sql`json_valid(${table.aliases}) and json_type(${table.aliases}) = 'array'`,
    ),
  ],
);

export const animeRelations = sqliteTable(
  "anime_relation",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    animeId: integer("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    relatedAnimeId: integer("related_anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    relationType: text("relation_type", { enum: RELATION_TYPES }).notNull(),
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("anime_relation_unique").on(
      table.animeId,
      table.relatedAnimeId,
      table.relationType,
      table.source,
    ),
    index("anime_relation_anime_id_idx").on(table.animeId),
    index("anime_relation_related_anime_id_idx").on(table.relatedAnimeId),
    check(
      "anime_relation_type_check",
      sql`${table.relationType} in ('PREQUEL', 'SEQUEL', 'OVA', 'OAD', 'MOVIE', 'SPECIAL', 'RECAP', 'SIDE_STORY', 'SPIN_OFF', 'OTHER')`,
    ),
    check(
      "anime_relation_not_self_check",
      sql`${table.animeId} <> ${table.relatedAnimeId}`,
    ),
  ],
);

export const sourceReferences = sqliteTable(
  "source_reference",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    animeId: integer("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    url: text("url"),
    createdAt: createdAt(),
  },
  (table) => [
    index("source_reference_anime_id_idx").on(table.animeId),
    index("source_reference_source_source_id_idx").on(
      table.source,
      table.sourceId,
    ),
  ],
);

export const appSettings = sqliteTable("app_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});
