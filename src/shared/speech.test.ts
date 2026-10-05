import assert from 'node:assert/strict';
import test from 'node:test';
import { latexToMathml } from './latex-to-mathml.js';
import { renderAccessible } from './speech.js';

test('speaks a fraction the way a person reads it aloud', async () => {
  // Both rule sets special-case vulgar fractions: "one half", not
  // "StartFraction one Over two EndFraction". Where they diverge is structure,
  // which the quadratic-formula test below covers.
  const { clearspeak } = await renderAccessible(latexToMathml('\\frac{1}{2}'));
  assert.equal(clearspeak, 'one half');
});

test('ClearSpeak and MathSpeak differ in how they mark structure', async () => {
  const mathml = latexToMathml('x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}');
  const { clearspeak, mathspeak } = await renderAccessible(mathml);

  // MathSpeak brackets structure explicitly; ClearSpeak does not.
  assert.match(mathspeak, /StartFraction/);
  assert.doesNotMatch(clearspeak, /StartFraction/);
  assert.match(clearspeak, /square root/i);
});

test('is deterministic across runs', async () => {
  const mathml = latexToMathml('a^{2} + b^{2} = c^{2}');
  const first = await renderAccessible(mathml);
  const second = await renderAccessible(mathml);
  assert.deepEqual(first, second);
});

test('concurrent callers do not read each other’s engine configuration', async () => {
  // SRE's engine is a process-wide singleton reconfigured per call, so an
  // unserialized implementation returns one rule set's output where the other
  // was asked for.
  const inputs = ['\\frac{a}{b}', '\\frac{x}{y}', '\\frac{1}{n}', '\\frac{p}{q}'];
  const results = await Promise.all(
    inputs.map(async (latex) => renderAccessible(latexToMathml(latex))),
  );

  for (const result of results) {
    assert.match(result.mathspeak, /StartFraction/, 'mathspeak lost its rule set');
    assert.doesNotMatch(result.clearspeak, /StartFraction/, 'clearspeak got mathspeak output');
  }
});
