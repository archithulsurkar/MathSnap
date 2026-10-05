import assert from 'node:assert/strict';
import test from 'node:test';
import { MathmlConversionError, latexToMathml } from './latex-to-mathml.js';

test('renders a formula as MathML', () => {
  const mathml = latexToMathml('E = mc^2');
  assert.match(mathml, /^<math/);
  assert.match(mathml, /<msup>/);
});

test('marks display mode', () => {
  assert.match(latexToMathml('x = 1', true), /display="block"/);
  assert.doesNotMatch(latexToMathml('x = 1', false), /display="block"/);
});

test('handles the constructs the normalizer produces', () => {
  // normalizeLatex turns the model's Unicode into exactly these commands, so
  // anything it emits has to survive conversion.
  const mathml = latexToMathml('x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}');
  assert.match(mathml, /<mfrac>/);
  assert.match(mathml, /<msqrt>/);
});

test('throws rather than emitting error markup', () => {
  // temml's alternative is red error markup, which would be spoken aloud as if
  // it were mathematics.
  assert.throws(() => latexToMathml('\\frac{1}'), MathmlConversionError);
});

test('conversion error carries the offending LaTeX', () => {
  try {
    latexToMathml('\\nosuchcommand{x}');
    assert.fail('expected a MathmlConversionError');
  } catch (error) {
    assert.ok(error instanceof MathmlConversionError);
    assert.equal(error.latex, '\\nosuchcommand{x}');
  }
});
