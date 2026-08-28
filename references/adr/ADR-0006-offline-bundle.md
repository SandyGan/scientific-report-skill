# ADR-0006: Publish a movable offline directory bundle

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Protocol maintainers

## Context

A single self-contained HTML file becomes unwieldy for large reports, encourages duplicated embedded state, and is difficult to inspect. A network-dependent site is not durable, portable, or suitable for restricted environments. The release artifact must remain readable after moving directories, disconnecting the network, and disabling scripts.

## Decision

The canonical publication artifact is a movable directory bundle with these logical members:

```text
report.html
annex/
assets/
scientific-report.public.json
validation-attestation.json
package-manifest.json
README.txt
audit/generation-audit.json   # optional and removable as a unit
```

All paths are normalized relative paths rooted in the bundle. Absolute paths, traversal components, duplicate normalized members, remote fonts, scripts, styles, icons, media, analytics, and telemetry are prohibited. The report must open using `file://` after relocation. Static assets are bundled and integrity-listed.

`scientific-report.public.json` is the only public scientific fact source. HTML, annexes, tables, search indexes, and print views are deterministic derivatives. They may duplicate facts for access but must not create or strengthen them. All projected scientific content is linearly readable without scripting; interactive behavior is progressive enhancement.

`package-manifest.json` records every other required member's normalized path, byte length, media type, and cryptographic digest, plus the canonical scientific payload digest and package format version. It does not list or digest itself. Digest binding is acyclic: the validation attestation binds the scientific payload and the exact non-attestation artifacts it evaluated; the final manifest then lists the attestation and its digest. An optional external signature or archive record may bind the final manifest digest. Packaging a different payload or changing a member requires new applicable digests and verification.

The optional generation audit is peripheral. Removing the entire `audit/` subtree must leave the scientific payload, its digest, rendered scientific content, validation result, and reproducibility assessment unchanged. It must not be referenced by scientific graph nodes.

Large reports may split deterministic annexes and indexes, but the manifest and no-script navigation must preserve complete projected coverage.

## Consequences

- Releases are inspectable, transferable, and usable in disconnected environments.
- Large data can be split without creating multiple scientific authorities.
- Render and package verification must inspect paths, member integrity, network behavior, and no-script content.
- The optional process audit can be removed without changing scientific meaning.

## Rejected alternatives

- **Network-hosted application only:** fails offline durability and introduces mutable dependencies.
- **Unlimited single HTML:** scales poorly and mixes canonical facts with presentation encodings.
- **Multiple independently authored exports:** creates conflicting scientific authorities.
