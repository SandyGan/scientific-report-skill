import { describe, expect, it } from "vitest";

import { loadSchemas } from "../../src/lib/schema.js";
import type { ScientificReport } from "../../src/lib/types.js";
import { baseReport, known, sourceBinding, sourceHash, unknown } from "../fixtures/base-report.js";
import { evaluationFor, findingsFor, validateSelected } from "../fixtures/validation-assertions.js";

type UnknownRecord = Record<string, unknown>;

const WET_SECTIONS = [
  "specimens_and_lineage",
  "materials_and_identity",
  "replicates_and_units",
  "allocation_and_blinding",
  "controls_and_sensitivity",
  "protocol_and_calibration",
  "imaging_and_roi",
  "analysis_population",
  "quality_failures_and_exclusions",
] as const;

const AI_SECTIONS = [
  "datasets_and_licenses",
  "splits_and_grouping",
  "row_lineage",
  "labels_and_raters",
  "leakage_assessment",
  "preprocessing_fit_scope",
  "implementation_and_weights",
  "search_trials_and_selection",
  "randomness_and_nondeterminism",
  "evaluation_and_uncertainty",
  "test_access",
  "inference_and_smoke_test",
] as const;

const MD_SECTIONS = [
  "source_structure_and_mapping",
  "system_composition",
  "protonation_and_chemistry",
  "force_field_and_parameters",
  "solvation_ions_and_boundary",
  "simulation_protocol",
  "replicas_and_randomness",
  "segments_checkpoints_and_restarts",
  "trajectory_slicing_and_processing",
  "equilibration_correlation_and_effective_samples",
  "convergence_and_replica_heterogeneity",
] as const;

function sectionCoverage(sectionId: string): UnknownRecord {
  return {
    section_id: sectionId,
    applicability: "applicable",
    applicability_decision_id: "applicability.core.always",
    coverage_status: "covered",
    source_universe_ids: ["universe.fixture"],
    represented_object_ids: [],
    omission_or_gap_reasons: known([]),
    evidence_bindings: [sourceBinding()],
    last_evaluated_at: known("2026-08-24T00:00:00.000Z"),
  };
}

function wetPayload(includeTypedMembers: boolean): UnknownRecord {
  const specimen = (specimenId: string, donor: string): UnknownRecord => ({
    specimen_id: specimenId,
    kind: "primary_sample",
    parent_specimen_ids: [],
    source_bindings: [sourceBinding()],
    organism: known("Homo sapiens"),
    cell_line: unknown<string>("This is a primary specimen, not a cell line."),
    donor: known(donor),
    sample_identity: known(specimenId),
    batch: known("batch.fixture"),
    well_or_container: known(`container.${specimenId}`),
    pool_members: known([]),
    collection_context: known("Collected for work.wet only."),
    disposition: known("included"),
  });
  const design: UnknownRecord = {
    design_id: "design.wet",
    work_unit_id: "work.wet",
    source_bindings: [sourceBinding()],
    biological_unit: known("Independent donor"),
    technical_unit: known("One primary specimen measurement"),
    experimental_unit: known("One donor-derived specimen"),
    observational_unit: known("One recorded assay value"),
    analysis_unit: known("One donor-derived specimen"),
    biological_n: known(2),
    technical_n: known(2),
    pool_counting_policy: known("Distinct donor lineages are independent and nonoverlapping."),
    randomization: known("Balanced random allocation"),
    batch_balance: known("Donors balanced across the single registered batch"),
    blinding: known("Outcome scorer blinded"),
    unblinding: known("After analysis lock"),
    dropout_policy: known("No dropout in the registered denominator"),
  };
  if (includeTypedMembers) design.specimen_ids = ["specimen.wet-a", "specimen.wet-b"];
  return {
    payload_id: "payload.wet.typed-members",
    domain: "wet_lab",
    pack_version: "1.0.0",
    applies_to: { work_unit_ids: ["work.wet"], attempt_ids: [], result_ids: [], entity_ids: [] },
    section_coverage: WET_SECTIONS.map(sectionCoverage),
    specimen_records: [specimen("specimen.wet-a", "donor.a"), specimen("specimen.wet-b", "donor.b")],
    material_records: [],
    replicate_designs: [design],
    control_records: [],
    protocol_records: [],
    imaging_records: [],
    analysis_contexts: [],
    qc_events: [],
  };
}

function modelRecord(modelId: string, role: string): UnknownRecord {
  return {
    model_record_id: modelId,
    source_bindings: [sourceBinding()],
    role,
    architecture: known("A bounded fixture architecture"),
    implementation_artifact_ids: [],
    source_tree_hash: known(sourceHash(`tree.${modelId}`)),
    uncommitted_change_artifact_id: known("none"),
    initialization_or_pretraining: known("Fixture initialization"),
    weight_artifact_ids: [],
    input_contract: known("Fixture input contract"),
    output_contract: known("Fixture output contract"),
  };
}

function trialRecord(trialId: string, modelId: string): UnknownRecord {
  return {
    trial_id: trialId,
    search_id: "search.fixture",
    attempt_id: `attempt.${trialId}`,
    model_record_id: modelId,
    split_id: "split.fixture",
    source_bindings: [sourceBinding()],
    status: "completed",
    hyperparameters: known({ learning_rate: 0.01 }),
    training_invocation_id: known(`invocation.${trialId}`),
    randomness_record_ids: [],
    checkpoint_artifact_ids: [],
    metric_result_ids: [],
    failure_event_ids: [],
    started_at: known("2026-08-20T00:00:00.000Z"),
    ended_at: known("2026-08-20T01:00:00.000Z"),
  };
}

function aiPayload(mode: "matched" | "mismatch" | "ensemble" | "post_search"): UnknownRecord {
  const ensemble = mode === "ensemble";
  const postSearch = mode === "post_search";
  const inputModels = ensemble ? ["model.a", "model.b"] : ["model.a"];
  const inputTrials = ensemble ? ["trial.a", "trial.b"] : ["trial.a"];
  const outputModels = ensemble ? ["model.ensemble"] : postSearch ? ["model.b"] : ["model.a"];
  const models = ensemble
    ? [
        modelRecord("model.a", "ensemble_member"),
        modelRecord("model.b", "ensemble_member"),
        modelRecord("model.ensemble", "selected"),
      ]
    : [
        modelRecord("model.a", mode === "mismatch" || postSearch ? "candidate" : "selected"),
        modelRecord("model.b", mode === "mismatch" || postSearch ? "selected" : "candidate"),
      ];
  const trials = ensemble
    ? [trialRecord("trial.a", "model.a"), trialRecord("trial.b", "model.b")]
    : [trialRecord("trial.a", "model.a"), trialRecord("trial.b", "model.b")];
  return {
    payload_id: `payload.ai.${mode}`,
    domain: "ai_ml",
    pack_version: "1.0.0",
    applies_to: { work_unit_ids: [], attempt_ids: [], result_ids: [], entity_ids: [] },
    section_coverage: AI_SECTIONS.map(sectionCoverage),
    dataset_records: [],
    split_records: [],
    label_records: [],
    lineage_records: [],
    leakage_assessments: [],
    preprocessing_records: [],
    model_records: models,
    search_records: [
      {
        search_id: "search.fixture",
        work_unit_id: "work.search",
        source_bindings: [sourceBinding()],
        search_space: known("Registered bounded search space"),
        search_strategy: known("Exhaustive fixture search"),
        budget: known("Two trials"),
        selection_metric: known("Validation metric"),
        selection_rule: known(ensemble
          ? "Build the registered ensemble from both selected trials."
          : postSearch
            ? "Apply the registered post-search transformation to the selected trial model."
            : "Choose the best completed validation trial."),
        selection_partition: known("validation"),
        trial_ids: ["trial.a", "trial.b"],
        failed_trial_ids: [],
        selected_trial_ids: inputTrials,
        selection_derivation: {
          mode: ensemble ? "ensemble" : postSearch ? "post_search_rule" : "direct_trial_model",
          input_selected_trial_ids: inputTrials,
          input_model_record_ids: inputModels,
          output_model_record_ids: outputModels,
          rule_or_rationale: known(ensemble
            ? "The source-bound ensemble rule combines exactly the two models derived from the selected trials."
            : postSearch
              ? "The source-bound post-search rule transforms the selected trial model into the declared selected output model."
              : "The selected model is exactly the model produced by the selected completed trial."),
          source_bindings: [sourceBinding()],
        },
      },
    ],
    trial_records: trials,
    test_access_events: [],
    evaluation_records: [],
    randomness_records: [],
    inference_recipes: [],
  };
}

function aiSelectionReport(mode: "matched" | "mismatch" | "ensemble" | "post_search"): { report: ScientificReport; payload: UnknownRecord } {
  const report = baseReport();
  report.module_manifest.push({
    module_id: "ai_ml",
    protocol_version: "1.0.0",
    status: "enabled",
    applicability_decision_id: "applicability.core.always",
    detected_triggers: ["bounded AI/ML search and selection fixture"],
    section_ids: ["core.empty-ledger"],
  });
  const payload = aiPayload(mode);
  (report.extensions as unknown as UnknownRecord).domain_payloads = [payload];
  return { report, payload };
}

function replicaRecord(replicaId: string, seed: number): UnknownRecord {
  return {
    replica_id: replicaId,
    work_unit_id: "work.md",
    system_id: "system.md",
    source_bindings: [sourceBinding()],
    independence_basis: known("Independent initial velocity seed and registered replica lineage"),
    root_seed: known(seed),
    seed_derivation: known("Direct registered root seed"),
    initial_condition_artifact_ids: [`artifact.initial.${replicaId}`],
    segment_ids: [`segment.${replicaId}`],
    checkpoint_artifact_ids: [],
  };
}

function mdPayload(adequate: boolean): UnknownRecord {
  const missing = <T>(fieldName: string) => unknown<T>(`${fieldName} is unknown in the negative adequacy fixture.`);
  const diagnostics = adequate
    ? {
        autocorrelation_method: known("Integrated autocorrelation time by observable and replica"),
        correlation_time_estimates: known({ observable_a: [4.1, 4.4] }),
        effective_sample_sizes: known({ observable_a: [520, 498] }),
        convergence_criteria: known("Every observable ESS >= 400 and replica estimates agree within the prespecified bound."),
        convergence_diagnostics: known({ rank_normalized_rhat: 1.01 }),
        replica_level_results: known({ replica_a: 1.2, replica_b: 1.18 }),
        replica_heterogeneity: known({ assessment: "within prespecified bound" }),
      }
    : {
        autocorrelation_method: missing<string>("autocorrelation method"),
        correlation_time_estimates: missing<unknown>("correlation-time estimates"),
        effective_sample_sizes: missing<unknown>("effective sample sizes"),
        convergence_criteria: missing<string>("convergence criteria"),
        convergence_diagnostics: missing<unknown>("convergence diagnostics"),
        replica_level_results: missing<unknown>("replica-level results"),
        replica_heterogeneity: missing<unknown>("replica heterogeneity"),
      };
  return {
    payload_id: `payload.md.${adequate ? "adequate" : "unknown"}`,
    domain: "molecular_dynamics",
    pack_version: "1.0.0",
    applies_to: { work_unit_ids: ["work.md"], attempt_ids: [], result_ids: [], entity_ids: [] },
    section_coverage: MD_SECTIONS.map(sectionCoverage),
    structure_records: [],
    system_records: [],
    protonation_records: [],
    force_field_records: [],
    solvation_records: [],
    phase_records: [],
    replica_records: adequate
      ? [replicaRecord("replica.a", 101), replicaRecord("replica.b", 202)]
      : [replicaRecord("replica.a", 101)],
    segment_records: [],
    restart_records: [],
    trajectory_analysis_records: [
      {
        trajectory_analysis_id: "trajectory-analysis.fixture",
        analysis_run_id: "analysis-run.md",
        result_ids: [],
        replica_ids: adequate ? ["replica.a", "replica.b"] : ["replica.a"],
        segment_record_ids: ["segment.replica.a"],
        source_bindings: [sourceBinding()],
        trajectory_artifact_ids: ["artifact.trajectory"],
        periodic_boundary_processing: known("Molecules made whole before fitting"),
        fit_selection: known("Backbone atoms"),
        measurement_selection: known("Registered observable atoms"),
        frame_range: known("Frames 1000 through 100000"),
        stride: known(10),
        data_slice_id: known("slice.md"),
        burn_in_definition: known("First 1000 frames excluded prospectively"),
        burn_in_decision_timing: known("predefined"),
        observable_definitions: known(["observable_a"]),
        ...diagnostics,
        convergence_conclusion: known(adequate
          ? "The registered sampling is sufficient for the bounded observable estimates."
          : "Sampling adequately represents all reported observables."),
        sampling_adequacy_assessment: {
          conclusion_status: "adequate",
          assessed_observables: known(["observable_a"]),
          criteria_met: known(true),
          diagnostics_support_conclusion: known(true),
          effective_sample_sizes_support_conclusion: known(true),
          replica_assessment_supports_conclusion: known(true),
          rationale: known(adequate
            ? "Known diagnostics, ESS, replica results, and heterogeneity meet the registered criteria."
            : "The text asserts adequacy even though its required diagnostic records are unknown."),
          source_bindings: [sourceBinding()],
        },
      },
    ],
  };
}

function mdAdequacyReport(adequate: boolean): { report: ScientificReport; payload: UnknownRecord } {
  const report = baseReport();
  report.module_manifest.push({
    module_id: "molecular_dynamics",
    protocol_version: "1.0.0",
    status: "enabled",
    applicability_decision_id: "applicability.core.always",
    detected_triggers: ["trajectory sampling adequacy fixture"],
    section_ids: ["core.empty-ledger"],
  });
  const payload = mdPayload(adequate);
  (report.extensions as unknown as UnknownRecord).domain_payloads = [payload];
  return { report, payload };
}

describe("wet-lab typed replicate membership schema", () => {
  it("[SCIENTIFIC-006 schema negative] rejects a ReplicateDesign with no explicit specimen_ids denominator", () => {
    const result = loadSchemas().validateDomainPack("wet_lab", wetPayload(false));

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        instancePointer: "/replicate_designs/0",
        keyword: "required",
        params: expect.objectContaining({ missingProperty: "specimen_ids" }),
      }),
    ]));
  });

  it("[SCIENTIFIC-006 schema positive] accepts a typed design-scoped specimen_ids denominator", () => {
    const result = loadSchemas().validateDomainPack("wet_lab", wetPayload(true));

    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });
});

describe("AI/ML selected-model derivation", () => {
  it("[SCIENTIFIC-007 negative] rejects a selected-role model that did not derive from selected_trial_ids", () => {
    const { report, payload } = aiSelectionReport("mismatch");
    expect(loadSchemas().validateDomainPack("ai_ml", payload).valid).toBe(true);

    const result = validateSelected(report, ["AIM004"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "AIM004").status).toBe("fail");
    expect(findingsFor(result, "AIM004").some((finding) =>
      finding.message.includes("Selected-role models do not exactly match")
    )).toBe(true);
  });

  it("[SCIENTIFIC-007 positive direct] accepts selected-role models equal to models from selected completed trials", () => {
    const { report, payload } = aiSelectionReport("matched");
    expect(loadSchemas().validateDomainPack("ai_ml", payload).valid).toBe(true);

    const result = validateSelected(report, ["AIM004"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "AIM004").status).toBe("pass");
    expect(findingsFor(result, "AIM004")).toEqual([]);
  });

  it("[SCIENTIFIC-007 positive ensemble] accepts a selected ensemble only through a typed source-bound ensemble rule", () => {
    const { report, payload } = aiSelectionReport("ensemble");
    expect(loadSchemas().validateDomainPack("ai_ml", payload).valid).toBe(true);

    const result = validateSelected(report, ["AIM004"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "AIM004").status).toBe("pass");
    expect(findingsFor(result, "AIM004")).toEqual([]);
  });
  it("[SCIENTIFIC-007 positive post-search] accepts a transformed selected model only through a typed source-bound post-search rule", () => {
    const { report, payload } = aiSelectionReport("post_search");
    expect(loadSchemas().validateDomainPack("ai_ml", payload).valid).toBe(true);

    const result = validateSelected(report, ["AIM004"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "AIM004").status).toBe("pass");
    expect(findingsFor(result, "AIM004")).toEqual([]);
  });
});

describe("molecular-dynamics structured sampling adequacy", () => {
  it("[SCIENTIFIC-008 negative] rejects an adequacy paraphrase when diagnostics, ESS, criteria, replica results, and heterogeneity are unknown", () => {
    const { report, payload } = mdAdequacyReport(false);
    expect(loadSchemas().validateDomainPack("molecular_dynamics", payload).valid).toBe(true);

    const result = validateSelected(report, ["MDS002", "MFA004"]);
    const findings = findingsFor(result, "MDS002");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "MDS002").status).toBe("fail");
    expect(evaluationFor(result, "MFA004").status).toBe("fail");
    expect(findings[0]!.instancePointer).toBe("/extensions/domain_payloads/0/trajectory_analysis_records/0/sampling_adequacy_assessment");
    expect((findings[0]!.details as { missing: string[] }).missing).toEqual(expect.arrayContaining([
      "effective_sample_sizes",
      "convergence_criteria",
      "convergence_diagnostics",
      "replica_level_results",
      "replica_heterogeneity",
      "at least two replica identities",
    ]));
  });

  it("[SCIENTIFIC-008 positive] accepts an adequacy paraphrase only when the structured assessment and all diagnostic fields support it", () => {
    const { report, payload } = mdAdequacyReport(true);
    expect(loadSchemas().validateDomainPack("molecular_dynamics", payload).valid).toBe(true);

    const result = validateSelected(report, ["MDS002", "MFA004"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "MDS002").status).toBe("pass");
    expect(evaluationFor(result, "MFA004").status).toBe("pass");
    expect(findingsFor(result, "MDS002")).toEqual([]);
    expect(findingsFor(result, "MFA004")).toEqual([]);
  });
});
