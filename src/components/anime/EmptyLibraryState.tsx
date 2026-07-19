import styles from "./EmptyLibraryState.module.css";

type EmptyLibraryStateProps = {
  onAddAnime: (trigger: HTMLButtonElement) => void;
};

export function EmptyLibraryState({ onAddAnime }: EmptyLibraryStateProps) {
  return (
    <section className={styles.empty} aria-labelledby="empty-library-title">
      <div className={styles.posterOutline} aria-hidden="true">
        <span />
      </div>
      <h1 id="empty-library-title">你的动漫库还是空的。</h1>
      <p>搜索并添加第一部动漫。</p>
      <button
        onClick={(event) => onAddAnime(event.currentTarget)}
        type="button"
      >
        添加动漫
      </button>
    </section>
  );
}
