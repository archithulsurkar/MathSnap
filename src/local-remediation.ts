/**
 * Remediation with no model, no key and no network.
 *
 * Paste LaTeX, get MathML and a standards-conformant spoken description. This
 * is the whole pipeline minus transcription, and transcription is the only part
 * that ever needed a model — so this path runs instantly, offline, with nothing
 * installed.
 *
 * It also means the tool does something useful the moment it loads, and asks
 * for a provider only when handed a page image it has to read.
 */
import { enrichFormulas } from './shared/enrich.js';
import type { RemediationResult } from './shared/remediation.types.js';

/**
 * Splits pasted input into individual formulas.
 *
 * Display-math delimiters win when present, since that is how a formula arrives
 * when copied out of a document. Otherwise one formula per non-blank line,
 * which is what people type.
 */
export function splitFormulas(input: string): string[] {
  const text = input.trim();
  if (!text) return [];

  const delimited = [...text.matchAll(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g)]
    .map((match) => (match[1] ?? match[2]).trim())
    .filter(Boolean);

  if (delimited.length) return delimited;

  return text
    .split('\n')
    .map((line) => line.trim().replace(/^\$+|\$+$/g, '').trim())
    .filter(Boolean);
}

/** Runs the deterministic pipeline over pasted LaTeX. */
export async function remediateLatex(input: string): Promise<RemediationResult> {
  return { originalText: '', formulas: await enrichFormulas(splitFormulas(input)) };
}

/** Loaded by the "try an example" button, so a first run needs no input at all. */
export const EXAMPLE_LATEX = [
  'x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}',
  'E = mc^{2}',
  '\\int_{0}^{1} x^{2} \\, dx = \\frac{1}{3}',
  'H_{2}O + CO_{2} \\rightarrow H_{2}CO_{3}',
].join('\n');
