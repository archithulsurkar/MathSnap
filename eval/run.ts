/**
 * Benchmark runner.
 *
 *   npm run eval                 # whichever backend PROVIDER selects
 *   npm run eval -- --provider ollama
 *   npm run eval -- --limit 20
 *
 * Prints per-category accuracy and writes eval/report.json. Entries whose image
 * is missing are reported as pending rather than failing the run, so the harness
 * is usable before the dataset is finished.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvider, resolveProvider } from '../server/providers.js';
import type { RemediationProvider } from '../server/provider.js';
import { CATEGORIES, DATASET_DIR, hasImage, loadDataset, type DatasetEntry } from './dataset.js';
import { scoreFormula, type FormulaScore } from './score.js';

const REPORT_PATH = path.resolve(fileURLToPath(new URL('./report.json', import.meta.url)));

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

interface Outcome {
  id: string;
  category: string;
  expected: string;
  predicted: string | null;
  score: FormulaScore | null;
  error?: string;
}

function parseArgs(argv: string[]): { provider?: string; limit?: number } {
  const options: { provider?: string; limit?: number } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--provider') options.provider = argv[++i];
    if (argv[i] === '--limit') options.limit = Number(argv[++i]);
  }
  return options;
}

async function predict(provider: RemediationProvider, entry: DatasetEntry): Promise<string | null> {
  const file = path.join(DATASET_DIR, entry.image);
  const mimeType = MIME_BY_EXTENSION[path.extname(file).toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported image type for ${entry.image}`);

  const result = await provider.remediateImage(fs.readFileSync(file).toString('base64'), mimeType);
  // One image holds one formula, so the first is the answer. An empty array
  // means the backend found no formula at all, which counts as a miss.
  return result.formulas[0]?.latex ?? null;
}

function percentage(part: number, whole: number): string {
  return whole === 0 ? '   n/a' : `${((part / whole) * 100).toFixed(1).padStart(5)}%`;
}

function report(outcomes: Outcome[]): void {
  const scored = outcomes.filter((outcome) => outcome.score !== null);

  console.log('\ncategory      n   exact   mean similarity   unparseable');
  console.log('─'.repeat(60));

  for (const category of [...CATEGORIES, null]) {
    const rows = category
      ? scored.filter((outcome) => outcome.category === category)
      : scored;
    if (rows.length === 0 && category) continue;

    const exact = rows.filter((row) => row.score?.exact).length;
    const unparseable = rows.filter((row) => row.score?.unparseable).length;
    const meanSimilarity =
      rows.reduce((total, row) => total + (row.score?.similarity ?? 0), 0) / (rows.length || 1);

    const label = (category ?? 'ALL').padEnd(12);
    console.log(
      `${label}${String(rows.length).padStart(3)}  ${percentage(exact, rows.length)}` +
        `           ${meanSimilarity.toFixed(3)}   ${String(unparseable).padStart(11)}`,
    );
  }

  const failed = outcomes.filter((outcome) => outcome.error);
  if (failed.length) {
    console.log(`\n${failed.length} entr${failed.length === 1 ? 'y' : 'ies'} errored:`);
    for (const outcome of failed) console.log(`  ${outcome.id}: ${outcome.error}`);
  }
}

const options = parseArgs(process.argv.slice(2));
const entries = loadDataset();

if (entries.length === 0) {
  console.log(`No dataset entries in ${DATASET_DIR}. See eval/README.md for the labelling protocol.`);
  process.exit(0);
}

const pending = entries.filter((entry) => !hasImage(entry));
const runnable = entries.filter((entry) => hasImage(entry)).slice(0, options.limit ?? Infinity);

if (pending.length) {
  console.log(`${pending.length} entr${pending.length === 1 ? 'y' : 'ies'} pending an image; skipping.`);
}

if (runnable.length === 0) {
  console.log('Nothing to run.');
  process.exit(0);
}

const provider = options.provider ? createProvider(options.provider) : await resolveProvider();
const status = await provider.check();
if (!status.ok) {
  console.error(`${provider.name} is not ready: ${status.detail}`);
  process.exit(1);
}

console.log(`Running ${runnable.length} entries against ${provider.name} (${provider.model})`);

const outcomes: Outcome[] = [];
for (const [index, entry] of runnable.entries()) {
  process.stdout.write(`\r  ${index + 1}/${runnable.length} ${entry.id.padEnd(40)}`);

  try {
    const predicted = await predict(provider, entry);
    outcomes.push({
      id: entry.id,
      category: entry.category,
      expected: entry.latex,
      predicted,
      score: predicted === null
        ? { exact: false, similarity: 0, unparseable: true }
        : scoreFormula(entry.latex, predicted),
    });
  } catch (error) {
    outcomes.push({
      id: entry.id,
      category: entry.category,
      expected: entry.latex,
      predicted: null,
      score: null,
      error: (error as Error).message,
    });
  }
}
process.stdout.write('\r'.padEnd(60) + '\r');

report(outcomes);

fs.writeFileSync(
  REPORT_PATH,
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      provider: { name: provider.name, model: provider.model },
      pending: pending.map((entry) => entry.id),
      outcomes,
    },
    null,
    2,
  ),
);
console.log(`\nReport written to ${REPORT_PATH}`);
