"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";

import { AnimeMetadata } from "@/components/anime/AnimeMetadata";
import { AnimePoster } from "@/components/anime/AnimePoster";
import { AnimeStatusSelector } from "@/components/anime/AnimeStatusSelector";
import { PosterManagerModal } from "@/components/anime/PosterManagerModal";
import { RelatedAnimeList } from "@/components/anime/RelatedAnimeList";
import { ErrorState } from "@/components/common/ErrorState";
import { ConfirmDialog } from "@/components/modal/ConfirmDialog";
import { buildImportRequest } from "@/components/search/search-import-model";
import type { AnimeStatus } from "@/lib/db/schema";
import type { ApiResponse } from "@/types/api";
import type {
  AnimeDeleteData,
  AnimeDetailData,
  AnimeListData,
  AnimePosterUpdateData,
  AnimeStatusUpdateData,
  RelatedAnimeDetail,
} from "@/types/anime";
import type { ImportBatchRequest, ImportBatchResult } from "@/types/external";

import styles from "./AnimeDetailModal.module.css";

async function fetchAnimeDetail(
  animeId: number,
  signal: AbortSignal,
): Promise<AnimeDetailData> {
  const response = await fetch(`/api/anime/${animeId}`, {
    cache: "no-store",
    signal,
  });
  const body = (await response.json()) as ApiResponse<AnimeDetailData>;

  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "读取动漫详情失败。");
  }
  return body.data;
}

async function updateAnimeStatus(input: {
  animeId: number;
  status: AnimeStatus;
}): Promise<AnimeStatusUpdateData> {
  const response = await fetch(`/api/anime/${input.animeId}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: input.status }),
  });
  const body = (await response.json()) as ApiResponse<AnimeStatusUpdateData>;

  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "保存观看状态失败。");
  }
  return body.data;
}

async function deleteAnime(animeId: number): Promise<AnimeDeleteData> {
  const response = await fetch(`/api/anime/${animeId}`, {
    method: "DELETE",
  });
  const body = (await response.json()) as ApiResponse<AnimeDeleteData>;

  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "删除本地动漫失败。");
  }
  return body.data;
}

async function importRelatedAnime(
  request: ImportBatchRequest,
): Promise<ImportBatchResult> {
  const response = await fetch("/api/anime/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = (await response.json()) as ApiResponse<ImportBatchResult>;

  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "导入相关作品失败。");
  }
  return body.data;
}

function focusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
}

type AnimeDetailModalProps = {
  animeId: number;
  returnFocus: HTMLElement | null;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSelectAnime: (animeId: number) => void;
};

export function AnimeDetailModal({
  animeId,
  returnFocus,
  fallbackFocusRef,
  onClose,
  onSelectAnime,
}: AnimeDetailModalProps) {
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [pendingRelated, setPendingRelated] =
    useState<RelatedAnimeDetail | null>(null);
  const [importStatus, setImportStatus] = useState<AnimeStatus>("WATCHING");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPosterOpen, setIsPosterOpen] = useState(false);
  const [posterTrigger, setPosterTrigger] =
    useState<HTMLButtonElement | null>(null);

  const detailQuery = useQuery({
    queryKey: ["anime-detail", animeId],
    queryFn: ({ signal }) => fetchAnimeDetail(animeId, signal),
  });

  const statusMutation = useMutation({
    mutationFn: updateAnimeStatus,
    onMutate: () => {
      setIsSaved(false);
    },
    onSuccess: async (updated, variables) => {
      queryClient.setQueryData<AnimeDetailData>(
        ["anime-detail", variables.animeId],
        (current) => (current ? { ...current, status: updated.status } : current),
      );
      setIsSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["local-anime"] });
    },
  });

  const importMutation = useMutation({
    mutationFn: importRelatedAnime,
    onSuccess: async (result) => {
      const item = result.items[0];
      if (!item?.success) {
        setImportMessage(item?.error.message ?? "导入相关作品失败。");
        return;
      }

      setImportMessage("已导入到本地动漫库。");
      setPendingRelated(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["local-anime"] }),
        queryClient.invalidateQueries({ queryKey: ["anime-detail", animeId] }),
      ]);
    },
    onError: (error) => {
      setImportMessage(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAnime,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["local-anime"] });
      queryClient.removeQueries({ queryKey: ["anime-detail", animeId] });
      await queryClient.invalidateQueries({
        queryKey: ["anime-detail"],
        refetchType: "none",
      });
      setIsDeleteOpen(false);
      onClose();
    },
  });

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [animeId]);

  useEffect(() => {
    if (!isSaved) return;
    const timer = window.setTimeout(() => setIsSaved(false), 1600);
    return () => window.clearTimeout(timer);
  }, [isSaved]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isDeleteOpen && !isPosterOpen) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isDeleteOpen, isPosterOpen, onClose]);

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

  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (
      isDeleteOpen ||
      isPosterOpen ||
      event.key !== "Tab" ||
      !dialogRef.current
    ) return;
    const focusables = focusableElements(dialogRef.current);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const anime = detailQuery.data;
  const title = anime
    ? anime.titleChinese ?? anime.titleNative ?? anime.titleEnglish ?? "暂无资料"
    : "动漫详情";

  function applyPosterUpdate(updated: AnimePosterUpdateData) {
    queryClient.setQueryData<AnimeDetailData>(
      ["anime-detail", updated.id],
      (current) =>
        current
          ? {
              ...current,
              customPosterPath: updated.customPosterPath,
              defaultPosterPath: updated.defaultPosterPath,
              defaultPosterUrl: updated.defaultPosterUrl,
              updatedAt: updated.updatedAt,
            }
          : current,
    );
    queryClient.setQueriesData<AnimeListData>(
      { queryKey: ["local-anime"] },
      (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id
                  ? {
                      ...item,
                      customPosterPath: updated.customPosterPath,
                      defaultPosterPath: updated.defaultPosterPath,
                      defaultPosterUrl: updated.defaultPosterUrl,
                    }
                  : item,
              ),
            }
          : current,
    );
    void queryClient.invalidateQueries({ queryKey: ["local-anime"] });
  }

  return (
    <>
      <div
        aria-hidden={isDeleteOpen || isPosterOpen || undefined}
        className={styles.backdrop}
        inert={isDeleteOpen || isPosterOpen || undefined}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
      <section
        aria-busy={detailQuery.isPending}
        aria-label={!anime ? "动漫详情" : undefined}
        aria-labelledby={anime ? "anime-detail-title" : undefined}
        aria-modal="true"
        className={styles.modal}
        onKeyDown={trapFocus}
        ref={dialogRef}
        role="dialog"
      >
        <button
          aria-label="关闭动漫详情"
          autoFocus
          className={styles.closeButton}
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>

        {detailQuery.isPending ? (
          <p className={styles.modalMessage}>正在读取详情…</p>
        ) : detailQuery.isError || !anime ? (
          <ErrorState
            className={styles.modalMessage}
            onRetry={() => detailQuery.refetch()}
          />
        ) : (
          <div className={styles.scrollArea}>
            <header className={styles.header}>
              <p>MY ANIME LIBRARY</p>
              <h1 id="anime-detail-title">{title}</h1>
              <span>{anime.titleNative ?? "暂无资料"}</span>
            </header>

            <div className={styles.detailGrid}>
              <aside className={styles.posterColumn}>
                <AnimePoster
                  customPosterPath={anime.customPosterPath}
                  defaultPosterPath={anime.defaultPosterPath}
                  defaultPosterUrl={anime.defaultPosterUrl}
                  title={title}
                />
                <div className={styles.deferredActions}>
                  <button
                    onClick={(event) => {
                      setPosterTrigger(event.currentTarget);
                      setIsPosterOpen(true);
                    }}
                    type="button"
                  >
                    更换封面
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={() => {
                      deleteMutation.reset();
                      setIsDeleteOpen(true);
                    }}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              </aside>

              <div className={styles.infoColumn}>
                <AnimeStatusSelector
                  error={
                    statusMutation.isError
                      ? statusMutation.error.message
                      : null
                  }
                  isSaved={isSaved}
                  isSaving={statusMutation.isPending}
                  onChange={(status) =>
                    statusMutation.mutate({ animeId: anime.id, status })
                  }
                  status={anime.status}
                />
                <AnimeMetadata anime={anime} />
              </div>
            </div>

            <RelatedAnimeList
              importMessage={importMessage}
              importStatus={importStatus}
              isImporting={importMutation.isPending}
              items={anime.relatedAnime}
              onCancelImport={() => {
                setPendingRelated(null);
                setImportMessage(null);
              }}
              onConfirmImport={() => {
                if (!pendingRelated) return;
                setImportMessage(null);
                importMutation.mutate(
                  buildImportRequest(
                    {
                      [`${pendingRelated.source}:${pendingRelated.sourceId}`]:
                        importStatus,
                    },
                    importStatus,
                  ),
                );
              }}
              onImportStatusChange={setImportStatus}
              onOpenImported={(relatedAnimeId) => {
                setPendingRelated(null);
                setImportMessage(null);
                onSelectAnime(relatedAnimeId);
              }}
              onRequestImport={(related) => {
                setPendingRelated(related);
                setImportMessage(null);
              }}
              pendingItem={pendingRelated}
              unavailable={anime.relatedAnimeUnavailable}
            />
          </div>
        )}
        </section>
      </div>

      {isDeleteOpen && anime ? (
        <ConfirmDialog
          animeTitle={title}
          error={
            deleteMutation.isError ? deleteMutation.error.message : null
          }
          isPending={deleteMutation.isPending}
          onCancel={() => {
            deleteMutation.reset();
            setIsDeleteOpen(false);
          }}
          onConfirm={() => deleteMutation.mutate(anime.id)}
        />
      ) : null}

      {isPosterOpen && anime ? (
        <PosterManagerModal
          anime={anime}
          onClose={() => setIsPosterOpen(false)}
          onUpdated={applyPosterUpdate}
          returnFocus={posterTrigger}
          title={title}
        />
      ) : null}
    </>
  );
}
