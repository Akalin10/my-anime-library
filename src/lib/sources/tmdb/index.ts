import { TmdbAdapter, type TmdbAdapterOptions } from "./adapter";

export { TmdbAdapter } from "./adapter";

type EnvironmentAdapterOptions = Omit<TmdbAdapterOptions, "apiKey">;

export function createTmdbAdapterFromEnv(
  options: EnvironmentAdapterOptions = {},
): TmdbAdapter {
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey) throw new Error("TMDB_API_KEY is required");
  return new TmdbAdapter({ ...options, apiKey });
}
