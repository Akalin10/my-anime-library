import type { ApiErrorCode, ApiFailure, ApiSuccess } from "@/types/api";

export function apiSuccess<T>(data: T, status = 200) {
  const body: ApiSuccess<T> = {
    data,
    error: null,
  };

  return Response.json(body, { status });
}

export function apiFailure(
  code: ApiErrorCode,
  message: string,
  status: number,
) {
  const body: ApiFailure = {
    data: null,
    error: { code, message },
  };

  return Response.json(body, { status });
}
