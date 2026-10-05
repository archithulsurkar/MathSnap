# 2. Training data licences decide whether our model can ship

Date: 2026-10-05

## Status

Proposed. The open question is in **Decision needed**; nothing is downloaded
until it is answered.

## Context

[TRAINING.md](../TRAINING.md) fine-tunes a small vision-language model on public
data and ships it to end users through the `ollama` provider. A fine-tuned
model is a derivative of its training data as far as most dataset licences are
concerned, so the most restrictive licence in the mix sets the terms for the
weights.

The datasets that matter most for handwriting are also the most restricted:

| Source | What it gives us | Licence | Commercial / redistributed weights |
|---|---|---|---|
| MathWriting (Google) | handwritten math, 230k real + 400k synthetic | CC BY-NC-SA 4.0 | No: non-commercial, and share-alike would bind the weights |
| CROHME 2014/2016/2019/2023 | handwritten math, ~10k, the public benchmark | distributed for research use | No explicit grant; treat as research-only |
| HME100K | handwritten math, ~100k | research licence agreement (verify) | Treat as research-only |
| IAM Handwriting Database | handwritten text lines | non-commercial research, registration required | No |
| GNHK | handwritten notes photos | verify (believed CC BY 4.0) | Probably yes, with attribution |
| UniMER-1M | printed and screen-captured math | verify | Unknown |
| fusion-image-to-latex | printed + some handwritten math crops | verify; it aggregates other sets, so it inherits theirs | Unknown, likely mixed |
| Synthetic pages from arXiv source | whole pages with exact labels | per paper; most use arXiv's distribution licence, which grants no reuse | Only papers under CC BY / CC BY-SA / CC0 |
| Our own notes, later | the target domain | ours, with the note-taker's consent | Yes |

The base model matters too: Qwen2.5-VL-7B is Apache-2.0, but Qwen2.5-VL-3B
ships under the Qwen research licence. Base model licences go through the same
check as data.

Gemini output is excluded from training labels throughout: its API terms forbid
using it to build competing models. It stays an evaluation baseline only.

## Options

**A. Research-only weights.** Use everything above. Best handwriting accuracy,
fastest start. The weights cannot be bundled in the exe or offered for download;
they are for measuring what is achievable and for personal use.

**B. Shippable weights.** Use only sources that permit it: GNHK (if confirmed),
CC-licensed arXiv renders, synthetic data we generate ourselves (rendered
LaTeX in handwriting-style fonts, augmented), our own consented notes, and a
base model under Apache-2.0 or MIT. Expect clearly worse handwriting accuracy
until our own corrected data accumulates.

**C. Both, in that order.** Train A first to learn what the architecture can
do and to pseudo-label our own notes, but never ship A or anything trained on
A's labels. Train B from the permissive subset plus human-corrected own data,
and ship only B. Labels a human has corrected count as ours.

## Decision needed

Choose A, B or C. **Recommendation: C.** It keeps the fast research path while
leaving a clean route to something users can install.

Whatever is chosen, these hold:

- `train/data/fetch.py` records source, licence and (where known) writer id for
  every sample, so a shippable subset can be selected later without
  re-downloading.
- Every trained checkpoint records its data mix and is tagged
  `research-only` or `shippable` in its metadata and its Ollama tag name.
- No research-only checkpoint is bundled by `tools/build-exe.mjs` or made the
  default in `auto`.
- Licences marked "verify" above are checked against the source before any
  sample from them is used, and this table is updated.

## Consequences

Under C:

- Two training tracks to maintain, and the shippable model lags the research one
  on handwriting until our own corrected data grows (TRAINING.md stage 3).
- The correction workflow (master plan phase 3) becomes a prerequisite for
  shipping, not a nice-to-have.
- Pseudo-labels from the research model are only a starting point for human
  correction; uncorrected ones never enter the shippable set.
