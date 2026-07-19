import { getDatabase } from "@/lib/db/client";
import {
  CustomPosterStorage,
  UnsafeCustomPosterPathError,
} from "@/lib/images/custom-poster-storage";
import {
  validatePosterBytes,
  type PosterExtension,
} from "@/lib/images/poster-image-validation";
import {
  RemotePosterDownloader,
  type DownloadedPoster,
} from "@/lib/images/remote-poster-download";
import { AnimeRepository } from "@/server/repositories/anime-repository";
import { getEffectivePosterStoragePath } from "@/server/config/runtime-settings";
import type { AnimePosterUpdateData } from "@/types/anime";

export class AnimePosterService {
  constructor(
    private readonly repository: AnimeRepository,
    private readonly storage: CustomPosterStorage,
    private readonly downloader: RemotePosterDownloader,
  ) {}

  async upload(
    animeId: number,
    bytes: Uint8Array,
    contentType: string | null,
  ): Promise<AnimePosterUpdateData | null> {
    return this.replace(
      animeId,
      bytes,
      validatePosterBytes(bytes, contentType),
    );
  }

  async importUrl(
    animeId: number,
    url: string,
  ): Promise<AnimePosterUpdateData | null> {
    const downloaded = await this.downloader.download(url);
    return this.replaceDownloaded(animeId, downloaded);
  }

  async restoreDefault(
    animeId: number,
  ): Promise<AnimePosterUpdateData | null> {
    const existing = this.repository.findById(animeId);
    if (!existing) return null;
    if (existing.customPosterPath) {
      await this.storage.assertSafePath(existing.customPosterPath);
    }

    const updated = this.repository.updateCustomPosterPath(animeId, null);
    if (!updated) return null;
    if (existing.customPosterPath) {
      await this.storage.removeIfUnused(
        existing.customPosterPath,
        this.repository.findOtherCustomPosterPaths(animeId),
      );
    }
    return serializeUpdate(updated);
  }

  private replaceDownloaded(
    animeId: number,
    downloaded: DownloadedPoster,
  ): Promise<AnimePosterUpdateData | null> {
    return this.replace(animeId, downloaded.bytes, downloaded.extension);
  }

  private async replace(
    animeId: number,
    bytes: Uint8Array,
    extension: PosterExtension,
  ): Promise<AnimePosterUpdateData | null> {
    const existing = this.repository.findById(animeId);
    if (!existing) return null;
    if (existing.customPosterPath) {
      await this.storage.assertSafePath(existing.customPosterPath);
    }

    const relativePath = await this.storage.save(animeId, bytes, extension);
    try {
      const updated = this.repository.updateCustomPosterPath(
        animeId,
        relativePath,
      );
      if (!updated) {
        await this.storage.remove(relativePath);
        return null;
      }
      if (existing.customPosterPath) {
        await this.storage.removeIfUnused(
          existing.customPosterPath,
          this.repository.findOtherCustomPosterPaths(animeId),
        );
      }
      return serializeUpdate(updated);
    } catch (error) {
      const current = this.repository.findById(animeId);
      if (current?.customPosterPath !== relativePath) {
        await this.storage.remove(relativePath);
      }
      throw error;
    }
  }
}

function serializeUpdate(row: {
  id: number;
  customPosterPath: string | null;
  defaultPosterPath: string | null;
  defaultPosterUrl: string | null;
  updatedAt: Date;
}): AnimePosterUpdateData {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

let animePosterService: AnimePosterService | undefined;

export function getAnimePosterService(): AnimePosterService {
  if (!animePosterService) {
    const rootPath = getEffectivePosterStoragePath();
    animePosterService = new AnimePosterService(
      new AnimeRepository(getDatabase()),
      new CustomPosterStorage(rootPath),
      new RemotePosterDownloader(),
    );
  }
  return animePosterService;
}

export function resetAnimePosterService(): void {
  animePosterService = undefined;
}

export { UnsafeCustomPosterPathError };
