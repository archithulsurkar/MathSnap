import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROVIDER_PRESETS,
  customUrlAllowed,
  findPreset,
  isAcceptableCustomUrl,
  isPlausibleModelId,
} from './provider-presets.js';

test('every preset is usable as offered', () => {
  for (const preset of PROVIDER_PRESETS) {
    assert.ok(preset.id && preset.label && preset.note, `${preset.id} is incomplete`);
    assert.ok(isPlausibleModelId(preset.defaultModel), `${preset.id} has an odd default model`);
    // A hosted preset without somewhere to get a key is a dead end for a layman.
    if (preset.needsKey) assert.ok(preset.keyUrl, `${preset.id} needs a keyUrl`);
    if (preset.kind === 'openai') assert.ok(preset.baseUrl, `${preset.id} needs a baseUrl`);
  }
});

test('preset ids are unique', () => {
  const ids = PROVIDER_PRESETS.map((preset) => preset.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('only the local preset runs without a key', () => {
  const keyless = PROVIDER_PRESETS.filter((preset) => !preset.needsKey).map((preset) => preset.id);
  assert.deepEqual(keyless, ['ollama']);
});

test('finds presets by id and rejects unknown ones', () => {
  assert.equal(findPreset('groq')?.kind, 'openai');
  assert.equal(findPreset('../../etc/passwd'), undefined);
  assert.equal(findPreset(''), undefined);
});

test('model ids are constrained to the shape real ones take', () => {
  assert.ok(isPlausibleModelId('gpt-4o-mini'));
  assert.ok(isPlausibleModelId('qwen/qwen2.5-vl-72b-instruct'));
  assert.ok(isPlausibleModelId('qwen2.5vl:7b'));

  assert.equal(isPlausibleModelId(''), false);
  assert.equal(isPlausibleModelId('model with spaces'), false);
  assert.equal(isPlausibleModelId('model\nInjected: header'), false);
  assert.equal(isPlausibleModelId('x'.repeat(200)), false);
});

test('custom endpoints are refused unless the operator opts in', () => {
  // The browser supplies this value, so unconstrained it is server-side request
  // forgery: a deployed instance could be aimed at internal addresses.
  delete process.env.ALLOW_CUSTOM_PROVIDER_URL;
  assert.equal(customUrlAllowed(), false);

  process.env.ALLOW_CUSTOM_PROVIDER_URL = 'true';
  assert.equal(customUrlAllowed(), true);
  delete process.env.ALLOW_CUSTOM_PROVIDER_URL;
});

test('a permitted custom endpoint must still be https and credential-free', () => {
  assert.ok(isAcceptableCustomUrl('https://example.com/v1'));
  // Self-hosted endpoints live on loopback, so plain http is allowed there only.
  assert.ok(isAcceptableCustomUrl('http://localhost:8000/v1'));
  assert.ok(isAcceptableCustomUrl('http://127.0.0.1:8000/v1'));

  assert.equal(isAcceptableCustomUrl('http://example.com/v1'), false, 'plaintext to a remote host');
  assert.equal(isAcceptableCustomUrl('https://user:pass@example.com/v1'), false, 'embedded credentials');
  assert.equal(isAcceptableCustomUrl('file:///etc/passwd'), false);
  assert.equal(isAcceptableCustomUrl('not a url'), false);
});
