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
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { escapeLatex, pageImageFilename, toDisplayMath } from '../src/latex.js';
import type { RemediationResult } from '../src/shared/remediation.types.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp', 'compile');

/**
 * Transcription and formulas as a vision model actually returns them: full of
 * mathematical Unicode. `√` (U+221A) is the character that used to abort the build.
 */
const SAMPLE: RemediationResult = {
  originalText:
    'Chapter 3\n\nThe roots are x = (-b ± √(b² - 4ac)) / 2a, and ΔS = Q / T describes entropy.\n' +
    'Electrolysis: 2H₂O → 2H₂ + O₂ at 25°C, with efficiency ≥ 80% and cost $5 & up.',
  formulas: [
    { description: 'Mass–energy equivalence, 100% exact', latex: 'E = mc^2', mathml: '<math/>' },
    { description: 'Quadratic roots — uses ± and √', latex: 'x = (-b ± √(b² - 4ac)) / 2a', mathml: '<math/>' },
    { description: 'An aligned environment', latex: '\\begin{align}a &= b\\\\c &= d\\end{align}', mathml: '<math/>' },
    { description: 'Delimiters the model wrapped itself', latex: '$$\\int_0^1 f(x)\\,dx$$', mathml: '<math/>' },
  ],
};

function hasPdflatex(): boolean {
  try {
    execFileSync('pdflatex', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Mirrors AppComponent.exportToLatex, using the same helpers the app uses. */
function buildTex(result: RemediationResult, pageCount: number): string {
  const images = Array.from({ length: pageCount }, (_, index) => {
    const name = pageImageFilename(index);
    return `\\begin{figure}[h!]
\\centering
\\IfFileExists{${name}}{\\includegraphics[width=\\textwidth]{${name}}}{\\fbox{Missing ${name}}}
\\caption{Original document page ${index + 1}.}
\\end{figure}`;
  }).join('\n');

  const formulas = result.formulas
    .map(
      (formula, index) => `\\subsection*{Formula ${index + 1}}
\\subsubsection*{Description}
${escapeLatex(formula.description)}

\\subsubsection*{LaTeX}
${toDisplayMath(formula.latex)}
\\hrulefill`,
    )
    .join('\n\n');

  return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{geometry}
\\geometry{a4paper, margin=1in}
\\title{Remediated Document}
\\date{\\today}
\\begin{document}
\\maketitle
\\section*{Original Page Images}
${images}
\\clearpage
\\section*{Extracted Text Content}
${escapeLatex(result.originalText)}
\\clearpage
\\section*{Remediated Formulas}
${formulas}
\\end{document}
`;
}

if (!hasPdflatex()) {
  console.log('SKIP: pdflatex not found — install a TeX distribution to run this check.');
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
const texPath = path.join(OUT, 'export.tex');
fs.writeFileSync(texPath, buildTex(SAMPLE, 2), 'utf8');

try {
  execFileSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'export.tex'], {
    cwd: OUT,
    stdio: 'pipe',
  });
} catch {
  const log = fs.readFileSync(path.join(OUT, 'export.log'), 'latin1');
  const failure = log.split(os.EOL).find((line) => line.startsWith('!')) ?? 'unknown error';
  console.error(`FAIL: the exported .tex does not compile — ${failure.trim()}`);
  console.error(`Full log: ${path.join(OUT, 'export.log')}`);
  process.exit(1);
}

const pdf = path.join(OUT, 'export.pdf');
console.log(`PASS: exported .tex compiles (${fs.statSync(pdf).size} bytes) — ${pdf}`);
