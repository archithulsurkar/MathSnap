/**
 * The benchmark dataset: loading and validation.
 *
 * Every entry is one formula image with a hand-written ground-truth LaTeX, and
 * optionally a description validated by someone who reads with a screen reader.
 * That last field is the point of the exercise — existing maths-OCR benchmarks
 * measure whether the LaTeX matches, and none of them measure whether the
 * accessible output is usable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeLatex } from './canonical.js';

export const DATASET_DIR = path.resolve(fileURLToPath(new URL('./dataset', import.meta.url)));

/** Source material a formula came from. Reported separately, since backends differ sharply by category. */
export type Category = 'typeset' | 'dense' | 'handwritten' | 'chemistry';

export const CATEGORIES: readonly Category[] = ['typeset', 'dense', 'handwritten', 'chemistry'];

export interface DatasetEntry {
  id: string;
  /** Path to the image, relative to the dataset directory. */
  image: string;
  category: Category;
  /** Hand-written ground truth. */
  latex: string;
  /**
   * Expected spoken form, confirmed by a screen-reader user as usable. Optional
   * because validation is slow; entries without it score LaTeX only.
   */
  speech?: string;
  validated?: { by: string; on: string };
  notes?: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid dataset entry: ${message}`);
}

export function validateEntry(value: unknown, source: string): DatasetEntry {
  assert(typeof value === 'object' && value !== null, `${source} is not an object`);
  const entry = value as Partial<DatasetEntry>;

  assert(typeof entry.id === 'string' && entry.id.length > 0, `${source} has no id`);
  assert(typeof entry.image === 'string' && entry.image.length > 0, `${entry.id} has no image`);
  assert(typeof entry.latex === 'string' && entry.latex.length > 0, `${entry.id} has no latex`);
  assert(
    typeof entry.category === 'string' && (CATEGORIES as readonly string[]).includes(entry.category),
    `${entry.id} has category "${entry.category}", expected one of ${CATEGORIES.join(', ')}`,
  );

  // Ground truth that will not convert would make every prediction against it
  // meaningless, so it fails loudly at load rather than silently at score time.
  try {
    canonicalizeLatex(entry.latex);
  } catch (error) {
    throw new Error(`Invalid dataset entry: ${entry.id} has latex that will not convert`, {
      cause: error,
    });
  }

  return entry as DatasetEntry;
}

/** Loads every `*.json` in the dataset directory. */
export function loadDataset(dir: string = DATASET_DIR): DatasetEntry[] {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const raw = fs.readFileSync(path.join(dir, name), 'utf8');
      return validateEntry(JSON.parse(raw), name);
    });
}

/** Whether the entry's image is present, so the runner can report gaps rather than crash. */
export function hasImage(entry: DatasetEntry, dir: string = DATASET_DIR): boolean {
  return fs.existsSync(path.join(dir, entry.image));
}
