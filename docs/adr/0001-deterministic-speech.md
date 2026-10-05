# 1. Generate speech by rule, not by model

Date: 2026-09-24

## Status

Accepted.

## Context

The model was asked for three things per formula: a screen-reader description,
LaTeX, and MathML. The description is the product — it is what a blind reader
actually receives — and it was the least trustworthy part of the system:

- It could not be verified. There is no way to test that invented prose
  correctly describes a formula, so nothing in the suite tried.
- It was inconsistent. The same formula described twice produced different
  wording, so a document remediated in two sittings read inconsistently.
- It conformed to no standard. Screen-reader users have learned conventions for
  how mathematics is spoken; freely invented prose matches none of them.
- LaTeX and MathML were produced independently and could disagree, with nothing
  in the pipeline able to notice.

Meanwhile, speaking mathematics is a solved problem with published rule sets.
ClearSpeak and MathSpeak both specify how an expression should be read aloud,
and the Speech Rule Engine — the library MathJax itself uses — implements them
and is maintained alongside them.

## Decision

The model transcribes and nothing else. It returns the page text and the LaTeX
of each formula.

Everything a reader consumes is derived from that LaTeX:

- LaTeX → MathML via temml (`src/shared/latex-to-mathml.ts`)
- MathML → ClearSpeak speech and MathSpeak speech via the Speech
  Rule Engine (`src/shared/speech.ts`)

A formula whose LaTeX will not parse produces no derived output and is flagged
`needsReview` instead. Narrating a conversion error to a blind reader is worse
than telling a sighted reviewer that one formula needs attention.

## Consequences

Good:

- The accessible output is deterministic and unit-testable. "Renders one half as
  'one half'" is now an assertion, not a hope.
- The three representations of a formula cannot contradict each other, because
  two of them are computed from the third.
- Output conforms to rule sets screen-reader users already know.
- The model's output shrinks to a transcription, cutting tokens per formula.
- The model becomes a replaceable component behind `RemediationProvider` rather
  than the thing the product depends on.

Costs:

- The Speech Rule Engine's engine is a process-wide singleton reconfigured per
  call, so access is serialized through one promise chain. A parallel rendering
  path would need a worker per configuration.
- Formula quality is now bounded by LaTeX-conversion coverage: anything temml
  cannot parse is flagged rather than described. This is the correct failure,
  but it makes conversion coverage a thing to measure.
- `speech-rule-engine` is currently at `5.0.0-rc.4`, which npm serves as
  `latest`. Pin it and watch for the stable release.
