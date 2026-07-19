import type { AnimeDetailData } from "@/types/anime";

import styles from "./AnimeDetailModal.module.css";

function valueOrFallback(value: string | number | null) {
  return value === null || value === "" ? "暂无资料" : String(value);
}

export function AnimeMetadata({ anime }: { anime: AnimeDetailData }) {
  return (
    <>
      <dl className={styles.metadata}>
        <div>
          <dt>中文名</dt>
          <dd>{valueOrFallback(anime.titleChinese)}</dd>
        </div>
        <div>
          <dt>原名</dt>
          <dd>{valueOrFallback(anime.titleNative)}</dd>
        </div>
        <div>
          <dt>年份</dt>
          <dd>{valueOrFallback(anime.year)}</dd>
        </div>
        <div>
          <dt>类型</dt>
          <dd>{valueOrFallback(anime.mediaType)}</dd>
        </div>
        <div>
          <dt>集数</dt>
          <dd>
            {anime.episodeCount === null
              ? "暂无资料"
              : `${anime.episodeCount} 集`}
          </dd>
        </div>
        <div>
          <dt>制作公司</dt>
          <dd>{valueOrFallback(anime.studio)}</dd>
        </div>
        <div>
          <dt>系列</dt>
          <dd>{valueOrFallback(anime.franchiseName)}</dd>
        </div>
      </dl>

      <section className={styles.synopsis} aria-labelledby="anime-synopsis-title">
        <h2 id="anime-synopsis-title">简介</h2>
        <p>{valueOrFallback(anime.synopsis)}</p>
      </section>
    </>
  );
}
