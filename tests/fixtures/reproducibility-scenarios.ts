import type {
  AccessAssessment,
  AxisAssessment,
  ReproducibilityAxisAssessments,
  ReproducibilityUnit,
  ScientificReport,
} from "../../src/lib/types.js";
import { baseReport, known, notApplicable, sourceBinding, unknown, withheld } from "./base-report.js";
import { makeArtifact, makeCampaign, makeWorkUnit } from "./record-builders.js";

function axis(
  state: AxisAssessment["state"],
  rationale: string,
  evidenceArtifactIds: string[] = [],
): AxisAssessment {
  return {
    state,
    rationale,
    evidence_artifact_ids: evidenceArtifactIds,
    source_bindings: [sourceBinding()],
  };
}

function axes(overrides: Partial<ReproducibilityAxisAssessments> = {}): ReproducibilityAxisAssessments {
  return {
    provenance_closure: axis("partial", "The provenance closure is only partially documented."),
    recipe_fidelity: axis("unsatisfied", "No replay recipe is declared."),
    data_and_artifact_access: axis("unknown", "Access was not assessed."),
    environment_capture: axis("partial", "Only selected environmental conditions were recorded."),
    random_state_capture: axis("not_applicable", "This unit uses no computational random state."),
    replay_verification: axis("unsatisfied", "No verification replay was run."),
    independent_computational_reproduction: axis("not_applicable", "No computational independence claim is made."),
    independent_experimental_replication: axis("unsatisfied", "No independent experimental replication is recorded."),
    claim_and_output_coverage: axis("not_applicable", "No claim or output reproduction denominator is declared at R0."),
    ...overrides,
  };
}

function comparisonSpecification(comparatorId: string, ready: boolean): ReproducibilityUnit["comparison_specification"] {
  return {
    comparator_id: comparatorId,
    timing_classification: ready ? "predefined" : "not_applicable",
    comparator_type: "canonical_record_identical",
    targets: ready
      ? known(["artifact.replayable-output"])
      : notApplicable<string[]>("No replay comparison target is declared for documented-only work."),
    equivalence_definition: ready
      ? known("The canonical output record must be identical.")
      : notApplicable<string>("No replay comparison is declared."),
    tolerances: notApplicable<string>("Canonical record identity has no numeric tolerance."),
    allowed_nondeterminism: ready
      ? known("None; this fixture analysis is deterministic.")
      : notApplicable<string>("No replay comparison is declared."),
    failure_conditions: ready
      ? known(["The canonical output record differs."])
      : notApplicable<string[]>("No replay comparison is declared."),
    source_bindings: [sourceBinding()],
  };
}

function weakDocumentedUnit(): ReproducibilityUnit {
  return {
    reproducibility_unit_id: "repro.documented",
    object_version: "1.0.0",
    title: "Documented-only wet-lab work unit",
    unit_kind: "wet_lab_experiment",
    criticality: "critical",
    scope: known("The bounded historical wet-lab work unit."),
    covered_work_unit_ids: ["work.documented"],
    covered_analysis_run_ids: [],
    covered_claim_ids: [],
    covered_output_ids: [],
    historical_invocation_ids: [],
    recipe_id: null,
    input_closure: axis("partial", "Some historical inputs are documented, but closure is incomplete."),
    artifact_closure: axis("partial", "Some historical outputs are documented, but closure is incomplete."),
    environment_record: { record_id: null, assessment: axis("partial", "Only selected environmental conditions were recorded.") },
    random_state_record: { record_id: null, assessment: axis("not_applicable", "The wet-lab protocol used no computational random state.") },
    access_assessment: {
      status: "unknown",
      conditions: unknown<string>("Access conditions were not assessed for this unit."),
      artifact_ids: [],
      source_bindings: [sourceBinding()],
    },
    comparison_specification: comparisonSpecification("comparator.documented", false),
    replay_events: [],
    independent_reproduction_events: [],
    axis_assessments: axes(),
    conservative_level: "R0_documented",
    level_reason: "The target and partial source closure are documented, but replay prerequisites are absent.",
    limitation_ids: [],
    source_bindings: [sourceBinding()],
    extensions: {},
  };
}

function replayableUnit(
  environmentState: AxisAssessment["state"],
  accessStatus: AccessAssessment["status"],
): ReproducibilityUnit {
  const accessSatisfied = accessStatus === "available_now" || accessStatus === "verified_procedure" || accessStatus === "not_applicable";
  const conditions = accessStatus === "verified_procedure"
    ? withheld<string>("Access instructions are protected but available to authorized reviewers.")
    : accessStatus === "available_now" || accessStatus === "not_applicable"
      ? notApplicable<string>("No additional access conditions apply.")
      : unknown<string>("Artifact access was not established for this unit.");
  const replayAxes = axes({
    provenance_closure: axis("satisfied", "The source and artifact identities are integrity-bound.", ["artifact.replayable-output"]),
    recipe_fidelity: axis("satisfied", "The recipe matches the completed historical invocation."),
    data_and_artifact_access: axis(accessSatisfied ? "satisfied" : accessStatus === "unknown" ? "unknown" : "unsatisfied", `Access assessment is ${accessStatus}.`, ["artifact.replayable-output"]),
    environment_capture: axis(environmentState, environmentState === "satisfied" ? "The environment capture is complete for this scoped unit." : `Environment capture is ${environmentState}.`),
    random_state_capture: axis("not_applicable", "The deterministic analysis uses no random state."),
    replay_verification: axis("unsatisfied", "Replay readiness does not assert a completed verification replay."),
    independent_computational_reproduction: axis("unsatisfied", "No independent computational reproduction is recorded."),
    independent_experimental_replication: axis("not_applicable", "Experimental replication does not apply to this analysis unit."),
    claim_and_output_coverage: axis("satisfied", "The single scoped output is covered by the replay recipe.", ["artifact.replayable-output"]),
  });
  return {
    reproducibility_unit_id: "repro.replayable",
    object_version: "1.0.0",
    title: "Replay-ready analysis output",
    unit_kind: "statistical_analysis",
    criticality: "critical",
    scope: known("The deterministic analysis producing artifact.replayable-output."),
    covered_work_unit_ids: ["work.replayable"],
    covered_analysis_run_ids: [],
    covered_claim_ids: [],
    covered_output_ids: ["artifact.replayable-output"],
    historical_invocation_ids: ["invocation.replayable"],
    recipe_id: "recipe.replayable",
    input_closure: axis("satisfied", "Every declared replay input is integrity-bound.", ["artifact.replayable-output"]),
    artifact_closure: axis("satisfied", "The target output is integrity-bound.", ["artifact.replayable-output"]),
    environment_record: { record_id: null, assessment: axis(environmentState, environmentState === "satisfied" ? "The environment is completely captured." : `Environment capture is ${environmentState}.`) },
    random_state_record: { record_id: null, assessment: axis("not_applicable", "The deterministic analysis uses no random state.") },
    access_assessment: {
      status: accessStatus,
      conditions,
      artifact_ids: ["artifact.replayable-output"],
      source_bindings: [sourceBinding()],
    },
    comparison_specification: comparisonSpecification("comparator.replayable", true),
    replay_events: [],
    independent_reproduction_events: [],
    axis_assessments: replayAxes,
    conservative_level: "R1_replay_ready",
    level_reason: "Source closure, recipe fidelity, access, environment, random-state applicability, and a predefined comparator support replay readiness.",
    limitation_ids: [],
    source_bindings: [sourceBinding()],
    extensions: {},
  };
}

export interface ScopedReproducibilityFixtureOptions {
  replayableEnvironmentState?: AxisAssessment["state"];
  replayableAccessStatus?: AccessAssessment["status"];
}

export function scopedReproducibilityReport(
  options: ScopedReproducibilityFixtureOptions = {},
): ScientificReport {
  const report = baseReport();
  report.campaigns = [
    makeCampaign("campaign.repro", "this_project", "attempted", {
      work_unit_ids: ["work.documented", "work.replayable"],
    }),
  ];
  report.work_units = [
    makeWorkUnit("work.documented", "campaign.repro", "this_project", "attempted"),
    makeWorkUnit("work.replayable", "campaign.repro", "this_project", "attempted", {
      output_object_ids: ["artifact.replayable-output"],
    }),
  ];
  report.artifacts = [makeArtifact("artifact.replayable-output", "result_output")];
  report.invocations = [
    {
      invocation_id: "invocation.replayable",
      invocation_version: "1.0.0",
      invocation_kind: "command",
      record_role: "historical_actual",
      executable: known("analysis/replay"),
      arguments: [],
      command_line: known("analysis/replay --recipe recipes/replayable.json"),
      working_directory: known("analysis"),
      parameters: [],
      input_artifact_ids: [],
      output_artifact_ids: ["artifact.replayable-output"],
      started_at: known("2026-08-21T00:00:00.000Z"),
      ended_at: known("2026-08-21T00:01:00.000Z"),
      termination_status: "completed",
      exit_code: known(0),
      log_artifact_ids: [],
      source_bindings: [sourceBinding()],
      extensions: {},
    },
  ];
  report.reproducibility_units = [
    weakDocumentedUnit(),
    replayableUnit(
      options.replayableEnvironmentState ?? "satisfied",
      options.replayableAccessStatus ?? "verified_procedure",
    ),
  ];
  return report;
}
