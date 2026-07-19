import { SourceAdapterError } from "@/lib/sources/errors";
import {
  SOURCE_LABELS,
  type AnimeSource,
} from "@/lib/sources/types";

import { apiFailure } from "./api-response";

export function sourceErrorResponse(error: unknown): Response | null {
  if (!(error instanceof SourceAdapterError)) {
    return null;
  }

  const label =
    SOURCE_LABELS[error.source as AnimeSource] ?? error.source;

  if (error.code === "TIMEOUT") {
    return apiFailure("SOURCE_TIMEOUT", `${label} 请求超时。`, 504);
  }
  if (error.code === "RATE_LIMIT") {
    return apiFailure(
      "SOURCE_RATE_LIMITED",
      `${label} 请求过于频繁，请稍后重试。`,
      429,
    );
  }
  return apiFailure("SOURCE_UNAVAILABLE", `${label} 当前不可用。`, 503);
}
