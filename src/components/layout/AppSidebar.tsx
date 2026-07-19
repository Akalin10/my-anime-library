"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { AnimeCounts, AnimeFilter } from "@/types/anime";

import styles from "./AppSidebar.module.css";

type AppSidebarProps = {
  counts: AnimeCounts;
  activeFilter: AnimeFilter;
  onFilterChange: (filter: AnimeFilter) => void;
  onOpenSettings: () => void;
  settingsActive: boolean;
};

const FILTERS: Array<{
  value: AnimeFilter;
  label: string;
  countKey: keyof AnimeCounts;
}> = [
  { value: "ALL", label: "全部", countKey: "all" },
  { value: "WATCHING", label: "在看", countKey: "watching" },
  { value: "COMPLETED", label: "已看完", countKey: "completed" },
];

export function AppSidebar({
  counts,
  activeFilter,
  onFilterChange,
  onOpenSettings,
  settingsActive,
}: AppSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      drawerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    function closeAfterResize(event: MediaQueryListEvent) {
      if (!event.matches) setMobileOpen(false);
    }
    mobileQuery.addEventListener("change", closeAfterResize);
    return () => mobileQuery.removeEventListener("change", closeAfterResize);
  }, []);

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || !mobileOpen) return;
      setMobileOpen(false);
      window.setTimeout(() => menuButtonRef.current?.focus(), 0);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  function closeDrawer(returnFocus = false) {
    const wasOpen = mobileOpen;
    setMobileOpen(false);
    if (returnFocus && wasOpen) {
      window.setTimeout(() => menuButtonRef.current?.focus(), 0);
    }
  }

  function trapDrawerFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!mobileOpen || event.key !== "Tab" || !drawerRef.current) return;
    const focusables = Array.from(
      drawerRef.current.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled])",
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
    <aside className={styles.sidebar} aria-label="动漫库导航">
      <div className={styles.mobileBar}>
        <div>
          <p className={styles.brandTitle}>我的动漫库</p>
          <p className={styles.brandSubtitle}>MY ANIME LIBRARY</p>
        </div>
        <button
          aria-controls="mobile-library-navigation"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "关闭导航" : "打开导航"}
          className={styles.menuButton}
          onClick={() => setMobileOpen((current) => !current)}
          ref={menuButtonRef}
          type="button"
        >
          <span aria-hidden="true" data-open={mobileOpen} />
        </button>
      </div>

      <button
        aria-label="关闭导航"
        className={styles.scrim}
        data-open={mobileOpen}
        onClick={() => closeDrawer(true)}
        tabIndex={-1}
        type="button"
      />

      <div
        aria-label={mobileOpen ? "动漫库导航" : undefined}
        aria-modal={mobileOpen || undefined}
        className={styles.drawer}
        data-open={mobileOpen}
        id="mobile-library-navigation"
        onKeyDown={trapDrawerFocus}
        ref={drawerRef}
        role={mobileOpen ? "dialog" : undefined}
      >
        <div>
          <div className={styles.drawerHeader}>
            <span>动漫库导航</span>
            <button
              aria-label="关闭导航"
              onClick={() => closeDrawer(true)}
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <div className={styles.brand}>
            <p className={styles.brandTitle}>我的动漫库</p>
            <p className={styles.brandSubtitle}>MY ANIME LIBRARY</p>
          </div>

          <nav className={styles.navigation} aria-label="状态导航">
            {FILTERS.map(({ value, label, countKey }) => (
              <button
                className={styles.navigationItem}
                data-active={activeFilter === value}
                key={value}
                onClick={() => {
                  onFilterChange(value);
                  closeDrawer(true);
                }}
                type="button"
              >
                <span>{label}</span>
                <span className={styles.count}>{counts[countKey]}</span>
              </button>
            ))}
          </nav>
        </div>

        <button
          className={styles.settings}
          data-active={settingsActive}
          onClick={() => {
            onOpenSettings();
            closeDrawer(true);
          }}
          type="button"
        >
          设置
        </button>
      </div>
    </aside>
  );
}
