"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { ExternalSearchInput } from "@/components/search/ExternalSearchInput";
import { ImportSelectionBar } from "@/components/search/ImportSelectionBar";
import { SearchEmptyState } from "@/components/search/SearchEmptyState";
import { SearchResultGroup } from "@/components/search/SearchResultGroup";
import { SearchSourceFailures } from "@/components/search/SearchSourceFailures";
import { createDebouncedCommitter } from "@/components/search/debounce";
import {
  buildExternalSearchUrl,
  buildImportRequest,
  groupSearchResults,
  type ImportSelection,
} from "@/components/search/search-import-model";
import type { AnimeStatus } from "@/lib/db/schema";
import type { ApiResponse } from "@/types/api";
import type {
  ExternalSearchData,
  ImportBatchRequest,
  ImportBatchResult,
} from "@/types/external";

import styles from "./SearchImportModal.module.css";

const SEARCH_DEBOUNCE_MS = 500;

type SearchImportModalProps = {
  onClose: () => void;
  returnFocus: HTMLElement | null;
  fallbackFocusRef: RefObject<HTMLElement | null>;
};

function focusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
}

async function searchExternalAnime(
  query: string,
  signal: AbortSignal,
): Promise<ExternalSearchData> {
  const response = await fetch(buildExternalSearchUrl(query), {
    cache: "no-store",
    signal,
  });
  const body = (await response.json()) as ApiResponse<ExternalSearchData>;

  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "外部搜索失败");
  }
  return body.data;
}

async function importAnime(
  request: ImportBatchRequest,
): Promise<ImportBatchResult> {
  const response = await fetch("/api/anime/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = (await response.json()) as ApiResponse<ImportBatchResult>;

  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "导入请求失败");
  }
  return body.data;
}

export function SearchImportModal({
  onClose,
  returnFocus,
  fallbackFocusRef,
}: SearchImportModalProps) {
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [draftQuery, setDraftQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [manualQuery, setManualQuery] = useState<string | null>(null);
  const [selection, setSelection] = useState<ImportSelection>({});
  const [globalStatus, setGlobalStatus] = useState<AnimeStatus>("WATCHING");
  const [importResult, setImportResult] = useState<ImportBatchResult | null>(null);

  useEffect(() => {
    const debouncer = createDebouncedCommitter(
      setDebouncedQuery,
      SEARCH_DEBOUNCE_MS,
    );
    debouncer.push(draftQuery.trim());
    return debouncer.cancel;
  }, [draftQuery]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(
    () => () => {
      window.setTimeout(() => {
        const target = returnFocus?.isConnected
          ? returnFocus
          : fallbackFocusRef.current;
        target?.focus();
      }, 0);
    },
    [fallbackFocusRef, returnFocus],
  );

  const effectiveQuery = manualQuery ?? debouncedQuery;
  const isDebouncing = draftQuery.trim() !== effectiveQuery;
  const externalQuery = useQuery({
    queryKey: ["external-search", effectiveQuery],
    queryFn: ({ signal }) => searchExternalAnime(effectiveQuery, signal),
    enabled: Boolean(effectiveQuery),
  });

  const groups = useMemo(
    () => groupSearchResults(externalQuery.data?.items ?? []),
    [externalQuery.data?.items],
  );

  const importMutation = useMutation({
    mutationFn: importAnime,
    onSuccess: async (result) => {
      setImportResult(result);
      const failedIds = new Set(
        result.items
          .filter((item) => !item.success)
          .map((item) => `${item.source}:${item.sourceId}`),
      );
      setSelection((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => failedIds.has(key)),
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["local-anime"] }),
        queryClient.invalidateQueries({ queryKey: ["external-search"] }),
      ]);
    },
  });

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !importMutation.isPending) {
        onClose();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [importMutation.isPending, onClose]);

  const selectedCount = Object.keys(selection).length;

  function changeDraftQuery(value: string) {
    setDraftQuery(value);
    setManualQuery(null);
    setSelection({});
    setImportResult(null);
    importMutation.reset();
  }

  function submitSearch() {
    const query = draftQuery.trim();
    if (!query) {
      return;
    }
    if (query === effectiveQuery) {
      void externalQuery.refetch();
    } else {
      setManualQuery(query);
    }
  }

  function changeSelection(sourceId: string, selected: boolean) {
    setImportResult(null);
    setSelection((current) => {
      if (selected) {
        return { ...current, [sourceId]: globalStatus };
      }
      const next = { ...current };
      delete next[sourceId];
      return next;
    });
  }

  function changeGlobalStatus(status: AnimeStatus) {
    setGlobalStatus(status);
    setSelection((current) =>
      Object.fromEntries(Object.keys(current).map((sourceId) => [sourceId, status])),
    );
  }

  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusables = focusableElements(dialogRef.current);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={styles.backdrop}>
      <section
        aria-labelledby="search-import-title"
        aria-modal="true"
        className={styles.modal}
        onKeyDown={trapFocus}
        ref={dialogRef}
        role="dialog"
      >
        <header className={styles.header}>
          <div>
            <p>MY ANIME LIBRARY</p>
            <h1 id="search-import-title">添加动漫</h1>
            <span>从 Bangumi、AniList 与 TMDB 搜索并导入到本地动漫库。</span>
          </div>
          <button
            aria-label="关闭"
            className={styles.closeButton}
            disabled={importMutation.isPending}
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.searchPane}>
            <ExternalSearchInput
              inputRef={searchInputRef}
              onChange={changeDraftQuery}
              onSearch={submitSearch}
              value={draftQuery}
            />

            <div className={styles.results} aria-busy={externalQuery.isFetching}>
              <SearchSourceFailures
                onRetry={() => externalQuery.refetch()}
                sources={externalQuery.data?.sources ?? []}
              />

              {!draftQuery.trim() ? (
                <SearchEmptyState kind="idle" />
              ) : isDebouncing || externalQuery.isPending || externalQuery.isFetching ? (
                <SearchEmptyState kind="loading" />
              ) : externalQuery.isError ? (
                <SearchEmptyState
                  kind="error"
                  onRetry={() => externalQuery.refetch()}
                />
              ) : groups.length === 0 &&
                externalQuery.data?.sources.some(
                  ({ status }) => status === "SUCCESS",
                ) ? (
                <SearchEmptyState kind="empty" />
              ) : groups.length > 0 ? (
                groups.map((group) => (
                  <SearchResultGroup
                    defaultStatus={globalStatus}
                    items={group.items}
                    key={group.key}
                    label={group.label}
                    onSelectionChange={changeSelection}
                    onStatusChange={(key, status) =>
                      setSelection((current) => ({
                        ...current,
                        [key]: status,
                      }))
                    }
                    selection={selection}
                  />
                ))
              ) : null}
            </div>
          </div>

          <ImportSelectionBar
            isImporting={importMutation.isPending}
            onClear={() => setSelection({})}
            onImport={() =>
              importMutation.mutate(
                buildImportRequest(
                  selection,
                  globalStatus,
                  externalQuery.data?.items,
                ),
              )
            }
            onStatusChange={changeGlobalStatus}
            requestError={
              importMutation.isError
                ? importMutation.error.message
                : null
            }
            result={importResult}
            selectedCount={selectedCount}
            status={globalStatus}
          />
        </div>
      </section>
    </div>
  );
}
