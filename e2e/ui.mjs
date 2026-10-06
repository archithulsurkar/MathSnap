/**
 * Browser end-to-end check. Requires `npm run dev` with a working provider
 * (Ollama or Gemini) — it makes live model calls, one per fixture page, so it
 * is not part of `npm test`.
 *
 *   npm run test:e2e
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeFixturePdf } from './fixtures.mjs';

const TMP = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp');
const APP = process.env.E2E_URL ?? 'http://localhost:3000';

fs.mkdirSync(TMP, { recursive: true });
const { path: PDF, pages: PDF_PAGES } = writeFixturePdf(path.join(TMP, 'multipage.pdf'));

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

function log(step, detail = '') {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${step}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(err.message));
page.on('requestfailed', (req) => failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`));

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

log('navigating', APP);
await page.goto(APP, { waitUntil: 'networkidle' });

// --- boot ---
const brand = await page.textContent('header');
check('app boots and renders', brand?.includes('Formula Remediator'), brand?.trim().slice(0, 40));
check('no uncaught exceptions on boot', pageErrors.length === 0, pageErrors.join(' | '));
check('idle upload card shown', await page.isVisible('text=Upload a page'));

// --- tailwind actually compiled (not the CDN script) ---
const buttonBackground = await page.$eval('.btn-primary', (el) => getComputedStyle(el).backgroundColor);
check('tailwind styles applied', !/rgba\(0, 0, 0, 0\)|transparent/.test(buttonBackground), buttonBackground);

// --- upload the multi-page PDF ---
log(`uploading ${PDF_PAGES}-page PDF`);
await page.setInputFiles('#file-upload', PDF);

// Uploads stop at the annotate step; this run takes the whole-page path.
await page.waitForSelector('text=Mark the reading order', { timeout: 30000 });
check('upload opens the annotate step', true);
await page.click('button:has-text("Analyze whole page instead")');

// progress text proves the multi-page loop is running
const progressSelector = `text=/Reading page \\d+ of ${PDF_PAGES}/`;
try {
  await page.waitForSelector(progressSelector, { timeout: 30000 });
  const progress = await page.textContent(progressSelector);
  check('per-page progress shown', true, progress.trim());
} catch {
  check('per-page progress shown', false, 'never appeared');
}

// aria-live region should be marked busy while working
const busyDuringLoad = await page.getAttribute('[aria-live="polite"]', 'aria-busy');
check('aria-busy set while loading', busyDuringLoad === 'true', `aria-busy=${busyDuringLoad}`);

log(`waiting for results (${PDF_PAGES} model calls)`);
await page.waitForSelector('text=Results', { timeout: 420000 });

// --- results ---
const pageImages = await page.$$eval('figure img', (els) => els.map((e) => e.getAttribute('alt')));
check(`all ${PDF_PAGES} pages rendered and shown`, pageImages.length === PDF_PAGES, JSON.stringify(pageImages));

const summary = await page.textContent('p:has-text("from")');
check('summary reports pages', new RegExp(`from ${PDF_PAGES} pages`).test(summary), summary?.trim());

const formulaCards = await page.$$('h2:has-text("Formula")');
check('formula cards rendered', formulaCards.length > 0, `${formulaCards.length} cards`);

// --- MathML actually made it into the DOM through DOMPurify ---
const mathCount = await page.$$eval('math', (els) => els.length);
check('MathML rendered (survived sanitizer)', mathCount > 0, `${mathCount} <math> elements`);

const mathHasChildren = await page.$$eval('math', (els) =>
  els.every((e) => e.children.length > 0),
);
check('MathML not stripped to empty', mathHasChildren);

const mathLabel = await page.getAttribute('[aria-label*="rendered as MathML"]', 'aria-label');
check('MathML block has accessible name', Boolean(mathLabel), mathLabel);

// --- pdf.js worker loaded from same origin ---
const workerReq = failedRequests.filter((r) => r.includes('pdf.worker'));
check('pdf.js worker loaded', workerReq.length === 0, workerReq.join(' | '));

// --- copy button feedback ---
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP });
await page.click('button:has-text("Copy LaTeX")');
// The notice paragraph also uses role="status"; target the sr-only feedback line.
// The app is zoneless, so the signal update can land after the click resolves —
// wait for the text instead of reading once and hoping.
const feedbackLocator = page.locator('p.sr-only[role="status"]');
await feedbackLocator.filter({ hasText: /copied|could not copy/i }).waitFor({ timeout: 10000 }).catch(() => {});
const feedback = await feedbackLocator.textContent();
check('copy feedback announced', /copied to clipboard/i.test(feedback || ''), (feedback || '').trim());

// --- export to LaTeX ---
log('exporting .tex');
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.click('button:has-text("LaTeX (.tex)")'),
]);
const texPath = path.join(TMP, 'exported.tex');
await download.saveAs(texPath);
const tex = fs.readFileSync(texPath, 'utf8');
check('.tex downloaded', fs.existsSync(texPath), `${tex.length} chars, name=${download.suggestedFilename()}`);
check('.tex has document structure', tex.includes('\\begin{document}') && tex.includes('\\end{document}'));
check('.tex has display math', tex.includes('\\['));
const expectedImages = Array.from({ length: PDF_PAGES }, (_, i) => `page-${i + 1}.png`);
check(`.tex references all ${PDF_PAGES} page images`, expectedImages.every((n) => tex.includes(n)));
// Ampersands are legal inside maths (align); in prose they must be escaped.
const prose = (tex.split('\\section*{Content}')[1] ?? '')
  .replace(/\\\[[\s\S]*?\\\]/g, '')
  .replace(/\\begin\{(\w+\*?)\}[\s\S]*?\\end\{\1\}/g, '')
  .replace(/\$[^$]*\$/g, '');
check('.tex has no unescaped raw ampersand in text', !/(^|[^\\])&/.test(prose));

await page.screenshot({ path: path.join(TMP, 'app-success.png'), fullPage: false });
log('screenshot saved');

// --- region path: one box drawn around a formula, read on its own ---
log('drawing one maths box on page 1');
await page.click('button:has-text("Start over")');
await page.setInputFiles('#file-upload', PDF);
await page.waitForSelector('text=Mark the reading order', { timeout: 30000 });
await page.click('button[aria-pressed]:has-text("Maths")');
const pageBox = await page.locator('app-region-editor img').boundingBox();
// The fixture's first formula, "v = u + at", sits about a fifth of the way down.
await page.mouse.move(pageBox.x + pageBox.width * 0.1, pageBox.y + pageBox.height * 0.15);
await page.mouse.down();
await page.mouse.move(pageBox.x + pageBox.width * 0.7, pageBox.y + pageBox.height * 0.27, { steps: 5 });
await page.mouse.up();
await page.click('button:has-text("Read 1 box")');
log(`waiting for results (1 box + ${PDF_PAGES - 1} whole pages)`);
await page.waitForSelector('h1:has-text("Results")', { timeout: 420000 });
const firstFormula = await page.locator('main pre code').first().textContent();
check('boxed formula read first', /v\s*=\s*u\s*\+\s*a\s*t/.test(firstFormula ?? ''), firstFormula?.trim());
// Models echo a maths box's formula into the text field too; it must appear once.
const echoed = await page.locator('main p.whitespace-pre-wrap', { hasText: /v\s*=\s*u\s*\+\s*a\s*t/ }).count();
check('maths box not repeated as text', echoed === 0, `${echoed} text block(s) repeat it`);

// --- error path: unsupported file ---
log('testing rejection of a non-image file');
const junk = path.join(TMP, 'notes.txt');
fs.writeFileSync(junk, 'this is not an image');
await page.click('button:has-text("Start over")');
await page.setInputFiles('#file-upload', junk);
await page.waitForSelector('text=/That didn.t work/', { timeout: 20000 });
const errText = await page.textContent('[role="alert"]');
check('bad file type rejected via magic bytes', /Invalid file type/.test(errText), errText?.trim());
check('error uses role=alert', true);

console.log('\n--- console errors ---');
console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');
console.log('--- uncaught page errors ---');
console.log(pageErrors.length ? pageErrors.join('\n') : '(none)');
console.log('--- failed requests ---');
console.log(failedRequests.length ? failedRequests.join('\n') : '(none)');

await browser.close();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
