import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import {
  MAX_CUSTOM_POSTER_BYTES,
  normalizePosterContentType,
  POSTER_CONTENT_TYPES,
  validatePosterBytes,
  type PosterExtension,
} from "@/lib/images/poster-image-validation";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

export class PosterUrlError extends Error {
  constructor(
    readonly code:
      | "INVALID_URL"
      | "BLOCKED_ADDRESS"
      | "DOWNLOAD_TIMEOUT"
      | "DOWNLOAD_FAILED"
      | "IMAGE_TOO_LARGE"
      | "UNSUPPORTED_IMAGE_TYPE"
      | "INVALID_IMAGE_SIGNATURE",
  ) {
    super(code);
    this.name = "PosterUrlError";
  }
}

export type DownloadedPoster = {
  bytes: Uint8Array;
  extension: PosterExtension;
};

export type RemotePosterResponse = AsyncIterable<Uint8Array | Buffer | string> & {
  statusCode?: number;
  headers: {
    location?: string;
    "content-type"?: string | string[];
    "content-length"?: string | string[];
  };
  resume: () => void;
  destroy: () => void;
};

type RequestPinned = (
  url: URL,
  address: { address: string; family: number },
  timeoutMs: number,
) => Promise<RemotePosterResponse>;

export type RemotePosterDownloaderOptions = {
  timeoutMs?: number;
  resolveHostname?: ResolveHostname;
  requestPinned?: RequestPinned;
};

type ResolveHostname = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: 4 | 6 }>>;

const resolveWithDns: ResolveHostname = (hostname, options) =>
  lookup(hostname, options) as Promise<
    Array<{ address: string; family: 4 | 6 }>
  >;

export class RemotePosterDownloader {
  private readonly timeoutMs: number;
  private readonly resolveHostname: ResolveHostname;
  private readonly requestImplementation: RequestPinned;

  constructor(options: RemotePosterDownloaderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.resolveHostname = options.resolveHostname ?? resolveWithDns;
    this.requestImplementation = options.requestPinned ?? requestPinned;
  }

  async download(rawUrl: string): Promise<DownloadedPoster> {
    let url = parseRemoteUrl(rawUrl);

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      const addresses = await this.resolvePublicAddresses(url.hostname);
      const response = await this.requestImplementation(
        url,
        addresses[0],
        this.timeoutMs,
      );

      if (isRedirectStatus(response.statusCode)) {
        response.resume();
        const location = response.headers.location;
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new PosterUrlError("DOWNLOAD_FAILED");
        }
        url = parseRemoteUrl(new URL(location, url).toString());
        continue;
      }

      if (response.statusCode !== 200) {
        response.resume();
        throw new PosterUrlError("DOWNLOAD_FAILED");
      }

      const contentType = normalizePosterContentType(
        Array.isArray(response.headers["content-type"])
          ? response.headers["content-type"][0] ?? null
          : response.headers["content-type"] ?? null,
      );
      if (!(contentType in POSTER_CONTENT_TYPES)) {
        response.resume();
        throw new PosterUrlError("UNSUPPORTED_IMAGE_TYPE");
      }

      const declaredLength = Number(response.headers["content-length"]);
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_CUSTOM_POSTER_BYTES
      ) {
        response.destroy();
        throw new PosterUrlError("IMAGE_TOO_LARGE");
      }

      const bytes = await readLimitedBody(response);
      try {
        return {
          bytes,
          extension: validatePosterBytes(bytes, contentType),
        };
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          typeof error.code === "string"
        ) {
          if (error.code === "IMAGE_TOO_LARGE") {
            throw new PosterUrlError("IMAGE_TOO_LARGE");
          }
          if (error.code === "UNSUPPORTED_IMAGE_TYPE") {
            throw new PosterUrlError("UNSUPPORTED_IMAGE_TYPE");
          }
          throw new PosterUrlError("INVALID_IMAGE_SIGNATURE");
        }
        throw error;
      }
    }

    throw new PosterUrlError("DOWNLOAD_FAILED");
  }

  private async resolvePublicAddresses(hostname: string) {
    const literal = stripIpv6Brackets(hostname);
    let addresses: Array<{ address: string; family: 4 | 6 }>;
    try {
      addresses = isIP(literal)
        ? [{ address: literal, family: isIP(literal) as 4 | 6 }]
        : await withTimeout(
            this.resolveHostname(literal, { all: true, verbatim: true }),
            this.timeoutMs,
          );
    } catch (error) {
      throw error instanceof PosterUrlError
        ? error
        : new PosterUrlError("DOWNLOAD_FAILED");
    }
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isPublicAddress(address))
    ) {
      throw new PosterUrlError("BLOCKED_ADDRESS");
    }
    return addresses;
  }

}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new PosterUrlError("DOWNLOAD_TIMEOUT")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function requestPinned(
  url: URL,
  address: { address: string; family: number },
  timeoutMs: number,
): Promise<RemotePosterResponse> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        headers: {
          Accept: "image/jpeg,image/png,image/webp",
          Host: url.host,
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, address.address, address.family);
        },
        servername: url.hostname,
      },
      (response) => resolve(response),
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new PosterUrlError("DOWNLOAD_TIMEOUT"));
    });
    request.on("error", (error) => {
      reject(
        error instanceof PosterUrlError
          ? error
          : new PosterUrlError("DOWNLOAD_FAILED"),
      );
    });
    request.end();
  });
}

function parseRemoteUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PosterUrlError("INVALID_URL");
  }
  const validPort =
    !url.port ||
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443");
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    !validPort
  ) {
    throw new PosterUrlError("INVALID_URL");
  }
  return url;
}

function stripIpv6Brackets(value: string): string {
  return value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1)
    : value;
}

function isPublicAddress(address: string): boolean {
  const normalized = stripIpv6Brackets(address).toLowerCase();
  if (isIP(normalized) === 4) {
    const octets = normalized.split(".").map(Number);
    const [a, b] = octets;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }
  if (isIP(normalized) === 6) {
    if (normalized.startsWith("::ffff:")) {
      return isPublicAddress(normalized.slice("::ffff:".length));
    }
    const firstHextet = Number.parseInt(normalized.split(":", 1)[0] ?? "", 16);
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:0:") ||
      normalized.startsWith("2001:0000:") ||
      normalized.startsWith("2001:2:") ||
      normalized.startsWith("2001:0002:") ||
      normalized.startsWith("2001:db8:") ||
      normalized.startsWith("2002:")
    ) && firstHextet >= 0x2000 && firstHextet <= 0x3fff;
  }
  return false;
}

function isRedirectStatus(statusCode: number | undefined): boolean {
  return [301, 302, 303, 307, 308].includes(statusCode ?? 0);
}

async function readLimitedBody(
  response: RemotePosterResponse,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of response) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += bytes.byteLength;
    if (byteLength > MAX_CUSTOM_POSTER_BYTES) {
      response.destroy();
      throw new PosterUrlError("IMAGE_TOO_LARGE");
    }
    chunks.push(bytes);
  }
  return new Uint8Array(Buffer.concat(chunks, byteLength));
}
