import type { AnimeSort } from "@/types/anime";

import styles from "./SortSelect.module.css";

type SortSelectProps = {
  value: AnimeSort;
  onChange: (value: AnimeSort) => void;
};

export function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <label className={styles.field}>
      <span>排序</span>
      <select
        aria-label="排序方式"
        onChange={(event) => onChange(event.target.value as AnimeSort)}
        value={value}
      >
        <option value="RECENT">最近添加</option>
        <option value="TITLE">标题</option>
        <option value="YEAR">上映年份</option>
      </select>
    </label>
  );
}
