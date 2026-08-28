# ADR-0001: Bound completeness to a declared source universe

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Protocol maintainers

## Context

A report cannot prove that it is complete merely because every source presented to the authoring pipeline was processed. Sources may never have been registered, may be inaccessible, or may sit outside a search procedure. The protocol therefore needs to distinguish inventory accounting from scientific incorporation and from overall completeness.

## Decision

Every report declares one or more versioned `SourceUniverse` records with scope, inclusion and exclusion boundaries, cutoff semantics, authority basis, and immutable snapshot bindings. Every registered source item receives exactly one current disposition: `included`, `excluded_with_reason`, `unreadable`, `inaccessible`, `duplicate`, or `unmapped`; disposition history is append-only.

Completeness is represented on separate axes:

1. whether enumeration is authoritatively exhaustive;
2. whether all registered items are dispositioned;
3. whether sources are accessible and readable;
4. whether scientifically relevant content is incorporated.

`proven_within_declared_universe` is permitted only when the universe is authoritatively exhaustive for the declared boundary and cutoff, accounting is complete, and incorporation has no material unmapped or inaccessible gap. A non-authoritative inventory can establish only that registered sources were accounted for. It must state that overall completeness cannot be proven.

Late-arriving sources create a new snapshot or an explicit out-of-scope event. They are never inserted invisibly into a frozen universe.

The machine-readable contract is in `protocol/source-coverage.yaml`.

## Consequences

- Completeness claims become narrow, auditable, and tied to a cutoff.
- Inaccessible and unreadable sources remain visible instead of disappearing behind a processed count.
- Reports may be valid releases while acknowledging partial or unprovable completeness, but absolute wording is blocked.
- Authors must obtain or construct an authoritative registry when stronger completeness claims are required.

## Rejected alternatives

- **Treat the authoring input list as complete:** cannot detect missing upstream sources.
- **Use one percentage:** conflates enumeration, accessibility, disposition, and incorporation.
- **Count excluded or duplicate items as absent:** loses accountability and can hide selective omission.
