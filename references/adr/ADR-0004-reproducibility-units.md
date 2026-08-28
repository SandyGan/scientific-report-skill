# ADR-0004: Assess reproducibility per bounded unit and independent axis

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Protocol maintainers

## Context

A single reproducibility score hides whether a computation has complete inputs, whether a recipe matches what historically ran, whether data are accessible, whether random state is captured, whether anyone actually reran the work, and whether a claimed reproduction is independent. Experimental replication and computational replay are also not interchangeable.

## Decision

Each critical workflow boundary is represented as a `ReproducibilityUnit`. A unit is split when access conditions, environment, random-state needs, comparison criteria, or responsible actors materially differ.

Each unit is assessed independently on provenance closure, recipe fidelity, data and artifact access, environment capture, random-state capture, replay verification, independent computational reproduction, independent experimental replication, and claim/output coverage. Axis states are `satisfied`, `partial`, `unsatisfied`, `unknown`, `not_applicable`, or `withheld`.

Historical invocation and maintained recipe are separate records and are compared explicitly. A replay claim requires an actual recorded rerun and a comparator fixed before output inspection, or a valid adaptive comparator. Failed and inconclusive reruns remain in history.

Conservative levels summarize, but never replace, the axes:

- `R0_documented`: boundary and known provenance are recorded, but replay readiness is not established;
- `R1_replay_ready`: complete faithful recipe, access, environment, and applicable random state are available; no rerun is implied;
- `R2_verified_replay`: an actual rerun met its declared comparator;
- `R3_independent_reproduction`: a declared independent computational reproduction or experimental replication met its criterion.

The highest level is assigned only when every prerequisite is satisfied. Unknown, partial, unsatisfied, or verification-preventing withheld prerequisites cap the level. Report summaries show the conservative lower bound across critical units, level distribution, explicit access conditions, and claim/output coverage denominators. They never average levels into one score.

The machine-readable contract is in `protocol/reproducibility-policy.yaml`.

## Consequences

- A bundled recipe no longer implies successful replay.
- Restricted data and unknown random state visibly constrain claims.
- Computational reproduction and experimental replication remain distinct.
- Large workflows can identify the exact units preventing a stronger reproducibility statement.

## Rejected alternatives

- **One percentage or maturity badge:** conceals blocker dimensions and denominator choices.
- **Project-wide grade without units:** cannot localize gaps or claim coverage.
- **Equate code availability with reproduction:** confuses potential replay with observed verification.
