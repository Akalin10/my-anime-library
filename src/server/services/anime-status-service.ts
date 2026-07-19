import { getDatabase } from "@/lib/db/client";
import type { AnimeStatus } from "@/lib/db/schema";
import { AnimeRepository } from "@/server/repositories/anime-repository";
import type { AnimeStatusUpdateData } from "@/types/anime";

export class AnimeStatusService {
  constructor(private readonly repository: AnimeRepository) {}

  update(id: number, status: AnimeStatus): AnimeStatusUpdateData | null {
    const row = this.repository.updateStatus(id, status);
    return row
      ? { ...row, updatedAt: row.updatedAt.toISOString() }
      : null;
  }
}

let animeStatusService: AnimeStatusService | undefined;

export function getAnimeStatusService() {
  animeStatusService ??= new AnimeStatusService(
    new AnimeRepository(getDatabase()),
  );
  return animeStatusService;
}
