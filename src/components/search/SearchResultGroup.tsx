import { SearchResultCard } from "@/components/search/SearchResultCard";
import {
  searchResultKey,
  type ImportSelection,
} from "@/components/search/search-import-model";
import type { AnimeStatus } from "@/lib/db/schema";
import type { ExternalSearchResult } from "@/types/external";

import styles from "./SearchResultGroup.module.css";

type SearchResultGroupProps = {
  label: string;
  items: ExternalSearchResult[];
  selection: ImportSelection;
  defaultStatus: AnimeStatus;
  onSelectionChange: (sourceId: string, selected: boolean) => void;
  onStatusChange: (sourceId: string, status: AnimeStatus) => void;
};

export function SearchResultGroup({
  label,
  items,
  selection,
  defaultStatus,
  onSelectionChange,
  onStatusChange,
}: SearchResultGroupProps) {
  const groupId = `search-group-${label.replace(/[\s/]+/g, "-")}`;

  return (
    <section className={styles.group} aria-labelledby={groupId}>
      <header>
        <h2 id={groupId}>{label}</h2>
        <span>{items.length} 部</span>
      </header>
      <div className={styles.grid}>
        {items.map((item) => (
          <SearchResultCard
            key={`${item.source}-${item.sourceId}`}
            onSelectedChange={(selected) =>
              onSelectionChange(searchResultKey(item), selected)
            }
            onStatusChange={(status) =>
              onStatusChange(searchResultKey(item), status)
            }
            result={item}
            selected={selection[searchResultKey(item)] !== undefined}
            status={selection[searchResultKey(item)] ?? defaultStatus}
          />
        ))}
      </div>
    </section>
  );
}
