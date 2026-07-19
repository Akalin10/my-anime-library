import { BangumiAdapter, type BangumiAdapterOptions } from "./adapter";

export { BangumiAdapter } from "./adapter";
export { SourceAdapterError } from "../errors";
export type {
  AnimeSourceAdapter,
  NormalizedAnime,
  NormalizedAnimeRelation,
  PosterCandidate,
} from "../types";

type EnvironmentAdapterOptions = Omit<
  BangumiAdapterOptions,
  "token" | "userAgent"
>;

export function createBangumiAdapterFromEnv(
  options: EnvironmentAdapterOptions = {},
): BangumiAdapter {
  const userAgent = process.env.BANGUMI_USER_AGENT?.trim();
  if (!userAgent) {
    throw new Error(
      "BANGUMI_USER_AGENT is required and must follow Bangumi's official User-Agent policy",
    );
  }

  return new BangumiAdapter({
    ...options,
    userAgent,
    token: process.env.BANGUMI_API_TOKEN,
  });
}
