import assert from 'node:assert/strict';
import test from 'node:test';
import { blocksFromResult, countFormulas, resultFromBlocks } from './blocks.js';
import type { Formula } from './shared/remediation.types.js';

const formula = (latex: string): Formula => ({
  latex,
  mathml: '<math></math>',
  description: latex,
  mathspeak: latex,
  needsReview: false,
});

test('blocksFromResult puts the text first, then each formula', () => {
  const blocks = blocksFromResult({ originalText: 'Intro', formulas: [formula('a'), formula('b')] });
  assert.deepEqual(
    blocks.map((block) => (block.kind === 'text' ? `text:${block.text}` : `math:${block.formula.latex}`)),
    ['text:Intro', 'math:a', 'math:b'],
  );
});

test('blocksFromResult drops blank text', () => {
  assert.deepEqual(blocksFromResult({ originalText: '  \n', formulas: [] }), []);
  assert.equal(blocksFromResult({ originalText: '', formulas: [formula('a')] }).length, 1);
});

test('resultFromBlocks joins text with blank lines and keeps formula order', () => {
  const result = resultFromBlocks([
    { kind: 'text', text: 'one' },
    { kind: 'math', formula: formula('a') },
    { kind: 'text', text: 'two' },
    { kind: 'math', formula: formula('b') },
  ]);
  assert.equal(result.originalText, 'one\n\ntwo');
  assert.deepEqual(result.formulas.map((f) => f.latex), ['a', 'b']);
});

test('blocks round-trip through a result', () => {
  const original = { originalText: 'Intro', formulas: [formula('a')] };
  assert.deepEqual(resultFromBlocks(blocksFromResult(original)), original);
});

test('countFormulas counts maths blocks only', () => {
  assert.equal(countFormulas([{ kind: 'text', text: 'x' }, { kind: 'math', formula: formula('a') }]), 1);
});
