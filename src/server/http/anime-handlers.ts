import {
  animeIdSchema,
  animeListQuerySchema,
  animeStatusUpdateSchema,
  searchParamsToInput,
} from "@/lib/validation/anime-query";
import { UnsafeCustomPosterPathError } from "@/lib/images/custom-poster-storage";
import {
  MAX_CUSTOM_POSTER_BYTES,
  PosterValidationError,
} from "@/lib/images/poster-image-validation";
import { PosterUrlError } from "@/lib/images/remote-poster-download";
import { posterUrlBodySchema } from "@/lib/validation/poster";
import type { AnimeDeleteService } from "@/server/services/anime-delete-service";
import type { AnimeDetailService } from "@/server/services/anime-detail-service";
import type { AnimeReadService } from "@/server/services/anime-read-service";
import type { AnimeStatusService } from "@/server/services/anime-status-service";
import type { AnimePosterService } from "@/server/services/anime-poster-service";

import { apiFailure, apiSuccess } from "./api-response";

export function handleListAnimeRequest(
  request: Request,
  service: AnimeReadService,
) {
  const searchParams = new URL(request.url).searchParams;
  const parsed = animeListQuerySchema.safeParse(
    searchParamsToInput(searchParams),
  );

  if (!parsed.success) {
    return apiFailure(
      "INVALID_QUERY",
      "查询参数无效。status 仅支持 ALL、WATCHING、COMPLETED；sort 仅支持 RECENT、TITLE、YEAR；query 最长 200 个字符。",
      400,
    );
  }

  return apiSuccess(service.list(parsed.data));
}

export async function handleUploadAnimePosterRequest(
  rawId: string,
  request: Request,
  service: AnimePosterService,
) {
  const parsedId = animeIdSchema.safeParse(rawId);
  if (!parsedId.success) {
    return apiFailure("INVALID_ANIME_ID", "动漫 ID 必须是正整数。", 400);
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_CUSTOM_POSTER_BYTES + 1024 * 1024
  ) {
    return apiFailure("POSTER_TOO_LARGE", "封面文件不能超过 10 MB。", 413);
  }

  let formData: FormData;
  try {
    const body = await readBodyWithLimit(
      request,
      MAX_CUSTOM_POSTER_BYTES + 1024 * 1024,
    );
    formData = await new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body,
    }).formData();
  } catch (error) {
    if (error instanceof PosterValidationError) {
      return posterErrorResponse(error);
    }
    return apiFailure("INVALID_POSTER_UPLOAD", "上传内容必须是有效表单。", 400);
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return apiFailure("INVALID_POSTER_UPLOAD", "请选择要上传的封面文件。", 400);
  }

  try {
    const updated = await service.upload(
      parsedId.data,
      new Uint8Array(await file.arrayBuffer()),
      file.type,
    );
    return updated
      ? apiSuccess(updated)
      : apiFailure("ANIME_NOT_FOUND", "未找到该动漫。", 404);
  } catch (error) {
    return posterErrorResponse(error);
  }
}

async function readBodyWithLimit(
  request: Request,
  byteLimit: number,
): Promise<ArrayBuffer> {
  if (!request.body) {
    throw new Error("Missing request body");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > byteLimit) {
        await reader.cancel();
        throw new PosterValidationError("IMAGE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

export async function handleImportAnimePosterUrlRequest(
  rawId: string,
  request: Request,
  service: AnimePosterService,
) {
  const parsedId = animeIdSchema.safeParse(rawId);
  if (!parsedId.success) {
    return apiFailure("INVALID_ANIME_ID", "动漫 ID 必须是正整数。", 400);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiFailure("INVALID_POSTER_URL", "图片网址请求必须是有效 JSON。", 400);
  }
  const parsedBody = posterUrlBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return apiFailure("INVALID_POSTER_URL", "请输入有效的图片网址。", 400);
  }
  try {
    const updated = await service.importUrl(parsedId.data, parsedBody.data.url);
    return updated
      ? apiSuccess(updated)
      : apiFailure("ANIME_NOT_FOUND", "未找到该动漫。", 404);
  } catch (error) {
    return posterErrorResponse(error);
  }
}

export async function handleRestoreAnimePosterRequest(
  rawId: string,
  service: AnimePosterService,
) {
  const parsedId = animeIdSchema.safeParse(rawId);
  if (!parsedId.success) {
    return apiFailure("INVALID_ANIME_ID", "动漫 ID 必须是正整数。", 400);
  }
  try {
    const updated = await service.restoreDefault(parsedId.data);
    return updated
      ? apiSuccess(updated)
      : apiFailure("ANIME_NOT_FOUND", "未找到该动漫。", 404);
  } catch (error) {
    return posterErrorResponse(error);
  }
}

function posterErrorResponse(error: unknown): Response {
  if (error instanceof UnsafeCustomPosterPathError) {
    return apiFailure(
      "UNSAFE_CUSTOM_POSTER_PATH",
      "自定义封面路径不安全，操作已拒绝。",
      409,
    );
  }
  if (error instanceof PosterValidationError) {
    if (error.code === "IMAGE_TOO_LARGE") {
      return apiFailure("POSTER_TOO_LARGE", "封面文件不能超过 10 MB。", 413);
    }
    if (error.code === "UNSUPPORTED_IMAGE_TYPE") {
      return apiFailure(
        "UNSUPPORTED_POSTER_TYPE",
        "只支持 JPG、JPEG、PNG 或 WebP 图片。",
        415,
      );
    }
    return apiFailure("INVALID_POSTER_IMAGE", "封面内容不是有效图片。", 415);
  }
  if (error instanceof PosterUrlError) {
    switch (error.code) {
      case "INVALID_URL":
        return apiFailure("INVALID_POSTER_URL", "请输入有效的 HTTP 或 HTTPS 图片网址。", 400);
      case "BLOCKED_ADDRESS":
        return apiFailure("BLOCKED_POSTER_URL", "图片网址不能指向本机或内网地址。", 400);
      case "DOWNLOAD_TIMEOUT":
        return apiFailure("POSTER_DOWNLOAD_TIMEOUT", "图片下载超时。", 504);
      case "IMAGE_TOO_LARGE":
        return apiFailure("POSTER_TOO_LARGE", "远程封面不能超过 10 MB。", 413);
      case "UNSUPPORTED_IMAGE_TYPE":
        return apiFailure("UNSUPPORTED_POSTER_TYPE", "远程响应不是支持的图片类型。", 415);
      case "INVALID_IMAGE_SIGNATURE":
        return apiFailure("INVALID_POSTER_IMAGE", "远程响应内容不是有效图片。", 415);
      default:
        return apiFailure("POSTER_DOWNLOAD_FAILED", "无法下载该图片。", 502);
    }
  }
  throw error;
}

export function handleGetAnimeRequest(
  rawId: string,
  service: AnimeReadService,
) {
  const parsedId = animeIdSchema.safeParse(rawId);

  if (!parsedId.success) {
    return apiFailure("INVALID_ANIME_ID", "动漫 ID 必须是正整数。", 400);
  }

  const detail = service.getById(parsedId.data);

  if (!detail) {
    return apiFailure("ANIME_NOT_FOUND", "未找到该动漫。", 404);
  }

  return apiSuccess(detail);
}

export async function handleGetAnimeDetailRequest(
  rawId: string,
  service: AnimeDetailService,
) {
  const parsedId = animeIdSchema.safeParse(rawId);

  if (!parsedId.success) {
    return apiFailure("INVALID_ANIME_ID", "动漫 ID 必须是正整数。", 400);
  }

  const detail = await service.getById(parsedId.data);
  if (!detail) {
    return apiFailure("ANIME_NOT_FOUND", "未找到该动漫。", 404);
  }

  return apiSuccess(detail);
}

export async function handleUpdateAnimeStatusRequest(
  rawId: string,
  request: Request,
  service: AnimeStatusService,
) {
  const parsedId = animeIdSchema.safeParse(rawId);
  if (!parsedId.success) {
    return apiFailure("INVALID_ANIME_ID", "动漫 ID 必须是正整数。", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiFailure("INVALID_STATUS_BODY", "状态请求必须是有效 JSON。", 400);
  }

  const parsedBody = animeStatusUpdateSchema.safeParse(body);
  if (!parsedBody.success) {
    return apiFailure(
      "INVALID_STATUS_BODY",
      "状态仅支持 WATCHING 或 COMPLETED。",
      400,
    );
  }

  const updated = service.update(parsedId.data, parsedBody.data.status);
  if (!updated) {
    return apiFailure("ANIME_NOT_FOUND", "未找到该动漫。", 404);
  }

  return apiSuccess(updated);
}

export async function handleDeleteAnimeRequest(
  rawId: string,
  service: AnimeDeleteService,
) {
  const parsedId = animeIdSchema.safeParse(rawId);
  if (!parsedId.success) {
    return apiFailure("INVALID_ANIME_ID", "动漫 ID 必须是正整数。", 400);
  }

  try {
    const deleted = await service.delete(parsedId.data);
    if (!deleted) {
      return apiFailure("ANIME_NOT_FOUND", "未找到该动漫。", 404);
    }
    return apiSuccess(deleted);
  } catch (error) {
    if (error instanceof UnsafeCustomPosterPathError) {
      return apiFailure(
        "UNSAFE_CUSTOM_POSTER_PATH",
        "自定义封面路径不安全，已拒绝删除。",
        409,
      );
    }
    throw error;
  }
}
