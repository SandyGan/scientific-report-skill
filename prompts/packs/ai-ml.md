# Domain fragment: AI/ML research

## Prompt declaration

- **Prompt ID:** `report_prompt.pack.ai_ml`
- **Version:** `0.2.0`
- **Purpose:** Add AI/ML-specific provenance and gates for dataset lineage, split independence, labels, leakage, preprocessing, trials, model selection, evaluation, calibration, random state, artifacts, and inference recipes while preserving failed trials and negative results.

## Required inputs

When `ai_ml` is enabled, in addition to core and selected-stage inputs provide when available:

- Raw-material/data-source identities, dataset snapshots/licenses/hashes, row/entity lineage, group keys, deduplication/homology/temporal/batch/structure/trajectory relations, and split manifests.
- Label source, rater/model, blinding, agreement, adjudication, uncertainty, and version records.
- Preprocessing/feature/augmentation/fitting steps and their train/validation/test scope and fitted-state artifacts.
- Baseline/model architecture, code tree/version/dirty patch, dependencies, pretrained source/weights/license, checkpoint, and configuration records.
- Search space, every trial/attempt (including failed/aborted/pruned), selection rule/timing, validation history, and test-access log.
- Root seed/derivation, worker/rank seeds, hardware/runtime, determinism settings/non-deterministic operators.
- Metric definitions, direction, thresholds, intervals, independent units, subgroup/calibration outputs, external evaluation, inference recipe, and smoke-test records.

## Structured outputs

Return only the shared patch-response JSON. When the canonical AI/ML payload is requested and `/extensions/domain_payloads` is explicitly permitted, append exactly one complete `ai_ml` payload at `/extensions/domain_payloads/-` with `object_type: "domain_payload"`; never authorize or mutate `/extensions` or a sibling extension key. Add AI/ML candidates/diagnostics appropriate to the selected stage, including:

- dataset-version and raw-material-to-row lineage, group/split assignments, exclusions, license/access states, and leakage findings;
- label provenance/uncertainty/adjudication and independence/dependence links;
- preprocessing fit/transform scope and artifacts;
- versioned code/model/checkpoint/pretraining lineage;
- append-only trial/search/selection/test-access histories and failed-trial records;
- random-state/environment/hardware/nondeterminism fields;
- metric/interval/subgroup/calibration/threshold/result candidates with unit and analysis-population context;
- inference recipe versus actual invocation and supplied smoke-test status, never a generated success claim;
- pack-gate findings and review tasks.

## Invariants

1. A dataset is pinned to a snapshot/version and license/access state when supplied. Similar names or row counts do not establish identity.
2. Preserve lineage from raw biological/material entities to dataset rows and from rows through preprocessing, split, model, prediction, and metric artifacts.
3. Split independence is assessed at the scientifically independent group key, not merely row ID. Donor/patient aliquots, sequence/homology clusters, structural templates, batches, trajectories and adjacent frames remain grouped where applicable.
4. Adjacent frames from one trajectory and derived augmentations/patches/tiles from one source are not independent train/test examples by default.
5. Stateful preprocessing/feature selection/normalization/imputation must have supplied evidence that fitting used training data only before leakage-free status is proposed.
6. Preserve label provenance, rater/model dependence, blinding, disagreements, adjudication, and uncertainty. Shared labels or label-generating models create dependence.
7. Preserve all trials, including failed, aborted, pruned, NaN/divergent, OOM, data-error, and non-reported trials. A selected checkpoint does not replace trial history.
8. Model selection rule and timing are explicit. Test access, test-driven thresholding, or repeated test evaluation remains visible and affects interpretation.
9. Different seeds/checkpoints/folds/models are not automatically independent evidence. Shared data, labels, pretraining, architecture, checkpoint ancestry, code, or selection creates dependence.
10. Metric values retain exact definition, direction, averaging, threshold, subgroup, interval, and independent analysis unit when supplied. Do not compare same-named metrics with incompatible definitions.
11. Random state includes derivation across worker/rank/process where supplied; a root seed alone does not prove determinism. Hardware and nondeterministic operators remain explicit.
12. Keep historical actual training/inference invocation distinct from a reproduction/inference recipe. A supplied smoke-test result is an evidence record; this prompt never runs it.
13. Performance does not establish biological mechanism, causal validity, fairness, deployment utility, or generalization outside evaluated data.
14. Negative/below-baseline results, calibration failures, subgroup failures, leakage findings, exclusions, and unavailable checkpoints remain formal evidence.

## Forbidden inferences

Do not infer:

- leakage-free status from a random split, separate files, or absence of a reported problem;
- group keys or row independence from row IDs;
- train-only fitting from standard pipeline conventions;
- label correctness, rater independence, blinding, or consensus from a final label column;
- dataset/license/hash/split contents from a name or manifest reference not supplied;
- trial completeness from the selected run or optimization summary;
- independence from multiple seeds/folds/models/checkpoints;
- determinism from setting one seed;
- architecture, hyperparameters, pretrained source, code cleanliness, environment, or hardware from defaults;
- statistical significance/generalization/causality/mechanism from a point metric;
- successful inference/smoke test from presence of a recipe or checkpoint;
- that a failed trial can be omitted because it did not contribute to the selected model.

## Failure behavior

- Return `cannot_complete` if the selected schema/roots cannot preserve split group lineage, failed trials, test-access history, label/model dependence, or disclosure-safe licenses/access fields.
- Return `needs_review` for possible donor/homology/trajectory/template leakage, unknown preprocessing fit scope, incomplete trial/test access history, unclear independent unit, shared-label/checkpoint dependence, disputed selection timing, incompatible metric definitions, or unavailable artifacts.
- Emit partial provenance with explicit unknowns/gates; never label a pipeline leakage-free, deterministic, independently validated, or reproducible without supplied support.
- Failed training/evaluation/inference attempts and negative/below-baseline metrics remain first-class outputs.

## Continuation behavior

- Use a complete ML evaluation lineage as the transaction: data snapshot/group split and label/preprocessing state through trial/selection/checkpoint, evaluation result, failures, and test access.
- Do not page a selected model separately from known failed trials, test accesses, leakage findings, or subgroup/calibration failures.
- On truncation, omit the incomplete dataset/model/evaluation unit and list its stable root ID.
- Resume against the same dataset/split/code/checkpoint/result versions; represent changed splits or reruns as new versions/attempts.
- Completion means pack fields/gates were evaluated for requested units, not that the trial registry is globally complete or any code was executed.

## Task instruction

Apply AI/ML provenance fields and gates to the selected stage. Model raw-to-row lineage, group-aware splits, labels, preprocessing scope, code/model/checkpoint versions, all trials and test accesses, random state, metrics/calibration/subgroups, recipes and actual invocations; retain leakage, failures, and negative results and return only shared candidate patches.
