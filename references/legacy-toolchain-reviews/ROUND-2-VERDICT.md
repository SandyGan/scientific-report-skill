# Round 2 zero-context AI release review

# Second-round release-chair decision: FAIL — release blocked

## Finding disposition

- Fresh reviewer candidates: **19**
- Checker verdicts: **38 confirmations, 0 refutations**
- Every candidate was independently confirmed by both finding checkers.
- Surviving findings: **19**
  - Critical: **0**
  - High: **16**
  - Medium: **3**
  - Low: **0**
- Required PASS threshold: **0 surviving critical/high/medium defects**
- No low-severity exception applies.

The passing baseline typecheck, 277-test suite, and build do not override the deterministic counterexamples. Several survivors permit omitted adverse results, invented provenance, unsupported causal conclusions, pseudoreplication, false reproducibility assurance, protected-record disclosure, or release despite an explicit human-review block. These directly affect scientific accuracy, completeness, reproducibility, release integrity, and user interpretation.

## Surviving findings and acceptance tests

### Generation contracts and pipeline

1. **High — RP-SOURCE-001: Invented exact provenance passes final validation**
   Anchor: `<project-root>/src/validator/reference.ts:395`
   Acceptance test: Mutate a valid binding to use an out-of-bounds locator, unrelated snapshot-registry hash, invented excerpt hash, nonexistent chunk ID, and invented parser identity. Full validation must fail against trusted extraction data. A positive fixture must recompute the excerpt hash from the bound bytes/span and pass only when every identity and locator matches.

2. **High — RP-COMPLETE-001: Complete responses need not cover requested units**
   Anchor: `<project-root>/schemas/generation-response.schema.json:1944`
   Acceptance test: Submit two requested chunks, process only the first, and declare `complete` with no omissions. A production request-response exchange validator must reject this. `processed_unit_ids` and `omitted_unit_ids` must form a disjoint exact partition of the request’s ordered denominator, with a truncated cursor pointing to the first omitted unit.

3. **High — RP-NEGATIVE-001: Published extraction example drops adverse records**
   Anchor: `<project-root>/prompts/contracts/response.example.json:98`
   Acceptance test: The published failed-control example must either emit provenance-bound attempt, failure, no-signal result, exclusion, planned-repeat/non-performance, and withholding records, or return `cannot_complete` when authorization cannot represent them. It must not mark the scientific extraction complete while emitting only an unrelated review task.

4. **High — RP-AUTH-001: Response can self-authorize unrequested roots**
   Anchor: `<project-root>/schemas/generation-response.schema.json:1893`
   Acceptance test: With a request authorizing only `/review_tasks`, a response authorizing and adding `/claims` must be rejected by an exported production exchange/apply preflight, including from a clean installed package. Matching authorized roots and valid object/root mappings must still pass.

5. **High — RP-COMPOSE-001: Safety and enabled-pack prompts may be omitted**
   Anchor: `<project-root>/schemas/generation-request.schema.json:2603`
   Acceptance test: A wet-lab request that omits `report_prompt.core.untrusted_input_boundary` and `report_prompt.pack.wet_lab`, while duplicating another core reference and recomputing the set hash, must fail. The resolver must require the four exact core contracts, the exact stage contract, exactly one pack for every enabled module, unique contract IDs, and current byte/hash tuples.

6. **Medium — RP-PACK-001: Domain payloads have no authorized patch route**
   Anchor: `<project-root>/schemas/generation-request.schema.json:22`
   Acceptance test: An enabled domain response must be able to add a schema-valid typed payload through an explicitly constrained route, apply and persist it in the canonical report, and pass PACK001. Unrelated or arbitrary `/extensions` mutations must remain rejected.

7. **Medium — RP-ROUTE-001: Mandatory S3 route lacks an executable and profile**
   Anchor: `<project-root>/prompts/stages/03-normalization-route.md:22`
   Acceptance test: A clean installed package must resolve a versioned, hash-pinned S3 profile and deterministically transform a full S2 response—including failures, exclusions, negative findings, missingness, provenance, and continuation—into valid canonical operations. Alternatively, S3 must be removed from the accepted/recommended stage inventory so no accepted stage remains unroutable.

### Scientific reasoning and domain semantics

8. **High — SCIENTIFIC-001: Direct association evidence resolves a causal question**
   Anchor: `<project-root>/src/validator/claim-rules.ts:68`
   Acceptance test: A causal or mechanistic claim supported only by a co-occurrence source statement and no ArgumentStep must fail support and leave the question unresolved. A positive case must include an admissible reasoning step with known assumptions and alternative explanations.

9. **High — SCIENTIFIC-002: Nonexistent controls qualify a null result**
   Anchor: `<project-root>/src/validator/negative-rules.ts:101`
   Acceptance test: A biological-counterevidence assessment naming nonexistent control and QC IDs must fail NUL001/REF001 even when aggregate flags claim that controls passed. A positive case must resolve every identifier to applicable typed records and substantiate the aggregate assessment.

10. **High — SCIENTIFIC-003: One biological population passes as independent replication**
    Anchor: `<project-root>/src/validator/claim-rules.ts:493`
    Acceptance test: Evidence routed through distinct result IDs but the same AnalysisPopulation or biological group ancestry must not occupy separate groups marked independent or support “independently replicated” wording. Truly independent ancestry must continue to pass.

11. **High — SCIENTIFIC-004: Cross-domain premises bypass the bridge gate**
    Anchor: `<project-root>/src/validator/claim-rules.ts:309`
    Acceptance test: An ArgumentStep combining MD and wet-lab premise claims must require a CrossDomainBridge even when the conclusion itself has no directly domain-bound evidence. Cycle-safe traversal must identify domains through the full premise closure.

12. **High — SCIENTIFIC-005: A true conflict can be relabelled heterogeneity**
    Anchor: `<project-root>/src/validator/claim-rules.ts:636`
    Acceptance test: Opposite results with the same estimand, population, condition, interval, and analysis context must not pass as `retained_as_heterogeneity`. That status may pass only when a known, source-bound material context difference explains the incompatibility.

13. **High — SCIENTIFIC-006: Wet-lab N is counted across unrelated work units**
    Anchor: `<project-root>/src/validator/domain-rules.ts:203`
    Acceptance test: In a payload with two work units and two specimens per unit, each design’s denominator must resolve only its own members. Declaring biological and technical N=4 for each design must fail; explicit member-scoped N=2 records must pass.

14. **High — SCIENTIFIC-007: Selected model need not derive from the selected trial**
    Anchor: `<project-root>/src/validator/domain-rules.ts:521`
    Acceptance test: If `selected_trial_ids` point to model A while model B is marked `selected`, AIM004 must fail. It should pass only when selected-role models equal the models derived from selected trials, subject to an explicit typed ensemble or post-search selection rule.

15. **High — SCIENTIFIC-008: MD sampling adequacy bypasses a wording regex**
    Anchor: `<project-root>/src/validator/domain-rules.ts:655`
    Acceptance test: An affirmative conclusion such as “Sampling adequately represents all reported observables” must fail when diagnostics, effective sample sizes, convergence criteria, replica results, and heterogeneity are unknown. Tests must cover adequacy paraphrases rather than only strings containing “converged.”

16. **Medium — SCIENTIFIC-009: Partial failures evade retry-chain validation**
    Anchor: `<project-root>/src/validator/work-rules.ts:124`
    Acceptance test: A `partially_succeeded` attempt with a material FailureEvent followed by a successful attempt must require a recovery/supersession link or an explicit source-bound `not_a_retry` relation. An unlinked sequence must fail retry-history validation.

### Reproducibility, disclosure, and release gating

17. **High — R3-UNTRACEABLE-INDEPENDENT-EVENT: Bare assertion receives supported R3**
    Anchor: `<project-root>/src/validator/reproducibility-rules.ts:859`
    Acceptance test: A schema-minimal independent event containing only `independent`/`met` labels, comparator ID, an existing hashed artifact, and a generic binding must be capped at R2 and raise REP004. R3 must require an identifiable independent actor/time, execution, inputs, environment or implementation boundary, random-state applicability, independently derived outputs, deviations/failures, and target-level comparison evidence.

18. **High — projection-array-removal-order: Multi-object omission retains protected data**
    Anchor: `<project-root>/src/projection/project.ts:247`
    Acceptance test: Request sibling-array omissions at indices 2 and 10. Both intended identities must be absent, the adjacent unrequested identity must remain, and verification must reject output produced by the prior shifted-index algorithm. Short or numeric protected values must not evade leakage detection, and an incorrect projection must never remain release-eligible.

19. **High — RR-HR-001: Explicit human-review block still receives release PASS**
    Anchor: `<project-root>/src/verifier/index.ts:975`
    Acceptance test: A schema-valid, exactly identity-bound human-review attestation with `overall_decision: "block_release"`, a scientific concern, and unresolved tasks must make `verifyBundle` return `ok: false` and `releaseEligible: false`; the default CLI must exit nonzero. Integrity-only inspection may remain available only with an explicit non-release result.

## Coverage assessment and limits

The five reviews provide broad and complementary coverage of:

1. Prompt composition, generation exchanges, provenance, continuation, authorization, adverse-record preservation, domain-pack routing, and normalization.
2. Claim/evidence reasoning, causal resolution, controls, null findings, evidence independence, conflicts, retries, cross-domain bridges, and wet-lab/AI/ML/MD semantics.
3. Reproducibility levels, replay evidence, recipes, environments, artifacts, clean installation, and offline bundle portability.
4. HTML projection, no-JavaScript availability, report wording, disclosure processing, and public scientific JSON fidelity.
5. Tarball installation, documented APIs/CLI, manifest closure, source/render binding, working-copy labeling, and human-review release gating.

This coverage is **more than sufficient for the negative release decision**: one confirmed high or medium defect would block PASS, and 19 survived. It is not sufficient to claim universal certification. Reported limits include:

- No external provider/model behavior or live orchestrator was exercised.
- No browser-level `file://` launch, print-engine pass, screen-reader assessment, or full accessibility audit was performed.
- Clean-install portability was exercised on macOS and Node.js 22, not Windows, Linux, or multiple supported Node patch releases.
- The reviews did not establish real-world source honesty, whether experiments actually occurred, or scientific truth against external laboratory/computational records.
- Some fixture-level unrelated findings affected whole-report validity, but the relevant R3 predicates and validator-supported summary were directly isolated and confirmed.
- A passing repair must add regressions for all acceptance cases above and rerun full validation, packaging, clean-install, projection, and release-verification paths.

## Automated review versus scientific peer review

These conclusions come from **automated AI review supported by deterministic repository probes and checker reproductions**. Both checkers confirmed every survivor, but they are not human scientific peer reviewers. The work does not establish domain-expert acceptance of biological interpretations, experimental design, molecular-dynamics adequacy, or AI/ML methodology against primary records. The synthetic human-review attestation used to expose RR-HR-001 is test data; it is not evidence that a qualified human reviewed this release.

**Final disposition: FAIL. Do not release until all 16 high and 3 medium survivors are fixed and their acceptance tests pass.**
