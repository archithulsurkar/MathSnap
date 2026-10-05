/**
 * The backend currently in use, and the rules for changing it.
 *
 * Configuration used to be startup-only, which meant editing `.env` and
 * restarting — fine for the person who wrote it, a wall for everyone else. The
 * settings panel changes it at runtime instead.
 *
 * Two rules make that safe to expose. A candidate is probed before it is
 * adopted, so a mistyped key leaves the working backend in place rather than
 * breaking the app until someone restarts it. And the key is held in memory
 * only: never written to disk, never logged, never returned to the browser.
 */
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';
import type { CheckResult, RemediationProvider } from './provider.js';
import {
  customUrlAllowed,
  findPreset,
  isAcceptableCustomUrl,
  isPlausibleModelId,
} from './provider-presets.js';

export interface ProviderRequest {
  presetId: string;
  model?: string;
  apiKey?: string;
  /** Only honoured when ALLOW_CUSTOM_PROVIDER_URL=true. */
  baseUrl?: string;
}

export interface ProviderState {
  presetId: string;
  name: string;
  model: string;
  /** Whether a key is held — never the key itself. */
  hasKey: boolean;
}

export class ProviderConfigError extends Error {}

let active: RemediationProvider;
let activePresetId = 'env';

export function initActiveProvider(provider: RemediationProvider, presetId = 'env'): void {
  active = provider;
  activePresetId = presetId;
}

export function getActiveProvider(): RemediationProvider {
  return active;
}

export function getProviderState(): ProviderState {
  return {
    presetId: activePresetId,
    name: active.name,
    model: active.model,
    hasKey: activeHasKey,
  };
}

let activeHasKey = Boolean(process.env.API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.GPT_KEY);

function build(request: ProviderRequest): RemediationProvider {
  const preset = findPreset(request.presetId);
  if (!preset) throw new ProviderConfigError(`Unknown provider "${request.presetId}".`);

  const model = request.model?.trim() || preset.defaultModel;
  if (!isPlausibleModelId(model)) throw new ProviderConfigError(`"${model}" is not a valid model id.`);

  const apiKey = request.apiKey?.trim();
  if (preset.needsKey && !apiKey) throw new ProviderConfigError(`${preset.label} needs an API key.`);

  let baseUrl = preset.baseUrl;
  if (request.baseUrl?.trim()) {
    if (!customUrlAllowed()) {
      throw new ProviderConfigError(
        'Custom endpoints are disabled. Set ALLOW_CUSTOM_PROVIDER_URL=true on the server to enable them.',
      );
    }
    if (!isAcceptableCustomUrl(request.baseUrl)) {
      throw new ProviderConfigError('A custom endpoint must be an https URL with no embedded credentials.');
    }
    baseUrl = request.baseUrl.trim();
  }

  switch (preset.kind) {
    case 'ollama':
      return new OllamaProvider(model, baseUrl ?? process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434');
    case 'gemini':
      return new GeminiProvider(model, Number(process.env.GEMINI_RPM ?? 5), apiKey);
    case 'openai':
      return new OpenAIProvider(model, baseUrl ?? '', apiKey, Number(process.env.OPENAI_RPM ?? 10));
  }
}

/**
 * Probes a candidate and adopts it only if it answers.
 *
 * The probe is the whole point: without it a typo in a key would be discovered
 * by the next person who uploaded a document, and the previous working backend
 * would already be gone.
 */
export async function applyProvider(request: ProviderRequest): Promise<{ state: ProviderState; check: CheckResult }> {
  const candidate = build(request);
  const check = await candidate.check();

  if (!check.ok) {
    throw new ProviderConfigError(check.detail);
  }

  active = candidate;
  activePresetId = request.presetId;
  activeHasKey = Boolean(request.apiKey?.trim());

  return { state: getProviderState(), check };
}
