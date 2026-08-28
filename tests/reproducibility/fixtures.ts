import { sha256CanonicalJson } from "../../src/lib/hash.js";
import { canonicalJsonBytes } from "../../src/lib/json.js";
import type { ScientificReport } from "../../src/lib/types.js";
import {
  known,
  notApplicable,
  sourceBinding,
  sourceHash,
} from "../fixtures/base-report.js";
import { quantitativeDerivationReport } from "../fixtures/derivation-scenarios.js";
import { makeArtifact, makeDecision } from "../fixtures/record-builders.js";
import { scopedReproducibilityReport } from "../fixtures/reproducibility-scenarios.js";

const INPUT_ID = "artifact.replay-input";
const OUTPUT_ID = "artifact.replayable-output";
const RECIPE_ARTIFACT_ID = "artifact.recipe-replayable";
const ENVIRONMENT_MANIFEST_ID = "artifact.environment-manifest";
const ACCESS_ATTESTATION_ID = "artifact.access-attestation";
const ENVIRONMENT_ID = "environment.replayable";
const RANDOM_STATE_ID = "random-state.replayable";
const HISTORICAL_INVOCATION_ID = "invocation.replayable";

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Expected an object fixture value.");
  return value as Record<string, unknown>;
}

function bindRecipeRecordHash(report: ScientificReport): void {
  const unit = report.reproducibility_units[1]!;
  const extension = object(unit);
  const record = extension.recipe_record;
  const hash = sha256CanonicalJson(record);
  extension.recipe_record_hash = hash;
  const recipeArtifact = report.artifacts.find((artifact) => artifact.artifact_id === RECIPE_ARTIFACT_ID);
  if (recipeArtifact === undefined) throw new Error("Replay fixture recipe artifact is missing.");
  recipeArtifact.content_hash = known(hash);
  recipeArtifact.byte_size = known(canonicalJsonBytes(record).byteLength);
}

/** Keep focused tests compatible with the immutable source-binding contract owned by the provenance workstream. */
export function completeFixtureSourceBindings(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => completeFixtureSourceBindings(item, seen));
    return;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.source_item_id === "string" && candidate.locator !== undefined && typeof candidate.binding_role === "string") {
    candidate.source_snapshot_id = typeof candidate.source_snapshot_id === "string" ? candidate.source_snapshot_id : "snapshot.base";
    candidate.snapshot_registry_hash = sourceHash("fixture.snapshot-registry");
    candidate.content_hash = typeof candidate.content_hash === "string" ? candidate.content_hash : sourceHash(`fixture.content:${candidate.source_item_id}`);
    candidate.excerpt_hash = sourceHash(`fixture.excerpt:${candidate.source_item_id}`);
    candidate.chunk_ids = ["chunk.fixture"];
    candidate.parser_identity = {
      parser_name: "fixture-parser",
      parser_version: "1.0.0",
      configuration_hash: sourceHash("fixture.parser-configuration"),
      parser_result_id: "parser-result.fixture",
    };
    candidate.binding_scope = "whole_source";
  }
  Object.values(candidate).forEach((item) => completeFixtureSourceBindings(item, seen));
}

function addCoverageContracts(report: ScientificReport): void {
  const documented = object(report.reproducibility_units[0]!);
  const replayable = object(report.reproducibility_units[1]!);
  documented.coverage_denominator_decision = {
    decision_event_id: "decision.repro-documented-denominator",
    critical_unit_membership: "included",
    critical_claim_ids: [],
    critical_output_ids: [],
    exclusions: [],
    rationale: "The documented work is independently retained in the critical-unit denominator.",
    source_bindings: [sourceBinding(undefined, "decision_timing")],
  };
  documented.coverage_disposition = {
    status: "assessed",
    justification: "The historical wet-lab unit has an explicit bounded R0 assessment.",
    source_bindings: [sourceBinding()],
  };
  replayable.coverage_denominator_decision = {
    decision_event_id: "decision.repro-replayable-denominator",
    critical_unit_membership: "included",
    critical_claim_ids: [],
    critical_output_ids: [OUTPUT_ID],
    exclusions: [],
    rationale: "The primary analysis output is independently retained in the critical output denominator.",
    source_bindings: [sourceBinding(undefined, "decision_timing")],
  };
  replayable.coverage_disposition = {
    status: "assessed",
    justification: "Replay readiness is assessed against complete bounded records.",
    source_bindings: [sourceBinding()],
  };
  report.decision_events.push(
    makeDecision("decision.repro-documented-denominator", ["repro.documented"], {
      decision_kind: "other",
      description: "Declare the independent critical-unit denominator membership for the documented unit.",
    }),
    makeDecision("decision.repro-replayable-denominator", ["repro.replayable", OUTPUT_ID], {
      decision_kind: "other",
      description: "Declare independent critical-unit and output denominator membership for the replayable unit.",
    }),
  );
}

function addReplayReadyRecords(report: ScientificReport): void {
  const unit = report.reproducibility_units[1]!;
  const extendedUnit = object(unit);
  const input = makeArtifact(INPUT_ID, "dataset");
  const recipeArtifact = makeArtifact(RECIPE_ARTIFACT_ID, "recipe");
  const environmentManifest = makeArtifact(ENVIRONMENT_MANIFEST_ID, "environment_lock");
  const accessAttestation = makeArtifact(ACCESS_ATTESTATION_ID, "protocol", { access_state: "restricted" });
  report.artifacts.push(input, recipeArtifact, environmentManifest, accessAttestation);

  const invocation = report.invocations[0]!;
  invocation.executable = known("analysis/replay");
  invocation.arguments = [
    { position: 0, name: known("input"), value: known(`artifacts/${INPUT_ID}.json`) },
    { position: 1, name: known("output"), value: known(`artifacts/${OUTPUT_ID}.json`) },
  ];
  invocation.command_line = known(`analysis/replay --input artifacts/${INPUT_ID}.json --output artifacts/${OUTPUT_ID}.json`);
  invocation.working_directory = known("analysis");
  invocation.input_artifact_ids = [INPUT_ID];
  invocation.output_artifact_ids = [OUTPUT_ID];
  Object.assign(object(invocation), {
    environment_id: ENVIRONMENT_ID,
    random_state_id: RANDOM_STATE_ID,
    input_manifest_hash: known(sourceHash("invocation.replayable.inputs")),
    output_manifest_hash: known(sourceHash("invocation.replayable.outputs")),
    argument_capture_status: "complete",
    parameter_capture_status: "complete",
  });

  report.environments = [{
    environment_id: ENVIRONMENT_ID,
    environment_version: "1.0.0",
    environment_hash: known(sourceHash(ENVIRONMENT_ID)),
    capture_method: known("Hash-bound environment manifest captured with the historical invocation."),
    captured_at: known("2026-08-21T00:00:00.000Z"),
    operating_system: known("FixtureOS 1"),
    architecture: known("x86_64"),
    container_or_image: notApplicable<string>("A lock manifest fully defines this host execution environment."),
    software_components: [{
      name: known("fixture-runtime"),
      version: known("1.0.0"),
      content_hash: known(sourceHash("fixture-runtime:1.0.0")),
      role: "runtime",
      source_bindings: [sourceBinding()],
    }],
    hardware_components: [],
    locale: known("C.UTF-8"),
    timezone: known("UTC"),
    environment_variable_manifest_hash: known(sourceHash("environment.variables")),
    lock_artifact_ids: [ENVIRONMENT_MANIFEST_ID],
    completeness: "complete",
    known_nondeterminism: [],
    source_bindings: [sourceBinding()],
    extensions: {},
    capture_manifest_artifact_id: ENVIRONMENT_MANIFEST_ID,
    captured_invocation_ids: [HISTORICAL_INVOCATION_ID],
  } as ScientificReport["environments"][number]];

  report.random_states = [{
    random_state_id: RANDOM_STATE_ID,
    random_state_version: "1.0.0",
    randomness_used: "no",
    deterministic_intent: known(true),
    generator_or_algorithm: notApplicable<string>("The replay calculation is deterministic and invokes no random generator."),
    seed_assignments: [],
    nondeterministic_operations: [],
    capture_status: "not_applicable",
    source_bindings: [sourceBinding()],
    extensions: {},
    state_artifact_id: null,
    captured_invocation_ids: [HISTORICAL_INVOCATION_ID],
    not_applicability_justification: known("The executable operation has no stochastic branch or external nondeterministic input."),
  } as ScientificReport["random_states"][number]];

  unit.environment_record.record_id = ENVIRONMENT_ID;
  unit.random_state_record.record_id = RANDOM_STATE_ID;
  const access = object(unit.access_assessment);
  Object.assign(access, {
    actor_scope: known("A researcher authorized to read the project artifact registry."),
    authority: known("The project data custodian grants artifact-registry access."),
    license_or_terms: notApplicable<string>("Fixture artifacts have no additional license terms."),
    procedure_attestation_artifact_id: ACCESS_ATTESTATION_ID,
  });

  const comparison = object(unit.comparison_specification);
  Object.assign(comparison, {
    target_artifact_ids: [OUTPUT_ID],
    decision_rule: {
      metric: known("Canonical JSON SHA-256 equality"),
      operator: "canonical_hash_equal",
      threshold: notApplicable<number>("Canonical hash equality has no numeric threshold."),
      lower_bound: notApplicable<number>("Canonical hash equality has no lower bound."),
      upper_bound: notApplicable<number>("Canonical hash equality has no upper bound."),
      unit: notApplicable<string>("A cryptographic equality decision is unitless."),
      implementation: known("Built-in canonical-json-v1 SHA-256 comparator"),
      implementation_artifact_id: null,
    },
  });

  extendedUnit.recipe_artifact_id = RECIPE_ARTIFACT_ID;
  extendedUnit.recipe_record = {
    recipe_id: "recipe.replayable",
    recipe_version: "1.0.0",
    recipe_artifact_id: RECIPE_ARTIFACT_ID,
    schema_version: "1.0.0",
    title: "Replay the bounded deterministic fixture analysis",
    purpose: "Regenerate and compare the single primary analysis output.",
    report_id: report.report_id,
    report_version: report.report_version,
    target_reproducibility_unit_ids: [unit.reproducibility_unit_id],
    target_claim_ids: [],
    target_output_artifact_ids: [OUTPUT_ID],
    historical_invocation_ids: [HISTORICAL_INVOCATION_ID],
    inputs: [{
      input_id: "recipe-input.primary",
      name: "Primary replay input",
      artifact_id: INPUT_ID,
      artifact_version: input.artifact_version,
      content_hash: input.content_hash,
      required: true,
      access_state: "open",
      access_conditions: notApplicable<string>("The internal fixture input has no additional access conditions."),
      target_relative_path: known(`artifacts/${INPUT_ID}.json`),
    }],
    environment_id: ENVIRONMENT_ID,
    environment_hash: report.environments[0]!.environment_hash,
    environment_manifest_artifact_id: ENVIRONMENT_MANIFEST_ID,
    random_state_id: RANDOM_STATE_ID,
    random_state_artifact_id: null,
    random_state_policy: known("No random state is used; deterministic execution is required."),
    steps: [{
      step_id: "recipe-step.replay",
      step_order: 1,
      name: "Execute replay",
      action_kind: "command",
      description: "Run the deterministic fixture analysis over the bound input.",
      executable_or_action: known("analysis/replay"),
      arguments: known(["--input", `artifacts/${INPUT_ID}.json`, "--output", `artifacts/${OUTPUT_ID}.json`]),
      working_directory: known("analysis"),
      parameters: [],
      prerequisite_step_ids: [],
      input_ids: ["recipe-input.primary"],
      expected_output_ids: ["recipe-output.primary"],
      manual_confirmation_required: false,
      failure_handling: "Stop and retain the bound execution log and partial outputs.",
    }],
    expected_outputs: [{
      expected_output_id: "recipe-output.primary",
      artifact_id: OUTPUT_ID,
      name: "Canonical primary output",
      relative_path: known(`artifacts/${OUTPUT_ID}.json`),
      media_type: known("application/json"),
      comparison_method: "exact_hash",
      reference_hash: report.artifacts.find((artifact) => artifact.artifact_id === OUTPUT_ID)!.content_hash,
      acceptance_criteria: known("The canonical JSON SHA-256 digest must equal the bound reference digest."),
      required: true,
    }],
    historical_alignment: "exact",
    differences_from_historical: [],
    verification: {
      status: "not_run",
      verification_run_ids: [],
      verified_at: null,
      comparison_artifact_ids: [],
      summary: "The recipe is replay-ready but has not yet been verification-rerun.",
    },
    created_at: "2026-08-21T00:05:00.000Z",
    source_bindings: [sourceBinding()],
    extensions: {},
  };

  const dependencies = [INPUT_ID, OUTPUT_ID, RECIPE_ARTIFACT_ID, ENVIRONMENT_MANIFEST_ID, ACCESS_ATTESTATION_ID];
  unit.access_assessment.artifact_ids = [...dependencies];
  unit.axis_assessments.data_and_artifact_access.evidence_artifact_ids = [...dependencies];
  extendedUnit.bundle_dependency_artifact_ids = [...dependencies];
}

export function replayReadyReport(): ScientificReport {
  const report = scopedReproducibilityReport();
  addCoverageContracts(report);
  addReplayReadyRecords(report);
  completeFixtureSourceBindings(report);
  bindRecipeRecordHash(report);
  completeFixtureSourceBindings(report);
  return report;
}

export function verifiedReplayReport(): ScientificReport {
  const report = replayReadyReport();
  const unit = report.reproducibility_units[1]!;
  const extendedUnit = object(unit);
  const reference = report.artifacts.find((artifact) => artifact.artifact_id === OUTPUT_ID)!;
  const replayOutput = makeArtifact("artifact.replay-output", "result_output", { content_hash: structuredClone(reference.content_hash) });
  const comparisonEvidence = makeArtifact("artifact.comparison-evidence", "log");
  report.artifacts.push(replayOutput, comparisonEvidence);

  const verificationInvocation = structuredClone(report.invocations[0]!);
  verificationInvocation.invocation_id = "invocation.verification";
  verificationInvocation.record_role = "verification_run";
  verificationInvocation.command_line = known(`analysis/replay --input artifacts/${INPUT_ID}.json --output artifacts/${replayOutput.artifact_id}.json`);
  verificationInvocation.output_artifact_ids = [replayOutput.artifact_id];
  verificationInvocation.log_artifact_ids = [comparisonEvidence.artifact_id];
  Object.assign(object(verificationInvocation), {
    output_manifest_hash: known(sourceHash("invocation.verification.outputs")),
  });
  report.invocations.push(verificationInvocation);
  const environment = object(report.environments[0]!);
  environment.captured_invocation_ids = [HISTORICAL_INVOCATION_ID, verificationInvocation.invocation_id];
  const randomState = object(report.random_states[0]!);
  randomState.captured_invocation_ids = [HISTORICAL_INVOCATION_ID, verificationInvocation.invocation_id];

  unit.conservative_level = "R2_verified_replay";
  unit.axis_assessments.replay_verification = {
    state: "satisfied",
    rationale: "A complete verification run met every hash-bound target comparison.",
    evidence_artifact_ids: [comparisonEvidence.artifact_id],
    source_bindings: [sourceBinding()],
  };
  unit.replay_events = [{
    replay_event_id: "replay.verified",
    executor: known("Fixture verification executor"),
    execution_time: known("2026-08-22T00:00:00.000Z"),
    recipe_version: "1.0.0",
    environment_id: ENVIRONMENT_ID,
    input_artifact_ids: [INPUT_ID],
    actual_invocation_id: verificationInvocation.invocation_id,
    exit_or_completion_status: "completed",
    output_artifact_ids: [replayOutput.artifact_id],
    comparator_id: unit.comparison_specification.comparator_id,
    comparison_result: "met",
    deviations: known([]),
    source_bindings: [sourceBinding()],
    recipe_id: unit.recipe_id,
    comparison_evidence_artifact_ids: [comparisonEvidence.artifact_id],
    target_comparisons: [{
      target_id: OUTPUT_ID,
      reference_artifact_id: OUTPUT_ID,
      replay_artifact_id: replayOutput.artifact_id,
      comparison_evidence_artifact_id: comparisonEvidence.artifact_id,
      observed_value: notApplicable<number>("Canonical hash equality does not use a numeric observation."),
      result: "met",
    }],
  } as ScientificReport["reproducibility_units"][number]["replay_events"][number]];
  const recipeRecord = object(extendedUnit.recipe_record);
  recipeRecord.verification = {
    status: "completed_matching",
    verification_run_ids: [verificationInvocation.invocation_id],
    verified_at: "2026-08-22T00:01:00.000Z",
    comparison_artifact_ids: [comparisonEvidence.artifact_id],
    summary: "The verification replay met the canonical hash comparator for every target.",
  };

  const dependencies = [
    ...(extendedUnit.bundle_dependency_artifact_ids as string[]),
    replayOutput.artifact_id,
    comparisonEvidence.artifact_id,
  ];
  unit.access_assessment.artifact_ids = [...dependencies];
  unit.axis_assessments.data_and_artifact_access.evidence_artifact_ids = [...dependencies];
  extendedUnit.bundle_dependency_artifact_ids = [...dependencies];
  bindRecipeRecordHash(report);
  completeFixtureSourceBindings(report);
  return report;
}

export function explicitComputationalGapReport(): ScientificReport {
  const report = quantitativeDerivationReport();
  const gapUnit = structuredClone(scopedReproducibilityReport().reproducibility_units[0]!);
  gapUnit.reproducibility_unit_id = "repro.explicit-computational-gap";
  gapUnit.title = "Explicit gap for the historical estimate computation";
  gapUnit.unit_kind = "statistical_analysis";
  gapUnit.criticality = "critical";
  gapUnit.covered_work_unit_ids = ["work.derivation"];
  gapUnit.covered_analysis_run_ids = ["run.estimate"];
  gapUnit.covered_claim_ids = ["claim.estimate"];
  gapUnit.covered_output_ids = ["result.estimate", "artifact.estimate"];
  gapUnit.conservative_level = "not_assessed";
  gapUnit.level_reason = "Replay readiness cannot be assessed because a recipe was not retained; this gap remains release-visible.";
  Object.assign(object(gapUnit), {
    coverage_denominator_decision: {
      decision_event_id: "decision.computational-gap-denominator",
      critical_unit_membership: "included",
      critical_claim_ids: ["claim.estimate"],
      critical_output_ids: ["result.estimate", "artifact.estimate"],
      exclusions: [],
      rationale: "The primary estimate claim and output remain in the independent critical denominator despite the replay gap.",
      source_bindings: [sourceBinding(undefined, "decision_timing")],
    },
    coverage_disposition: {
      status: "explicit_gap",
      justification: "No executable historical recipe survived; the exact missing prerequisite is retained rather than asserted away.",
      source_bindings: [sourceBinding()],
    },
  });
  report.reproducibility_units = [gapUnit];
  report.decision_events.push(makeDecision(
    "decision.computational-gap-denominator",
    [gapUnit.reproducibility_unit_id, "claim.estimate", "result.estimate", "artifact.estimate"],
    {
      decision_kind: "other",
      description: "Retain the computational claim and output in the independent denominator despite the replay gap.",
    },
  ));
  completeFixtureSourceBindings(report);
  return report;
}

export const replayIds = {
  input: INPUT_ID,
  output: OUTPUT_ID,
  recipeArtifact: RECIPE_ARTIFACT_ID,
  environmentManifest: ENVIRONMENT_MANIFEST_ID,
  accessAttestation: ACCESS_ATTESTATION_ID,
  environment: ENVIRONMENT_ID,
  randomState: RANDOM_STATE_ID,
  historicalInvocation: HISTORICAL_INVOCATION_ID,
} as const;
