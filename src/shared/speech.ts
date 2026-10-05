/**
 * Deterministic spoken renderings of a formula.
 *
 * The screen-reader description is the thing a blind reader actually receives,
 * so it is the last part of this pipeline that should be left to a language
 * model: prose invented per request is unverifiable, inconsistent between runs,
 * and conforms to no standard. Turning MathML into spoken maths is instead a
 * solved, rule-based problem with published rule sets — ClearSpeak and
 * MathSpeak.
 *
 * So the model transcribes and nothing else; everything a reader consumes is
 * generated here, from the MathML, by rules that can be unit tested.
 */
import * as sreModule from 'speech-rule-engine';

/**
 * CommonJS interop. Node hands the module back as `default`; the browser
 * bundler exposes the named exports directly and leaves `default` undefined.
 * Reading one or the other is the difference between this running in both
 * places and running in neither.
 */
const sre = ((sreModule as unknown as { default?: SreApi }).default ?? sreModule) as SreApi;

type SreApi = {
  setupEngine: (config: sreModule.SreConfig) => Promise<void>;
  engineReady: () => Promise<void>;
  toSpeech: (mathml: string) => string;
};

export interface AccessibleRenderings {
  /** ClearSpeak: reads the way a person would say it aloud. The default. */
  clearspeak: string;
  /** MathSpeak: explicit structure markers, preferred by some readers. */
  mathspeak: string;
}

/**
 * SRE's engine is a process-wide singleton reconfigured by `setupEngine`, so
 * two concurrent callers wanting different rule sets would race and read each
 * other's configuration. Every access is therefore funnelled through one chain.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  // Keep the chain alive regardless of this task's outcome.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function render(mathml: string, config: Parameters<typeof sre.setupEngine>[0]): Promise<string> {
  await sre.setupEngine(config);
  await sre.engineReady();
  return sre.toSpeech(mathml).trim();
}

/**
 * Renders one MathML string in both rule sets.
 *
 * Callers pass MathML derived from the model's LaTeX rather than MathML the
 * model wrote, so the speech and the rendered formula cannot disagree.
 */
export async function renderAccessible(mathml: string): Promise<AccessibleRenderings> {
  return serialize(async () => ({
    clearspeak: await render(mathml, {
      locale: 'en',
      domain: 'clearspeak',
      style: 'default',
      modality: 'speech',
    }),
    mathspeak: await render(mathml, {
      locale: 'en',
      domain: 'mathspeak',
      style: 'default',
      modality: 'speech',
    }),
  }));
}
