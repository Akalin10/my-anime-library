"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CustomSelect } from "@/components/common/CustomSelect";
import { ErrorState } from "@/components/common/ErrorState";
import {
  isBuiltinSource,
  type CustomSourceConfig,
} from "@/lib/sources/types";
import type { ApiResponse } from "@/types/api";
import type {
  SearchCacheClearData,
  SettingsData,
  SettingsUpdateInput,
  SourceAvailability,
  ThemeMode,
} from "@/types/settings";

import styles from "./SettingsForm.module.css";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function resolveTheme(t: ThemeMode): "light" | "dark" {
  if (t === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return t;
}

function applyTheme(t: ThemeMode) {
  const resolved = resolveTheme(t);
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem("theme", t);
  } catch {
    /* ignore */
  }
}

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

const THEME_OPTIONS = [
  { value: "light", label: "浅色模式" },
  { value: "dark", label: "深色模式" },
  { value: "system", label: "跟随系统" },
] as const;

export function SettingsEditor({
  initialSettings,
  sources,
}: {
  initialSettings: SettingsData;
  sources: SourceAvailability[];
}) {
  const queryClient = useQueryClient();
  const [enabledSources, setEnabledSources] = useState<string[]>(
    initialSettings.enabledSources,
  );
  const [sourcePriority, setSourcePriority] = useState<string[]>(
    initialSettings.sourcePriority,
  );
  const [customSources, setCustomSources] = useState<CustomSourceConfig[]>(
    initialSettings.customSources ?? [],
  );
  const [posterStoragePath, setPosterStoragePath] = useState(
    initialSettings.posterStoragePath,
  );
  const [theme, setTheme] = useState<ThemeMode>(
    initialSettings.theme ?? "light",
  );

  const [showAddForm, setShowAddForm] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");

  const saveMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: async (data) => {
      queryClient.setQueryData(["settings"], data);
      try {
        localStorage.setItem("theme", data.theme);
      } catch {
        /* ignore */
      }
      document.documentElement.dataset.theme = resolveTheme(data.theme);
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

  // Watch system theme changes
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    };
    document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const handleThemeChange = useCallback(
    (value: string) => {
      const t = value as ThemeMode;
      setTheme(t);
      applyTheme(t);
      saveMutation.reset();
    },
    [saveMutation],
  );

  const allSources = useMemo<SourceAvailability[]>(() => {
    const customEntries: SourceAvailability[] = customSources.map((cs) => ({
      source: cs.id,
      label: cs.name,
      enabled: enabledSources.includes(cs.id),
      available: true,
      environment: [
        { name: cs.apiUrl, configured: true, sensitive: false },
      ],
    }));
    return [...sources, ...customEntries];
  }, [sources, customSources, enabledSources]);

  function toggleSource(source: string) {
    setEnabledSources((current) =>
      current.includes(source)
        ? current.filter((item) => item !== source)
        : [...current, source],
    );
    saveMutation.reset();
  }

  function changePriority(index: number, source: string) {
    setSourcePriority((current) => {
      const otherIndex = current.indexOf(source);
      if (otherIndex === index || otherIndex < 0) return current;
      const next = [...current];
      [next[index], next[otherIndex]] = [next[otherIndex], next[index]];
      return next;
    });
    saveMutation.reset();
  }

  function addCustomSource() {
    const trimmedName = newSourceName.trim();
    const trimmedUrl = newSourceUrl.trim();
    if (!trimmedName || !trimmedUrl) return;

    const id = slugify(trimmedName);
    if (!id) return;

    // Prevent duplicate IDs
    if (
      isBuiltinSource(id) ||
      customSources.some((cs) => cs.id === id)
    ) {
      return;
    }

    const newSource: CustomSourceConfig = {
      id,
      name: trimmedName,
      apiUrl: trimmedUrl,
    };
    setCustomSources((prev) => [...prev, newSource]);
    setEnabledSources((prev) => [...prev, id]);
    setSourcePriority((prev) => [...prev, id]);
    setNewSourceName("");
    setNewSourceUrl("");
    setShowAddForm(false);
    saveMutation.reset();
  }

  function deleteCustomSource(id: string) {
    setCustomSources((prev) => prev.filter((cs) => cs.id !== id));
    setEnabledSources((prev) => prev.filter((s) => s !== id));
    setSourcePriority((prev) => prev.filter((s) => s !== id));
    saveMutation.reset();
  }

  const priorityOptions = useMemo(
    () =>
      allSources.map((s) => ({
        value: s.source,
        label: s.label,
      })),
    [allSources],
  );

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
            customSources,
            posterStoragePath,
            theme,
          });
        }}
      >
        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>外观</h2>
            <p>切换全局界面的浅色、深色主题，或跟随系统设置。</p>
          </div>
          <div className={styles.themeSelect}>
            <CustomSelect
              ariaLabel="主题模式"
              options={THEME_OPTIONS}
              value={theme}
              onChange={handleThemeChange}
            />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>启用的数据源</h2>
            <p>只向已启用且当前可用的数据源发起搜索。</p>
          </div>
          <div className={styles.sourceList}>
            {allSources.map((source) => (
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
                {!isBuiltinSource(source.source) && (
                  <button
                    className={styles.deleteSourceButton}
                    disabled={saveMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      deleteCustomSource(source.source);
                    }}
                    type="button"
                    aria-label={`删除 ${source.label}`}
                    title={`删除 ${source.label}`}
                  >
                    ✕
                  </button>
                )}
              </label>
            ))}
          </div>

          {showAddForm ? (
            <div className={styles.customSourceForm}>
              <input
                className={styles.customSourceInput}
                maxLength={100}
                onChange={(e) => setNewSourceName(e.target.value)}
                placeholder="数据源名称（如 My API）"
                type="text"
                value={newSourceName}
              />
              <input
                className={styles.customSourceInput}
                maxLength={500}
                onChange={(e) => setNewSourceUrl(e.target.value)}
                placeholder="API 地址（如 https://api.example.com）"
                type="url"
                value={newSourceUrl}
              />
              <div className={styles.customSourceActions}>
                <button
                  className={styles.addSourceConfirm}
                  disabled={!newSourceName.trim() || !newSourceUrl.trim()}
                  onClick={(e) => {
                    e.preventDefault();
                    addCustomSource();
                  }}
                  type="button"
                >
                  确认添加
                </button>
                <button
                  className={styles.addSourceCancel}
                  onClick={(e) => {
                    e.preventDefault();
                    setShowAddForm(false);
                    setNewSourceName("");
                    setNewSourceUrl("");
                  }}
                  type="button"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              className={styles.addSourceButton}
              disabled={saveMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                setShowAddForm(true);
              }}
              type="button"
            >
              + 添加自定义数据源
            </button>
          )}
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
                <CustomSelect
                  ariaLabel={`第 ${index + 1} 优先数据源`}
                  onChange={(value) => changePriority(index, value as string)}
                  options={priorityOptions}
                  value={source}
                />
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
