/**
 * Builds the remediated document as one self-contained HTML file.
 *
 * This is the format the tool exists to produce. A `.tex` export has to be
 * compiled before anyone can read it, and the result is a PDF that is not
 * accessible unless it is also tagged — so the artefact a student actually
 * needs was two toolchain steps away, both requiring software they do not have.
 *
 * HTML with inline MathML needs none of that. It opens in any browser, offline,
 * and screen readers read the mathematics directly. Everything travels in one
 * file: markup, styles, page images as data URIs.
 */
import type { ContentBlock, Formula } from './shared/remediation.types.js';
import { latexToMathml } from './shared/latex-to-mathml.js';
import { splitInlineMath } from './inline-math.js';
import { sanitizeMathml } from './mathml.js';

export interface HtmlExportInput {
  /** The content in reading order. */
  blocks: readonly ContentBlock[];
  /** Page images as `data:` URLs, in document order. */
  pageImages: string[];
  title?: string;
  generatedAt?: Date;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * Keeps the transcription exactly as the page laid it out: every line break,
 * blank line and indent. Reflowing it into paragraphs would lose headings, list
 * items and line-per-step working that the original document relied on.
 */
function originalLayout(text: string): string {
  return `<div class="original">${withInlineMath(text.replace(/^\n+|\s+$/g, ''))}</div>`;
}

/**
 * Escapes prose and renders its `$...$` spans as MathML, so a screen reader
 * reads them as maths. A span that will not convert is shown as its source in
 * `<code>`: wrong maths read aloud is worse than visible LaTeX.
 */
function withInlineMath(text: string): string {
  return splitInlineMath(text)
    .map((segment) => {
      if (segment.kind === 'text') return escapeHtml(segment.text);
      try {
        return sanitizeMathml(latexToMathml(segment.latex, segment.display));
      } catch {
        return `<code>${escapeHtml(segment.latex)}</code>`;
      }
    })
    .join('');
}

/**
 * Deliberately plain: black text on white in the browser's default font, with
 * no panels, colours or dark mode. This file may be opened years from now, on
 * unknown software, by someone who needs it to read rather than to look
 * designed. `color-scheme: light` stops browsers from auto-darkening it.
 */
const STYLES = `
  :root { color-scheme: light; }
  body { background: #fff; color: #000; }
  img { max-width: 100%; }
  pre, .original { white-space: pre-wrap; }
`;

function renderFormula(formula: Formula, index: number): string {
  const parts: string[] = [`<h3>Formula ${index + 1}${formula.needsReview ? ' (needs review)' : ''}</h3>`];

  if (formula.needsReview) {
    parts.push(
      '<p>This formula could not be converted, so no spoken form was produced. ' +
        'The transcription below is unverified.</p>',
    );
  }

  if (formula.mathml) {
    // Labelled with the ClearSpeak text: MathML support in screen readers is
    // uneven, and the label is what a reader falls back to.
    parts.push(
      `<div role="math" aria-label="${escapeHtml(formula.description)}">${sanitizeMathml(formula.mathml)}</div>`,
    );
  }

  if (formula.description) {
    parts.push(`<p>Spoken (ClearSpeak): ${escapeHtml(formula.description)}</p>`);
  }

  if (formula.mathspeak && formula.mathspeak !== formula.description) {
    parts.push(`<p>Spoken (MathSpeak): ${escapeHtml(formula.mathspeak)}</p>`);
  }

  parts.push('<p>LaTeX:</p>', `<pre>${escapeHtml(formula.latex)}</pre>`);

  return parts.join('\n');
}

/** Renders the whole document as one HTML string with no external references. */
export function buildStandaloneHtml(input: HtmlExportInput): string {
  const title = input.title ?? 'Remediated Document';
  const generatedAt = input.generatedAt ?? new Date();
  const formulas = input.blocks.flatMap((block) => (block.kind === 'math' ? [block.formula] : []));
  const flagged = formulas.filter((formula) => formula.needsReview).length;

  const sections: string[] = [];

  if (input.blocks.length) {
    let formulaIndex = 0;
    const content = input.blocks.map((block) =>
      block.kind === 'text' ? originalLayout(block.text) : renderFormula(block.formula, formulaIndex++),
    );
    sections.push(`<h2>Content</h2>\n${content.join('\n')}`);
  }

  if (input.pageImages.length) {
    const figures = input.pageImages
      .map(
        (dataUrl, index) =>
          `<p>Original page ${index + 1}</p>\n` +
          `<p><img src="${dataUrl}" alt="Page ${index + 1} of the original document"></p>`,
      )
      .join('\n');
    sections.push(`<h2>Original pages</h2>\n${figures}`);
  }

  const summary = [
    `${formulas.length} formula${formulas.length === 1 ? '' : 's'}`,
    `${input.pageImages.length} page${input.pageImages.length === 1 ? '' : 's'}`,
    flagged ? `${flagged} needing review` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(summary)} · generated ${escapeHtml(generatedAt.toISOString().slice(0, 10))} ·
speech generated from MathML by rule, not written by a language model</p>
${sections.join('\n\n')}
</body>
</html>
`;
}
