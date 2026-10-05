/** HTTP statuses worth retrying: transient overload and rate limiting. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Ceiling for a server-requested wait.
 *
 * Gemini's free tier asks for ~48s when the per-minute quota is spent, which is
 * worth honouring; an unbounded value is not.
 */
const MAX_SERVER_DELAY_MS = 90_000;

export interface RetryOptions {
  attempts?: number;
  /** Delay before the first retry; doubles each time. */
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

/**
 * A daily quota, as opposed to a per-minute one.
 *
 * Gemini reports both as 429 with a ~48s `retryDelay`, but that figure is
 * meaningless for a per-day cap: waiting cannot clear it, so retrying just
 * spends a minute and a half per page to fail anyway.
 */
export function isExhaustedForToday(error: unknown): boolean {
  const message = (error as { message?: string })?.message;
  return typeof message === 'string' && /PerDay|per day|daily limit/i.test(message);
}

export function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (typeof status !== 'number' || !RETRYABLE_STATUSES.has(status)) return false;
  return !isExhaustedForToday(error);
}

/**
 * Reads the wait the API asked for, in milliseconds.
 *
 * A quota is per-minute, so exponential backoff from a few hundred milliseconds
 * never clears it — the server's own figure is the only useful one. Gemini
 * supplies it twice: as a `RetryInfo` detail and in the prose message.
 */
export function serverRequestedDelayMs(error: unknown): number | undefined {
  const message = (error as { message?: string })?.message;
  if (typeof message !== 'string') return undefined;

  // google.rpc.RetryInfo, e.g. "retryDelay":"48s"
  const retryInfo = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (retryInfo) return Math.min(Number(retryInfo[1]) * 1000, MAX_SERVER_DELAY_MS);

  // Prose fallback, e.g. "Please retry in 48.679870547s."
  const prose = message.match(/retry in (\d+(?:\.\d+)?)s/i);
  if (prose) return Math.min(Number(prose[1]) * 1000, MAX_SERVER_DELAY_MS);

  return undefined;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retries a call while it fails with a transient status.
 *
 * Gemini returns 503 "experiencing high demand" under load and 429 when the
 * quota is spent; without this a single blip drops a whole PDF page.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 3, baseDelayMs = 500, sleep = defaultSleep, onRetry } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryable(error)) throw error;

      // Exponential backoff with jitter, so parallel pages don't retry in lockstep.
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jittered = Math.round(backoff * (0.5 + Math.random() / 2));

      // Never wait less than the server asked for; that is a quota window, not a blip.
      const requested = serverRequestedDelayMs(error);
      const delay = requested === undefined ? jittered : Math.max(requested, jittered);

      onRetry?.(attempt, delay, error);
      await sleep(delay);
    }
  }
  throw lastError;
}
