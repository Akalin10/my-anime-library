import { getDatabase } from "@/lib/db/client";
import { AnimeRepository } from "@/server/repositories/anime-repository";
import type {
  AnimeDetail,
  AnimeListData,
  AnimeListItem,
  AnimeListQuery,
} from "@/types/anime";

function toListItem(
  row: ReturnType<AnimeRepository["list"]>[number],
): AnimeListItem {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetail(
  row: NonNullable<ReturnType<AnimeRepository["findById"]>>,
): AnimeDetail {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class AnimeReadService {
  constructor(private readonly repository: AnimeRepository) {}

  list(options: AnimeListQuery): AnimeListData {
    return {
      items: this.repository.list(options).map(toListItem),
      counts: this.repository.countByStatus(),
    };
  }

  getById(id: number): AnimeDetail | null {
    const row = this.repository.findById(id);
    return row ? toDetail(row) : null;
  }
}

let animeReadService: AnimeReadService | undefined;

export function getAnimeReadService() {
  animeReadService ??= new AnimeReadService(new AnimeRepository(getDatabase()));
  return animeReadService;
}
