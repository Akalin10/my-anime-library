import { AnimePoster } from "@/components/anime/AnimePoster";
import type { AnimeStatus } from "@/lib/db/schema";
import type { RelatedAnimeDetail } from "@/types/anime";

import styles from "./AnimeDetailModal.module.css";

export const RELATED_GROUP_ORDER = [
  "MAIN",
  "PREQUEL",
  "SEQUEL",
  "OVA_OAD",
  "MOVIE",
  "SPECIAL",
  "RECAP",
  "SIDE_STORY",
  "SPIN_OFF",
  "OTHER",
] as const;

export type RelatedGroupKey = (typeof RELATED_GROUP_ORDER)[number];

export const RELATED_GROUP_LABELS: Record<RelatedGroupKey, string> = {
  MAIN: "正传",
  PREQUEL: "前传",
  SEQUEL: "续作",
  OVA_OAD: "OVA / OAD",
  MOVIE: "剧场版",
  SPECIAL: "特别篇",
  RECAP: "总集篇",
  SIDE_STORY: "外传",
  SPIN_OFF: "衍生作品",
  OTHER: "其他相关作品",
};

export function groupFromRelationType(relationType: string): RelatedGroupKey {
  const value = relationType.trim().toUpperCase();

  if (value === "MAIN" || value === "正传") return "MAIN";
  if (value === "PREQUEL" || value === "前传") return "PREQUEL";
  if (value === "SEQUEL" || value === "续集" || value === "续作") {
    return "SEQUEL";
  }
  if (value === "OVA" || value === "OAD") return "OVA_OAD";
  if (value === "MOVIE" || value === "剧场版" || value === "映画") {
    return "MOVIE";
  }
  if (value === "SPECIAL" || value === "特别篇") return "SPECIAL";
  if (value === "RECAP" || value === "总集篇") return "RECAP";
  if (value === "SIDE_STORY" || value === "番外篇" || value === "外传") {
    return "SIDE_STORY";
  }
  if (value === "SPIN_OFF" || value === "衍生" || value === "衍生作品") {
    return "SPIN_OFF";
  }
  return "OTHER";
}

export function groupRelatedAnime(items: RelatedAnimeDetail[]) {
  const groups = new Map<RelatedGroupKey, RelatedAnimeDetail[]>();
  for (const item of items) {
    const key = groupFromRelationType(item.relationType);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return RELATED_GROUP_ORDER.flatMap((key) => {
    const groupedItems = groups.get(key);
    return groupedItems?.length
      ? [{ key, label: RELATED_GROUP_LABELS[key], items: groupedItems }]
      : [];
  });
}

type RelatedAnimeListProps = {
  items: RelatedAnimeDetail[];
  unavailable: boolean;
  pendingItem: RelatedAnimeDetail | null;
  importStatus: AnimeStatus;
  isImporting: boolean;
  importMessage: string | null;
  onOpenImported: (animeId: number) => void;
  onRequestImport: (anime: RelatedAnimeDetail) => void;
  onCancelImport: () => void;
  onImportStatusChange: (status: AnimeStatus) => void;
  onConfirmImport: () => void;
};

export function RelatedAnimeList({
  items,
  unavailable,
  pendingItem,
  importStatus,
  isImporting,
  importMessage,
  onOpenImported,
  onRequestImport,
  onCancelImport,
  onImportStatusChange,
  onConfirmImport,
}: RelatedAnimeListProps) {
  const groups = groupRelatedAnime(items);

  return (
    <section className={styles.relatedSection} aria-labelledby="related-anime-title">
      <div className={styles.sectionHeading}>
        <h2 id="related-anime-title">相关作品</h2>
        {unavailable ? <span>部分资料暂时无法加载</span> : null}
      </div>

      {groups.length === 0 ? (
        <p className={styles.emptyRelated}>暂无资料</p>
      ) : (
        groups.map((group) => (
          <div className={styles.relatedGroup} key={group.key}>
            <h3>{group.label}</h3>
            <div className={styles.relatedGrid}>
              {group.items.map((item) => (
                <button
                  aria-label={`${item.isImported ? "打开" : "导入"} ${item.titleChinese}`}
                  className={styles.relatedCard}
                  key={`${item.source}:${item.sourceId}`}
                  onClick={() => {
                    if (item.isImported && item.animeId) {
                      onOpenImported(item.animeId);
                    } else {
                      onRequestImport(item);
                    }
                  }}
                  type="button"
                >
                  <AnimePoster
                    customPosterPath={null}
                    defaultPosterPath={item.defaultPosterPath}
                    defaultPosterUrl={item.defaultPosterUrl}
                    title={item.titleChinese}
                  />
                  <span className={styles.relatedCopy}>
                    <strong>{item.titleChinese}</strong>
                    <span>
                      {item.year ?? "暂无年份"} · {item.mediaType ?? "暂无类型"}
                    </span>
                    <em>{item.isImported ? "已添加" : "未添加"}</em>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {pendingItem ? (
        <div className={styles.importConfirm} role="group" aria-label="导入相关作品确认">
          <div>
            <strong>导入“{pendingItem.titleChinese}”？</strong>
            <span>确认后才会写入本地动漫库。</span>
          </div>
          <label>
            状态
            <select
              disabled={isImporting}
              onChange={(event) =>
                onImportStatusChange(event.target.value as AnimeStatus)
              }
              value={importStatus}
            >
              <option value="WATCHING">在看</option>
              <option value="COMPLETED">已看</option>
            </select>
          </label>
          <div className={styles.confirmActions}>
            <button disabled={isImporting} onClick={onCancelImport} type="button">
              取消
            </button>
            <button disabled={isImporting} onClick={onConfirmImport} type="button">
              {isImporting ? "导入中…" : "确认导入"}
            </button>
          </div>
        </div>
      ) : null}

      {importMessage ? (
        <p className={styles.importMessage} role="status">
          {importMessage}
        </p>
      ) : null}
    </section>
  );
}
