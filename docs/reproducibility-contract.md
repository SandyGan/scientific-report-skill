# Reproducibility contract

This contract explains how to record and communicate replay readiness, verified replay, and independent reproduction. The normative requirements are in `protocol/reproducibility-policy.yaml`; the active reproducibility-unit schema, TypeScript types, validator, examples, and renderer use the same unit kinds, criticality values, axis states, event records, and conservative levels.

## Principles

1. **Assess bounded units.** Reproducibility is evaluated per `ReproducibilityUnit`, not assigned from a repository-wide impression.
2. **Separate history from recipe.** Evidence of what actually ran and a maintained instruction set for what should run again are distinct records.
3. **Separate readiness from execution.** Code, data, a container, or a plausible recipe can support readiness; none proves a rerun occurred.
4. **Separate replay from independence.** A same-team rerun under the same implementation boundary is not an independent reproduction.
5. **Keep experimental and computational independence distinct.** Independent computational reproduction and independent experimental replication answer different questions and must be labeled separately.
6. **Use conservative thresholds.** Unknown, partial, unsatisfied, inaccessible, or materially withheld prerequisites cap the level.
7. **Show denominators.** Every summary states which critical units, claims, and outputs were in scope.
8. **Retain failures.** Failed and inconclusive replay/reproduction events remain in history after a later success.

## Active serialization contract

The active `schemas/defs/reproducibility-unit.schema.json` is the lossless serialization surface for the normative model in this document. It retains the scoped title and boundary, canonical unit kind and criticality, axis assessments, historical invocations, recipe, comparison specification, append-only replay and independent-reproduction events, covered claim/output denominators, and the conservative level.

Retired foundation values—including `R1_replayable`, `R2_verified_rerun`, `R3_independently_reproduced`, `context`, and aggregate field-specific axis vocabularies—are not aliases. A payload using them requires an explicit versioned migration rather than name-based coercion. Structural acceptance still does not prove that an event occurred or that the declared evidence is adequate; semantic validation and qualified review remain separate gates.

## Reproducibility unit boundary

A reproducibility unit is the smallest scientifically meaningful computation, analysis, experiment, or transformation whose inputs, procedure, environment, outputs, and verification can be assessed together.

Supported unit kinds in the normative policy are:

- `data_acquisition`
- `material_preparation`
- `wet_lab_experiment`
- `data_transformation`
- `statistical_analysis`
- `model_training`
- `model_inference`
- `simulation`
- `trajectory_analysis`
- `figure_or_table_derivation`
- `integrated_workflow`
- `other_declared`

Criticality is `critical`, `supporting`, or `contextual`.

Split a unit when materially different actors, access conditions, environments, random-state requirements, comparison criteria, or independence boundaries apply. An “entire project” unit usually hides gaps; a one-command fragment that cannot produce a meaningful output is usually too narrow.

### Boundary examples

- Dataset preprocessing and model training should be separate if the preprocessing artifact can be versioned and reused, or if its data access differs.
- Training and inference should be separate when inference has a deployable recipe and distinct dependencies.
- MD production and trajectory analysis should be separate when engines/environments, random state, or comparison targets differ.
- A wet-lab protocol may require separate preparation and assay units if different sites, materials, instruments, or independence claims apply.
- A figure derivation may be a unit even when its upstream analysis is another unit, because the figure can introduce filtering, aggregation, or rendering transformations.

## Required unit record

The normative policy requires:

- `reproducibility_unit_id`
- `title`
- `unit_kind`
- `criticality`
- `scope`
- `covered_claim_ids`
- `covered_output_ids`
- `historical_invocation_ids`
- `recipe_id`
- `input_closure`
- `artifact_closure`
- `environment_record`
- `random_state_record`
- `access_assessment`
- `comparison_specification`
- `replay_events`
- `independent_reproduction_events`
- `axis_assessments`
- `conservative_level`

The active schema serializes this required record model directly. Units also connect to limitations, source bindings, revisions, and responsible review tasks as applicable. Schema presence is only the structural gate; the validator derives the highest level supported by the declared axis/event evidence and qualified reviewers assess scientific adequacy and independence.

## Axis assessments

Each applicable axis uses one of:

```text
satisfied | partial | unsatisfied | unknown | not_applicable | withheld
```

These states are not a numeric scale. `withheld` means the assessment is known internally but restricted in the current projection; it may still prevent public verification and cap the public level.

### 1. Provenance closure

**Question:** Are all source, input, transformation, intermediate, and output dependencies identified and integrity-bound?

Satisfied requires complete input and artifact closure, stable identifiers and integrity digests where feasible, and no unresolved dependency gaps.

Inspect:

- source-universe items and snapshots;
- input versions, row/query/frame/material selections;
- transformation and derivation records;
- intermediate/checkpoint dependencies;
- output artifact identities and hashes;
- correction/retraction state.

A final output hash without input/derivation identity is not complete closure.

### 2. Recipe fidelity

**Question:** Does the executable recipe represent the historical procedure?

Satisfied requires both a recorded historical invocation and a recorded recipe, plus a normalized comparison with no material unexplained difference.

Difference classes are:

- `identical`
- `nonmaterial_declared`
- `material_declared_and_justified`
- `material_unresolved`
- `comparison_impossible`
- `unknown`

A `material_unresolved` difference caps recipe fidelity at `partial` and caps the conservative level below `R1_replay_ready`.

Examples of potentially material differences include data snapshot, cohort/filter, code commit or dirty patch, default parameter, random-state derivation, force-field/engine version, protocol reagent or timing, precision/hardware path, and preprocessing fit scope. Materiality is a scientific decision, not a string-diff result.

### 3. Data and artifact access

**Question:** Can the scoped actor obtain every required input, checkpoint, intermediate, and output under stated conditions?

Satisfied requires `available_now` or `verified_procedure`, recorded license/ethics/permission conditions, and an integrity-verification method.

Access values are:

| Value | Meaning |
|---|---|
| `available_now` | Required material is included or reachable, and access was checked for the scoped actor. |
| `verified_procedure` | A tested access procedure exists although material is not bundled. |
| `controlled_access` | Approval or credentials are required and access is not verified for every intended actor. |
| `unavailable` | One or more required items cannot be obtained. |
| `unknown` | Access has not been established. |
| `not_applicable` | No external access is required for this unit. |
| `withheld` | Access details are known but restricted in this projection. |

Never embed credentials, secrets, personal data, signed temporary URLs, or restricted raw values in a public recipe or bundle.

### 4. Environment capture

**Question:** Are software, hardware-sensitive facts, configuration, and dependencies sufficient for the unit?

Consider, as applicable:

- operating system, architecture, runtime, package/lock or image identity;
- libraries, drivers, accelerator stack, firmware, compiler, and precision;
- locale, timezone, thread/parallelism settings, and environment variables that change results;
- instrument model, firmware, calibration, consumable/reagent context, ambient conditions;
- container definition and external host dependencies;
- nondeterministic behavior and unsupported platforms.

A container digest does not prove that external data, drivers, hardware, secrets, mounted files, or instrument conditions are captured.

### 5. Random-state capture

**Question:** Are all material sources of randomness and nondeterminism represented?

Satisfied requires a seed or justified `not_applicable` state; worker/rank/replica/fold/trial seed derivation when used; and disclosure of stochastic algorithms and nondeterministic operators.

A single top-level seed is `partial` when downstream states can diverge. Record seed-tree derivation, stream assignment, replica mapping, data-loader behavior, hardware nondeterminism, race conditions, and unseeded external services as applicable.

Unknown random state should remain unknown. Do not insert a new seed into the historical invocation; place it only in a revised recipe and record the fidelity difference.

### 6. Replay verification

**Question:** Was the recipe rerun and compared under the declared comparator?

Satisfied requires a completed replay event, matching input/recipe identity or declared differences, a comparator fixed before comparison, and an outcome that meets it.

A smoke test can be useful evidence but establishes replay verification only if the unit scope and comparator explicitly define that smoke test as the target. It does not verify unexecuted full-scale outputs.

### 7. Independent computational reproduction

**Question:** Did an independent actor or implementation reproduce the computational conclusion from the declared boundary?

Satisfied requires an evidence-bound independent actor and execution time, a distinct completed execution record, exact integrity-bound inputs, independently derived outputs, an independent environment or evidence-bound implementation boundary, explicit allowed shared inputs, an explicit random-state applicability decision and resolvable capture/justification, retained deviations and failures, and target-level comparison evidence under the declared machine-checkable comparator.

Independence is multi-dimensional. Record which of these are shared or independent:

- people/team and undocumented communication;
- implementation/codebase;
- environment and infrastructure;
- input data and preprocessing;
- labels, checkpoints, initial conditions, and parameter files;
- analysis code and comparator;
- source interpretation.

Different filenames, seeds, machines, or wrapper scripts do not by themselves establish independence.

### 8. Independent experimental replication

**Question:** Did an independent experimental unit repeat empirical work under a declared protocol and independence boundary?

Satisfied requires biological or experimental independence assessment, an evidence-bound actor/time, a distinct completed attempt with exact material/artifact inputs and independently derived outputs/results, material/protocol/environment correspondence and boundary, explicit random-state applicability, a complete deviation/failure ledger, and one target-level evidence artifact and comparator decision per declared target.

Specify whether independence concerns site, operator, donor/sample, material preparation, reagent lot, instrument, batch, analysis, or another boundary. A technical repeat or another aliquot from the same donor is not automatically independent biological replication.

### 9. Claim and output coverage

**Question:** What fraction of declared critical claims and outputs does the unit cover?

Satisfied requires explicit covered identifiers, numerator and denominator, and no unlisted critical target within the unit boundary.

Coverage is not inferred from directory presence. State, for example, “4/5 in-scope critical claims and 7/8 critical outputs,” then identify the uncovered IDs and their levels/blockers.

## Historical invocation

A historical invocation is evidence of what actually ran or was performed. Its minimum states cover:

- invocation ID;
- command or protocol steps;
- parameter values;
- start/end;
- exit or completion;
- environment binding;
- input bindings;
- output bindings.

Each may be known, unknown, not applicable, or withheld as allowed by the schema. A shell-history line without working directory, code/configuration identity, environment, inputs, and exit status is useful but incomplete invocation evidence. For wet lab work, an execution record and deviations are distinct from the protocol template.

Do not rewrite the historical invocation to match a clean recipe. Preserve what is known about the original, including broken commands, failed segments, implicit defaults, and missing values.

## Replay recipe

A recipe is a maintained instruction set intended for replay. Its minimum states cover:

- recipe ID and version;
- entry point or protocol;
- parameter values;
- environment binding;
- required inputs;
- expected outputs;
- verification steps.

A useful recipe additionally defines prerequisites, safe access procedure, resource requirements, order, time expectations, checkpoint/restart behavior, cleanup, failure indicators, and the comparator.

The recipe can improve on history, but improvements must be recorded as differences. “Reproducible in principle” is not a level.

## Comparison specification

A comparison must be interpretable before a rerun result is seen. The normative fields are:

- `comparator_id`
- timing classification;
- targets;
- equivalence definition;
- tolerances;
- allowed nondeterminism;
- failure conditions.

Comparator types are:

- `byte_identical`
- `canonical_record_identical`
- `numeric_tolerance`
- `distributional_equivalence`
- `scientific_acceptance_bounds`
- `manual_protocol_criteria`

### Comparator guidance

- Use byte identity only when deterministic byte output is genuinely expected; timestamps, archive order, and metadata can make it inappropriate.
- Canonical-record identity should name the canonicalization algorithm and fields excluded/included.
- Numeric tolerances need units, absolute/relative form, aggregation, missing-value handling, and per-target rules.
- Distributional equivalence needs independent-unit definitions, sample size/replicates, test/statistic, bounds, and multiplicity policy where relevant.
- Scientific acceptance bounds need domain justification, not a tolerance chosen to admit the observed rerun.
- Manual protocol criteria need accountable reviewers, observable criteria, timing, and conflict resolution.

A comparator chosen post hoc cannot establish unqualified `R2_verified_replay`. Record it as post hoc and downgrade/qualify the result.

## Replay event

Each replay event records:

- `replay_event_id`;
- executor;
- execution time;
- recipe version;
- environment binding;
- input bindings;
- actual invocation;
- exit/completion status;
- output bindings;
- comparator ID;
- comparison result;
- deviations.

Comparison result is `met`, `did_not_meet`, `inconclusive`, `not_run`, `unknown`, or `withheld`.

A completed process with missing outputs is not automatically a successful replay. A comparator result of `met` applies only to its declared targets and boundary. Failed and inconclusive events remain visible after a later `met` event.

## Conservative levels

Use the exact level names from the normative policy.

### `not_assessed`

The unit has not been assessed or required records are absent. This is not equivalent to failure and must not be silently excluded from a denominator.

### `R0_documented`

The unit is identifiable and its known provenance, historical procedure, outputs, and gaps are recorded, but it is not replay-ready.

All required:

- unit boundary is known;
- provenance closure is `satisfied`, `partial`, or `unsatisfied` with every known gap explicitly recorded;
- missing and access states are explicit.

`R0_documented` makes the gap inspectable; it does not imply that another actor can run the unit.

### `R1_replay_ready`

A scoped actor can replay the unit using a faithful recipe under declared conditions. No successful rerun is implied.

All required:

- provenance closure `satisfied`;
- recipe fidelity `satisfied`;
- data/artifact access `satisfied`;
- environment capture `satisfied`;
- random-state capture `satisfied` or `not_applicable`;
- comparison specification predefined or adaptive under a valid rule.

The actor and conditions are part of the claim. A recipe may be R1 for an authorized internal operator but not for a public reader.

### `R2_verified_replay`

An actual rerun completed and met the declared comparator for the scoped environment and inputs.

All required:

- all R1 requirements;
- replay verification `satisfied`;
- replay event evidence and outputs integrity-bound.

R2 is not an independent reproduction claim.

### `R3_independent_reproduction`

A declared independent computational reproduction or independent experimental replication met its predefined criterion.

All required:

- all R1 and R2 requirements;
- at least one independent computational reproduction or independent experimental replication event whose full traceability assessment passes;
- evidence-bound independent actor and execution time;
- one distinct completed invocation/attempt with exact resolvable inputs, independently identified integrity-bound outputs, and no reuse of the reference outputs as the reproduced outputs;
- a complete evidence-bound environment or implementation/protocol boundary;
- explicit random-state `applicable`/`not_applicable` classification with a resolvable execution-bound record and justification;
- explicit deviations, failure-event IDs, and evidence-bound failure assessment, including known empty ledgers;
- integrity-bound comparison evidence and exactly one machine-checkable comparison for each declared target artifact;
- independence boundary and shared dependencies explicit;
- claim/output coverage `satisfied` for the asserted decision-bound scope.

A schema-minimal event containing only `independent`/`met` labels, a comparator, an existing output artifact, and a generic source binding is capped at `R2_verified_replay` and raises REP004; labels cannot fill missing execution evidence.

Label R3 as computational reproduction, experimental replication, or both. Do not collapse the categories.

### Level derivation

Assign the highest level whose requirements are all satisfied. An axis that is `unknown`, `partial`, `unsatisfied`, or verification-preventing `withheld` caps the unit below the affected threshold. `not_applicable` is acceptable only when supported by an applicability rule.

A later failed replay does not erase an earlier event. It may change the current assessment if it reveals instability, invalidates assumptions, or means the current recipe no longer meets the comparator. Record the review decision and revision path.

## Summary contract

Select critical units through a decision record classified as predefined, adaptive, post hoc, missing, or not applicable. Missing timing remains visible and qualifies the summary.

The report summary must include:

- count of critical units by conservative level;
- conservative lower bound across critical units;
- critical claims covered / total critical claims;
- critical outputs covered / total critical outputs;
- access-condition distribution;
- independent computational and experimental results separately;
- counts for unknown, withheld, and not assessed.

The conservative lower bound is the minimum level among all in-scope critical units. With zero units it is `unknown` unless critical units are proven `not_applicable`.

Prohibited summaries include:

- weighted or averaged reproducibility scores;
- “fully reproducible” based only on code, a recipe, container, or one successful run;
- denominators that omit unavailable, unknown, withheld, failed, or inconvenient critical units;
- an R3 label without scope and independence category.

### Wording examples

Appropriate:

- “Of 6 critical units, 2 are R2, 3 are R1, and 1 is R0; the conservative lower bound is R0. Five of six critical claims are covered.”
- “Unit RU-4 is R1 for authorized institutional users; controlled data access has not been verified for public actors.”
- “RU-7 met its numeric comparator in a same-team rerun (R2); no independent reproduction was attempted.”
- “RU-9 achieved scoped independent computational reproduction for claims C12–C13, sharing the input dataset but using an independent implementation.”

Inappropriate:

- “The report is 85% reproducible.”
- “The analysis is reproduced because the repository builds.”
- “The experiment is independently replicated” when only technical repeats exist.
- “All results are reproducible” when the denominator excludes inaccessible or unassessed critical units.

## Failure and discrepancy handling

When a replay or reproduction does not meet its comparator:

1. retain the event and outputs;
2. check input, recipe, environment, random-state, and comparator identity;
3. record deviations without rewriting history;
4. determine whether the original claim, recipe, or comparator needs review;
5. create conflict/failure/revision records as applicable;
6. propagate impact to covered claims and question resolution;
7. define a new recipe or comparator version only through an explicit decision event;
8. keep the failed event after later attempts.

Do not tune tolerances until a failed output passes and then call the original comparator met.

## Attestation and integrity

Reproducibility assessments are scientific payload facts about recorded evidence. Validation status is separate. The validation-attestation schema records `payload_hash_basis`, `canonicalization`, `payload_byte_size`, `schema_set_hash`, validator identity, ruleset identity/hash, `severity_profile`, check results, and validation scope. `canonical-json-v1` uses `sorted-keys-utf8-v1`; `exact-file-bytes` uses `not_applicable_exact_bytes`. Consumers must compare hashes only when the declared basis and target bytes are the same.

Rules:

- any payload change invalidates an attestation whose digest no longer matches;
- an attestation reports checks, not real-world truth;
- a manifest hash detects file changes within manifest scope but, without trusted signing, does not prove publisher identity;
- generated audit/provider metadata does not upgrade or downgrade a reproducibility unit;
- a successful project test/build is not a replay event unless the unit explicitly targets that build/test output with a predefined comparator and complete bindings.

## Automated versus human assessment

Automation may verify:

- presence and references of required records;
- digest and manifest consistency;
- declared input/output closure;
- recipe/history machine-readable diffs;
- environment lock/image identity;
- random-state field presence;
- replay exit state and comparator calculations;
- conservative-level prerequisites;
- summary counts and denominators.

Human/domain review remains necessary for:

- whether a unit boundary is scientifically meaningful;
- materiality of recipe/history differences;
- sufficiency of environment capture;
- adequacy and prospective timing of comparison criteria;
- biological/statistical independence;
- scientific equivalence of outputs;
- whether a replicated result supports the same claim;
- access, consent, license, and ethics interpretation.

Do not describe a field-presence check as a scientific reproducibility test.

## Unit review checklist

- [ ] Boundary and criticality are justified.
- [ ] Covered claims/outputs and denominators are explicit.
- [ ] Source/input/intermediate/output lineage is closed or gaps are explicit.
- [ ] Historical invocation is separate from recipe.
- [ ] Recipe/history differences are classified and reviewed for materiality.
- [ ] Data/artifact access was assessed for a named actor under stated conditions.
- [ ] Environment and hardware/instrument dependencies are captured.
- [ ] Random state and nondeterminism are captured or validly inapplicable.
- [ ] Comparator was fixed before result comparison or is explicitly qualified.
- [ ] Every replay/reproduction event retains actual invocation, outputs, deviations, and result.
- [ ] Failed/inconclusive events remain visible.
- [ ] Independence and shared dependencies are explicit for R3.
- [ ] Experimental and computational independence are labeled separately.
- [ ] Conservative level is the highest level with all prerequisites satisfied.
- [ ] Summary lower bound and coverage denominators include this unit when in scope.
- [ ] Payload, attestation, and manifest identities match the release being reviewed.

## Current MVP boundary

The active contract defines and serializes levels through R3, and the validator checks declared prerequisites conservatively for each unit. That automation does not make the underlying execution evidence true or scientifically independent. Schema-valid R2/R3 records are not proof that a rerun or independent work happened: retain execution logs, outputs, comparator results, independence assessments, and qualified human review. Consult the active rule registry, attestation check statuses, and test scope to determine what was automated; preserve `unknown`, `partial`, `unsatisfied`, `withheld`, and `not_assessed` states instead of upgrading them by narrative.
