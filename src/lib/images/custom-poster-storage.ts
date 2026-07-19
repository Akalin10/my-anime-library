import { lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, isAbsolute, resolve, sep } from "node:path";

import type { PosterExtension } from "@/lib/images/poster-image-validation";

const CUSTOM_POSTER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

type InspectedPosterPath = {
  absolutePath: string;
  exists: boolean;
  identityPath: string;
};

export class UnsafeCustomPosterPathError extends Error {
  constructor() {
    super("Custom poster path is outside the controlled storage directory");
    this.name = "UnsafeCustomPosterPathError";
  }
}

export class CustomPosterStorage {
  private readonly rootPath: string;
  private readonly customDirectory: string;

  constructor(rootPath: string) {
    this.rootPath = resolve(rootPath);
    this.customDirectory = resolve(this.rootPath, "custom");
  }

  async assertSafePath(relativePath: string): Promise<void> {
    await this.inspect(relativePath);
  }

  async save(
    animeId: number,
    bytes: Uint8Array,
    extension: PosterExtension,
  ): Promise<string> {
    await this.ensureSafeDirectories();
    const filename = `${animeId}-${randomUUID()}${extension}`;
    const relativePath = `custom/${filename}`;
    const absolutePath = resolve(this.rootPath, relativePath);
    if (!absolutePath.startsWith(`${this.customDirectory}${sep}`)) {
      throw new UnsafeCustomPosterPathError();
    }
    await writeFile(absolutePath, bytes, { flag: "wx", mode: 0o600 });
    await this.assertSafePath(relativePath);
    return relativePath;
  }

  async remove(relativePath: string): Promise<boolean> {
    return this.removeIfUnused(relativePath, []);
  }

  async removeIfUnused(
    relativePath: string,
    otherReferencedPaths: string[],
  ): Promise<boolean> {
    const target = await this.inspect(relativePath);

    for (const otherPath of otherReferencedPaths) {
      try {
        const other = await this.inspect(otherPath);
        if (other.identityPath === target.identityPath) {
          return false;
        }
      } catch (error) {
        if (!(error instanceof UnsafeCustomPosterPathError)) {
          throw error;
        }
      }
    }

    if (!target.exists) {
      return false;
    }

    await rm(target.absolutePath, { force: true });
    return true;
  }

  private async inspect(relativePath: string): Promise<InspectedPosterPath> {
    const pathSegments = relativePath.replaceAll("\\", "/").split("/");
    if (
      !relativePath ||
      isAbsolute(relativePath) ||
      pathSegments.includes("..")
    ) {
      throw new UnsafeCustomPosterPathError();
    }

    const absolutePath = resolve(this.rootPath, relativePath);
    if (
      !absolutePath.startsWith(`${this.customDirectory}${sep}`) ||
      !CUSTOM_POSTER_EXTENSIONS.has(extname(absolutePath).toLowerCase())
    ) {
      throw new UnsafeCustomPosterPathError();
    }

    try {
      const entry = await lstat(absolutePath);
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new UnsafeCustomPosterPathError();
      }

      const [realRootPath, realCustomDirectory, realTarget] = await Promise.all([
        realpath(this.rootPath),
        realpath(this.customDirectory),
        realpath(absolutePath),
      ]);
      if (
        !realCustomDirectory.startsWith(`${realRootPath}${sep}`) ||
        !realTarget.startsWith(`${realCustomDirectory}${sep}`)
      ) {
        throw new UnsafeCustomPosterPathError();
      }

      return { absolutePath, exists: true, identityPath: realTarget };
    } catch (error) {
      if (
        error instanceof UnsafeCustomPosterPathError ||
        !isMissingPathError(error)
      ) {
        throw error;
      }

      return { absolutePath, exists: false, identityPath: absolutePath };
    }
  }

  private async ensureSafeDirectories(): Promise<void> {
    await mkdir(this.rootPath, { recursive: true });
    const rootEntry = await lstat(this.rootPath);
    if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
      throw new UnsafeCustomPosterPathError();
    }
    await mkdir(this.customDirectory, { recursive: true });
    const customEntry = await lstat(this.customDirectory);
    if (!customEntry.isDirectory() || customEntry.isSymbolicLink()) {
      throw new UnsafeCustomPosterPathError();
    }
    const [realRoot, realCustom] = await Promise.all([
      realpath(this.rootPath),
      realpath(this.customDirectory),
    ]);
    if (!realCustom.startsWith(`${realRoot}${sep}`)) {
      throw new UnsafeCustomPosterPathError();
    }
  }
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
