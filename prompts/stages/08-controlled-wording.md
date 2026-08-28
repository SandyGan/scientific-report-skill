# Stage 10: optional controlled wording

## Prompt declaration

- **Prompt ID:** `report_prompt.stage.controlled_wording`
- **Version:** `0.2.0`
- **Stage code:** `S10_controlled_wording`
- **Implementation:** `prompt`
- **Purpose:** Propose reader-facing wording fields from complete typed orchestrator-accepted scientific state while preserving qualifications, missingness, failures, negative evidence, conflicts, source-bound completeness limits, and reproducibility gaps. This stage is optional and creates no new scientific facts.

## Required inputs

In addition to all core-fragment inputs:

- Complete typed accepted `source_coverage`, `research_questions`, `claims`, `results`, `failures`, `conflict_sets`, `limitations`, and `reproducibility_units` collection snapshots plus any other objects to be worded; every collection/object has exact version/hash and orchestrator acceptance/trust status.
- An explicit list of target-schema-valid permitted narrative target paths and audience/language/length/readability constraints.
- Disclosure projection/policy and public-safe labels for withheld/restricted objects.
- When wording may mention validation/reproducibility status, a supplied payload-bound attestation or typed accepted status object authorizing that exact wording, plus completed S9 coverage with no undispositioned key computation.
- Terminology map, controlled phrase rules, and verified continuation lineage if supplied.

Do not use raw source chunks to add facts in this stage. If a needed fact is absent from accepted state, return missingness/review rather than extract it here.

## Structured outputs

Return the shared patch-response JSON. Candidate operations may add or replace only request-permitted narrative fields such as:

- bounded scope statement;
- qualified research-question answer and resolution explanation;
- concise claim summary that preserves conditions and strength;
- execution summary separating completed/planned/external/unknown work;
- results summary covering positive, negative, inconclusive, failed, excluded, conflicted, and retracted outcomes as applicable;
- limitations, source-coverage boundary, and unresolved issue wording;
- reproduction/access wording copied from accepted status fields.

Each narrative operation references the accepted object IDs/versions from which every statement, number, and citation label is rendered. No narrative string itself becomes evidence.

## Invariants

1. Every factual clause maps to accepted, version-pinned fields. Wording may compress but not broaden scope, strengthen certainty, add causality, or remove a material condition.
2. Do not create new numbers, calculations, citations, sources, dates, IDs, names, statuses, methods, results, claims, or conclusions.
3. Preserve explicit epistemic/work distinctions in plain language: performed versus planned, this-project versus external, observed versus inferred, unknown versus not applicable versus withheld.
4. Include material failures, negative/null/inconclusive findings, exclusions, contradictions, strongest supported counterevidence, and unresolved limitations in the relevant summary. Do not optimize for a success narrative.
5. “Complete,” “all,” “exhaustive,” or equivalent absolute coverage wording is allowed only when an accepted authoritative source universe is fully dispositioned for the exact boundary. Otherwise state bounded registered-source coverage and that global completeness is not established.
6. `do_not_reject_null` is worded as inconclusive against the null, not “no effect.” Biological absence/equivalence wording requires accepted interpretability/control/MDE/equivalence support.
7. “Validated,” “verified,” “reproduced,” “rerun successfully,” “tests passed,” and similar wording requires a supplied, applicable, payload/version-bound accepted status. Generation status `ok` is never such evidence.
8. Reproducibility wording preserves access conditions and axis-specific gaps; do not turn a partial recipe/environment record into “fully reproducible.”
9. Withheld values remain undisclosed. Describe the restriction at the authorized granularity without hints that reconstruct the value.
10. A conflict remains visible and alternatives remain attributed; do not pick a winner through rhetorical emphasis.
11. Use calibrated verbs: “observed/reported” for accepted observations, “supports” for warranted evidence relations, “is consistent with” for qualified inference, and “does not establish” for missing causal/mechanistic support.
12. Output remains candidate patches; this stage does not render HTML or attest correctness.

## Forbidden inferences

Do not:

- embellish with conventional background, literature knowledge, plausible mechanisms, expected parameters, or absent citations;
- change a status for readability;
- omit failed/negative/conflicting records because of length or audience;
- convert an unknown into a vague assertion, or expose a withheld value through paraphrase;
- use “we did” for external/upstream work or reanalysis of externally generated data;
- call a research question resolved without accepted applicable resolution criteria;
- use causal/mechanistic wording for an association or cross-domain claim lacking an accepted bridge;
- infer validation/reproduction/publication readiness from prior prompt responses;
- claim to have inspected or rendered a file that was not supplied.

## Failure behavior

- Return `cannot_complete` if accepted state versions or permitted narrative paths are absent, if requested wording would necessarily introduce unsupported facts or disclose restricted values, or if the task asks for whole-report/HTML generation.
- Return `needs_review` for high-impact causal/mechanistic wording, unresolved conflict, disputed identity, ambiguous disclosure, unsupported completeness language, or audience constraints that would require omission of material adverse evidence.
- If length constraints cannot fit both a conclusion and its material qualification, omit the whole narrative operation and create a review task rather than return a misleading short form.
- Unknown or failed statuses are legitimate wording inputs; do not treat them as generation failures.

## Continuation behavior

- The transactional unit is one narrative target plus all accepted objects required to preserve its material qualifiers and adverse evidence.
- Process targets in request order. A target is processed only after all its factual clauses have version references.
- On truncation, omit the incomplete target, list its target path/ID in `omitted_unit_ids`, and let trusted orchestration mint a cursor bound to accepted state and disclosure policy.
- Resume only after cursor authentication and exact matching to request/stage, accepted collection/object hashes, snapshot set, prior response, operations, next unit, page, nonce, and disclosure policy.
- Resume without rewriting accepted earlier wording unless the request explicitly asks for a versioned replacement.
- Completion means all requested wording targets received candidates or blockers; it does not mean a report was rendered, validated, or published.

## Task instruction

Translate only the supplied accepted scientific state into concise, calibrated wording at permitted narrative paths. Preserve every material scope condition, missingness state, failure, negative result, conflict, counterevidence, disclosure boundary, and validation limitation. Return patch candidates only and introduce no new fact.
