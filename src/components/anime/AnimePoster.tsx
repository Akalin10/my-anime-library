"use client";

import { useMemo, useState } from "react";

import styles from "./AnimePoster.module.css";

const PLACEHOLDER_URL = "/placeholders/anime-poster.svg";

type AnimePosterProps = {
  title: string;
  customPosterPath: string | null;
  defaultPosterPath: string | null;
  defaultPosterUrl: string | null;
};

function localPosterUrl(path: string | null): string | null {
  const match = path?.match(
    /^default\/((?:bangumi|anilist|tmdb)-[1-9]\d*\.(?:jpg|png|webp))$/,
  );
  return match ? `/api/posters/default/${encodeURIComponent(match[1])}` : null;
}

function customPosterUrl(path: string | null): string | null {
  const match = path?.match(
    /^custom\/([1-9]\d*-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp))$/i,
  );
  return match ? `/api/posters/custom/${encodeURIComponent(match[1])}` : null;
}

export function posterSourceCandidates(input: {
  customPosterPath: string | null;
  defaultPosterPath: string | null;
  defaultPosterUrl: string | null;
}): string[] {
  return [
    customPosterUrl(input.customPosterPath),
    localPosterUrl(input.defaultPosterPath),
    input.defaultPosterUrl,
    PLACEHOLDER_URL,
  ]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index);
}

export function AnimePoster({
  title,
  customPosterPath,
  defaultPosterPath,
  defaultPosterUrl,
}: AnimePosterProps) {
  const sources = useMemo(
    () =>
      posterSourceCandidates({
        customPosterPath,
        defaultPosterPath,
        defaultPosterUrl,
      }),
    [customPosterPath, defaultPosterPath, defaultPosterUrl],
  );
  const [failedSources, setFailedSources] = useState<Set<string>>(
    () => new Set(),
  );
  const currentSource =
    sources.find((source) => !failedSources.has(source)) ?? PLACEHOLDER_URL;

  return (
    <div className={styles.frame}>
      {/* Native img keeps the ordered local -> remote -> placeholder fallback. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={`${title}海报`}
        decoding="async"
        loading="lazy"
        onError={() => {
          if (currentSource === PLACEHOLDER_URL) {
            return;
          }
          setFailedSources((current) => {
            const next = new Set(current);
            next.add(currentSource);
            return next;
          });
        }}
        src={currentSource}
      />
      <span className={styles.hoverMask} aria-hidden="true" />
    </div>
  );
}
