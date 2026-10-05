/**
 * Pure helpers for saved history, kept free of Supabase so they can be tested.
 *
 * A saved item stores only what cannot be recomputed: the LaTeX and the page
 * text. MathML and speech are deterministic functions of the LaTeX, so they are
 * re-derived on load rather than stored, and page images never leave the device.
 */
import type { RemediationResult } from './shared/remediation.types.js';

export type HistorySource = 'paste' | 'upload';

/** The shape written to the `remediations` table. */
export interface HistoryInsert {
  title: string;
  source: HistorySource;
  original_text: string;
  latex: string[];
  page_count: number;
}

/** A row as listed back from the table. */
export interface HistoryItem extends HistoryInsert {
  id: string;
  created_at: string;
}

/** Limits mirror the table's check constraints, so a save never fails on them. */
export const TITLE_MAX = 200;
export const TEXT_MAX = 200_000;
export const FORMULAS_MAX = 500;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** A human title: the file name for uploads, the first formula for pastes. */
export function titleFor(source: HistorySource, latex: string[], fileName?: string): string {
  const base =
    source === 'upload' && fileName?.trim()
      ? fileName.trim()
      : (latex.find((formula) => formula.trim()) ?? 'Untitled').replace(/\s+/g, ' ').trim();
  return truncate(base, 60) || 'Untitled';
}

/**
 * Builds the row to save, or null when there is nothing worth saving.
 * Everything is clamped to the database limits.
 */
export function toHistoryInsert(
  result: RemediationResult,
  source: HistorySource,
  pageCount: number,
  fileName?: string,
): HistoryInsert | null {
  const latex = result.formulas
    .map((formula) => formula.latex)
    .filter((formula) => formula.trim())
    .slice(0, FORMULAS_MAX);
  if (!latex.length) return null;

  return {
    title: truncate(titleFor(source, latex, fileName), TITLE_MAX),
    source,
    original_text: result.originalText.slice(0, TEXT_MAX),
    latex,
    page_count: Math.max(0, Math.min(pageCount, 500)),
  };
}

/** "4 formulas · pasted" / "1 formula · 3 pages". */
export function describeItem(item: Pick<HistoryItem, 'latex' | 'source' | 'page_count'>): string {
  const formulas = `${item.latex.length} ${item.latex.length === 1 ? 'formula' : 'formulas'}`;
  const origin =
    item.source === 'paste'
      ? 'pasted'
      : `${item.page_count} ${item.page_count === 1 ? 'page' : 'pages'}`;
  return `${formulas} · ${origin}`;
}
