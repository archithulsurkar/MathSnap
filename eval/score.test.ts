import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeLatex } from './canonical.js';
import { scoreFormula } from './score.js';

test('notation differences that denote the same maths compare equal', () => {
  // Every pair here would fail a string diff, which is why the benchmark does
  // not use one.
  const equivalent: Array<[string, string]> = [
    ['\\frac{1}{2}', '\\dfrac{1}{2}'],
    ['x^2', 'x^{2}'],
    ['(x+1)', '\\left(x+1\\right)'],
    ['a+b', 'a + b'],
    ['x-1', 'x−1'],
  ];

  for (const [expected, predicted] of equivalent) {
    const score = scoreFormula(expected, predicted);
    assert.equal(score.exact, true, `${expected} should equal ${predicted}`);
    assert.equal(score.similarity, 1);
  }
});

test('real differences do not compare equal', () => {
  const different: Array<[string, string]> = [
    ['x^{2}', 'x^{3}'],
    ['a_{1}', 'a_{2}'],
    ['\\frac{a}{b}', '\\frac{b}{a}'],
    ['E = mc^{2}', 'E = mc'],
  ];

  for (const [expected, predicted] of different) {
    assert.equal(scoreFormula(expected, predicted).exact, false, `${expected} vs ${predicted}`);
  }
});

test('similarity separates a near miss from a wrong answer', () => {
  const nearMiss = scoreFormula('x = a_{1} + a_{2} + a_{3}', 'x = a_{1} + a_{2} + a_{4}');
  const wrong = scoreFormula('x = a_{1} + a_{2} + a_{3}', '\\int_{0}^{1} f(x) dx');

  assert.ok(nearMiss.similarity > 0.8, `near miss scored ${nearMiss.similarity}`);
  assert.ok(wrong.similarity < 0.5, `wrong answer scored ${wrong.similarity}`);
  assert.ok(nearMiss.similarity > wrong.similarity);
});

test('an unparseable prediction scores zero instead of throwing', () => {
  // A backend emitting broken LaTeX is answering the benchmark's question, badly.
  const score = scoreFormula('x^{2}', '\\frac{1}');
  assert.deepEqual(score, { exact: false, similarity: 0, unparseable: true });
});

test('unparseable ground truth throws, because that is a dataset bug', () => {
  assert.throws(() => scoreFormula('\\frac{1}', 'x^{2}'));
});

test('canonical form ignores annotations carrying the source LaTeX', () => {
  // temml embeds the original LaTeX in <annotation>; leaving it in would make
  // every comparison a string diff wearing a disguise.
  assert.doesNotMatch(canonicalizeLatex('x^{2}'), /annotation/);
  assert.equal(canonicalizeLatex('x^{2}'), canonicalizeLatex('x^2'));
});
