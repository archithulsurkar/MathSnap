/**
 * Splits transcribed text into prose and inline maths.
 *
 * A text region comes back as prose with maths written between dollar signs
 * ("the roots are $x = \pm 2$"). The prose is shown and exported as text; each
 * maths span becomes MathML so a screen reader reads it as maths.
 *
 * Dollar signs also occur as money, so a span is only maths under Pandoc's
 * rule: the opening `$` is followed by a non-space, and the closing `$` is
 * preceded by a non-space and not followed by a digit. "$5 and $10" stays
 * prose. `\$` is a literal dollar sign, as the prompt asks the model to write
 * one. An opening `$` that is never closed is left as prose rather than
 * swallowing the rest of the text.
 */

export type InlineSegment =
  | { kind: 'text'; text: string }
  | { kind: 'math'; latex: string; display: boolean };

const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);
const isDigit = (char: string | undefined) => char !== undefined && char >= '0' && char <= '9';

/** Index of the `$` (or `$$`) that closes a span opened just before `from`, or -1. */
function findClose(text: string, from: number, display: boolean): number {
  for (let i = from; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') {
      i++; // whatever follows a backslash is escaped, including `\$`
      continue;
    }
    if (char !== '$') continue;

    if (display) {
      if (text[i + 1] === '$') return i;
      continue;
    }
    if (text[i + 1] === '$') return -1; // `$$` inside inline maths: not a close
    if (!isSpace(text[i - 1]) && !isDigit(text[i + 1])) return i;
  }
  return -1;
}

export function splitInlineMath(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let prose = '';

  const flush = () => {
    if (prose) segments.push({ kind: 'text', text: prose });
    prose = '';
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    if (char === '\\' && text[i + 1] === '$') {
      prose += '$';
      i += 2;
      continue;
    }

    if (char === '$') {
      const display = text[i + 1] === '$';
      const start = i + (display ? 2 : 1);

      if (display || !isSpace(text[start])) {
        const close = findClose(text, start, display);
        const latex = close === -1 ? '' : text.slice(start, close);
        if (close !== -1 && latex.trim()) {
          flush();
          segments.push({ kind: 'math', latex: latex.trim(), display });
          i = close + (display ? 2 : 1);
          continue;
        }
      }

      // Not a maths span: keep the dollar sign(s) as prose.
      prose += display ? '$$' : '$';
      i = start;
      continue;
    }

    prose += char;
    i++;
  }

  flush();
  return segments;
}

/** Whether the text contains any maths span at all. */
export function hasInlineMath(text: string): boolean {
  return splitInlineMath(text).some((segment) => segment.kind === 'math');
}
