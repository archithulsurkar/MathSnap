# Train one robust MathSnap model on the Mac Studio

> Planning only. Nothing is downloaded, coded or trained until the user says go.

## Context
MathSnap sends page images to hosted VLMs (Gemini/OpenAI-compatible) or a local Ollama model. The goal is one locally trained vision-language model that handles text + math, printed + handwritten, crops + whole pages. It should be good enough to become the default provider, with hosted models only as a fallback.

User decisions so far:
- Train on the Mac Studio with 96GB unified memory (record the exact chip, M2 Max or M3 Ultra, before sizing the stages; it sets throughput).
- Training memory and end-user inference memory are separate: 96GB is for training only. The shipped model must still run in ≤4GB at 4-bit.
- Use public data and pretrained weights; no own note photos exist yet.
- One model, not a two-model pipeline.

The training output must drop into the existing `ollama` provider (`server/ollama.ts`) and return the app's JSON shape (`RESPONSE_JSON_SCHEMA`, `server/provider.ts`), so the app needs no new provider code.

## Prerequisites (repo side, small)
1. Fix the `PROMPT` backslash bug in `server/provider.ts:80-83` (Edit tool). Training prompts are copied from it, so it must be correct first.
2. Add `promptFor(region)` with `TEXT_REGION_PROMPT` / `MATH_REGION_PROMPT` (PLANS Part 1 §5). Training uses all three prompts verbatim, so the app and the model agree.
3. Add `eval/run.ts --predictions <jsonl>`, scoring with `scoreFormula` (`eval/score.ts:55`). The Python side can then be benchmarked with the app's exact metric.
4. Write ADR `docs/adr/0002-training-data.md` on licences. MathWriting is CC BY-NC-SA; IAM and CROHME are research-only; UniMER-1M is unclear. Decide whether the weights are research-only or shippable. If shippable, drop the NC/research sources.

## 1. Environment (Mac Studio, 96GB)
- **One directory on the Mac: `~/MathSnap`, which is the git clone.** Everything else lives inside it in gitignored folders, so the project is one folder to back up, move or delete:

  ```
  ~/MathSnap/                 git clone (app, server, eval, docs)
    train/                    training code (committed)
      .venv/                  Python env, made by uv            (ignored)
      data/                   downloads, renders, jsonl splits  (ignored)
      runs/                   checkpoints and logs per run      (ignored)
      export/                 fused weights, GGUF, Modelfile    (ignored)
    .env                      local settings                    (ignored)
  ```
- Python 3.11+ via `uv`, run from `train/` (`uv sync` creates `train/.venv`).
- Ollama keeps its own model store (`~/.ollama/models`), shared by every model on the Mac, so the exported GGUF is registered with `ollama create` from `train/export/` rather than moved into the project folder.
- **Disk budget:** ~200GB (fusion 28GB plus MathWriting, UniMER, renders, checkpoints).
- **Main stack:** `mlx` + `mlx-vlm` (LoRA fine-tuning of Qwen-VL-family models on Apple Silicon).
- **Fallback stack:** PyTorch MPS + HF `transformers` + `peft`, if mlx-vlm lacks the chosen base.
- **Long runs:** use `caffeinate -dims` so the Mac doesn't sleep. Training must be resumable from checkpoints, since reboots and updates will happen. The Studio's cooling makes throttling unlikely, but keep the checkpoints anyway.
- **Memory:** raise the GPU wired-memory limit if MLX hits it (`sudo sysctl iogpu.wired_limit_mb=<~80% of RAM>`), leaving headroom for macOS and the data loader.

## 2. Pick the base model (zero-shot bake-off, day 1)
- **Candidates:** small VLMs with permissive licences, about 2–7B. Examples: Qwen2.5-VL-7B (Apache-2.0); Qwen2.5-VL-3B (check licence, possibly research-only); newer Qwen-VL 2–4B releases if any are Apache-2.0; SmolVLM2 (Apache-2.0).
- **Method:** run each zero-shot on `eval/dataset` and a 500-sample slice of CROHME 2019 test, using the app's prompts, and score with `npm run eval -- --predictions`.
- **Pick** the best `handwritten` exact score that also fits a 4-bit inference budget of ≤4GB for end users. 3–4B is the likely winner; 7B only if it is far better. 96GB can train a 7B comfortably, but a 7B at Q4 is ~5GB and breaks the end-user budget, so it ships only as an opt-in "large" model.
- **Optional teacher:** if the 7B is clearly better, fine-tune it too and use it to pseudo-label the stage 3 data for the 3–4B student. This replaces Gemini as the labeller, which its API terms rule out anyway.

## 3. Data pipeline (`train/data/`)
| Source | Use | Size | Notes |
|---|---|---|---|
| fusion-image-to-latex | printed + some handwritten math crops | 6.9M | KaTeX-normalized; subsample |
| MathWriting | handwritten math | 230k real + 400k synth | render InkML → PNG, varied pen/DPI |
| UniMER-1M | screen-captured / noisy crops | 1.06M | licence check |
| IAM + GNHK | handwritten text lines / notes | small | upsample |
| Synthetic arXiv pages | whole-page `{originalText, formulas}` | unlimited | compile LaTeX → page PNG; labels come from the source |
| Hard negatives | blank, cross-outs, diagrams | ~5% | target = empty fields (teaches abstaining) |

Steps:
1. `fetch.py`: download each source, recording source, licence and writer id (if any) per sample.
2. `render_inkml.py` (MathWriting) and `render_pages.py` (arXiv). Page renders split each source into text and display-math spans, which give the JSON labels.
3. **Label normalization through the app's own code:** a `tools/normalize-labels.ts` (tsx) pass applies `normalizeLatex` (`src/shared/latex-normalize.ts:162`) and drops labels where `latexToMathml` (`src/shared/latex-to-mathml.ts:31`) throws.
4. **Augmentation** (albumentations): perspective/skew, shadow, lined/grid paper, blur, JPEG, low light. Apply to ~50% of samples, both handwritten and printed.
5. **Format as chat jsonl:** `{image, messages:[{user: <PROMPT | TEXT_REGION_PROMPT | MATH_REGION_PROMPT>}, {assistant: <JSON matching RESPONSE_JSON_SCHEMA>}]}`.
6. **Splits:**
   - Hold out by writer (MathWriting/IAM) and by paper (arXiv).
   - Dedupe against `eval/dataset` and the CROHME test sets by canonical LaTeX (`canonicalizeLatex`, `eval/canonical.ts:75`), to prevent leakage.
7. **Resolution caps:** crops ≤ ~448px on the long side, pages ~1280px. These bound vision tokens, and therefore speed. Memory allows more, but the caps must match what the app sends at inference time, so raise them only together with the app's page render size.

## 4. Training plan
- **Method:** LoRA on the language model (rank 32–64, alpha 2×rank) with the base in **bf16**, not 4-bit: 96GB holds it, and it avoids QLoRA's quantization noise. Vision tower frozen at first; unfreeze its last blocks (or LoRA them) in stage 2 if handwriting plateaus, since memory is no longer the constraint.
- **Hyperparameters to start:** lr 1e-4 cosine, warmup 3%, batch 4–8 with grad accumulation 2–4 (effective 16), gradient checkpointing off unless memory runs short. Checkpoint every 1k steps; evaluate every 5k.
- **Rough memory:** 3–4B bf16 LoRA ≈ 20–35GB at batch 8 with page-size images; 7B ≈ 40–60GB. Measure in stage 0.
- **Throughput:** rough guess only, 3–4B at about 3–6 samples/s (M3 Ultra toward the top, M2 Max toward the bottom), i.e. ~250–500k samples/day. Still use a curated **subsample**, not all 6.9M.

| Stage | Data | Samples | Goal |
|---|---|---|---|
| 0 smoke | 1k mixed | 100 steps | no OOM, loss drops, JSON valid |
| 1 crops | 40% hw math, 30% printed/screen, 15% hw text, 10% pages, 5% negatives | ~300k | core recognition |
| 2 pages + noise | shift to 30% pages, heavier augmentation | ~150k | layout, reading order, photo robustness |
| 3 own data (later) | pseudo-labels + Phase 3 gold corrections, upweighted | as collected | adapt to professor handwriting |

- Plan for ~1–2 days of wall-clock time for stages 1–2 on the 3–4B; roughly double for a 7B teacher.
- After stage 0, measure real throughput and resize the stages to fit.

## 5. Evaluation gates (every 5k steps and at stage ends)
Score with `npm run eval -- --predictions`. Track:
- **exact (canonical) per category:** typeset, dense, handwritten, chemistry. This is the main metric.
- **Held-out writer split:** robustness to unseen handwriting.
- **CROHME 2019/2023 test exact:** public comparability. Small specialist models reach about 60–65%.
- **JSON validity rate:** must be ≥99.5%.
- **Unparseable LaTeX rate.**
- **Abstain rate on negatives.**
- **Baseline:** Gemini (eval only, never used for training labels, because of its API terms).

**Stop or rollback rule:** keep the best checkpoint by `handwritten` exact score. Watch for regression on `typeset`, which signals catastrophic forgetting; if it appears, mix in more printed data.

## 6. Export and integration
- Fuse LoRA into the base, convert to GGUF plus the vision projector with llama.cpp, quantize to Q4_K_M, and write an Ollama `Modelfile`.
- Re-run the eval on the quantized model. Accept a drop of ≤2 points against the fp16 checkpoint.
- Wire-up is config only: set `PROVIDER=ollama` and point the model tag at the trained model.
- Make it the default in `auto` only per category where it matches Gemini; hosted stays as the fallback (master plan Phase 6f).
- Later: bundle a runtime in the exe (`tools/build-exe.mjs`) so users don't need a separate Ollama install.

## 7. Repo additions (when executed)
- `train/pyproject.toml`, `train/README.md`.
- `train/data/{fetch,render_inkml,render_pages,augment,build_jsonl,split}.py`.
- `train/{train,predict,export}.py`.
- `tools/normalize-labels.ts`; `eval/run.ts --predictions`.
- `.gitignore`: `train/.venv/`, `train/data/`, `train/runs/`, `train/export/`, `*.safetensors`, `*.gguf` (already added).

## Verification
- Stage 0 smoke completes on the Mac Studio without OOM, logging peak memory and samples/s, and `predict.py` emits valid JSON for 20 samples.
- `npm run eval -- --predictions preds.jsonl` prints the per-category table for (a) the zero-shot base and (b) each stage checkpoint. The fine-tuned model must beat its own zero-shot base on `handwritten`.
- The quantized GGUF in Ollama, used through the real app (`npm run dev`, `PROVIDER=ollama`), transcribes a handwritten crop and a typed PDF page end to end; MathML renders and the `.tex` compiles (`npm run test:compile`).
- `npm test` + `npm run typecheck` stay green after the TS additions.

## Rest of the master plan (unchanged, for sequencing)
- **0:** hygiene (PROMPT fix, WORKLOG rewrite).
- **1:** ROADMAP known-issue fixes.
- **2:** region tool, with the opt-in crop saving that feeds stage 3.
- **3:** correction workflow (gold labels).
- **4:** measurement (grow `eval/dataset` to 100–150 entries; `handwritten` matters most).
- **5:** detection + SSIM confidence.
- **6f:** local-first mode.
- **7:** EPUB3/axe-core.

Mac training stages 0–2 can start after Prerequisites + ADR. Stage 3 waits for Phases 2–3.
