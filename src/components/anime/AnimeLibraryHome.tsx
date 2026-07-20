"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { AnimeGrid } from "@/components/anime/AnimeGrid";
import { EmptyLibraryState } from "@/components/anime/EmptyLibraryState";
import { StatusTabs } from "@/components/anime/StatusTabs";
import { ErrorState } from "@/components/common/ErrorState";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import type { ApiResponse } from "@/types/api";
import type {
  AnimeFilter,
  AnimeListData,
  AnimeSort,
} from "@/types/anime";

const AnimeDetailModal = dynamic(
  () => import("@/components/anime/AnimeDetailModal").then((m) => m.AnimeDetailModal),
);
const SearchImportModal = dynamic(
  () => import("@/components/search/SearchImportModal").then((m) => m.SearchImportModal),
);
const SettingsForm = dynamic(
  () => import("@/components/settings/SettingsForm").then((m) => m.SettingsForm),
);

import styles from "./AnimeLibraryHome.module.css";

const EMPTY_COUNTS = { all: 0, watching: 0, completed: 0 } as const;

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

export function buildAnimeListUrl(options: {
  filter: AnimeFilter;
  sort: AnimeSort;
  query: string;
}) {
  const parameters = new URLSearchParams({
    status: options.filter,
    sort: options.sort,
  });
  const query = options.query.trim();
  if (query) {
    parameters.set("query", query);
  }
  return `/api/anime?${parameters.toString()}`;
}

async function fetchAnimeList(
  options: { filter: AnimeFilter; sort: AnimeSort; query: string },
  signal: AbortSignal,
): Promise<AnimeListData> {
  const response = await fetch(buildAnimeListUrl(options), {
    cache: "no-store",
    signal,
  });
  const body = (await response.json()) as ApiResponse<AnimeListData>;

  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "读取本地动漫库失败");
  }

  return body.data;
}

export function AnimeLibraryHome() {
  const [filter, setFilter] = useState<AnimeFilter>("ALL");
  const [sort, setSort] = useState<AnimeSort>("RECENT");
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTrigger, setSearchTrigger] =
    useState<HTMLButtonElement | null>(null);
  const [detailAnimeId, setDetailAnimeId] = useState<number | null>(null);
  const [detailTrigger, setDetailTrigger] =
    useState<HTMLButtonElement | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const debouncedQuery = useDebouncedValue(query, 500);

  const animeQuery = useQuery({
    queryKey: ["local-anime", filter, sort, debouncedQuery],
    queryFn: ({ signal }) =>
      fetchAnimeList(
        { filter, sort, query: debouncedQuery },
        signal,
      ),
  });

  const counts = animeQuery.data?.counts ?? EMPTY_COUNTS;
  const isModalOpen = isSearchOpen || detailAnimeId !== null;

  function openSearch(trigger: HTMLButtonElement) {
    setSearchTrigger(trigger);
    setIsSearchOpen(true);
  }

  return (
    <div className={styles.shell}>
      <div
        aria-hidden={isModalOpen || undefined}
        className={styles.application}
        inert={isModalOpen || undefined}
      >
        <AppSidebar
          activeFilter={filter}
          counts={counts}
          onFilterChange={(nextFilter) => {
            setFilter(nextFilter);
            setIsSettingsOpen(false);
          }}
          onOpenSettings={() => {
            setIsSearchOpen(false);
            setDetailAnimeId(null);
            setIsSettingsOpen(true);
          }}
          settingsActive={isSettingsOpen}
        />

        <main className={styles.main} ref={mainRef} tabIndex={-1}>
          {isSettingsOpen ? (
            <SettingsForm />
          ) : (
            <>
              <TopBar
                onAddAnime={openSearch}
                onQueryChange={setQuery}
                onSortChange={setSort}
                query={query}
                sort={sort}
              />

              <div className={styles.filterRow}>
                <StatusTabs activeFilter={filter} onChange={setFilter} />
                <span className={styles.resultCount} aria-live="polite">
                  {animeQuery.isFetching && animeQuery.data
                    ? "正在更新……"
                    : `共 ${animeQuery.data?.items.length ?? 0} 部`}
                </span>
              </div>

              <section className={styles.content} aria-busy={animeQuery.isPending}>
                {animeQuery.isPending ? (
                  <p className={styles.message}>正在加载……</p>
                ) : animeQuery.isError ? (
                  <ErrorState
                    className={styles.error}
                    onRetry={() => animeQuery.refetch()}
                  />
                ) : counts.all === 0 ? (
                  <EmptyLibraryState onAddAnime={openSearch} />
                ) : (
                  <AnimeGrid
                    hasSearchQuery={Boolean(debouncedQuery.trim())}
                    items={animeQuery.data.items}
                    onOpen={(animeId, trigger) => {
                      setDetailTrigger(trigger);
                      setDetailAnimeId(animeId);
                    }}
                  />
                )}
              </section>
            </>
          )}
        </main>
      </div>

      {isSearchOpen ? (
        <SearchImportModal
          fallbackFocusRef={mainRef}
          onClose={() => setIsSearchOpen(false)}
          returnFocus={searchTrigger}
        />
      ) : null}

      {detailAnimeId ? (
        <AnimeDetailModal
          animeId={detailAnimeId}
          fallbackFocusRef={mainRef}
          onClose={() => setDetailAnimeId(null)}
          onSelectAnime={setDetailAnimeId}
          returnFocus={detailTrigger}
        />
      ) : null}

    </div>
  );
}
