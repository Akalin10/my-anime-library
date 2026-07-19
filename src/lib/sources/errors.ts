export type SourceErrorCode = "TIMEOUT" | "RATE_LIMIT" | "UNAVAILABLE";

type SourceAdapterErrorOptions = {
  statusCode?: number;
  retryAfterSeconds?: number;
  cause?: unknown;
};

export class SourceAdapterError extends Error {
  readonly source: string;
  readonly code: SourceErrorCode;
  readonly statusCode: number | null;
  readonly retryAfterSeconds: number | null;
  override readonly cause: unknown;

  constructor(
    source: string,
    code: SourceErrorCode,
    message: string,
    options: SourceAdapterErrorOptions = {},
  ) {
    super(message);
    this.name = "SourceAdapterError";
    this.source = source;
    this.code = code;
    this.statusCode = options.statusCode ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.cause = options.cause;
  }
}
