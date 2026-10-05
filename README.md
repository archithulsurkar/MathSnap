<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://upload.wikimedia.org/wikipedia/commons/9/92/LaTeX_logo.svg" />
</div>

# Formula Accessibility Remediator

Upload a page of a document (PDF or image) and get back, for every formula on it:
a screen-reader description, LaTeX, and rendered MathML — plus a `.tex` export of
the whole page.

## Architecture

The model call happens on a small Express server, never in the browser. The
frontend renders PDF pages to PNG locally with pdf.js and posts each page to
`POST /api/remediate`.

```
browser  ──POST /api/remediate {image, mimeType}──▶  server
                                                       │
                                    PROVIDER=ollama ───┤──▶ local Ollama
                                    PROVIDER=gemini ───┤──▶ Gemini API (key server-side)
                                    PROVIDER=auto   ───┘──▶ local if ready, else hosted
```

`PROVIDER=auto` (the default) probes each backend at startup and uses the first
healthy one. An explicit `ollama` or `gemini` is honoured even when unhealthy, so
a deliberate choice fails loudly rather than running somewhere unexpected.

Two backends sit behind one `RemediationProvider` interface, sharing a prompt,
a JSON schema, and a response validator:

| Provider | Cost | Needs | Notes |
| --- | --- | --- | --- |
| `ollama` | free | Ollama running, a vision model pulled | fully local, nothing leaves the machine |
| `gemini` | per call | `API_KEY` | faster, stronger on dense pages |

Model output is treated as untrusted: MathML is allowlist-sanitized with
DOMPurify before it is rendered.

## Run locally

**Prerequisites:** Node.js 22.13+ (pdf.js requirement)

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env`.
3. Pick a backend:
   - **Local (default).** Install [Ollama](https://ollama.com), then pull a
     vision model — it must be vision-capable, since the app sends page images:
     ```
     ollama pull qwen2.5vl:7b
     ```
   - **Hosted.** Set `PROVIDER=gemini` and put your
     [Gemini API key](https://aistudio.google.com/apikey) in `API_KEY`.
4. Start both processes (API on `:8787`, app on `:3000`):
   ```
   npm run dev
   ```

The dev server proxies `/api` to the API process, so open http://localhost:3000.
`GET /api/health` reports which provider is active and whether it is ready.

## Other commands

| Command | What it does |
| --- | --- |
| `npm run build` | Builds the frontend into `dist/` |
| `npm start` | Runs the API, also serving `dist/` on a single origin |
| `npm run preview` | Build, then serve the built app from the API |
| `npm test` | Runs the LaTeX helper tests |
| `npm run typecheck` | Typechecks the server and compiles the app |
| `npm run test:e2e` | Drives the real app in Chrome (needs `npm run dev` and a live provider) |
| `npm run test:compile` | Compiles an exported `.tex` with pdflatex; skips if no TeX installed |

## Limits

- A PDF is analyzed up to the first 10 pages — each page is one model call.
- Gemini's **free tier allows 5 requests per minute**, so a PDF longer than 5
  pages will pause mid-run. The server reads the `retryDelay` the API returns
  (typically ~48s) and waits that long rather than failing the page; a 10-page
  PDF therefore takes a couple of minutes on the free tier. Pages that still
  fail are skipped and reported, not silently dropped.
- The API accepts images up to 8MB and rate limits to 30 requests per minute per IP (three full-length uploads).
- Local models are much slower than the hosted one — expect tens of seconds per
  page on a laptop GPU. `OLLAMA_TIMEOUT_MS` caps how long a page may take.
- Transcriptions and formulas are rewritten from Unicode into LaTeX commands
  (`√` → `\sqrt{}`), because `inputenc` cannot compile characters like U+221A.
  `npm run test:compile` guards this with a real pdflatex run.
- Google retires Gemini model ids over time; set `GEMINI_MODEL` to switch
  without a code change. A retired id surfaces as "The model … is unavailable
  to this API key."
