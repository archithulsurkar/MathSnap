/**
 * Predictions made outside this process, for `npm run eval -- --predictions`.
 *
 * The training pipeline is Python, and its checkpoints are benchmarked by
 * writing one JSON object per line and scoring it here, so a fine-tuned model
 * and a hosted one are measured by exactly the same metric.
 *
 * A line names a dataset entry and gives its answer in one of two shapes:
 *
 *   {"id": "0001-quadratic-formula", "latex": "x = ..."}
 *   {"id": "0001-quadratic-formula", "formulas": [{"latex": "x = ..."}]}
 *
 * The second is the app's own response shape, so a model's raw JSON reply can
 * be written out unchanged. `"latex": null` or an empty `formulas` array means
 * the model found no formula, which scores as a miss.
 */

export interface Prediction {
  id: string;
  latex: string | null;
}

function latexOf(record: Record<string, unknown>, where: string): string | null {
  if ('latex' in record) {
    if (record.latex === null || typeof record.latex === 'string') return record.latex;
    throw new Error(`${where}: "latex" must be a string or null`);
  }
  if (Array.isArray(record.formulas)) {
    // One image holds one formula, so the first is the answer — as in run.ts.
    const first: unknown = record.formulas[0];
    if (first === undefined) return null;
    const latex = (first as { latex?: unknown } | null)?.latex;
    if (typeof latex === 'string') return latex;
    throw new Error(`${where}: "formulas[0].latex" must be a string`);
  }
  throw new Error(`${where}: needs "latex" or "formulas"`);
}

/** Parses JSONL text. Blank lines are skipped; a repeated id is an error. */
export function parsePredictions(text: string): Map<string, Prediction> {
  const predictions = new Map<string, Prediction>();

  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const where = `line ${index + 1}`;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`${where}: not valid JSON`, { cause: error });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${where}: expected a JSON object`);
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id) {
      throw new Error(`${where}: missing "id"`);
    }
    if (predictions.has(record.id)) {
      throw new Error(`${where}: duplicate id "${record.id}"`);
    }

    predictions.set(record.id, { id: record.id, latex: latexOf(record, where) });
  });

  return predictions;
}
