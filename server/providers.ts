import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';
import type { RemediationProvider } from './provider.js';

export type ProviderName = 'ollama' | 'gemini' | 'openai';

export function isProviderName(value: string): value is ProviderName {
  return value === 'ollama' || value === 'gemini' || value === 'openai';
}

export function createProvider(name: string): RemediationProvider {
  const normalized = name.toLowerCase();
  if (!isProviderName(normalized)) {
    throw new Error(`Unknown PROVIDER "${name}". Use "ollama", "gemini", "openai" or "auto".`);
  }
  if (normalized === 'gemini') return new GeminiProvider();
  if (normalized === 'openai') return new OpenAIProvider();
  return new OllamaProvider();
}

/**
 * Picks the backend to run with.
 *
 * `PROVIDER=ollama|gemini` is honoured exactly, even when that backend is not
 * ready — an explicit choice should fail loudly rather than silently run on
 * something else.
 *
 * `auto` (the default) probes local first, then hosted. Without this, anyone
 * whose `.env` holds only `API_KEY` would be switched to Ollama by the changed
 * default and told "model not installed", which is not their problem to fix.
 */
export async function resolveProvider(
  requested: string = process.env.PROVIDER ?? 'auto',
): Promise<RemediationProvider> {
  if (requested.toLowerCase() !== 'auto') {
    return createProvider(requested);
  }

  const candidates: RemediationProvider[] = [
    new OllamaProvider(),
    new OpenAIProvider(),
    new GeminiProvider(),
  ];
  const reasons: string[] = [];

  for (const candidate of candidates) {
    const status = await candidate.check();
    if (status.ok) {
      if (reasons.length) {
        console.log(`Provider auto-selection skipped: ${reasons.join('; ')}`);
      }
      return candidate;
    }
    reasons.push(`${candidate.name} (${status.detail})`);
  }

  // Nothing is ready. Return the local one so the startup message points at the
  // setup step most users are missing, and surface why the other was rejected.
  console.warn(`No provider is ready. ${reasons.join('; ')}`);
  return candidates[0];
}
