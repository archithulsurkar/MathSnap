/**
 * Turns LaTeX into everything a reader consumes.
 *
 * Shared deliberately: the server runs this over a model's transcription, and
 * the browser runs the identical code over LaTeX a user pasted. Two copies would
 * drift, and the whole claim of this pipeline is that the output is determined
 * by the LaTeX and nothing else — which only holds if there is one pipeline.
 *
 * Nothing here needs a model, a key, or a network. That is why the paste path
 * works with no setup at all.
 */
import { normalizeLatex } from './latex-normalize.js';
import { latexToMathml } from './latex-to-mathml.js';
import { renderAccessible } from './speech.js';
import type { Formula } from './remediation.types.js';

/**
 * Derives MathML and speech from one formula's LaTeX.
 *
 * A formula whose LaTeX will not parse yields no derived output and is flagged
 * instead: narrating a conversion error to a blind reader is worse than telling
 * a reviewer that one formula needs a human.
 */
export async function enrichFormula(rawLatex: string): Promise<Formula> {
  const latex = normalizeLatex(rawLatex);

  try {
    const mathml = latexToMathml(latex);
    const { clearspeak, mathspeak } = await renderAccessible(mathml);
    return { latex, mathml, description: clearspeak, mathspeak, needsReview: false };
  } catch (error) {
    // Swallowing the reason here cost an hour of debugging once; a flagged
    // formula should always say why it was flagged.
    console.warn(`Flagged for review: ${(error as Error)?.message ?? error}`);
    return { latex, mathml: '', description: '', mathspeak: '', needsReview: true };
  }
}

export async function enrichFormulas(rawLatex: readonly string[]): Promise<Formula[]> {
  return Promise.all(rawLatex.map((latex) => enrichFormula(latex)));
}
