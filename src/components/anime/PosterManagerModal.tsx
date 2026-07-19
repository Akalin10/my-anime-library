"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { PosterPreview } from "@/components/anime/PosterPreview";
import { MAX_CUSTOM_POSTER_BYTES } from "@/lib/images/poster-image-validation";
import type { ApiResponse } from "@/types/api";
import type { AnimeDetailData, AnimePosterUpdateData } from "@/types/anime";

import styles from "./PosterManagerModal.module.css";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type PosterManagerModalProps = {
  anime: AnimeDetailData;
  title: string;
  onClose: () => void;
  onUpdated: (updated: AnimePosterUpdateData) => void;
  returnFocus: HTMLElement | null;
};

async function responseData(response: Response): Promise<AnimePosterUpdateData> {
  const body = (await response.json()) as ApiResponse<AnimePosterUpdateData>;
  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "保存封面失败。");
  }
  return body.data;
}

export function PosterManagerModal({
  anime,
  title,
  onClose,
  onUpdated,
  returnFocus,
}: PosterManagerModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(
    () => () => {
      window.setTimeout(() => {
        if (returnFocus?.isConnected) returnFocus.focus();
      }, 0);
    },
    [returnFocus],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !isPending) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isPending, onClose]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError(null);
    if (!selected) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (!ALLOWED_TYPES.has(selected.type)) {
      setFile(null);
      setPreviewUrl(null);
      setError("只支持 JPG、JPEG、PNG 或 WebP 图片。");
      return;
    }
    if (selected.size > MAX_CUSTOM_POSTER_BYTES) {
      setFile(null);
      setPreviewUrl(null);
      setError("封面文件不能超过 10 MB。");
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function run(action: () => Promise<AnimePosterUpdateData>) {
    setError(null);
    setIsPending(true);
    try {
      onUpdated(await action());
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "保存封面失败。",
      );
    } finally {
      setIsPending(false);
    }
  }

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusables = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
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
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
      }}
    >
      <section
        aria-labelledby="poster-manager-title"
        aria-modal="true"
        className={styles.modal}
        onKeyDown={trapFocus}
        ref={dialogRef}
        role="dialog"
      >
        <button
          aria-label="关闭封面管理"
          className={styles.closeButton}
          disabled={isPending}
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>

        <header className={styles.header}>
          <p>封面管理</p>
          <h2 id="poster-manager-title">更换《{title}》封面</h2>
          <span>新封面确认保存后才会替换当前显示，数据源默认封面会保留。</span>
        </header>

        <div className={styles.layout}>
          <PosterPreview
            customPosterPath={anime.customPosterPath}
            defaultPosterPath={anime.defaultPosterPath}
            defaultPosterUrl={anime.defaultPosterUrl}
            previewUrl={previewUrl}
            title={title}
          />

          <div className={styles.options}>
            <section className={styles.option}>
              <h3>上传图片</h3>
              <p>支持 JPG、JPEG、PNG、WebP，最大 10 MB。</p>
              <label className={styles.filePicker}>
                <span>{file ? file.name : "选择图片"}</span>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  disabled={isPending}
                  onChange={selectFile}
                  type="file"
                />
              </label>
              <button
                className={styles.primaryButton}
                disabled={!file || isPending}
                onClick={() => {
                  if (!file) return;
                  void run(async () => {
                    const formData = new FormData();
                    formData.set("file", file);
                    return responseData(
                      await fetch(`/api/anime/${anime.id}/poster/upload`, {
                        method: "POST",
                        body: formData,
                      }),
                    );
                  });
                }}
                type="button"
              >
                {isPending ? "正在保存……" : "确认保存"}
              </button>
            </section>

            <section className={styles.option}>
              <h3>使用图片网址</h3>
              <p>服务器会验证地址和图片内容，并将图片保存到本地。</p>
              <input
                aria-label="图片网址"
                disabled={isPending}
                onChange={(event) => setRemoteUrl(event.target.value)}
                placeholder="https://example.com/poster.jpg"
                type="url"
                value={remoteUrl}
              />
              <button
                disabled={!remoteUrl.trim() || isPending}
                onClick={() =>
                  void run(async () =>
                    responseData(
                      await fetch(`/api/anime/${anime.id}/poster/url`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ url: remoteUrl.trim() }),
                      }),
                    ),
                  )
                }
                type="button"
              >
                使用图片网址
              </button>
            </section>

            <section className={styles.option}>
              <h3>恢复默认封面</h3>
              <p>移除本地自定义封面，重新显示已保存的数据源封面。</p>
              <button
                disabled={!anime.customPosterPath || isPending}
                onClick={() =>
                  void run(async () =>
                    responseData(
                      await fetch(`/api/anime/${anime.id}/poster/custom`, {
                        method: "DELETE",
                      }),
                    ),
                  )
                }
                type="button"
              >
                恢复默认封面
              </button>
            </section>
          </div>
        </div>

        <footer className={styles.footer}>
          <p aria-live="polite" className={styles.error} role="status">
            {error}
          </p>
          <button disabled={isPending} onClick={onClose} type="button">
            取消
          </button>
        </footer>
      </section>
    </div>
  );
}
