"use client";

import { useState } from "react";

import { CustomSelect } from "@/components/common/CustomSelect";
import type { AnimeStatus } from "@/lib/db/schema";

const CARD_STATUS_OPTIONS = [
  { value: "WATCHING" as const, label: "在看" },
  { value: "COMPLETED" as const, label: "已看完" },
];
import { getSourceLabel } from "@/lib/sources/types";
import type { ExternalSearchResult } from "@/types/external";

import styles from "./SearchResultCard.module.css";

const PLACEHOLDER_URL = "/placeholders/anime-poster.svg";

type SearchResultCardProps = {
  result: ExternalSearchResult;
  selected: boolean;
  status: AnimeStatus;
  onSelectedChange: (selected: boolean) => void;
  onStatusChange: (status: AnimeStatus) => void;
};

function displayTitle(result: ExternalSearchResult) {
  return (
    result.titleChinese ??
    result.titleNative ??
    result.titleEnglish ??
    "暂无资料"
  );
}

export function SearchResultCard({
  result,
  selected,
  status,
  onSelectedChange,
  onStatusChange,
}: SearchResultCardProps) {
  const title = displayTitle(result);
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  const poster =
    result.posterUrl && result.posterUrl !== failedPoster
      ? result.posterUrl
      : PLACEHOLDER_URL;

  return (
    <article className={styles.card} data-selected={selected || undefined}>
      <div className={styles.poster}>
        {/* Search results use the source poster until import stores it locally. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`${title}海报`}
          decoding="async"
          loading="lazy"
          onError={() => {
            if (poster !== PLACEHOLDER_URL) {
              setFailedPoster(poster);
            }
          }}
          src={poster}
        />
      </div>

      <div className={styles.content}>
        <div className={styles.headingRow}>
          <div>
            <h3>{title}</h3>
            <p className={styles.nativeTitle}>
              {result.titleNative ?? "暂无资料"}
            </p>
          </div>
          <span className={styles.importState} data-imported={result.isImported}>
            {result.isImported ? "已添加" : "未添加"}
          </span>
        </div>

        <dl className={styles.metadata}>
          <div>
            <dt>年份</dt>
            <dd>{result.year ?? "暂无资料"}</dd>
          </div>
          <div>
            <dt>类型</dt>
            <dd>{result.mediaType ?? "暂无资料"}</dd>
          </div>
          <div>
            <dt>总集数</dt>
            <dd>
              {result.episodeCount === null
                ? "暂无资料"
                : `${result.episodeCount} 集`}
            </dd>
          </div>
          <div>
            <dt>数据来源</dt>
            <dd>
              {result.sourceReferences
                .map(({ source }) => getSourceLabel(source))
                .filter((value, index, values) => values.indexOf(value) === index)
                .join(" / ")}
            </dd>
          </div>
        </dl>

        <div className={styles.controls}>
          <label className={styles.checkboxLabel}>
            <input
              checked={selected}
              disabled={result.isImported}
              onChange={(event) => onSelectedChange(event.target.checked)}
              type="checkbox"
            />
            <span>{result.isImported ? "已导入" : "选择导入"}</span>
          </label>

          {selected ? (
            <label className={styles.statusField}>
              <span>导入状态</span>
              <CustomSelect
                ariaLabel={`${title}的导入状态`}
                onChange={onStatusChange}
                options={CARD_STATUS_OPTIONS}
                value={status}
              />
            </label>
          ) : null}
        </div>
      </div>
    </article>
  );
}
