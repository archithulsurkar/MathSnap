import { Pacer } from './pace.js';
import { withRetry } from './retry.js';
import {
  CheckCache,
  PROMPT,
  RESPONSE_JSON_SCHEMA,
  UpstreamError,
  parseModelJson,
  type CheckResult,
  type RemediationProvider,
} from './provider.js';
import type { RemediationResult } from '../src/shared/remediation.types.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 180_000;

/** Conservative default; raise it to whatever the account's tier allows. */
const DEFAULT_RPM = 10;

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  error?: { message?: string; code?: string };
}

/**
 * Any OpenAI-compatible chat-completions endpoint.
 *
 * Written against the wire format rather than one vendor, so it also serves
 * Azure OpenAI, OpenRouter, Groq, vLLM and llama.cpp — point OPENAI_BASE_URL at
 * them. The model must accept image input.
 */
export class OpenAIProvider implements RemediationProvider {
  readonly name = 'OpenAI';
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  readonly timeoutMs: number;
  private readonly pacer: Pacer;
  private readonly checkCache = new CheckCache();
  /** Cleared for the session once a model refuses a custom temperature. */
  private supportsTemperature = true;

  constructor(
    model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
    baseUrl = process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL,
    // GPT_KEY is accepted as an alias so an existing key does not need renaming.
    apiKey = process.env.OPENAI_API_KEY ?? process.env.GPT_KEY,
    requestsPerMinute = Number(process.env.OPENAI_RPM ?? DEFAULT_RPM),
  ) {
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    this.pacer = new Pacer(requestsPerMinute);
  }

  async check(): Promise<CheckResult> {
    if (!this.apiKey) {
      return { ok: false, detail: 'Neither OPENAI_API_KEY nor GPT_KEY is set.' };
    }
    // /api/health is unauthenticated; without this each hit lists models upstream.
    return this.checkCache.run(() => this.probe());
  }

  private async probe(): Promise<CheckResult> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (response.status === 401) return { ok: false, detail: 'The API key was rejected.' };
      if (!response.ok) {
        return { ok: false, cache: false, detail: `${this.baseUrl} responded ${response.status}` };
      }

      const body = (await response.json()) as { data?: Array<{ id: string }> };
      const ids = body.data?.map((entry) => entry.id) ?? [];
      if (ids.length && !ids.includes(this.model)) {
        return {
          ok: false,
          detail: `Model "${this.model}" is not offered by ${this.baseUrl}. Set OPENAI_MODEL to one of: ${ids.slice(0, 8).join(', ')}`,
        };
      }
      return { ok: true, detail: `${this.model} available at ${this.baseUrl}` };
    } catch (error) {
      // Unreachable now says nothing lasting about the configuration.
      return { ok: false, cache: false, detail: `Could not reach ${this.baseUrl}: ${(error as Error).message}` };
    }
  }

  async remediateImage(base64Image: string, mimeType: string): Promise<RemediationResult> {
    if (!this.apiKey) {
      throw new UpstreamError('Neither OPENAI_API_KEY nor GPT_KEY is set.', 500);
    }

    const body: Record<string, unknown> = {
      model: this.model,
      // Low temperature helps transcription determinism, but the gpt-5 family
      // rejects anything but the default. Dropped automatically on refusal.
      ...(this.supportsTemperature ? { temperature: 0.1 } : {}),
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'remediation', strict: false, schema: RESPONSE_JSON_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            // A data URL is the portable way to inline an image on this API.
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
          ],
        },
      ],
    };

    const payload = await withRetry(
      async () => {
        // Hold for the rate limit instead of earning a 429 and burning a window.
        const waited = await this.pacer.wait();
        if (waited > 0) console.log(`Pacing: held request ${Math.round(waited / 1000)}s for the RPM limit`);

        let response: Response;
        try {
          response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeoutMs),
          });
        } catch (error) {
          const reason =
            (error as Error).name === 'TimeoutError'
              ? `The model did not respond within ${Math.round(this.timeoutMs / 1000)}s.`
              : `Could not reach ${this.baseUrl}.`;
          throw new UpstreamError(reason, 502, { cause: error });
        }

        if (!response.ok) {
          const detail = await response.text().catch(() => '');

          // Some models accept only the default temperature. Drop it and retry
          // rather than forcing every caller to know which ones.
          if (response.status === 400 && /temperature/i.test(detail) && this.supportsTemperature) {
            this.supportsTemperature = false;
            delete body.temperature;
            console.warn(`${this.model} rejects a custom temperature; retrying with the default.`);
            throw Object.assign(new Error('retry without temperature'), { status: 503 });
          }

          // Tag the status so withRetry can classify it, and keep any Retry-After.
          const retryAfter = response.headers.get('retry-after');
          throw Object.assign(
            new Error(
              `${this.name} ${response.status}: ${detail.slice(0, 300)}` +
                (retryAfter ? ` Please retry in ${retryAfter}s.` : ''),
            ),
            { status: response.status },
          );
        }

        return (await response.json()) as ChatCompletion;
      },
      {
        onRetry: (attempt, delayMs) =>
          console.warn(`${this.name} attempt ${attempt} failed; retrying in ${delayMs}ms`),
      },
    );

    if (payload.error) {
      throw new UpstreamError(`${this.name} error: ${payload.error.message ?? 'unknown'}`, 502);
    }

    const choice = payload.choices?.[0];
    if (choice?.finish_reason === 'length') {
      throw new UpstreamError('The reply was cut off before the JSON was complete.', 502);
    }

    return parseModelJson(choice?.message?.content, this.name);
  }
}
