import DOMPurify from 'dompurify';

/**
 * Allowlists model-generated MathML before it is rendered.
 *
 * The markup is untrusted: it is derived from an uploaded document, and text
 * inside that document can steer the model into emitting arbitrary markup.
 * MathML elements accept event-handler attributes just like HTML ones, so this
 * must run before the string reaches `bypassSecurityTrustHtml`.
 */
export function sanitizeMathml(mathml: string): string {
  return DOMPurify.sanitize(mathml, { USE_PROFILES: { mathMl: true } });
}
