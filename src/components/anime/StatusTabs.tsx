import type { AnimeFilter } from "@/types/anime";

import styles from "./StatusTabs.module.css";

type StatusTabsProps = {
  activeFilter: AnimeFilter;
  onChange: (filter: AnimeFilter) => void;
};

const STATUS_FILTERS: Array<{ value: AnimeFilter; label: string }> = [
  { value: "ALL", label: "全部" },
  { value: "WATCHING", label: "在看" },
  { value: "COMPLETED", label: "已看完" },
];

export function StatusTabs({ activeFilter, onChange }: StatusTabsProps) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="按状态筛选">
      {STATUS_FILTERS.map(({ value, label }) => (
        <button
          aria-selected={activeFilter === value}
          className={styles.tab}
          data-active={activeFilter === value}
          key={value}
          onClick={() => onChange(value)}
          role="tab"
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
