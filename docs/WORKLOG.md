# LaTeX-mini work log

Plan details live in [PLANS.md](PLANS.md). This file tracks what got done and what's next.

## 2026-10-05

### Done
- Wrote the plan for the manual reading-order region tool (Part 1) and the feasibility notes for running our own model on <4GB VRAM (Part 2). Committed as `docs/PLANS.md` (68cddca).
- Started Part 1 on `feat/region-reading-order`, then paused it. The WIP is stashed (`stash@{0}`, "region tool WIP"):
  - Server: `promptFor(region?)` with `TEXT_REGION_PROMPT` / `MATH_REGION_PROMPT`, wired into `gemini.ts`, `ollama.ts`, `openai.ts`; `region` validation in `server/index.ts` (400 `bad_request` on bad values).
  - Shared types: `RemediateRequest.region`, `ContentBlock`, `MAX_REGIONS_PER_UPLOAD`.
  - New helpers + tests: `src/regions.ts`, `src/inline-math.ts`, `src/blocks.ts`.
  - `src/latex.ts`: `textWithInlineMath`, `buildLatexDocument`.
  - `e2e/compile.ts` refactored; one new dependency in `package.json`.
  - 102 tests passing at the time of stashing.
- Found a bug in existing code: `PROMPT` in `server/provider.ts` is a template literal with single backslashes, so the model gets `\pm` as `pm`, `\times` as TAB + `imes`, `\rightarrow` as CR + `ightarrow`. The stashed WIP fixes it; `main` still has it.
- Opened and merged PR #9 (PLANS, `.gitignore`, `QWEN.md`, `skills-lock.json`), then reverted it with PR #10 (a060797). `main` is back to its pre-#9 state and does not have `docs/PLANS.md`.

### State at end of day
- Branch `feat/region-reading-order` is clean and in sync with origin. It has `docs/PLANS.md` but none of the region code (that is all in the stash).
- Because #9 was reverted, merging this branch into `main` again will not bring those files back on its own. Either revert the revert (`git revert a060797`) or open a fresh branch from `main` and cherry-pick.

## 2026-10-05 (later)

### Repo reset
- The GitHub repo was re-created (18:26 UTC) and re-cloned. `main` is now `9e0dc83` Initial commit + `de3371e` plan (adds `docs/PLANS.md`, `.gitignore`).
- Gone with the old clone: branch `feat/region-reading-order`, the "region tool WIP" stash, PRs #9/#10 and their hashes. The PLANS question is settled (it is on `main`). **The region-tool WIP has to be rewritten** from the list above.

### Done
- Fixed the `PROMPT` backslash bug on `main`: `server/provider.ts` now uses `String.raw`. Regression test in `server/provider.test.ts`. 138 tests pass, server typecheck clean.

## TODO

### Part 1: region tool (redo the lost WIP first)
- [ ] Server: `promptFor(region?)` with `TEXT_REGION_PROMPT` / `MATH_REGION_PROMPT` (use `String.raw`), wired into `gemini.ts`, `ollama.ts`, `openai.ts`; `region` validation in `server/index.ts` (400 `bad_request`).
- [ ] Shared types: `RemediateRequest.region`, `ContentBlock`, `MAX_REGIONS_PER_UPLOAD`.
- [ ] Helpers + tests: `src/regions.ts`, `src/inline-math.ts`, `src/blocks.ts`.
- [ ] `src/latex.ts`: `textWithInlineMath`, `buildLatexDocument`; refactor `e2e/compile.ts`.
- [ ] Add `temml` dependency for inline LaTeX → MathML.
- [ ] `src/region-editor.component.ts` / `.html`: pointer-event drawing, Text/Math toggle (`T`/`M`), numbered colour-coded boxes, keyboard-operable side list (kind toggle, move up/down, delete), "Clear page", 60-region cap.
- [ ] `src/app.component.ts` / `.html`: `'annotating'` status, `pages` / `regionsByPage` / `currentPage` state, Prev/Next page, `analyzeRegions()` (crop at natural resolution, one request per box, "Region i of N" progress), `analyzeWholePages()` fallback, "Analyze whole page instead" button.
- [ ] Results view renders ordered `ContentBlock`s; inline `$...$` rendered via temml + `sanitizeMathml`, raw `<code>` fallback.
- [ ] `exportToLatex()` emits blocks in reading order.
- [ ] `src/services/remediation.service.ts`: optional `region` arg; on 429 wait `Retry-After` and retry once.
- [ ] `e2e/ui.mjs`: click "Analyze whole page instead" after upload; add a draw-one-box-and-analyze step.
- [ ] Manual check: handwritten photo with text/math/text boxes reordered; 2-page PDF with no boxes on page 2; whole-page fallback matches old behaviour.

### Part 2: own model on the Mac Studio (see [TRAINING.md](TRAINING.md))
- [ ] `eval/run.ts --predictions <jsonl>`, scored with `scoreFormula`.
- [ ] ADR `docs/adr/0002-training-data.md`: dataset licences, research-only vs shippable weights.
- [ ] Record the Mac Studio's chip (M2 Max or M3 Ultra) and size the stages after the stage 0 smoke run.
- [ ] Data collection: opt-in region crop saving with their LaTeX; in-app LaTeX correction step (feeds stage 3).
- [ ] Add a confidence / "verify" signal before trusting any handwriting output.
