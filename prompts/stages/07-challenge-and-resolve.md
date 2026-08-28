# Stage 08: adversarial challenge and constrained resolution

## Prompt declaration

- **Prompt ID:** `report_prompt.stage.challenge_and_resolve`
- **Version:** `0.2.0`
- **Stage code:** `S8_challenge_and_resolution`
- **Implementation:** `prompt`
- **Purpose:** Subject high-impact or fragile claims to an evidence-grounded adversarial review over complete typed accepted state, record the strongest supported counterarguments and failure modes, and propose only reversible qualification, blocking, or supplied-rule resolution actions.

## Required inputs

In addition to all core-fragment inputs:

- Complete typed accepted `claims`, `evidence_items`, `conflict_sets`, and `limitations` collection snapshots plus each claim’s full argument, dependency, bridge, uncertainty, work, material, and derivation subgraph; every collection/object includes exact version/hash and orchestrator acceptance/trust status.
- A requested claim set, supplied risk/impact classification, target-schema-valid patch roots, and verified continuation lineage.
- Relevant negative evidence, failed controls, exclusions, retractions, sensitivity results, source coverage limitations, and inaccessible/unreadable items.
- Supplied adjudication rules, decision authorities, resolution criteria, and existing reviewer/DecisionEvents.
- Enabled domain-pack gates and the current disclosure policy.

No external facts, imagined experiments, or unprovided literature may be used as counterevidence. A plausible alternative may be identified as a hypothesis only when clearly labeled unsupported/unresolved.

## Structured outputs

Return the shared patch-response JSON. For each challenged claim, candidate operations may propose a ChallengeRecord with:

- claim ID/version and risk class;
- strongest supplied supporting evidence and strongest supplied contradicting/weakening evidence;
- premise/derivation/bridge/dependence/coverage/control/timing vulnerabilities;
- supported alternative explanations and clearly separated untested alternatives;
- tests or evidence needed to discriminate alternatives, labeled as future requirements rather than performed work;
- resolution disposition (`retain`, `qualify`, `narrow_scope`, `block`, `review_required`, `invalidate_due_to_revision`, or selected equivalent);
- resolution basis, authority/timing, residual uncertainty, and downstream dependency impacts.

Also emit conflicts, missingness, forbidden-inference detections, and human review tasks. Do not delete the challenged claim or adverse evidence; use versioned status/qualification and revision operations.

## Invariants

1. Challenge the actual scoped claim, not a stronger or weaker substitute. Pin the claim version and all premises examined.
2. Search the complete supplied subgraph for counterevidence: failures, negative/null/inconclusive outcomes, failed controls, exclusions, sensitivity-only results, dependence, leakage, alternate analyses, source gaps, conflicts, corrections, and missing bridges.
3. Steelman supported counterevidence without inventing it. Distinguish an evidence-backed alternative from an untested plausible alternative.
4. A failed control or non-interpretable result cannot support biological absence/mechanism even if its point result opposes the claim.
5. Multiple dependent evidence items do not become independent corroboration. Shared upstream material/data/labels/checkpoints/trajectory/code/derivation must remain visible.
6. Evaluate circularity: a model, rule, label, threshold, or representation used to create an outcome cannot serve as independent validation of that same outcome without an external criterion.
7. Cross-domain or mechanistic claims remain blocked/qualified when required bridge dimensions are missing/incompatible.
8. Resolution is constrained to supplied evidence and authorized rules. High-impact causal/mechanistic, identity, exclusion, conflict, and prospective-timing adjudications create human review tasks even when a recommended disposition is emitted.
9. `retain` means no supplied challenge required a change under the stated rule; it does not mean the claim is true, validated, reproduced, or immune to unobserved evidence.
10. Future discriminating tests remain planned requirements. Never state or imply they were run.
11. Preserve all failed challenges, unresolved objections, minority evidence, and residual uncertainty in the formal state.
12. Stage 08 may qualify/block/invalidate claims and propagate impacts but may not create new scientific results or rewrite source facts.

## Forbidden inferences

Do not infer:

- counterevidence from domain knowledge not supplied in the request;
- a control passed, assay was sensitive, data were leakage-free, simulation converged, or evidence was independent because no problem was mentioned;
- causality/mechanism from association, temporal order, predictive performance, ablation, or simulation alone;
- that excluded evidence is irrelevant, a failed run has no usable partial result, or a successful retry cancels prior failure;
- that more evidence links or more confident wording wins a dispute;
- that reviewer/adjudication timing was prospective;
- that an untested alternative is established;
- that `retain` is a validation attestation or passed check;
- facts from referenced but unprovided literature/files.

## Failure behavior

- Return `cannot_complete` if a claim’s required subgraph or versions are missing, if the request excludes adverse evidence from the challenge set, if safe resolution history cannot be represented, or if the task demands external research/inspection not supplied.
- Return `needs_review` for high-impact claims, disputed identity/bridge, unresolved true conflict, unclear evidence dependence, ambiguous decision timing, material exclusion choices, or insufficient resolution authority.
- If challenge evidence is incomplete, emit the supported vulnerabilities and a coverage limitation; do not manufacture balance or claim a challenge passed.
- Preserve cannot-complete/failed prior analyses and negative evidence in the challenge record and downstream impact proposals.

## Continuation behavior

- The transactional unit is one claim with its complete challenge/resolution record and all dependency impact candidates.
- Process claims in supplied risk priority, then stable ID order. Never use length pressure to challenge only supportive evidence or omit a blocker.
- On truncation, omit the incomplete claim challenge and list the claim ID in `omitted_unit_ids`; trusted orchestration mints the next cursor.
- Resume only after authenticating and exactly matching the cursor to identical claim/subgraph collection/object versions and hashes plus shared lineage. Changed evidence requires a fresh challenge record or explicit revision.
- Completion means every requested claim was challenged or assigned an explicit blocker. It does not mean objections were resolved or claims validated.

## Task instruction

Adversarially review each requested claim against its entire supplied, version-pinned subgraph. Surface the strongest adverse evidence, dependence, missing controls, circularity, bridge and coverage gaps; separate supported from hypothetical alternatives; and propose only evidence-authorized qualification, blocking, review, or revision-impact patches.
