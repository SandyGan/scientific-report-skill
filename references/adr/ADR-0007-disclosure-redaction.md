# ADR-0007: Redact by deterministic disclosure projection

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Protocol maintainers

## Context

Deleting protected fields by hand destroys the distinction between unknown, inapplicable, and known-but-withheld information. Redacting only visible HTML also leaves values in JSON, search indexes, comments, metadata, filenames, hashes, images, logs, and print views. A safe release requires projection of the entire graph and package.

## Decision

Audience releases are deterministic disclosure projections of an authorized canonical scientific payload. Classification levels are `public`, `controlled`, `restricted`, and `secret`; profiles declare the maximum allowed level. Raw secret values never enter scientific payloads or bundles.

Projection preserves epistemic state:

- allowed known values remain `known`;
- protected known values become `withheld` with null public value and a non-sensitive reason;
- `unknown` remains `unknown`;
- `not_applicable` remains `not_applicable`.

Required protected records retain a withheld placeholder. Optional objects may be removed only when their existence is itself protected and a section-level withheld record preserves the coverage gap. Counts are withheld or safely coarsened when they could reveal membership. Public aliases are opaque and projection-scoped; mappings and detailed redaction decisions stay at an authorized level.

Projection regenerates references, summaries, indexes, HTML, SVG, images, exports, and print views from the projected graph. Validation scans all bytes and member paths, including metadata, comments, source maps, logs, filenames, remote locators, absolute paths, and low-entropy digests. Any unresolved leak or policy error fails closed.

A public disclosure manifest binds the source payload digest, profile, policy version, decision-set identity, and projected payload digest without exposing protected mappings. The detailed append-only decision log remains restricted.

The machine-readable contract is in `protocol/disclosure-policy.yaml`.

## Consequences

- Readers can tell that relevant information was withheld rather than unknown or irrelevant.
- HTML, indexes, filenames, and metadata receive the same policy treatment as JSON fields.
- Projection must be rerun after scientific or policy changes.
- Public reproducibility assessments remain conservative when required artifacts are withheld.

## Rejected alternatives

- **Manual field deletion:** is not repeatable and corrupts missingness semantics.
- **Render-time masking only:** leaves protected values in source files and indexes.
- **Plain hashes as aliases:** may disclose low-entropy values and creates uncontrolled linkability.
