import type { ScientificReport } from "../../src/lib/types.js";
import { baseReport, known, notApplicable, sourceBinding, sourceHash, unknown } from "./base-report.js";
import {
  makeArtifact,
  makeCampaign,
  makeClaim,
  makeEvidence,
  makeEvidenceEdge,
  makeInterval,
  makeResult,
  makeWorkUnit,
} from "./record-builders.js";

export interface DerivationClosureFixtureOptions {
  unknownSliceHash?: boolean;
  disconnectSliceFromDerivation?: boolean;
}

export function quantitativeDerivationReport(
  options: DerivationClosureFixtureOptions = {},
): ScientificReport {
  const report = baseReport();
  const campaign = makeCampaign("campaign.derivation", "this_project", "attempted", {
    work_unit_ids: ["work.derivation"],
  });
  const unit = makeWorkUnit("work.derivation", campaign.campaign_id, "this_project", "attempted", {
    output_object_ids: ["result.estimate", "artifact.estimate"],
  });
  const inputArtifact = makeArtifact("artifact.dataset", "dataset", {
    source_item_ids: ["source.base"],
  });
  const outputArtifact = makeArtifact("artifact.estimate", "result_output", {
    derivation_ids: ["derivation.estimate"],
    analysis_run_ids: ["run.estimate"],
  });

  report.campaigns = [campaign];
  report.work_units = [unit];
  report.artifacts = [inputArtifact, outputArtifact];
  report.data_slices = [
    {
      data_slice_id: "slice.primary",
      data_slice_version: "1.0.0",
      name: "Prespecified primary analysis rows",
      input_artifacts: [
        {
          artifact_id: inputArtifact.artifact_id,
          artifact_version: inputArtifact.artifact_version,
          content_hash: inputArtifact.content_hash,
        },
      ],
      locator: {
        locator_kind: "table_rows",
        table_or_object: known("measurements"),
        columns_or_fields: known(["biological_unit", "condition", "response"]),
        row_or_record_selector: known("qc_pass == true"),
        frame_or_time_selector: notApplicable<string>("The tabular analysis has no frame or time selector."),
        query: notApplicable<string>("The deterministic row selector is sufficient."),
        filter_expressions: known(["qc_pass == true", "analysis_set == 'primary'"]),
        ordering: known(["biological_unit ASC"]),
      },
      analysis_population_id: null,
      selected_unit_count: known(12),
      excluded_unit_count: known(2),
      selection_decision_event_ids: [],
      slice_hash: options.unknownSliceHash
        ? unknown("The filtered slice digest was not retained.")
        : known(sourceHash("slice.primary")),
      created_by_derivation_id: null,
      source_bindings: [sourceBinding()],
      extensions: {},
    },
  ];
  report.invocations = [
    {
      invocation_id: "invocation.estimate",
      invocation_version: "1.0.0",
      invocation_kind: "command",
      record_role: "historical_actual",
      executable: known("analysis/estimate"),
      arguments: [],
      command_line: known("analysis/estimate --input artifacts/artifact.dataset.json --output artifacts/artifact.estimate.json"),
      working_directory: known("analysis"),
      parameters: [],
      input_artifact_ids: [inputArtifact.artifact_id],
      output_artifact_ids: [outputArtifact.artifact_id],
      started_at: known("2026-08-20T10:00:00.000Z"),
      ended_at: known("2026-08-20T10:02:00.000Z"),
      termination_status: "completed",
      exit_code: known(0),
      log_artifact_ids: [],
      source_bindings: [sourceBinding()],
      extensions: {},
    },
  ];
  report.environments = [
    {
      environment_id: "environment.estimate",
      environment_version: "1.0.0",
      environment_hash: known(sourceHash("environment.estimate")),
      capture_method: known("Integrity-bound environment manifest"),
      captured_at: known("2026-08-20T10:00:00.000Z"),
      operating_system: known("POSIX-compatible runtime"),
      architecture: known("64-bit architecture"),
      container_or_image: notApplicable<string>("This execution used a locked host environment rather than a container."),
      software_components: [],
      hardware_components: [],
      locale: known("C.UTF-8"),
      timezone: known("UTC"),
      environment_variable_manifest_hash: known(sourceHash("environment.variables")),
      lock_artifact_ids: [],
      completeness: "complete",
      known_nondeterminism: [],
      source_bindings: [sourceBinding()],
      extensions: {},
    },
  ];
  report.random_states = [
    {
      random_state_id: "random-state.estimate",
      random_state_version: "1.0.0",
      randomness_used: "no",
      deterministic_intent: known(true),
      generator_or_algorithm: notApplicable<string>("The deterministic calculation uses no random generator."),
      seed_assignments: [],
      nondeterministic_operations: [],
      capture_status: "not_applicable",
      source_bindings: [sourceBinding()],
      extensions: {},
    },
  ];
  report.analysis_runs = [
    {
      analysis_run_id: "run.estimate",
      analysis_run_version: "1.0.0",
      run_role: "historical_primary",
      invocation_id: "invocation.estimate",
      code_artifacts: [],
      environment_id: "environment.estimate",
      random_state_id: "random-state.estimate",
      input_data_slice_ids: ["slice.primary"],
      input_derivation_ids: [],
      started_at: known("2026-08-20T10:00:00.000Z"),
      ended_at: known("2026-08-20T10:02:00.000Z"),
      execution_status: "completed",
      exit_code: known(0),
      output_artifact_ids: [outputArtifact.artifact_id],
      output_manifest_hash: known(sourceHash("run.estimate.outputs")),
      log_artifact_ids: [],
      source_bindings: [sourceBinding()],
      extensions: {},
    },
  ];
  report.derivations = [
    {
      derivation_id: "derivation.estimate",
      derivation_version: "1.0.0",
      derivation_kind: "statistical_estimate",
      description: "Calculate the prespecified condition contrast and confidence interval.",
      input_data_slice_ids: options.disconnectSliceFromDerivation ? [] : ["slice.primary"],
      input_derivation_ids: [],
      input_artifact_ids: [inputArtifact.artifact_id],
      operation_or_formula: known("mean(treated) - mean(control), with a prespecified confidence interval"),
      code_artifact_ids: [],
      parameters: [],
      analysis_run_id: "run.estimate",
      output_data_slice_ids: [],
      output_artifact_ids: [outputArtifact.artifact_id],
      derived_values: [
        {
          name: "condition_difference",
          value: known(1.25),
          unit: known("relative units"),
          value_hash: known(sourceHash("derived.condition_difference")),
        },
      ],
      derivation_status: "complete",
      source_bindings: [sourceBinding()],
      extensions: {},
    },
  ];
  report.results = [
    makeResult("result.estimate", unit.work_unit_id, {
      result_kind: "quantitative",
      statement: "The treated condition increased the prespecified endpoint by 1.25 relative units.",
      effect_estimate: {
        estimate: known(1.25),
        unit: known("relative units"),
        scale: known("absolute difference"),
        interval: makeInterval(0.4, 2.1),
        p_value: known(0.01),
        sample_or_analysis_unit_count: known(12),
        estimation_method: known("Prespecified difference of means"),
      },
      derivation_closure_status: "complete",
      scientific_effect_class: "increase",
      statistical_decision: "reject_null",
      interpretability_status: "interpretable",
      data_slice_ids: ["slice.primary"],
      derivation_ids: ["derivation.estimate"],
      analysis_run_ids: ["run.estimate"],
      output_artifact_ids: [outputArtifact.artifact_id],
    }),
  ];
  report.evidence_items = [
    makeEvidence("evidence.estimate", {
      evidence_kind: "derived_value",
      summary: "Integrity-bound estimate and interval from the primary analysis slice.",
      result_ids: ["result.estimate"],
      artifact_ids: [outputArtifact.artifact_id],
      data_slice_ids: ["slice.primary"],
      derivation_ids: ["derivation.estimate"],
      analysis_run_ids: ["run.estimate"],
      source_item_ids: [],
    }),
  ];
  report.claims = [
    makeClaim("claim.estimate", {
      claim_type: "comparative",
      proposition: "Treatment increased the endpoint under the registered fixture conditions.",
      evidence_edge_ids: ["edge.estimate-support"],
    }),
  ];
  report.evidence_edges = [
    makeEvidenceEdge("edge.estimate-support", "evidence.estimate", "claim.estimate"),
  ];
  return report;
}
