import type { AnimeStatus } from "@/lib/db/schema";

import styles from "./AnimeDetailModal.module.css";

type AnimeStatusSelectorProps = {
  status: AnimeStatus;
  isSaving: boolean;
  isSaved: boolean;
  error: string | null;
  onChange: (status: AnimeStatus) => void;
};

export function AnimeStatusSelector({
  status,
  isSaving,
  isSaved,
  error,
  onChange,
}: AnimeStatusSelectorProps) {
  return (
    <div className={styles.statusControl}>
      <label htmlFor="anime-detail-status">观看状态</label>
      <div>
        <select
          disabled={isSaving}
          id="anime-detail-status"
          onChange={(event) => onChange(event.target.value as AnimeStatus)}
          value={status}
        >
          <option value="WATCHING">在看</option>
          <option value="COMPLETED">已看</option>
        </select>
        <span aria-live="polite" className={styles.saveMessage}>
          {isSaving ? "保存中…" : isSaved ? "已保存" : ""}
        </span>
      </div>
      {error ? <p className={styles.inlineError}>{error}</p> : null}
    </div>
  );
}
