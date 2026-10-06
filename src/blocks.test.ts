import assert from 'node:assert/strict';
import test from 'node:test';
import { blocksFromRegion, blocksFromResult, countFormulas, resultFromBlocks } from './blocks.js';
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

test('a maths box keeps its formula and drops the same formula echoed as text', () => {
  // What qwen2.5vl:7b actually returns for a crop of "v = u + at".
  const blocks = blocksFromRegion('math', { originalText: 'v = u + at', formulas: [formula('v = u + at')] });
  assert.deepEqual(blocks, [{ kind: 'math', formula: formula('v = u + at') }]);
});

test('a text box keeps its text and drops formulas listed alongside it', () => {
  const blocks = blocksFromRegion('text', { originalText: 'so $x$ holds', formulas: [formula('x')] });
  assert.deepEqual(blocks, [{ kind: 'text', text: 'so $x$ holds' }]);
});

test('a box falls back to the other field rather than losing what came back', () => {
  assert.deepEqual(blocksFromRegion('math', { originalText: 'x = 1', formulas: [] }), [{ kind: 'text', text: 'x = 1' }]);
  assert.deepEqual(blocksFromRegion('text', { originalText: ' ', formulas: [formula('a')] }), [
    { kind: 'math', formula: formula('a') },
  ]);
  assert.deepEqual(blocksFromRegion('math', { originalText: '', formulas: [] }), []);
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
