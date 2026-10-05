/**
 * Scores one predicted transcription against ground truth.
 *
 * Two numbers, because they answer different questions. `exact` is what gets
 * published — the share of formulas a backend got structurally right. The
 * similarity score is for triage: it separates "missed one subscript" from
 * "transcribed a different formula", which matters when deciding whether a
 * local model is usable at all.
 */
import { MathmlConversionError } from '../src/shared/latex-to-mathml.js';
import { canonicalLeaves, canonicalizeLatex } from './canonical.js';

export interface FormulaScore {
  /** Same structure and same leaves, whatever notation was used. */
  exact: boolean;
  /** 0–1 over the canonical forms. 1 implies `exact`. */
  similarity: number;
  /** Set when the prediction would not parse as LaTeX at all. */
  unparseable: boolean;
}

/** Edit distance over token sequences, not characters. */
function levenshtein(a: readonly string[], b: readonly string[]): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
    }
    previous = current;
  }

  return previous[b.length];
}

function similarityOf(a: readonly string[], b: readonly string[]): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Compares a prediction with the expected LaTeX.
 *
 * A prediction that will not convert scores zero rather than throwing: a
 * backend that emits unparseable LaTeX is answering the question the benchmark
 * asks, just badly. Ground truth that will not convert is a dataset bug and does
 * throw.
 */
export function scoreFormula(expectedLatex: string, predictedLatex: string): FormulaScore {
  const expected = canonicalizeLatex(expectedLatex);

  let predicted: string;
  try {
    predicted = canonicalizeLatex(predictedLatex);
  } catch (error) {
    if (error instanceof MathmlConversionError) {
      return { exact: false, similarity: 0, unparseable: true };
    }
    throw error;
  }

  return {
    exact: expected === predicted,
    similarity: similarityOf(canonicalLeaves(expected), canonicalLeaves(predicted)),
    unparseable: false,
  };
}
