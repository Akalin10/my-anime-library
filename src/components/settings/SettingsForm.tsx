"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { ANIME_SOURCES, SOURCE_LABELS, type AnimeSource } from "@/lib/sources/types";
import type { ApiResponse } from "@/types/api";
import type {
  SearchCacheClearData,
  SettingsData,
  SettingsUpdateInput,
  SourceAvailability,
} from "@/types/settings";

import styles from "./SettingsForm.module.css";

async function getApiData<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "读取设置失败。");
  }
  return body.data;
}

async function saveSettings(input: SettingsUpdateInput): Promise<SettingsData> {
  const response = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as ApiResponse<SettingsData>;
  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "保存设置失败。");
  }
  return body.data;
}

async function clearSearchCache(): Promise<SearchCacheClearData> {
  const response = await fetch("/api/settings/cache", { method: "DELETE" });
  const body = (await response.json()) as ApiResponse<SearchCacheClearData>;
  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "清理搜索缓存失败。");
  }
  return body.data;
}

export function SettingsForm() {
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => getApiData<SettingsData>("/api/settings"),
  });
  const sourcesQuery = useQuery({
    queryKey: ["source-status"],
    queryFn: () => getApiData<SourceAvailability[]>("/api/sources"),
  });

  if (settingsQuery.isPending || sourcesQuery.isPending) {
    return <p className={styles.message}>正在读取设置……</p>;
  }
  if (settingsQuery.isError || sourcesQuery.isError) {
    return (
      <ErrorState
        className={styles.message}
        onRetry={() => {
            void settingsQuery.refetch();
            void sourcesQuery.refetch();
        }}
      />
    );
  }

  return (
    <SettingsEditor
      key={JSON.stringify(settingsQuery.data)}
      initialSettings={settingsQuery.data}
      sources={sourcesQuery.data}
    />
  );
}

export function SettingsEditor({
  initialSettings,
  sources,
}: {
  initialSettings: SettingsData;
  sources: SourceAvailability[];
}) {
  const queryClient = useQueryClient();
  const [enabledSources, setEnabledSources] = useState<AnimeSource[]>(
    initialSettings.enabledSources,
  );
  const [sourcePriority, setSourcePriority] = useState<AnimeSource[]>(
    initialSettings.sourcePriority,
  );
  const [posterStoragePath, setPosterStoragePath] = useState(
    initialSettings.posterStoragePath,
  );

  const saveMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: async (data) => {
      queryClient.setQueryData(["settings"], data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["source-status"] }),
        queryClient.invalidateQueries({ queryKey: ["external-search"] }),
      ]);
    },
  });
  const cacheMutation = useMutation({
    mutationFn: clearSearchCache,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["external-search"] });
    },
  });

  function toggleSource(source: AnimeSource) {
    setEnabledSources((current) =>
      current.includes(source)
        ? current.filter((item) => item !== source)
        : ANIME_SOURCES.filter(
            (candidate) => candidate === source || current.includes(candidate),
          ),
    );
    saveMutation.reset();
  }

  function changePriority(index: number, source: AnimeSource) {
    setSourcePriority((current) => {
      const otherIndex = current.indexOf(source);
      if (otherIndex === index || otherIndex < 0) return current;
      const next = [...current];
      [next[index], next[otherIndex]] = [next[otherIndex], next[index]];
      return next;
    });
    saveMutation.reset();
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p>LOCAL PREFERENCES</p>
        <h1>设置</h1>
        <span>只保存本机运行所需的非敏感配置。</span>
      </header>

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate({
            enabledSources,
            sourcePriority,
            posterStoragePath,
          });
        }}
      >
        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>启用的数据源</h2>
            <p>只向已启用且当前可用的数据源发起搜索。</p>
          </div>
          <div className={styles.sourceList}>
            {sources.map((source) => (
              <label className={styles.sourceRow} key={source.source}>
                <input
                  checked={enabledSources.includes(source.source)}
                  disabled={saveMutation.isPending}
                  onChange={() => toggleSource(source.source)}
                  type="checkbox"
                />
                <span>
                  <strong>{source.label}</strong>
                  <small data-available={source.available}>
                    {source.available ? "当前可用" : "当前不可用"}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>默认数据源优先级</h2>
            <p>确定同一作品合并时优先采用哪个来源的资料。</p>
          </div>
          <div className={styles.priorityList}>
            {sourcePriority.map((source, index) => (
              <label key={`${index}-${source}`}>
                <span>第 {index + 1} 优先</span>
                <select
                  disabled={saveMutation.isPending}
                  onChange={(event) =>
                    changePriority(index, event.target.value as AnimeSource)
                  }
                  value={source}
                >
                  {ANIME_SOURCES.map((option) => (
                    <option key={option} value={option}>
                      {SOURCE_LABELS[option]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>API 配置方式</h2>
            <p>敏感密钥只从服务端环境变量读取，不会保存到数据库或发送到浏览器。</p>
          </div>
          <div className={styles.environmentList}>
            {sources.flatMap((source) =>
              source.environment.map((variable) => (
                <div className={styles.environmentRow} key={variable.name}>
                  <code>{variable.name}</code>
                  <span data-configured={variable.configured}>
                    {variable.configured ? "已配置" : "未配置"}
                  </span>
                </div>
              )),
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>海报本地保存目录</h2>
            <p>保存后，后续导入、上传和海报读取都会使用该目录。</p>
          </div>
          <label className={styles.pathField}>
            <span>目录路径</span>
            <input
              disabled={saveMutation.isPending}
              maxLength={500}
              onChange={(event) => {
                setPosterStoragePath(event.target.value);
                saveMutation.reset();
              }}
              required
              type="text"
              value={posterStoragePath}
            />
          </label>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>本地位置</h2>
            <p>数据库位置只供查看；修改数据库路径需要调整服务端环境变量并重启。</p>
          </div>
          <div className={styles.databasePath}>
            <span>SQLite 数据库</span>
            <code>{initialSettings.databasePath}</code>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>搜索缓存</h2>
            <p>清理后，相同关键词的下一次搜索会重新请求已启用的数据源。</p>
          </div>
          <div className={styles.cacheAction}>
            <button
              disabled={cacheMutation.isPending}
              onClick={() => cacheMutation.mutate()}
              type="button"
            >
              {cacheMutation.isPending ? "正在清理……" : "清理搜索缓存"}
            </button>
            <span aria-live="polite">
              {cacheMutation.isSuccess
                ? "搜索缓存已清理。"
                : cacheMutation.isError
                  ? cacheMutation.error.message
                  : null}
            </span>
          </div>
        </section>

        <footer className={styles.footer}>
          <p aria-live="polite">
            {saveMutation.isSuccess
              ? "设置已保存并生效。"
              : saveMutation.isError
                ? saveMutation.error.message
                : null}
          </p>
          <button
            className={styles.saveButton}
            disabled={saveMutation.isPending || !posterStoragePath.trim()}
            type="submit"
          >
            {saveMutation.isPending ? "正在保存……" : "保存设置"}
          </button>
        </footer>
      </form>
    </div>
  );
}
