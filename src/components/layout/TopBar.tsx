import { LocalSearchInput } from "@/components/anime/LocalSearchInput";
import { SortSelect } from "@/components/anime/SortSelect";
import type { AnimeSort } from "@/types/anime";

import styles from "./TopBar.module.css";

type TopBarProps = {
  query: string;
  onQueryChange: (query: string) => void;
  sort: AnimeSort;
  onSortChange: (sort: AnimeSort) => void;
  onAddAnime: (trigger: HTMLButtonElement) => void;
};

export function TopBar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  onAddAnime,
}: TopBarProps) {
  return (
    <header className={styles.topBar}>
      <LocalSearchInput value={query} onChange={onQueryChange} />
      <div className={styles.actions}>
        <SortSelect value={sort} onChange={onSortChange} />
        <button
          className={styles.addButton}
          onClick={(event) => onAddAnime(event.currentTarget)}
          type="button"
        >
          + 添加动漫
        </button>
      </div>
    </header>
  );
}
