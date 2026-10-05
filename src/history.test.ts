import assert from 'node:assert/strict';
import test from 'node:test';
import { describeItem, FORMULAS_MAX, TEXT_MAX, titleFor, toHistoryInsert } from './history.js';
import type { Formula } from './shared/remediation.types.js';

const formula = (latex: string): Formula => ({ latex, mathml: '<math/>', description: 'x', mathspeak: 'x', needsReview: false });

test('titles an upload by its file name', () => {
  assert.equal(titleFor('upload', ['x^2'], 'worksheet-3.pdf'), 'worksheet-3.pdf');
});

test('titles a paste by its first formula, whitespace collapsed', () => {
  assert.equal(titleFor('paste', ['  ', 'E  =\n mc^2']), 'E = mc^2');
});

test('shortens long titles', () => {
  const title = titleFor('paste', ['x'.repeat(100)]);
  assert.equal(title.length, 60);
  assert.ok(title.endsWith('…'));
});

test('stores only LaTeX and text, never derived output', () => {
  const row = toHistoryInsert({ originalText: 'Page text', formulas: [formula('a'), formula('b')] }, 'paste', 0);
  assert.deepEqual(row, { title: 'a', source: 'paste', original_text: 'Page text', latex: ['a', 'b'], page_count: 0 });
});

test('saves nothing when there are no formulas', () => {
  assert.equal(toHistoryInsert({ originalText: 'only text', formulas: [] }, 'paste', 0), null);
  assert.equal(toHistoryInsert({ originalText: '', formulas: [formula('  ')] }, 'paste', 0), null);
});

test('clamps to the database limits', () => {
  const many = Array.from({ length: FORMULAS_MAX + 10 }, (_, i) => formula(`x_${i}`));
  const row = toHistoryInsert({ originalText: 'y'.repeat(TEXT_MAX + 5), formulas: many }, 'upload', 900, 'f.pdf');
  assert.equal(row?.latex.length, FORMULAS_MAX);
  assert.equal(row?.original_text.length, TEXT_MAX);
  assert.equal(row?.page_count, 500);
});

test('describes an item in plain words', () => {
  assert.equal(describeItem({ latex: ['a', 'b', 'c', 'd'], source: 'paste', page_count: 0 }), '4 formulas · pasted');
  assert.equal(describeItem({ latex: ['a'], source: 'upload', page_count: 3 }), '1 formula · 3 pages');
});
