import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_RETRY_WAIT_MS, retryAfterMs } from './retry-after.js';

test('reads whole seconds', () => {
  assert.equal(retryAfterMs('12'), 12_000);
  assert.equal(retryAfterMs(' 0 '), 0);
});

test('reads an HTTP date relative to now', () => {
  const now = Date.parse('Mon, 05 Oct 2026 12:00:00 GMT');
  assert.equal(retryAfterMs('Mon, 05 Oct 2026 12:00:30 GMT', now), 30_000);
  assert.equal(retryAfterMs('Mon, 05 Oct 2026 11:00:00 GMT', now), 0, 'a past date means now');
});

test('falls back to a short default when the header is missing or unreadable', () => {
  assert.equal(retryAfterMs(null), DEFAULT_RETRY_WAIT_MS);
  assert.equal(retryAfterMs(''), DEFAULT_RETRY_WAIT_MS);
  assert.equal(retryAfterMs('soon'), DEFAULT_RETRY_WAIT_MS);
});

test('refuses to wait too long', () => {
  assert.equal(retryAfterMs('3600'), null);
});
