import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { CustomPosterStorage } from "@/lib/images/custom-poster-storage";
import { getEffectivePosterStoragePath } from "@/server/config/runtime-settings";

const CUSTOM_POSTER_FILENAME =
  /^([1-9]\d*-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i;

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
  const match = filename.match(CUSTOM_POSTER_FILENAME);
  if (!match) return new Response(null, { status: 404 });

  const rootPath = getEffectivePosterStoragePath();
  const relativePath = `custom/${filename}`;
  const absolutePath = resolve(rootPath, relativePath);
  const customDirectory = resolve(rootPath, "custom");
  if (!absolutePath.startsWith(`${customDirectory}${sep}`)) {
    return new Response(null, { status: 404 });
  }

  try {
    await new CustomPosterStorage(rootPath).assertSafePath(relativePath);
    const bytes = await readFile(absolutePath);
    return new Response(bytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(bytes.byteLength),
        "Content-Type": CONTENT_TYPES[match[2].toLowerCase()] ?? "application/octet-stream",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
