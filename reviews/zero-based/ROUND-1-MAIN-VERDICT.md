# Round 1 zero-context AI review

**Status: FAIL — not release eligible.**

This record contains the main-workflow verdict. Four planned agents failed at API/runtime boundaries across the full run: two first-pass scopes and one verifier were absent from the final panel; a separate supplement process is used to close those coverage gaps. The 31 findings below were independently reproduced by three completed verification panels.

# Final zero-context review decision: FAIL

All **31 candidates survive**. Each was confirmed independently by all three verification panels, with no refutations.

- **Blocker:** 0
- **High:** 25
- **Medium:** 6
- **Low:** 0

The project must not receive an automated-review PASS until every high and medium finding below is corrected and its acceptance test passes.

## High-severity survivors

### F1 — Later-stage trusted state has no request channel

- **Anchor:** `<project-root>/schemas/generation-request.schema.json:386`
- **Reproduced failure:** An `S6_argument_graph` request containing only object IDs and hashes, with no accepted scientific object bodies, validates. Adding `accepted_working_state_objects` is rejected as an additional property, even though the stage requires accepted/version-pinned questions, results, evidence, failures, limitations, derivations, and revisions.
- **Required correction:** Add stage-discriminated, typed accepted-state payloads containing complete object bodies, exact versions and hashes, and explicit trust/acceptance status. Later stages must reject requests that provide required state only through references or untyped extensions.
- **Acceptance test:** An S6 request without the required accepted-state bodies fails validation; a request containing correctly versioned, hash-bound, accepted bodies passes and can construct the argument graph without consulting raw chunks or inventing content.

### F2 — Published patches target an unauthorized nonexistent root

- **Anchor:** `<project-root>/prompts/contracts/response.example.json:16`
- **Reproduced failure:** The example targets `scientific-report.schema.json` but writes to `/staging/atomic_records/-`, a root forbidden by that schema. Unrelated operation paths still validate, while `permitted_patch_roots` cannot be represented in the request.
- **Required correction:** Add required typed patch-root authorization, enforce every operation against both those roots and the selected target schema, and correct the example’s target/path pairing.
- **Acceptance test:** The published response applies atomically to its declared target; a path outside the authorized roots or absent from the target schema fails before application.

### F3 — Valid stage codes have missing or ambiguous prompts

- **Anchor:** `<project-root>/schemas/generation-request.schema.json:311`
- **Reproduced failure:** `S3_normalization` validates, but the eight stage documents contain no normalization prompt and no exact S0–S8 declarations, leaving nine enum values without a one-to-one routing map.
- **Required correction:** Declare an exact stage code in every stage contract and either add the S3 normalization contract or consistently remove/reclassify S3 as a non-generation operation.
- **Acceptance test:** A conformance test proves every accepted stage code resolves to exactly one implementation or prompt and that no prompt or route is unrepresented.

### F4 — README-required response shape is schema-invalid

- **Anchor:** `<project-root>/prompts/README.md:28`
- **Reproduced failure:** Responses following the README are rejected because `prompt_id`, `prompt_version`, `continuation.state`, and `source_binding_ids` are forbidden or conflict with schema-required vocabulary.
- **Required correction:** Establish one canonical response vocabulary across the README, schemas, core/stage prompts, examples, and generated types.
- **Acceptance test:** Every normative JSON snippet in the documentation validates unchanged, and schema-generated examples satisfy every documented requirement.

### F5 — Chunk contract cannot disclose upstream truncation

- **Anchor:** `<project-root>/schemas/defs/common.schema.json:1429`
- **Reproduced failure:** `ContentChunk` rejects truncation and continuation metadata even though Stage 02 requires ordered chunks with truncation/overlap semantics. A cut chunk can therefore appear complete.
- **Required correction:** Add required source extent, sequence, overlap, truncation, parser-result/quality, and stable sub-item metadata. Unknown completeness must force `cannot_complete` or explicit omissions.
- **Acceptance test:** Split a source immediately before a failed-control or negative-finding qualification. The boundary metadata must validate, reassembly must preserve the qualification exactly once, and missing completeness metadata must prevent a complete disposition.

### F6 — Resume cursors are arbitrary and unverifiable

- **Anchor:** `<project-root>/schemas/generation-request.schema.json:409`
- **Reproduced failure:** Instruction-like cursor text and a fabricated all-zero prior hash validate. No contract binds the cursor to the request, stage, state snapshot, next unit, prior response, or accepted operation set.
- **Required correction:** Use signed orchestration-owned or server-stored cursors bound to all relevant lineage and operation IDs, and validate them before model invocation.
- **Acceptance test:** Valid continuation succeeds; cursor tampering, replay, wrong stage/request, stale state, altered prior response, and duplicate accepted operations are each rejected deterministically.

### F7 — Source bindings need no immutable content identity

- **Anchor:** `<project-root>/schemas/defs/common.schema.json:61`
- **Reproduced failure:** Removing snapshot ID, content/excerpt hashes, and parser identity still yields a valid published response; operation-level binding arrays may also be empty.
- **Required correction:** Require immutable snapshot/content identity and applicable parser identity for content-derived bindings, at least one binding for source-derived operations, and typed premise references for accepted-state derivations.
- **Acceptance test:** A source-derived operation with no binding, or with only a mutable source label and free-text locator, fails; a byte/hash/parser-bound operation passes.

### SCI-001 — BRG001 skips claims with no bridge

- **Anchor:** `<project-root>/src/validator/claim-rules.ts:148`
- **Reproduced failure:** Removing all bridge IDs and bridge records from an MD-to-wet-lab mechanistic claim leaves the report schema-valid and release-eligible because BRG001 returns early.
- **Required correction:** Derive bridge necessity from claim/evidence domains, entities, mappings, and transfer type rather than from self-declared bridge IDs.
- **Acceptance test:** A mechanistic cross-domain claim without a bridge fails BRG001; a same-domain claim does not require one; a fully resolved valid bridge passes.

### SCI-002 — Valid bridges omit dose and endpoint alignment

- **Anchor:** `<project-root>/schemas/defs/claim-argument.schema.json:275`
- **Reproduced failure:** A bridge explicitly describing 1 nM versus 10 µM and contact occupancy versus viability incompatibility remains `valid` and passes BRG001.
- **Required correction:** Add typed dose/intervention, endpoint/observable, state, and time alignments with source-bound transformations. Applicable dimensions must be matched or bounded before `valid` status is allowed.
- **Acceptance test:** The reported dose/endpoint mismatch fails bridge validity unless an explicit, evidence-bound transformation resolves it; matched dimensions pass.

### SCI-003 — Resolved questions need no supported claim

- **Anchor:** `<project-root>/schemas/defs/claim-argument.schema.json:51`
- **Reproduced failure:** A question marked resolved with a confident answer and only an unsupported, evidence-free claim passes all semantic checks and remains release-eligible.
- **Required correction:** Require structured criterion assessment, at least one admissibly supported or qualified claim satisfying that criterion, and no unresolved blocker.
- **Acceptance test:** A resolved question supported only by unsupported claims fails or is forced to a non-resolved status; an admissibly supported claim satisfying the recorded criterion permits resolution.

### SCI-004 — Retractions do not reopen resolved questions

- **Anchor:** `<project-root>/src/validator/revision-rules.ts:164`
- **Reproduced failure:** Retraction downgrades the sole evidence and claim but leaves the linked question resolved with its obsolete answer.
- **Required correction:** Propagate revision closure into research questions and derived summaries, recomputing status and answer unless an independent valid support path still satisfies the criterion.
- **Acceptance test:** Retracting the sole support reopens the question and invalidates derived summaries; retracting one of two independent valid paths leaves resolution only when the remaining path still meets the criterion.

### SCI-005 — CNF001 detects only increase/decrease conflicts

- **Anchor:** `<project-root>/src/validator/claim-rules.ts:242`
- **Reproduced failure:** Aligned `equivalent` and `increase` conclusions coexist without a `ConflictSet`; CNF001 and release validation pass.
- **Required correction:** Define and apply an incompatibility matrix covering scientific-effect and statistical-decision axes while comparing the complete scientific context.
- **Acceptance test:** Like-for-like equivalence versus increase requires a conflict record or contested status; conclusions separated by relevant context are treated as heterogeneity rather than a false conflict.

### SCI-006 — Null eligibility ignores failed control records

- **Anchor:** `<project-root>/src/validator/negative-rules.ts:15`
- **Reproduced failure:** A wet-lab no-signal result with an explicitly failed required positive control and missing analysis population/context remains eligible as biological counterevidence because detached aggregate flags say controls and QC passed.
- **Required correction:** Link and reconcile negative assessments with concrete control, QC, population, sensitivity, measurement, and decision records. Detached flags must not override contradictory source records.
- **Acceptance test:** A failed or indeterminate required positive control, missing population, or inadequate sensitivity blocks absence/equivalence eligibility; a complete passing record set permits it.

### SCI-007 — WET001 counts shared-donor pools as independent

- **Anchor:** `<project-root>/src/validator/domain-rules.ts:110`
- **Reproduced failure:** Two pools derived from one donor validate with `biological_n=2`; lineage is not traversed.
- **Required correction:** Compute biological N from independent ancestor groups using `parent_specimen_ids` and `pool_members`, require an independence basis, and separately reconcile technical N and analysis units.
- **Acceptance test:** Two pools from one donor permit biological N of at most one; pools from two demonstrably independent donors permit two.

### REPRO-001 — R1 accepts identifiers and labels instead of replay records

- **Anchor:** `<project-root>/src/validator/reproducibility-rules.ts:63`
- **Reproduced failure:** A nonresolvable recipe ID, unknown command and working directory, no arguments or inputs, and null environment/random-state IDs still receive R1 and release eligibility.
- **Required correction:** Require resolvable versioned recipe records and complete historical invocation, input/output, environment, and random-state bindings; derive axes from those records.
- **Acceptance test:** Missing recipe content or replay context caps the unit at R0; a resolvable recipe plus complete hash-bound context can attain R1.

### REPRO-002 — R2 trusts a bare met flag under an undefined comparator

- **Anchor:** `<project-root>/src/validator/reproducibility-rules.ts:102`
- **Reproduced failure:** R2 is granted with `comparison_result=met` even though comparator equivalence, tolerances, nondeterminism policy, event inputs, environment, and comparison evidence are absent or unknown.
- **Required correction:** Validate comparator-specific semantics and require complete replay context plus hash-bound, target-level comparison evidence; recompute comparisons where possible.
- **Acceptance test:** Unknown comparator semantics or absent replay evidence prevents R2; a fully defined comparator with reproducible machine-checked agreement permits R2.

### REPRO-003 — Verified offline bundles can omit declared replay artifacts

- **Anchor:** `<project-root>/src/renderer/index.ts:78`
- **Reproduced failure:** An open, available-now, known-hash R1 artifact is absent from both bundle and manifest, while bundle verification returns success.
- **Required correction:** Copy and hash-check every public R1+ dependency, manifest it by source artifact ID, and reconcile report dependencies against manifest members during final verification.
- **Acceptance test:** Omitting any declared available R1+ dependency fails bundling or verification; including it at the declared path with the correct size/hash passes.

### REPRO-004 — A table name alone is accepted as an exact data slice

- **Anchor:** `<project-root>/src/validator/derivation-rules.ts:78`
- **Reproduced failure:** A 12-of-14-row slice with only the table name known and row selector, query, and filters unknown retains complete derivation closure.
- **Required correction:** Enforce locator-kind-specific selection semantics, requiring deterministic selectors/query/filters or an explicit all-records declaration.
- **Acceptance test:** Table identity alone yields partial closure; a deterministic selector that reconstructs the exact rows yields complete closure.

### REPRO-005 — Critical floors and coverage use self-selected denominators

- **Anchor:** `<project-root>/src/lib/summaries.ts:116`
- **Reproduced failure:** Relabeling a weak unit from critical to supporting raises the floor from R0 to R1, and default coverage reports 1/1 because target IDs are derived from the same covered IDs; an independent denominator reveals 1/2.
- **Required correction:** Establish independent decision/source-bound critical-unit and claim/output target sets, validate criticality changes, and report uncovered IDs.
- **Acceptance test:** Omitting or relabeling a key target cannot remove it from the denominator or raise the conservative floor without a validated criticality decision; uncovered targets appear explicitly.

### REPRO-006 — R1 accepts an unknown, empty access procedure

- **Anchor:** `<project-root>/src/validator/reproducibility-rules.ts:66`
- **Reproduced failure:** `verified_procedure` with unknown conditions, no assessed/evidence artifacts, and no historical inputs still receives R1 because empty-list hash checks pass vacuously.
- **Required correction:** Require an enumerated dependency set, scoped actor, actionable access conditions or bound private attestation, authority/license information where relevant, and artifact reconciliation.
- **Acceptance test:** Unknown conditions or an empty dependency set where dependencies exist prevents R1; a complete, actionable, evidence-bound access procedure passes.

### REPRO-007 — The prompt pipeline has no reproducibility authoring stage

- **Anchor:** `<project-root>/prompts/README.md:84`
- **Reproduced failure:** No stage authors reproducibility units, comparison specifications, replay events, conservative levels, or recipes. A report with substantial computational provenance but zero reproducibility units remains release-eligible.
- **Required correction:** Add a dedicated reproducibility stage covering every key computation with a bounded unit or explicit gap/non-applicability decision, plus a semantic release gate.
- **Acceptance test:** A computational report with uncovered key work fails release; the same report passes only after each key computation has a validated unit or explicit justified gap.

### renderer-absolute-path-root-bypass — Absolute `/opt` and `/mnt` paths pass release redaction

- **Anchor:** `<project-root>/src/renderer/safety.ts:91`
- **Reproduced failure:** `/opt/acme/private/source.txt` remains in public JSON and HTML while rendering and verification pass and the manifest asserts `absolute_paths_present=false`.
- **Required correction:** Centralize a field-aware generic absolute-filesystem-path detector across validation, rendering, bundling, and verification, with explicit URI/JSON-pointer exceptions.
- **Acceptance test:** `/opt`, `/mnt`, uncommon POSIX roots, Windows drives, UNC paths, and file URLs are redacted or block release; the manifest accurately records detected paths.

### offline-html-entity-url-bypass — Encoded remote URLs pass the offline verifier

- **Anchor:** `<project-root>/src/bundler/offline.ts:47`
- **Reproduced failure:** `https&#58;&#47;&#47;example.com/tracker.png` is certified local/offline, while JSDOM decodes it to a live remote URL.
- **Required correction:** Parse HTML with standards-compliant browser semantics, classify decoded and resolved resource attributes, and require appropriate CSP handling.
- **Acceptance test:** Decimal, hexadecimal, named-entity, mixed-case, malformed-markup, and redirected remote URL forms all fail offline verification; missing required CSP also fails.

### human-review-cross-file-binding — Unrelated human approval verifies as package-bound

- **Anchor:** `<project-root>/src/verifier/index.ts:684`
- **Reproduced failure:** An approving human-review attestation for a different report, scientific hash, and validation attestation is accepted in the package with no binding finding.
- **Required correction:** Compare the parsed human-review report identity, scientific payload hash, validation-attestation identity/hash, and observed status against the actual package members.
- **Acceptance test:** Any mismatch in those bindings fails verification; a correctly bound approval passes.

### reproducibility-axis-substitution — Replay matrix substitutes non-axis status as satisfied

- **Anchor:** `<project-root>/src/renderer/view-model.ts:763`
- **Reproduced failure:** Canonical environment/random-state capture axes marked unsatisfied render as satisfied because bound record assessments are substituted.
- **Required correction:** Populate prominent tiles from canonical `axis_assessments`; show record availability and access diagnostics separately and retain both rationales.
- **Acceptance test:** An unsatisfied canonical axis always renders unsatisfied regardless of a bound record’s state; record-state diagnostics remain visible separately.

## Medium-severity survivors

### F8 — Failure diagnostics reject the required reasons

- **Anchor:** `<project-root>/schemas/generation-response.schema.json:417`
- **Reproduced failure:** A structured unreadable-item reason is rejected, while a bare item ID validates.
- **Required correction:** Replace bare ID arrays with structured dispositions, or require one-to-one reason records containing cause, explanation, parser/access status, source binding, retryability, and stage disposition.
- **Acceptance test:** An unreadable/excluded item without a reason fails; a complete structured disposition passes and remains traceable to its source.

### F9 — Published prompt references do not identify current prompts

- **Anchor:** `<project-root>/prompts/contracts/request.example.json:280`
- **Reproduced failure:** All six references claim version `1.0.0` while the files declare `0.1.0`; the output-patch reference also has a hash different from the current bytes.
- **Required correction:** Regenerate references from canonical prompt bytes and declared versions, and add version/hash resolution conformance checks.
- **Acceptance test:** Every referenced ID resolves uniquely, its declared version matches the file declaration, and its canonical SHA-256 matches the recorded hash.

### renderer-partial-attestation-validation — Malformed attestations render as valid

- **Anchor:** `<project-root>/src/renderer/safety.ts:274`
- **Reproduced failure:** An attestation with invalid formats, missing required fields, zero payload size, and empty checks fails the full schema but renders with a valid badge.
- **Required correction:** Run full canonical-schema validation in the exported renderer, compare exact serialized payload size, and reconcile check/summary cardinality and binding.
- **Acceptance test:** The malformed probe is rejected before rendering; only a fully schema-valid, byte-size-correct, identity/hash-bound attestation receives a valid badge.

### unsupported-overview-superlatives — Array order is presented as scientific ranking

- **Anchor:** `<project-root>/templates/scientific-console/partials/global-overview.html:42`
- **Reproduced failure:** The first qualified claim is labeled “Best-supported claim” even when a supported claim follows; equivalent first-record selection drives “Strongest counterevidence” and “Primary blocker.”
- **Required correction:** Use neutral factual labels or introduce explicit validated ranking/designation IDs.
- **Acceptance test:** Without ranking metadata, no superlative appears; with explicit ranking, the designated record—not array order—is rendered.

### interval-unit-omitted — Quantitative intervals drop their recorded unit

- **Anchor:** `<project-root>/src/renderer/view-model.ts:959`
- **Reproduced failure:** An estimate in `arbitrary unit` with an interval in `log arbitrary unit` renders only the estimate unit; the interval unit disappears.
- **Required correction:** Render the interval’s independent unit and missingness state without borrowing the estimate unit.
- **Acceptance test:** Different estimate and interval units both appear unambiguously; unknown interval units are shown as unknown rather than inferred.

### filter-hidden-safety-undercount — Filters undercount hidden safety disclosures

- **Anchor:** `<project-root>/templates/scientific-console/assets/report.js:117`
- **Reproduced failure:** After filtering, the UI reports 17 hidden safety-relevant records while 23 safety-marked nodes are effectively hidden through themselves or ancestors.
- **Required correction:** Build the safety set from every `data-safety-record=true` node and calculate effective hidden state through the full ancestor chain for screen and print warnings.
- **Acceptance test:** The displayed hidden-safety count exactly equals all effectively hidden safety nodes, including descendant-only disclosures; a “none hidden” message is allowed only when that count is zero.

## Scope clarification

This is an **automated contract, validator, renderer, packaging, and reproducibility review**, not human scientific peer review. It establishes that the current system can admit or present unsupported, incomplete, misleading, nonreproducible, or unsafe records. It does **not** determine whether any underlying biological, molecular, AI/ML, or molecular-dynamics conclusion is scientifically correct; that requires qualified human peer review after these release-gating defects are corrected.
