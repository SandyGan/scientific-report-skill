# Stage 09: author reproducibility records

## Prompt declaration

- **Prompt ID:** `report_prompt.stage.author_reproducibility`
- **Version:** `0.2.0`
- **Stage code:** `S9_reproducibility_authoring`
- **Implementation:** `prompt`
- **Purpose:** Author bounded reproducibility units, recipes, comparison specifications, replay-event candidates, conservative levels, and explicit gaps for every independently inventoried key computation without claiming execution, verification, access, or release eligibility.

## Required inputs

In addition to all core-fragment inputs:

- A non-null `computational_work_inventory` with immutable inventory ID/version/hash and an independent ordered denominator of every key/supporting computation. An applicable inventory has at least one complete computation target; non-applicability requires a bound applicability decision.
- Complete typed accepted collection snapshots for `derivations`, `invocations`, `environments`, `random_states`, `analysis_runs`, `artifacts`, `results`, and existing `reproducibility_units`; each collection/object includes exact version/hash and orchestrator acceptance/trust status, including explicit accepted empty collections.
- Accepted work units, claims, outputs, data slices, recipes, access records/attestations, comparator definitions, and replay/independent-reproduction event evidence relevant to each computation.
- The exact reproducibility policy/profile, target-schema-valid `/reproducibility_units`, `/limitations`, and `/review_tasks` authorization as applicable, and initial or verified continuation lineage.
- Historical invocation evidence and prospective recipe content as separate accepted objects. An ID or label without resolvable versioned content is not a recipe.

## Structured outputs

Return the shared canonical patch-response JSON with non-null `reproducibility_coverage`. For each `computational_work_inventory.key_computations` member, emit exactly one disposition:

- `unit_authored`: cite one or more candidate operations that add/replace a complete schema-valid `ReproducibilityUnit` and name its ID;
- `gap_recorded`: cite candidate operation(s) that preserve a reproducibility limitation/review task and provide a specific non-empty justification;
- `not_applicable`: provide a non-empty justification and applicable decision ID.

`uncovered_computation_ids` contains every inventory computation without exactly one valid disposition. A response with uncovered computations cannot use `status: "ok"`.

A reproducibility-unit candidate records, where applicable:

- bounded covered work/run/claim/output IDs and criticality fixed by the independent inventory;
- historical invocation and resolvable versioned recipe content as distinct records;
- complete input/output artifact closure and access conditions/authority;
- environment and random-state records or justified applicability;
- a comparator-specific comparison specification, predefined/adaptive/post-hoc timing, target IDs, equivalence definition, tolerances, allowed nondeterminism, and failure conditions;
- replay and independent-reproduction event candidates only when complete supplied event evidence exists;
- axis assessments derived from records, conservative level/reason, and explicit limitations.

## Invariants

1. Coverage denominator comes only from the supplied independent computational-work inventory. Relabeling/omitting a weak computation cannot remove it or raise a conservative floor.
2. Every inventoried computation receives exactly one `unit_authored`, justified `gap_recorded`, or applicability-bound `not_applicable` disposition. Duplicate, unknown, or missing IDs remain uncovered.
3. A unit is bounded to explicit work/run/claim/output targets and exact accepted premise versions/hashes.
4. R1 or higher cannot follow from recipe IDs, command labels, empty dependency lists, unknown access conditions, nullable environment/random state, or prose assertions. Resolvable content and complete historical/replay context are required by the applicable policy.
5. Historical actual invocation and prospective recipe remain separate. Never reconstruct the historical command/environment/inputs from recipe defaults or reconstruct a recipe from a historical label alone.
6. Access assessment enumerates dependencies and scoped actor, conditions/procedure, evidence, authority/license where relevant, and reconciliation to accepted artifacts. `unknown`, empty, or vacuous procedure does not satisfy access.
7. Comparison semantics are comparator-specific and complete. A bare `met` label never establishes R2; target-level hash-bound evidence and supplied machine-comparison result are required.
8. Axis assessments are canonical. Availability/status of a bound record is diagnostic and cannot substitute for an unsatisfied axis.
9. Replay or independent reproduction is an accepted event only when invocation, inputs, outputs, environment, random state/applicability, comparator, target evidence, timestamps/actor, and outcome are fully represented.
10. Conservative level is the minimum level justified by every required axis and critical target, not the most favorable record.
11. `gap_recorded` preserves uncovered scientific/reproducibility work as a limitation/reviewable blocker; it does not pretend a unit exists or a release gate passed.
12. This stage authors candidate records only. It does not execute recipes, access artifacts, rerun analyses, compute comparisons, independently reproduce work, validate semantics, or make release decisions.

## Forbidden inferences

Do not infer:

- recipe content, invocation arguments, working directory, inputs/outputs, environment, random state, or dependency closure from an ID/name/label;
- artifact availability or access procedure from a path, URL, checksum, “public” label, or empty assessed list;
- R1 from a resolvable-looking recipe without complete replay context;
- R2 from `comparison_result: "met"` without defined comparator semantics, tolerances, nondeterminism policy, event context, and bound comparison evidence;
- independent reproduction from a rerun by the same actor/system or from different record IDs;
- target coverage from the set of already authored units;
- `not_applicable` merely because evidence is absent or a computation is inconvenient to reproduce;
- that a prompt response, structurally complete unit, or gap disposition is validation or release success.

## Failure behavior

- Return `cannot_complete` with no scientific candidate operations when the computational-work inventory is missing/hash-invalid, required accepted collection snapshots or full bodies are absent, target roots are invalid, or cursor verification fails.
- Return `needs_review` with explicit uncovered IDs when any inventory computation lacks exactly one valid disposition, criticality/target identity is disputed, recipe/history roles are ambiguous, access/dependency scope is unknown, comparator semantics are incomplete, or evidence cannot support a conservative level.
- Unknown/empty access procedure, unresolved recipe content, missing invocation/input/output/environment/random-state context, or absent comparator evidence caps the candidate conservatively and records a gap; never fill it from convention.
- A `gap_recorded` disposition requires an actual limitation/review candidate operation. Prose coverage bookkeeping alone is insufficient.
- A computational report with undispositioned key work remains externally release-blocked; this prompt cannot waive that semantic gate.

## Continuation behavior

- The transactional unit is one inventoried computation plus its complete unit or gap/non-applicability disposition, all premise/source bindings, and every limitation/review operation.
- Process computation targets in inventory order, preserving independent criticality and denominator. Never page covered/easy computations ahead of known gaps to report a favorable interim floor.
- On truncation, omit the whole incomplete computation unit and list its ID in `omitted_unit_ids`; `reproducibility_coverage.uncovered_computation_ids` remains honest for the bounded response.
- A trusted wrapper attaches a next cursor and verification bound to inventory hash, accepted-state hash, request/stage, snapshot set, prior response, accepted operation set, next computation, page, and unused nonce.
- Resume only after exact authentication/matching. A changed inventory, accepted premise, profile, or operation set requires a fresh stage request rather than implicit continuation.

## Task instruction

Reconcile every independently inventoried computation to exactly one complete candidate reproducibility unit, explicit justified gap, or applicability-bound non-applicability decision. Preserve recipes/history/access/comparator/replay semantics, derive only conservative levels, expose uncovered IDs, and return shared candidate patches without executing or claiming verification.
