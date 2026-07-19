import type { ExternalSourceState } from "@/types/external";

import styles from "./SearchSourceFailures.module.css";

type SearchSourceFailuresProps = {
  sources: ExternalSourceState[];
  onRetry: () => void;
};

export function SearchSourceFailures({
  sources,
  onRetry,
}: SearchSourceFailuresProps) {
  const failures = sources.filter(({ status }) => status === "ERROR");
  if (failures.length === 0) return null;

  return (
    <div aria-live="polite" className={styles.list} aria-label="数据源状态">
      {failures.map((source) => (
        <div className={styles.item} key={source.source}>
          <p>{source.message}</p>
          <button onClick={onRetry} type="button">
            重试 {source.label}
          </button>
        </div>
      ))}
    </div>
  );
}
