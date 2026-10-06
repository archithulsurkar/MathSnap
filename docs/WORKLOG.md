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
- Region tool rebuilt and finished on `feat/region-reading-order` (PR #1): server region prompts, shared types, `regions` / `inline-math` / `blocks` helpers, `buildLatexDocument`, region editor, annotate step, block-ordered results and exports, client 429 retry. `temml` was already a dependency.
- `npm run eval -- --predictions <jsonl>` for scoring the training pipeline's output.
- ADR 0002 on training-data licences: accepted, option C.
- Cleared most ROADMAP known issues (see CHANGELOG [Unreleased]).
- Checks: 198 unit tests; typecheck; `e2e/regions.mjs` (fake backend, 22 checks) and `e2e/ui.mjs` (run against a fake API) both pass. pdflatex is not installed here, so `npm run test:compile` skipped.

## TODO

### Needs you
- [x] ADR 0002: option C (research model first, ship only the permissive one).
- [x] Mac Studio is an M4 Max with 128GB; project cloned at `~/MathSnap`, Ollama reachable at 192.168.0.216:11434, SSH as `seclab` works.
- [ ] Run against a real model: `npm run dev` with a provider, then `npm run test:e2e`, and by hand a handwritten photo with text/maths/text boxes reordered.
- [ ] Install a TeX distribution (or use CI) and run `npm run test:compile`.

### Part 1 follow-ups
- [ ] History loses reading order on reopen (stores text and formulas apart; needs a schema change).
- [ ] Whole-page reads still list all text then all formulas (ROADMAP 0.4.0 placeholders).
- [ ] Box resize/move handles (out of scope so far: delete and redraw).

### Part 2: own model on the Mac Studio (see [TRAINING.md](TRAINING.md))
- [ ] Stage 0 smoke run once the ADR is decided; size the stages from its throughput.
- [ ] Data collection: opt-in region crop saving with their LaTeX; in-app LaTeX correction step (feeds stage 3).
- [ ] Add a confidence / "verify" signal before trusting any handwriting output.
