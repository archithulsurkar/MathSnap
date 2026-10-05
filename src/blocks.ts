/**
 * The result as an ordered list of text and maths, which is what a reader
 * gets: the results view and both exports walk this list in order.
 *
 * The server still answers each request with a `RemediationResult`. These
 * helpers turn one of those into blocks, and turn blocks back into a single
 * result where a flat shape is needed (history, counts).
 */
import type { ContentBlock, RemediationResult } from './shared/remediation.types.js';

export type { ContentBlock } from './shared/remediation.types.js';

/**
 * Text first, then every formula.
 *
 * For a whole page that is the order the page-level prompt returns them in,
 * since it has no way to say where on the page each formula sat. For one
 * region it keeps whatever came back: a region is read with the prompt for its
 * kind, but a model does not always follow it, and dropping the half it was
 * not asked for would lose content.
 */
export function blocksFromResult(result: RemediationResult): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (result.originalText.trim()) blocks.push({ kind: 'text', text: result.originalText });
  for (const formula of result.formulas) blocks.push({ kind: 'math', formula });
  return blocks;
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
