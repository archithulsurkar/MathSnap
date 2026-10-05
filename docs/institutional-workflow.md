# Institutional remediation workflow

This project is built against one real workflow: a campus disability resources
office remediating course materials under a legal obligation, on a deadline, at
volume. This document records what that implies for the software, which
questions are still open, and what each answer changes in the code.

Nothing here is speculative design. Where an answer is unknown, it is marked
**OPEN** and carries the question to ask rather than an assumed requirement.

## Why this document exists

A general-purpose "upload a page, get LaTeX" tool has no user, and therefore no
constraints, and therefore no design. An office has deadlines, a review step, an
audit obligation and a rule about where student data may go. Those constraints
are the design.

## Known constraints

These follow from how remediation offices operate and from the statutes they
work under. Confirm each one in the interview rather than treating it as settled.

### Volume and batching

A course pack is not ten pages. Semester-start remediation runs to hundreds of
pages per document and dozens of documents per week, with the load concentrated
in the two weeks before term.

Current state: `MAX_PDF_PAGES` caps an upload at 10 pages and the client
processes pages strictly in sequence, holding everything in browser memory.
That is a demo shape, not a batch shape.

Implications:

- Work has to survive a closed tab: server-side job queue, not an in-page loop.
- Per-page results must persist as they land, so a failure at page 180 does not
  discard the first 179.
- Progress has to be resumable and inspectable by someone who did not start the
  job.

### Human review and sign-off

No office ships model output unread. A remediated document is a legal artifact:
someone with a name attests that it is correct.

Implications:

- Per-formula review states: untouched, edited, approved, rejected.
- The reviewer's identity and the time of sign-off are recorded per formula, not
  per document.
- Nothing is exportable as "remediated" until every formula has been through the
  queue. A partially reviewed document must be visibly partial.
- Review order should follow confidence, so the least trustworthy output is seen
  first rather than last.

### Audit trail

Section 508 and ADA compliance is a documentation problem as much as a technical
one. The office needs to demonstrate, potentially years later, that a given
document was remediated, by whom, when, and with what tooling.

Implications:

- Append-only record per document: source hash, model and model version, prompt
  version, pipeline version, every edit, every sign-off, timestamps.
- The record must be exportable as a standalone artifact that outlives this
  application.
- Model and pipeline versions belong in the record because "which version
  produced this" is the first question asked when an error is found later.

### Data residency

Student coursework is an education record under FERPA. Whether it may be sent
to a third-party API is not the engineer's call, and for many offices the answer
is no.

Implications:

- The fully-local Ollama path is not an implementation detail, it is the
  compliance story, and it should be a documented, first-class deployment mode
  with its own setup guide.
- The deployment must be able to *refuse* to start a hosted provider: a
  `PROVIDER=ollama`-only lock that fails loudly rather than silently falling
  back to a hosted backend. `resolveProvider`'s `auto` mode currently falls
  through to hosted, which is exactly wrong under this constraint.
- A data-handling statement belongs in the README: what is sent where, in which
  mode, and what is retained.

### Output formats

LaTeX is not an accessible format and is not what an office delivers. Confirm
what they actually hand to students.

Likely set: HTML with MathML, EPUB3, and Word with OMML. See
`docs/adr/0001-deterministic-speech.md` for why speech is generated
deterministically rather than by the model.

## Open questions for the interview

Ask these in order; each one changes the build.

1. What formats do you hand to students today, and in what proportion? (Decides
   which exporters get built and in what order.)
2. What does a document's journey look like from intake to delivery — who
   touches it, in what order, with what tool? (Decides where this fits, and
   whether it replaces a step or adds one.)
3. May student coursework be sent to a commercial API, and who decides? (Decides
   whether hosted providers exist in the shipped configuration at all.)
4. What is the turnaround expectation at semester start, and what is the current
   bottleneck? (Decides whether throughput or accuracy is the thing to optimise.)
5. What do you have to be able to prove, to whom, and how long afterwards?
   (Decides the shape and retention of the audit record.)
6. Who does the review — staff, student workers, faculty? What is their comfort
   with LaTeX? (Decides whether the correction UI can expose LaTeX at all, or
   must be visual.)
7. What happens today when the source is a bad scan or handwritten? (Decides
   whether handwriting support is a requirement or a nice-to-have.)
8. Which screen readers do your students actually use, and on which browsers?
   (Decides how far MathML can be relied on versus the spoken-text fallback.)
9. What tools have you tried and abandoned, and why? (The most valuable question
   in the list.)

## What this replaces

The prior roadmap treated this project as a general-purpose tool with an
open-ended feature list. Building against one office's workflow replaces that
with an ordered set of requirements that can be finished, demonstrated, and
verified by the person who needs them.
