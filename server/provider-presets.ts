/**
 * Backends offerable from the settings panel.
 *
 * This list is also a security boundary. The panel lets a browser hand the
 * server a base URL to call, which is server-side request forgery if the value
 * is unconstrained: on a deployed instance anyone could aim it at an internal
 * address and read the response back through the error message. Presets are an
 * allowlist by construction, so the ordinary path cannot reach anything the
 * operator has not sanctioned.
 *
 * A free-form URL is still useful for self-hosted endpoints, so it stays
 * available behind `ALLOW_CUSTOM_PROVIDER_URL=true` — off by default, and a
 * deliberate act by whoever runs the server rather than whoever loads the page.
 */
export interface ProviderPreset {
  id: string;
  label: string;
  /** Which implementation serves it. */
  kind: 'ollama' | 'openai' | 'gemini';
  baseUrl?: string;
  defaultModel: string;
  needsKey: boolean;
  /** Where to get a key, shown in the panel. */
  keyUrl?: string;
  note: string;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'ollama',
    defaultModel: 'qwen2.5vl:7b',
    needsKey: false,
    note: 'Runs on this machine. Nothing leaves it. Needs Ollama installed and a vision model pulled.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'qwen/qwen2.5-vl-72b-instruct',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    note: 'One key, many models. Some are free. Easiest hosted option.',
  },
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    note: 'Fast, with a free tier and no card required.',
  },
  {
    id: 'together',
    label: 'Together AI',
    kind: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'Qwen/Qwen2.5-VL-72B-Instruct',
    needsKey: true,
    keyUrl: 'https://api.together.ai/settings/api-keys',
    note: 'Starter credits; hosts the open vision models.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'pixtral-12b-2409',
    needsKey: true,
    keyUrl: 'https://console.mistral.ai/api-keys',
    note: 'Pixtral is their vision model.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Pay per call.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    defaultModel: 'gemini-3.7-flash',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Free tier available; model ids change, so check the current one.',
  },
];

export function findPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id);
}

/** Whether the operator has opted into free-form base URLs. */
export function customUrlAllowed(): boolean {
  return process.env.ALLOW_CUSTOM_PROVIDER_URL === 'true';
}

/**
 * Model ids are passed to the upstream API and echoed into error messages, so
 * keep them to the shape real ids take rather than accepting arbitrary text.
 */
export function isPlausibleModelId(model: string): boolean {
  return /^[\w.\-/:]{1,120}$/.test(model);
}

/**
 * Validates a free-form base URL when one is permitted.
 *
 * https only, and no credentials embedded in the URL — those would be logged
 * and echoed. Loopback is allowed because self-hosted endpoints live there.
 */
export function isAcceptableCustomUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !loopback) return false;
    if (url.username || url.password) return false;
    return true;
  } catch {
    return false;
  }
}
