# Stage 00: source-universe snapshot

## Prompt declaration

- **Prompt ID:** `report_prompt.stage.source_universe_snapshot`
- **Version:** `0.2.0`
- **Stage code:** `S0_source_universe_snapshot`
- **Implementation:** `prompt`
- **Purpose:** Propose the bounded source-universe and immutable snapshot accounting from operator-supplied registry material without inferring authority, exhaustiveness, availability, or unprovided content.

## Required inputs

In addition to all core-fragment inputs:

- The exact `S0_source_universe_snapshot` route, target schema, and authorized `/source_coverage`, `/limitations`, and `/review_tasks` roots as applicable.
- Operator-supplied scope, inclusion/exclusion boundaries, cutoff and event semantics, authority basis/evidence, enumeration status, registered item IDs, and snapshot registry hashes.
- Content/reference/access metadata actually supplied for registered items. A path, citation, URL, manifest name, or hash without content is metadata, not inspected content.
- Any prior accepted source-coverage snapshot as a complete typed body with exact version/hash and orchestrator acceptance/trust status.
- Initial continuation state or verified resume lineage.

## Structured outputs

Return the shared canonical patch-response JSON. Candidate operations may propose a `SourceCoverage` snapshot or versioned updates that record:

- universe identity, scope, boundaries, cutoff semantics, authority basis/evidence, and enumeration status;
- immutable snapshot ID and registry hash;
- the ordered registered item-ID denominator and supplied inventory method;
- provisional item/access/parser states that are supportable without content inspection;
- report-completeness classification and explicit coverage limitations;
- review tasks for disputed authority, registry mismatch, or unknown boundary fields.

Every source-derived operation uses integrity-complete source bindings. Operator registry assertions that lack source content remain operator-authorized administrative candidates and require human confirmation.

## Invariants

1. A source universe is a declared denominator and boundary, not a claim that every project source was discovered.
2. `authoritative_exhaustive` requires an authoritative registry or reconciled authoritative registries plus supplied authority evidence; a complete-looking list is insufficient.
3. Snapshot identity includes immutable registry hash and creation/cutoff semantics. Similar names or timestamps do not establish snapshot identity.
4. Registered item IDs remain ordered and unique. Do not silently add supplied-unregistered items or remove registered-but-unavailable items.
5. `proven_within_declared_universe` requires authoritative exhaustive enumeration and known cutoff semantics. Otherwise use the applicable bounded/partial classification and limitations.
6. A reference does not establish content access, parser success, scientific incorporation, or truth.
7. Sources describing only failures, negative evidence, exclusions, or contradictions remain in the denominator.
8. Withheld registry facts remain withheld and are not rewritten as unknown.
9. Stage 00 establishes the universe/snapshot contract only. Item-by-item terminal disposition belongs to `S1_source_inventory`.
10. Every patch path is preflighted against both authorization sets and the declared target schema before application.

## Forbidden inferences

Do not infer:

- authority, exhaustiveness, currentness, or completeness from list length, formatting, directory layout, or a source label;
- file/content existence from a path, URL, citation, checksum row, or artifact name;
- readability, accessibility, parser success, or scientific relevance without supplied evidence;
- duplicate identity from matching names/titles or nearby registry rows;
- absence of negative evidence or failures from absent content;
- that an operator-supplied registry was independently verified by this prompt;
- global report completeness from a bounded source-universe declaration.

## Failure behavior

- Return `cannot_complete` with no candidate operations when universe identity, registered-item denominator, snapshot identity/registry hash, boundary, target schema, or permitted source-coverage root is absent or structurally invalid.
- Return `cannot_complete` for an unauthenticated resume cursor or a cursor mismatched to request, stage, accepted state, snapshot set, prior response, operations, next unit, page, or nonce.
- Return `needs_review` for ambiguous authority, conflicting registry versions/hashes, unknown cutoff semantics, duplicate item IDs, or supplied items outside the declared boundary.
- Preserve unknown/inaccessible/withheld registry states explicitly. Do not invent a terminal item disposition to make snapshot creation succeed.

## Continuation behavior

- The transactional unit is the universe declaration plus one immutable snapshot registry. Do not split boundary/authority fields from the denominator/hash that they qualify.
- Process registries in supplied order. A snapshot is processed only after identity, hash, denominator, boundary, authority, and limitations are represented together.
- On truncation, omit the whole incomplete snapshot unit and list it in `omitted_unit_ids`; a trusted wrapper attaches the next cursor and matching verification.
- Resume only after orchestration verifies every lineage binding and confirms the nonce has not been consumed.
- Completion means the requested source-universe snapshot candidate is fully represented; it does not mean item inventory, extraction, scientific coverage, or global completeness is complete.

## Task instruction

Construct only the bounded source-universe and immutable snapshot accounting justified by supplied operator registry material. Preserve authority and completeness limits, retain every registered item in the denominator, and return authorized source-coverage/limitation/review candidates plus shared diagnostics.
