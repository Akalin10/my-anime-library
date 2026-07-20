"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./CustomSelect.module.css";

export type CustomSelectOption<T extends string = string> = {
  value: T;
  label: string;
};

type CustomSelectProps<T extends string = string> = {
  ariaLabel: string;
  options: readonly CustomSelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function CustomSelect<T extends string = string>({
  ariaLabel,
  options,
  value,
  onChange,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const currentLabel =
    options.find((o) => o.value === value)?.label ?? options[0]?.label ?? "";

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className={styles.value}>{currentLabel}</span>
        <span aria-hidden="true" className={styles.arrow} data-open={open || undefined} />
      </button>

      {open ? (
        <ul aria-label={ariaLabel} className={styles.menu} role="listbox">
          {options.map((option) => (
            <li key={option.value}>
              <button
                aria-selected={option.value === value}
                className={styles.option}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
