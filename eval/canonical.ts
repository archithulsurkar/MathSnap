/**
 * Canonical form of a formula, for comparing two transcriptions.
 *
 * Diffing LaTeX strings is the obvious metric and the wrong one: `\frac` and
 * `\dfrac`, `(` and `\left(`, `x^2` and `x^{2}`, and any amount of whitespace
 * all denote identical mathematics while differing as text. A benchmark scored
 * that way reports failures on correct output, which makes the number useless.
 *
 * So both sides are converted to MathML and reduced to a canonical tree string.
 * Two expressions are equal when they have the same structure and the same
 * leaves, whatever notation produced them.
 */
import { JSDOM } from 'jsdom';
import { latexToMathml } from '../src/shared/latex-to-mathml.js';

/** Presentation wrappers that carry no mathematical content of their own. */
const TRANSPARENT = new Set(['semantics', 'mrow', 'mstyle', 'mpadded']);

/** Elements that exist only for spacing. */
const IGNORED = new Set(['mspace', 'annotation', 'annotation-xml']);

function canonicalizeNode(node: Element): string | null {
  const name = node.tagName.toLowerCase();

  if (IGNORED.has(name)) return null;

  const children = Array.from(node.children)
    .map(canonicalizeNode)
    .filter((child): child is string => child !== null);

  // A wrapper holding exactly one thing says nothing the thing does not.
  if (TRANSPARENT.has(name) && children.length === 1) return children[0];

  if (children.length === 0) {
    // Leaf: the token itself matters, its styling does not. Unicode minus and
    // hyphen-minus are the same operator to a reader.
    const text = (node.textContent ?? '')
      .normalize('NFC')
      .replace(/−/g, '-')
      .replace(/\s+/g, '')
      .trim();
    return text ? `${name}:${text}` : null;
  }

  return `${name}(${children.join(',')})`;
}

/** Reduces a MathML string to its canonical tree form. */
export function canonicalizeMathml(mathml: string): string {
  const { window } = new JSDOM(`<body>${mathml}</body>`, { contentType: 'text/html' });
  const root = window.document.body.firstElementChild;
  if (!root) return '';
  return canonicalizeNode(root) ?? '';
}

/**
 * The leaf tokens of a canonical form, in reading order.
 *
 * Used for the similarity score. Comparing whole serialized trees inflates
 * every score, because two unrelated formulas still share `math(mrow(` and a
 * scattering of `mi:`/`mo:` tag names — an unrelated pair measures over 50%
 * similar. Leaves carry the content and none of that boilerplate.
 */
export function canonicalLeaves(canonical: string): string[] {
  return canonical.match(/[a-z-]+:[^,()]+/g) ?? [];
}

/**
 * Reduces LaTeX to its canonical tree form.
 *
 * Throws {@link MathmlConversionError} when the LaTeX will not parse, which for
 * a ground-truth entry means the dataset is wrong and for a prediction means the
 * model produced something unusable — the caller distinguishes those.
 */
export function canonicalizeLatex(latex: string): string {
  return canonicalizeMathml(latexToMathml(latex, false));
}
