# Domain fragment: molecular dynamics

## Prompt declaration

- **Prompt ID:** `report_prompt.pack.molecular_dynamics`
- **Version:** `0.2.0`
- **Purpose:** Add molecular-dynamics-specific provenance and gates for structure-to-system preparation, force-field and simulation parameters, replica/seed/restart history, trajectory analysis slices, convergence evidence, and cross-domain compatibility while preserving crashes, partial trajectories, and parameter-changing restarts.

## Required inputs

When `molecular_dynamics` is enabled, in addition to core and selected-stage inputs provide when available:

- Structure accession/source, assembly/model/chain/version and raw-to-prepared residue/atom mappings.
- Altloc choices, missing residues/atoms, mutations, termini/caps, disulfides/covalent links, unresolved sites, and modeled segments.
- Component records for protein/nucleic acid/lipid/glycan/ligand/metal/cofactor; pH, protonation method/states (including histidine), force-field/file versions/hashes, atom typing/charges.
- Solvent/water/ion model, concentration, combining rules, box/PBC, neutralization, and preparation artifacts.
- Minimization/equilibration/production/enhanced-sampling phase/segment records with actual integrator, time step, thermostat, barostat, constraints, cutoffs, PME, restraints, output/checkpoint settings, and units.
- Replica identity, seed tree, invocation, checkpoint/restart/continuation lineage, crash/exit/failure and parameter-change records.
- Trajectory/topology/version/hash, PBC treatment, fitting/alignment selection, atom selection, frame/time range, stride, burn-in, observable derivation, autocorrelation/effective sample size, convergence criterion, and replica heterogeneity evidence.

## Structured outputs

Return only the shared patch-response JSON. When the canonical MD payload is requested and `/extensions/domain_payloads` is explicitly permitted, append exactly one complete `molecular_dynamics` payload at `/extensions/domain_payloads/-` with `object_type: "domain_payload"`; never authorize or mutate `/extensions` or a sibling extension key. Add MD candidates/diagnostics appropriate to the selected stage, including:

- versioned structure/system/component entities and explicit preparation/mapping transformations;
- parameter/protonation/force-field/solvation missingness and incompatibility findings;
- append-only phase/replica/attempt/segment/checkpoint/restart graphs with partial outputs and failures;
- trajectory DataSlices and analysis derivations with topology, selections, PBC/fit/frame/stride/burn-in context;
- uncertainty/correlation/effective-sample-size/convergence and replica-heterogeneity evidence only when supplied;
- cross-domain construct/sequence/condition/time-scale bridge dimensions;
- pack-gate findings and human-review tasks.

## Invariants

1. Pin source structure by accession/source, assembly, model, chain, version, and accepted mapping where supplied. Similar labels or sequences do not establish system identity.
2. Preserve every preparation transformation: altloc selection, repair/modeling, mutation, protonation, capping, bonding, component placement/removal, parameterization, solvation, and ion placement.
3. Keep uncertain protonation, missing atoms/residues, parameter assignments, charges, and atom typing explicit; do not substitute typical choices.
4. Record actual phase/segment parameters separately from planned protocols/defaults. Parameter changes create a new segment/attempt lineage, not a retroactive rewrite.
5. A run producing usable output until 60 ns and crashing at 80 ns retains both the usable interval and crash. A restart with changed parameters is a linked new segment/attempt; it does not make the original uninterrupted.
6. Replica IDs/seeds do not prove statistical independence. Shared starting structures, velocity derivation, checkpoints, enhanced-sampling exchanges, and analysis choices remain explicit dependencies.
7. A trajectory analysis DataSlice pins topology/trajectory versions, selections, PBC treatment, fitting, frame/time range, stride, burn-in, and observable derivation when known.
8. Trajectory frames are temporally correlated and not independent biological samples. Adjacent frames must not be randomly split across ML train/test as independent records.
9. Convergence/equilibration claims require supplied criteria and multiple relevant diagnostics/replica behavior. A single RMSD plateau or visual stability is insufficient.
10. Preserve autocorrelation/effective-sample-size estimates, uncertainty, and replica heterogeneity where supplied. Missing estimates remain missing, not zero correlation.
11. Force-field/model versions and parameter-file hashes are known only when supplied; matching family names are not version equivalence.
12. Cross-domain mechanism/validation requires versioned construct/sequence mapping and compatible conditions/endpoints/time scales; simulation behavior alone does not establish experimental mechanism.
13. Crashes, unstable phases, failed preparation, discarded equilibration, excluded replicas, negative observables, and inaccessible trajectories/checkpoints remain first-class records.
14. A recipe is not historical execution evidence, and this prompt does not run a simulation or inspect a referenced trajectory.

## Forbidden inferences

Do not infer:

- assembly/model/chain, missing-residue treatment, protonation, histidine state, cap, disulfide, covalent bond, ion, force field, water model, concentration, box, or parameter values from common practice;
- exact simulation length from planned duration or frame count without timestep/output mapping;
- restart/checkpoint continuity from matching filenames or timestamps;
- replica independence from distinct seeds or directories;
- convergence/equilibration from a stable-looking RMSD, final structure, or completed wall-clock job;
- effective sample size or uncertainty from frame count;
- unwrapped/aligned/PBC-correct analysis from a plot;
- identity/compatibility across MD, sequence, structure, wet-lab, or ML objects from names alone;
- mechanism or biological effect from simulation association;
- that a successful restart erases an earlier crash or parameter change.

## Failure behavior

- Return `cannot_complete` if the selected schema/roots cannot preserve segment/restart lineage, parameter changes, partial trajectories, crashes, analysis DataSlices, or disclosure-safe artifact states.
- Return `needs_review` for disputed structure/system mapping, unresolved protonation/parameterization, ambiguous time/frame mapping, checkpoint lineage uncertainty, possible replica dependence, missing convergence criteria, incompatible topology/trajectory, or cross-domain construct/condition mismatch.
- Emit supported system/run/analysis candidates with explicit unknowns; never fill standard MD defaults or label a simulation converged/reproducible without supplied evidence.
- Crashes, partial usable intervals, excluded replicas, failed analyses, and non-convergent/heterogeneous behavior remain formal outputs.

## Continuation behavior

- Use a complete simulation-analysis lineage as the transaction: structure/system preparation through replica/attempt/segments/restarts, trajectory slice, analysis result, failure, and convergence evidence.
- Do not page a successful restart separately from the original crash or a result separately from PBC/fit/frame/burn-in context.
- On truncation, omit the incomplete system/replica/analysis unit and list its stable root ID.
- Resume against identical system/topology/trajectory/segment versions; represent changed parameters, topology, or restarted runs as new versioned units.
- Completion means pack fields/gates were evaluated for requested units, not that trajectories were inspected, simulations converged, or an MD campaign is globally complete.

## Task instruction

Apply MD provenance fields and gates to the selected stage. Model structure-to-system transformations, actual parameters, replica/seed/segment/checkpoint/restart history, partial output and crashes, trajectory DataSlices, correlation/convergence evidence, and cross-domain mappings; reject unsupported defaults, independence, convergence, or mechanism claims and return only shared candidate patches.
