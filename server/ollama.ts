import { withRetry } from './retry.js';
import {
  PROMPT,
  RESPONSE_JSON_SCHEMA,
  UpstreamError,
  parseModelJson,
  type RemediationProvider,
} from './provider.js';
import type { RemediationResult } from '../src/shared/remediation.types.js';

const DEFAULT_HOST = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen2.5vl:7b';

/**
 * Local generation is far slower than a hosted API — a 7B vision model on a
 * laptop GPU can take a minute or more per page — so the ceiling is generous.
 */
const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * How long Ollama keeps the model resident after a request.
 *
 * The default is 5 minutes, so an idle user returning to upload another
 * document pays the full load again — measured at 44s cold versus 25s warm.
 */
const DEFAULT_KEEP_ALIVE = '30m';

/**
 * Context window. A page rendered at 2x is a large number of vision tokens, and
 * Ollama's default window silently truncates them, which degrades extraction on
 * dense pages with no error to show for it.
 */
const DEFAULT_NUM_CTX = 8192;

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
  done_reason?: string;
}

interface OllamaTagsResponse {
  models?: Array<{ name: string; details?: { family?: string }; capabilities?: string[] }>;
}

export class OllamaProvider implements RemediationProvider {
  readonly name = 'Ollama';
  readonly model: string;
  private readonly host: string;
  readonly timeoutMs: number;

  constructor(
    model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL,
    host = process.env.OLLAMA_HOST ?? DEFAULT_HOST,
    timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  ) {
    this.model = model;
    this.host = host.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  async check(): Promise<{ ok: boolean; detail: string }> {
    let tags: OllamaTagsResponse;
    try {
      const response = await fetch(`${this.host}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        return { ok: false, detail: `Ollama responded ${response.status}` };
      }
      tags = (await response.json()) as OllamaTagsResponse;
    } catch (error) {
      return { ok: false, detail: `Ollama unreachable at ${this.host}: ${(error as Error).message}` };
    }

    const installed = tags.models?.map((m) => m.name) ?? [];
    if (!installed.includes(this.model)) {
      return {
        ok: false,
        detail: `Model "${this.model}" not installed. Run: ollama pull ${this.model}. Installed: ${installed.join(', ') || 'none'}`,
      };
    }
    return { ok: true, detail: `${this.model} ready at ${this.host}` };
  }

  /** `mimeType` is unused: Ollama sniffs the image format from the bytes itself. */
  async remediateImage(base64Image: string, mimeType: string): Promise<RemediationResult> {
    void mimeType;

    const body = {
      model: this.model,
      stream: false,
      format: RESPONSE_JSON_SCHEMA,
      keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? DEFAULT_KEEP_ALIVE,
      options: {
        temperature: 0.1,
        num_ctx: Number(process.env.OLLAMA_NUM_CTX ?? DEFAULT_NUM_CTX),
      },
      messages: [{ role: 'user', content: PROMPT, images: [base64Image] }],
    };

    const response = await withRetry(
      async () => {
        let res: Response;
        try {
          res = await fetch(`${this.host}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeoutMs),
          });
        } catch (error) {
          const reason = (error as Error).name === 'TimeoutError'
            ? `Ollama did not respond within ${Math.round(this.timeoutMs / 1000)}s.`
            : `Could not reach Ollama at ${this.host}.`;
          throw new UpstreamError(reason, 502, { cause: error });
        }

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          // Tag the status so withRetry can decide whether this is transient.
          throw Object.assign(new Error(`Ollama ${res.status}: ${detail.slice(0, 200)}`), {
            status: res.status,
          });
        }
        return res;
      },
      {
        onRetry: (attempt, delayMs) =>
          console.warn(`Ollama attempt ${attempt} failed; retrying in ${delayMs}ms`),
      },
    );

    const payload = (await response.json()) as OllamaChatResponse;
    if (payload.error) {
      throw new UpstreamError(`Ollama error: ${payload.error}`, 502);
    }

    return parseModelJson(payload.message?.content, this.name);
  }
}
