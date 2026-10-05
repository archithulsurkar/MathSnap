import assert from 'node:assert/strict';
import test from 'node:test';
import { hasInlineMath, splitInlineMath } from './inline-math.js';

test('splits prose and inline maths', () => {
  assert.deepEqual(splitInlineMath(String.raw`the roots are $x = \pm 2$ here`), [
    { kind: 'text', text: 'the roots are ' },
    { kind: 'math', latex: String.raw`x = \pm 2`, display: false },
    { kind: 'text', text: ' here' },
  ]);
});

test('text with no maths is one prose segment', () => {
  assert.deepEqual(splitInlineMath('plain words'), [{ kind: 'text', text: 'plain words' }]);
  assert.deepEqual(splitInlineMath(''), []);
});

test('several spans, at the edges', () => {
  assert.deepEqual(splitInlineMath('$a$ and $b$'), [
    { kind: 'math', latex: 'a', display: false },
    { kind: 'text', text: ' and ' },
    { kind: 'math', latex: 'b', display: false },
  ]);
});

test('display maths between double dollars', () => {
  assert.deepEqual(splitInlineMath(String.raw`so $$\int_0^1 f$$ holds`), [
    { kind: 'text', text: 'so ' },
    { kind: 'math', latex: String.raw`\int_0^1 f`, display: true },
    { kind: 'text', text: ' holds' },
  ]);
});

test('an escaped dollar is a literal dollar sign', () => {
  assert.deepEqual(splitInlineMath(String.raw`costs \$5 and \$10`), [{ kind: 'text', text: 'costs $5 and $10' }]);
});

test('money written with bare dollars stays prose', () => {
  assert.deepEqual(splitInlineMath('between $5 and $10 each'), [{ kind: 'text', text: 'between $5 and $10 each' }]);
});

test('an unclosed dollar stays prose', () => {
  assert.deepEqual(splitInlineMath('price: $x + 1'), [{ kind: 'text', text: 'price: $x + 1' }]);
  assert.deepEqual(splitInlineMath('$$ never closed'), [{ kind: 'text', text: '$$ never closed' }]);
});

test('an escaped dollar inside maths does not close it', () => {
  assert.deepEqual(splitInlineMath(String.raw`$a \$ b$`), [{ kind: 'math', latex: String.raw`a \$ b`, display: false }]);
});

test('empty spans are prose', () => {
  assert.deepEqual(splitInlineMath('$ $'), [{ kind: 'text', text: '$ $' }]);
});

test('maths may span a line break', () => {
  assert.deepEqual(splitInlineMath('$a +\nb$'), [{ kind: 'math', latex: 'a +\nb', display: false }]);
});

test('hasInlineMath', () => {
  assert.equal(hasInlineMath('$x$'), true);
  assert.equal(hasInlineMath('$5 and $10'), false);
});
