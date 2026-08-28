# Stage 06: build the claim–evidence argument graph

## Prompt declaration

- **Prompt ID:** `report_prompt.stage.build_argument_graph`
- **Version:** `0.2.0`
- **Stage code:** `S6_argument_graph`
- **Implementation:** `prompt`
- **Purpose:** Build a versioned acyclic graph of claims, evidence items, argument steps, dependencies, and cross-domain bridges using only complete typed orchestrator-accepted facts and derivations, without introducing new scientific facts.

## Required inputs

In addition to all core-fragment inputs:

- Complete accepted collection snapshots for `research_questions`, `results`, `evidence_items`, `failures`, `limitations`, `derivations`, and `revision_events`. Each collection includes its exact version/hash, explicit orchestrator acceptance/trust status, and every accepted object as a complete schema-typed body with exact object version/hash. An accepted empty collection is represented explicitly; IDs/hashes or untyped extensions without bodies are invalid.
- Existing Claim, EvidenceEdge, ArgumentStep, ClaimDependency, CrossDomainBridge, ConflictSet, and resolution-criterion collection snapshots under the same typed acceptance contract.
- The requested claim/research-question targets, permitted claim strength/scope vocabularies, target-schema-valid patch roots, and verified continuation lineage.
- Supplied rules for evidence roles, independence/dependence, bridge compatibility, graph acyclicity, and question resolution.
- Human-approved identity mappings when a claim crosses entities, constructs, datasets, domains, or conditions.

Raw chunks, references-only state, and generated candidates that have not been accepted into these typed collection snapshots may not be used to create a new claim in this stage.

## Structured outputs

Return the shared patch-response JSON. Candidate operations may propose:

- scoped Claim objects with claim type, subject, predicate, object/outcome, population/system, conditions, time, estimand, direction, qualification, and status;
- links from claims to direct supporting, contradicting, contextual, or null/inconclusive EvidenceItems;
- ArgumentSteps with explicit premises, inference rule/type, conclusion, assumptions, and failure conditions;
- version-pinned ClaimDependencies and impact behavior;
- CrossDomainBridges that state mappings and compatibility for entity/build/version, condition, scale, endpoint, and time;
- research-question resolution candidates only when supplied resolution criteria are met;
- missing bridge/premise/independence findings and reviewer tasks.

Every graph node/edge must reference an accepted object through a typed `premise_binding` containing accepted-state snapshot/hash, object type/ID, exact version/hash, field pointer, and premise role, or be created in the same candidate-operation dependency set.

## Invariants

1. Stage 06 introduces no new observation, number, source, parameter, citation, identity mapping, or result. It organizes accepted typed bodies into explicit reasoning.
2. A non-background scientific Claim has direct evidence and/or explicit ArgumentSteps whose premises ultimately reach accepted evidence. Unsupported claims remain proposed-but-blocked only if the schema permits; otherwise create a review task.
3. ArgumentSteps separate evidence from inference. Rationale prose is not evidence and may not serve as a premise unless represented as an accepted claim.
4. ClaimDependencies are version-pinned and propagate review/invalidity when an upstream claim, evidence item, mapping, or derivation is corrected, retracted, or superseded.
5. The claim/argument dependency graph is acyclic. Mutual support, circular validation, and using a claim’s derived output as independent evidence for itself are blockers.
6. Evidence independence is explicit. Shared samples, labels, checkpoints, trajectories, preprocessing, code, authorship, or upstream artifacts create dependence where relevant; multiple presentations do not multiply evidence.
7. Contradicting, negative, null/inconclusive, excluded, and failed-control evidence remains linked with its disposition/interpretability. Do not hide it from a claim because it weakens the conclusion.
8. A CrossDomainBridge is required for cross-domain or cross-system inference and records compatibility/gaps for identity/version, construct/assembly, conditions, perturbation/dose, endpoint, and temporal/spatial scale.
9. Similar labels or biological plausibility do not establish a bridge. Missing required compatibility yields a qualified/blocked claim and review task.
10. Claim scope may not exceed evidence scope. Observational association does not become causality; model performance does not become mechanism; simulation behavior does not become experimental behavior without a supported bridge.
11. Research-question status (`resolved`, `partially_resolved`, `unresolved`, `not_addressed`, `not_evaluable`) requires a supplied criterion state (`predefined`, `adaptive`, `post_hoc`, `missing`, `not_applicable`). Activity volume alone cannot resolve a question.
12. A graph that is structurally complete is not automatically scientifically valid or reproducible.

## Forbidden inferences

Do not infer:

- a new claim from an attractive narrative not already represented by accepted facts;
- direct evidence from contextual citation or argument text;
- evidence independence from separate IDs, files, folds, models, replicas, labs, or publications;
- entity/construct/condition equivalence across domains without approved mappings;
- mechanism/causality from correlation, prediction, docking/simulation, ablation, or temporal order alone;
- question resolution without applicable criteria;
- statistical or biological meaning beyond accepted result axes;
- that excluded or sensitivity-only evidence is primary;
- that a conflict is resolved because one branch has more evidence items;
- validation success from graph construction.

## Failure behavior

- Return `cannot_complete` if any required accepted collection snapshot is absent; any required accepted object is only an ID/hash or untyped extension; a collection/object version/hash or acceptance/trust status is missing; required graph roots are unavailable; or dependencies/adverse evidence cannot be represented.
- Return `needs_review` for cycles, uncertain evidence independence, missing bridge dimensions, disputed identity, unsupported claim strength, ambiguous scope, or missing resolution criteria.
- Emit only the subgraph whose premises are accepted and stable. Do not repair a missing premise by generating a fact.
- Preserve retracted/superseded inputs as historical nodes and propose downstream impact/review rather than deleting graph history.

## Continuation behavior

- The transactional unit is one target Claim plus its complete proposed evidence links, argument steps, dependencies, bridges, and adverse evidence.
- Process prerequisite claims before dependent claims using a deterministic topological order. If no acyclic order exists, emit a cycle conflict/review task and no cyclic edges.
- On truncation, omit the incomplete claim subgraph and list the claim/target ID in `omitted_unit_ids`; trusted orchestration mints the next cursor.
- Resume only after cursor authentication and exact matching to request/stage, every accepted collection/object hash, source snapshot set, prior response, accepted operations, next unit, page, and unused nonce. Any version/hash change requires explicit re-evaluation, not continuation.
- Completion means all requested claim targets received a graph candidate or explicit blocker; it does not mean the claims are validated or the research questions resolved.

## Task instruction

For each requested target, construct the narrowest evidence-grounded Claim and explicit acyclic reasoning path from accepted objects. Link adverse evidence, model dependence, require cross-domain bridges, propagate upstream revision risk, and emit only graph candidate patches and structured blockers—never new facts.
