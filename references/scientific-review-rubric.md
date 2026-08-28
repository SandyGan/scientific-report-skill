# Scientific review rubric

This rubric is for scientific, provenance, reproducibility, and disclosure review of a report bundle. It intentionally avoids a single aggregate score: a high average can conceal one fatal source, identity, leakage, or interpretation defect.

Automated validation is input to review, not a substitute for it. Reviewers should cite exact report object IDs and source locators, and should distinguish observed defects from missing evidence.

## Review outcomes

Use one overall outcome after recording findings by axis:

| Outcome | Meaning |
|---|---|
| `approve` | No blocker or unresolved major finding remains within the declared review scope. Minor findings are documented and do not change scientific interpretation or release safety. |
| `approve_with_conditions` | No blocker remains, but named major/minor conditions must be satisfied or prominently disclosed under an agreed release decision. This is not appropriate for unresolved truth, identity, or disclosure blockers. |
| `revise_and_resubmit` | One or more major findings require scientific or provenance changes before approval. |
| `block_release` | A blocker makes the report materially misleading, scientifically unsupported, unsafe to disclose, internally unbound, or not reviewable. |
| `not_evaluable` | The reviewer cannot evaluate the assigned scope because essential material, access, expertise, or a stable payload is absent. |

**Serialization contract.** `schemas/human-review-attestation.schema.json` uses these exact five outcome values. Do not substitute legacy draft spellings (`approved`, `approved_with_conditions`, `changes_requested`, or `not_completed`) or collapse `revise_and_resubmit`, `block_release`, and `not_evaluable` into one generic non-approval state.

Review outcome is scoped. An approval must state the payload hash/report version, schema/rule profile, sections/domains reviewed, sources accessible to the reviewer, and explicit exclusions from review.

## Finding severity

| Severity | Definition | Typical action |
|---|---|---|
| blocker | Could invert or fabricate a key conclusion, misstate performed work, expose restricted information, break payload/attestation identity, omit material counterevidence, or prevent meaningful review. | Stop release; correct and re-review affected dependencies. |
| major | Materially weakens a claim, question status, coverage statement, derivation, or reproducibility level, but does not necessarily invalidate the whole bundle. | Revise before approval or explicitly downgrade/remove affected claims under authorized review. |
| minor | Local clarity, locator precision, low-impact metadata, or usability defect that does not change scientific interpretation. | Correct in this revision when practical; track if deferred. |
| note | Observation or improvement with no demonstrated defect. | Optional follow-up; must not be counted as a passing requirement. |

A finding can be downgraded only with evidence, not because a deadline is close.

## Evidence for review findings

Each finding should include:

- finding ID and severity;
- affected object IDs and public/private scope;
- exact source locator or reproducible inspection step;
- expected contract or scientific principle;
- observed state;
- consequence for claims, question resolution, reproducibility, or disclosure;
- required remediation or acceptable conservative downgrade;
- reviewer and date;
- resolution evidence and downstream objects re-reviewed.

Do not write “insufficient evidence” without naming the evidence expected and the bounded material inspected.

## Rubric axes

### 0. Contract coherence

Perform this gate before scientific scoring or tracing.

**Review questions**

- Do the named protocol, schema, rule-registry, renderer/view-model, attestation, and manifest versions form a documented compatible set?
- Can every applicable protocol concept be represented losslessly by the active schema?
- Are enum names and states identical where identity is required, rather than mapped by undocumented aliases?
- Does the attestation state exactly which checks ran, and are unimplemented/skipped checks visible?
- Are any items in `reviews/zero-based/INTEGRATION_BLOCKERS.md` applicable to the payload?

**Blockers**

- The payload exercises an unresolved protocol/schema mismatch but is presented as conformant.
- A draft-schema value is silently treated as a protocol value, or vice versa.
- Public-withheld data is forced into an unsafe provenance state to satisfy one side of the current mismatch.
- A validation, reproducibility, or release claim depends on a contract surface that cannot represent the normative state.

**Required outcome**

Record `block_release` or `not_evaluable` as appropriate. Preserve the underlying source facts and require a versioned contract resolution/migration; do not “resolve” coherence by reviewer prose alone.

**Automation can help with** version allowlists and exact enum/schema comparisons. It cannot decide that two scientifically distinct states are close enough to merge.

### A. Scope and source coverage

**Review questions**

- Are scope, cutoff, organizational boundary, source classes, and report mode unambiguous?
- Is the source universe authoritative, registered-only, or otherwise limited, and is that status justified?
- Is the inventory snapshot stable and inspectable?
- Does every registered source have one supported disposition?
- Were failures, null results, exclusions, unreadable items, corrections, and retractions sought, not only positive evidence?
- Does coverage wording stay within the inventory's authority?
- Does each expected section have an explicit coverage state?

**Blockers**

- Absolute completeness is claimed without an authoritative reconciled source universe.
- A known material source/run is absent or silently omitted in a way that could change a key claim.
- A retraction/correction in the declared cutoff is omitted from dependent claims.

**Major findings**

- One or more registered sources remain `unmapped`, unreadable, or inaccessible without a corresponding limitation/impact assessment.
- Section omission is represented by an empty array rather than an applicability/coverage state.

**Automation can help with** disposition counts, unresolved item IDs, and prohibited completeness phrases. It cannot establish that the inventory itself is authoritative or complete.

### B. Epistemic state and missingness

**Review questions**

- Are `known`, `unknown`, `not_applicable`, and `withheld` used consistently?
- Does every known source-derived value have adequate provenance?
- Does every unknown state explain the bounded gap without guessing?
- Is inapplicability based on a rule rather than absent data?
- Does the public projection preserve withholding without leaking the value?
- Are inferred and external facts labeled rather than narrated as project observations?

**Blockers**

- A guessed or model-generated value is represented as known and supports a key claim.
- A withheld/restricted value appears anywhere in the public bundle.

**Major findings**

- Systematic use of defaults, empty strings, `TBD`, or `N/A` obscures missingness.
- Partial provenance is presented as complete for a material parameter.

**Automation can help with** envelope shape and prohibited sentinels. It cannot decide that a source truly supports a value.

### C. Work state, execution scope, and history

**Review questions**

- Are campaign, work unit, attempt, and segment boundaries defensible?
- Is `completed` tied to explicit completion criteria and execution evidence?
- Are project work, reanalysis, external/upstream work, and synthetic material counted separately?
- Are failed/abandoned attempts and retries append-only?
- Are usable partial outputs and later failures both represented?
- Are actual, planned, default, and recipe parameters distinguished?

**Blockers**

- Planned, external, inferred, or synthetic work is counted or described as completed by this project in a material conclusion.
- A successful retry overwrites a failure that affects interpretation or reproducibility.

**Major findings**

- Completion criteria are vague or post hoc without disclosure.
- Attempt/segment boundaries hide a parameter change, restart, or failed control.

**Automation can help with** state/enumeration consistency and required evidence links. It cannot verify that recorded execution actually occurred.

### D. Identity, material lineage, and independent units

**Review questions**

- Are versioned entities distinguishable at every relevant level?
- Are merges, aliases, relabeling, pools, and transformations supported?
- Is material/data lineage closed from origin to analysis population?
- Are biological, technical, observational, and analysis units correctly identified?
- Are exclusions/dropouts accounted for between stages?
- Do cross-domain identities match construct/sequence/version/condition adequately?

**Blockers**

- Sample/entity identity is fabricated or merged without basis and affects a key conclusion.
- Non-independent units are counted as independent in a way that materially changes uncertainty or evidence weight.
- Train/test leakage or cross-domain mismatch invalidates a key result.

**Major findings**

- Important transformation/filtering steps are not traceable.
- A pool, aliquot, frame, or technical repeat is ambiguously counted.

**Automation can help with** reference closure and declared counts. Scientific identity and independence need domain review.

### E. Methods, controls, and decision timing

**Review questions**

- Are actual method versions and parameters supported by logs/protocol records?
- Are critical controls, calibration, randomization, blinding, preprocessing, and deviations represented when applicable?
- Are decisions labeled predefined, adaptive, post hoc, missing, or inapplicable with credible timing evidence?
- Are exclusion, threshold, stopping, model-selection, and analysis-population decisions transparent?
- Are domain-specific prerequisites for interpretation met?

**Blockers**

- A critical failed control is omitted while the affected result is presented as interpretable.
- A material post hoc decision is represented as prospective/predefined.
- The actual method differs materially from the described method and supports a key claim.

**Major findings**

- Critical parameters are unknown but prose implies a complete method.
- Deviations are recorded without impact assessment.

**Automation can help with** presence of declared fields and timing links. It cannot judge control adequacy or whether an amendment was scientifically legitimate.

### F. Results, failures, exclusions, and negative evidence

**Review questions**

- Are effect class, statistical decision, interpretability, disposition, and failure represented independently?
- Are estimates, intervals, units, populations, denominators, and missing observations clear?
- Are technical failures and excluded/superseded/retracted results retained?
- Does the report distinguish no detected effect, failure to reject, equivalence, and no estimate?
- Are sensitivity analyses labeled and connected to primary analysis decisions?
- Is biological counterevidence supported by adequate controls and sensitivity/MDE or detection-limit context?

**Blockers**

- A failed assay/control is used to support absence of a biological effect.
- Material failed, excluded, or contradictory results are silently absent.
- A non-significant result is materially misrepresented as equivalence or proof of no effect.

**Major findings**

- Uncertainty intervals, denominators, or analysis populations are missing for a key quantitative result.
- Failure impact on claims is not propagated.

**Automation can help with** orthogonal-axis presence and registered failure references. Statistical and biological interpretation requires qualified review.

### G. Quantitative derivation and computational traceability

**Review questions**

- Can each key number be traced through `DataSlice -> DerivationRecord -> AnalysisRun -> OutputArtifact -> EvidenceItem -> Claim`?
- Are versions, row/query selections, filters, joins, formulas, units, and transformations inspectable?
- Are actual invocations, code state, environment, random state, exit status, and output hashes distinguished?
- Are notebook execution order and hidden state addressed where relevant?
- Are generated figures/tables consistent with their declared data slices?

**Blockers**

- A key quantitative claim has no recoverable derivation and cannot be independently inspected.
- The displayed number does not match the bound artifact/source.
- A changed filter, notebook order, or input version leaves a stale claim presented as valid.

**Major findings**

- Derivation closure is partial but the claim is unqualified.
- A path is used as identity without version/integrity evidence for a critical artifact.

**Automation can help with** reference graphs, hashes, and declared closure. It cannot prove code correctness or analytic appropriateness.

### H. Claims, arguments, dependencies, and conflicts

**Review questions**

- Is each key claim atomic and scoped to the relevant entities, conditions, and time?
- Does direct evidence support the exact wording?
- Are intermediate inferences and assumptions explicit?
- Are dependent sources prevented from masquerading as independent evidence?
- Is counterevidence visible and fairly characterized?
- Are true conflicts registered and context-dependent differences preserved as heterogeneity?
- Are cross-domain bridges explicit and valid?
- Are correction/retraction effects propagated through dependencies?

**Blockers**

- A key claim introduces a fact, number, or causal/mechanistic conclusion absent from the evidence/argument graph.
- A known direct contradiction is hidden or resolved by deletion.
- Invalid cross-domain identity/condition mapping is essential to a key mechanism claim.

**Major findings**

- Shared upstream data/checkpoint/label/source are counted as independent support.
- Alternative explanations or material qualifications are absent.
- Conflict adjudication lacks evidence or authorized review.

**Automation can help with** graph references, acyclicity, dependency/revision propagation, and required bridge fields. It cannot determine the soundness of a scientific inference.

### I. Research-question resolution and narrative proportionality

**Review questions**

- Are resolution criteria valid and timed appropriately?
- Does the assigned status follow from those criteria and valid claims?
- Is the qualified answer consistent with the strongest counterevidence and limitations?
- Do title, overview, headings, figure captions, and conclusion use the same epistemic strength as the canonical claims?
- Is work volume avoided as a proxy for question resolution?

**Blockers**

- A question is marked resolved without valid criteria or with unmet material criteria.
- Summary/narrative materially overstates the canonical payload.

**Major findings**

- The strongest blocker or counterevidence is absent from the overview.
- A partially resolved question is presented as resolved through wording.

**Automation can help with** status preconditions and controlled vocabulary. Wording proportionality and criterion adequacy need human review.

### J. Reproducibility

**Review questions**

- Are critical outputs divided into meaningful reproducibility units?
- Do unit records distinguish historical invocation, current recipe, rerun, and independent reproduction?
- Are recipe/history differences explicit?
- Are inputs, code, environment, random state, hardware/non-determinism, access, and licenses adequate?
- Were acceptance criteria defined without moving the goalposts after seeing rerun outputs?
- Are comparison method, tolerances, denominator, and claim coverage explicit?
- Is the reported level the conservative result of all applicable axes?

**Blockers**

- A unit is labeled verified/independent without execution evidence.
- Attestation or reproducibility status is carried over after the scientific payload changes.
- Required inputs or credentials are claimed to be included but are absent or inaccessible.

**Major findings**

- A plausible recipe is presented as a rerun.
- Same-team replay is presented as independent reproduction.
- Aggregate report wording hides critical units with lower status.

**Automation can help with** required fields, artifact references, comparisons, hashes, and conservative-level rules. Independence and scientific equivalence require human review.

### K. Disclosure, security, and bundle integrity

**Review questions**

- Is the public projection derived under an explicit disclosure policy?
- Are secrets, identifiers, private paths, restricted values, unsafe URLs, active HTML/SVG, and metadata absent from all public assets?
- Are all paths relative, normalized, and contained within the bundle root?
- Are remote resources absent and the report usable through `file://`?
- Does the attestation bind the exact scientific payload hash and rule/profile version?
- Does the manifest cover the intended release files and hashes?
- Can the optional generation audit be removed without scientific effect?

**Blockers**

- Any restricted/withheld value or credential is disclosed.
- Payload hash and attestation do not match.
- Active content or path traversal can execute/read outside the intended bundle.
- Scientific HTML contains a claim not present in the public payload.

**Major findings**

- A remote resource is required for core reading.
- Manifest scope is ambiguous or excludes a critical file without explanation.
- Unsigned integrity metadata is described as proof of publisher identity.

**Automation can help with** configured scans, path checks, hashes, manifest closure, and offline-resource checks. No scanner proves that all sensitive information is absent.

### L. Console usability and accessibility

**Review questions**

- Can a reader identify question, qualified answer, resolution state, key claim, strongest counterevidence, execution/failure scope, source coverage, and reproduction gap in roughly 30 seconds?
- Can a reader move from a key claim to actual parameters, failed attempt, source locator, or reproduction artifact in no more than three interactions?
- Is the full scientific content available without JavaScript?
- Are filters announced, reversible, and unable to erase archival facts?
- Are state labels independent of color and available to assistive technology?
- Does keyboard operation preserve visible focus and logical order?
- Do reflow, zoom, reduced motion, forced colors, printing, and offline relocation preserve meaning?
- Do charts have accessible text/table alternatives and avoid misleading encodings?

**Blockers**

- Core scientific content is available only through script execution or inaccessible interaction.
- Filtering/printing silently removes failures, counterevidence, exclusions, or retractions while presenting the view as complete.

**Major findings**

- Key evidence inspection is not keyboard operable.
- Color alone communicates scientific or validation state.
- The static reading order changes meaning or loses source links.

**Automation can help with** DOM checks, link integrity, static-content presence, and some accessibility rules. Timed comprehension and meaningful screen-reader use require human testing.

## Domain-specific review addenda

### Wet lab

Verify, where applicable:

- species/cell line/donor/sample/aliquot/well/pool/batch identity;
- RRID/catalog/lot, passage, authentication, and contamination/mycoplasma state;
- construct/sequence, primers, antibodies, reagents, instruments, and calibration;
- biological versus technical replication and independent unit;
- randomization, batch balance, blinding/unblinding, dropout, contamination;
- positive/negative/vector/sham controls and assay sensitivity;
- protocol steps, timings, temperatures, volumes, deviations;
- imaging acquisition, ROI selection, processing, and representative-image rules;
- detection limits, MDE, intervals, equivalence bounds, and analysis population.

Key blockers include pooled material counted as multiple biological N and negative biological inference after positive-control failure.

### AI/ML

Verify, where applicable:

- data snapshot/license, split manifest/hash, and group keys;
- lineage from source material to dataset rows;
- label provenance, raters, blinding, agreement, adjudication, and uncertainty;
- duplicate, homology, batch, temporal, pretraining, structural, or trajectory leakage;
- train-only fitting of stateful preprocessing;
- baselines, architecture, code tree/dirty patch, weights, and pretrained sources;
- hyperparameter space, all trials including failures, selection rule, and test-access log;
- seed derivation, workers/ranks, hardware, and nondeterministic operations;
- metrics, uncertainty, independent unit, subgroups, calibration, and thresholds;
- inference recipe and recorded smoke test.

Key blockers include donor aliquots split across train/test, adjacent frames from one trajectory treated as independent split units, and shared labels/checkpoints presented as independent evidence.

### Molecular dynamics

Verify, where applicable:

- structure accession/assembly/model/chain/version and residue/atom mapping;
- altloc, missing residue, mutation, cap, disulfide, covalent-link decisions;
- all molecular components and parameter sources/hashes;
- pH/protonation method and uncertain sites;
- force field, charges, atom typing, water/ions/box/PBC and combination rules;
- minimization/equilibration/production/enhanced-sampling stages;
- integrator, timestep, thermostat/barostat, constraints, cutoffs, and electrostatics;
- replicas, seed tree, checkpoints, restarts, and segment chain;
- PBC processing, fit selection, frame range/stride, and data slice;
- burn-in, correlation time, effective sample size, convergence criteria, and replica heterogeneity.

Key blockers include erased crash/restart history and convergence claimed from a single RMSD plateau.

## Review procedure

### 1. Freeze the review target

Record report ID/version, schema version, protocol/rule/profile versions, their declared compatibility set, scientific payload hash, attestation hash or ID, package-manifest hash, source-universe snapshot, and review scope. Resolve the contract-coherence gate before continuing. If any target bytes or contract versions change, mark the prior review stale and determine the required re-review extent.

### 2. Inspect automated evidence

Review—not merely accept—schema results, semantic findings, exclusions/waivers, attestation binding, bundle verification, and test scope. Confirm that the profile was appropriate and no applicable blocker rule was disabled.

A rule waiver is a review object with authority, reason, evidence, scope, expiry/revision, and impact. It does not make the underlying condition disappear.

### 3. Trace critical questions top-down

For each critical question, trace:

```text
question and criteria
  -> resolution status and qualified answer
  -> key claims and counterclaims
  -> evidence and argument steps
  -> result/failure/exclusion
  -> data/material lineage and method
  -> source locator and artifact
  -> reproducibility unit
```

### 4. Sample bottom-up

Select source items including at least one failure/null/exclusion/revision and trace them into the report. This detects material that was inventoried but not represented in the narrative or graphs.

### 5. Perform domain review

Use the relevant addenda. For cross-domain claims, include reviewers able to evaluate both sides of each bridge or explicitly split review responsibility.

### 6. Review disclosure and interaction

Inspect raw public files, not only the rendered page. Test static/no-JavaScript reading, keyboard use, filters, printing, file relocation, and configured sensitive-data scans.

### 7. Record outcome and residual limits

List unresolved findings, accepted limitations, claims downgraded/removed, inaccessible materials, and what the review did not assess. Do not state “scientifically validated” without specifying the review scope.

## Per-claim review record

Use this minimum checklist for each key claim:

- [ ] Claim wording is atomic and context-bounded.
- [ ] Direct evidence supports the exact proposition.
- [ ] Source locators and artifact versions are inspectable.
- [ ] Quantitative derivation is closed or limitations are explicit.
- [ ] Scientific/statistical/interpretability/disposition axes are consistent.
- [ ] Failures, exclusions, nulls, and counterevidence are represented.
- [ ] Dependencies do not create false independence.
- [ ] Intermediate inference and alternative explanations are explicit.
- [ ] Any cross-domain bridge is valid for entity, condition, dose, and timescale.
- [ ] Conflicts versus heterogeneity are handled correctly.
- [ ] Corrections/retractions have propagated.
- [ ] Language strength matches evidence and uncertainty.
- [ ] Covered reproducibility units and access constraints are clear.
- [ ] Public wording does not leak withheld information.

Record the per-claim check as `confirmed`, `confirmed_with_qualification`, `concern`, `unreviewed`, or `not_applicable` with rationale. These are the exact `ReviewCheck.decision` values in the active human-review attestation schema; the overall review uses the five outcomes defined above.

## Sign-off record

A scientific sign-off should contain:

```text
report ID and version:
scientific payload hash and algorithm:
schema version:
source-universe snapshot:
validation attestation identity/hash:
reviewer name/role/expertise:
reviewed domains and sections:
accessible source classes:
review methods performed:
automated evidence inspected:
open findings by severity:
accepted limitations and conditions:
overall scoped outcome:
date:
```

A signature or approval on one payload hash does not transfer to a modified payload. A later release must either be fully re-reviewed or carry a documented change-impact review that identifies exactly which prior review conclusions remain applicable.
