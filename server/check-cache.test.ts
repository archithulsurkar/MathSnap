import assert from 'node:assert/strict';
import test from 'node:test';
import { CheckCache, type CheckResult } from './provider.js';

function makeCache(ttlMs = 60_000) {
  let now = 1_000_000;
  return { cache: new CheckCache(ttlMs, () => now), advance: (ms: number) => (now += ms) };
}

test('probes once and reuses the answer within the TTL', async () => {
  // The point of the cache: /api/health is unauthenticated, and each probe is a
  // billable or rate-limited upstream call.
  const { cache } = makeCache();
  let probes = 0;
  const probe = async (): Promise<CheckResult> => {
    probes++;
    return { ok: true, detail: 'ready' };
  };

  for (let i = 0; i < 50; i++) await cache.run(probe);

  assert.equal(probes, 1, '50 health hits must not become 50 upstream calls');
});

test('re-probes once the TTL expires', async () => {
  const { cache, advance } = makeCache(60_000);
  let probes = 0;
  const probe = async (): Promise<CheckResult> => ({ ok: true, detail: `probe ${++probes}` });

  await cache.run(probe);
  advance(59_000);
  await cache.run(probe);
  assert.equal(probes, 1, 'still inside the window');

  advance(2000);
  await cache.run(probe);
  assert.equal(probes, 2);
});

test('caches a permanent failure so a bad config is not re-probed in a loop', async () => {
  const { cache } = makeCache();
  let probes = 0;
  const probe = async (): Promise<CheckResult> => {
    probes++;
    return { ok: false, detail: 'model retired' };
  };

  const first = await cache.run(probe);
  const second = await cache.run(probe);

  assert.equal(probes, 1);
  assert.equal(second.detail, first.detail);
});

test('does not cache a transient failure', async () => {
  // A network blip says nothing lasting; pinning it would keep the provider
  // marked down for the whole TTL after it recovered.
  const { cache } = makeCache();
  let probes = 0;
  const probe = async (): Promise<CheckResult> => {
    probes++;
    return probes === 1
      ? { ok: false, cache: false, detail: 'connection reset' }
      : { ok: true, detail: 'ready' };
  };

  const first = await cache.run(probe);
  assert.equal(first.ok, false);

  const second = await cache.run(probe);
  assert.equal(second.ok, true, 'recovery must be visible immediately');
  assert.equal(probes, 2);
});

test('returns the value the probe produced', async () => {
  const { cache } = makeCache();
  const result = await cache.run(async () => ({ ok: true, detail: 'gpt-x responding' }));
  assert.deepEqual(result, { ok: true, detail: 'gpt-x responding' });
});

test('a rejected probe is not cached', async () => {
  const { cache } = makeCache();
  let probes = 0;
  const probe = async (): Promise<CheckResult> => {
    probes++;
    if (probes === 1) throw new Error('boom');
    return { ok: true, detail: 'ready' };
  };

  await assert.rejects(cache.run(probe), /boom/);
  assert.equal((await cache.run(probe)).ok, true);
  assert.equal(probes, 2);
});
