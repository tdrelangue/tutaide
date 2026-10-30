/**
 * Short database outages (all connections taken, server briefly unreachable)
 * are retried before any page sees them: the 2026-10-21 incident was a few
 * seconds of « too many connections » that turned into blank pages.
 *
 * Only errors raised BEFORE the query reaches the database are retried, so a
 * retried write can never run twice.
 */

/** Prisma codes for « could not get a connection », never « the query failed ». */
const RETRYABLE_CODES = new Set([
  "P1001", // can't reach database server
  "P1002", // database server reached but timed out
  "P2024", // timed out fetching a connection from the pool
  "P2037", // too many database connections opened
]);

/** About 4 s in total: long enough for a burst to pass, short enough for a page. */
export const RETRY_DELAYS_MS = [250, 500, 1000, 2000] as const;

function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  // Safe: an object whose two fields are only read as unknown and checked below.
  const { code, errorCode } = error as { code?: unknown; errorCode?: unknown };
  if (typeof code === "string") return code;
  return typeof errorCode === "string" ? errorCode : null;
}

export function isConnectionError(error: unknown): boolean {
  const code = codeOf(error);
  return code !== null && RETRYABLE_CODES.has(code);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `operation`, retrying connection errors with growing pauses; any other error is thrown at once. */
export async function withConnectionRetry<T>(
  operation: () => Promise<T>,
  delays: readonly number[] = RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isConnectionError(error) || attempt >= delays.length) throw error;
      await sleep(delays[attempt]);
    }
  }
}
