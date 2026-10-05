/**
 * What the model is asked for, and all it is asked for: a transcription, and
 * the LaTeX of each formula. Everything a reader consumes is derived from this
 * by rule, not written by the model — see `src/shared/speech.ts`.
 */
export interface ModelFormula {
  latex: string;
}

export interface ModelResult {
  originalText: string;
  formulas: ModelFormula[];
}

/** A formula after the deterministic pipeline has enriched it. */
export interface Formula {
  latex: string;
  /** Derived from `latex` by temml. Empty when the LaTeX would not parse. */
  mathml: string;
  /** ClearSpeak rendering: the screen-reader description. */
  description: string;
  /** MathSpeak rendering, for readers who prefer explicit structure markers. */
  mathspeak: string;
  /**
   * Set when the LaTeX could not be converted, so no MathML or speech could be
   * produced. A human has to look at these before the document ships.
   */
  needsReview: boolean;
}

export interface RemediationResult {
  originalText: string;
  formulas: Formula[];
}

export interface RemediateRequest {
  /** Base64-encoded image bytes, without the `data:` URL prefix. */
  image: string;
  mimeType: string;
}

export interface ApiErrorBody {
  error: string;
  /** Stable code the client can branch on without parsing prose. */
  code: 'bad_request' | 'unsupported_type' | 'too_large' | 'rate_limited' | 'upstream_error';
}

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Max decoded image bytes accepted by the proxy. Keeps a single upload from burning the quota. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Max PDF pages analyzed per upload. Each page is one model call, so this is
 * also the number of requests a single upload makes — the server's rate limit
 * is derived from it so one legitimate upload can never exhaust the budget.
 */
export const MAX_PDF_PAGES = 10;

/** Uploads a single client may complete per rate-limit window. */
export const MAX_UPLOADS_PER_WINDOW = 3;

export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Request budget per window: enough for MAX_UPLOADS_PER_WINDOW full-length PDFs. */
export const RATE_LIMIT_MAX = MAX_PDF_PAGES * MAX_UPLOADS_PER_WINDOW;
