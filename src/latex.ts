/** Pure LaTeX text helpers. No DOM or Angular dependencies, so they can be tested directly. */
import { normalizeLatex, unicodeToTextLatex } from './shared/latex-normalize.js';

const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

/** Delimiter pairs the model routinely wraps its LaTeX in. Longest first. */
const MATH_DELIMITERS: ReadonlyArray<readonly [string, string]> = [
  ['\\[', '\\]'],
  ['\\(', '\\)'],
  ['$$', '$$'],
  ['$', '$'],
];

const MATH_ENVIRONMENT =
  /^\\begin\{(equation|align|alignat|gather|multline|eqnarray|flalign|array|cases|split)\*?\}/;

/**
 * Escapes text for use in a LaTeX document body.
 *
 * Escaping is a single pass: chained replaces would re-escape the braces that
 * `\textbackslash{}` and `\textasciitilde{}` introduce.
 *
 * Mathematical Unicode is then converted to commands, because transcriptions
 * routinely contain `√`, `→` and `Δ`, and `inputenc` has no definition for
 * them — pdflatex aborts on the first one. That step runs last so the
 * backslashes and dollars it introduces are not escaped in turn.
 */
export function escapeLatex(text: string): string {
  const escaped = text.replace(/[\\&%$#_{}~^]/g, (char) => LATEX_ESCAPES[char]);
  return unicodeToTextLatex(escaped);
}

/**
 * Wraps a formula in display math, tolerating the delimiters the model adds on
 * its own. Nesting `$$…$$` or an `align` environment inside `\[…\]` fails to
 * compile, so peel the former and pass the latter through bare.
 *
 * Unicode maths is normalized here as well as on the server. The server pass is
 * the one that shapes what the UI displays; this one guarantees the exported
 * document compiles even if a formula reaches the export without it. The
 * conversion is idempotent, so running it twice is harmless.
 */
export function toDisplayMath(latex: string): string {
  let body = normalizeLatex(latex.trim());

  for (const [open, close] of MATH_DELIMITERS) {
    if (body.length > open.length + close.length && body.startsWith(open) && body.endsWith(close)) {
      body = body.slice(open.length, body.length - close.length).trim();
      break;
    }
  }

  return MATH_ENVIRONMENT.test(body) ? body : `\\[\n${body}\n\\]`;
}

/** Filename the .tex export expects for the rendered image of page `index`. */
export function pageImageFilename(index: number): string {
  return `page-${index + 1}.png`;
}
