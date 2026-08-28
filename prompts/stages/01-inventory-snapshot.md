# Stage 01: inventory and snapshot disposition

## Prompt declaration

- **Prompt ID:** `report_prompt.stage.inventory_snapshot`
- **Version:** `0.2.0`
- **Stage code:** `S1_source_inventory`
- **Implementation:** `prompt`
- **Purpose:** Reconcile the accepted source-universe snapshot with every registered/supplied source item and propose an explicit disposition without pretending to inspect referenced-but-unprovided content.

## Required inputs

In addition to all core-fragment inputs:

- The exact `S1_source_inventory` route and the accepted `S0_source_universe_snapshot` output, including universe/snapshot identity, registry hash, boundary/cutoff, authority basis/evidence, enumeration status, and registered item IDs.
- For each supplied source item: stable item/snapshot/content/chunk identity, typed extent/sequence/overlap/truncation and parser-result metadata when content was parsed, relation to duplicates if asserted, and disclosure/access metadata.
- Prior source-coverage and section-coverage collection snapshots, if any, with complete object bodies, versions, hashes, and orchestrator acceptance/trust status.
- The requested inventory subset and verified continuation lineage.

An authoritative source universe must be explicitly declared and evidenced by the request. Do not infer authority from a complete-looking list.

## Structured outputs

Return the shared canonical patch-response JSON. Candidate operations may target only roots that both exist in the scientific-report schema and appear in request `permitted_patch_roots`/response `authorized_patch_roots`, normally `/source_coverage`, `/section_coverage`, `/limitations`, and `/review_tasks`. For each registered item propose exactly one applicable disposition:

- `included` — supplied content is usable for the requested downstream stage;
- `excluded_with_reason` — excluded by an explicit scope/disclosure rule, with reason;
- `unreadable` — content was supplied but the stated parser/read result is unusable;
- `inaccessible` — content was referenced but not supplied/accessible within the request boundary;
- `duplicate` — explicit evidence identifies a canonical source item;
- `unmapped` — supplied content cannot be reliably mapped to a registered source item or report scope.

Also propose snapshot identity/boundary fields, coverage counts with explicit denominators, unregistered supplied-item findings, parser/truncation findings, and section applicability/coverage candidates. Put unresolved cases in `review_tasks` and any unprocessed items in continuation fields.

## Invariants

1. Every registered source item in the requested subset receives one and only one disposition candidate or remains explicitly omitted for continuation.
2. `included` requires supplied usable content, not merely a path, citation, URL, manifest row, or claim of existence.
3. `unreadable` and `inaccessible` are distinct. A parser error on supplied bytes is unreadable; an unprovided or access-blocked object is inaccessible.
4. `duplicate` requires a supplied canonical-item relation and identity evidence. Similar filenames, hashes without a stated hashing relation, or matching titles are insufficient by themselves.
5. Preserve source items that contain only failures, negative results, excluded attempts, or contradictions. Scientific favorability is never an inclusion criterion.
6. Report registered items missing from the supplied snapshot and supplied items not registered in the universe; do not silently expand or shrink the boundary.
7. Unless `enumeration_status` is `authoritative_exhaustive` with the required authoritative registry basis and evidence, coverage language is limited to the registered/supplied boundary. Never propose global completeness.
8. Coverage counts are reproducible from item dispositions, include the denominator and universe/snapshot ID, and do not treat duplicates as silently vanished.
9. Parser status, OCR quality, truncation, checksum mismatch, and content-ID mismatch remain visible as coverage limitations.
10. Stage 01 does not extract scientific facts from content beyond what is necessary for source type, mapping, and coverage disposition.
11. A snapshot reference does not prove immutability or content availability unless that property is supplied.

## Forbidden inferences

Do not infer:

- files or records exist beyond the supplied universe;
- referenced content was read, parsed, or scientifically reviewed;
- a list is authoritative, exhaustive, or current from its appearance;
- duplicate identity from name/path/title similarity alone;
- parser success from non-empty content, or parser completeness from success status alone;
- absence from the inventory means `not_performed` or that no negative result exists;
- source inclusion means its assertions are true;
- global report completeness from all registered items receiving dispositions.

## Failure behavior

- Return `cannot_complete` with no scientific candidate operations if source-universe identity, snapshot identity, boundary/cutoff, registered item IDs, or permitted coverage roots are missing.
- Return `needs_review` if authority is ambiguous, source mapping is non-unique, duplicate evidence is insufficient, parser status conflicts with content metadata, or disclosure/access status is unclear.
- An unreadable/inaccessible item is a valid disposition and must be preserved; it does not by itself make the stage `cannot_complete` when the item can be recorded safely.
- If the requested subset omits registered items but no continuation/scope basis explains that omission, return `cannot_complete` rather than assert full disposition.

## Continuation behavior

- The transactional unit is one registered source item plus any canonical duplicate relation needed to classify it.
- Process items in the request’s stable registered order. Emit a disposition, supporting binding/metadata, and diagnostics together before marking the item processed.
- On truncation, list every unprocessed registered item in the requested subset in `omitted_unit_ids`; a trusted wrapper mints a cursor bound to universe/snapshot, request, stage, accepted state, prior response, operation set, next unit, page, and unused nonce.
- A resume without matching `orchestrator_verification` returns `cannot_complete` before any item processing.
- Do not mark the inventory complete until all requested registered items and all supplied-unregistered items have been handled.
- A complete continuation state means inventory disposition is complete only for the declared universe/snapshot subset; absolute completeness additionally requires `enumeration_status: "authoritative_exhaustive"` and a derived `report_completeness: "proven_within_declared_universe"`.

## Task instruction

Reconcile the supplied source-universe registry with the supplied snapshot and content metadata. Propose one explicit disposition per item, preserve unreadable/inaccessible/negative-evidence sources, expose boundary and parser limitations, and emit only source-coverage candidate patches and shared diagnostics.
