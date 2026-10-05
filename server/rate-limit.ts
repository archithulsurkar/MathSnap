import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from '../src/shared/remediation.types.js';

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Seconds until the window resets. Meant for the Retry-After header. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window per-client limiter.
 *
 * The budget is derived from MAX_PDF_PAGES because one upload makes one request
 * per page: a limit equal to the page cap would let a single legitimate 10-page
 * PDF consume the entire window and 429 the user's next action.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly max: number = RATE_LIMIT_MAX,
    private readonly windowMs: number = RATE_LIMIT_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitDecision {
    const now = this.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.count += 1;
    const allowed = bucket.count <= this.max;

    return {
      allowed,
      remaining: Math.max(0, this.max - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  /** Drops expired buckets so the map cannot grow without bound. */
  prune(): void {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}
