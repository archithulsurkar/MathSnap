import assert from 'node:assert/strict';
import test from 'node:test';
import { Pacer } from './pace.js';

/**
 * Drives a virtual clock so the tests never actually sleep.
 *
 * `advanceOnSleep` models sequential callers, where real time passes while one
 * waits. Turn it off to model callers waiting simultaneously against a frozen
 * clock, which is what concurrent requests actually do.
 */
function makePacer(rpm: number, { advanceOnSleep = true } = {}) {
  let now = 1_000_000;
  const slept: number[] = [];
  const pacer = new Pacer(
    rpm,
    () => now,
    async (ms) => {
      slept.push(ms);
      if (advanceOnSleep) now += ms;
    },
  );
  return { pacer, slept, advance: (ms: number) => (now += ms) };
}

test('the first call is not delayed', async () => {
  const { pacer, slept } = makePacer(10);
  assert.equal(await pacer.wait(), 0);
  assert.deepEqual(slept, []);
});

test('spaces calls to the requested rate', async () => {
  // 10 rpm means one call every 6 seconds.
  const { pacer } = makePacer(10);
  assert.equal(await pacer.wait(), 0);
  assert.equal(await pacer.wait(), 6000);
  assert.equal(await pacer.wait(), 6000);
});

test('a slower limit spaces calls further apart', async () => {
  // Gemini's free tier: 5 rpm is one call every 12 seconds.
  const { pacer } = makePacer(5);
  await pacer.wait();
  assert.equal(await pacer.wait(), 12_000);
});

test('time already elapsed counts toward the interval', async () => {
  const { pacer, advance } = makePacer(10);
  await pacer.wait();
  advance(6000); // a slow generation covered the whole window
  assert.equal(await pacer.wait(), 0, 'no extra wait when the interval already passed');
});

test('partially elapsed time shortens the wait', async () => {
  const { pacer, advance } = makePacer(10);
  await pacer.wait();
  advance(2000);
  assert.equal(await pacer.wait(), 4000);
});

test('concurrent callers each get their own slot', async () => {
  // Frozen clock: all three ask at the same instant.
  const { pacer } = makePacer(10, { advanceOnSleep: false });
  const waits = await Promise.all([pacer.wait(), pacer.wait(), pacer.wait()]);
  // Slots are claimed before awaiting, so no two callers collide on one.
  assert.deepEqual(waits, [0, 6000, 12_000]);
});

test('zero or negative rpm disables pacing', async () => {
  for (const rpm of [0, -1]) {
    const { pacer, slept } = makePacer(rpm);
    assert.equal(await pacer.wait(), 0);
    assert.equal(await pacer.wait(), 0);
    assert.deepEqual(slept, []);
  }
});

test('waitMs reports the current queue delay without consuming a slot', async () => {
  const { pacer } = makePacer(10);
  await pacer.wait();
  assert.equal(pacer.waitMs, 6000);
  assert.equal(pacer.waitMs, 6000, 'reading it twice must not advance the queue');
});
