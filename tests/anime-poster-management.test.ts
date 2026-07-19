import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnimePoster, posterSourceCandidates } from "@/components/anime/AnimePoster";
import { PosterManagerModal } from "@/components/anime/PosterManagerModal";
import * as schema from "@/lib/db/schema";
import { CustomPosterStorage } from "@/lib/images/custom-poster-storage";
import { MAX_CUSTOM_POSTER_BYTES } from "@/lib/images/poster-image-validation";
import {
  RemotePosterDownloader,
  type RemotePosterResponse,
} from "@/lib/images/remote-poster-download";
import {
  handleImportAnimePosterUrlRequest,
  handleRestoreAnimePosterRequest,
  handleUploadAnimePosterRequest,
} from "@/server/http/anime-handlers";
import { AnimeRepository } from "@/server/repositories/anime-repository";
import { AnimeDetailService } from "@/server/services/anime-detail-service";
import { AnimePosterService } from "@/server/services/anime-poster-service";
import { AnimeReadService } from "@/server/services/anime-read-service";
import type { ApiResponse } from "@/types/api";
import type { AnimePosterUpdateData } from "@/types/anime";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function body<T>(response: Response) {
  return (await response.json()) as ApiResponse<T>;
}

function uploadRequest(
  bytes: Uint8Array,
  contentType: string,
  filename = "poster.png",
) {
  const form = new FormData();
  form.set(
    "file",
    new File([bytes as Uint8Array<ArrayBuffer>], filename, {
      type: contentType,
    }),
  );
  return new Request("http://localhost/api/anime/1/poster/upload", {
    method: "POST",
    body: form,
  });
}

function urlRequest(url: string) {
  return new Request("http://localhost/api/anime/1/poster/url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

function remoteResponse(input: {
  statusCode?: number;
  contentType?: string;
  contentLength?: string;
  location?: string;
  chunks?: Uint8Array[];
}): RemotePosterResponse {
  return {
    statusCode: input.statusCode ?? 200,
    headers: {
      ...(input.contentType ? { "content-type": input.contentType } : {}),
      ...(input.contentLength ? { "content-length": input.contentLength } : {}),
      ...(input.location ? { location: input.location } : {}),
    },
    resume: vi.fn(),
    destroy: vi.fn(),
    async *[Symbol.asyncIterator]() {
      for (const chunk of input.chunks ?? []) yield chunk;
    },
  };
}

describe("anime poster management", () => {
  let sqlite: Database.Database;
  let repository: AnimeRepository;
  let service: AnimePosterService;
  let readService: AnimeReadService;
  let detailService: AnimeDetailService;
  let sandboxRoot: string;
  let posterRoot: string;
  let animeId: number;

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(resolve(tmpdir(), "anime-poster-test-"));
    posterRoot = resolve(sandboxRoot, "posters");
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite, { schema });
    migrate(database, { migrationsFolder: resolve(process.cwd(), "drizzle") });
    animeId = Number(
      sqlite
        .prepare(`
          insert into anime (
            source, source_id, title_chinese, aliases, default_poster_url,
            default_poster_path, custom_poster_path, status
          ) values ('bangumi', 'poster-1', '封面测试', '[]', ?, ?, null, 'WATCHING')
        `)
        .run(
          "https://images.example.test/original.jpg",
          "default/bangumi-1.jpg",
        ).lastInsertRowid,
    );
    repository = new AnimeRepository(database);
    service = new AnimePosterService(
      repository,
      new CustomPosterStorage(posterRoot),
      new RemotePosterDownloader(),
    );
    readService = new AnimeReadService(repository);
    detailService = new AnimeDetailService(repository, null);
  });

  afterEach(async () => {
    sqlite.close();
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  it("keeps the exact custom, default-local, remote and placeholder priority", () => {
    expect(
      posterSourceCandidates({
        customPosterPath: "custom/7-123e4567-e89b-12d3-a456-426614174000.webp",
        defaultPosterPath: "default/anilist-7.png",
        defaultPosterUrl: "https://images.example.test/7.jpg",
      }),
    ).toEqual([
      "/api/posters/custom/7-123e4567-e89b-12d3-a456-426614174000.webp",
      "/api/posters/default/anilist-7.png",
      "https://images.example.test/7.jpg",
      "/placeholders/anime-poster.svg",
    ]);
    expect(
      posterSourceCandidates({
        customPosterPath: "custom/../../escape.jpg",
        defaultPosterPath: null,
        defaultPosterUrl: null,
      }),
    ).toEqual(["/placeholders/anime-poster.svg"]);
  });

  it("shows preview controls but requires explicit confirmation before upload", async () => {
    const anime = await detailService.getById(animeId);
    expect(anime).not.toBeNull();
    const markup = renderToStaticMarkup(
      createElement(PosterManagerModal, {
        anime: anime!,
        title: "封面测试",
        onClose: vi.fn(),
        onUpdated: vi.fn(),
        returnFocus: null,
      }),
    );

    expect(markup).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(markup).toContain('placeholder="https://example.com/poster.jpg"');
    expect(markup).toContain("确认保存");
    expect(markup).toContain("恢复默认封面");
    expect(markup).toContain("disabled");
    expect(repository.findById(animeId)?.customPosterPath).toBeNull();
  });

  it("uploads with a server-generated filename, updates home/detail, and restores default", async () => {
    const upload = await handleUploadAnimePosterRequest(
      String(animeId),
      uploadRequest(PNG_BYTES, "image/png", "../../outside.png"),
      service,
    );
    const uploaded = await body<AnimePosterUpdateData>(upload);

    expect(upload.status).toBe(200);
    expect(uploaded.data?.customPosterPath).toMatch(
      new RegExp(`^custom/${animeId}-[0-9a-f-]{36}\\.png$`, "i"),
    );
    expect(uploaded.data?.defaultPosterPath).toBe("default/bangumi-1.jpg");
    expect(uploaded.data?.defaultPosterUrl).toBe(
      "https://images.example.test/original.jpg",
    );
    const savedPath = resolve(posterRoot, uploaded.data!.customPosterPath!);
    expect(await pathExists(savedPath)).toBe(true);
    expect(await pathExists(resolve(sandboxRoot, "outside.png"))).toBe(false);

    const home = readService.list({ status: "ALL", sort: "RECENT" });
    const detail = await detailService.getById(animeId);
    expect(home.items[0]?.customPosterPath).toBe(uploaded.data?.customPosterPath);
    expect(detail?.customPosterPath).toBe(uploaded.data?.customPosterPath);

    const restore = await handleRestoreAnimePosterRequest(String(animeId), service);
    const restored = await body<AnimePosterUpdateData>(restore);
    expect(restore.status).toBe(200);
    expect(restored.data?.customPosterPath).toBeNull();
    expect(restored.data?.defaultPosterPath).toBe("default/bangumi-1.jpg");
    expect((await detailService.getById(animeId))?.customPosterPath).toBeNull();
    expect(await pathExists(savedPath)).toBe(false);
  });

  it("replaces a custom poster only after another explicit request", async () => {
    const first = await body<AnimePosterUpdateData>(
      await handleUploadAnimePosterRequest(
        String(animeId),
        uploadRequest(PNG_BYTES, "image/png"),
        service,
      ),
    );
    const firstPath = first.data!.customPosterPath!;
    expect(repository.findById(animeId)?.customPosterPath).toBe(firstPath);

    const second = await body<AnimePosterUpdateData>(
      await handleUploadAnimePosterRequest(
        String(animeId),
        uploadRequest(JPEG_BYTES, "image/jpeg", "second.jpeg"),
        service,
      ),
    );
    expect(second.data?.customPosterPath).toMatch(/\.jpg$/);
    expect(second.data?.customPosterPath).not.toBe(firstPath);
    expect(await pathExists(resolve(posterRoot, firstPath))).toBe(false);
    expect(await pathExists(resolve(posterRoot, second.data!.customPosterPath!))).toBe(
      true,
    );
  });

  it("rejects oversized and forged uploads without changing the database", async () => {
    const oversized = new Uint8Array(MAX_CUSTOM_POSTER_BYTES + 1);
    oversized.set(PNG_BYTES);
    const tooLarge = await handleUploadAnimePosterRequest(
      String(animeId),
      uploadRequest(oversized, "image/png"),
      service,
    );
    const forged = await handleUploadAnimePosterRequest(
      String(animeId),
      uploadRequest(new TextEncoder().encode("<script>alert(1)</script>"), "image/jpeg"),
      service,
    );

    expect(tooLarge.status).toBe(413);
    expect((await body(tooLarge)).error?.code).toBe("POSTER_TOO_LARGE");
    expect(forged.status).toBe(415);
    expect((await body(forged)).error?.code).toBe("INVALID_POSTER_IMAGE");
    expect(repository.findById(animeId)?.customPosterPath).toBeNull();
  });

  it("rejects an existing traversal path before writing or deleting anything", async () => {
    const outsidePath = resolve(sandboxRoot, "outside.jpg");
    await writeFile(outsidePath, "outside");
    sqlite
      .prepare("update anime set custom_poster_path = ? where id = ?")
      .run("custom/../../outside.jpg", animeId);

    const response = await handleUploadAnimePosterRequest(
      String(animeId),
      uploadRequest(PNG_BYTES, "image/png"),
      service,
    );
    expect(response.status).toBe(409);
    expect((await body(response)).error?.code).toBe("UNSAFE_CUSTOM_POSTER_PATH");
    expect(await pathExists(outsidePath)).toBe(true);
    expect(await readdir(posterRoot).catch(() => [])).toEqual([]);
  });

  it.each([
    "http://127.0.0.1/poster.jpg",
    "http://[::1]/poster.jpg",
    "http://169.254.169.254/latest/meta-data/",
    "http://192.168.1.10/poster.png",
  ])("blocks local and private URL %s before connecting", async (url) => {
    const response = await handleImportAnimePosterUrlRequest(
      String(animeId),
      urlRequest(url),
      service,
    );
    expect(response.status).toBe(400);
    expect((await body(response)).error?.code).toBe("BLOCKED_POSTER_URL");
    expect(repository.findById(animeId)?.customPosterPath).toBeNull();
  });

  it("rejects DNS answers containing a private address and never opens a request", async () => {
    const requestPinned = vi.fn();
    const downloader = new RemotePosterDownloader({
      resolveHostname: vi.fn(async () => [
        { address: "93.184.216.34", family: 4 as const },
        { address: "127.0.0.1", family: 4 as const },
      ]),
      requestPinned,
    });

    await expect(downloader.download("https://example.com/poster.jpg")).rejects.toMatchObject(
      { code: "BLOCKED_ADDRESS" },
    );
    expect(requestPinned).not.toHaveBeenCalled();
  });

  it("revalidates redirects and blocks a redirect to localhost", async () => {
    const downloader = new RemotePosterDownloader({
      resolveHostname: vi.fn(async () => [
        { address: "93.184.216.34", family: 4 as const },
      ]),
      requestPinned: vi.fn(async () =>
        remoteResponse({ statusCode: 302, location: "http://127.0.0.1/private" }),
      ),
    });

    await expect(downloader.download("https://example.com/poster.jpg")).rejects.toMatchObject(
      { code: "BLOCKED_ADDRESS" },
    );
  });

  it.each([
    {
      label: "declared oversized response",
      response: remoteResponse({
        contentType: "image/png",
        contentLength: String(MAX_CUSTOM_POSTER_BYTES + 1),
        chunks: [PNG_BYTES],
      }),
      code: "IMAGE_TOO_LARGE",
    },
    {
      label: "forged image content type",
      response: remoteResponse({
        contentType: "image/jpeg",
        chunks: [new TextEncoder().encode("not an image")],
      }),
      code: "INVALID_IMAGE_SIGNATURE",
    },
    {
      label: "unsupported response type",
      response: remoteResponse({
        contentType: "text/html",
        chunks: [new TextEncoder().encode("<html></html>")],
      }),
      code: "UNSUPPORTED_IMAGE_TYPE",
    },
  ])("rejects $label", async ({ response, code }) => {
    const downloader = new RemotePosterDownloader({
      resolveHostname: vi.fn(async () => [
        { address: "93.184.216.34", family: 4 as const },
      ]),
      requestPinned: vi.fn(async () => response),
    });
    await expect(downloader.download("https://example.com/poster.jpg")).rejects.toMatchObject({
      code,
    });
  });

  it("downloads a validated remote image locally and preserves source defaults", async () => {
    const requestPinned = vi.fn(async () =>
      remoteResponse({ contentType: "image/jpeg", chunks: [JPEG_BYTES] }),
    );
    const remoteService = new AnimePosterService(
      repository,
      new CustomPosterStorage(posterRoot),
      new RemotePosterDownloader({
        resolveHostname: vi.fn(async () => [
          { address: "93.184.216.34", family: 4 as const },
        ]),
        requestPinned,
      }),
    );
    const response = await handleImportAnimePosterUrlRequest(
      String(animeId),
      urlRequest("https://images.example.test/poster.jpg"),
      remoteService,
    );
    const imported = await body<AnimePosterUpdateData>(response);

    expect(response.status).toBe(200);
    expect(imported.data?.customPosterPath).toMatch(/\.jpg$/);
    expect(imported.data?.defaultPosterPath).toBe("default/bangumi-1.jpg");
    expect(await pathExists(resolve(posterRoot, imported.data!.customPosterPath!))).toBe(
      true,
    );
    expect(requestPinned).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "images.example.test" }),
      { address: "93.184.216.34", family: 4 },
      10_000,
    );
  });

  it("renders the current source without treating untrusted custom paths as URLs", () => {
    const markup = renderToStaticMarkup(
      createElement(AnimePoster, {
        title: "安全封面",
        customPosterPath: "custom/../../outside.jpg",
        defaultPosterPath: "default/tmdb-9.webp",
        defaultPosterUrl: null,
      }),
    );
    expect(markup).toContain("/api/posters/default/tmdb-9.webp");
    expect(markup).not.toContain("outside.jpg");
  });
});
