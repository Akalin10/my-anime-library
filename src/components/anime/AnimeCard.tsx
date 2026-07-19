import { AnimePoster } from "@/components/anime/AnimePoster";
import { AnimeStatusText } from "@/components/anime/AnimeStatusText";
import type { AnimeListItem } from "@/types/anime";

import styles from "./AnimeCard.module.css";

type AnimeCardProps = {
  anime: AnimeListItem;
  onOpen: (animeId: number, trigger: HTMLButtonElement) => void;
};

export function AnimeCard({ anime, onOpen }: AnimeCardProps) {
  const title =
    anime.titleChinese ?? anime.titleNative ?? anime.titleEnglish ?? "暂无资料";

  return (
    <article className={styles.card}>
      <button
        aria-label={`查看 ${title} 详情`}
        className={styles.openButton}
        onClick={(event) => onOpen(anime.id, event.currentTarget)}
        type="button"
      >
        <AnimePoster
          customPosterPath={anime.customPosterPath}
          defaultPosterPath={anime.defaultPosterPath}
          defaultPosterUrl={anime.defaultPosterUrl}
          title={title}
        />
        <span className={styles.caption}>
          <h2>{title}</h2>
          <AnimeStatusText status={anime.status} />
        </span>
      </button>
    </article>
  );
}
