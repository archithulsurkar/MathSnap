import assert from 'node:assert/strict';
import test from 'node:test';
import { isExhaustedForToday, isRetryable, serverRequestedDelayMs, withRetry } from './retry.js';

/** Abridged from a real Gemini free-tier 429 (quota: 5 requests/minute). */
const QUOTA_429 = Object.assign(
  new Error(
    '{"error":{"code":429,"message":"You exceeded your current quota... Please retry in 48.679870547s.",' +
      '"status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"48s"}]}}',
  ),
  { status: 429 },
);

const noSleep = async () => {};

function statusError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

test('classifies transient statuses as retryable', () => {
  assert.equal(isRetryable(statusError(503)), true, '503 overload');
  assert.equal(isRetryable(statusError(429)), true, '429 rate limited');
  assert.equal(isRetryable(statusError(500)), true);
  assert.equal(isRetryable(statusError(404)), false, 'retired model is not transient');
  assert.equal(isRetryable(statusError(401)), false, 'bad key is not transient');
  assert.equal(isRetryable(new Error('plain')), false);
});

test('returns the first successful result without sleeping', async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      return 'ok';
    },
    { sleep: noSleep },
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('recovers from a transient 503', async () => {
  // The exact failure observed in the browser run: page 1 and 3 got 503.
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw statusError(503);
      return 'recovered';
    },
    { sleep: noSleep },
  );
  assert.equal(result, 'recovered');
  assert.equal(calls, 3);
});

test('gives up after the attempt budget', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw statusError(503);
      },
      { attempts: 3, sleep: noSleep },
    ),
    /HTTP 503/,
  );
  assert.equal(calls, 3, 'exactly `attempts` calls, no more');
});

test('does not retry a non-transient error', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw statusError(404);
      },
      { sleep: noSleep },
    ),
    /HTTP 404/,
  );
  assert.equal(calls, 1, 'a retired model must fail fast');
});

test('backs off exponentially with jitter inside bounds', async () => {
  const delays: number[] = [];
  await assert.rejects(
    withRetry(async () => { throw statusError(503); }, {
      attempts: 4,
      baseDelayMs: 100,
      sleep: async (ms) => { delays.push(ms); },
    }),
  );
  assert.equal(delays.length, 3, 'one sleep between each pair of attempts');
  // Jitter is 50-100% of 100, 200, 400.
  const bounds = [[50, 100], [100, 200], [200, 400]];
  delays.forEach((delay, i) => {
    const [lo, hi] = bounds[i];
    assert.ok(delay >= lo && delay <= hi, `delay ${delay} outside [${lo}, ${hi}]`);
  });
  assert.ok(delays[2] > delays[0], 'delays grow');
});

test('reads the retry delay the API asked for', () => {
  // Exponential backoff from 500ms never clears a per-minute quota.
  assert.equal(serverRequestedDelayMs(QUOTA_429), 48_000);
});

test('falls back to the prose retry delay when RetryInfo is absent', () => {
  const error = Object.assign(new Error('Rate limited. Please retry in 12.5s.'), { status: 429 });
  assert.equal(serverRequestedDelayMs(error), 12_500);
});

test('caps an absurd server delay', () => {
  const error = Object.assign(new Error('"retryDelay":"3600s"'), { status: 429 });
  assert.equal(serverRequestedDelayMs(error), 90_000);
});

test('returns undefined when no delay is advertised', () => {
  assert.equal(serverRequestedDelayMs(new Error('boom')), undefined);
  assert.equal(serverRequestedDelayMs(statusError(503)), undefined);
  assert.equal(serverRequestedDelayMs(null), undefined);
});

test('waits the quota window rather than the backoff', async () => {
  const delays: number[] = [];
  await assert.rejects(
    withRetry(
      async () => {
        throw QUOTA_429;
      },
      {
        attempts: 2,
        baseDelayMs: 500,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    ),
  );
  assert.deepEqual(delays, [48_000], 'must honour the server figure, not the 500ms backoff');
});

test('reports each retry to onRetry', async () => {
  const seen: number[] = [];
  await assert.rejects(
    withRetry(async () => { throw statusError(429); }, {
      attempts: 3,
      sleep: noSleep,
      onRetry: (attempt) => seen.push(attempt),
    }),
  );
  assert.deepEqual(seen, [1, 2]);
});

/** Real Gemini response when the 20-requests-per-day free cap is spent. */
const DAILY_429 = Object.assign(
  new Error(
    '{"error":{"code":429,"message":"You exceeded your current quota... Please retry in 48.35s.",' +
      '"details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{' +
      '"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"20"}]}]}}',
  ),
  { status: 429 },
);

test('recognizes a daily quota, which waiting cannot clear', () => {
  assert.equal(isExhaustedForToday(DAILY_429), true);
  assert.equal(isExhaustedForToday(QUOTA_429), false, 'a per-minute quota is not a daily one');
});

test('does not retry once the daily quota is gone', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw DAILY_429;
      },
      { sleep: noSleep },
    ),
  );
  assert.equal(calls, 1, 'retrying a per-day cap wastes ~96s per page to fail anyway');
});
