# LaTeX-mini plans

1. **Part 1: Manual reading-order region tool.** Build now.
2. **Part 2: Own model on <4GB VRAM.** Feasibility notes and roadmap for later.

## Status (2026-10-05)
- Part 1 has been started and paused. The work in progress is in `git stash` on branch `feat/region-reading-order` ("region tool WIP"), and `git stash pop` resumes it. It contains: the server prompts and `promptFor`, `region` validation, the `regions.ts` / `inline-math.ts` / `blocks.ts` helpers, `buildLatexDocument`, and tests (102 passing). The UI (sections 2, 3 and 6) has not been started. temml is not added yet.
- **Bug found in the existing code:** `PROMPT` in `server/provider.ts` is a template literal written with single backslashes, so the model receives `\pm` as `pm`, `\times` as a TAB followed by `imes`, and `\rightarrow` as a carriage return. The WIP fixes this. If the region tool stays on hold, fix it separately by doubling the backslashes.
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

# Part 2: Own model on <4GB VRAM (later)

## Verdict
- Training a vision LLM (Qwen2.5-VL class) from scratch or with QLoRA in <4GB: **no**, it needs about 10–20GB.
- Training a small specialist pipeline in <4GB: **yes**. VRAM is not the bottleneck; **data is**.
- The most common dedicated GPU now has 8GB (3060/4060 class); 4GB is the low end.
- Training VRAM and inference VRAM are separate questions. Only you train, on the RTX 5060 (8GB, sm_120, which needs PyTorch built for CUDA 12.8 or newer). Users run inference only, which is a few hundred MB and works on CPU.
- Speech is not needed: NVDA/JAWS read MathML directly. The model's only job is to output LaTeX; LaTeX→MathML is deterministic (temml).

## Pipeline
```
page img → (manual boxes from Part 1, later a detector) → crop → HMER model → LaTeX → temml → MathML → NVDA/JAWS
```

## Handwriting reality
| | Printed | Handwritten |
|---|---|---|
| Small models | pix2tex, UniMERNet | CoMER, PosFormer, TAMER, ICAL (~6–10M params) |
| Public data | millions | CROHME (~10k), HME100K (~100k), MathWriting (~230k real + 400k synthetic) |
| Best exact-match accuracy | ~90%+ | ~60–65% on CROHME, single clean expressions only |
| VRAM to train | 2–4GB | 2–4GB |

Professor notes are harder than these benchmarks:
- Multi-line derivations, arrows, cross-outs, math mixed into prose.
- Each professor's handwriting is its own domain.
- Photo artifacts: skew, shadows, lined paper.

## Roadmap: distillation, not training from scratch
1. Keep Gemini/Qwen as the main provider.
2. **Data collection:** log every region crop together with its LaTeX, and add an in-app LaTeX correction step. Part 1's boxes already produce clean, labelled crops.
3. Once there are about 2–5k corrected crops, fine-tune PosFormer/TAMER, starting from MathWriting/HME100K weights. That fits in 4GB; expect about a day on the 5060.
4. Optionally train a detector (YOLOv8n) on the saved boxes to suggest regions automatically. It needs about 2GB.
5. Export to ONNX and add it as a new provider behind `RemediationProvider` (`server/provider.ts`), with Gemini/Ollama kept as the fallback in `auto`.
6. Compare against Gemini on a held-out set of your own notes, and switch to the local model only for cases where it matches Gemini.

## Accessibility risk
Wrong math read out confidently to a blind student is worse than no math. Whichever model you use, show a confidence signal or a "verify" flag. Handwriting will produce more errors.
