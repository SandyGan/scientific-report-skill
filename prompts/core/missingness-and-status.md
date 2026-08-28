# Core fragment: missingness and status semantics

## Prompt declaration

- **Prompt ID:** `report_prompt.core.missingness_and_status`
- **Version:** `0.2.0`
- **Purpose:** Enforce lossless, explicit semantics for known, unknown, inapplicable, and withheld values and for work, source, result, and continuation statuses.

## Required inputs

- The generation request, selected schema version, stage, scope, and disclosure policy.
- Applicable field/applicability rules supplied by identifier or content.
- Supplied source chunks and complete typed, versioned, hash-bound orchestrator-accepted working-state collection snapshots.
- Any source disposition, work-state, result-axis, decision-timing, or section-coverage vocabularies selected by the request.
- The permitted patch roots and response schema.

## Structured outputs

Return the shared generation-response JSON only. Source-derived fields that can be missing must use the schema-selected equivalent of this envelope:

```json
{
  "state": "unknown",
  "value": null,
  "source_bindings": [],
  "derivation_bindings": [],
  "missing_reason": "The supplied accepted state does not establish this applicable value.",
  "provenance_status": "absent"
}
```

Allowed `state` values are `known`, `unknown`, `not_applicable`, and `withheld`. Record each newly encountered absence or status ambiguity in `missingness` with the target object/path, state, reason code, and relevant integrity-bound source or typed premise provenance. Keep work state, execution scope, result axes, source disposition, and section coverage in their dedicated fields rather than overloading the missingness envelope.

## Invariants

1. `known` has a non-null substantive value and at least one supplied source binding or an explicit derivation with bound premises. `missing_reason` is null.
2. `unknown` has `value: null`, a specific non-empty reason, and no fabricated substitute. It means applicable but not established from available evidence.
3. `not_applicable` has `value: null` and cites an applicability rule or explicit scope fact. It never means merely absent, inconvenient, or not yet assessed.
4. `withheld` has `value: null`, identifies a disclosure reason/policy without revealing the value, and is never converted to `unknown` because public content omits it.
5. `provenance_status` is `complete`, `partial`, or `absent` and describes traceability, not truth. A known value can have partial provenance only when the target schema/rule permits it, and the deficit must be reviewable.
6. Do not use empty strings, whitespace, zero, false, empty collections, `TBD`, `N/A`, `NA`, `none`, `null` outside its defined envelope role, or other ambiguous sentinels to stand for missingness.
7. Absence of a performance record means work state `unknown`, not `not_performed`. `not_performed` requires an explicit statement or closed authoritative accounting that supports it.
8. Keep these orthogonal result dimensions separate: scientific effect, statistical decision, interpretability, record disposition, and technical failure. None may be derived mechanically from another.
9. A section with no records is represented through section coverage (`covered_no_records`, `not_applicable`, `unknown`, or schema equivalent), never silently dropped.
10. Source disposition remains explicit: `included`, `excluded_with_reason`, `unreadable`, `inaccessible`, `duplicate`, or `unmapped`. Duplicate requires an evidenced canonical relation; inaccessible is not unreadable.
11. Continuation `complete` means all units in the requested subset were handled, not that the source universe or report is complete.

## Forbidden inferences

Never:

- turn an absent value into `not_applicable` without an applicability basis;
- turn a redacted/restricted value into `unknown`, copy it into diagnostics, or guess its category/value;
- turn no mention of work into `not_performed`, or no mention of failure into success;
- treat `0`, `false`, an empty measured set, a below-detection observation, or a null statistical result as missing when it is an explicitly reported substantive result;
- infer `completed` from `attempted`, `interpretable` from a numeric output, or `primary` from prominence in a source;
- convert `do_not_reject_null` into `no_detectable_effect`, biological equivalence, or evidence of absence;
- use `unknown` to hide a known contradiction; represent conflicting known values in a conflict set while preserving both;
- invent a missing reason more specific than supplied evidence supports.

## Failure behavior

- Use `cannot_complete` when the selected schema cannot distinguish `unknown`, `not_applicable`, and `withheld`; when disclosure-safe representation is impossible; or when required applicability/status vocabularies are missing and no conservative state can be emitted.
- Use `needs_review` for uncertain applicability, ambiguous missingness reason, conflicting status evidence, partial provenance on a high-impact known value, or unclear distinction between inaccessible and unreadable.
- Do not drop an object solely because a required field is unknown. Emit a missingness candidate where the schema allows; otherwise report the representational failure.
- Preserve all prior failure and negative-result states during replacement. A more complete later value may update the envelope but must not erase revision history.

## Continuation behavior

- Evaluate required fields and status axes for a whole target object before marking its unit processed.
- If truncation occurs mid-object, omit that object and all its partial operations; include its ID in `omitted_unit_ids`.
- A resumed request is usable only after trusted orchestration verifies cursor authenticity and all request/stage/state/snapshot/prior-response/operation/next-unit/page/nonce bindings; otherwise return `cannot_complete`.
- On resume, retain prior missingness states unless new supplied evidence supports an explicit revision. Never “improve” unknown to known by repetition or contextual plausibility.
- A cursor must not contain withheld values or encode missing values as implicit defaults.

## Task instruction

For every applicable source-derived field and every status-bearing object, choose only the state justified by supplied evidence and applicability rules. Emit explicit envelopes, section/source dispositions, orthogonal work/result statuses, and review diagnostics; never collapse absence, inapplicability, restriction, failure, or negative evidence into a generic null.
