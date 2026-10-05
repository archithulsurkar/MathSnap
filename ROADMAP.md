# Roadmap

Planned work and known issues. Shipped changes are in [CHANGELOG.md](CHANGELOG.md).

Nothing here has landed. Entries move to the changelog, in past tense, in the
release that carries them.

## Known issues

From a full-repository review. One further hardening item is tracked privately
and will be described here once it ships.

- **Rate limiter is defeated behind a reverse proxy.** `RateLimiter` keys on
  `req.ip` and the app never sets `trust proxy`, so behind Render, Fly, nginx or
  Cloudflare every caller resolves to the proxy's address and shares one bucket:
  one heavy user throttles everyone. Set `trust proxy` to the deployment's hop
  count before any hosted deployment. The local executable and the Pages demo are
  unaffected. (`server/index.ts`)
- **Backend switching is server-wide.** `POST /api/provider` replaces the one
  active provider for every client of that server, with no authentication. Right
  for a single-user local install; a shared deployment must disable it or put it
  behind an admin credential. (`server/index.ts`, `server/active-provider.ts`)
- **Executable is unsigned and Windows-only.** SmartScreen warns on first run,
  and there is no macOS or Linux build. Signing needs a code-signing
  certificate; other platforms need `tools/build-exe.mjs` to handle each
  platform's Node binary and its SEA injection flags. (`tools/build-exe.mjs`)
- **Request timeout does not cover retries.** `server.requestTimeout` is derived
  from a single attempt (`provider.timeoutMs + 30s`) while `withRetry` makes up
  to three, each with its own full `AbortSignal.timeout`. The socket can be torn
  down mid-retry, so the client sees a dropped connection instead of the error
  JSON it handles. (`server/index.ts`)
- **`UpstreamError` is treated as retryable.** `isRetryable` matches any object
  carrying a `.status`, and `UpstreamError` carries one, so a missing `API_KEY`
  and a request timeout thrown inside `withRetry` are retried three times.
  (`server/retry.ts`)
- **Health probes are not deduplicated in flight.** `CheckCache` stores only
  settled results, so concurrent `/api/health` requests each reach the upstream
  provider — the amplification the cache exists to prevent.
  (`server/provider.ts`)
- **Unmapped Unicode reaches the `.tex`.** `unicodeToTextLatex` covers only its
  `SYMBOLS` table; characters outside it (`∈ ⊂ ∀ ⇒ ′ … — “ ”`) survive into the
  export and abort `pdflatex` under `inputenc`.
  (`src/shared/latex-normalize.ts`)
- **No client-side image size guard.** A dense page rendered at
  `PDF_RENDER_SCALE` 2.0 can exceed the server's 8MB ceiling; the page is then
  reported only as "could not be analyzed". (`src/app.component.ts`)
- **Compile harness misreports failures.** It splits the pdflatex log on
  `os.EOL`, but pdflatex writes `\n` even on Windows, so every failure prints
  "unknown error". (`e2e/compile.ts`)
- **Export builder is duplicated.** `e2e/compile.ts` reimplements
  `exportToLatex` and has drifted from it, so the compile proof covers a document
  the app never emits. (`src/latex.ts`, `e2e/compile.ts`)
- **Base64 length is not validated.** A payload whose length is not a multiple of
  four makes `decodedByteLength` return a fractional size. (`server/index.ts`)
- **Rate-limit headroom is computed and discarded.** `remaining` is never sent as
  `X-RateLimit-Remaining`. (`server/index.ts`)
- **OpenAI temperature fallback burns a retry.** It throws a synthetic 503 rather
  than retrying inline, consuming one of three attempts plus a backoff sleep.
  (`server/openai.ts`)
- **`.tex` blob uses an unregistered media type** (`text/latex` rather than
  `application/x-tex`). (`src/app.component.ts`)

## 0.4.0 — Correction workflow

Close the gap between "the model answered" and "the answer is right and usable".

- **Inline formula placement.** `RemediationResult` keeps `originalText` and
  `formulas` disjoint, so both exports print all prose and then all formulas,
  destroying the reading order of the page. Ask for `[FORMULA_n]` placeholders
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
  over the canvas pdf.js already renders, sending cropped regions instead of
  whole pages. Cuts vision tokens, improves accuracy on dense pages, and yields
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
