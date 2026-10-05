import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLatexDocument, escapeLatex, pageImageFilename, textWithInlineMath, toDisplayMath } from './latex.js';
import type { Formula } from './shared/remediation.types.js';

test('escapeLatex does not re-escape braces it introduces', () => {
  // The chained-replace version produced \textbackslash\{\}, which prints literally.
  assert.equal(escapeLatex('a \\ b'), 'a \\textbackslash{} b');
  assert.equal(escapeLatex('~'), '\\textasciitilde{}');
  assert.equal(escapeLatex('^'), '\\textasciicircum{}');
});

test('escapeLatex escapes every special character once', () => {
  assert.equal(escapeLatex('100% of $5 & #3'), '100\\% of \\$5 \\& \\#3');
  assert.equal(escapeLatex('a_b {c}'), 'a\\_b \\{c\\}');
});

test('escapeLatex leaves ordinary text alone', () => {
  assert.equal(escapeLatex('Ohm law: V = IR'), 'Ohm law: V = IR');
});

test('escapeLatex converts unicode maths that inputenc cannot compile', () => {
  // Verbatim transcription from the local model. Left as-is, pdflatex aborts on √.
  const transcription = 'x = (-b ± √(b² - 4ac)) / 2a';
  const out = escapeLatex(transcription);
  assert.doesNotMatch(out, /[±√²]/, `unicode survived: ${out}`);
  assert.equal(out, 'x = (-b $\\pm$ $\\surd$(b\\textsuperscript{2} - 4ac)) / 2a');
});

test('escapeLatex converts arrows, greek and subscripts in prose', () => {
  assert.equal(escapeLatex('2H₂ + O₂ → 2H₂O'), '2H\\textsubscript{2} + O\\textsubscript{2} $\\rightarrow$ 2H\\textsubscript{2}O');
  assert.equal(escapeLatex('ΔS is entropy'), '$\\Delta$S is entropy');
});

test('escapeLatex leaves nothing inputenc would reject', () => {
  // Characters outside the original table that used to abort pdflatex.
  const out = escapeLatex('x ∈ A ⊂ B, ∀ε ⇒ f′(x) … “so” — done ‘ok’ – 1');
  assert.doesNotMatch(out, /[∈⊂∀⇒′…“”—‘’–]/, `unicode survived: ${out}`);
  assert.equal(
    out,
    "x $\\in$ A $\\subset$ B, $\\forall$$\\epsilon$ $\\Rightarrow$ f$'$(x) \\ldots{} ``so'' --- done `ok' -- 1",
  );
});

test('normalizeLatex converts set and logic symbols in formulas', () => {
  assert.equal(toDisplayMath('x ∈ A ∪ B'), '\\[\nx \\in A \\cup B\n\\]');
  assert.equal(toDisplayMath('f′(x)'), "\\[\nf'(x)\n\\]");
});

test('escapeLatex does not escape the dollars it adds for maths', () => {
  // Order matters: escaping after conversion would turn $\pm$ into \$\textbackslash{}pm\$.
  const out = escapeLatex('a ± b');
  assert.equal(out, 'a $\\pm$ b');
  assert.doesNotMatch(out, /\\\$/);
});

test('escapeLatex still escapes a literal dollar the document contained', () => {
  assert.equal(escapeLatex('costs $5 ± 1'), 'costs \\$5 $\\pm$ 1');
});

test('toDisplayMath wraps a bare formula', () => {
  assert.equal(toDisplayMath('E = mc^2'), '\\[\nE = mc^2\n\\]');
});

test('toDisplayMath peels delimiters the model adds', () => {
  assert.equal(toDisplayMath('$$E = mc^2$$'), '\\[\nE = mc^2\n\\]');
  assert.equal(toDisplayMath('$E = mc^2$'), '\\[\nE = mc^2\n\\]');
  assert.equal(toDisplayMath('\\[E = mc^2\\]'), '\\[\nE = mc^2\n\\]');
  assert.equal(toDisplayMath('\\(E = mc^2\\)'), '\\[\nE = mc^2\n\\]');
  assert.equal(toDisplayMath('  $$ E = mc^2 $$  '), '\\[\nE = mc^2\n\\]');
});

test('toDisplayMath passes math environments through unwrapped', () => {
  const align = '\\begin{align}\na &= b\\\\\nc &= d\n\\end{align}';
  assert.equal(toDisplayMath(align), align);
  const starred = '\\begin{gather*}\nx = y\n\\end{gather*}';
  assert.equal(toDisplayMath(starred), starred);
});

test('toDisplayMath normalizes unicode even if the server pass was skipped', () => {
  // Defence in depth: the export must compile regardless of how the formula arrived.
  assert.equal(toDisplayMath('x = ±√(b² - 4ac)'), '\\[\nx = \\pm \\sqrt{b^{2} - 4ac}\n\\]');
  assert.doesNotMatch(toDisplayMath('2H₂ + O₂ → 2H₂O'), /[₂→]/);
});

test('toDisplayMath normalization is idempotent', () => {
  const once = toDisplayMath('x = ±√2');
  const twice = toDisplayMath(once.replace(/^\\\[\n|\n\\\]$/g, ''));
  assert.equal(once, twice);
});

test('toDisplayMath does not mistake a leading $ for a delimiter pair', () => {
  // "$5" has no closing delimiter, so nothing should be peeled.
  assert.equal(toDisplayMath('$5'), '\\[\n$5\n\\]');
});

test('pageImageFilename is 1-based', () => {
  assert.equal(pageImageFilename(0), 'page-1.png');
  assert.equal(pageImageFilename(9), 'page-10.png');
});

test('textWithInlineMath keeps inline maths and escapes only the prose', () => {
  assert.equal(
    textWithInlineMath(String.raw`50% of $x^{2} \pm 1$ & more`),
    String.raw`50\% of $x^{2} \pm 1$ \& more`,
  );
});

test('textWithInlineMath normalizes unicode inside the maths', () => {
  assert.equal(textWithInlineMath('so $x = ±√2$'), String.raw`so $x = \pm \sqrt{2}$`);
});

test('textWithInlineMath keeps money as an escaped dollar', () => {
  assert.equal(textWithInlineMath(String.raw`costs \$5 or $5 and $10`), String.raw`costs \$5 or \$5 and \$10`);
});

test('textWithInlineMath puts display maths on its own lines', () => {
  assert.equal(textWithInlineMath('see $$a = b$$ now'), 'see \n\\[\na = b\n\\]\n now');
});

const FORMULA = (latex: string, needsReview = false): Formula => ({
  latex,
  mathml: needsReview ? '' : '<math></math>',
  description: '',
  mathspeak: '',
  needsReview,
});

test('buildLatexDocument emits blocks in reading order', () => {
  const tex = buildLatexDocument({
    blocks: [
      { kind: 'text', text: 'First $a$.' },
      { kind: 'math', formula: FORMULA('E = mc^2') },
      { kind: 'text', text: 'Last.' },
    ],
    pageCount: 0,
  });
  const first = tex.indexOf('First $a$.');
  const formula = tex.indexOf('\\[\nE = mc^2\n\\]');
  const last = tex.indexOf('Last.');
  assert.ok(first > 0 && formula > first && last > formula, tex);
  assert.ok(tex.includes('\\begin{document}') && tex.trimEnd().endsWith('\\end{document}'));
  assert.ok(!tex.includes('Original Page Images'), 'no figures without pages');
});

test('buildLatexDocument adds one figure per page', () => {
  const tex = buildLatexDocument({ blocks: [], pageCount: 2 });
  assert.ok(tex.includes('page-1.png') && tex.includes('page-2.png'));
  assert.ok(!tex.includes('page-3.png'));
  assert.ok(!tex.includes('\\section*{Content}'), 'no empty content section');
});

test('buildLatexDocument marks formulas that need review', () => {
  const tex = buildLatexDocument({
    blocks: [{ kind: 'math', formula: FORMULA('a') }, { kind: 'math', formula: FORMULA('\\bad{', true) }],
    pageCount: 0,
  });
  assert.match(tex, /% Formula 2 needs review/);
  assert.doesNotMatch(tex, /% Formula 1 needs review/);
});
