import { Injectable } from '@angular/core';
import { retryAfterMs } from '../retry-after.js';
import type { ApiErrorBody, RegionKind, RemediateRequest, RemediationResult } from '../shared/remediation.types.js';

export type { Formula, RemediationResult } from '../shared/remediation.types.js';

export interface RemediateOptions {
  /** Called before waiting out a rate limit, with the wait in whole seconds. */
  onRateLimitWait?: (seconds: number) => void;
}

/**
 * Calls the backend proxy. The Gemini key lives on the server only — nothing
 * here should ever hold or forward it.
 */
@Injectable({ providedIn: 'root' })
export class RemediationService {
  /**
   * Reads one page, or one region of a page when `region` is given.
   *
   * A 429 is waited out and retried once. Region mode sends one request per
   * box, so a fast local model can reach the server's per-minute limit on a
   * single annotated upload; the server says how long to wait, and waiting
   * beats failing the region.
   */
  async remediateImage(
    base64Image: string,
    mimeType: string,
    region?: RegionKind,
    options: RemediateOptions = {},
  ): Promise<RemediationResult> {
    const body: RemediateRequest = { image: base64Image, mimeType, ...(region ? { region } : {}) };

    let response = await this.post(body);
    if (response.status === 429) {
      const wait = retryAfterMs(response.headers.get('Retry-After'));
      if (wait !== null) {
        options.onRateLimitWait?.(Math.ceil(wait / 1000));
        await new Promise((resolve) => setTimeout(resolve, wait));
        response = await this.post(body);
      }
    }

    if (!response.ok) {
      const detail = await response
        .json()
        .then((parsed: ApiErrorBody) => parsed?.error)
        .catch(() => undefined);

      if (detail) throw new Error(detail);

      // No JSON body means nothing is serving the API — typically the static
      // demo, where there is no backend at all. Say what can be done instead
      // rather than reporting a bare status code.
      if (response.status === 404 || response.status === 405) {
        throw new Error(
          'This build has no model backend, so page images cannot be read. ' +
            'Paste LaTeX instead — that runs in your browser — or run the app locally with a provider configured.',
        );
      }

      throw new Error(`Remediation failed (HTTP ${response.status}).`);
    }

    return (await response.json()) as RemediationResult;
  }

  private async post(body: RemediateRequest): Promise<Response> {
    try {
      return await fetch('/api/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error('Could not reach the remediation server. Is it running?', { cause: error });
    }
  }
}
