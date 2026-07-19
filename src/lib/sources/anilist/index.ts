import { AniListAdapter, type AniListAdapterOptions } from "./adapter";

export { AniListAdapter } from "./adapter";

type EnvironmentAdapterOptions = Omit<AniListAdapterOptions, "apiUrl">;

export function createAniListAdapterFromEnv(
  options: EnvironmentAdapterOptions = {},
): AniListAdapter {
  const apiUrl = process.env.ANILIST_API_URL?.trim();
  if (!apiUrl) {
    throw new Error("ANILIST_API_URL is required");
  }

  return new AniListAdapter({ ...options, apiUrl });
}
