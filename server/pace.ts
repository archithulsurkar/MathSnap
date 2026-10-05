/**
 * Spaces outbound model calls so a provider's requests-per-minute limit is not
 * exceeded in the first place.
 *
 * Retrying after a 429 recovers, but it wastes a whole quota window: Gemini's
 * free tier answers a burst of page uploads with "retry in 48s". Holding each
 * request until its slot is cheaper than earning the rejection.
 */
export class Pacer {
  private readonly minIntervalMs: number;
  /** When the next call may start. Serialized, so callers queue in order. */
  private nextSlot = 0;

  constructor(
    requestsPerMinute: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    // 0 or less means "no pacing".
    this.minIntervalMs = requestsPerMinute > 0 ? Math.ceil(60_000 / requestsPerMinute) : 0;
  }

  /** Milliseconds the next caller would have to wait right now. */
  get waitMs(): number {
    return Math.max(0, this.nextSlot - this.now());
  }

  async wait(): Promise<number> {
    if (this.minIntervalMs === 0) return 0;

    const now = this.now();
    const start = Math.max(now, this.nextSlot);
    // Claim this slot before awaiting so concurrent callers do not share it.
    this.nextSlot = start + this.minIntervalMs;

    const delay = start - now;
    if (delay > 0) await this.sleep(delay);
    return delay;
  }
}
