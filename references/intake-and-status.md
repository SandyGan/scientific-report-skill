# Intake and status decisions

## Minimum useful intake

Ask for the smallest missing subset of:

- report question, scope, audience, cutoff, and disclosure level;
- supplied source files or direct source excerpts;
- known source inventory and access gaps;
- actual work/run records, including failures and retries;
- result artifacts and the claims the user wants assessed;
- domain context needed to judge controls, independence, convergence, or evaluation design.

## Status choice

- `cannot_complete`: no bounded source material, identity, or scope supports a report. Return missing requirements and create no scientific claims.
- working copy: enough material exists to organize evidence, but important sources, review, disclosure, validation, or reproduction checks remain incomplete.
- release candidate: the public payload and required checks are complete, but this label still does not mean scientific truth or institutional approval.

Prompt-generation status (`ok`, `needs_review`, `cannot_complete`), scientific review outcomes, and bundle verification are separate. Never translate one automatically into another.

## User statements

A statement made in conversation may be recorded as an attributed human declaration. It is not equivalent to an instrument record, immutable file, independently verified event, or source-derived known value. Preserve the speaker/context available in the conversation and label verification and locator details as unavailable when they are unavailable.
