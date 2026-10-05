import assert from 'node:assert/strict';
import test from 'node:test';
import { EXAMPLE_LATEX, remediateLatex, splitFormulas } from './local-remediation.js';

test('splits one formula per line', () => {
  assert.deepEqual(splitFormulas('E = mc^2\nx = y + 1'), ['E = mc^2', 'x = y + 1']);
});

test('ignores blank lines and surrounding whitespace', () => {
  assert.deepEqual(splitFormulas('\n  E = mc^2  \n\n\n  x = 1\n'), ['E = mc^2', 'x = 1']);
});

test('strips inline dollar delimiters', () => {
  assert.deepEqual(splitFormulas('$E = mc^2$'), ['E = mc^2']);
});

test('prefers display-math blocks when present', () => {
  // How a formula arrives when copied out of a document, newlines and all.
  const input = 'Some prose\n$$\nE = mc^2\n$$\nmore prose\n\\[ x = 1 \\]';
  assert.deepEqual(splitFormulas(input), ['E = mc^2', 'x = 1']);
});

test('returns nothing for empty input', () => {
  assert.deepEqual(splitFormulas('   \n  '), []);
});

test('remediates pasted latex with no model or network', async () => {
  const result = await remediateLatex('\\frac{1}{2}');
  assert.equal(result.formulas.length, 1);
  assert.equal(result.formulas[0].description, 'one half');
  assert.match(result.formulas[0].mathml, /^<math/);
  assert.equal(result.formulas[0].needsReview, false);
});

test('normalizes unicode maths on the paste path too', async () => {
  const result = await remediateLatex('x = ±√2');
  assert.equal(result.formulas[0].latex, 'x = \\pm \\sqrt{2}');
});

test('flags unconvertible input instead of throwing', async () => {
  const result = await remediateLatex('\\frac{1}');
  assert.equal(result.formulas[0].needsReview, true);
});

test('the bundled example produces four usable formulas', async () => {
  // The "try an example" button must never land a first-time user on an error.
  const result = await remediateLatex(EXAMPLE_LATEX);
  assert.equal(result.formulas.length, 4);
  for (const formula of result.formulas) {
    assert.equal(formula.needsReview, false, `${formula.latex} failed to convert`);
    assert.match(formula.description, /\S/);
  }
});
