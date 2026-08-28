# Stage 04: model work and decisions

## Prompt declaration

- **Prompt ID:** `report_prompt.stage.model_work_and_decisions`
- **Version:** `0.2.0`
- **Stage code:** `S4_work_and_decision_modeling`
- **Implementation:** `prompt`
- **Purpose:** Transform complete typed, versioned, hash-bound orchestrator-accepted records into append-only Campaign → WorkUnit → Attempt → Segment histories and DecisionEvent candidates while preserving execution scope, completion evidence, failure history, and decision timing.

## Required inputs

In addition to all core-fragment inputs:

- Complete typed accepted collection snapshots relevant to activities, status, criteria, execution, timing, decisions, artifacts, failures, deviations, retries, corrections, and exclusions; every object includes its body, exact version/hash, and orchestrator acceptance/trust status.
- Existing Campaign, WorkUnit, Attempt, Segment, FailureEvent, DecisionEvent, and revision collection snapshots, including explicit accepted empty collections where applicable.
- Work-state/counting and decision-timing vocabularies/rules selected by the request.
- Project scope/cutoff, eligible project actors, supplied completion criteria, target-schema-valid patch roots, and verified continuation lineage.
- Supplied identity links or registry candidates; disputed identity links must remain unresolved.

## Structured outputs

Return the shared patch-response JSON. Candidate operations may propose:

- Campaign and WorkUnit objects with purpose, completion criteria/status, execution scope, actors, and source bindings;
- append-only Attempt and Segment objects with start/end/time missingness, actual status, parameters-by-reference, outputs, failure/deviation links, checkpoint/restart lineage, and disposition;
- FailureEvent and deviation records that remain linked after retry;
- DecisionEvent objects with options, decision, rationale evidence, actor, timing evidence, affected objects, and timing class (`prospective`, `adaptive`, `post_hoc`, `missing`, `not_applicable`, or schema equivalent);
- explicit completion-count eligibility and exclusions from counts;
- conflicts, missingness, and human-review tasks for uncertain identity, timing, completion, or ownership.

Do not replace whole histories. Parent additions precede child additions; references pin object versions when the schema supports versioning.

## Invariants

1. Work state is one of `planned`, `attempted`, `completed`, `not_performed`, or `unknown`; execution scope is separately one of `this_project`, `reanalysis`, `external_study`, `upstream_collaborator`, `synthetic`, or the selected schema equivalent.
2. `completed` requires an applicable completion criterion plus supplied evidence that the criterion was met. An output file name, manuscript claim, clean final figure, or successful later retry is not sufficient by itself.
3. An Attempt represents one actual try. A retry is a new Attempt. A restarted/continued interval is a Segment linked through supplied checkpoint/restart evidence; do not infer linkage from temporal proximity or matching names.
4. Failed attempts and failed/usable segments remain in history. An attempt may have usable early output and a later technical failure; model both without collapsing to a single success/failure flag.
5. Work performed externally/upstream is not counted as this project’s completion. Reanalysis is distinguished from generation of the original data.
6. A planned work unit with no performance evidence remains planned or unknown as supported; it does not become not performed merely at cutoff.
7. Decision timing is evidence-based. `prospective` requires a trustworthy timestamp/order showing the decision preceded access to the affected outcome; detailed rationale or a dated-looking document alone is insufficient.
8. Adaptive and post-hoc decisions retain triggers, knowledge available at the time, and affected analyses. Missing timing remains `missing` and creates review where material.
9. Decision histories are append-only. Later justification does not retroactively make a post-hoc decision prospective.
10. Corrections/retractions propagate review to dependent work status/counts; they do not erase the original event.
11. Stage 04 does not infer material identity, recompute results, adjudicate scientific claims, or rewrite narrative wording.

## Forbidden inferences

Do not infer:

- attempt/segment identity from similar labels, timestamps, directories, or parameters;
- completion from a methods description, planned checklist, non-error log excerpt, artifact reference, or “done” without a supplied completion basis;
- project execution from passive voice or external results;
- exact actor, timestamp, duration, command, parameter, exit status, or checkpoint relation from convention;
- prospective status from a protocol’s existence without reliable ordering and applicable version;
- independence of attempts/replicas because they have different IDs;
- that a retry invalidates, replaces, or hides the original failure;
- `not_performed` from absence of an attempt;
- successful validation/reproduction from a completed work unit.

## Failure behavior

- Return `cannot_complete` if accepted atomic records/state versions are unavailable, the schema cannot preserve multiple attempts/failures, or patching would require overwriting history.
- Return `needs_review` for ambiguous attempt/segment boundaries, disputed execution scope, insufficient completion basis, unclear restart lineage, unknown decision order, or conflicting actor/timestamp evidence.
- When evidence supports attempted but not completed, emit attempted plus completion missingness/review rather than fail the whole stage.
- Preserve both conflicting status statements and create conflict diagnostics; never select “completed” because it is more favorable or recent unless a supplied revision event explicitly governs.

## Continuation behavior

- The transactional unit is a WorkUnit with all supplied Attempts, Segments, FailureEvents, and DecisionEvents that affect its status/counting. Do not page a success separately from its known failed attempt.
- Follow supplied dependency order: parent campaign/work unit, then attempts, segments, failures, and decisions.
- On truncation, omit the incomplete WorkUnit graph and list its ID in `omitted_unit_ids`; do not mark any of its accepted premise records processed for this stage.
- Resume only when orchestration authenticates and matches the cursor to the same accepted collection/body versions and hashes, snapshots, prior response, operations, next unit, page, and nonce. New evidence requires explicit versioned revision rather than continuation.
- Completion is limited to the requested WorkUnit subset and does not assert that all project work has been discovered.

## Task instruction

Build evidence-bound, append-only work and decision histories from accepted atomic records. Separate work state from execution scope, require evidence for completion and prospective timing, retain every failure/retry/deviation, and return only granular candidate patches plus conflicts, missingness, and review tasks.
