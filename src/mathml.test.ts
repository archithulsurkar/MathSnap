import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { JSDOM } from 'jsdom';

// DOMPurify binds to whatever `window` exists at import time, so install one first.
let sanitizeMathml: (mathml: string) => string;

before(async () => {
  const dom = new JSDOM('');
  (globalThis as unknown as { window: unknown }).window = dom.window;
  (globalThis as unknown as { document: unknown }).document = dom.window.document;
  ({ sanitizeMathml } = await import('./mathml.js'));
});

// Real output captured from the model for the image used in manual testing.
const REAL_MATHML =
  '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>E</mi><mo>=</mo>' +
  '<mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow></math>';

test('keeps genuine MathML intact', () => {
  const clean = sanitizeMathml(REAL_MATHML);
  assert.match(clean, /<math/);
  assert.match(clean, /<msup>/);
  assert.match(clean, /<mi>E<\/mi>/);
});

test('keeps entity-encoded operators', () => {
  const clean = sanitizeMathml('<math><mo>&#x00B1;</mo><msqrt><mi>x</mi></msqrt></math>');
  assert.match(clean, /<msqrt>/);
  assert.match(clean, /±/);
});

test('strips a script tag smuggled into the MathML', () => {
  const clean = sanitizeMathml('<math><mi>x</mi></math><script>alert(1)</script>');
  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /alert/);
});

test('strips an img onerror payload', () => {
  const clean = sanitizeMathml('<math><mi>x</mi><img src=x onerror="fetch(\'//evil\')"></math>');
  assert.doesNotMatch(clean, /onerror/i);
  assert.doesNotMatch(clean, /<img/i);
});

test('strips event handlers on MathML elements themselves', () => {
  const clean = sanitizeMathml('<math><mi onclick="alert(1)" onmouseover="alert(2)">x</mi></math>');
  assert.doesNotMatch(clean, /onclick/i);
  assert.doesNotMatch(clean, /onmouseover/i);
  assert.match(clean, /<mi>x<\/mi>/);
});

test('strips javascript: hrefs', () => {
  const clean = sanitizeMathml('<math><mi href="javascript:alert(1)">x</mi></math>');
  assert.doesNotMatch(clean, /javascript:/i);
});

test('returns empty string for markup that is entirely disallowed', () => {
  assert.equal(sanitizeMathml('<script>alert(1)</script>').trim(), '');
});
