import { getDatabase } from "@/lib/db/client";
import { CustomPosterStorage } from "@/lib/images/custom-poster-storage";
import { AnimeRepository } from "@/server/repositories/anime-repository";
import { getEffectivePosterStoragePath } from "@/server/config/runtime-settings";
import type { AnimeDeleteData } from "@/types/anime";

export class AnimeDeleteService {
  constructor(
    private readonly repository: AnimeRepository,
    private readonly customPosterStorage: CustomPosterStorage,
  ) {}

  async delete(id: number): Promise<AnimeDeleteData | null> {
    const anime = this.repository.findById(id);
    if (!anime) {
      return null;
    }

    const otherPosterPaths = anime.customPosterPath
      ? this.repository.findOtherCustomPosterPaths(id)
      : [];
    if (anime.customPosterPath) {
      await this.customPosterStorage.assertSafePath(anime.customPosterPath);
    }

    const deleted = this.repository.deleteById(id);
    if (!deleted) {
      return null;
    }

    if (anime.customPosterPath) {
      await this.customPosterStorage.removeIfUnused(
        anime.customPosterPath,
        otherPosterPaths,
      );
    }

    return { id: deleted.id };
  }

}

let animeDeleteService: AnimeDeleteService | undefined;

export function getAnimeDeleteService() {
  animeDeleteService ??= new AnimeDeleteService(
    new AnimeRepository(getDatabase()),
    new CustomPosterStorage(getEffectivePosterStoragePath()),
  );
  return animeDeleteService;
}

export function resetAnimeDeleteService(): void {
  animeDeleteService = undefined;
}
