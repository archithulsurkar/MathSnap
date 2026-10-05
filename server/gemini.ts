import { GoogleGenAI } from '@google/genai';
import { Pacer } from './pace.js';
import { isExhaustedForToday, withRetry } from './retry.js';
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

const DEFAULT_MODEL = 'gemini-3.7-flash';

/** How long a health probe result stays good for. */
const CHECK_CACHE_MS = 60_000;

/** Hosted generation is quick; this is a ceiling, not an expectation. */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Requests per minute. The free tier allows 5 for gemini-3.7-flash, and a
 * multi-page PDF blows straight through that, so pace by default rather than
 * collecting 429s.
 */
const DEFAULT_RPM = 5;

export class GeminiProvider implements RemediationProvider {
  readonly name = 'Gemini';
  readonly model: string;
  readonly timeoutMs: number;
  private client?: GoogleGenAI;
  private readonly checkCache = new CheckCache(CHECK_CACHE_MS);

  private readonly pacer: Pacer;

  private readonly apiKey?: string;

  constructor(
    model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL,
    requestsPerMinute = Number(process.env.GEMINI_RPM ?? DEFAULT_RPM),
    // Supplied directly when the settings panel configures a provider at
    // runtime; falls back to the environment for the usual startup path.
    apiKey = process.env.API_KEY,
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.pacer = new Pacer(requestsPerMinute);
    this.timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  }

  /**
   * Verifies the key *and* that the model is still served.
   *
   * A key-presence check is not enough: Google retires model ids, and the
   * failure then surfaces as a 404 in the middle of a user's upload rather
   * than at startup.
   */
  async check(): Promise<CheckResult> {
    if (!this.apiKey) {
      return { ok: false, detail: 'API_KEY is not set.' };
    }
    // The probe is a billable call and /api/health is unauthenticated.
    return this.checkCache.run(() => this.probe());
  }

  private async probe(): Promise<CheckResult> {
    // models.list() is not sufficient: a retired id such as gemini-2.5-flash is
    // still listed, yet generating with it returns 404 "no longer available to
    // new users". Only an actual generation call settles it, so probe with the
    // smallest possible one.
    try {
      await this.getClient().models.generateContent({
        model: this.model,
        contents: { parts: [{ text: 'ping' }] },
        config: { maxOutputTokens: 1 },
      });
      return { ok: true, detail: `${this.model} responding` };
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 403) {
        return { ok: false, detail: 'Gemini rejected the API key.' };
      }
      if (status === 404) {
        return {
          ok: false,
          detail: `Model "${this.model}" is unavailable to this key — it may have been retired. Set GEMINI_MODEL to a current id.`,
        };
      }
      // Overload or a network blip says nothing about the configuration.
      // Overload or a network blip: do not pin this for the whole TTL.
      return { ok: false, cache: false, detail: `Gemini probe failed: ${(error as Error).message.slice(0, 160)}` };

    }
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = this.apiKey;
      if (!apiKey) {
        throw new UpstreamError('API_KEY environment variable not set.', 500);
      }
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  async remediateImage(base64Image: string, mimeType: string): Promise<RemediationResult> {
    let response;
    try {
      response = await withRetry(
        async () => {
          // Hold for the rate limit rather than earning a 429 that costs a
          // whole quota window.
          const waited = await this.pacer.wait();
          if (waited > 0) console.log(`Pacing: held request ${Math.round(waited / 1000)}s for the RPM limit`);

          return this.getClient().models.generateContent({
            model: this.model,
            contents: {
              parts: [{ text: PROMPT }, { inlineData: { data: base64Image, mimeType } }],
            },
            config: {
              responseMimeType: 'application/json',
              // The SDK accepts plain JSON Schema here, so both providers share one definition.
              responseSchema: RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
              temperature: 0.1,
            },
          });
        },
        {
          onRetry: (attempt, delayMs, error) =>
            console.warn(
              `Gemini attempt ${attempt} failed (${(error as { status?: number })?.status}); retrying in ${delayMs}ms`,
            ),
        },
      );
    } catch (error) {
      if (error instanceof UpstreamError) throw error;

      const status = (error as { status?: number })?.status;
      if (status === 429) {
        // A per-day cap does not clear by waiting, so say so plainly.
        if (isExhaustedForToday(error)) {
          throw new UpstreamError(
            `The daily free-tier quota for "${this.model}" is used up. It resets at midnight Pacific — or switch PROVIDER to ollama or openai.`,
            429,
            { cause: error },
          );
        }
        throw new UpstreamError('The AI service is rate limited. Try again in a moment.', 429, { cause: error });
      }
      if (status === 401 || status === 403) {
        throw new UpstreamError('The AI service rejected the API key.', 502, { cause: error });
      }
      if (status === 404) {
        // Usually a retired model id, which is a config problem, not an outage.
        throw new UpstreamError(`The model "${this.model}" is unavailable to this API key.`, 502, { cause: error });
      }
      if (status === 503) {
        // Survived the retries, so the overload is not momentary.
        throw new UpstreamError('The AI service is overloaded. Try again in a minute.', 503, { cause: error });
      }
      throw new UpstreamError('The AI service could not be reached.', 502, { cause: error });
    }

    const text = response.text?.trim();
    if (!text) {
      const reason = response.candidates?.[0]?.finishReason;
      throw new UpstreamError(
        reason === 'SAFETY'
          ? 'The document was blocked by the AI safety filters.'
          : `The AI model returned no content${reason ? ` (${reason})` : ''}.`,
        502,
      );
    }

    return parseModelJson(text, this.name);
  }
}
