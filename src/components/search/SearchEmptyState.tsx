import { ErrorState } from "@/components/common/ErrorState";

import styles from "./SearchEmptyState.module.css";

type SearchEmptyStateProps =
  | { kind: "idle" | "empty" | "loading" }
  | { kind: "error"; onRetry: () => void };

export function SearchEmptyState(props: SearchEmptyStateProps) {
  if (props.kind === "loading") {
    return (
      <div className={styles.state} aria-live="polite">
        <span className={styles.marker} aria-hidden="true" />
        <p>正在搜索……</p>
      </div>
    );
  }

  if (props.kind === "error") {
    return <ErrorState className={styles.state} onRetry={props.onRetry} />;
  }

  return (
    <div className={styles.state}>
      <span className={styles.marker} aria-hidden="true" />
      {props.kind === "empty" ? (
        <>
          <h2>没有找到相关动漫。</h2>
          <p>可以尝试使用其他语言名称搜索。</p>
        </>
      ) : (
        <>
          <h2>搜索并添加动漫</h2>
          <p>输入中文名、日文名、英文名或别名。</p>
        </>
      )}
    </div>
  );
}
