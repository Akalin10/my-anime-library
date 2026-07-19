import { AnimeCard } from "@/components/anime/AnimeCard";
import type { AnimeListItem } from "@/types/anime";

import styles from "./AnimeGrid.module.css";

type AnimeGridProps = {
  items: AnimeListItem[];
  hasSearchQuery: boolean;
  onOpen: (animeId: number, trigger: HTMLButtonElement) => void;
};

export function AnimeGrid({ items, hasSearchQuery, onOpen }: AnimeGridProps) {
  if (items.length === 0) {
    return (
      <div className={styles.noResults}>
        <p>没有找到相关动漫。</p>
        {hasSearchQuery ? <span>可以尝试使用其他语言名称搜索。</span> : null}
      </div>
    );
  }

  return (
    <div className={styles.grid} aria-label="动漫海报墙">
      {items.map((anime) => (
        <AnimeCard anime={anime} key={anime.id} onOpen={onOpen} />
      ))}
    </div>
  );
}
