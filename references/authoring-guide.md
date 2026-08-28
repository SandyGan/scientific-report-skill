# Authoring guide

This guide describes how to assemble a report without converting missing information, plans, external work, or model suggestions into project facts. The JSON Schemas and protocol files are jointly required: protocol files define scientific meaning, while schemas define the active serialization. Field names and exact required properties must follow the schema version named by the report, and no schema field may be used to weaken a protocol invariant.

## Contract-coherence preflight

Before authoring, inspect `reviews/zero-based/INTEGRATION_BLOCKERS.md` for the closure record and check whether any later change reintroduced a protocol/schema/runtime disagreement. The active v1 surfaces use one vocabulary for public-withheld provenance, applicability decisions, source coverage, attempt/segment outcomes, result axes, claim graphs, reproducibility units, validation hash basis, and human-review outcomes. This alignment does not establish that a particular payload is scientifically correct or release-ready.

If an applicable mismatch remains:

1. preserve the source facts in a non-lossy private working record;
2. do not invent enum mappings or tuck the missing meaning into free text;
3. open a contract-resolution/migration task that covers protocol, schema, rules, types, fixtures, and rendering;
4. do not issue a conformant public payload, passing attestation, reproducibility level, or release approval for the affected surface.

A schema-valid draft object is not a substitute for protocol conformance, and a protocol-complete object that the active schema rejects is not a releasable payload.

## Authoring roles

At minimum, assign these responsibilities explicitly, even if one person fills several roles:

| Role | Responsibility |
|---|---|
| source custodian | Defines the source universe, access rules, snapshots, and source dispositions. |
| scientific author | Normalizes the scientific records and maintains source bindings. |
| domain reviewer | Reviews identity, design, methods, controls, analyses, interpretations, and domain-specific gates. |
| disclosure reviewer | Approves the public projection and checks restricted/withheld material. |
| release operator | Runs validation, rendering, bundling, and verification for the exact release inputs. |
| independent reproducer, when applicable | Executes a scoped recipe without relying on undocumented author knowledge and records deviations/results. |

A model or parser may assist a role but does not hold responsibility or approval authority.

## Before authoring

1. Choose the schema version and pin it in the report.
2. Define the project and report IDs and the report revision policy.
3. State the scientific scope, organizational boundary, source classes, and cutoff.
4. Choose the report mode and enabled domain modules.
5. Define who may access private authoring material and who approves disclosure.
6. Decide which inventory is authoritative. If none is authoritative, declare a registered-only universe immediately.
7. Preserve immutable copies or content identifiers for source snapshots where policy permits.

Do not begin by drafting a narrative summary. Build the evidence ledger first.

## Step 1: establish the source universe

Create the inventory against which coverage will be reported. Include sources that may contain failures, exclusions, null results, corrections, or inconvenient counterevidence—not just sources expected to support the favored interpretation.

Typical source classes include:

- ELN entries and protocol records;
- sample sheets, instrument runs, acquisition logs, and QC reports;
- cluster jobs, command histories, notebooks, pipeline logs, and scheduler metadata;
- dataset snapshots, split manifests, training trials, checkpoints, and test-access logs;
- structures, topology/build inputs, trajectories, checkpoints, restarts, and analysis outputs;
- manuscripts, publications, corrections/retractions, correspondence, and qualified human attestations.

For each source item:

1. assign a stable source ID;
2. record version/content identity and safe locator;
3. record ownership, access, license, and disclosure constraints;
4. choose exactly one current disposition;
5. give a reason for any non-included disposition;
6. keep unreadable/inaccessible diagnostics factual and non-speculative;
7. link duplicates to the retained item with a comparison basis.

If an eligible source is found later, add it and revise the coverage denominator. Do not quietly replace the original snapshot.

### Coverage language

Use language proportional to inventory authority:

- permitted with an authoritative, reconciled inventory: “All 24 items in source-universe snapshot S3 were dispositioned.”
- permitted with a registered-only inventory: “All 18 registered items were dispositioned; overall source completeness is not provable.”
- not permitted without evidence: “This report includes all experiments and analyses.”

## Step 2: declare section applicability

Create `applicability_decisions` and `section_coverage` before filling domain objects. Every module and section state references a decision record. A decision names its target, rule, result, evaluated context, evidence bindings, and decision time. Every field envelope whose state is `not_applicable` also carries the matching `applicability_decision_id`.

Rules:

- an empty array does not mean not applicable;
- “not measured” is usually an applicable unknown, not `not_applicable`;
- `not_applicable` requires a matching decision whose result is `not_applicable`, whose target covers the exact field/section/module, and whose evidence establishes the governing context;
- `undetermined` is the correct decision result when required applicability context is missing or conflicting;
- a section with no positive result may still contain attempts, failures, exclusions, or limitations;
- disabling a domain pack does not disable applicable core integrity rules.

## Step 3: create the report frame

Author root identity and scope fields first:

- `report_id`, `project_id`, `report_version`, and `schema_version`;
- title and language;
- report mode;
- scope and cutoff;
- applicability-decision ledger;
- module manifest;
- source and section coverage.

Keep validation/build state out of this payload. Keep provider, model, token, and generation-run metadata in an optional peripheral audit only.

## Step 4: author explicit missingness

For every applicable source-derived field, ask four questions in order:

1. Is the value known from a source or closed derivation?
2. If not, does the field still apply?
3. If known, is disclosure allowed in this projection?
4. Is provenance complete, partial, or absent?

Use the resulting `known`, `unknown`, `not_applicable`, or `withheld` envelope. Never use `""`, `TBD`, `N/A`, a guessed default, or a plausible value inferred from standard practice.

Illustrative envelope, subject to the field's exact schema:

```json
{
  "state": "unknown",
  "value": null,
  "source_bindings": [],
  "derivation_bindings": [],
  "missing_reason": "The registered run log does not record the seed.",
  "provenance_status": "absent"
}
```

A missing reason should state what is absent and where the search was bounded. It should not speculate about the missing value. For `not_applicable`, add `applicability_decision_id` to the envelope and ensure that ID resolves to a root decision with `result: "not_applicable"` for the exact target; a reason string alone is insufficient.

For `withheld`, author the private value only in an approved private representation. The public envelope has a null value, no protected source or derivation bindings, a non-sensitive reason code and disclosure-decision ID, and `provenance_status: "absent"`; that public provenance state records removal from the projection, not private ignorance. Do not paste masked fragments, reversible encodings, revealing locators, or private absolute paths into public fields.

## Step 5: normalize entities without premature merging

Register versioned entities for relevant biological materials, constructs, samples, cohorts, datasets, structures, models, simulation systems, instruments, environments, and artifacts.

For each identity:

- retain source-native labels as aliases, not canonical truth;
- record versions, accessions, sequence/build hashes, and transformations when known;
- distinguish a physical item from a data representation of it;
- distinguish donor, sample, aliquot, well, pool, row, frame, and analysis unit;
- preserve uncertainty about identity;
- create review tasks for ambiguous merges, splits, relabeling, or cross-domain correspondence.

Do not merge entities merely because names are similar. Do not count aliquots, frames, or repeated measurements as independent biological units unless the design supports that unit of independence.

## Step 6: reconstruct work history

Model execution as append-only `Campaign -> WorkUnit -> Attempt -> Segment` history.

### Work units

For each work unit, record:

- objective and associated question(s);
- execution scope (`this_project`, `reanalysis`, `external_study`, `upstream_collaborator`, or `synthetic`);
- completion criteria;
- current work state;
- supporting source bindings;
- attempts and dependencies;
- limitations and review tasks.

### Attempts and segments

For each attempt and segment, record actual evidence of start/end, invocation/method, inputs, parameters, checkpoints, outputs, exit state, deviations, failures, and any usable partial result.

Rules:

- detailed planned methods do not establish an attempt;
- past tense in prose does not establish completion;
- `completed` requires applicable completion criteria and evidence;
- external completion does not count as this-project completion;
- a retry is a new attempt or segment and never overwrites the earlier failure;
- a `partially_succeeded` or `cancelled_after_start` attempt with a recoverable/major/blocking `FailureEvent` remains a material retry predecessor; a later success needs a recovery/supersession chain, or a typed `not_a_retry` relation with a known immutable source-bound rationale;
- a run may have a usable early output, later technical failure, primary-analysis exclusion, and sensitivity-analysis inclusion simultaneously.

When execution is ambiguous, use `unknown` or `attempted` as supported and create a review task. Do not select the more favorable state.

## Step 7: record methods and decisions with timing

Separate:

- method as planned;
- method actually applied;
- implementation default documented by software/protocol;
- actual value observed in logs/configuration;
- deviation or amendment;
- replay recipe proposed later.

For prospective, adaptive, and post hoc decisions, record the decision event, evidence that establishes timing, author/authority, affected scope, and rationale. A document creation timestamp is not automatically credible prospective evidence.

Human confirmation is required when decision timing is disputed, especially for exclusion rules, outcomes, thresholds, stopping, model selection, and analysis populations.

## Step 8: close material and data lineage

Represent transformations from origin to analysis:

```text
source material
  -> derived sample/construct/system
  -> acquisition or simulation
  -> raw artifact
  -> preprocessing
  -> DataSlice / analysis population
  -> AnalysisRun
  -> output artifact
```

At each boundary, record identities, versions, selection/filtering, losses/exclusions, joins, and hashes where available.

### Wet-lab checks

- Distinguish species, cell line, donor, sample, aliquot, well, pool, batch, and experimental/observational/analysis unit.
- Record construct/sequence versions, reagent identifiers/lots, passage/authentication/mycoplasma status, controls, randomization, blinding, calibration, and protocol deviations as applicable.
- Give each `ReplicateDesign` an explicit `specimen_ids` denominator scoped to its own work unit/payload. Reconcile technical N to those exact members and biological N to their resolved independent donor/material ancestry; never count specimens from another design.
- Do not count a pool as several biological replicates.

### AI/ML checks

- Record dataset snapshot, license, group keys, split manifest/hash, row lineage, labels/rater/adjudication, deduplication, leakage tests, train-only fitting of stateful preprocessing, trial history, selection rule, and test-access history.
- Reconcile every `selected_trial_id` to its completed trial and model. The selected-role model set must equal typed source-bound `selection_derivation` outputs; ensembles and post-search transformations need their explicit typed rule.
- Keep failed trials and shared upstream dependencies.
- Do not split a donor's aliquots or adjacent frames from one trajectory across train/test as independent examples.

### Molecular-dynamics checks

- Record structure/accession/assembly/model/chain versions, residue/atom mapping, build edits, protonation, force-field and parameter hashes, solvent/ions/box, integration and ensemble controls, replica/seed tree, checkpoints/restarts, and analysis frame slices.
- Preserve segment history after a crash or parameter change.
- Represent any affirmative convergence/sampling-adequacy conclusion with a typed assessment, known burn-in, autocorrelation/correlation-time, effective sample sizes, criteria, diagnostics, at least two resolved replica results, and heterogeneity. Wording such as “adequately represents all observables” does not bypass missing records.
- Do not claim convergence from a single RMSD plateau.

## Step 9: author results on orthogonal axes

For every result, separately record:

- scientific effect class;
- statistical decision;
- interpretability status;
- record disposition;
- estimation context, units, uncertainty/interval, and analysis population;
- source/derivation links;
- related failure events.

Examples of distinctions to preserve:

- `do_not_reject_null` is not `no_detectable_effect` by definition;
- `no_detectable_effect` is not equivalence;
- an interpretable null result can still be excluded from the primary analysis under a recorded rule;
- a technically failed attempt may still yield a qualified early segment;
- an excluded record remains searchable and reviewable.

A negative result supports biological counterevidence only when controls, QC, assay sensitivity/detection limits or MDE, intervals, and any equivalence bounds are adequate for that interpretation. Name the applicable typed control, QC, analysis-context, and analysis-population records explicitly; aggregate “passed” flags do not compensate for nonexistent IDs, records from another work unit, or concrete failed controls/QC.

## Step 10: record failures and exclusions

Search explicitly for failure language and artifacts: non-zero exits, contamination, failed controls, dropout, corrupted files, divergence, NaNs, out-of-memory, interrupted jobs, unusable images, model collapse, leakage, invalid calibration, excluded runs, and withdrawn results.

For each event, record:

- what failed and when;
- detection evidence;
- affected objects and outputs;
- whether any partial result remains usable and why;
- response, retry, or parameter change;
- effect on primary/sensitivity analyses and claims;
- unresolved follow-up.

Do not treat “eventually succeeded” as a reason to omit the failed history.

## Step 11: close quantitative derivations

For each quantitative result or claim, trace:

```text
DataSlice -> DerivationRecord -> AnalysisRun -> OutputArtifact -> EvidenceItem -> Claim
```

Verify that:

- the exact input version and selection can be identified;
- filters, joins, preprocessing, units, and formulas are recorded;
- the actual code/configuration and invocation are distinguished from a proposed recipe;
- environment and random state are known or explicitly missing;
- run status and outputs are identified and, where possible, hashed;
- the evidence excerpt matches the artifact and the claim's context.

If closure is partial, represent it as partial and constrain the claim. Do not bridge a missing step with prose such as “standard analysis was performed.”

## Step 12: build the claim and argument graph

Write atomic claims only after results and evidence exist. For each claim:

1. state one proposition with population/system, condition, time, and scope;
2. identify direct supporting and challenging evidence;
3. add explicit argument steps for non-direct inferences;
4. record dependencies and shared upstream sources;
5. record uncertainty, limitations, and alternative explanations;
6. create a cross-domain bridge when moving between domains or entity representations;
7. assign a review state proportional to evidence.

Do not count repeated descendants of one dataset, label set, checkpoint, trajectory, biological group, material ancestry, analysis population, or source as independent evidence. Distinct result or population IDs do not establish independence when their ancestry overlaps.

A direct association/co-occurrence statement may support an associational claim, but it cannot by itself support a causal/mechanistic claim or resolve a causal question. Those conclusions require an admissible `ArgumentStep` with a known rationale, explicit known assumptions, explicit known alternative explanations, and supported premises. Determine cross-domain scope over the full cycle-safe premise-claim closure; if MD and wet-lab premises meet only at a conclusion step, that exact step still needs a valid bridge.

### Conflicts versus heterogeneity

Create a conflict set when records make incompatible claims about the same context and estimand. Use `retained_as_heterogeneity` only when each incompatible pair has a typed, known, immutable source-bound material difference in a named context dimension. Opposite results with the same estimand, population, condition, time/frame, and analysis context remain a true conflict; a narrative relabel is not adjudication. Do not choose the favored number by deleting the other record. Final adjudication of material conflicts is a human decision.

## Step 13: assess questions and write controlled wording

For each research question:

- identify its resolution criteria and timing (`predefined`, `adaptive`, `post_hoc`, `missing`, or `not_applicable`);
- map criteria to valid claims;
- expose the strongest counterevidence, conflict, and provenance gap;
- assign `resolved`, `partially_resolved`, `unresolved`, `not_addressed`, or `not_evaluable` conservatively;
- write a qualified answer that does not exceed the graph.

A controlled-wording stage may transform validated facts into reader-friendly text. It must not introduce new numbers, sources, citations, identities, or conclusions. Compare every generated sentence back to the canonical objects.

## Step 14: define reproducibility units

Create a unit for each critical computation, derivation, figure/table, model inference, simulation analysis, or experimental repeat that readers may need to evaluate.

Record:

- target outputs/claims and coverage denominator;
- input and source closure;
- historical invocation;
- replay/repetition recipe;
- differences between recipe and history;
- code, environment, random state, hardware/non-determinism;
- access/license conditions;
- acceptance criteria;
- rerun/repeat evidence and independence;
- output comparison and unresolved blockers.

Never promote a unit because a recipe looks plausible or because an event merely labels itself `independent` and `met`. R3 requires all R2 prerequisites plus an evidence-bound independent actor/time, a distinct completed execution record, exact inputs, independently derived outputs, a complete environment or implementation/protocol boundary, an explicit random-state applicability decision and capture/justification, retained deviations and failures, integrity-bound comparison evidence, and one machine-checkable comparison for every declared target. Incomplete independent events are capped at R2 and must raise review findings. See [Reproducibility contract](reproducibility-contract.md).

## Step 15: project for disclosure

Perform disclosure as a separate, reviewable transformation.

1. Choose the disclosure profile.
2. Identify restricted values, locators, paths, identifiers, filenames, audit records, and embedded metadata.
3. Produce the public projection. Array-member omission pointers refer to original source indexes; the projector applies siblings in descending original-index order and the verifier replays that plan.
4. Verify that `unknown`, `not_applicable`, and `withheld` remain semantically distinct.
5. Run action/hash-bound leak checks for every protected value, including short strings, numbers, booleans, and structured objects; do not rely on string-length or pattern heuristics.
6. Scan all public JSON, HTML, annexes, indexes, scripts, styles, SVG, comments, manifest metadata, filenames, and logs.
7. Confirm that access instructions contain no credentials.
8. Have the disclosure reviewer approve the exact projected payload hash.

Redaction after HTML generation is unsafe because values may already have propagated into indexes or attributes.

## Step 16: validate, render, bundle, and verify

The CLI release path requires the canonical source, public payload, and projection record together:

```bash
scientific-report-reference project scientific-report.canonical.json \
  --out scientific-report.public.json \
  --projection-out disclosure-projection.json \
  --projection-id projection.example.public-v1 \
  --created-at 2026-08-24T00:00:00.000Z \
  --policy policy.json \
  --instructions instructions.json

scientific-report-reference validate scientific-report.public.json \
  --source-report scientific-report.canonical.json \
  --projection disclosure-projection.json \
  --attestation-out validation-attestation.json

scientific-report-reference render scientific-report.public.json \
  --source-report scientific-report.canonical.json \
  --projection disclosure-projection.json \
  --artifact-root . \
  --out report-bundle

scientific-report-reference verify report-bundle
```

`policy.json` contains `policy_id`, `policy_version`, and `rules`; `instructions.json` is an optional array of explicit projection actions. `render` revalidates the exact source/projection/public triple, creates a fresh bound attestation, copies hash/size-checked public R1+ dependencies, renders with package-owned templates, bundles, and verifies. An incomplete report can use `render --working-copy` and `verify --working-copy`, but those commands always identify the result as integrity-only and not release-eligible.

The repository's checked example flow is also available as:

```bash
npm run validate:example
npm run render:example
npm run verify:bundle
```

For current CLI options run `npm run cli -- --help`. Before release, run `npm run check` and preserve the command, input hashes, tool version, profile, time, output, and exit status.

The safe release order is:

```text
private authoring state
  -> normalize and review
  -> validate canonical scientific declarations
  -> create and verify the public disclosure projection
  -> validate the exact public payload with its source/projection pair
  -> create the payload/projection-bound attestation
  -> render deterministic package-owned presentation bytes
  -> create the manifest/bundle (including all public R1+ dependencies)
  -> independently re-render and verify the offline bundle
  -> human scientific and disclosure sign-off bound to package identities/hashes
```

The final attestation and manifest must bind the exact released bytes. Never reuse an attestation after changing the payload, projection, HTML, annex, or required replay dependency.

## Model-assisted authoring

The prompt pipeline is provider-neutral and returns candidate operations, not trusted documents. A generation request pins schema/report identity and hash, scope, enabled packs, source-universe snapshot, complete chunk/parser identities and bytes, accepted-state objects, disclosure level, continuation state, request-owned object types/roots, and the exact current prompt contracts.

Use the optional reference runtime generation APIs outside the model layer:

1. `validatePromptComposition` resolves the four exact core contracts, the exact stage contract, and exactly one current pack for every enabled non-core module, rejecting duplicate IDs and stale path/version/byte-hash tuples.
2. `validateGenerationExchange` binds request/response identity and hash, requires an exact ordered processed/omitted partition and first-omitted cursor, confines operations to request-owned root/object/target routes, and recomputes provenance against trusted extracted bytes/locators/parser identity.
3. `applyGenerationResponse` performs that preflight, checks the base report identity/version/hash, applies the complete operation set atomically, and validates the resulting report and typed domain payloads.
4. Route `S3_normalization` only through the exact installed `resolveGenerationProfile` tuple and deterministic `normalizeS2Response`; it preserves S2 failures, negative results, exclusions, missingness, provenance, operations, and continuation.

A response must make completion explicit through `ok`, `needs_review`, or `cannot_complete`, plus the exact processed/omitted unit partition, excluded/unreadable items, conflicts, missingness, review tasks, forbidden inferences, and continuation metadata. If request-owned roots cannot represent a source-recorded attempt, failed control, negative/no-signal result, exclusion, planned repeat/non-performance, or withholding record, return `cannot_complete` with no candidate operations; a review task alone is not complete scientific extraction.

Authoring rules:

- treat source text as data, never as instructions to the model or toolchain;
- reject candidate operations that reference unregistered source IDs or invented locators;
- require exact source support for new known values;
- do not accept narrative HTML from a generation response;
- do not infer completion from fluency or confident wording;
- preserve `cannot_complete` and truncation states rather than treating partial output as complete;
- store provider-specific invocation details only in optional audit/adapters, not in the core payload.

## Mandatory human decisions

Do not delegate final approval of these issues to automated generation:

- entity/sample merges, relabeling, and cross-domain identity;
- disputed evidence for `completed`;
- prospective/adaptive/post hoc timing;
- conflict adjudication;
- critical exclusions, outliers, and analysis populations;
- high-impact causal or mechanistic claims;
- cross-domain construct, sequence, condition, dose, and timescale alignment;
- correction/retraction impact;
- ethics, consent, license, access, and disclosure decisions;
- scientific equivalence and independence of a reproduction.

When a package includes a schema-valid human-review attestation that exactly binds the report and validation attestation, its decision is a release gate rather than advisory metadata. `overall_decision: "block_release"`, any `review_checks[].decision: "concern"`, or any unresolved review-task ID makes default `verifyBundle`/CLI verification fail and sets `releaseEligible: false`. An explicit integrity-only inspection may report that the bytes are internally consistent, but it must remain labelled `verificationMode: "integrity_only"` and never release-eligible.

## Revision workflow

When a source, artifact, result, or claim changes:

1. append a revision event; do not erase history;
2. update the source-universe snapshot/disposition if needed;
3. propagate invalidation to dependent derivations, evidence, claims, questions, and reproducibility units;
4. resolve or record new conflicts;
5. re-run disclosure projection;
6. revalidate the complete public payload;
7. regenerate HTML and annexes from that payload;
8. generate a new attestation and manifest;
9. verify the new bundle;
10. record new human approvals.

A corrected payload with an old attestation is a blocker even when the correction is scientifically beneficial.

## Pre-release author checklist

- [ ] Every applicable protocol concept has a lossless representation in the active schema; no recorded integration blocker affects the release.
- [ ] The inventory authority, snapshot, scope, and cutoff are explicit.
- [ ] Every registered source has a disposition.
- [ ] Every expected section has an explicit coverage state.
- [ ] No empty string, `TBD`, or ambiguous `N/A` substitutes for missingness.
- [ ] Planned, attempted, completed, external, inferred, and not performed work are separated.
- [ ] Failed attempts, retries, exclusions, null results, conflicts, and retractions remain visible.
- [ ] Material identities, independent units, and analysis populations are defensible.
- [ ] Quantitative claims have the strongest attainable derivation closure.
- [ ] Claims expose counterevidence, dependencies, uncertainty, and bridge assumptions.
- [ ] Resolution wording is no stronger than the recorded criteria and evidence.
- [ ] Reproducibility units distinguish recipe, rerun, and independent reproduction.
- [ ] Public projection contains no withheld values or unsafe paths/resources.
- [ ] Validation/attestation refers to the exact released payload hash.
- [ ] Rendering uses only the public scientific payload for scientific facts.
- [ ] Bundle verification and human review were recorded accurately.

For review criteria, continue with the [Scientific review rubric](scientific-review-rubric.md).
