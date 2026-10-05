/**
 * Converts LaTeX to MathML.
 *
 * Previously the model was asked for LaTeX and MathML independently, which let
 * the two disagree with nothing in the pipeline able to notice. Deriving one
 * from the other removes that class of error, halves the tokens the model spends
 * on each formula, and makes the MathML reproducible from the LaTeX a reviewer
 * actually edits.
 */
import temml from 'temml';

/** Thrown when LaTeX will not parse, so the caller can flag the formula. */
export class MathmlConversionError extends Error {
  constructor(
    readonly latex: string,
    options?: ErrorOptions,
  ) {
    super(`LaTeX could not be converted to MathML: ${latex.slice(0, 120)}`, options);
    this.name = 'MathmlConversionError';
  }
}

/**
 * Renders `latex` as a MathML string.
 *
 * `throwOnError` is left on deliberately: temml's alternative is to emit error
 * markup in red, which would travel down the pipeline and be spoken aloud as if
 * it were mathematics. A formula that cannot be parsed needs to be flagged for
 * review, not narrated.
 */
export function latexToMathml(latex: string, displayMode = true): string {
  try {
    return temml.renderToString(latex, { displayMode, throwOnError: true });
  } catch (error) {
    throw new MathmlConversionError(latex, { cause: error });
  }
}
