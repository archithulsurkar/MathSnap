import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLatex } from './latex-normalize.js';

test('converts the quadratic formula the local model actually returned', () => {
  // Verbatim output from qwen2.5vl:7b — none of this compiles as LaTeX.
  const raw = 'x = (-b ± √(b² - 4ac)) / 2a';
  assert.equal(normalizeLatex(raw), 'x = (-b \\pm \\sqrt{b^{2} - 4ac}) / 2a');
});

test('rewrites bare radicands', () => {
  assert.equal(normalizeLatex('√2'), '\\sqrt{2}');
  assert.equal(normalizeLatex('√x + 1'), '\\sqrt{x} + 1');
});

test('handles nested radicals and parentheses', () => {
  assert.equal(normalizeLatex('√(a + √(b))'), '\\sqrt{a + \\sqrt{b}}');
  assert.equal(normalizeLatex('√((a + b) * c)'), '\\sqrt{(a + b) * c}');
});

test('collapses superscript runs into one exponent', () => {
  assert.equal(normalizeLatex('x²'), 'x^{2}');
  assert.equal(normalizeLatex('x²³'), 'x^{23}');
  assert.equal(normalizeLatex('e⁻¹'), 'e^{-1}');
});

test('converts subscripts', () => {
  assert.equal(normalizeLatex('H₂O'), 'H_{2}O');
  assert.equal(normalizeLatex('2H₂ + O₂'), '2H_{2} + O_{2}');
});

test('converts operators and relations', () => {
  assert.equal(normalizeLatex('a ≤ b'), 'a \\leq b');
  assert.equal(normalizeLatex('a ≠ b'), 'a \\neq b');
  assert.equal(normalizeLatex('3 × 4 ÷ 2'), '3 \\times 4 \\div 2');
  assert.equal(normalizeLatex('2H₂ + O₂ → 2H₂O'), '2H_{2} + O_{2} \\rightarrow 2H_{2}O');
});

test('converts greek letters', () => {
  assert.equal(normalizeLatex('ΔS = Q / T'), '\\Delta S = Q / T');
  assert.equal(normalizeLatex('λ = h / p'), '\\lambda = h / p');
});

test('normalizes the unicode minus to ASCII', () => {
  assert.equal(normalizeLatex('a − b'), 'a - b');
});

test('leaves already-valid LaTeX untouched', () => {
  const valid = 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}';
  assert.equal(normalizeLatex(valid), valid);
  assert.equal(normalizeLatex('E = mc^2'), 'E = mc^2');
  assert.equal(normalizeLatex('\\int_0^1 f(x)\\,dx'), '\\int_0^1 f(x)\\,dx');
});

test('output contains no leftover unicode math characters', () => {
  const raw = 'ΔE = ±√(x² + y²) × π ≥ ∞';
  const out = normalizeLatex(raw);
  assert.doesNotMatch(out, /[±√×÷→≤≥≠∞∑∫Δπ²₂−]/, `leftover unicode in: ${out}`);
});
