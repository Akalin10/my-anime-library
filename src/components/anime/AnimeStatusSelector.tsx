import { CustomSelect } from "@/components/common/CustomSelect";
import type { AnimeStatus } from "@/lib/db/schema";

import styles from "./AnimeDetailModal.module.css";

const STATUS_OPTIONS = [
  { value: "WATCHING" as const, label: "在看" },
  { value: "COMPLETED" as const, label: "已看" },
];

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
      <label>观看状态</label>
      <div>
        <CustomSelect
          ariaLabel="观看状态"
          onChange={onChange}
          options={STATUS_OPTIONS}
          value={status}
        />
        <span aria-live="polite" className={styles.saveMessage}>
          {isSaving ? "保存中…" : isSaved ? "已保存" : ""}
        </span>
      </div>
      {error ? <p className={styles.inlineError}>{error}</p> : null}
    </div>
  );
}
