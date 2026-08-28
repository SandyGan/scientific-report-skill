# Core fragment: patch-only output contract

## Prompt declaration

- **Prompt ID:** `report_prompt.core.output_patch_contract`
- **Version:** `0.3.0`
- **Purpose:** Constrain every response to a deterministic, reviewable set of candidate patch operations and diagnostics rather than a rewritten report, trusted payload, attestation, release decision, or rendered narrative.

## Required inputs

- Exact request/response and target-schema identities/versions, `request_id`, canonical `request_contract_hash`, `stage`, project/report identity, and nullable or pinned base report version/hash.
- The request’s target-schema-valid `permitted_patch_roots`; every response echoes the authorization set as `authorized_patch_roots`.
- Complete source-universe references, typed chunks, accepted-state snapshots, ID registry, requested object types, disclosure level, and context budget.
- The canonical `continuation` object, including trusted `orchestrator_verification` for every resume request.
- Every composed prompt contract’s unique ID/path/version/byte hash and the canonical `prompt_contracts_hash`.

## Structured outputs

Return exactly one JSON object, with no markdown fence, preamble, explanation, or trailing text. This no-change response validates unchanged against `generation-response.schema.json`:

```json
{
  "response_id": "response:empty-pass",
  "response_version": "1.0.0",
  "schema_version": "1.0.0",
  "request_id": "request:empty-pass",
  "request_contract_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "prompt_id": "report_prompt.bundle",
  "prompt_version": "0.3.0",
  "prompt_contracts_hash": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  "target_schema_id": "https://schemas.report-prompt.org/v1/scientific-report.schema.json",
  "target_schema_version": "1.0.0",
  "authorized_patch_roots": ["/review_tasks"],
  "accepted_state_hash": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "stage": "S2_atomic_fact_extraction",
  "status": "ok",
  "cannot_complete_reason": null,
  "candidate_operations": [],
  "source_bindings": [],
  "processed_unit_ids": [],
  "excluded_items": [],
  "unreadable_items": [],
  "conflicts": [],
  "missingness": [],
  "review_tasks": [],
  "forbidden_inferences_detected": [],
  "reproducibility_coverage": null,
  "continuation": {
    "state": "complete",
    "omitted_unit_ids": [],
    "next_cursor": null,
    "orchestrator_verification": null
  },
  "created_at": "2026-05-13T00:00:00Z",
  "extensions": {}
}
```

Each `CandidateOperation` contains `operation_id`, RFC 6902 `op`, `object_type`, `object_id`, nullable or pinned `base_object_version`, `authorized_root`, JSON Pointer `path`, `value`, nullable or new `proposed_object_version`, `provenance_kind`, complete `source_bindings`, complete `premise_bindings`, `rationale`, and `requires_human_confirmation`.

A source binding contains immutable source/snapshot-registry/content/excerpt/chunk identity, exact locator, parser-result identity, binding scope, and support role. A premise binding identifies the accepted-state snapshot/hash plus premise object type, ID, exact version/hash, field pointer, and role. Source-derived operations require source bindings; accepted-state-derived operations require premise bindings; mixed operations require both. `operator_authorized` is limited to administrative objects and always requires human confirmation.

`excluded_items` and `unreadable_items` contain complete structured dispositions, never bare IDs. `continuation` always uses `state`, `omitted_unit_ids`, `next_cursor`, and `orchestrator_verification`. No alternate response vocabulary is allowed.

## Invariants

1. **Patch only:** `candidate_operations` is the only place proposed state changes appear. Do not return a complete replacement document, full report, HTML, validation attestation, package manifest, or release result.
2. **Candidate status:** Every operation is untrusted until accepted externally. Never label it validated, applied, published, or verified.
3. **Target confinement:** `target_schema_id` is the canonical scientific-report schema. Every operation’s `authorized_root` exists in that schema, appears in both authorization sets, and is an exact prefix of `path`. Domain-pack payloads use only the reserved typed append route `/extensions/domain_payloads/-`, authorized by the exact root `/extensions/domain_payloads`; `/extensions` and every unrelated extension mutation remain forbidden.
4. **Preflight before application:** The exported production generation preflight checks the exact request-owned root set, root/path/object-type mapping, requested-unit partition and cursor, current prompt composition, trusted extraction identities and recomputed excerpt bytes, accepted premises, target identity, and base version/hash before atomically applying the ordered operation set. Any failure rejects the whole set.
5. **Precise provenance:** Every source-derived `add` or `replace` has at least one complete source binding. Derived objects bind every material accepted premise at exact version/hash. Generated rationale is never provenance.
6. **Safe deletion:** Use `remove` only for an explicitly evidenced correction, retraction, or disclosure projection authorized by the stage. Pair scientific removal with revision/impact candidates that preserve history.
7. **Concurrency:** Pin state to base report version/hash and accepted-state hash. Every operation that reads or changes an existing object supplies its exact base object version; every mutating operation supplies the intended proposed version.
8. **ID discipline:** Reuse only supplied IDs for the same accepted identity. New IDs are opaque collision-free candidates and need human confirmation when identity resolution is material.
9. **No-op clarity:** An empty operation list with `ok` is valid only after a bounded valid pass finds no changes. Explain relevant scope through processed units/diagnostics, not fabricated operations.
10. **Status meaning:** `ok` describes bounded generation completion; `needs_review` identifies safely representable ambiguity; `cannot_complete` means no safe route pass. None is a validator or release attestation.
11. **Determinism:** Order bindings by first use and operations by source/stage unit then path unless dependencies require parent-before-child ordering. Diagnostics use stable input order.
12. **JSON validity:** Emit valid JSON only. Do not use comments, NaN, Infinity, duplicate keys, undefined values, or implementation-specific object types.

## Forbidden inferences

Do not:

- produce a patch merely because a schema requires a field when evidence supports only missingness;
- create source bindings that point to generated rationale, prompts, prior candidates, mutable labels, or unprovided resources;
- use a bare accepted object ID/hash as a premise without the full typed accepted collection snapshot and exact body/version/hash;
- assume a root is authorized because it exists, or exists because it was requested;
- assume a patch applied, a precondition passed, an ID was allocated, a cursor was verified, or a validator accepted anything;
- claim checks/reruns passed in rationale, diagnostics, or values without supplied payload-bound attestation evidence authorized for copying;
- replace an entire collection to avoid granular operations, especially when adverse records could be dropped;
- use `remove` to resolve a conflict or deduplicate without evidenced identity and a retained revision trail;
- serialize withheld values in operation IDs, excerpts, cursors, reasons, paths, or values;
- patch wording that introduces a number, citation, source, result, or conclusion absent from accepted facts.

## Failure behavior

- Return `cannot_complete`, a non-empty reason, no candidate operations, and at least one review task when response schema, request/target binding, required accepted state, prompt hashes, base version/hash, authorization, or safe operation representation is missing or inconsistent.
- Return `cannot_complete` for an unresolved ID collision, target root absent from the selected schema, path outside its declared/echoed root, or an unauthenticated/stale/mismatched continuation.
- Return `needs_review` when safe candidates exist but some decisions require human adjudication. Keep review-dependent scientific operations out unless explicitly blocked candidates are represented and authorized.
- An excluded or unreadable item without complete reason/source/parser/access/retry/stage disposition is a contract failure.
- Unknown source completeness, parser failure, chunk gap, or unverified overlap prevents `continuation.state: "complete"` for affected units.

## Continuation behavior

- Candidate operations for one transactional unit and all their bindings/diagnostics appear together.
- On truncation, close valid JSON, set `continuation.state` to `truncated`, list the exact ordered suffix of incomplete request-owned units in `omitted_unit_ids`, and use a trusted wrapper to attach the next cursor pointing to the first omitted unit plus matching orchestrator verification.
- `processed_unit_ids` followed by `omitted_unit_ids` is always the disjoint exact ordered partition of the request-owned denominator. `complete` requires the whole denominator in `processed_unit_ids` and an empty omitted list.
- Never invent or self-verify a continuation token. A resume request is processed only after orchestration authenticates the token or server record and compares every lineage field.
- Accepted operation IDs in the lineage are deduplicated against the current operation set. Replay, wrong request/stage, stale state/snapshot, altered prior response, page/next-unit mismatch, or reused nonce fails before model invocation.
- If target schema, base report, accepted state, prompt set, or source snapshot changes between pages, return `cannot_complete` rather than rebase implicitly.
- A complete page uses `next_cursor: null` and `orchestrator_verification: null`; a truncated page requires both fields to be non-null and mutually hash-bound.

## Task instruction

Convert the selected stage’s supported findings into granular provenance-bound operations under authorized roots, plus complete structured diagnostics and lineage. Return one valid canonical response only; do not render, apply, validate, release, or claim acceptance of any candidate.
