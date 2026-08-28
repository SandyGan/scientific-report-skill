# Integration blockers

**Status: resolved in the active MVP contract set.**

These issues were found independently while foundation modules were implemented in parallel. Their original discrepancy statements are retained below so retired draft vocabularies cannot return as silent aliases. The normative source remains `protocol/`; the active schemas, TypeScript types, normalizer, rules, validator, rendering, examples, prompts, and documentation now use the same contracts. A future regression reopens the affected blocker and stops release.

Closure evidence names the executable or structural coverage that guards each resolution. It does not assert that a check ran in any particular consumer environment; release records must preserve the commands, versions, output, and exit statuses actually observed.

## IB-001 — Public withheld provenance — RESOLVED

- Normative disclosure policy requires public `withheld` envelopes to use `value: null`, no protected source or derivation bindings, a non-sensitive reason/decision reference, and `provenance_status: absent`.
- The common schema initially disallowed `absent` for `withheld`.
- Closure requires schema alignment plus positive and negative projection fixtures.

**Closure evidence:** `schemas/defs/common.schema.json` permits absent provenance while `MIS001` enforces context-sensitive public/non-public withheld semantics; `tests/schema/scientific-report.schema.test.ts` covers binding-free public withholding and rejects unsafe variants; renderer security tests reject protected values and bindings.

## IB-002 — Result and disposition semantics — RESOLVED

Canonical values come from `protocol/result-axes.yaml`. Material divergences to close include:

- Scientific effect must preserve `effect_present_direction_uncertain` and `withheld`; schema-only `association_positive`, `association_negative`, and `descriptive_only` must not silently replace the protocol concepts.
- Statistical decision uses protocol spellings and meanings including `noninferior`, `descriptive_only`, `not_performed`, and `withheld`; schema-only `non_inferior`, `superior`, and `not_tested` require removal or an explicit non-lossy migration decision.
- Record disposition must preserve `contextual`, `pending_review`, `not_applicable`, and `withheld`; schema-only `secondary`, `exploratory`, and `not_assigned` cannot be treated as synonyms without a normative mapping.
- Failure remains a separate axis/event and must not overwrite scientific effect, statistical decision, interpretability, or disposition.

Closure requires exact protocol-aligned enums across schema/types/validator/examples/UI, an explicit migration for any retired draft values, and round-trip plus adversarial tests.

**Closure evidence:** `schemas/defs/result-and-disposition.schema.json`, `src/lib/types.ts`, `src/normalizer/normalize.ts`, validator rules, the cross-domain example, and renderer views use the exact protocol values. Retired values remain documented only as rejected migration inputs; schema and render-semantics tests cover orthogonal effect, decision, interpretability, disposition, and separate failure records.

## IB-003 — Work attempt and segment enums — RESOLVED

Canonical protocol values:

- Attempt outcome: `succeeded | partially_succeeded | failed | aborted | cancelled_after_start | running_at_cutoff | outcome_unknown`.
- Segment state: `completed | stopped | crashed | superseded_by_restart | running_at_cutoff | unknown`.

The initial schema used compressed `attempt_status`/`segment_status` enums that cannot represent cancellation, cutoff, restart supersession, and crash distinctly.

Closure requires schema/types/validator/examples/UI alignment and regression fixtures for failure → checkpoint → changed-parameter restart.

**Closure evidence:** `schemas/defs/work-execution.schema.json` and the matching TypeScript/normalizer/renderer surfaces preserve all canonical outcomes and segment states. `tests/state-transitions/work-and-timing.test.ts`, `tests/fixtures/execution-scenarios.ts`, and render-semantics fixtures retain failed attempts, partial output, restart supersession, and changed parameters.

## IB-004 — Source coverage model — RESOLVED

Canonical protocol requires `authority_basis`, `enumeration_status`, `snapshot_bindings`, `item_ids`, dispositions, reconciliation, and multi-axis completeness including:

- `proven_within_declared_universe`
- `registered_sources_accounted_for`
- `partial`
- `cannot_be_established`

The initial schema compressed these into `universe_status` and `completeness_claim`, losing information.

Closure requires replacing the compressed shape and aligning absolute-completeness wording checks.

**Closure evidence:** `schemas/defs/source-coverage.schema.json`, protocol, types, normalizer, summaries, validator, renderer, and example use authority basis, enumeration status, snapshots, item IDs, reconciliation, three coverage axes, and bounded report completeness. `tests/coverage/source-coverage.test.ts` covers a frozen ten-item gap and the non-authoritative wording gate.

## IB-005 — Reproducibility model — RESOLVED

Canonical policy levels:

- `not_assessed`
- `R0_documented`
- `R1_replay_ready`
- `R2_verified_replay`
- `R3_independent_reproduction`

Canonical criticality: `critical | supporting | contextual`.

Canonical axis states: `satisfied | partial | unsatisfied | unknown | not_applicable | withheld`.

The initial schema used different level names, unit kinds, criticality values, and axis structures.

Closure requires one shared canonical model across schema, validator, examples, HTML, docs, and tests.

**Closure evidence:** `schemas/defs/reproducibility-unit.schema.json`, `src/lib/types.ts`, `src/validator/reproducibility-rules.ts`, summaries, renderer, example, and `docs/reproducibility-contract.md` share the canonical levels, criticality, axis states, event records, and denominators. `tests/reproducibility/scoped-reproducibility.test.ts` guards independent unit assessment and conservative critical lower bounds.

## IB-006 — Rule-code collision — RESOLVED

- `SEC001` is reserved for unsafe/active-content security validation.
- Protocol section-manifest rules initially reused `SEC001` for missing manifest sections.
- Protocol-local manifest rules must use `MNF*`; tests must assert uniqueness of all rule codes.

**Closure evidence:** section-manifest rules use `MNF001`–`MNF005`; `SEC001` remains the unsafe-content rule in the registry. `tests/prompt-conformance/rule-code-uniqueness.test.ts` asserts registry uniqueness, the exact manifest namespace, registry coverage, and the reserved `SEC001` meaning.

## IB-007 — Claim, argument, bridge, and conflict contract — RESOLVED

`protocol/argument-and-bridge.yaml` is normative. The canonical Claim shape includes `object_version`, `proposition`, `claim_type`, `subject_bindings`, `context`, `scope`, `decision_timing`, and `support_status`, with explicit quantitative, negative/absence, and resolution claim types and supported/contested-style support states.

The initial claim schema instead used a parallel vocabulary (`claim_version`, `claim_kind`, `statement`, `scope_and_conditions`, `claim_status`, `confidence_class`, `importance`) and also diverged on bridge, argument validity, and conflict states. These are not accepted as silent aliases.

Closure requires selecting the protocol vocabulary, aligning schema/types/validator/examples/renderer/docs, migrating any draft examples explicitly, and testing DAG validity, version-pinned dependencies, invalidation propagation, contested evidence, and cross-domain condition mismatch.

**Closure evidence:** `schemas/defs/claim-argument.schema.json` and every active implementation surface use protocol claims, explicit graph edges, scoped argument validity, canonical bridge alignments, and conflict adjudication. `tests/argument-graph/argument-integrity.test.ts` and its scenario fixtures cover DAG cycles, version pins, invalidation, contested/invalid evidence, and bridge mismatch.

## IB-008 — Public runtime API drift — RESOLVED

The agreed public contracts are:

- `normalizeAuthoringFile(path, options?)` returns `{ report, findings, todo }` without writing an output file.
- `renderReport(report, { outDir, attestation?, force? })` uses `outDir` as the sole public output-directory field.

Draft implementations diverged by using the second normalizer positional argument as `outputPath`, exposing a separate `normalizeAuthoringInputFile`, returning `todos`, and accepting renderer options named `outputDir`/`outputDirectory`. CLI temporarily used structural aliases while modules landed in parallel.

Closure requires one unambiguous public signature per operation, renaming any write-to-path convenience helper (for example `normalizeAuthoringFileToPath`), aligning CLI imports, declarations, README examples, and type tests, removing structural CLI wrappers, and preventing positional options from being interpreted as a path.

**Closure evidence:** `normalizeAuthoringFile(path, options?)` returns `{ report, findings, todo }`; the explicit writer is `normalizeAuthoringFileToPath`; `renderReport` accepts only `outDir`. The CLI calls these signatures directly, declarations are generated from the same sources, and normalizer/CLI tests guard object options, `todo`, and render eligibility.

## IB-009 — Build output and package entrypoint mismatch — RESOLVED

With `tsconfig.json` using `rootDir: "."`, `src/cli/index.ts` emits to `dist/src/cli/index.js`, while the draft package `bin` points to `dist/cli/index.js`. A successful TypeScript build would therefore publish a broken executable path.

Closure requires one deliberate build layout, aligned `rootDir`/include settings, package `bin`, scripts, declaration output, release contents, and a clean-install test that invokes the packaged executable rather than `tsx` source. The release archive must not rely on an unbuilt source-only CLI.

**Closure evidence:** `tsconfig.json` emits `src/cli/index.ts` to `dist/cli/index.js`, matching the package `bin`. The CLI entrypoint resolves package-manager symlinks before deciding whether it was directly invoked, and `src/cli/index.test.ts` guards that installed-bin path. Release verification includes packing, clean local installation, and invocation of `node_modules/.bin/report-prompt`.

## IB-010 — Validator format binding runtime failure — RESOLVED

CLI smoke testing reached the validator but `validate` exited with `Error: addFormats is not defined`, indicating the Ajv formats integration is referenced without a valid import/binding in the schema loader path.

Closure requires fixing the actual module import/call, strict typechecking, a direct validator smoke test, CLI validate tests for valid and invalid reports, and confirmation that date-time/URI/hash formats are really enforced rather than disabling formats to remove the error.

**Closure evidence:** `src/lib/schema.ts` imports and binds `ajv-formats`, keeps `validateFormats: true`, and compiles every schema into one repository; the standalone verifier applies the same formats integration. Schema/validator tests include malformed format cases, and both source and built CLI validation paths exercise the loader.

## Release gate

Every blocker must have:

1. one canonical contract;
2. aligned schema and TypeScript representation;
3. validator behavior;
4. at least one positive and one adversarial fixture;
5. rendered wording where user-visible;
6. no compatibility alias that silently changes meaning;
7. an explicit resolved record in the zero-based review report.
