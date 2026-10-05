# Roadmap

Planned work and known issues. Shipped changes are in [CHANGELOG.md](CHANGELOG.md).

Nothing here has landed. Entries move to the changelog, in past tense, in the
release that carries them.

## Known issues

From a full-repository review. One further hardening item is tracked privately
and will be described here once it ships.

- **Hosted deployments need two settings.** Behind a reverse proxy, set
  `TRUST_PROXY` to the hop count, or every caller shares one rate-limit bucket;
  on a shared server, set `PROVIDER_SWITCHING=off`, since `POST /api/provider`
  has no authentication. Both are documented in `.env.example` but nothing
  enforces them. An admin credential for switching would be the fuller fix.
  (`server/index.ts`)
- **Executable is unsigned and Windows-only.** SmartScreen warns on first run,
  and there is no macOS or Linux build. Signing needs a code-signing
  certificate; other platforms need `tools/build-exe.mjs` to handle each
  platform's Node binary and its SEA injection flags. (`tools/build-exe.mjs`)
- **Unicode outside the tables still reaches the `.tex`.** `unicodeToTextLatex`
  now covers common maths symbols and typographic punctuation, but anything not
  in its tables (`ℝ`, `≺`, emoji) passes through and can abort `pdflatex` under
  `inputenc`. (`src/shared/latex-normalize.ts`)
- **Reopened history loses reading order.** History stores text and formulas
  separately, so an item read box by box comes back as all text, then all
  formulas. Storing the ordered blocks would need a schema change.
  (`src/history.ts`, `supabase/migrations`)

## 0.4.0 — Correction workflow

Close the gap between "the model answered" and "the answer is right and usable".

- **Inline formula placement for whole pages.** Pages read box by box keep
  their reading order, but a page read whole still returns `originalText` and
  `formulas` disjoint, so it shows all its prose and then all its formulas.
  Ask for `[FORMULA_n]` placeholders
  inside `originalText` (the `PROMPT` and `RESPONSE_JSON_SCHEMA` in
  `server/provider.ts`, since `ModelResult` is what the model returns) and
  substitute display math at each marker.
- **Per-formula editing with live preview.** Vision models misread subscripts and
  there is no way to correct one; results render read-only. Re-run
  `enrichFormula` on each edit so MathML and speech follow the corrected LaTeX. A
  remediation tool without a correction step is a demo, not a workflow.
- **Flag rewritten formulas.** Formulas temml cannot convert are already flagged
  `needsReview`. Also flag any formula `normalizeLatex` had to rewrite from
  Unicode, since that is where transcription guesses hide.
  (`src/shared/enrich.ts`)
- **Content-addressed result cache.** Keyed on the SHA-256 of the image payload
  and checked before `provider.remediateImage`; re-uploading the same PDF
  currently re-spends the entire free-tier quota.

## 0.5.0 — Measurement

The harness exists (`npm run eval`); what it lacks is data, and the part that
cannot be automated.

- Labelled benchmark set of 100–150 formulas spanning clean typeset, dense
  multi-column, handwritten and chemical notation. Hand-labelling this is a full
  day of work and it is the real cost of this milestone — see `eval/README.md`
  for the protocol.
- Screen-reader validation of the ClearSpeak `description` and `mathspeak`
  renderings: the part no other maths-OCR benchmark has, and the reason this set
  is worth publishing. Rename the dataset's `speech` label to match
  (`eval/dataset.ts`).
- CI matrix running the benchmark across every backend behind
  `RemediationProvider`, with results published in the README. Hosted providers
  need live keys and cost money per run, so gate them behind a nightly or manual
  workflow and keep Ollama in the per-push job.
- Load test demonstrating the pacer and retry classifier under burst traffic,
  quantifying the 429s avoided.

## 0.6.0 — Local formula detection

- Local layout/formula detection (Surya or PP-DocLayout via `onnxruntime-node`)
  over the canvas pdf.js already renders, proposing the boxes users now draw by
  hand, so cropped regions are sent instead of whole pages without the manual step. Cuts vision tokens, improves accuracy on dense pages, and yields
  bounding boxes.
- Hover-to-highlight linking each result to its region on the source page.

## 0.7.0 — Output verification

- Visual round-trip verification: rasterize the temml MathML the app already
  produces (headless browser screenshot) and compare it against the cropped source region with SSIM, producing a
  per-formula confidence score grounded in pixels rather than in the model's own
  report.

## 0.8.0 — Accessibility conformance

- EPUB3 export with embedded MathML, validated with DAISY Ace in CI. (Tagged
  PDF/UA from LaTeX remains too unreliable to promise.)
- axe-core audit of the application's own interface in CI.
