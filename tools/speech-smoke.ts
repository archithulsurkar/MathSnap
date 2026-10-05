/**
 * Proves the speech pipeline works from a bundle with no node_modules present.
 *
 * The Speech Rule Engine loads its rule tables from JSON on disk at runtime, so
 * bundling the code is not enough — the packaging step has to carry the tables
 * too, and this is what catches it when it does not.
 */
import { enrichFormula } from '../src/shared/enrich.js';

async function main(): Promise<void> {
  const formula = await enrichFormula('\\frac{1}{2}');

  if (formula.needsReview || formula.description !== 'one half') {
    console.error(`FAIL: expected "one half", got "${formula.description}" (flagged: ${formula.needsReview})`);
    process.exit(1);
  }

  console.log(`PASS: speech works from the bundle — "${formula.description}"`);
}

void main();
