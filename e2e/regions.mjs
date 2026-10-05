/**
 * Browser check of the region tool: upload, draw boxes, reorder, read, export.
 *
 * No model is needed. `/api/remediate` is answered in the browser by a fake
 * backend that replies according to the `region` it is sent, so this checks
 * the client — drawing, cropping, request order, reading order, retries and
 * exports — and nothing about transcription quality.
 *
 *   npm run dev:web            # or: npx ng serve
 *   npm run test:e2e:regions
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

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

/** Width and height from a PNG's IHDR chunk, or a JPEG's first SOF marker. */
function imageSize(base64) {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes[0] === 0x89) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  for (let i = 2; i < bytes.length; ) {
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return null;
}

const formula = (latex, n) => ({
  latex,
  mathml: `<math xmlns="http://www.w3.org/1998/Math/MathML"><msub><mi>a</mi><mn>${n}</mn></msub></math>`,
  description: `a sub ${n}`,
  mathspeak: `a sub ${n}`,
  needsReview: false,
});

/** Every request the fake backend saw, in order. */
let requests = [];
/** Answer the next N requests with a 429 first. */
let rateLimitNext = 0;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.route('**/api/remediate', async (route) => {
  if (rateLimitNext > 0) {
    rateLimitNext--;
    return route.fulfill({
      status: 429,
      headers: { 'Retry-After': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Too many requests.', code: 'rate_limited' }),
    });
  }

  const body = JSON.parse(route.request().postData() ?? '{}');
  const n = requests.length + 1;
  requests.push({ region: body.region, mimeType: body.mimeType, size: imageSize(body.image) });

  const result =
    body.region === 'text'
      ? { originalText: `Text box ${n} says $x^{2}$ costs \\$5.`, formulas: [] }
      : body.region === 'math'
        ? { originalText: '', formulas: [formula(`a_{${n}}`, n)] }
        : { originalText: `Whole page ${n}.`, formulas: [formula(`a_{${n}}`, n)] };
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
});

/** Drags a box over the page, as fractions of the visible page. */
async function drawBox(x1, y1, x2, y2) {
  const box = await page.locator('app-region-editor img').boundingBox();
  await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((x1 + x2) / 2), box.y + box.height * ((y1 + y2) / 2), { steps: 4 });
  await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 4 });
  await page.mouse.up();
}

const listItems = () => page.locator('app-region-editor ol > li');

async function upload() {
  await page.setInputFiles('#file-upload', PDF);
  await page.waitForSelector('text=Mark the reading order', { timeout: 30000 });
}

await page.goto(APP, { waitUntil: 'networkidle' });

// --- annotate step appears instead of an immediate analysis ---
await upload();
check('upload stops at the annotate step', requests.length === 0, `${requests.length} requests sent`);
check('pager shows page 1 of N', await page.isVisible(`text=Page 1 of ${PDF_PAGES}`));
check('read-boxes button disabled with no boxes', await page.isDisabled('button:has-text("Read 0 boxes")'));

// --- drawing, kinds and the keyboard ---
await drawBox(0.1, 0.1, 0.6, 0.2);
await page.keyboard.press('m');
await drawBox(0.1, 0.3, 0.7, 0.45);
await drawBox(0.5, 0.5, 0.505, 0.505); // a click-sized slip, ignored
check('two boxes drawn, slip ignored', (await listItems().count()) === 2, `${await listItems().count()} in list`);
const kinds = await Promise.all([0, 1].map((i) => listItems().nth(i).locator('button').first().textContent()));
check('M switches the kind of new boxes', kinds.map((t) => t.trim()).join(',') === 'Text,Maths', kinds.join(','));

await drawBox(0.2, 0.7, 0.4, 0.8);
await page.keyboard.press('Delete');
check('Delete removes the selected box', (await listItems().count()) === 2);

// --- reorder from the list ---
await listItems().nth(1).locator('button:has-text("Up")').click();
const reordered = await Promise.all([0, 1].map((i) => listItems().nth(i).locator('button').first().textContent()));
check('Up moves a box earlier', reordered.map((t) => t.trim()).join(',') === 'Maths,Text', reordered.join(','));

await page.screenshot({ path: path.join(TMP, 'regions-annotate.png') });

// --- second page gets one text box, the rest none ---
await page.click('button:has-text("Next page")');
check('next page shown', await page.isVisible(`text=Page 2 of ${PDF_PAGES}`));
check('page 2 starts empty', (await listItems().count()) === 0);
await page.click('button[aria-pressed]:has-text("Text")');
await drawBox(0.05, 0.05, 0.95, 0.3);
check('pages without boxes are announced', await page.isVisible('text=/1 page has no boxes/'));

await page.click('button:has-text("Previous page")');
check('boxes kept when paging back', (await listItems().count()) === 2);

// --- read: one request per box, then the unboxed page whole ---
await page.click('button:has-text("Read 3 boxes")');
await page.waitForSelector('h1:has-text("Results")', { timeout: 30000 });

const regionOrder = requests.map((r) => r.region ?? 'page').join(',');
check('one request per box, in reading order, then page 3 whole', regionOrder === 'math,text,text,page', regionOrder);
const page1 = requests[3]?.size;
const crops = requests.slice(0, 3).map((r) => r.size);
check(
  'boxes are cropped, not whole pages',
  page1 && crops.every((size) => size && size.width < page1.width && size.height < page1.height),
  JSON.stringify(crops) + ' vs page ' + JSON.stringify(page1),
);

// Results in reading order: a_1, text 2, text 3, whole page 4 text, a_4.
const content = await page.locator('main').innerText();
const positions = ['a sub 1', 'Text box 2 says', 'Text box 3 says', 'Whole page 4.', 'a sub 4'].map((s) => content.indexOf(s));
check('results follow the reading order', positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1])), JSON.stringify(positions));
const inlineMath = await page.locator('main span math').count();
check('inline $...$ rendered as MathML', inlineMath === 2, `${inlineMath} inline <math>`);
check('escaped dollar shown as a dollar', content.includes('costs $5.'));
check('summary counts formulas', await page.isVisible(`text=/2 formulas from ${PDF_PAGES} pages/`));

// --- .tex export follows the same order ---
const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("LaTeX (.tex)")')]);
const texPath = path.join(TMP, 'regions.tex');
await download.saveAs(texPath);
const tex = fs.readFileSync(texPath, 'utf8');
const texPositions = ['a_{1}', 'Text box 2 says $x^{2}$ costs \\$5.', 'Text box 3', 'Whole page 4.', 'a_{4}'].map((s) => tex.indexOf(s));
check('.tex in reading order with inline maths kept', texPositions.every((p, i) => p >= 0 && (i === 0 || p > texPositions[i - 1])), JSON.stringify(texPositions));

await page.screenshot({ path: path.join(TMP, 'regions-results.png'), fullPage: true });

// --- whole-page fallback is the old behaviour ---
await page.click('button:has-text("Start over")');
requests = [];
await upload();
await page.click('button:has-text("Analyze whole page instead")');
await page.waitForSelector('h1:has-text("Results")', { timeout: 30000 });
check(
  'whole-page fallback sends every page without a region',
  requests.length === PDF_PAGES && requests.every((r) => r.region === undefined),
  requests.map((r) => r.region ?? 'page').join(','),
);

// --- a 429 is waited out and retried once ---
await page.click('button:has-text("Start over")');
requests = [];
rateLimitNext = 1;
await upload();
await drawBox(0.1, 0.1, 0.6, 0.3);
await page.click('button:has-text("Read 1 box")');
const sawWait = await page
  .waitForSelector('text=/Waiting \\d+s for the rate limit/', { timeout: 5000 })
  .then(() => true)
  .catch(() => false);
await page.waitForSelector('h1:has-text("Results")', { timeout: 30000 });
check('rate-limit wait is shown', sawWait);
check('rate-limited box retried and read', requests[0]?.region === 'text', JSON.stringify(requests.map((r) => r.region)));

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
console.log(`Screenshots: ${path.join(TMP, 'regions-annotate.png')}, ${path.join(TMP, 'regions-results.png')}`);
process.exit(failures === 0 ? 0 : 1);
