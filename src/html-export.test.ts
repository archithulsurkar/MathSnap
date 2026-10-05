import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { JSDOM } from 'jsdom';
import { blocksFromResult } from './blocks.js';
import type { ContentBlock, Formula } from './shared/remediation.types.js';

// DOMPurify binds to whatever `window` exists at import time, so install one first.
let buildStandaloneHtml: (input: {
  blocks: readonly ContentBlock[];
  pageImages: string[];
  title?: string;
  generatedAt?: Date;
}) => string;
let escapeHtml: (text: string) => string;

before(async () => {
  const dom = new JSDOM('');
  (globalThis as unknown as { window: unknown }).window = dom.window;
  (globalThis as unknown as { document: unknown }).document = dom.window.document;
  ({ buildStandaloneHtml, escapeHtml } = await import('./html-export.js'));
});

const FORMULA: Formula = {
  latex: '\\frac{1}{2}',
  mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>',
  description: 'one half',
  mathspeak: 'StartFraction 1 Over 2 EndFraction',
  needsReview: false,
};

interface BuildOptions {
  originalText?: string;
  formulas?: Formula[];
  blocks?: ContentBlock[];
  pageImages?: string[];
}

/** Whole-page shape by default; pass `blocks` to test an explicit reading order. */
function build({ originalText = 'Some text.', formulas = [FORMULA], blocks, pageImages = [] }: BuildOptions = {}): string {
  return buildStandaloneHtml({
    blocks: blocks ?? blocksFromResult({ originalText, formulas }),
    pageImages,
    generatedAt: new Date('2026-09-24T00:00:00Z'),
  });
}

test('is a complete standalone document', () => {
  const html = build();
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<style>/);
  assert.match(html, /<\/html>\s*$/);
});

test('references nothing external', () => {
  // The whole point: it must open offline, years from now, with no network.
  const html = build({ pageImages: ['data:image/png;base64,iVBORw0KGgo='] });
  assert.doesNotMatch(html, /<link\b/);
  assert.doesNotMatch(html, /<script\b/);
  assert.doesNotMatch(html, /src="(?!data:)/);
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/);
});

test('embeds MathML as live markup, not escaped text', () => {
  const html = build();
  assert.match(html, /<mfrac>/);
  assert.doesNotMatch(html, /&lt;mfrac&gt;/);
});

test('labels the rendered maths with the spoken description', () => {
  // Screen-reader MathML support is uneven; the label is the fallback.
  assert.match(build(), /role="math" aria-label="one half"/);
});

test('carries every representation', () => {
  const html = build();
  assert.match(html, /one half/);
  assert.match(html, /StartFraction/);
  assert.match(html, /\\frac\{1\}\{2\}/);
});

test('omits the MathSpeak block when it duplicates ClearSpeak', () => {
  const html = build({ formulas: [{ ...FORMULA, mathspeak: 'one half' }] });
  assert.equal(html.match(/one half/g)?.length, 2, 'aria-label and the ClearSpeak paragraph only');
  assert.doesNotMatch(html, /MathSpeak/);
});

test('marks a flagged formula and omits derived output it does not have', () => {
  const html = build({
    formulas: [
      { latex: '\\frac{1}', mathml: '', description: '', mathspeak: '', needsReview: true },
    ],
  });
  assert.match(html, /needs review/);
  assert.match(html, /could not be converted/);
  assert.doesNotMatch(html, /role="math"/);
  assert.match(html, /\\frac\{1\}/, 'the transcription is still shown so it can be fixed');
});

test('escapes text so a transcription cannot inject markup', () => {
  const html = build({ originalText: 'Let <script>alert(1)</script> be x & y' });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp; y/);
});

test('sanitizes mathml even though it is now derived, not model-written', () => {
  const html = build({
    formulas: [
      {
        ...FORMULA,
        mathml: '<math><mi onclick="alert(1)">x</mi></math>',
      },
    ],
  });
  assert.doesNotMatch(html, /onclick/);
});

test('keeps the original layout: line breaks, blank lines and indentation', () => {
  const text = '1. Kinematics\n   v = u + at\n\nSecond block.';
  const html = build({ originalText: `\n${text}\n\n` });
  assert.ok(html.includes(`<div class="original">${text}</div>`), 'text verbatim, only outer blank lines trimmed');
  assert.match(html, /\.original \{ white-space: pre-wrap; \}|pre, \.original \{ white-space: pre-wrap; \}/);
});

test('stays plain: white background, no colours, panels or dark mode', () => {
  const html = build();
  assert.match(html, /background: #fff/);
  assert.doesNotMatch(html, /prefers-color-scheme|border-radius|font-family|<section/);
});

test('embeds page images as data URIs with alt text', () => {
  const html = build({ pageImages: ['data:image/png;base64,AAA=', 'data:image/png;base64,BBB='] });
  assert.match(html, /<img src="data:image\/png;base64,AAA=" alt="Page 1 of the original document">/);
  assert.match(html, /Original page 2/);
});

test('summarises the document', () => {
  const html = build({ pageImages: ['data:image/png;base64,AAA='] });
  assert.match(html, /1 formula · 1 page/);
});

test('reports how many formulas need review', () => {
  const html = build({ formulas: [FORMULA, { ...FORMULA, needsReview: true }] });
  assert.match(html, /2 formulas · 0 pages · 1 needing review/);
});

test('renders blocks in reading order', () => {
  const html = build({
    blocks: [
      { kind: 'text', text: 'Before.' },
      { kind: 'math', formula: FORMULA },
      { kind: 'text', text: 'After.' },
    ],
  });
  const before = html.indexOf('Before.');
  const formula = html.indexOf('<mfrac>');
  const after = html.indexOf('After.');
  assert.ok(before > 0 && formula > before && after > formula);
  assert.match(html, /<h3>Formula 1<\/h3>/);
});

test('renders inline $...$ maths in text as MathML', () => {
  const html = build({ originalText: 'Half is $\\frac{1}{2}$, costs \\$5.' });
  assert.match(html, /<math[^>]*>.*<mfrac>/s);
  assert.doesNotMatch(html, /\$\\frac/, 'no raw source left in the prose');
  assert.match(html, /costs \$5\./);
});

test('shows inline maths that will not convert as code', () => {
  const html = build({ originalText: 'Broken $\\frac{1}$ here' });
  assert.match(html, /<code>\\frac\{1\}<\/code>/);
});

test('escapeHtml covers the five significant characters', () => {
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});
