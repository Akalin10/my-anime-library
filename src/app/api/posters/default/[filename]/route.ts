import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { getEffectivePosterStoragePath } from "@/server/config/runtime-settings";

const DEFAULT_POSTER_FILENAME =
  /^(?:bangumi|anilist|tmdb)-[1-9]\d*\.(jpg|png|webp)$/;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  const match = filename.match(DEFAULT_POSTER_FILENAME);
  if (!match) {
    return new Response(null, { status: 404 });
  }

  const posterRoot = resolve(
    getEffectivePosterStoragePath(),
    "default",
  );
  const filePath = resolve(posterRoot, filename);
  if (!filePath.startsWith(`${posterRoot}${sep}`)) {
    return new Response(null, { status: 404 });
  }

  try {
    const bytes = await readFile(filePath);
    return new Response(bytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(bytes.byteLength),
        "Content-Type": CONTENT_TYPES[match[1]] ?? "application/octet-stream",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
