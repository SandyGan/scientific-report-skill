# ADR-0005: Use stable opaque typed identifiers and separate version identity

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Protocol maintainers

## Context

Paths, array indexes, labels, and content hashes are poor scientific object identifiers. Paths move, indexes reorder, labels change, and content hashes change on correction. Human-readable identifiers can also leak protected entity names. Stable graph traversal and revision propagation require identity that survives ordinary edits without conflating an object with one version of it.

## Decision

Canonical objects receive an opaque typed identifier at first registration. The normative lexical form is:

```text
<prefix>_<uuid>
```

`<prefix>` is a lowercase registry token of 2–12 ASCII letters or digits beginning with a letter; `<uuid>` is a lowercase RFC 9562 UUID in canonical hyphenated form. New IDs use a random UUID variant with at least 122 unpredictable bits. Implementations must not encode timestamps, paths, labels, entity attributes, source order, or protected values in IDs.

Examples of registry prefixes include `src`, `wu`, `att`, `seg`, `res`, `evd`, `clm`, `arg`, `brg`, `cnf`, `art`, and `rep`. Prefixes improve type checking but do not replace the object's declared type.

Object identity and version identity are separate:

- the typed ID remains stable for the same conceptual object;
- `object_version` is a positive integer that increases on semantic change;
- each version has an immutable revision-event binding;
- integrity digests identify serialized content, never conceptual identity;
- superseded and retracted versions remain addressable.

IDs are never reused, including after deletion, merge, redaction, or retraction. A merge records successor and predecessor IDs rather than rewriting history. A split creates new IDs and preserves the origin relation. Cross-project imports keep a namespaced external identifier and receive a local canonical ID.

Public projections use opaque projection aliases when internal IDs would reveal linkability or protected membership. Alias mappings remain outside the public package. Aliases are stable only within the declared projection lineage unless cross-release linkability is explicitly approved.

## Consequences

- References remain stable across reordering, file moves, and normal corrections.
- Version and invalidation logic can distinguish changed content from changed identity.
- Public IDs do not have to reveal internal names or paths.
- Implementations need an append-only identifier registry and collision checks.

## Rejected alternatives

- **Array indexes or slugs:** unstable under editing and often disclose labels.
- **Content hashes as IDs:** force identity changes on every correction and are vulnerable for low-entropy protected values.
- **One identifier for object and version:** makes historical citation and invalidation ambiguous.
