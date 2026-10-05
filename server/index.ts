import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { enrichFormula } from '../src/shared/enrich.js';
import { fileURLToPath } from 'node:url';
import { UpstreamError, parseRegion } from './provider.js';
import { resolveProvider } from './providers.js';
import {
  ProviderConfigError,
  applyProvider,
  getActiveProvider,
  getProviderState,
  initActiveProvider,
} from './active-provider.js';
import { PROVIDER_PRESETS, customUrlAllowed } from './provider-presets.js';
import { RateLimiter } from './rate-limit.js';
import { retryBudgetMs } from './retry.js';
import { parseTrustProxy } from './trust-proxy.js';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  RATE_LIMIT_WINDOW_MS,
  type ApiErrorBody,
  type RemediateRequest,
} from '../src/shared/remediation.types.js';

const PORT = Number(process.env.PORT ?? 8787);

/**
 * Where the built frontend lives.
 *
 * Two shapes to support. Run from source, this file sits in `server/` and the
 * frontend is its sibling `dist/`. Bundled into a single executable there is no
 * source tree at all, so the assets sit next to the executable and `DIST_DIR`
 * names them. `__dirname` exists only in the CommonJS bundle, which is what
 * distinguishes the two.
 */
function resolveDistDir(): string {
  if (process.env.DIST_DIR) return path.resolve(process.env.DIST_DIR);
  if (typeof __dirname !== 'undefined') return path.resolve(__dirname, 'dist');
  return path.resolve(fileURLToPath(new URL('../dist', import.meta.url)));
}

const DIST_DIR = resolveDistDir();

// Base64 inflates by 4/3; allow headroom for the JSON envelope.
const JSON_LIMIT = `${Math.ceil((MAX_IMAGE_BYTES * 4) / 3 / 1024 / 1024) + 2}mb`;

const limiter = new RateLimiter();
setInterval(() => limiter.prune(), RATE_LIMIT_WINDOW_MS).unref();

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function decodedByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length * 3) / 4 - padding;
}

/** Set once listening; the provider endpoint retimes it after a switch. */
let activeServer: import('node:http').Server | undefined;

/**
 * `POST /api/provider` swaps the backend for every client of this server and
 * has no authentication: right for the single-user local app, wrong for a
 * shared deployment, which sets `PROVIDER_SWITCHING=off`.
 */
const PROVIDER_SWITCHING_ALLOWED = process.env.PROVIDER_SWITCHING?.trim().toLowerCase() !== 'off';

/** A request can run every retry attempt, so its timeout must cover them all. */
function requestTimeoutFor(provider: { timeoutMs: number }): number {
  return retryBudgetMs(provider.timeoutMs) + 30_000;
}

const app = express();
app.disable('x-powered-by');

const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
app.use(express.json({ limit: JSON_LIMIT }));

app.get('/api/health', async (_req, res) => {
  const active = getActiveProvider();
  const status = await active.check();
  res.json({ ok: status.ok, provider: active.name, model: active.model, detail: status.detail });
});

/** The choices the settings panel offers, plus what is running now. */
app.get('/api/providers', (_req, res) => {
  res.json({
    presets: PROVIDER_PRESETS,
    active: getProviderState(),
    customUrlAllowed: customUrlAllowed(),
    switchingAllowed: PROVIDER_SWITCHING_ALLOWED,
  });
});

/**
 * Switches backend at runtime.
 *
 * Rate limited like remediation, because each call reaches an upstream API and
 * an unauthenticated endpoint that does so is an amplifier. The key is held in
 * memory only and never echoed back.
 */
app.post('/api/provider', async (req, res) => {
  if (!PROVIDER_SWITCHING_ALLOWED) {
    return res
      .status(403)
      .json({ error: 'This server does not allow changing the model backend.', code: 'forbidden' });
  }

  const limit = limiter.check(req.ip ?? 'unknown');
  res.set('X-RateLimit-Remaining', String(limit.remaining));
  if (!limit.allowed) {
    res.set('Retry-After', String(limit.retryAfterSeconds));
    return res.status(429).json({ error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.`, code: 'rate_limited' });
  }

  const { presetId, model, apiKey, baseUrl } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof presetId !== 'string') {
    return res.status(400).json({ error: 'A provider must be named.', code: 'bad_request' });
  }

  try {
    const { state, check } = await applyProvider({
      presetId,
      model: typeof model === 'string' ? model : undefined,
      apiKey: typeof apiKey === 'string' ? apiKey : undefined,
      baseUrl: typeof baseUrl === 'string' ? baseUrl : undefined,
    });

    // A slow local model and a fast hosted one need different allowances.
    if (activeServer) activeServer.requestTimeout = requestTimeoutFor(getActiveProvider());
    console.log(`Provider switched to ${state.name} (${state.model})`);
    res.json({ active: state, detail: check.detail });
  } catch (error) {
    if (error instanceof ProviderConfigError) {
      return res.status(400).json({ error: error.message, code: 'bad_request' });
    }
    console.error('Provider switch failed:', error);
    res.status(502).json({ error: 'Could not reach that provider.', code: 'upstream_error' });
  }
});

app.post('/api/remediate', async (req, res) => {
  const fail = (status: number, body: ApiErrorBody) => res.status(status).json(body);

  const limit = limiter.check(req.ip ?? 'unknown');
  // Lets a client pace a run of region requests before it hits the limit.
  res.set('X-RateLimit-Remaining', String(limit.remaining));
  if (!limit.allowed) {
    res.set('Retry-After', String(limit.retryAfterSeconds));
    return fail(429, {
      error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.`,
      code: 'rate_limited',
    });
  }

  const { image, mimeType } = (req.body ?? {}) as Partial<RemediateRequest>;

  if (typeof image !== 'string' || !image || typeof mimeType !== 'string') {
    return fail(400, { error: 'Request must include `image` and `mimeType`.', code: 'bad_request' });
  }
  const parsedRegion = parseRegion((req.body as Record<string, unknown>).region);
  if (!parsedRegion) {
    return fail(400, { error: '`region` must be "text", "math" or absent.', code: 'bad_request' });
  }
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    return fail(400, { error: `Unsupported mime type: ${mimeType}`, code: 'unsupported_type' });
  }
  // Padded base64 always comes in groups of four; anything else is truncated
  // or malformed, and would make the decoded size below fractional.
  if (!BASE64_RE.test(image) || image.length % 4 !== 0) {
    return fail(400, { error: '`image` must be raw base64 without a data URL prefix.', code: 'bad_request' });
  }
  if (decodedByteLength(image) > MAX_IMAGE_BYTES) {
    return fail(413, {
      error: `Image exceeds the ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB limit.`,
      code: 'too_large',
    });
  }

  try {
    res.json(await getActiveProvider().remediateImage(image, mimeType, parsedRegion.region));
  } catch (error) {
    if (error instanceof UpstreamError) {
      console.error('Remediation failed:', error.message, error.cause ?? '');
      return fail(error.status, {
        error: error.message,
        code: error.status === 429 ? 'rate_limited' : 'upstream_error',
      });
    }
    console.error('Unexpected remediation error:', error);
    return fail(500, { error: 'Unexpected server error.', code: 'upstream_error' });
  }
});

// Serve the built frontend when it exists, so production is a single origin.
app.use(express.static(DIST_DIR));
app.get(/^(?!\/api\/).*/, (_req, res, next) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'), (err) => {
    if (err) next();
  });
});

/**
 * Starts the server.
 *
 * Wrapped rather than run at module top level so the file can be bundled as
 * CommonJS for the single executable: top-level `await` has no equivalent
 * there, and a bundler refuses it outright.
 */
async function main(): Promise<void> {
  if (process.argv.includes('--self-test')) return selfTest();

  const provider = await resolveProvider();
  initActiveProvider(provider);

  const server = app.listen(PORT, async () => {
    console.log(
      `API listening on http://localhost:${PORT} using ${provider.name} (${provider.model}), ` +
        `request timeout ${Math.round(server.requestTimeout / 1000)}s`,
    );
    const status = await provider.check();
    console[status.ok ? 'log' : 'warn'](`${status.ok ? 'Ready' : 'NOT READY'}: ${status.detail}`);
  });

  // The request timeout has to outlast whichever provider is actually running: a
  // local vision model can take minutes per page, while a hosted one should not be
  // governed by the local model's much longer allowance. It stays finite — 0 would
  // mean "never", which hands any client an unbounded open connection.
  server.requestTimeout = requestTimeoutFor(provider);
  activeServer = server;

  // Headers arrive quickly no matter how slow generation is, so this keeps its
  // default — it is the Slowloris defense.
}

/**
 * Checks the install without starting a server: `formula-remediator --self-test`.
 *
 * The speech engine loads rule tables from disk at runtime, so a packaged build
 * with those tables missing or misplaced starts cleanly and fails only when the
 * first formula arrives. This surfaces that at install time, in one command,
 * with no model or network needed.
 */
async function selfTest(): Promise<void> {
  const formula = await enrichFormula('\\frac{1}{2}');
  const ok = !formula.needsReview && formula.description === 'one half';

  console.log(`MathML:  ${formula.mathml ? 'ok' : 'MISSING'}`);
  console.log(`Speech:  ${formula.description || 'MISSING'}`);
  console.log(`Frontend: ${fs.existsSync(path.join(DIST_DIR, 'index.html')) ? DIST_DIR : 'MISSING at ' + DIST_DIR}`);
  console.log(ok ? 'Self-test passed.' : 'Self-test FAILED.');
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error('Server failed to start:', error);
  process.exitCode = 1;
});
