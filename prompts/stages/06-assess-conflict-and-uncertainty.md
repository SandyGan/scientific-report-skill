# Stage 07: assess conflict and uncertainty

## Prompt declaration

- **Prompt ID:** `report_prompt.stage.assess_conflict_and_uncertainty`
- **Version:** `0.2.0`
- **Stage code:** `S7_conflict_and_uncertainty`
- **Implementation:** `prompt`
- **Purpose:** Identify and model true conflicts, contextual heterogeneity, uncertainty, missingness, and revision impacts from complete typed accepted state without flattening divergent evidence or adjudicating beyond supplied rules.

## Required inputs

In addition to all core-fragment inputs:

- Complete typed accepted `results`, `claims`, `evidence_items`, `limitations`, and `revision_events` collection snapshots plus relevant work/material/derivation/argument/conflict collections; every collection/object has exact version/hash and orchestrator acceptance/trust status.
- Requested comparison groups/claim targets, target-schema-valid patch roots, and verified continuation lineage.
- Supplied context dimensions and estimand definitions: entity/version, population/system, condition, intervention/exposure, comparator, endpoint, time window, analysis population, unit, and method.
- Accepted uncertainty representations and any explicit adjudication rules/DecisionEvents.
- Revision/correction/retraction events and dependency links relevant to the requested targets.

## Structured outputs

Return the shared patch-response JSON. Candidate operations may propose:

- ConflictSet objects containing incompatible values/claims for the same materially aligned context and estimand;
- HeterogeneityGroup or qualified-result candidates when direction/value differs because a meaningful context dimension differs;
- uncertainty records for measurement, sampling, model, label, parameter, structural, numerical, provenance, and decision uncertainty only as supported;
- missingness and interpretability updates;
- correction/retraction impact propagation to downstream objects;
- explicit resolution state (`unresolved`, `provisionally_resolved`, `resolved_by_supplied_decision`, or schema equivalent), resolution basis, and retained alternatives;
- review tasks and claim qualification/blocking operations.

Preserve each source value/claim and its provenance. A conflict set is an overlay, not a destructive merge.

## Invariants

1. A true conflict requires materially aligned subject/entity version, context, estimand, endpoint, units/scale, and relevant time; values/claims must be mutually incompatible after only explicitly authorized normalization.
2. Opposite directions at different doses, conditions, populations, constructs, time points, analysis populations, or methods are heterogeneity unless the stated claim incorrectly spans those differences.
3. Both conflict and heterogeneity preserve every contributing result, including negative, excluded, superseded, or sensitivity-only dispositions.
4. Never average, vote, choose the latest, choose the most favorable, or select the most precise value to resolve a conflict unless a supplied adjudication rule/DecisionEvent authorizes it and its timing is represented.
5. Quantitative uncertainty is copied from accepted evidence or explicit derivation. Do not invent confidence intervals, error bars, distributions, probabilities, or qualitative confidence scores.
6. Unknown uncertainty is not zero uncertainty. Missing intervals, controls, sample independence, MDE, convergence evidence, or provenance become explicit gaps.
7. `do_not_reject_null` is not proof of no effect; `no_detectable_effect` is not equivalence; zero/absence cannot be biological counterevidence when interpretability/control sensitivity is insufficient.
8. Technical failure, scientific effect, statistical decision, interpretability, and record disposition remain orthogonal.
9. Resolution retains the original alternatives, decision basis, actor/timing when supplied, and downstream impact. “Resolved” does not erase history.
10. Corrections/retractions invalidate or flag dependent claims/results according to version-pinned dependencies; they do not silently replace source evidence.
11. Completeness/uncertainty statements remain scoped to the declared source boundary.
12. This stage does not create new results, rerun analyses, inspect artifacts, or write reader-facing narrative.

## Forbidden inferences

Do not infer:

- same estimand/context from matching metric or endpoint names alone;
- unit conversions, direction reversals, alignment, or comparability when conversion/mapping rules are not supplied;
- conflict resolution from frequency, recency, source prestige, confidence of wording, or graphical prominence;
- uncertainty magnitude from sample size alone or from typical domain practice;
- effect absence/equivalence from non-significance or zero point estimate;
- model/replicate independence from separate labels;
- that an excluded/retracted result never existed or carries no historical impact;
- that heterogeneity is noise to be averaged away;
- that a supplied reviewer preference is prospective unless timing evidence establishes it.

## Failure behavior

- Return `cannot_complete` if comparison context/estimand dimensions are unavailable, accepted object versions cannot be pinned, or the schema cannot preserve all alternatives and resolution history.
- Return `needs_review` for uncertain alignment, ambiguous units, disputed identity, insufficient adjudication timing, possible dependence, unclear conflict-versus-heterogeneity classification, or high-impact resolution.
- When safe classification is impossible, preserve both items, mark alignment dimensions unknown, and create a review task; do not force either conflict or compatibility.
- Unreadable/inaccessible evidence and failed controls remain explicit uncertainty/coverage limitations.

## Continuation behavior

- The transactional unit is a full comparison set: all known items for one target estimand/context plus alignment, adverse evidence, resolution history, and dependency impacts.
- Process sets in deterministic target order. Do not page favorable evidence separately from contradictions.
- On truncation, omit the incomplete set, list its set/target ID in `omitted_unit_ids`, and let trusted orchestration mint a cursor bound to every member object version/hash.
- Resume only after exact cursor authentication and lineage matching; changed accepted evidence requires explicit revision rather than implicit reclassification.
- Completion means all requested comparison sets were assessed or blocked; unresolved conflicts and unknown uncertainty are valid complete-stage outcomes.

## Task instruction

Compare accepted results and claims only after explicit context/estimand alignment. Model incompatible aligned values as conflicts, meaningful context differences as heterogeneity, preserve every alternative and adverse record, expose uncertainty/missingness and revision impacts, and emit patch candidates without unsupported adjudication.
