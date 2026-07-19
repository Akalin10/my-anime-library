CREATE TABLE `anime` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`title_chinese` text,
	`title_native` text,
	`title_english` text,
	`aliases` text DEFAULT '[]' NOT NULL,
	`year` integer,
	`media_type` text,
	`episode_count` integer,
	`studio` text,
	`synopsis` text,
	`default_poster_url` text,
	`default_poster_path` text,
	`custom_poster_path` text,
	`status` text DEFAULT 'WATCHING' NOT NULL,
	`franchise_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`franchise_id`) REFERENCES `franchise`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "anime_status_check" CHECK("anime"."status" in ('WATCHING', 'COMPLETED')),
	CONSTRAINT "anime_aliases_json_array_check" CHECK(json_valid("anime"."aliases") and json_type("anime"."aliases") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anime_source_source_id_unique` ON `anime` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `anime_status_idx` ON `anime` (`status`);--> statement-breakpoint
CREATE INDEX `anime_created_at_idx` ON `anime` (`created_at`);--> statement-breakpoint
CREATE INDEX `anime_title_chinese_idx` ON `anime` (`title_chinese`);--> statement-breakpoint
CREATE INDEX `anime_year_idx` ON `anime` (`year`);--> statement-breakpoint
CREATE INDEX `anime_franchise_id_idx` ON `anime` (`franchise_id`);--> statement-breakpoint
CREATE TABLE `anime_relation` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`anime_id` integer NOT NULL,
	`related_anime_id` integer NOT NULL,
	`relation_type` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "anime_relation_type_check" CHECK("anime_relation"."relation_type" in ('PREQUEL', 'SEQUEL', 'OVA', 'OAD', 'MOVIE', 'SPECIAL', 'RECAP', 'SIDE_STORY', 'SPIN_OFF', 'OTHER')),
	CONSTRAINT "anime_relation_not_self_check" CHECK("anime_relation"."anime_id" <> "anime_relation"."related_anime_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anime_relation_unique` ON `anime_relation` (`anime_id`,`related_anime_id`,`relation_type`,`source`);--> statement-breakpoint
CREATE INDEX `anime_relation_anime_id_idx` ON `anime_relation` (`anime_id`);--> statement-breakpoint
CREATE INDEX `anime_relation_related_anime_id_idx` ON `anime_relation` (`related_anime_id`);--> statement-breakpoint
CREATE TABLE `app_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `franchise` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `franchise_name_idx` ON `franchise` (`name`);--> statement-breakpoint
CREATE TABLE `source_reference` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`anime_id` integer NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `source_reference_anime_id_idx` ON `source_reference` (`anime_id`);--> statement-breakpoint
CREATE INDEX `source_reference_source_source_id_idx` ON `source_reference` (`source`,`source_id`);