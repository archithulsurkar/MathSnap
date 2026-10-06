# LaTeX-mini plans

1. **Part 1: Manual reading-order region tool.** Build now.
2. **Part 2: Own model, trained on the Mac Studio (M4 Max, 128GB).** Full plan in [TRAINING.md](TRAINING.md); summary below.

## Status (2026-10-05)
- Part 1 is built on `feat/region-reading-order` (PR #1): every section below is done, and checked in a browser against a fake backend (`npm run test:e2e:regions`). What remains is a run against a real model with handwritten notes. The old stash was lost when the repo was re-created, so this is a rewrite of it.
- The `PROMPT` backslash bug (the model got `\pm` as `pm`, `\times` as TAB + `imes`) is fixed: the prompts use `String.raw`.
- If you write files through the Bash tool (heredocs, python `-`), `\\` collapses to `\`. Make edits that contain backslashes with the Edit or Write tool instead.

---

# Part 1: Manual reading-order region tool

## Context
Target input is handwritten professor notes. VLMs reading a whole handwritten page get layout wrong: they miss formulas, merge text with math, and scramble the order. The fix is to let the user draw boxes over each piece of the page, mark each one **Text** or **Math**, and set the reading order. Each box is cropped and sent on its own, so the model sees one small, clean region instead of a messy page. That improves accuracy on handwriting. The output comes back as an ordered stream of text and math, so NVDA/JAWS read the page in the right order. Speech is out of scope because screen readers handle MathML themselves. Cropped regions with corrected LaTeX can later become training data, but that is not part of this plan.

## Flow change
Today: upload, every page is analyzed at once, results shown.
New: upload → **annotate** (new status) → analyze regions in order → results.
- The annotate screen shows one page at a time, with Prev/Next buttons when there are several pages.
- An **"Analyze whole page instead"** button keeps the current behaviour as a fallback. Typed or printed PDFs don't need boxes.

## Changes

### 1. Pure geometry: `src/regions.ts` (new) + `src/regions.test.ts`
- `type RegionKind = 'text' | 'math'`
- `interface Region { id: string; kind: RegionKind; x: number; y: number; w: number; h: number }`. Coordinates are normalized to 0–1 of the page image, so display scaling doesn't matter.
- `rectFromDrag(start, end)`: normalizes a drag in any direction and clamps it to [0,1].
- `isTooSmall(rect, minPx, displaySize)`: ignores accidental clicks.
- `toPixelRect(region, naturalW, naturalH)`: integer crop rect for the full-resolution image.
- `moveRegion(list, index, delta)`: reorders a region (up/down).
- Tests cover all of these (tsx test runner, same as `src/latex.test.ts`).

### 2. Region editor: `src/region-editor.component.ts` + `.html` (new, standalone, OnPush, signals)
- Inputs: `pageUrl` and `regions` (one page). Output: `regionsChange`.
- Layout: the `<img>` sits inside a `relative` wrapper with an absolutely positioned overlay `div`.
- Drawing uses pointer events (`pointerdown`/`move`/`up` with `setPointerCapture`) so mouse, pen and touch all work. The overlay gets `touch-action: none`.
- A toolbar toggle sets the current kind (Text/Math, keys `T`/`M`). New boxes take the current kind.
- Boxes are colour-coded by kind and show their order number badge. Clicking a box selects it.
- **Side list**, keyboard-operable: one row per region showing the order number, a kind toggle, Move up / Move down, and Delete. Delete also works with the `Delete` key on the selected box. The list is the accessible way to edit; drawing is pointer-only, and the list explains that.
- "Clear page" button.

### 3. App wiring: `src/app.component.ts` / `.html`
- `Status` gains `'annotating'`. `handleFileChange` stops after rendering pages: it stores `PageImage[]` and sets `'annotating'`.
- New state: `pages` (full `PageImage[]`, not just the data URLs), `regionsByPage: signal<Region[][]>`, `currentPage`.
- `analyzeRegions()`: for each page, crops each region in list order onto an offscreen canvas at the natural resolution and exports PNG base64. Each crop is sent with `remediateImage(base64, mime, kind)`. Progress shows "Region i of N". A page with no regions falls back to whole-page analysis for that page.
- `analyzeWholePages()`: the existing loop, moved out of `handleFileChange` unchanged.
- Result becomes an ordered block list (see 4). The results view renders blocks in order. A text block is a paragraph. A math block keeps the current card (LaTeX + sanitized MathML; the description is still shown when present).
- Text blocks with inline `$...$` math: new `src/inline-math.ts` (+ test) splits text into string and math segments, handling `\$` escapes and unclosed `$`. Each math segment is converted with **temml** (new dependency, LaTeX→MathML, small, no fonts needed), run through `sanitizeMathml` (`src/mathml.ts:11`), and rendered inline so NVDA/JAWS read it as math. If temml fails on a segment, the raw LaTeX is shown in `<code>` instead.
- `exportToLatex()` emits blocks in reading order: text goes through `textWithInlineMath` (see 5), math through `toDisplayMath`. The old whole-page path maps onto the same blocks: text first, then formulas, as today.

### 4. Shared types: `src/shared/remediation.types.ts`
- `RemediateRequest.region?: 'text' | 'math'`. The field is optional, so whole-page requests stay unchanged.
- `type ContentBlock = { kind: 'text'; text: string } | { kind: 'math'; formula: Formula }`. This is client-side only; the server response shape stays `RemediationResult`.
- `MAX_REGIONS_PER_UPLOAD = 60`, enforced in the editor (adding more is disabled, with a message).

### 5. Server
- `server/provider.ts`: add `promptFor(region?)`, which returns `PROMPT` (whole page), `TEXT_REGION_PROMPT` or `MATH_REGION_PROMPT`.
  - Text prompt: transcribe handwriting into `originalText`; write inline math as `$...$` LaTeX, following the same LaTeX rules; leave `formulas` empty. `escapeLatex` must not mangle these spans in the export, so add a `textWithInlineMath` export helper in `src/latex.ts` that escapes only the non-math segments, with a test.
  - Math prompt: the image is one handwritten formula, possibly multi-line. Return exactly one formula, with lines joined using `\\`. Keep the existing LaTeX rules, and leave `originalText` empty.
  - Keep the same JSON schema and `parseModelJson`, so all providers can reuse them.
- `RemediationProvider.remediateImage(base64, mimeType, region?)`. Update `server/gemini.ts:104`, `server/ollama.ts:84` and `server/openai.ts:93` to use `promptFor(region)` instead of `PROMPT`.
- `server/index.ts:54`: read and validate `region` (must be undefined, `'text'` or `'math'`, else 400 `bad_request`) and pass it through.
- Add a `promptFor` test and a validation case in `server/provider.test.ts`.

### 6. Client service: `src/services/remediation.service.ts`
- Takes an optional `region` argument.
- On a 429, waits for `Retry-After` and retries once. Region mode sends many small requests, and `RATE_LIMIT_MAX` (30/min) can trip with a fast local Ollama. Gemini is already paced server-side.

## Decisions (confirmed)
- One request per box: the best accuracy on handwriting. It is slow on the Gemini free tier (about 6 min for 30 boxes), so the progress text shows the region count.
- Inline math stays as `$..$` inside text blocks and renders as MathML.
- Delete and redraw only; no move or resize handles yet.

## Out of scope
- Box resize/move handles. Delete and redraw instead; add handles later if needed.
- Automatic region detection.
- Saving/loading annotations and editing LaTeX corrections. These belong to the later data-collection work.

## Verification
- `npm test`: new `regions.test.ts` and `promptFor`/validation tests pass, and existing tests stay green.
- `npm run typecheck`.
- Manual run with `npm run dev`: upload a handwritten notes photo, draw 3 boxes (text, math, text), reorder them, analyze. Results and the `.tex` export should follow the drawn order, and the MathML should render.
- Try a 2-page PDF with no boxes on page 2; that page should fall back to whole-page analysis.
- Check that "Analyze whole page instead" reproduces the old behaviour.
- Update `e2e/ui.mjs`: after upload, click "Analyze whole page instead" so the existing e2e path still passes. Add a step that draws one box with `page.mouse` and analyzes it.

---

# Part 2: Own model, trained on the Mac Studio (later)

Full plan: [TRAINING.md](TRAINING.md). This replaces the earlier idea of a small handwriting-only model (PosFormer/TAMER) trained on the RTX 5060.

## Summary
- **One model** for text and math, printed and handwritten, crops and whole pages: a small vision-language model (Qwen-VL class, likely 3–4B), fine-tuned with LoRA.
- **Training:** Mac Studio (M4 Max), 128GB unified memory, `mlx-vlm`, base model in bf16. Public data and pretrained weights only, since there are no note photos of our own yet.
- **Shipping:** quantized to Q4 GGUF and run through the existing `ollama` provider, returning the app's JSON shape, so the app needs no new provider code. It must run in ≤4GB for end users; a 7B can ship only as an opt-in "large" model.
- Speech is not needed: NVDA/JAWS read MathML directly. The model's only job is text and LaTeX; LaTeX→MathML is deterministic (temml).

## Repo-side prerequisites
1. Done: fix the `PROMPT` backslash bug.
2. Done: `promptFor(region)` with `TEXT_REGION_PROMPT` / `MATH_REGION_PROMPT`. Training uses all three prompts verbatim.
3. Done: `eval/run.ts --predictions <jsonl>`, so the Python side is scored with the app's own metric.
4. Done: ADR `docs/adr/0002-training-data.md` accepted with option C. Train a research model on every licence-checked source (never distributed) and a shippable one on permissive sources plus our own corrected data (the only one that ships).

## Handwriting reality
| | Printed | Handwritten |
|---|---|---|
| Small models | pix2tex, UniMERNet | CoMER, PosFormer, TAMER, ICAL (~6–10M params) |
| Public data | millions | CROHME (~10k), HME100K (~100k), MathWriting (~230k real + 400k synthetic) |
| Best exact-match accuracy | ~90%+ | ~60–65% on CROHME, single clean expressions only |

Professor notes are harder than these benchmarks:
- Multi-line derivations, arrows, cross-outs, math mixed into prose.
- Each professor's handwriting is its own domain.
- Photo artifacts: skew, shadows, lined paper.

Public benchmarks don't capture this, which is why the training plan's stage 3 adapts the model to our own notes.

## Roadmap
1. Keep Gemini/Qwen as the main provider meanwhile.
2. Stages 0–2 on the Mac Studio (smoke run, crops, then pages and noise) once prerequisites 3 and 4 are done. Rough guess: 1–2 days of wall-clock time for a 3–4B.
3. **Data collection:** Part 1's boxes produce clean, labelled crops. Add opt-in crop saving and an in-app LaTeX correction step; those feed stage 3.
4. Make the local model the default in `auto` only per category where it matches Gemini on the eval set; hosted models stay as the fallback.

## Accessibility risk
Wrong math read out confidently to a blind student is worse than no math. Whichever model you use, show a confidence signal or a "verify" flag. Handwriting will produce more errors.
