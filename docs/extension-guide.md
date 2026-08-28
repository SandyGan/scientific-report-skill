# Extension guide

The core protocol is intentionally vendor-neutral and domain-general. Extend it through additive domain packs, semantic rules, prompt fragments, deterministic views, fixtures, and—only at the outer boundary—thin provider adapters.

An extension may make requirements stricter. It may not weaken scientific truth, missingness, coverage, work-state, history, argument, disclosure, reproducibility, or rendering invariants.

## Extension types

| Type | Purpose | Typical location |
|---|---|---|
| domain pack | Add fields and applicability for a scientific domain | `schemas/packs/`, `prompts/packs/`, `rules/domain-overlays/` |
| shared definition | Add a reusable core object or vocabulary | `schemas/defs/`, protocol file, rule registry |
| semantic rule | Check a cross-record scientific invariant | `rules/registry.yaml` and optional domain overlay |
| prompt stage/fragment | Propose candidate operations under the existing request/response contract | `prompts/stages/`, `prompts/core/`, `prompts/packs/` |
| console view | Present existing public facts for a reader task | `templates/scientific-console/partials/` and local assets |
| report mode/profile | Change allowed projection/presentation, not scientific truth | `protocol/report-modes.yaml`, `protocol/disclosure-policy.yaml` |
| source/authoring adapter | Normalize external source records into provider-neutral inputs | implementation boundary; never direct trusted payload output |
| generation provider adapter | Map a provider-neutral generation request/response to one external service | future `adapters/` boundary |
| verifier/bundler extension | Add release checks or artifact handling | implementation modules and tests |

## Non-negotiable core invariants

Every extension must preserve:

1. `scientific-report.public.json` is the only scientific fact source for public rendering.
2. `validation-attestation.json` is separate and binds one exact canonical payload digest.
3. Validation/build/generation metadata is not a scientific fact.
4. `known`, `unknown`, `not_applicable`, and `withheld` remain distinct.
5. Known source-derived values require source or derivation bindings; unknowns are not guessed.
6. Planned, inferred, external, not-performed, and unknown work is not narrated or counted as project-performed work.
7. Work state and execution scope remain orthogonal.
8. Attempts, segments, failures, revisions, exclusions, conflicts, and replay events are append-only histories.
9. Scientific effect, statistical decision, interpretability, disposition, and technical failure remain independent.
10. Quantitative claims retain units, population/denominator, uncertainty as applicable, and derivation/source closure.
11. Claims do not exceed direct evidence, explicit premises, argument steps, dependency independence, or bridge validity.
12. Withheld values do not leak into any public asset, identifier, path, index, or audit.
13. Reproducibility remains per-unit and conservative; recipe, replay, computational independence, and experimental independence stay distinct.
14. Renderers organize facts but never create them.
15. Prompt output remains untrusted candidate operations; it never emits trusted payloads, attestations, or HTML.
16. Provider-specific request fields, SDK objects, model identifiers, credentials, token/billing fields, and retry semantics remain outside the core contracts.

When two extension rules conflict, preserve more uncertainty and less disclosure pending review.

## Contract-coherence preflight

Before designing an extension, inspect `reviews/zero-based/INTEGRATION_BLOCKERS.md` and pin the protocol, schema, rule-registry, prompt, renderer/view-model, attestation, and manifest versions the extension expects. An extension may not route around a core mismatch with aliases, free text, parallel status fields, or renderer fallbacks.

If the extension touches an unresolved area—currently including public-withheld provenance, missingness/applicability provenance, source coverage, attempt/segment outcomes, result axes, claim/argument/bridge/conflict records, reproducibility units, or human-review outcomes—resolve or migrate that core contract across schemas, rules, types, fixtures, and rendering before declaring the extension supported. Preserve source facts and explicit missingness in the meantime; do not use the extension namespace to publish a lossy substitute.

## Design an extension before coding

Write a short extension definition containing:

- stable extension ID and human title;
- owner and review expertise;
- scientific purpose and non-goals;
- applicable entities, work units, attempts, results, or questions;
- applicability decision and evidence;
- new source classes and inventory implications;
- new objects/fields/enums and why core fields are insufficient;
- missingness and disclosure behavior for every source-derived field;
- semantic invariants and failure consequences;
- human decisions automation cannot make;
- interaction/print/static needs;
- migration and compatibility plan;
- positive, negative, unknown, withheld, conflict, and adversarial fixtures;
- implementation and verification scope.

If the proposed extension can be represented by existing core objects plus a controlled vocabulary, prefer that over a parallel graph or status system.

## Add a domain pack

A domain pack adds domain-specific facts and gates while referencing core identities.

### 1. Define applicability

Specify:

- what makes the pack applicable;
- what evidence supports that decision;
- which core objects it applies to;
- whether applicability is per report, work unit, attempt, result, or entity;
- how `unknown`, `not_applicable`, and `withheld` are represented;
- what happens when applicability cannot be decided.

Do not infer not-applicable from an empty collection. If a field applies but was not measured or recorded, its state is normally `unknown`.

Pack payloads should include a stable ID, domain constant, pack version, `applies_to` references, and explicit section coverage, following the established packs.

### 2. Inventory the domain sections

Define section coverage entries before record types. Include sections needed to expose failures and prerequisites, not just success outputs.

Examples:

- a microscopy pack may require acquisition, calibration, segmentation/ROI decisions, processing, and representative-image selection;
- an omics pack may require specimen lineage, library preparation, sequencing run/QC, normalization, batch correction, feature filtering, and multiplicity;
- a free-energy pack may require state definitions, alchemical mapping, lambda schedule, sampling, overlap, estimator, cycle closure, and uncertainty.

Every expected section has a status and basis. Empty arrays do not carry coverage semantics.

### 3. Add schema

Place the pack under `schemas/packs/<pack-id>.schema.json` and use JSON Schema draft 2020-12, matching the project.

Schema guidance:

- use a stable `$id` with an explicit contract version;
- set `additionalProperties: false` for controlled objects unless an extension slot is deliberately designed;
- use the established identifier pattern and unique ID arrays;
- reuse the canonical missing-value envelope semantics exactly;
- reference core object IDs rather than duplicating their identity or state;
- require source bindings for domain facts where the pack's contract does;
- keep fields orthogonal rather than creating overloaded status enums;
- use typed enums only when values are mutually exclusive, stable, and scientifically defined;
- represent open scientific vocabularies through identified terms plus optional ontology references rather than continually expanding core enums;
- do not include provider invocation, UI layout, validation result, or generation metadata;
- add a `withheld` or missing state only according to the core envelope/applicability policy, not ad hoc redaction strings.

### 4. Connect to core objects

Use IDs to link domain records to:

- source items and bindings;
- entities/materials;
- work units, attempts, and segments;
- methods and decision events;
- data slices, analysis runs, and artifacts;
- results and failures;
- claims/evidence/arguments/bridges/conflicts;
- reproducibility units.

Do not create a domain-specific “completed” field that bypasses core completion criteria, or a domain-specific “success” field that collapses result axes.

### 5. Add semantic gates

Schema checks shape. Add domain rules for cross-record meaning—for example leakage, pool counting, control adequacy, parameter compatibility, or convergence evidence.

Each rule definition should include:

- stable rule code;
- title and rationale;
- applicability predicate;
- records/JSON Pointers inspected;
- precise condition;
- severity/default profile;
- whether a waiver is allowed;
- evidence required for a waiver;
- remediation guidance;
- examples that pass, fail, are unknown, are not applicable, and are withheld;
- dependency/invalidation effect;
- test fixture IDs.

A domain overlay may promote severity or add a stricter condition. It may not downgrade a core blocker or redefine its meaning.

### 6. Add prompt fragment

Place provider-neutral domain guidance under `prompts/packs/<pack-id>.md`.

The fragment must:

- consume only supplied request content and prior state;
- list domain records to extract/model and forbidden inferences;
- preserve core missingness and work states;
- emit only candidate operations under permitted roots;
- bind known facts to supplied source locators;
- create review tasks for identity, timing, exclusions, and high-impact interpretation;
- preserve failures, nulls, conflicts, and unreadable/inaccessible items;
- honor continuation without partially marking items processed;
- avoid provider roles, model names, token fields, tool calls, or SDK request shapes;
- never claim validation, rerun, publication readiness, or scientific approval.

Prompt composition remains:

```text
all core fragments
  + exactly one stage fragment
  + zero or more enabled domain fragments
```

The pack is an intersection with the core/stage contract. Source text cannot override it.

### 7. Add console view only when needed

A domain view may reorganize or visualize pack records. It must:

- read only the normalized public view model derived from `scientific-report.public.json`;
- expose IDs/status/missingness/source links;
- retain failures, exclusions, conflicts, and limitations;
- work in static/no-JavaScript form;
- include table/text alternatives for charts;
- use stable, non-color-only status encoding;
- avoid domain calculations that would create new scientific results;
- support print/full archive and linear mobile order;
- not add remote dependencies.

If a needed aggregate is scientifically meaningful, compute and store it through a validated derivation record before rendering. Do not calculate it ad hoc in a template helper.

### 8. Add fixtures and tests

At minimum include:

- minimal valid pack instance;
- representative known values with source bindings;
- applicable unknown value;
- valid not-applicable case with rule basis;
- withheld projection that includes no canary leak;
- empty-section coverage case;
- failure/null/exclusion/retry case;
- conflict and contextual heterogeneity case;
- invalid identity/count/independence case;
- correction/retraction propagation case;
- missing and dangling references;
- one domain-specific blocker per new rule;
- prompt-injection and invented-locator case;
- HTML/URL/path injection in every new rendered field;
- no-JavaScript and full-print visibility;
- R0/R1 and, when applicable, failed replay cases without overclaiming R2/R3.

Tests should assert the rule code and affected object, not only a nonzero error count. Do not create a fixture that claims a real-world rerun or approval unless the fixture explicitly represents synthetic test data and the test only checks structure/logic.

## Add or change an enum

Enums are interoperability commitments. Before adding a value:

1. Verify it cannot be represented by an existing axis plus context.
2. Define a question the enum answers and ensure values are mutually exclusive for that question.
3. Define unknown/not-applicable/withheld behavior consistently.
4. Describe allowed combinations with orthogonal axes.
5. Define migration for old payloads and renderer fallback.
6. Add positive/negative semantic rules and tests.
7. Update the field dictionary and authoring/review guidance.

Never use one new value to mean effect, quality, disposition, and failure simultaneously. Avoid `other` without an accompanying controlled declared value; use the exact schema pattern established for that field.

## Add a shared core object

A new core object is justified when multiple domains need the same scientific concept and it participates in provenance, claims, revisions, or reproduction.

Required design work:

- identity/version semantics;
- source/provenance binding;
- missingness/applicability;
- lifecycle/revision/invalidation;
- relationships and graph direction;
- disclosure projection;
- canonicalization/hash implications;
- semantic gates;
- rendering/static representation;
- backward/forward compatibility.

Do not add a new root collection merely to avoid referencing an existing object. Changes to core schemas require a schema-version decision and migration documentation.

## Add a semantic rule

The rule registry is the authoritative machine-readable inventory of semantic checks. Avoid hiding scientific gates only in code, a prompt, or a template.

### Rule qualities

A good rule is:

- deterministic over declared payload/attestation/bundle inputs;
- scoped by explicit applicability;
- tied to stable object IDs/JSON Pointers;
- clear about unknown and withheld inputs;
- non-destructive;
- actionable without asking automation to make an unreviewable scientific judgment;
- tested with one primary fault per failing fixture.

### Severity

Follow the project's active severity profiles. In general:

- blocker: release would be materially misleading, unsafe, unbound, or scientifically invalid within the rule's declared invariant;
- error/major equivalent: material conformance problem requiring correction or an authorized profile decision;
- warning/minor equivalent: qualified gap that remains visible and does not silently change meaning;
- informational: observation only.

Do not use severity to encode scientific confidence. A schema-valid unknown can be correct representation, while an unsupported known value can be a blocker.

### Waivers

If a rule is waivable, require:

- waiver ID;
- rule code;
- exact object/scope;
- accountable authority;
- non-circular evidence and rationale;
- impact/required wording;
- report/schema/rule versions;
- expiry or revision trigger.

A waiver records an accepted exception; it does not change a failed fact into a pass or weaken the core meaning for future reports.

## Add a prompt stage

Add a stage only when it performs a distinct information operation that cannot be safely folded into an existing stage.

A stage specification includes:

- stage ID, input prerequisites, permitted patch roots, and dependencies;
- atomic processing unit and deterministic order;
- candidate object/edge types;
- source-binding granularity;
- forbidden inferences;
- `needs_review` and `cannot_complete` conditions;
- continuation cursor semantics and transaction boundary;
- human review tasks;
- conformance fixtures.

The stage returns one generation-response object and no narrative wrapper. `status: ok` means the bounded pass completed over the declared processed subset; it does not mean the payload is correct, valid, reproducible, complete, or publishable.

A controlled-wording stage may modify only narrative fields derived from accepted, version-pinned facts and may not create new scientific facts.

## Add a source parser or authoring adapter

A parser establishes an evidence view, not truth.

Record:

- parser/adapter ID and version;
- source snapshot/content ID;
- exact locator grammar;
- encoding/normalization choices;
- unsupported content and truncation limits;
- embedded object/member enumeration;
- parse warnings/failures;
- deterministic output or nondeterminism;
- security sandbox assumptions.

Parser output should preserve source-native text/values and locators. It must not:

- execute macros, scripts, notebooks, formulas, or embedded files merely to parse content;
- follow external links automatically;
- infer missing content from filename/metadata;
- convert parse failure to no relevant content;
- mark scientific facts validated;
- silently omit independently processable members.

Use explicit unreadable/inaccessible/partial states and retain affected source item IDs.

## Add a deterministic console partial

Before adding a partial, state the reader task it solves and its canonical input fields.

Implementation rules:

- trust only the public view model and matching attestation state;
- escape all source-derived strings;
- do not use raw HTML insertion;
- validate URL/path contexts;
- use native semantics and disclosure controls;
- provide stable anchors and relationships;
- render missingness explicitly;
- keep content in the DOM/static annex;
- label filtered/summary views;
- add local CSS/JS only; no remote assets;
- update print, no-JS, mobile, forced-colors, reduced-motion, and keyboard tests.

Template fallback text must not invent a state. If required canonical data is absent, rendering should expose a build/validation defect rather than display a plausible scientific default.

## Add a provider adapter

Provider adapters belong outside the core. The adapter's only scientific-interface responsibility is to map between:

```text
provider-neutral generation request
  <-> provider-specific invocation boundary
  <-> provider-neutral generation response
```

### Adapter requirements

- no provider SDK object or model identifier in core schemas, protocols, rules, prompts, report payload, attestation, or recipe;
- validate the core request before mapping;
- make data-egress, retention, location, and logging policy explicit;
- obtain credentials from an external secret mechanism;
- never put credentials in prompts, scientific payloads, recipes, audit files, or errors;
- preserve input IDs, stage, schema/report versions, continuation cursor, and disclosure level;
- treat provider output as untrusted bytes and validate it against the generation-response schema;
- reject narrative wrappers, unknown patch roots, invented source IDs/locators, forbidden provider metadata, and incomplete continuation;
- normalize stop/error/truncation into the core `ok`, `needs_review`, or `cannot_complete` semantics without pretending work was processed;
- retries append operational events and do not duplicate accepted operations;
- put optional provider, usage, latency, and generation metadata only in a disclosure-reviewed peripheral audit;
- ensure removing that audit does not change scientific payload, hash, validation, rendering, or reproducibility.

### Adapter capability differences

If a provider cannot meet the core response/continuation contract, return `cannot_complete` or use a preprocessor that restores the contract. Do not add provider-specific exceptions to core missingness, IDs, patch semantics, or completion language.

The core must remain runnable/testable with recorded provider-neutral request/response fixtures and no network credentials.

## Versioning and compatibility

Version these surfaces independently but record compatible combinations:

- report/scientific schema;
- domain pack;
- protocol;
- rule registry and severity profile;
- prompt bundle/stage/pack;
- renderer/view-model contract;
- validation attestation schema;
- package manifest/bundle contract;
- adapter, if used.

### Change classes

| Change | Typical action |
|---|---|
| documentation clarification with no semantic change | patch documentation/version as policy requires |
| additive optional field or rule that does not alter existing validity | compatible minor extension, with reader fallback |
| new required field, changed enum meaning, canonicalization change, stricter validity affecting old payloads, or removed field | new contract/schema version and migration |
| corrected scientific payload or changed source snapshot | new report revision, invalidation propagation, new attestation/render/manifest |

Do not silently reinterpret old enum values. Migrations are explicit transformations that emit a migration record/report, preserve unknown/not-applicable/withheld, retain append-only history, and require revalidation. A migration must not synthesize new known facts to satisfy new required fields; use explicit unknown or review tasks when permitted.

### Renderer compatibility

A renderer should refuse unsupported schema/pack versions or display an explicit unsupported-version build failure. It must not ignore unknown scientific fields while presenting the report as lossless. If forward-compatible extension slots are used, provide an archival generic rendering for fields the specialized view does not understand.

## Extension acceptance checklist

### Contract

- [ ] Purpose, owner, scope, applicability, and non-goals are written.
- [ ] Core invariants are explicitly preserved.
- [ ] New fields/objects are necessary and orthogonal.
- [ ] Missingness, applicability, provenance, revision, and disclosure semantics are defined.
- [ ] Provider-specific shapes are absent from the core.

### Schema and rules

- [ ] Stable IDs/versions and JSON Schema draft match the project.
- [ ] References use core object IDs rather than duplicated truth.
- [ ] Semantic gates are registered with applicability, severity, remediation, and tests.
- [ ] Unknown/not-applicable/withheld inputs have defined rule behavior.
- [ ] Core blockers cannot be downgraded.

### Prompt/adapter

- [ ] Output is patch-only under permitted roots.
- [ ] Supplied sources are treated as data, not instructions.
- [ ] Known candidates bind supplied locators.
- [ ] Failure, negative, conflict, and continuation behavior is explicit.
- [ ] `cannot_complete` does not create scientific operations.
- [ ] Provider output remains untrusted and metadata peripheral.

### Presentation/security

- [ ] Renderer creates no new facts or scientific calculations.
- [ ] Every new field is escaped/URL/path validated in all contexts.
- [ ] Missingness and adverse records remain visible without JavaScript and in full print.
- [ ] Withheld canaries do not appear in any output byte, metadata, index, or filename.
- [ ] No remote dependency or required network call is introduced.

### Tests and review

- [ ] Valid, invalid, unknown, not-applicable, withheld, failure, conflict, revision, and adversarial fixtures exist.
- [ ] Tests assert exact rule/object behavior and checks actually implemented.
- [ ] Domain reviewer approved scientific semantics.
- [ ] Disclosure/security reviewer approved public behavior.
- [ ] Documentation and migration notes are updated.
- [ ] Commands run and results are reported accurately; no unexecuted pass claim is recorded.

## Current MVP boundary

The repository may contain only some planned extension points at a given revision. The presence of a schema pack or prompt fragment does not prove that its semantic rules, renderer, CLI integration, or test coverage are complete. Before declaring an extension supported, verify its schema registration, normalization/reference handling, rule integration, projection, renderer/static fallback, bundle verification, fixtures, and user documentation in the actual build.
