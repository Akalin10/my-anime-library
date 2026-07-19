export type ApiErrorCode =
  | "INVALID_QUERY"
  | "INVALID_SEARCH_QUERY"
  | "INVALID_IMPORT_BODY"
  | "INVALID_STATUS_BODY"
  | "INVALID_ANIME_ID"
  | "ANIME_NOT_FOUND"
  | "UNSAFE_CUSTOM_POSTER_PATH"
  | "INVALID_POSTER_UPLOAD"
  | "INVALID_POSTER_URL"
  | "BLOCKED_POSTER_URL"
  | "POSTER_TOO_LARGE"
  | "UNSUPPORTED_POSTER_TYPE"
  | "INVALID_POSTER_IMAGE"
  | "INVALID_SETTINGS_BODY"
  | "INVALID_POSTER_STORAGE_PATH"
  | "POSTER_DOWNLOAD_TIMEOUT"
  | "POSTER_DOWNLOAD_FAILED"
  | "SOURCE_TIMEOUT"
  | "SOURCE_RATE_LIMITED"
  | "SOURCE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
};

export type ApiSuccess<T> = {
  data: T;
  error: null;
};

export type ApiFailure = {
  data: null;
  error: ApiError;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
