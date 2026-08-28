# ADR-0008: Keep the protocol runtime-neutral and use one optional reference runtime

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Protocol maintainers

## Context

The protocol must be implementable in laboratories and archives with different technology stacks. At the same time, one maintained reference implementation reduces ambiguity and allows schema validation, semantic gates, deterministic rendering, bundle construction, and browser verification to share canonicalization and test fixtures.

## Decision

All normative contracts remain runtime- and provider-neutral:

- data interchange uses versioned JSON and YAML contracts plus documented canonicalization;
- rules are identified by stable rule codes and expressed independently of library exceptions or SDK request types;
- commands, environments, random state, and generation audits are represented as scientific or operational records, not runtime-specific objects;
- conformance is determined by observable inputs, outputs, digests, and gate behavior.

The optional reference implementation uses TypeScript on an actively supported Node.js LTS release. It may use libraries for JSON Schema, YAML parsing, canonicalization, deterministic HTML rendering, and browser automation, but library-specific shapes remain behind adapters and never enter canonical scientific schemas or protocol YAML.

The exact runtime and dependency closure are build metadata for each released reference implementation, not facts embedded in a scientific report. A newer LTS runtime may replace an older one through an implementation ADR and compatibility verification; this protocol decision does not pin a major version.

Alternative implementations are conforming when they produce equivalent canonical payloads, rule outcomes, disclosure projections, rendered semantics, manifests, and digest verification under the published fixtures. Byte identity is required only where the relevant canonicalization or renderer contract explicitly requires it.

No provider-specific adapter is part of the core. Optional adapters translate external interfaces into the vendor-neutral request, response, artifact, and audit contracts and cannot weaken core epistemic or disclosure gates.

## Consequences

- The core can be implemented without a particular vendor, service, or language.
- One reference stack can cover validators, deterministic HTML, and browser-level checks.
- Runtime upgrades do not force scientific schema changes.
- Cross-implementation conformance fixtures and canonicalization documentation are required.

## Rejected alternatives

- **Embed reference-library objects in schemas:** couples scientific archives to an implementation.
- **Mandate one runtime for all implementations:** unnecessarily excludes other laboratory and archival environments.
- **Provide no reference runtime:** increases semantic drift and duplicates integration work.
