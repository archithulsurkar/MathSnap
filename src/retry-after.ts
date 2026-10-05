/** Waits longer than this are not worth holding the page for; the user can retry. */
export const MAX_RETRY_WAIT_MS = 65_000;

/** Used when a 429 carries no usable `Retry-After`. */
export const DEFAULT_RETRY_WAIT_MS = 10_000;

/**
 * How long a `Retry-After` header asks the client to wait, in milliseconds.
 *
 * The header is either whole seconds or an HTTP date. A missing or unreadable
 * value falls back to a short default; anything past `MAX_RETRY_WAIT_MS`
 * returns null, meaning "do not wait, report the error".
 */
export function retryAfterMs(header: string | null, now: number = Date.now()): number | null {
  let wait = DEFAULT_RETRY_WAIT_MS;

  const value = header?.trim();
  if (value) {
    if (/^\d+$/.test(value)) {
      wait = Number(value) * 1000;
    } else {
      const date = Date.parse(value);
      if (!Number.isNaN(date)) wait = Math.max(0, date - now);
    }
  }

  return wait > MAX_RETRY_WAIT_MS ? null : wait;
}
