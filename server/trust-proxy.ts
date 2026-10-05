/**
 * Reads `TRUST_PROXY` into a value for Express's `trust proxy` setting.
 *
 * Behind a reverse proxy (Render, Fly, nginx, Cloudflare) every request comes
 * from the proxy's address, so `req.ip` — and with it the rate limiter's key —
 * is the same for every caller, and one heavy user throttles everyone. Setting
 * this makes Express take the client address from `X-Forwarded-For` instead.
 *
 * Set it to the number of proxy hops in front of the app (usually 1), `true`
 * to trust every hop (only when the proxy is the sole way in), or a
 * comma-separated list of proxy addresses or subnets. Unset leaves Express's
 * default: trust nothing, which is right for the local app.
 *
 * Returns undefined when unset or blank.
 */
export function parseTrustProxy(value: string | undefined): number | boolean | string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}
