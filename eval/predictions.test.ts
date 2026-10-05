import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePredictions } from './predictions.js';

test('reads the plain latex shape', () => {
  const predictions = parsePredictions('{"id":"a","latex":"x^{2}"}\n');
  assert.deepEqual(predictions.get('a'), { id: 'a', latex: 'x^{2}' });
});

test('reads the app response shape and takes the first formula', () => {
  const predictions = parsePredictions(
    '{"id":"a","originalText":"","formulas":[{"latex":"y"},{"latex":"z"}]}',
  );
  assert.equal(predictions.get('a')?.latex, 'y');
});

test('treats null latex and an empty formulas array as no formula', () => {
  const predictions = parsePredictions('{"id":"a","latex":null}\n{"id":"b","formulas":[]}');
  assert.equal(predictions.get('a')?.latex, null);
  assert.equal(predictions.get('b')?.latex, null);
});

test('keeps backslashes in the latex', () => {
  const predictions = parsePredictions(String.raw`{"id":"a","latex":"\\frac{1}{2}"}`);
  assert.equal(predictions.get('a')?.latex, String.raw`\frac{1}{2}`);
});

test('skips blank lines and accepts CRLF', () => {
  const predictions = parsePredictions('{"id":"a","latex":"1"}\r\n\r\n{"id":"b","latex":"2"}\r\n');
  assert.deepEqual([...predictions.keys()], ['a', 'b']);
});

test('rejects bad lines with their line number', () => {
  assert.throws(() => parsePredictions('{"id":"a","latex":"1"}\nnot json'), /line 2: not valid JSON/);
  assert.throws(() => parsePredictions('["a"]'), /line 1: expected a JSON object/);
  assert.throws(() => parsePredictions('{"latex":"1"}'), /line 1: missing "id"/);
  assert.throws(() => parsePredictions('{"id":"a"}'), /needs "latex" or "formulas"/);
  assert.throws(() => parsePredictions('{"id":"a","latex":3}'), /"latex" must be a string or null/);
  assert.throws(() => parsePredictions('{"id":"a","formulas":[{}]}'), /formulas\[0\]\.latex/);
});

test('rejects a repeated id', () => {
  assert.throws(
    () => parsePredictions('{"id":"a","latex":"1"}\n{"id":"a","latex":"2"}'),
    /line 2: duplicate id "a"/,
  );
});
