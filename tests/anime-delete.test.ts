import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CustomPosterStorage } from "@/lib/images/custom-poster-storage";
import * as schema from "@/lib/db/schema";
import {
  handleDeleteAnimeRequest,
  handleListAnimeRequest,
} from "@/server/http/anime-handlers";
import { AnimeRepository } from "@/server/repositories/anime-repository";
import { AnimeDeleteService } from "@/server/services/anime-delete-service";
import { AnimeReadService } from "@/server/services/anime-read-service";
import type { ApiResponse } from "@/types/api";
import type { AnimeDeleteData, AnimeListData } from "@/types/anime";

async function responseBody<T>(response: Response) {
  return (await response.json()) as ApiResponse<T>;
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("anime deletion", () => {
  let sqlite: Database.Database;
  let repository: AnimeRepository;
  let deleteService: AnimeDeleteService;
  let readService: AnimeReadService;
  let sandboxRoot: string;
  let posterRoot: string;
  let targetId: number;
  let peerId: number;
  let thirdId: number;

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(resolve(tmpdir(), "anime-delete-test-"));
    posterRoot = resolve(sandboxRoot, "posters");
    await Promise.all([
      mkdir(resolve(posterRoot, "custom"), { recursive: true }),
      mkdir(resolve(posterRoot, "default"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(resolve(posterRoot, "custom", "target.jpg"), "target"),
      writeFile(resolve(posterRoot, "custom", "keep.jpg"), "keep"),
      writeFile(resolve(posterRoot, "default", "target.jpg"), "default"),
    ]);

    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite, { schema });
    migrate(database, { migrationsFolder: resolve(process.cwd(), "drizzle") });

    const insertAnime = sqlite.prepare(`
      insert into anime (
        source, source_id, title_chinese, aliases, default_poster_path,
        custom_poster_path, status
      ) values (?, ?, ?, '[]', ?, ?, ?)
    `);
    targetId = Number(
      insertAnime.run(
        "bangumi",
        "delete-1",
        "待删除作品",
        "default/target.jpg",
        "custom/target.jpg",
        "WATCHING",
      ).lastInsertRowid,
    );
    peerId = Number(
      insertAnime.run(
        "bangumi",
        "keep-2",
        "保留作品",
        null,
        null,
        "WATCHING",
      ).lastInsertRowid,
    );
    thirdId = Number(
      insertAnime.run(
        "bangumi",
        "keep-3",
        "另一部保留作品",
        null,
        "custom/keep.jpg",
        "COMPLETED",
      ).lastInsertRowid,
    );

    const insertRelation = sqlite.prepare(`
      insert into anime_relation
        (anime_id, related_anime_id, relation_type, source)
      values (?, ?, ?, 'bangumi')
    `);
    insertRelation.run(targetId, peerId, "SEQUEL");
    insertRelation.run(peerId, thirdId, "OVA");
    insertRelation.run(thirdId, targetId, "PREQUEL");
    sqlite
      .prepare(
        "insert into source_reference (anime_id, source, source_id) values (?, 'bangumi', ?)",
      )
      .run(targetId, "delete-1");
    sqlite
      .prepare(
        "insert into source_reference (anime_id, source, source_id) values (?, 'bangumi', ?)",
      )
      .run(peerId, "keep-2");

    repository = new AnimeRepository(database);
    deleteService = new AnimeDeleteService(
      repository,
      new CustomPosterStorage(posterRoot),
    );
    readService = new AnimeReadService(repository);
  });

  afterEach(async () => {
    sqlite.close();
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  it("deletes only the selected local record, its references and its custom poster", async () => {
    const response = await handleDeleteAnimeRequest(
      String(targetId),
      deleteService,
    );
    const body = await responseBody<AnimeDeleteData>(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ id: targetId });
    expect(
      sqlite.prepare("select id from anime where id = ?").get(targetId),
    ).toBeUndefined();
    expect(
      sqlite
        .prepare(
          "select count(*) as value from anime_relation where anime_id = ? or related_anime_id = ?",
        )
        .get(targetId, targetId),
    ).toEqual({ value: 0 });
    expect(
      sqlite.prepare("select count(*) as value from anime_relation").get(),
    ).toEqual({ value: 1 });
    expect(
      sqlite
        .prepare(
          "select count(*) as value from source_reference where anime_id = ?",
        )
        .get(targetId),
    ).toEqual({ value: 0 });
    expect(
      sqlite
        .prepare(
          "select count(*) as value from source_reference where anime_id = ?",
        )
        .get(peerId),
    ).toEqual({ value: 1 });

    expect(await pathExists(resolve(posterRoot, "custom", "target.jpg"))).toBe(
      false,
    );
    expect(await pathExists(resolve(posterRoot, "custom", "keep.jpg"))).toBe(
      true,
    );
    expect(await pathExists(resolve(posterRoot, "default", "target.jpg"))).toBe(
      true,
    );

    const list = await responseBody<AnimeListData>(
      handleListAnimeRequest(
        new Request("http://localhost/api/anime?status=WATCHING"),
        readService,
      ),
    );
    expect(list.data?.items.map(({ id }) => id)).toEqual([peerId]);
    expect(list.data?.counts).toEqual({ all: 2, watching: 1, completed: 1 });
  });

  it("keeps a custom poster file that another anime still references", async () => {
    await writeFile(resolve(posterRoot, "custom", "shared.webp"), "shared");
    sqlite
      .prepare("update anime set custom_poster_path = ? where id in (?, ?)")
      .run("custom/shared.webp", targetId, peerId);

    const response = await handleDeleteAnimeRequest(
      String(targetId),
      deleteService,
    );

    expect(response.status).toBe(200);
    expect(await pathExists(resolve(posterRoot, "custom", "shared.webp"))).toBe(
      true,
    );
    expect(sqlite.prepare("select id from anime where id = ?").get(peerId)).toEqual({
      id: peerId,
    });
  });

  it("rejects path traversal without deleting the record or outside file", async () => {
    const outsidePath = resolve(sandboxRoot, "outside.jpg");
    await writeFile(outsidePath, "outside");
    sqlite
      .prepare("update anime set custom_poster_path = ? where id = ?")
      .run("custom/../../outside.jpg", targetId);

    const response = await handleDeleteAnimeRequest(
      String(targetId),
      deleteService,
    );
    const body = await responseBody<AnimeDeleteData>(response);

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("UNSAFE_CUSTOM_POSTER_PATH");
    expect(sqlite.prepare("select id from anime where id = ?").get(targetId)).toEqual({
      id: targetId,
    });
    expect(await pathExists(outsidePath)).toBe(true);
    expect(await pathExists(resolve(posterRoot, "custom", "target.jpg"))).toBe(
      true,
    );
  });

  it("rejects invalid IDs and reports a missing anime", async () => {
    const invalid = await handleDeleteAnimeRequest("../1", deleteService);
    const missing = await handleDeleteAnimeRequest("999", deleteService);

    expect(invalid.status).toBe(400);
    expect((await responseBody(invalid)).error?.code).toBe("INVALID_ANIME_ID");
    expect(missing.status).toBe(404);
  });
});
