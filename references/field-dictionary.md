# Field dictionary

This dictionary explains the scientific meaning of the canonical report fields and shared objects. It is a semantic companion to the JSON Schemas; it is not a substitute for them.

## Normative order

When sources disagree about a field contract, apply these roles:

1. the core protocol files are normative for scientific and epistemic semantics;
2. the versioned JSON Schema is normative for the serialized structure, required properties, and enums of a compatible implementation, but may not weaken or reinterpret the protocol;
3. the semantic rule registry identifies the automated subset of cross-record gates;
4. this dictionary guides authors and reviewers;
5. templates and examples are illustrative only.

**Alignment rule.** Schema names and enums must match protocol-normative terms wherever the concepts are identical. The active MVP contract set is reconciled; if a future protocol/schema/runtime difference is discovered, treat it as an integration blocker rather than permission to translate silently or claim conformance. Preserve uncertainty and withhold release, validation-passed, or reproducibility-level claims for the affected surface until protocol, schema, types, validator, fixtures, renderer, prompts, and documentation are migrated together.

A value being accepted by a schema does not make it scientifically correct. Conversely, a scientifically reasonable statement is not releasable until it can be represented without weakening the core contract.

### Contract alignment status

The zero-based gaps recorded during parallel implementation have been reconciled in the active contract surfaces. The schema now represents public-withheld provenance, authority-bounded source coverage, canonical attempt/segment outcomes, orthogonal result axes, versioned claim/argument/bridge/conflict records, scoped reproducibility levels, and explicit applicability decisions without draft aliases. `references/legacy-toolchain-reviews/INTEGRATION_BLOCKERS.md` records the closure evidence and retained limitations.

The common envelope permits `unknown` provenance to be `complete`, `partial`, or `absent`. Every `not_applicable` envelope carries an `applicability_decision_id`; root `applicability_decisions` records identify the rule, target, evaluated context, evidence, result, and decision time. Public `withheld` envelopes require null values and, under semantic validation, absent public provenance with no protected source or derivation bindings.

Future protocol/schema disagreement remains a release blocker. Do not add compatibility aliases or choose whichever vocabulary is easier to serialize; update protocol, schema, types, validator, examples, rendering, and migration guidance as one versioned change.

The root-field inventory below identifies the active scientific-report schema surface.

## Common conventions

### Identifiers

Object IDs are stable within a report lineage. Core identifiers start with an ASCII letter, contain only ASCII letters, digits, `.`, `_`, `:`, or `-`, and are at most 160 characters under the current common schema. Domain-pack schemas may currently impose a different documented length/pattern, so validate against the active schema. Do not encode secrets, mutable labels, absolute paths, source text, or a conclusion into an ID.

Changing the wording of a record does not normally require a new ID; changing the identity or scientific referent does. Superseded identities should remain resolvable through revision records rather than being silently reused.

### Version and time fields

- `schema_version` identifies the data contract.
- `report_version` identifies a report revision.
- object or source versions identify the specific material used, not merely the latest known material.
- timestamps describe recorded events only when supported by a source. An import time is not an experiment time, and a filesystem modification time is not automatically a decision time.
- `cutoff` bounds what the report attempts to include. It does not prove that every eligible source was discovered.

### Hashes and content identifiers

Core hash fields use `sha256:` followed by 64 lowercase hexadecimal characters. A hash is meaningful only with its byte/canonicalization scope and target identity. Do not compare hashes produced from different serializations as if they were the same measurement. A matching hash supports byte identity within the declared scope; it does not establish source authenticity, scientific validity, or independent provenance.

Core portable paths are relative, use `/` rather than backslashes, contain no NUL, do not start with `/` or a drive prefix, and contain no `..` path segment. Schema acceptance is only the first path check; bundlers/verifiers must also normalize, resolve, and enforce root containment and a symlink policy.

### Source bindings

A source binding connects a field or object to a registered source and, when possible, a precise locator. It contains `source_item_id`, optional snapshot/content/excerpt hash fields, a `locator`, and a `binding_role`. Current locator types are `json_pointer`, `line_range`, `page_range`, `table_cell`, `figure_panel`, `timestamp_range`, `frame_range`, `record_key`, `query`, `uri_fragment`, `whole_source`, and `other`; parser name/version accompany machine-derived locators when available. Binding roles are `direct`, `derived_input`, `context`, `counterevidence`, `decision_timing`, `completion_evidence`, and `disclosure_evidence`.

A binding to an entire large file is weaker than a precise locator and should be described as such. A source binding is not the same as scientific endorsement.

## Missing-value envelope

Source-derived fields that may be absent use an explicit state envelope. The canonical shape is conceptually:

```json
{
  "state": "known",
  "value": "the represented value",
  "source_bindings": ["source binding(s)"],
  "derivation_bindings": [],
  "missing_reason": null,
  "provenance_status": "complete"
}
```

The schema determines the exact type of `value` and binding representation.

| Field | Meaning |
|---|---|
| `state` | One of `known`, `unknown`, `not_applicable`, or `withheld`. |
| `value` | The scientific value. Present and non-null only when `state` is `known`, unless a field-specific schema says otherwise. |
| `source_bindings` | Direct or contextual source locators. A known value needs at least one source binding or one complete derivation binding. Withheld public envelopes must not expose the original value through a binding. |
| `derivation_bindings` | Stable IDs for derivations that establish the value. These complement, rather than duplicate, direct source bindings. |
| `missing_reason` | Why a value is unknown, inapplicable, or withheld. It must not disclose the withheld value. |
| `provenance_status` | `complete`, `partial`, or `absent`; describes provenance coverage, not scientific confidence. |
| `applicability_decision_id` | Required when `state` is `not_applicable`; resolves to a root applicability-decision record whose result and target match this exact field. It may be absent or null for other states. |

### State semantics

| State | Use when | Required behavior | Never substitute |
|---|---|---|---|
| `known` | A concrete value is supported by an identified source or derivation. | Supply a typed value and sufficient provenance. | A guessed value, default, or common practice. |
| `unknown` | The field applies, but the value cannot be established from the available registered material. | Give a non-speculative missing reason and preserve the information gap. | `null` alone, empty string, `TBD`, `N/A`, or an inferred value. |
| `not_applicable` | A versioned applicability rule establishes that the field does not apply to this object/context. | Cite or encode the applicability basis required by the schema/policy. | “Not recorded,” “not measured,” or “probably irrelevant.” |
| `withheld` | The value is known in the private authoring context but intentionally excluded from this disclosure projection. | In a public withheld envelope, set `value` to null, remove protected source/derivation bindings, use a non-sensitive reason code plus disclosure-decision ID, and set provenance status to `absent`; prevent the value from appearing in every public asset. | `unknown`, redacted-looking fragments, reversible encodings, or a locator that reveals the value. |

`unknown`, `not_applicable`, and `withheld` are not failures to be normalized away. They are distinct scientific and disclosure facts.

### Provenance status

- `complete`: provenance satisfies the applicable contract for this field; it does not mean that the source itself is correct.
- `partial`: at least one useful source or derivation link exists, but the applicable closure is incomplete.
- `absent`: no usable provenance binding is available in this representation. Public withheld envelopes deliberately use `absent` because protected provenance is removed; this does not mean the authorized private representation lacks provenance.

Do not convert `partial` to `complete` merely because multiple records repeat the same unsupported value. Do not convert the public `absent` state of a withheld field to `unknown`: withholding changes disclosure, not private epistemic knowledge.

## Assertion classes

Assertion class states how a proposition is known; it does not assign confidence:

| Class | Meaning |
|---|---|
| `observed` | A directly recorded measurement, event, or state in a bound source. |
| `declared` | A named accountable party's statement, represented explicitly as a declaration. |
| `derived` | Output of a recorded transformation with bound inputs and method. |
| `inferred` | A reasoned conclusion not directly observed; premises and argument steps are required. |
| `planned` | Intended future or conditional work; never evidence of execution. |
| `external` | Work or finding produced outside the report project's execution boundary. |

An assertion may be source-bound yet still be a declaration or external statement rather than an observation by this project.

## Root report fields

| Field | Scientific meaning and authoring rule |
|---|---|
| `report_id` | Stable identity of this report lineage. It is not a payload hash or filename. |
| `project_id` | Identity of the governed project or study context. External studies retain their own identity and scope. |
| `report_version` | Human-visible revision of the report content. Increment according to the repository's release policy. |
| `schema_version` | Version of the canonical scientific-report schema used to validate the payload. |
| `payload_role` | `canonical_authoritative`, `public_projection`, or `restricted_projection`. Canonical payloads are not projected; projection roles require a projection ID/status. |
| `title` | Descriptive report title; must not overstate resolution or completion. |
| `language` | BCP 47-style language tag for reader-facing scientific text. IDs, enums, hashes, and paths remain machine-stable. |
| `report_mode` | Presentation mode: `summary`, `full_archive`, or `filtered_working_copy`. It does not change scientific truth or validation scope. Lifecycle modes in `protocol/report-modes.yaml` are a separate policy concept. |
| `created_at` | Date-time when this payload version was created. It is not an experiment, decision, source, or cutoff time. |
| `scope` | Scope statement plus started/ended/cutoff envelopes and explicit included/excluded boundaries. |
| `cutoff` | Explicit date-time envelope bounding eligible evidence; later evidence belongs to a subsequent revision. |
| `applicability_decisions` | Versioned decisions binding a field, section, or module to a named applicability rule, evaluated context, evidence, result, and decision time. Every serialized `not_applicable` field and every module/section applicability state references one of these records. |
| `module_manifest` | Applied core, domain-pack, and local-extension versions/applicability. At least one core module is applied and each item references its applicability decision. |
| `section_coverage` | Per-section applicability and decision ID, coverage status, reason envelope, represented object IDs, source-universe IDs, and evidence bindings. Empty collections do not imply inapplicability. |
| `source_coverage` | Registered source universe, snapshot, dispositions, coverage axes, counts, and completeness class. |
| `research_questions` | Questions, resolution criteria/timing, status, qualified answer, linked claims, and unresolved boundaries. |
| `entities` | Versioned scientific identities: materials, samples, datasets, models, structures, systems, cohorts, and related objects. |
| `campaigns` | Groups of work units under shared scientific objectives; not substitutes for member counts. |
| `work_units` | Bounded planned/performed units with state, scope, completion criteria/assessment, and attempt IDs. |
| `attempts` | Append-only actual execution efforts with outcome, evidence, segment IDs, results, failures, and typed `attempt_relations`. A later success after a material partial/failed outcome needs a recovery/supersession chain or a source-bound `not_a_retry` relation. |
| `segments` | Append-only phases/restarts/checkpoint intervals within attempts, including predecessor and parameter-difference state. |
| `methods` | Versioned procedures and parameters, distinguishing actual/planned/default/inferred/external/unknown roles. |
| `decision_events` | Versioned scientific decisions, timing classification/evidence, outcome-access boundary, accountable party, and supersession. |
| `materials` | Versioned biological, physical, computational, or data materials used in lineage. |
| `material_relationships` | Directed transformations, splits, pools, derivations, or other relationships between materials. |
| `analysis_populations` | Inclusion/exclusion and independent-unit definition for the population analyzed. |
| `data_slices` | Versioned, inspectable input selections such as rows, columns, queries, filters, frame ranges, or populations. |
| `derivations` | Recorded transformations/formulas connecting inputs to outputs with assumptions and units. |
| `invocations` | Historical command/protocol execution evidence, not a maintained replay recipe. |
| `environments` | Software, hardware/instrument, dependency, configuration, and nondeterminism environment records. |
| `random_states` | Seed/state identity, derivation trees, stochastic mechanisms, and nondeterminism disclosure. |
| `analysis_runs` | Executions binding data slices, derivations, invocations, environments, random state, and output artifacts. |
| `results` | Observations or estimates represented on orthogonal scientific, statistical, interpretability, and disposition axes. |
| `failures` | Root collection of `FailureEvent` records for technical, procedural, data, access, or quality failures; retained even when a later retry succeeds. |
| `evidence_items` | Inspectable evidence nodes with source/artifact bindings and support, contradiction, or qualification role. |
| `claims` | Versioned, scoped propositions with type, timing, support status, subject/context, and graph edges. |
| `argument_steps` | Explicit inferences from evidence/claims to conclusions, including assumptions and alternatives. |
| `claim_dependencies` | Directed premise-to-dependent claim links and dependency/independence information. |
| `cross_domain_bridges` | Explicit mappings across domains/representations/scales with alignment and validity state. |
| `conflict_sets` | Matched-context incompatible assertions, adjudication state, decision event, and affected downstream claims. |
| `artifacts` | Versioned data, code, environment, log, model, trajectory, table, figure, protocol, recipe, and output objects with access/integrity metadata. |
| `reproducibility_units` | Scoped units describing readiness, replay, independent reproduction/replication, comparisons, and claim/output coverage. |
| `limitations` | Known boundaries that constrain scope, source coverage, method, data, analysis, uncertainty, conflict, access, reproducibility, or disclosure. |
| `revision_events` | Append-only corrections, retractions, supersessions, and downstream invalidation/review effects. |
| `review_tasks` | Explicit human-review work with category, severity, affected IDs, role, and status. |
| `disclosure_state` | Projection level/status, safe withheld/omitted counts, and projection ID. It contains no private values in a public payload. |
| `extensions` | Namespaced extension map. Extensions remain subject to core epistemic and disclosure rules. Canonical domain-pack records use only the reserved typed `extensions.domain_payloads` array; generation may append a schema-valid payload at `/extensions/domain_payloads/-` only when that exact root and `domain_payload` object type were requested. |

Validation status, build status, bundle-verification status, and generation audit data do not belong in the scientific payload.

## Source coverage

A `SourceUniverse` is the bounded inventory against which coverage statements are made.

### Coverage concepts

| Concept | Meaning |
|---|---|
| authority | Why this inventory is considered authoritative, registered-only, or otherwise limited. |
| snapshot | Version or immutable reference for the inventory used by this report. |
| source item | One registered document, record, run, job, trial, trajectory/restart, publication, declaration, or other evidence-bearing object. |
| disposition | How the report handled the item. |
| coverage denominator | The count/set of eligible items in the declared universe, not an estimated count of all possible sources. |
| completeness statement | A statement limited to the authority and snapshot. Without an authoritative universe, absolute completeness is not available. |

The source-coverage protocol and active schema use `authority_basis` values of `authoritative_registry`, `reconciled_authoritative_registries`, `declared_inventory`, `discovery_process`, and `none`. They derive an `enumeration_status` of `authoritative_exhaustive`, `registered_not_proven_exhaustive`, `open_ended`, or `unknown`; only an authority basis with evidence of exhaustiveness may use `authoritative_exhaustive`. The active shape also retains snapshot bindings, item IDs, disposition reconciliation, the three coverage axes, and the bounded `report_completeness` classification; the retired compressed `universe_status`/`completeness_claim` draft shape is not a compatibility alias.

Coverage is multi-axis:

| Axis | Values and meaning |
|---|---|
| enumeration | `authoritative_exhaustive`, `registered_not_proven_exhaustive`, `open_ended`, or `unknown`; states how the inventory boundary was established. |
| inventory accounting | `complete`, `incomplete`, or `unknown`; complete means every item in the bound snapshot has a terminal disposition. |
| accessibility | `all_accessible`, `limitations_present`, or `unknown`; unreadable/inaccessible items create limitations. |
| scientific incorporation | `complete_within_boundary`, `partial`, `none`, or `unknown`; requires mapped included material, valid exclusions, and no potentially material unreadable/inaccessible gap for completeness. |
| report completeness | `proven_within_declared_universe`, `registered_sources_accounted_for`, `partial`, or `cannot_be_established`; this is derived from the preceding axes. |

The core `SourceUniverse` requires `universe_id`, `title`, `scope_statement`, `inclusion_boundary`, `exclusion_boundary`, `cutoff`, `authority_basis`, `enumeration_status`, `snapshot_bindings`, and `item_ids`. The cutoff records effective time, timezone/offset, and event semantics; a report must not imply coverage after it.

### Source dispositions

| Disposition | Meaning |
|---|---|
| `included` | Content was processed and represented or deliberately found non-contributory with traceable handling. |
| `excluded_with_reason` | The item was reviewed for scope and excluded under an explicit rule/reason. Exclusion is not deletion. |
| `unreadable` | The item was available but could not be parsed/read sufficiently. Preserve diagnostics without inventing content. |
| `inaccessible` | The item could not be accessed under current permissions, location, license, or availability. |
| `duplicate` | The item is demonstrably duplicative of another registered item. Link the retained identity and comparison basis. |
| `unmapped` | The item was registered but could not be mapped to report objects or a confident disposition. This normally remains a coverage gap. |

A parser success is not equivalent to scientific inclusion, and an item with no positive result may still be required to represent failures or exclusions.

## Section coverage

`SectionCoverage` prevents silent omission. Each record contains:

- `section_id`: stable section identity;
- `applicability`: `applicable`, `not_applicable`, or `unknown`;
- `coverage_status`: `complete`, `partial`, `none`, `not_applicable`, or `unknown`;
- `reason`: a source-derived string envelope explaining inapplicability or incomplete/absent/unknown coverage;
- `source_item_ids`: registered sources used to establish coverage.

`applicability: not_applicable` requires `coverage_status: not_applicable` and a known reason tied to an applicability rule. A `partial`, `none`, or `unknown` coverage status requires a known or safely withheld reason. A section with zero records is still a coverage result. Do not infer `not_applicable` from an empty array.

## Research questions and resolution

A research question should define the estimand or decision target, population/system, conditions, time horizon, and acceptable evidence as specifically as available.

### Resolution-criteria timing

| Value | Meaning |
|---|---|
| `predefined` | Criteria were fixed before the relevant evidence or analysis was observed, with credible time evidence. |
| `adaptive` | Criteria were changed under an allowed, recorded adaptive process with timing and rationale. |
| `post_hoc` | Criteria were formulated after relevant evidence was available. This may be useful but must not be presented as prospective. |
| `missing` | No defensible resolution criteria are recorded. |
| `not_applicable` | A rule establishes that formal resolution criteria do not apply. |

### Resolution status

| Value | Meaning |
|---|---|
| `resolved` | All applicable resolution criteria are met by supported claims within the declared scope. |
| `partially_resolved` | Some criteria or subquestions are met; named material boundaries remain. |
| `unresolved` | The work addressed the question but did not meet the resolution criteria. |
| `not_addressed` | No qualifying work addressed the question in this report scope. |
| `not_evaluable` | The report lacks valid criteria or sufficient evidence to evaluate resolution. |

Volume of work is not a resolution criterion. A qualified answer should expose the principal counterevidence and unresolved boundary, not only the favored conclusion.

## Work execution

Execution history is append-only:

```text
Campaign -> WorkUnit -> Attempt -> Segment
```

| Object | Meaning |
|---|---|
| Campaign | Coordinated group of work pursuing a larger objective. |
| WorkUnit | A unit with explicit completion criteria and scope. |
| Attempt | One actual effort to execute a work unit. Retain failed and abandoned attempts. |
| Segment | A stage, restart interval, checkpoint interval, batch, or other subdivision within an attempt. |

### Work state

| State | Meaning |
|---|---|
| `planned` | Intended work with no evidence of an execution attempt. |
| `attempted` | Execution began or was materially undertaken, but completion criteria are not met or cannot be established. |
| `completed` | Applicable completion criteria are documented and supported by execution evidence. Partial usable output does not erase a later failure. |
| `not_performed` | The record establishes that the work was not performed. This is distinct from no record being found. |
| `unknown` | Available evidence cannot establish whether the work was performed or completed. |

### Execution scope

| Scope | Meaning |
|---|---|
| `this_project` | Work actually executed under this project's governed scope. |
| `reanalysis` | This project reanalyzed pre-existing data or outputs; it did not originate the upstream experiment/run unless separately recorded. |
| `external_study` | Work reported by an external study. It supports background/evidence as allowed but is not project completion. |
| `upstream_collaborator` | Work performed by a collaborator/upstream group, with its own responsibility and evidence boundaries. |
| `synthetic` | Simulated, generated, or demonstration material; it must not be counted as observed experimental evidence. |

Counting rules must combine state and execution scope. For example, an external completed study does not increment this project's completed work count.

Retry history includes materially failed `partially_succeeded` and `cancelled_after_start` attempts when a linked failure is recoverable, major, or blocking—not only attempts whose aggregate outcome is `failed`. A later successful attempt must be reachable through `superseded_by_attempt_id` or a failure event's `recovery_attempt_ids`. If the later execution is genuinely unrelated rather than a retry, record a typed `not_a_retry` relation to the earlier attempt with a known immutable source-bound rationale; sequence alone is not proof of independence.

## Methods, materials, and lineage

Method records distinguish:

- `actual`: evidenced for an attempt or segment;
- `planned`: intended but not execution evidence;
- `default`: documented software/protocol default not necessarily proven applied;
- `inferred`: reasoned but not directly evidenced and never promoted to actual;
- `external`: reported outside the project execution boundary;
- `unknown`: the role/value cannot be established;
- deviations, amendments, and versioned protocols, code, configurations, instruments, and recipes.

Material lineage should preserve identity and transformation from source material through samples, aliquots/pools, datasets, structures/systems, preprocessing, analysis populations, and outputs. A pool is one material relationship, not evidence for multiple independent biological replicates.

Domain payloads retain denominators and conclusions as typed records rather than free-text hints:

- every wet-lab `ReplicateDesign` names its exact `specimen_ids`; biological and technical N are evaluated only against those members and their lineage, never against every specimen in another work unit or payload;
- every AI/ML search has a typed source-bound `selection_derivation` whose selected trial inputs, trial-derived model inputs, and output models reconcile exactly. Direct selection outputs equal the selected-trial models; ensemble or post-search outputs require their explicit typed rule;
- every affirmative MD sampling conclusion uses `sampling_adequacy_assessment` and known burn-in, autocorrelation, correlation-time, effective-sample-size, convergence-criterion/diagnostic, replica-result, and heterogeneity records for at least two resolved replicas. An adequacy paraphrase cannot substitute for those fields.

Entity merges, relabeling, and cross-domain identity bridges require explicit review when the sources do not establish exact equivalence.

## Results and failures

The protocol, active schema, TypeScript types, normalizer, validator, example, and renderer use the same result-axis vocabulary below. Retired draft values such as `non_inferior`, `superior`, `not_tested`, `secondary`, and `exploratory` are intentionally not compatibility aliases.

A result uses separate axes so that scientific meaning is not collapsed into one status.

### Scientific effect class

| Value | Meaning |
|---|---|
| `increase` / `decrease` | Direction is higher/lower relative to the declared reference. |
| `no_detectable_effect` | The method did not detect an effect within stated sensitivity; not proof of equivalence. |
| `equivalent` | The estimate meets a declared scientific equivalence bound under a valid procedure. |
| `heterogeneous` | Direction or magnitude differs materially across declared strata, times, replicas, or conditions. |
| `effect_present_direction_uncertain` | Evidence supports a difference but not a stable direction. |
| `not_estimated` | No effect estimate was produced. |
| `unknown` | Available records do not establish an effect class. |
| `not_applicable` | The record is not an effect estimate and the applicability rule is recorded. |
| `withheld` | The class is known internally but not disclosed in this projection. |

### Statistical decision

| Value | Meaning |
|---|---|
| `reject_null` | A declared null hypothesis was rejected under the recorded procedure. |
| `do_not_reject_null` | The procedure did not reject; this does not establish no effect. |
| `equivalent` | A valid equivalence decision met its declared bounds. |
| `noninferior` | A valid noninferiority decision met its declared margin. |
| `inconclusive` | A formal procedure was attempted but cannot support a determinate decision. |
| `descriptive_only` | No formal inferential decision was intended. |
| `not_performed` | No formal statistical decision was performed. |
| `unknown` | It is unknown whether or how a decision was made. |
| `not_applicable` | A statistical decision is inapplicable under a recorded rule. |
| `withheld` | The decision is known internally but not disclosed. |

`do_not_reject_null` is not evidence of no biological effect. Equivalence requires a justified equivalence region and suitable analysis. A result used as biological counterevidence must identify an applicable analysis population and every relevant typed control, QC event, and analysis context. Aggregate `control_status` or `quality_control_status` labels do not pass when those IDs are absent, unresolved, belong to another work unit, or their concrete records fail.

### Interpretability status

| Value | Meaning |
|---|---|
| `interpretable` | Applicable prerequisites and controls support interpretation as stated. |
| `qualified` | The result is useful only under explicit material qualifications and linked qualification IDs. |
| `inconclusive` | Evidence does not resolve the relevant interpretation. |
| `not_interpretable` | A failed prerequisite, control, integrity check, or design condition blocks interpretation; blocker IDs are required. |
| `unknown` | Interpretability cannot be assessed from available records. |
| `not_applicable` | Assessment is inapplicable under a recorded rule. |
| `withheld` | The assessment is known internally but not disclosed. |

### Record disposition

| Value | Meaning |
|---|---|
| `primary` | Included in the declared primary analysis or principal answer. |
| `sensitivity_only` | Used only in a named sensitivity/robustness analysis. |
| `contextual` | Retained as context without inferential weight for the principal answer. |
| `excluded` | Excluded under a recorded decision/reason and timing; retained in history. |
| `superseded` | Replaced by a later version while remaining traceable. |
| `retracted` | Withdrawn from valid use; downstream dependencies require propagation. |
| `pending_review` | Current use has not been adjudicated. |
| `unknown` | Disposition cannot be established. |
| `not_applicable` | Disposition is inapplicable under a recorded rule. |
| `withheld` | Disposition is known internally but not disclosed. |

### Failure events

A `FailureEvent` is separate from result axes. Current classes are `instrument`, `reagent_or_material`, `protocol_deviation`, `data_integrity`, `software`, `hardware`, `resource_exhaustion`, `convergence_or_stability`, `quality_control`, `access_or_permission`, `operator_or_process`, `unknown`, and `withheld`. Resolution is `unresolved`, `mitigated`, `resolved_for_future_attempts`, `not_applicable`, `unknown`, or `withheld`.

Record the affected object, onset/detection, impact, evidence, and resolution. A later success appends a new attempt or segment; it does not overwrite the failure. `resolved_for_future_attempts` does not repair the original affected result automatically.

## Quantitative derivation

A quantitative claim should close the chain:

```text
DataSlice -> DerivationRecord -> AnalysisRun -> OutputArtifact -> EvidenceItem -> Claim
```

| Object | Minimum semantic content |
|---|---|
| `DataSlice` | Versioned input identity, table/column/row or verifiable query, filters, population/selection, and slice hash when available. |
| `DerivationRecord` | Formula or transformation, units, assumptions, input references, and output identity. |
| `AnalysisRun` | Code/configuration identity, actual invocation, environment, random state, execution status, timing, and output references/hashes. |
| `OutputArtifact` | Versioned result file/object, media/type, integrity, access, and relationship to the run. |
| `EvidenceItem` | Inspectable evidence excerpt/summary and its direct support or challenge relationship. |
| `Claim` | Scoped proposition, uncertainty, evidence and argument links, and dependency state. |

A figure or prose result without a recoverable input selection is not a closed derivation. A path alone is not a stable artifact identity.

## Claims, arguments, and conflicts

This section describes the active protocol-aligned claim graph. Claims, evidence, argument steps, dependency edges, bridges, and conflicts are separate versioned records with explicit edge IDs; retired draft fields such as `claim_kind`, `claim_status`, `statement`, and `scope_and_conditions` are not accepted aliases.

### Claim

A claim is an atomic, scoped proposition. Each claim records `object_version`, `proposition`, `claim_type`, version-pinned `subject_bindings`, `context`, `scope`, `decision_timing`, `support_status`, and the IDs of its evidence, counterevidence, dependencies, argument steps, bridges, conflicts, limitations, and revisions. `claim_type` is `background`, `descriptive`, `quantitative`, `comparative`, `associational`, `predictive`, `causal`, `mechanistic`, `methodological`, `negative_or_absence`, or `resolution`. `support_status` is `supported`, `qualified`, `contested`, `unsupported`, `invalidated`, `review_required`, `unknown`, or `withheld`.

A supported or qualified non-background claim needs a direct evidence edge or an explicit premise-to-argument path. Background claims still need citations when they materially support project reasoning. Quantitative claims need derivation closure or an exact external-source locator. Direct association or co-occurrence evidence cannot by itself support a causal/mechanistic claim or resolve a causal question: those claim types require a valid/qualified `ArgumentStep` with a known rule/rationale, nonempty known assumptions, nonempty known alternative explanations, and admissibly supported premises. Cross-domain bridge requirements are derived through the full cycle-safe premise-claim closure, not only evidence attached directly to the conclusion claim. Invalidation and unresolved conflict propagate through the declared graph.

### Evidence item

An evidence item is a normalized, versioned link between source/artifact material and claims. Evidence kinds are `result`, `observation`, `artifact`, `source_statement`, `derived_value`, `method_validation`, `external_evidence`, `counterevidence`, or `other`; an `EvidenceEdge` relationship is `supports`, `contradicts`, or `qualifies`. Record dependency groups so dependent observations do not masquerade as independent evidence. Distinct result, evidence, dependency-group, or `AnalysisPopulation` IDs do not establish independence when ancestry closes onto the same analysis population, biological group, material/entity, data slice, derivation, run, artifact, or random state. “Independently replicated” wording requires at least two explicit groups whose resolved ancestry is actually disjoint.

### Argument step

An `ArgumentStep` makes an intermediate inference explicit through versioned premise and conclusion edge IDs, a rule/rationale, assumption states, alternative explanations, applicable bridge IDs, and a scoped validity status. Validity is `valid_for_scope`, `qualified`, `invalid`, `review_required`, `unknown`, or `withheld`. Argument graphs must be acyclic in every report version, and an argument step must not introduce an unbound entity, number, condition, or premise.

### Claim dependency

A `ClaimDependency` records an upstream/downstream claim version and dependency kind: `logical_prerequisite`, `shared_data`, `shared_material`, `shared_method`, `shared_checkpoint`, `derived_from`, `cross_domain`, or `other`. Its propagation policy is `invalidate_downstream`, `require_review`, `qualify_downstream`, or `no_automatic_change`, and its status is `active`, `broken`, `invalidated`, `review_required`, or `unknown`. Repeating the same upstream source through several descendants does not create independent support.

### Cross-domain bridge

A `CrossDomainBridge` justifies correspondence between domains—for example, a simulated construct and a wet-lab construct. It version-pins source and target entities, declares a mapping type, and assesses identity, construct, condition, and scale as `matched`, `partially_matched`, `mismatched`, `unknown`, `not_applicable`, or `withheld`. Bridge validity is `valid`, `qualified`, `invalid`, `unknown`, `not_applicable`, or `withheld`, with a separate reviewer state. A valid bridge permits only matched or justified not-applicable dimensions, requires known mapping evidence and review, and must identify the exact argument steps it enables. Mere naming similarity is not equivalence.

### Conflict set

A `ConflictSet` contains at least two claim/evidence members whose assertions are materially incompatible or potentially incompatible under a recorded matched context. It records explicit member-edge IDs, an incompatibility statement, downstream claim IDs, and an adjudication status of `unresolved`, `resolved_with_rationale`, `retained_as_heterogeneity`, `review_required`, `unknown`, or `withheld`. Resolution with rationale requires a decision event and never deletes losing members. `retained_as_heterogeneity` is valid only when each incompatible result pair has a typed, known, immutable source-bound material difference in estimand, population/system, analysis population, condition, time/frame, intervention, dose, endpoint, system state, or comparison definition, and the conflict statement names that dimension. Relabeling identical-context opposite results or asserting a difference in prose does not satisfy the gate.

## Artifacts and access

Artifact records distinguish identity, integrity, location, access, and disclosure.

- An artifact may be known but inaccessible to the current reviewer.
- A local absolute path may exist in private authoring state but must not leak into a portable public bundle.
- `withheld` is not the same as inaccessible: withholding is a disclosure decision; inaccessibility is an access condition.
- Access instructions must not contain credentials or assume an expired session.
- Licenses, consent, data-use terms, and export restrictions can constrain replay even when bytes are technically reachable.

## Reproducibility units

Each unit identifies a bounded output or claim set and records:

- source/input and derivation closure;
- historical invocation and its actual parameters;
- replay recipe and any differences from history;
- code, environment, hardware/non-determinism, and random state;
- artifact access and licenses;
- acceptance criteria defined before interpreting the rerun where possible;
- rerun executor, independence, dates, logs, outputs, and comparison;
- covered claims/outputs and denominator;
- conservative status/level and unresolved blockers.

See [Reproducibility contract](reproducibility-contract.md). A report summary may show the conservative lower bound and level distribution for critical units; it must retain the per-axis record and denominator. A label-only independent event is capped at R2. R3 additionally requires an evidence-bound independent actor and execution time, a distinct resolvable execution record, exact integrity-bound inputs and independently derived outputs, a complete environment or source-bound implementation/protocol boundary, an explicit random-state applicability decision and record, deviations and failure ledger/assessment, comparison evidence, and exactly one machine-checkable comparison for every declared target.

## Limitations

A limitation should identify:

- affected question, claim, result, source, or reproducibility unit;
- type (coverage, design, measurement, statistical, computational, access, disclosure, generalization, or other);
- severity/impact in words;
- whether it is resolvable in this revision;
- mitigation or review task;
- source/provenance where the limitation itself is evidenced.

Do not use a generic limitations paragraph to hide a blocker that should change claim status or report resolution.

## Revisions and invalidation

Revision events are append-only. They describe correction, retraction, supersession, merge/split, or reinterpretation; identify affected objects; and record downstream propagation. If an upstream artifact, evidence item, or claim becomes invalid, dependent claims must enter a state such as review required, qualified, superseded, or retracted according to the schema and policy. Historical versions remain traceable.

Any scientific payload byte change invalidates an attestation bound to the previous payload hash, even if the author believes the change is cosmetic.

## Disclosure state

Disclosure state records the projection policy and safe release facts. It must preserve the distinction between:

- unknown to the authoring process;
- not applicable;
- known but withheld;
- unavailable under present access conditions;
- excluded from scientific scope.

A public report must not contain the original withheld value in text, JSON, source bindings, indexes, HTML attributes, comments, logs, SVG, filenames, or manifest metadata.

## Metadata outside the scientific payload

| Object | Location and meaning |
|---|---|
| validation attestation | Separate file binding implemented checks, results, schema/rule/profile versions, payload hash basis, canonicalization identifier, payload byte size, and validation scope. Not a scientific fact. `canonical-json-v1` and `exact-file-bytes` hashes are not interchangeable. |
| package manifest | Separate file listing release paths and integrity metadata. Not proof of source completeness. |
| build/verifier output | Operational evidence about a build or bundle, not part of the scientific record. |
| generation request/response | Candidate-operation interchange; untrusted until accepted. |
| generation audit | Optional peripheral record of generation process. Removable without scientific effect. |
| provider metadata | Adapter/audit concern only; never required by the core scientific schema. |

## Automated checks versus intended semantics

The dictionary describes intended semantics. Automation can enforce only the subset encoded in schemas and the rule registry. Examples:

- a rule can detect `completed` with no declared completion evidence; it cannot determine whether the evidence is genuine;
- a rule can detect an unresolved reference; it cannot prove that two resolved entity IDs refer to the same physical sample;
- a rule can require a conflict set; it cannot always decide whether differences are conflict or legitimate heterogeneity;
- a redaction scan can detect configured patterns; it cannot prove that all sensitive values are absent;
- a rerun record can be structurally complete; independence and scientific equivalence still require review.

Authors and reviewers must not turn a passing validation result into a stronger claim than the implemented checks support.
