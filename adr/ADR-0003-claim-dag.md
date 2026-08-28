# ADR-0003: Represent scientific arguments as an acyclic claim graph

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Protocol maintainers

## Context

A flat list of citations does not show whether a conclusion is directly observed, derived through intermediate claims, dependent on the same upstream data, contradicted by another result, or transferred across incompatible domains. It also cannot propagate a correction reliably.

## Decision

The canonical scientific payload represents five versioned node types: `Claim`, `EvidenceItem`, `ArgumentStep`, `CrossDomainBridge`, and `ConflictSet`.

Support, contradiction, and qualification edges connect evidence to claims. Explicit argument steps connect evidence or upstream claims to conclusions. `ClaimDependency` edges point from prerequisite claims to dependent claims. The directed claim-and-argument subgraph must be acyclic. Evidence provenance may contain cross-references, but those references cannot create a circular support path.

Evidence independence is recorded through dependency groups and shared ancestors. Distinct files, models, seeds, runs, frames, or citations are not presumed independent.

A `CrossDomainBridge` is required whenever reasoning transfers identity, state, effect, or mechanism across domains or representations. The bridge records exact entity versions, construct or sequence correspondence, conditions, dose, temporal and spatial scales, mapping evidence, assumptions, and limitations. A missing, invalid, or unknown required bridge blocks a cross-domain mechanistic claim. A qualified bridge can support only qualified wording.

True conflicts under matched entity, estimand, population or system, condition, time, units, and analysis definition enter a `ConflictSet`. Contextual differences remain represented as heterogeneity rather than being overwritten.

Retraction, correction, or invalidation is propagated topologically from changed premises. A dependent claim becomes `review_required` unless an independent valid support path remains.

The machine-readable contract is in `protocol/argument-and-bridge.yaml`.

## Consequences

- Readers can traverse a conclusion to direct evidence and intermediate reasoning.
- Shared lineage cannot be presented as independent corroboration.
- Cross-domain mechanism claims expose alignment assumptions instead of skipping them.
- Cycles, conflicts, and downstream invalidation become mechanically checkable.

## Rejected alternatives

- **Claim-to-citation lists only:** hide inference and dependency.
- **Allow cyclic support:** makes justification and invalidation undefined.
- **Treat cross-domain mappings as prose:** prevents exact entity and condition validation.
