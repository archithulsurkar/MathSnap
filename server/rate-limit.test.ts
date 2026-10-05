import assert from 'node:assert/strict';
import test from 'node:test';
import { RateLimiter } from './rate-limit.js';
import {
  MAX_PDF_PAGES,
  MAX_UPLOADS_PER_WINDOW,
  RATE_LIMIT_MAX,
} from '../src/shared/remediation.types.js';

/** Drives a clock the limiter reads, so the tests do not sleep. */
function makeLimiter(max = RATE_LIMIT_MAX, windowMs = 60_000) {
  let now = 1_000_000;
  const limiter = new RateLimiter(max, windowMs, () => now);
  return { limiter, advance: (ms: number) => (now += ms) };
}

test('a full-length PDF upload does not exhaust the window', () => {
  // The bug: RATE_LIMIT_MAX === MAX_PDF_PAGES meant page 10 used the last slot
  // and the user's next action 429'd.
  const { limiter } = makeLimiter();

  for (let page = 1; page <= MAX_PDF_PAGES; page++) {
    assert.equal(limiter.check('ip').allowed, true, `page ${page} should be allowed`);
  }

  assert.equal(limiter.check('ip').allowed, true, 'the request after a full PDF must still pass');
});

test('budget covers MAX_UPLOADS_PER_WINDOW full-length uploads', () => {
  const { limiter } = makeLimiter();

  for (let upload = 1; upload <= MAX_UPLOADS_PER_WINDOW; upload++) {
    for (let page = 1; page <= MAX_PDF_PAGES; page++) {
      assert.equal(limiter.check('ip').allowed, true, `upload ${upload} page ${page}`);
    }
  }

  assert.equal(limiter.check('ip').allowed, false, 'the budget must run out eventually');
});

test('blocks past the limit and reports a retry delay', () => {
  const { limiter } = makeLimiter(2, 60_000);

  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.check('ip').allowed, true);

  const blocked = limiter.check('ip');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 60);
});

test('window resets after it elapses', () => {
  const { limiter, advance } = makeLimiter(2, 60_000);

  limiter.check('ip');
  limiter.check('ip');
  assert.equal(limiter.check('ip').allowed, false);

  advance(60_000);
  assert.equal(limiter.check('ip').allowed, true, 'a new window starts fresh');
});

test('clients are limited independently', () => {
  const { limiter } = makeLimiter(1, 60_000);

  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, false);
  assert.equal(limiter.check('b').allowed, true, 'one client must not throttle another');
});

test('prune drops only expired buckets', () => {
  const { limiter, advance } = makeLimiter(5, 60_000);

  limiter.check('a');
  advance(30_000);
  limiter.check('b');
  assert.equal(limiter.size, 2);

  advance(31_000); // 'a' has expired, 'b' has not
  limiter.prune();
  assert.equal(limiter.size, 1);
});

test('remaining counts down', () => {
  const { limiter } = makeLimiter(3, 60_000);

  assert.equal(limiter.check('ip').remaining, 2);
  assert.equal(limiter.check('ip').remaining, 1);
  assert.equal(limiter.check('ip').remaining, 0);
});
