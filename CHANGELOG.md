# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Planned work and known issues live in [ROADMAP.md](ROADMAP.md); this file records
only what has shipped.

## [Unreleased]

### Added

- Reading-order boxes. After upload, the page is shown for annotation: draw a
  box around each piece of text or maths in the order it should be read, mark
  it Text or Maths (`T`/`M`), and reorder or delete boxes from a list that works
  from the keyboard. Each box is cropped at full resolution and read on its own
  with a prompt for its kind, which helps most with handwriting. Results and
  both exports follow the drawn order; pages without boxes are read whole, and
  "Analyze whole page instead" keeps the previous behaviour.
- Inline maths in text. A text box comes back with `$...$` maths inside it,
  shown and exported to HTML as MathML, and kept as maths in the `.tex`.
- `npm run eval -- --predictions <file>` scores answers produced elsewhere (one
  JSON object per line) with the same metric, so a locally trained model can be
  compared with the hosted backends.
- `npm run test:e2e:regions`: a browser check of the box flow against a fake
  backend, needing no model.
- `TRUST_PROXY` and `PROVIDER_SWITCHING=off` for hosted deployments, and an
  `X-RateLimit-Remaining` header on rate-limited endpoints.

- Optional accounts, by emailed magic link (Supabase Auth). Signed out, every
  feature still works; signed in, each result is saved to a personal history
  that can be reopened or deleted. Only the LaTeX and page text are stored:
  MathML and speech are re-derived on load, and page images never leave the
  device. Row-level security restricts every user to their own rows; the
  schema is in `supabase/migrations`.

### Changed

- New interface: a worksheet rather than a dashboard. Ink on paper, rules
  instead of cards, one accent colour, textbook equation numbers, and a
  highlighter mark for formulas that need checking. Set in Atkinson
  Hyperlegible, bundled so the desktop app works offline.
- Result cards lead with the rendered formula, then its spoken form, then the
  LaTeX; one primary action; plain-language notices.
- Buttons meet 44px on touch screens, all text meets WCAG AA contrast in light
  and dark, and panels respect reduced-motion settings.
- The HTML export is plain: black text on a white background in the browser's
  default font, with no panels, colours or dark mode.
- The export keeps the original text's layout (line breaks, blank lines,
  indentation) instead of reflowing it into paragraphs, and the prompt asks the
  model to transcribe that layout exactly, without reflowing or correcting it.
- The results page now shows the transcribed text as well as the formulas.
- The `.tex` export has one Content section in reading order instead of
  separate text and formula sections, and no longer repeats each formula's
  spoken description. It is saved as `application/x-tex`.
- The HTML export has one Content section in reading order.
- The request timeout covers every retry attempt, so a slow retried request
  gets the error message it should rather than a dropped connection.

### Fixed

- The model prompt lost its LaTeX backslashes: the model was shown `pm` for
  `\pm`, and a tab or carriage return in place of `\t` and `\r` in `\times` and
  `\rightarrow`.
- Timeouts, unreachable hosts and missing keys were retried three times.
- Concurrent `/api/health` requests each reached the upstream provider.
- Common maths symbols (`∈ ⊂ ∀ ⇒ ′`) and typographic punctuation
  (`… — – “ ” ‘ ’`) in transcribed text aborted the `.tex` build.
- A page or photo over the 8MB upload limit failed as "couldn't be read"; it is
  now re-encoded to fit before sending.
- Base64 whose length is not a multiple of four is rejected instead of being
  measured as a fractional size.
- A model that rejects a custom temperature no longer spends a retry and a
  backoff before the request is resent without it.
- The compile check reported every pdflatex failure as "unknown error" on
  Windows, and compiled its own copy of the export rather than the app's.

## [0.3.0] - 2026-09-27

The model now transcribes and nothing else; everything a reader receives is
derived from its LaTeX by rule. The deterministic half runs with no model at all,
in a browser or from a single executable.

### Added

- ClearSpeak and MathSpeak renderings generated from MathML by the Speech Rule
  Engine; the description is no longer written by the model. See
  [ADR 0001](docs/adr/0001-deterministic-speech.md).
- Single-file HTML export carrying inline MathML, the spoken description and the
  page images as data URIs. Opens offline in any browser with no toolchain, which
  `.tex` never could.
- A formula whose LaTeX will not convert is flagged `needsReview` and shown as
  such, instead of having a conversion error narrated to the reader.
- Benchmark harness under `eval/`: dataset schema and loader, a canonical-form
  comparison that treats `\frac`/`\dfrac`, `x^2`/`x^{2}` and `(`/`\left(` as
  equal, per-category reporting, and `npm run eval`. The labelled dataset itself
  is still to be built.
- `docs/institutional-workflow.md`, recording the constraints a campus
  disability resources office imposes and the questions still open.
- Paste-LaTeX mode running entirely in the browser: no provider, no key, no
  network. A "Listen" button speaks the description through the Web Speech API,
  and "Try an example" means a first run needs no input.
- Settings panel for switching model backend at runtime, offering Ollama,
  OpenRouter, Groq, Together, Mistral, OpenAI and Gemini. A candidate is probed
  before it is adopted, so a mistyped key leaves the working backend running.
  Keys are held in server memory only.
- GitHub Pages workflow publishing the browser-only demo (424 kB transferred),
  so the project can be tried without installing anything.
- Single executable for Windows (`npm run build:exe`): server, frontend and
  speech tables in one folder, runnable with no Node.js installed.
  `--self-test` checks an install without starting a server.

### Changed

- The model returns a transcription and LaTeX only. MathML is derived from the
  LaTeX with temml rather than requested separately, so the two can no longer
  disagree, and the prompt and response schema shrink accordingly.

## [0.2.0] - 2026-09-07

Moved every model call off the client. The previous release shipped the Gemini
key to the browser.

### Security

- The API key is read only by the backend and is never bundled into the
  frontend. The browser posts page images to `POST /api/remediate` instead of
  calling Gemini directly.
- Per-IP fixed-window rate limiting, with a budget derived from `MAX_PDF_PAGES`
  so one legitimate multi-page upload cannot exhaust it. Client identity is taken
  from the socket address; see ROADMAP.md for the reverse-proxy caveat.
- Request validation on the proxy: accepted MIME types, raw-base64 shape, and an
  8MB decoded size ceiling.
- Model-generated MathML is allowlist-sanitized with DOMPurify before it reaches
  `bypassSecurityTrustHtml`.
- The prompt instructs the model to treat all text in the image as data to
  transcribe, never as instructions to follow.

### Added

- `RemediationProvider` interface with three interchangeable backends: Ollama
  (local, free), any OpenAI-compatible `/v1/chat/completions` endpoint, and
  Gemini.
- `PROVIDER=auto` startup probe that selects the first healthy backend; an
  explicit provider name is honoured even when unhealthy, so a deliberate choice
  fails loudly.
- Outbound request pacing (`Pacer`) that spaces calls under a provider's
  requests-per-minute limit instead of collecting 429s.
- Retry with exponential backoff and jitter that honours a server-requested delay
  and distinguishes a per-day quota from a per-minute one — waiting cannot clear
  the former, so it fails fast with a specific message.
- Memoized health probes for the hosted providers behind `/api/health`, since a
  probe there is a billable upstream call.
- Multi-page PDF support up to `MAX_PDF_PAGES`, with per-page progress and
  per-page failure isolation; a single bad page no longer discards the rest.
- Content-based file type detection from magic bytes, replacing reliance on
  `File.type`.
- Unicode-to-LaTeX normalization applied to every provider's output, so
  transcriptions containing Unicode math still compile.
- `.tex` export with the original page images, extracted text and remediated
  formulas.
- Unit tests for the pacer, retry classifier, rate limiter, health-probe cache,
  provider parsing and LaTeX normalization; a Playwright UI smoke test; and a
  pdflatex compile check that proves the exported document builds.

### Changed

- The server serves the built frontend, so production runs as a single origin.

## [0.1.0] - 2025-12-13

Initial release.

### Added

- Upload a PDF or image, extract the page text and every formula on it, and get a
  screen-reader description, LaTeX and MathML for each.
- Angular frontend with pdf.js page rendering and a `.tex` export.
- Gemini-backed extraction. **The API key was held in the browser; superseded by
  0.2.0.**
