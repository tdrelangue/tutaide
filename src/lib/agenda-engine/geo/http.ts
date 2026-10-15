/** The part of `fetch` we use: injected so tests and the desktop app can supply their own. */
export type FetchLike = (
  url: string,
  init?: { readonly signal?: AbortSignal },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;

export const REQUEST_TIMEOUT_MS = 8000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Only HTTPS endpoints are accepted: addresses never travel in clear. */
export function httpsOr(
  override: string | undefined,
  fallback: string,
): string {
  return override?.startsWith("https://") === true ? override : fallback;
}
