/**
 * Minimal ambient types for speech-rule-engine, which ships no declarations.
 *
 * Only the surface this project uses is declared.
 */
declare module 'speech-rule-engine' {
  export interface SreConfig {
    locale?: string;
    /** Rule set: `clearspeak` or `mathspeak`. */
    domain?: string;
    /** Verbosity within the rule set, e.g. `default`, `brief`, `sbrief`. */
    style?: string;
    modality?: 'speech' | 'braille' | 'prefix' | 'summary';
    markup?: string;
  }

  export function setupEngine(config: SreConfig): Promise<void>;
  export function engineReady(): Promise<void>;
  export function toSpeech(mathml: string): string;
  export function toEnriched(mathml: string): string;
  export function version(): string;

  const sre: {
    setupEngine: typeof setupEngine;
    engineReady: typeof engineReady;
    toSpeech: typeof toSpeech;
    toEnriched: typeof toEnriched;
    version: typeof version;
  };
  export default sre;
}
