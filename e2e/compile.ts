/**
 * Compiles an exported .tex with pdflatex to prove the escaping actually works.
 *
 * The string assertions in src/latex.test.ts cannot catch a character that
 * inputenc has no definition for — only a real TeX run can. Skips cleanly when
 * no TeX distribution is installed.
 *
 *   npm run test:compile
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildLatexDocument } from '../src/latex.js';
import type { ContentBlock, Formula } from '../src/shared/remediation.types.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp', 'compile');

function formula(latex: string, needsReview = false): Formula {
  return { latex, mathml: needsReview ? '' : '<math/>', description: '', mathspeak: '', needsReview };
}

/**
 * Content as a vision model actually returns it: full of mathematical Unicode,
 * in the reading order the region tool produces. `√` (U+221A) is the
 * character that used to abort the build.
 */
const SAMPLE: ContentBlock[] = [
  {
    kind: 'text',
    text:
      'Chapter 3\n\nThe roots are x = (-b ± √(b² - 4ac)) / 2a, and ΔS = Q / T describes entropy.\n' +
      'Electrolysis: 2H₂O → 2H₂ + O₂ at 25°C, with efficiency ≥ 80% and cost $5 & up.',
  },
  // A text region, with maths inline as the region prompt asks for it.
  { kind: 'text', text: String.raw`So $x = ±√2$ when $a \geq 0$, and it costs \$5 or $10 & up.` },
  { kind: 'math', formula: formula('E = mc^2') },
  { kind: 'math', formula: formula('x = (-b ± √(b² - 4ac)) / 2a') },
  { kind: 'math', formula: formula(String.raw`\begin{align}a &= b\\c &= d\end{align}`) },
  { kind: 'math', formula: formula(String.raw`$$\int_0^1 f(x)\,dx$$`) },
  // A multi-line region, lines joined with \\ as the maths region prompt asks.
  { kind: 'math', formula: formula(String.raw`\begin{aligned}y &= 2x + 1 \\ &= 3\end{aligned}`) },
  { kind: 'text', text: 'Display maths inside text: $$a^2 + b^2 = c^2$$ ends the chapter.' },
];

function hasPdflatex(): boolean {
  try {
    execFileSync('pdflatex', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

if (!hasPdflatex()) {
  console.log('SKIP: pdflatex not found — install a TeX distribution to run this check.');
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
const texPath = path.join(OUT, 'export.tex');
fs.writeFileSync(texPath, buildLatexDocument({ blocks: SAMPLE, pageCount: 2 }), 'utf8');

try {
  execFileSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'export.tex'], {
    cwd: OUT,
    stdio: 'pipe',
  });
} catch {
  const log = fs.readFileSync(path.join(OUT, 'export.log'), 'latin1');
  // pdflatex writes \n line endings even on Windows, so os.EOL would never split.
  const failure = log.split(/\r?\n/).find((line) => line.startsWith('!')) ?? 'unknown error';
  console.error(`FAIL: the exported .tex does not compile — ${failure.trim()}`);
  console.error(`Full log: ${path.join(OUT, 'export.log')}`);
  process.exit(1);
}

const pdf = path.join(OUT, 'export.pdf');
console.log(`PASS: exported .tex compiles (${fs.statSync(pdf).size} bytes) — ${pdf}`);
