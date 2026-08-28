# Stage 03: deterministic normalization route

## Prompt declaration

- **Prompt ID:** `report_prompt.stage.normalization_route`
- **Version:** `0.3.0`
- **Stage code:** `S3_normalization`
- **Implementation:** `deterministic_non_llm`
- **Purpose:** Declare the exact non-model normalization route that validates its input response, applies a versioned deterministic profile, emits only target-schema candidates, validates its output, and records lossless diagnostics.

## Required inputs

In addition to the shared core contract data, the orchestrator must supply:

- `stage: "S3_normalization"` and a non-null `normalization_route` conforming to the request schema.
- Deterministic implementation tuple `normalizer:canonical-s2-exchange` / `1.0.0` / exported `S3_NORMALIZER_HASH` and profile tuple `normalization-profile:s2-preserving-v1` / `1.0.0` / exported `S3_PROFILE_HASH` from the installed `scientific-report-console/generation` API. Callers resolve the tuple with `resolveGenerationProfile`; no caller-supplied profile body or unpinned fallback is executable.
- Input response ID/hash plus exact source schema ID/version.
- Canonical scientific-report target schema ID/version and `validation_mode: "validate_input_and_output"`.
- Target-schema-valid permitted patch roots, accepted state, ID registry, disclosure level, and initial or verified continuation lineage.
- The complete input response bytes. References, IDs, or hashes without the bytes are insufficient for normalization.

This route is never sent to a language model. The installed `normalizeS2Response` implementation validates the full embedded S2 response, copies candidate operations plus attempt/failure/negative/exclusion/unreadable/conflict/missingness/review/provenance/continuation classes without deletion or synthesis, rebinds the S3 request identities, and runs the production exchange validator on its output. The executable normalizer and profile are selected only by the exact exported version/hash tuples.

## Structured outputs

The deterministic implementation emits the shared canonical generation-response JSON with `stage: "S3_normalization"`. It must:

- preserve request, prompt-set, target-schema, accepted-state, and authorization bindings;
- preserve source and premise provenance without synthesizing bindings;
- emit only candidate operations whose roots/paths exist in and are authorized for the selected target schema;
- emit structured exclusion/unreadable dispositions and other diagnostics without changing their scientific meaning;
- use the one canonical response and continuation vocabulary;
- record normalization profile/implementation/input/output hashes in `extensions` for audit.

No normalized output is trusted or accepted merely because this route emitted it.

## Invariants

1. Input schema validation occurs before normalization; output schema validation occurs after normalization. Either failure prevents an `ok` response.
2. The implementation/profile ID, version, and hash exactly match the operator-selected route. No current-working-directory or unversioned default override is allowed.
3. Each transformation is deterministic for identical input bytes, schemas, profile, and implementation.
4. Normalization preserves source facts, polarity, missingness, failures, exclusions, retractions, conflicts, work/execution scope, result axes, versions, and provenance.
5. Enum aliases, field names, or units are changed only by explicit versioned profile rules. Unknown values are not guessed or mapped by field-name-global heuristics.
6. Target collection/root and `object_type` mapping is explicit. A source operation for a nonexistent or unauthorized root is rejected before application.
7. No source binding, accepted premise, object ID, version, hash, parser identity, locator, or continuation field is invented.
8. Duplicate/deduplication behavior is profile-declared and integrity-based; matching labels are insufficient.
9. Normalization does not apply patches, accept candidates, validate scientific semantics, execute computations, or make release decisions.
10. The input/output hash pair and exact route contract make reruns auditable.

## Forbidden inferences

The deterministic route must not:

- invoke a model, use generated prose, or consult external content;
- accept an input record kind outside the declared source schema;
- emit a value outside the target schema because a similarly named field permits it elsewhere;
- turn unknown, not applicable, withheld, failed, excluded, negative, superseded, or retracted state into a more favorable state;
- infer units, identifiers, versions, paths, parameters, actor, timing, or identity;
- create scientific claims, merge entities, adjudicate conflicts, or assert validation/reproduction success;
- silently discard an operation or diagnostic that cannot be represented.

## Failure behavior

- Emit `cannot_complete`, no candidate operations, and a blocking review task when input bytes/hash, route identity/hash, source/target schema, profile, authorization, or required accepted state is absent or mismatched.
- Emit `cannot_complete` when input or output schema validation fails, target root/path does not exist, lossless transformation is impossible, or continuation verification fails.
- Emit `needs_review` when a profile explicitly permits a bounded ambiguous mapping that requires human adjudication; preserve the original value and do not apply the ambiguous mapping as accepted state.
- Structured unreadable/excluded reasons remain structured. A contract that would reduce them to bare IDs is rejected.
- Any unknown chunk completeness or provenance deficit remains visible and cannot be normalized into complete status.

## Continuation behavior

- The transactional unit is one complete input operation plus all attached bindings and diagnostics, or one complete structured diagnostic.
- Preserve input order unless the profile declares a deterministic dependency order. Never separate a failure/qualification from the record it constrains.
- On truncation, omit the whole incomplete unit and list it in `omitted_unit_ids`; a trusted wrapper creates the next cursor and verification.
- Resume only after authentication and exact lineage matching, including implementation/profile/schema hashes and input response hash in addition to shared cursor bindings.
- Duplicate accepted operation IDs, replayed nonce, stale state, changed route/profile, or changed input response fails closed.

## Task instruction

Route `S3_normalization` only to the hash-pinned deterministic implementation. Validate input, transform solely by the versioned profile, validate output, preserve all scientific/provenance semantics, and emit the shared candidate response; do not invoke a model or claim downstream acceptance.
