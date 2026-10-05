/**
 * Converts Unicode mathematical notation into LaTeX commands.
 *
 * Vision models — local 7B ones especially — transcribe what they see, so they
 * return "x = (-b ± √(b² - 4ac)) / 2a" no matter how firmly the prompt asks for
 * LaTeX. That string does not compile, so normalize it rather than trusting the
 * model to comply.
 */

/** Single-character replacements that need no surrounding context. */
const SYMBOLS: Record<string, string> = {
  '±': '\\pm ',
  '∓': '\\mp ',
  '×': '\\times ',
  '÷': '\\div ',
  '⋅': '\\cdot ',
  '·': '\\cdot ',
  '−': '-',
  '→': '\\rightarrow ',
  '←': '\\leftarrow ',
  '⇌': '\\rightleftharpoons ',
  '≠': '\\neq ',
  '≤': '\\leq ',
  '≥': '\\geq ',
  '≈': '\\approx ',
  '≡': '\\equiv ',
  '∝': '\\propto ',
  '∞': '\\infty ',
  '∑': '\\sum ',
  '∏': '\\prod ',
  '∫': '\\int ',
  '∂': '\\partial ',
  '∇': '\\nabla ',
  '°': '^{\\circ}',
  'α': '\\alpha ',
  'β': '\\beta ',
  'γ': '\\gamma ',
  'δ': '\\delta ',
  'ε': '\\epsilon ',
  'θ': '\\theta ',
  'λ': '\\lambda ',
  'μ': '\\mu ',
  'π': '\\pi ',
  'ρ': '\\rho ',
  'σ': '\\sigma ',
  'τ': '\\tau ',
  'φ': '\\phi ',
  'ω': '\\omega ',
  'Δ': '\\Delta ',
  'Σ': '\\Sigma ',
  'Ω': '\\Omega ',
  'Φ': '\\Phi ',
  'Θ': '\\Theta ',
};

const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁺': '+',
  '⁻': '-',
  '⁼': '=',
  '⁽': '(',
  '⁾': ')',
  'ⁿ': 'n',
};

const SUBSCRIPTS: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
  '₊': '+',
  '₋': '-',
  '₌': '=',
  '₍': '(',
  '₎': ')',
};

const RADICAL = '√';

/** Characters a bare radicand may contain, hoisted out of the scan loop. */
let RADICAND_PATTERN: RegExp;

function escapeForClass(chars: string): string {
  return chars.replace(/[\\\]^-]/g, (char) => `\\${char}`);
}

RADICAND_PATTERN = new RegExp(
  `^[A-Za-z0-9${escapeForClass(Object.keys(SUPERSCRIPTS).join(''))}${escapeForClass(
    Object.keys(SUBSCRIPTS).join(''),
  )}]+`,
);

function scriptRuns(text: string, table: Record<string, string>, wrapper: '^' | '_'): string {
  const chars = escapeForClass(Object.keys(table).join(''));
  // Collapse a run so "x²³" becomes x^{23}, not x^{2}^{3}.
  const pattern = new RegExp(`[${chars}]+`, 'g');
  return text.replace(pattern, (run) => `${wrapper}{${[...run].map((char) => table[char]).join('')}}`);
}

/**
 * Rewrites `√x` and `√(...)` as `\sqrt{...}`.
 *
 * Scans forward from the radical to find its argument: a parenthesized group
 * (respecting nesting) or, failing that, the next single token.
 */
function radicals(text: string): string {
  let out = '';

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== RADICAL) {
      out += text[i];
      continue;
    }

    let start = i + 1;
    while (start < text.length && text[start] === ' ') start++;

    if (text[start] === '(') {
      let depth = 0;
      let end = start;
      for (; end < text.length; end++) {
        if (text[end] === '(') depth++;
        else if (text[end] === ')' && --depth === 0) break;
      }
      if (depth === 0 && end < text.length) {
        out += `\\sqrt{${radicals(text.slice(start + 1, end))}}`;
        i = end;
        continue;
      }
    }

    // Bare radicand: letters and digits, plus any scripts attached to them.
    const token = text.slice(start).match(RADICAND_PATTERN);
    if (token) {
      out += `\\sqrt{${token[0]}}`;
      i = start + token[0].length - 1;
      continue;
    }

    out += '\\sqrt';
    i = start - 1;
  }

  return out;
}

export function normalizeLatex(latex: string): string {
  let out = radicals(latex);

  for (const [symbol, command] of Object.entries(SYMBOLS)) {
    out = out.split(symbol).join(command);
  }

  out = scriptRuns(out, SUPERSCRIPTS, '^');
  out = scriptRuns(out, SUBSCRIPTS, '_');

  // Collapse the spaces the command replacements introduce.
  return out.replace(/[ \t]{2,}/g, ' ').trim();
}

function textScriptRuns(text: string, table: Record<string, string>, command: string): string {
  const chars = escapeForClass(Object.keys(table).join(''));
  const pattern = new RegExp(`[${chars}]+`, 'g');
  return text.replace(pattern, (run) => `\\${command}{${[...run].map((char) => table[char]).join('')}}`);
}

/**
 * Makes prose containing mathematical Unicode safe to put in a LaTeX document body.
 *
 * `inputenc`'s utf8 defines only a handful of these characters, so a transcription
 * holding `√` or `→` aborts the build with "Unicode character not set up for use
 * with LaTeX". Unlike {@link normalizeLatex}, the output lands in text mode, so
 * math commands are wrapped in `$…$` and scripts use \textsuperscript.
 *
 * Run this *after* escaping LaTeX specials — it introduces backslashes, braces
 * and dollar signs that must not themselves be escaped.
 */
export function unicodeToTextLatex(text: string): string {
  // A bare radical has no radicand to typeset in prose, so \surd is the honest glyph.
  let out = text.split(RADICAL).join('$\\surd$');

  for (const [symbol, command] of Object.entries(SYMBOLS)) {
    if (symbol === RADICAL) continue;
    // The minus sign maps to plain ASCII, which needs no math mode.
    out = out.split(symbol).join(command === '-' ? '-' : `$${command.trim()}$`);
  }

  out = textScriptRuns(out, SUPERSCRIPTS, 'textsuperscript');
  out = textScriptRuns(out, SUBSCRIPTS, 'textsubscript');

  return out;
}
