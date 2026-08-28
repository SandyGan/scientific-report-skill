# Round 1 frozen findings

**Review verdict:** FAIL — release prohibited.

**Frozen unique findings:** 44

| Severity | Count |
|---|---:|
| Critical | 1 |
| High | 30 |
| Medium | 11 |
| Low | 2 |

The detailed reproduction, anchors, and acceptance tests are in:

- `ROUND-1-MAIN-VERDICT.md`
- `ROUND-1-SOFTWARE-CONTRACT-SUPPLEMENT.md`
- `ROUND-1-PORTABILITY-SUPPLEMENT.md`

Every main finding was reproduced by four independent verification lenses. Every unique supplement finding was reproduced by two independent verifiers. Overlapping supplement findings are not counted twice.

## Workstream A — Generation prompt and schema contracts

- F1 — Later-stage trusted state has no typed request channel — High
- F2 — Patch operations target unauthorized/nonexistent roots — High
- F3 — Accepted stage codes do not map one-to-one to prompts — High
- F4 — README-required response shape is schema-invalid — High
- F5 — Chunk contract cannot disclose truncation/overlap — High
- F6 — Resume cursors are unverifiable — Medium
- F7 — Source bindings need no immutable content identity — High
- F8 — Unreadable/excluded source reasons are not required — Medium
- F9 — Prompt references have stale versions/hashes — Medium

## Workstream B — Scientific epistemology and cross-domain reasoning

- SCI-001 — Cross-domain claims with no bridge bypass BRG001 — High
- SCI-002 — Valid bridge omits dose and endpoint alignment — High
- SCI-003 — Resolved question needs no supported claim — High
- SCI-004 — Retractions do not reopen resolved questions — High
- SCI-005 — Conflict detection covers only increase/decrease — High
- SCI-006 — Null eligibility ignores failed control records — High
- SCI-007 — Shared-donor pools count as independent biological N — High

## Workstream C — Reproducibility and provenance

- REPRO-001 — R1 accepts identifiers/labels instead of replay records — High
- REPRO-002 — R2 trusts a bare met flag under undefined comparator — High
- REPRO-003 — Verified bundle can omit declared replay artifacts — High
- REPRO-004 — Table name alone is accepted as exact data slice — High
- REPRO-005 — Critical floor and coverage use self-selected denominators — High
- REPRO-006 — R1 accepts unknown/empty access procedure — High
- REPRO-007 — Prompt pipeline has no reproducibility-authoring stage — High

## Workstream D — Release, disclosure, source coverage, and validation contracts

- SC-02 — Scoped/skipped validation is reported release-eligible — High
- SC-03 — Loaded rule/overlay contracts are hashed but not executed — High
- SC-04 — Disclosure-state laundering passes automated rules — High
- SC-05 — Omitted failures in source content receive automated passes — High
- SC-06 — Quantitative claim can pass without derivation or exact locator — High
- SC-09 — Normalizer is not bound to authoring/output schemas — Medium
- renderer-absolute-path-root-bypass — Generic POSIX paths evade release redaction — High

## Workstream E — Renderer and command-console fidelity

- reproducibility-axis-substitution — Replay matrix substitutes non-axis state — Medium
- renderer-partial-attestation-validation — Malformed attestation renders valid — Medium
- unsupported-overview-superlatives — Array order is labeled as scientific rank — Low
- interval-unit-omitted — Quantitative intervals drop their own unit — Medium
- filter-hidden-safety-undercount — Hidden safety disclosures are undercounted — Medium
- PT-09 — Filter choices omit rendered domains/states/kinds — Medium
- PT-02 — Current working directory silently overrides packaged templates — High

## Workstream F — Packaging, verification, and portability

- PT-01 — Bundle can certify HTML contradicting scientific payload — Critical
- offline-html-entity-url-bypass — Encoded remote URLs pass offline verification — High
- human-review-cross-file-binding — Unrelated human approval verifies as bound — High
- PT-04 — First-party workflow has no disclosure-projection implementation — High
- PT-06 — `--allow-extra-files` emits unqualified PASS — Medium
- PT-07 — Packaging lacks lifecycle release gate and allowlist — Medium
- PT-08 — Packed README instructs an impossible `npm ci` workflow — Low

## Release requirements after repair

1. Every finding has a regression test implementing its acceptance scenario.
2. Typecheck, all unit/integration tests, build, installed CLI smoke, clean-room tarball smoke, and offline bundle verification pass.
3. No acceptance test is weakened or changed solely to match implementation.
4. A second zero-context review receives only the original requirement and repaired candidate package.
5. Release requires zero surviving Critical, High, or Medium findings.
6. Low findings must be fixed or explicitly shown not to affect reliability, accuracy, reproducibility, security, portability, or report comprehension.
