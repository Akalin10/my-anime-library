"use client";

import { useEffect, useRef } from "react";

import styles from "./ConfirmDialog.module.css";

type ConfirmDialogProps = {
  animeTitle: string;
  error: string | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  animeTitle,
  error,
  isPending,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusTimer = window.setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      const target = returnFocusRef.current;
      window.setTimeout(() => {
        if (target?.isConnected) target.focus();
      }, 0);
    };
  }, []);

  useEffect(() => {
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) onCancel();
    }
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [isPending, onCancel]);

  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const buttons = Array.from(
      dialogRef.current.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled])",
      ),
    );
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
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
        if (
          event.target === event.currentTarget &&
          !isPending
        ) {
          onCancel();
        }
      }}
    >
      <section
        aria-describedby="delete-anime-message"
        aria-labelledby="delete-anime-title"
        aria-modal="true"
        className={styles.dialog}
        onKeyDown={trapFocus}
        ref={dialogRef}
        role="alertdialog"
      >
        <p className={styles.eyebrow}>删除收藏</p>
        <h2 id="delete-anime-title">请确认删除</h2>
        <p className={styles.message} id="delete-anime-message">
          确定要从动漫库中删除《{animeTitle}》吗？
        </p>
        <p className={styles.scope}>只会删除本地收藏和本地自定义封面。</p>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.actions}>
          <button
            disabled={isPending}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            取消
          </button>
          <button
            disabled={isPending}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? "正在删除……" : "确认删除"}
          </button>
        </div>
      </section>
    </div>
  );
}
