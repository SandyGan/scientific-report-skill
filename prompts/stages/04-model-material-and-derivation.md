# Stage 05: model material lineage and quantitative derivation

## Prompt declaration

- **Prompt ID:** `report_prompt.stage.model_material_and_derivation`
- **Version:** `0.2.0`
- **Stage code:** `S5_material_and_derivation_modeling`
- **Implementation:** `prompt`
- **Purpose:** Build reviewable material/sample/data lineage and quantitative derivation closure from complete typed orchestrator-accepted evidence while preserving transformations, exclusions, failed runs, analysis populations, and actual-versus-recipe distinctions.

## Required inputs

In addition to all core-fragment inputs:

- Complete typed accepted collection snapshots concerning entities, materials, samples, datasets, transformations, analyses, invocations, environments, results, artifacts, failures, and exclusions; each object includes its body, exact version/hash, and orchestrator acceptance/trust status.
- Existing Entity/Material/MaterialRelationship, AnalysisPopulation, DataSlice, DerivationRecord, AnalysisRun, Invocation, Environment, RandomState, Artifact, EvidenceItem, result/failure, and revision collection snapshots, including accepted empty collections.
- Supplied identity assertions/mappings, unit rules, lineage/derivation policy, relevant domain-pack rules, target-schema-valid patch roots, and verified continuation lineage.
- Target quantitative results/claims or requested lineage roots whose closure is to be assessed.
- Actual historical invocation evidence and prospective reproduction recipes, clearly labeled as such when both are supplied.

## Structured outputs

Return the shared patch-response JSON. Candidate operations may propose:

- versioned entities/materials and typed lineage edges (created_from, aliquot_of, pooled_from, transformed_from, filtered_from, split_from, mapped_to, or schema equivalent);
- analysis populations with inclusion/exclusion criteria, units, and counts only when evidenced;
- DataSlice objects with input artifact/version, table/column/row/query/selection, filters, and hash state;
- DerivationRecord and AnalysisRun objects linking inputs, code/command, actual parameters, environment, random state, timing/exit status, outputs, failures, and artifact hashes;
- OutputArtifact and EvidenceItem links that close a supported path to a quantitative result;
- closure gaps, identity conflicts, recipe-versus-history differences, and review tasks.

Keep source-stated results distinct from independently recomputed values. This stage describes supplied derivation evidence; it does not execute a computation.

## Invariants

1. Material and data lineage is a directed, typed, evidence-bound graph. Each edge identifies source and target versions; uncertain identity becomes a proposed/disputed mapping, not a merge.
2. Pooling, splitting, aliquoting, augmentation, frame extraction, filtering, imputation, and aggregation are explicit transformations. They do not create independent biological/statistical units by default.
3. Analysis populations state the observation unit, independent unit, inclusion/exclusion rules, and denominator when known. Counts are not inferred from row/file/frame/well totals.
4. Preserve excluded and dropped material/records with reasons and decision timing. Do not model only the final analyzed subset.
5. A quantitative closure follows, where applicable: DataSlice → DerivationRecord → AnalysisRun → OutputArtifact → EvidenceItem → target result/claim. Missing links remain explicit gaps.
6. DataSlice selection is precise enough to distinguish analyses of different rows/frames/columns/filters even when they share a file.
7. Historical actual invocation and a reproduction recipe are separate objects. A recipe is not evidence of what was run; a historical log is not automatically a safe/current recipe.
8. Preserve failed/nonzero/interrupted AnalysisRuns and partial outputs. A successful rerun is an additional run linked to, not replacing, the failure.
9. Hashes, code versions, environment versions, commands, random states, timestamps, and paths are known only when supplied. Do not synthesize “typical” values.
10. Derived numeric candidates record inputs, operations, unit handling, rounding, and uncertainty propagation only when supplied or deterministically specified. Do not silently recalculate.
11. A lineage or derivation graph must not contain a causal cycle. Suspected cycle/aliasing is a conflict/review task.
12. Stage 05 does not assert reproducibility, independence, validation, or scientific interpretation solely because a chain is structurally closed.

## Forbidden inferences

Do not infer:

- material/entity equivalence from matching names, sizes, accessions, labels, sequences described as similar, or co-location;
- biological N from wells, aliquots, images, frames, rows, augmentations, folds, or technical replicates;
- selection/filter/query details from the final count or figure;
- actual commands/parameters/environments from a recipe, documentation, defaults, or output metadata unless explicitly recorded;
- successful run from presence of output, or complete output from zero exit status;
- input/output hashes, seeds, version, timestamps, or data access from references;
- independence of runs/outputs from different IDs;
- exact numeric derivation from matching displayed values;
- closure across a missing link by common practice.

## Failure behavior

- Return `cannot_complete` if target state versions are missing, identity/version semantics cannot be represented, the schema cannot retain exclusions/failed runs, or the request asks you to compute/inspect unprovided data.
- Return `needs_review` for disputed material mappings, ambiguous observation/independent units, incomplete population definitions, uncertain filter lineage, actual-versus-recipe ambiguity, hash/version mismatch, or graph cycles.
- Emit partial closure candidates and explicit gaps when safe; never fill a gap to make a chain look complete.
- Preserve negative evidence such as failed QC, empty outputs, failed analyses, excluded data, and unavailable artifacts in the graph/diagnostics.

## Continuation behavior

- The transactional unit is a complete connected lineage/derivation component for one requested target result or material root.
- Do not split a DataSlice from its known exclusion rules, an AnalysisRun from its failure/outputs, or a pool from its contributors across pages.
- On truncation, omit the incomplete component, list its target/root ID in `omitted_unit_ids`, and let trusted orchestration mint a cursor bound to every accepted object body/version/hash used.
- Resume only after exact orchestrator verification of shared lineage and accepted premise hashes; do not duplicate edges/objects, and represent newly supplied evidence as explicit versioned revisions.
- Completion means every requested component was modeled or assigned explicit gaps; it does not mean derivation closure or reproducibility was achieved.

## Task instruction

Construct evidence-bound material, analysis-population, DataSlice, derivation, run, and artifact graphs for the requested targets. Keep actual history separate from recipes, retain exclusions and failed/partial runs, refuse unsupported identity or counts, and emit granular candidate patches with explicit closure gaps and review tasks.
