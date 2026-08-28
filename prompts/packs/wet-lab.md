# Domain fragment: wet-lab research

## Prompt declaration

- **Prompt ID:** `report_prompt.pack.wet_lab`
- **Version:** `0.2.0`
- **Purpose:** Add wet-lab-specific extraction/modeling fields and conservative gates for material identity, replication, controls, protocol execution, assay sensitivity, imaging, QC, exclusion, and negative evidence without weakening any core rule.

## Required inputs

When `wet_lab` is enabled, in addition to core and selected-stage inputs provide when available:

- Species/strain, donor, cell line, tissue, sample, aliquot, well, pool, batch, and passage records with stable local IDs.
- Authentication, contamination/mycoplasma, ethics/consent/permit, custody, storage/freeze-thaw, and viability/QC records.
- Construct/sequence/version/hash, primer, antibody, reagent, catalog/RRID/lot, instrument, software, and calibration records.
- Protocol versions and actual step/deviation records including order, time, temperature, volume/concentration, waits, transfers, and instrument settings.
- Biological/technical replicate relations; experimental, observational, and analysis units; randomization, blocking/batch balance, blinding/unblinding, dropout, contamination, pooling, and exclusions.
- Positive, negative, vehicle, mock, vector, untreated, spike-in, and reference controls; detection limit, MDE, equivalence margins, interval, and analysis-population records.
- Imaging acquisition/processing/ROI/representative-selection provenance when applicable.

Missing items remain missing; the pack does not require the generator to invent them.

## Structured outputs

Return only the shared patch-response JSON. When the canonical wet-lab payload is requested and `/extensions/domain_payloads` is explicitly permitted, append exactly one complete `wet_lab` payload at `/extensions/domain_payloads/-` with `object_type: "domain_payload"`; never authorize or mutate `/extensions` or a sibling extension key. Add wet-lab candidates/diagnostics appropriate to the selected stage, including:

- typed material/entity lineage and batch/pool/aliquot relations;
- reagent/construct/instrument identifiers and version/lot/calibration missingness;
- protocol actual-versus-planned steps, deviations, and failure events;
- explicit replicate and unit definitions, biological-N basis, analysis populations, dropouts/exclusions, and batch/blinding/randomization timing;
- control design/outcomes, assay sensitivity and interpretability gates;
- imaging acquisition/processing/ROI/selection provenance;
- pack-gate findings and human-review tasks for identity, pooling, exclusions, controls, ethics/disclosure, and causal/mechanistic claims.

## Invariants

1. Keep organism/donor/cell line/sample/aliquot/well/pool/batch identities and transformations distinct. Do not merge labels without supplied mapping evidence.
2. A pool has the number of independent biological contributors evidenced by its lineage; aliquots/wells/images/technical repeats from one contributor do not increase biological N.
3. State biological, technical, experimental, observational, and analysis units separately. A row or image is not automatically an independent replicate.
4. Catalog number/RRID, lot, passage, authentication, contamination status, sequence version/hash, and calibration are known only when supplied; missing values remain explicit.
5. Separate planned protocol from actual execution. Preserve step deviations, failed transfers, delays, temperature excursions, contamination, instrument faults, and unsuccessful repeats.
6. Preserve all control outcomes. A failed/missing positive control or insufficient assay sensitivity blocks interpreting zero/no-signal as biological counterevidence.
7. Non-significance does not establish no biological effect. Biological absence/equivalence requires accepted controls, interpretability, interval/MDE/detection-limit evidence, and equivalence margin where applicable.
8. Randomization, batch balancing, blinding, and prospective exclusion require supplied procedure and timing evidence; a later assertion is not enough.
9. Preserve dropout, exclusion, contamination, failed QC, and post-unblinding decisions with their timing and affected populations.
10. Imaging claims retain acquisition settings, processing history, ROI rule/decision, selection process, and linkage from raw image to quantified output when supplied. A representative image is not independent quantification.
11. Construct/sequence compatibility across experiments or domains requires versioned mapping; similar names are insufficient.
12. Ethics/consent/permit and restricted participant metadata follow disclosure policy. Withholding never implies noncompliance, and no compliance claim is inferred from silence.
13. Pack-specific gates may qualify/block a claim but never delete the underlying negative/failure evidence.

## Forbidden inferences

Do not infer:

- biological N from well, aliquot, field, image, cell, ROI, read, or technical replicate counts;
- donor/sample independence from distinct labels;
- species, sex/gender, genotype, passage, lot, RRID, authentication, mycoplasma status, viability, storage, or consent from common practice;
- construct/primer/antibody identity or specificity from a short name;
- exact concentration, temperature, incubation, volume, timing, instrument setting, or calibration from a protocol reference/default;
- randomization, blinding, batch balance, or prospective exclusion from methods-style prose without timing/execution evidence;
- assay sensitivity or valid negative evidence from a zero signal alone;
- absence/equivalence from a non-significant test;
- causality/mechanism from perturbation association without accepted design/bridge support;
- that a successful repeat erases contamination, failed controls, or earlier failure.

## Failure behavior

- Return `cannot_complete` if the selected schema/roots cannot preserve contributor-to-pool lineage, replicate units, control failures, exclusions, protocol deviations, or withheld participant/restricted fields safely.
- Return `needs_review` for disputed sample identity, uncertain biological-N basis, ambiguous pool lineage, missing/failed controls affecting interpretation, post-unblinding exclusions, construct/sequence mismatch, unclear analysis population, or high-impact mechanistic/causal claims.
- Emit supported wet-lab objects with unknown fields and explicit gate findings when partial data are available; do not fill protocol/QC gaps.
- A failed assay, contaminated batch, unreadable instrument export, or negative result is a first-class output, not a reason to omit the experiment.

## Continuation behavior

- Use a complete experimental lineage/control unit as the pack transaction: material contributors through assay attempt, controls, exclusions, results, and failures.
- Do not split a treatment result from its controls, a pool from contributors, or an image quantification from selection/ROI provenance across pages.
- On truncation, omit the incomplete unit and list its stable WorkUnit/Attempt/material root ID.
- Resume against the same material/protocol/result versions; preserve all earlier failed attempts and QC events.
- Completion means pack fields/gates were evaluated for requested units, not that wet-lab reporting is globally complete or the assay was valid.

## Task instruction

Apply wet-lab fields and gates to the selected stage. Model material and sample lineage, true replicate units, actual protocol/deviations, controls and assay sensitivity, imaging provenance, exclusions, failures, and disclosure constraints; block unsupported biological-N, negative-effect, identity, or mechanism inferences and return only shared candidate patches.
