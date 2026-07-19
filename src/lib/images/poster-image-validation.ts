export const MAX_CUSTOM_POSTER_BYTES = 10 * 1024 * 1024;

export const POSTER_CONTENT_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const;

export type PosterExtension =
  (typeof POSTER_CONTENT_TYPES)[keyof typeof POSTER_CONTENT_TYPES];

export class PosterValidationError extends Error {
  constructor(
    readonly code:
      | "EMPTY_IMAGE"
      | "IMAGE_TOO_LARGE"
      | "UNSUPPORTED_IMAGE_TYPE"
      | "INVALID_IMAGE_SIGNATURE",
  ) {
    super(code);
    this.name = "PosterValidationError";
  }
}

export function normalizePosterContentType(value: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function validatePosterBytes(
  bytes: Uint8Array,
  declaredContentType: string | null,
): PosterExtension {
  if (bytes.byteLength === 0) {
    throw new PosterValidationError("EMPTY_IMAGE");
  }
  if (bytes.byteLength > MAX_CUSTOM_POSTER_BYTES) {
    throw new PosterValidationError("IMAGE_TOO_LARGE");
  }

  const contentType = normalizePosterContentType(declaredContentType);
  const extension =
    POSTER_CONTENT_TYPES[contentType as keyof typeof POSTER_CONTENT_TYPES];
  if (!extension) {
    throw new PosterValidationError("UNSUPPORTED_IMAGE_TYPE");
  }

  const validSignature =
    (contentType === "image/jpeg" && isJpeg(bytes)) ||
    (contentType === "image/png" && isPng(bytes)) ||
    (contentType === "image/webp" && isWebp(bytes));
  if (!validSignature) {
    throw new PosterValidationError("INVALID_IMAGE_SIGNATURE");
  }
  return extension;
}

function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return (
    bytes.byteLength >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  );
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}
