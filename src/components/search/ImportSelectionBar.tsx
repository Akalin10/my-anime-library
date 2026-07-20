import { CustomSelect } from "@/components/common/CustomSelect";
import type { AnimeStatus } from "@/lib/db/schema";
import { ANIME_SOURCES, SOURCE_LABELS } from "@/lib/sources/types";
import type { ImportBatchResult } from "@/types/external";

import styles from "./ImportSelectionBar.module.css";

const STATUS_OPTIONS = [
  { value: "WATCHING" as const, label: "在看" },
  { value: "COMPLETED" as const, label: "已看完" },
];

const SOURCE_FILTER_OPTIONS = [
  { value: "", label: "全部数据源" },
  ...ANIME_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] })),
];

type ImportSelectionBarProps = {
  selectedCount: number;
  status: AnimeStatus;
  isImporting: boolean;
  result: ImportBatchResult | null;
  requestError: string | null;
  selectedSources: string[];
  onSourcesChange: (sources: string[]) => void;
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
  selectedSources,
  onSourcesChange,
  onStatusChange,
  onClear,
  onImport,
}: ImportSelectionBarProps) {
  const currentSource = selectedSources.length > 0 ? selectedSources[0] : "";

  return (
    <aside className={styles.bar} aria-label="导入选择">
      <label className={styles.sourceFilter}>
        <span>数据源</span>
        <CustomSelect
          ariaLabel="筛选数据源"
          onChange={(value) => onSourcesChange(value ? [value] : [])}
          options={SOURCE_FILTER_OPTIONS}
          value={currentSource}
        />
      </label>

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
        <CustomSelect
          ariaLabel="统一设置状态"
          onChange={onStatusChange}
          options={STATUS_OPTIONS}
          value={status}
        />
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
