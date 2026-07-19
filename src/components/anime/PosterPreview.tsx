"use client";

import { AnimePoster } from "@/components/anime/AnimePoster";

import styles from "./PosterManagerModal.module.css";

type PosterPreviewProps = {
  title: string;
  previewUrl: string | null;
  customPosterPath: string | null;
  defaultPosterPath: string | null;
  defaultPosterUrl: string | null;
};

export function PosterPreview({
  title,
  previewUrl,
  customPosterPath,
  defaultPosterPath,
  defaultPosterUrl,
}: PosterPreviewProps) {
  return (
    <div className={styles.preview}>
      {previewUrl ? (
        // Local object URLs are created only from the selected local file.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={`${title}封面预览`} src={previewUrl} />
      ) : (
        <AnimePoster
          customPosterPath={customPosterPath}
          defaultPosterPath={defaultPosterPath}
          defaultPosterUrl={defaultPosterUrl}
          title={title}
        />
      )}
    </div>
  );
}
