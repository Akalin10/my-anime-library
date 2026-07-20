"use client";

import { useCallback, useEffect, useState } from "react";

import styles from "./PosterLightbox.module.css";

type PosterLightboxProps = {
  src: string;
  alt: string;
  onClose: () => void;
};

export function PosterLightbox({ src, alt, onClose }: PosterLightboxProps) {
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLImageElement>) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      setOrigin({
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      });
      setScale((current) => {
        const delta = event.deltaY < 0 ? 0.2 : -0.2;
        return Math.min(4, Math.max(1, current + delta));
      });
    },
    [],
  );

  return (
    <div
      aria-label="海报灯箱，点击背景或按 ESC 关闭"
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={alt}
        className={styles.image}
        decoding="async"
        onClick={(event) => event.stopPropagation()}
        onWheel={handleWheel}
        src={src}
        style={{
          cursor: scale > 1.05 ? "zoom-out" : "zoom-in",
          transform: `scale(${scale})`,
          transformOrigin: `${origin.x * 100}% ${origin.y * 100}%`,
        }}
      />
    </div>
  );
}
