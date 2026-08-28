# ADR-0002: Count work units, attempts, and execution scopes separately

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Protocol maintainers

## Context

Scientific reports often inflate progress by treating planned methods, external studies, output files, retries, segments, or inferred activity as project-completed work. A successful retry can also erase a failed attempt when only the final state is retained.

## Decision

Execution history uses the immutable hierarchy `Campaign → WorkUnit → Attempt → Segment`.

- A `WorkUnit` is the unit of planned and completed work and has explicit completion criteria.
- An `Attempt` is one actual execution effort.
- A `Segment` is a contiguous stage, checkpoint interval, or restart interval and is never counted as an independent attempt.

Work-unit state is one of `planned`, `attempted`, `completed`, `not_performed`, or `unknown`. Execution scope is independently one of `this_project`, `reanalysis`, `external_study`, `upstream_collaborator`, or `synthetic`. Completion requires qualifying execution evidence, defined criteria, and a criterion-by-criterion assessment. Detailed methods, external papers, artifacts, or inference alone cannot establish execution or completion.

The default progress ratio counts unique completed project work-unit IDs over all in-scope project work-unit IDs. It reports reanalysis separately and excludes external work from project numerators. Attempts, failed attempts, failure events, and segments have separate metrics. Every ratio carries its unit, numerator rule, denominator rule, scope, and cutoff.

Retries append attempts or linked segments and preserve prior failures and partial outputs. Unknown and not-performed work remain visible in scope accounting but never enter performed or completed numerators.

The machine-readable contract is in `protocol/work-state-and-counting.yaml`.

## Consequences

- Progress summaries cannot silently credit plans or collaborators as project execution.
- Failed history remains auditable after recovery.
- Work completion, attempt success, and usable partial results can differ without contradiction.
- Authors must define completion criteria rather than infer completion from an output artifact.

## Rejected alternatives

- **One status on a method record:** collapses actor, execution, outcome, and completion.
- **Count files, jobs, rows, or segments:** produces unstable and scientifically misleading denominators.
- **Mutate failed attempts after retry:** destroys historical evidence and biases reliability reporting.
