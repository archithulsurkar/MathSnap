/**
 * The result as an ordered list of text and maths, which is what a reader
 * gets: the results view and both exports walk this list in order.
 *
 * The server still answers each request with a `RemediationResult`. These
 * helpers turn one of those into blocks, and turn blocks back into a single
 * result where a flat shape is needed (history, counts).
 */
import type { ContentBlock, RegionKind, RemediationResult } from './shared/remediation.types.js';

export type { ContentBlock } from './shared/remediation.types.js';

/**
 * Text first, then every formula: the order the page-level prompt returns
 * them in, since it has no way to say where on the page each formula sat.
 */
export function blocksFromResult(result: RemediationResult): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (result.originalText.trim()) blocks.push({ kind: 'text', text: result.originalText });
  for (const formula of result.formulas) blocks.push({ kind: 'math', formula });
  return blocks;
}

/**
 * One box, read with the prompt for its kind.
 *
 * Models fill both fields anyway: qwen2.5vl answers a maths box with the
 * formula as LaTeX *and* the same formula as `originalText`. Keeping both
 * would show it twice and have a screen reader read it twice. So the box's
 * kind decides which field counts, and the other is used only when that one
 * came back empty, so nothing the model did return is lost.
 */
export function blocksFromRegion(kind: RegionKind, result: RemediationResult): ContentBlock[] {
  const text: ContentBlock[] = result.originalText.trim() ? [{ kind: 'text', text: result.originalText }] : [];
  const maths: ContentBlock[] = result.formulas.map((formula) => ({ kind: 'math', formula }));
  if (kind === 'math') return maths.length ? maths : text;
  return text.length ? text : maths;
}

/** Flattens blocks into one result: text blocks joined by blank lines, formulas in order. */
export function resultFromBlocks(blocks: readonly ContentBlock[]): RemediationResult {
  const texts: string[] = [];
  const formulas: RemediationResult['formulas'] = [];
  for (const block of blocks) {
    if (block.kind === 'text') texts.push(block.text);
    else formulas.push(block.formula);
  }
  return { originalText: texts.join('\n\n'), formulas };
}

/** Number of maths blocks, for the "N formulas" summary. */
export function countFormulas(blocks: readonly ContentBlock[]): number {
  return blocks.filter((block) => block.kind === 'math').length;
}
