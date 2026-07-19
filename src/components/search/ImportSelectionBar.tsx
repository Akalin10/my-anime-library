import type { AnimeStatus } from "@/lib/db/schema";
import type { ImportBatchResult } from "@/types/external";

import styles from "./ImportSelectionBar.module.css";

type ImportSelectionBarProps = {
  selectedCount: number;
  status: AnimeStatus;
  isImporting: boolean;
  result: ImportBatchResult | null;
  requestError: string | null;
  onStatusChange: (status: AnimeStatus) => void;
  onClear: () => void;
  onImport: () => void;
};

export function ImportSelectionBar({
  selectedCount,
  status,
  isImporting,
  result,
  requestError,
  onStatusChange,
  onClear,
  onImport,
}: ImportSelectionBarProps) {
  return (
    <aside className={styles.bar} aria-label="导入选择">
      <div className={styles.summary}>
        <strong>已选择 {selectedCount} 部</strong>
        <button
          disabled={selectedCount === 0 || isImporting}
          onClick={onClear}
          type="button"
        >
          取消选择
        </button>
      </div>

      <label className={styles.globalStatus}>
        <span>统一设置状态</span>
        <select
          disabled={isImporting}
          onChange={(event) =>
            onStatusChange(event.target.value as AnimeStatus)
          }
          value={status}
        >
          <option value="WATCHING">在看</option>
          <option value="COMPLETED">已看完</option>
        </select>
      </label>


      <button
        className={styles.importButton}
        disabled={selectedCount === 0 || isImporting}
        onClick={onImport}
        type="button"
      >
        {isImporting ? "正在导入……" : "导入选中作品"}
      </button>

      {result ? (
        <div className={styles.result} aria-live="polite">
          <strong>导入完成</strong>
          <span>成功导入 {result.successCount} 部作品</span>
          <span>失败 {result.failureCount} 部作品</span>
          {result.items
            .filter((item) => !item.success)
            .map((item) => (
              <p key={`${item.source}-${item.sourceId}`}>
                {item.titleChinese ?? item.titleNative ?? "暂无资料"}：
                {item.error.message}
              </p>
            ))}
        </div>
      ) : null}

      {requestError ? (
        <p className={styles.requestError} role="alert">
          导入失败：{requestError}
        </p>
      ) : null}
    </aside>
  );
}
