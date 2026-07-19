import { mkdir, rm, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

import type { PosterCandidate } from "@/lib/sources/types";

const MAX_DEFAULT_POSTER_BYTES = 10 * 1024 * 1024;

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export class PosterDownloadError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("No poster candidate could be downloaded");
    this.name = "PosterDownloadError";
    this.cause = options?.cause;
  }
}

export type DefaultPosterStorageOptions = {
  rootPath: string;
  fetchImplementation?: typeof fetch;
};

export class DefaultPosterStorage {
  private readonly rootPath: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: DefaultPosterStorageOptions) {
    this.rootPath = resolve(options.rootPath);
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async downloadBest(
    sourceId: string,
    candidates: PosterCandidate[],
  ): Promise<string | null> {
    if (candidates.length === 0) {
      return null;
    }

    let lastError: unknown;

    for (const candidate of candidates) {
      try {
        const response = await this.fetchImplementation(candidate.url, {
          headers: { Accept: "image/jpeg,image/png,image/webp" },
          redirect: "follow",
        });

        if (!response.ok) {
          throw new Error(`Poster request failed with ${response.status}`);
        }

        const contentType = response.headers
          .get("content-type")
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase();
        const extension = contentType ? IMAGE_EXTENSIONS[contentType] : undefined;
        if (!extension) {
          throw new Error("Poster response is not a supported image");
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_DEFAULT_POSTER_BYTES) {
          throw new Error("Poster response has an invalid size");
        }

        const relativePath = `default/${candidate.source}-${sourceId}${extension}`;
        const directory = resolve(this.rootPath, "default");
        const absolutePath = resolve(this.rootPath, relativePath);
        await mkdir(directory, { recursive: true });
        await writeFile(absolutePath, bytes);
        return relativePath;
      } catch (error) {
        lastError = error;
      }
    }

    throw new PosterDownloadError({ cause: lastError });
  }

  async remove(relativePath: string): Promise<void> {
    const absolutePath = resolve(this.rootPath, relativePath);
    const defaultDirectory = resolve(this.rootPath, "default");
    const extension = extname(absolutePath).toLowerCase();
    if (
      !absolutePath.startsWith(`${defaultDirectory}${sep}`) ||
      !Object.values(IMAGE_EXTENSIONS).includes(extension)
    ) {
      return;
    }
    await rm(absolutePath, { force: true });
  }
}
