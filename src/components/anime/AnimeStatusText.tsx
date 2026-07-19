import type { AnimeStatus } from "@/lib/db/schema";

import styles from "./AnimeStatusText.module.css";

export function AnimeStatusText({ status }: { status: AnimeStatus }) {
  return (
    <span className={styles.status} data-status={status}>
      <span className={styles.dot} aria-hidden="true" />
      {status === "WATCHING" ? "在看" : "已看完"}
    </span>
  );
}
