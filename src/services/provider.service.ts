import { Injectable } from '@angular/core';

/**
 * Talks to the backend's provider settings.
 *
 * The key travels to the server and stays there, in memory. It is never stored
 * in the browser and never comes back in a response, so a shared machine does
 * not leak it through local storage and a screenshot of the panel does not
 * leak it either.
 */
export interface ProviderPreset {
  id: string;
  label: string;
  kind: 'ollama' | 'openai' | 'gemini';
  baseUrl?: string;
  defaultModel: string;
  needsKey: boolean;
  keyUrl?: string;
  note: string;
}

export interface ActiveProvider {
  presetId: string;
  name: string;
  model: string;
  hasKey: boolean;
}

export interface ProviderOptions {
  presets: ProviderPreset[];
  active: ActiveProvider;
  customUrlAllowed: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProviderService {
  async load(): Promise<ProviderOptions | null> {
    try {
      const response = await fetch('/api/providers');
      if (!response.ok) return null;
      return (await response.json()) as ProviderOptions;
    } catch {
      // No backend at all — the static demo. The paste path still works.
      return null;
    }
  }

  /** Returns the newly active provider, or throws with the server's reason. */
  async apply(request: {
    presetId: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  }): Promise<ActiveProvider> {
    const response = await fetch('/api/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    const body = (await response.json().catch(() => ({}))) as { active?: ActiveProvider; error?: string };
    if (!response.ok || !body.active) {
      throw new Error(body.error ?? `Could not switch provider (HTTP ${response.status}).`);
    }
    return body.active;
  }
}
