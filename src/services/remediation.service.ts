import { Injectable } from '@angular/core';
import type { ApiErrorBody, RemediateRequest, RemediationResult } from '../shared/remediation.types.js';

export type { Formula, RemediationResult } from '../shared/remediation.types.js';

/**
 * Calls the backend proxy. The Gemini key lives on the server only — nothing
 * here should ever hold or forward it.
 */
@Injectable({ providedIn: 'root' })
export class RemediationService {
  async remediateImage(base64Image: string, mimeType: string): Promise<RemediationResult> {
    const body: RemediateRequest = { image: base64Image, mimeType };

    let response: Response;
    try {
      response = await fetch('/api/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error('Could not reach the remediation server. Is it running?', { cause: error });
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
}
