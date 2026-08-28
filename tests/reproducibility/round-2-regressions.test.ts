import { describe, expect, it } from "vitest";

import type { ScientificReport } from "../../src/lib/types.js";
import { validateReport } from "../../src/validator/index.js";
import { known, notApplicable, sourceBinding, sourceHash } from "../fixtures/base-report.js";
import { makeArtifact } from "../fixtures/record-builders.js";
import {
  completeFixtureSourceBindings,
  replayIds,
  verifiedReplayReport,
} from "./fixtures.js";

const NOW = "2026-08-26T00:00:00.000Z";

function declareR3Axes(unit: ScientificReport["reproducibility_units"][number], evidenceArtifactIds: string[]): void {
  unit.conservative_level = "R3_independent_reproduction";
  unit.level_reason = "An independently executed, target-level comparison is retained.";
  unit.axis_assessments.independent_computational_reproduction = {
    state: "satisfied",
    rationale: "The independent computational execution and comparison evidence are bound below.",
    evidence_artifact_ids: evidenceArtifactIds,
    source_bindings: [sourceBinding()],
  };
  unit.axis_assessments.independent_experimental_replication = {
    state: "not_applicable",
    rationale: "This unit is computational.",
    evidence_artifact_ids: [],
    source_bindings: [sourceBinding()],
  };
  unit.axis_assessments.claim_and_output_coverage = {
    state: "satisfied",
    rationale: "Every independently designated critical output target is compared.",
    evidence_artifact_ids: evidenceArtifactIds,
    source_bindings: [sourceBinding()],
  };
}

describe("round-2 independent reproduction regressions", () => {
  it("[R3-UNTRACEABLE-INDEPENDENT-EVENT] caps a label-only independent event at R2 and raises REP004", () => {
    const report = verifiedReplayReport();
    const unit = report.reproducibility_units[1]!;
    const replayComparisonEvidence = unit.replay_events[0]!.comparison_evidence_artifact_ids!;
    declareR3Axes(unit, replayComparisonEvidence);
    unit.independent_reproduction_events = [{
      reproduction_event_id: "independent.label-only",
      reproduction_kind: "computational",
      independence_assessment: "independent",
      shared_dependency_ids: [],
      comparison_result: "met",
      comparator_id: unit.comparison_specification.comparator_id,
      output_artifact_ids: [replayIds.output],
      source_bindings: [sourceBinding()],
    }];
    completeFixtureSourceBindings(report);

    const result = validateReport(report, {
      now: NOW,
      selectedRuleIds: ["REP001", "REP004", "REP005", "ATT001"],
    });

    expect(result.schemaValid).toBe(true);
    expect(result.evaluations.find((evaluation) => evaluation.rule.id === "REP004")?.status).toBe("fail");
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: "REP004",
        affectedObjectIds: expect.arrayContaining(["repro.replayable", "independent.label-only"]),
      }),
    ]));
    const rep004 = result.findings.find((finding) => finding.ruleId === "REP004");
    expect(rep004?.message).toContain("independent actor");
    expect(rep004?.message).toContain("execution record identity");
    expect(rep004?.message).toContain("target");
    expect(result.reproducibilitySummary?.allLevelDistribution.R3_independent_reproduction).toBe(0);
    expect(result.reproducibilitySummary?.allLevelDistribution.R2_verified_replay).toBe(1);
    expect(result.releaseEligible).toBe(false);
  });

  it("[R3-UNTRACEABLE-INDEPENDENT-EVENT positive] accepts R3 only with an independent execution, boundaries, random-state decision, outputs, failures, and target evidence", () => {
    const report = verifiedReplayReport();
    const unit = report.reproducibility_units[1]!;
    const reference = report.artifacts.find((artifact) => artifact.artifact_id === replayIds.output)!;
    const independentOutput = makeArtifact("artifact.independent-output", "result_output", {
      content_hash: structuredClone(reference.content_hash),
    });
    const independentComparison = makeArtifact("artifact.independent-comparison", "log");
    report.artifacts.push(independentOutput, independentComparison);

    const replayInvocation = report.invocations.find((invocation) => invocation.invocation_id === "invocation.verification")!;
    const independentInvocation = structuredClone(replayInvocation);
    independentInvocation.invocation_id = "invocation.independent";
    independentInvocation.record_role = "external_record";
    independentInvocation.started_at = known("2026-08-25T01:00:00.000Z");
    independentInvocation.ended_at = known("2026-08-25T01:01:00.000Z");
    independentInvocation.output_artifact_ids = [independentOutput.artifact_id];
    independentInvocation.log_artifact_ids = [independentComparison.artifact_id];
    independentInvocation.command_line = known(`analysis/replay --input artifacts/${replayIds.input}.json --output artifacts/${independentOutput.artifact_id}.json`);
    independentInvocation.output_manifest_hash = known(sourceHash("invocation.independent.outputs"));
    report.invocations.push(independentInvocation);

    const environment = report.environments.find((candidate) => candidate.environment_id === replayIds.environment)!;
    environment.captured_invocation_ids = [
      ...(environment.captured_invocation_ids ?? []),
      independentInvocation.invocation_id,
    ];
    const randomState = report.random_states.find((candidate) => candidate.random_state_id === replayIds.randomState)!;
    randomState.captured_invocation_ids = [
      ...(randomState.captured_invocation_ids ?? []),
      independentInvocation.invocation_id,
    ];

    declareR3Axes(unit, [independentOutput.artifact_id, independentComparison.artifact_id]);
    unit.independent_reproduction_events = [{
      reproduction_event_id: "independent.complete",
      reproduction_kind: "computational",
      independence_assessment: "independent",
      shared_dependency_ids: [replayIds.input],
      independent_actor: known("Independent fixture reproduction team"),
      execution_time: known("2026-08-25T01:01:00.000Z"),
      execution_record_id: independentInvocation.invocation_id,
      input_artifact_ids: [replayIds.input],
      input_material_ids: [],
      environment_id: replayIds.environment,
      implementation_boundary: known("A separately maintained implementation executed by an actor outside the historical and replay runs."),
      random_state_id: replayIds.randomState,
      random_state_applicability: "not_applicable",
      random_state_justification: known("The independent execution is deterministic and invokes no random generator."),
      comparison_result: "met",
      comparator_id: unit.comparison_specification.comparator_id,
      output_artifact_ids: [independentOutput.artifact_id],
      output_result_ids: [],
      deviations: known([]),
      failure_event_ids: [],
      failure_assessment: known("No execution failure occurred; the completed invocation and comparison log were retained."),
      comparison_evidence_artifact_ids: [independentComparison.artifact_id],
      target_comparisons: [{
        target_id: replayIds.output,
        reference_artifact_id: replayIds.output,
        replay_artifact_id: independentOutput.artifact_id,
        comparison_evidence_artifact_id: independentComparison.artifact_id,
        observed_value: notApplicable<number>("Canonical hash equality has no numeric observation."),
        result: "met",
      }],
      source_bindings: [sourceBinding()],
    }];
    completeFixtureSourceBindings(report);

    const result = validateReport(report, {
      now: NOW,
      selectedRuleIds: ["REP001", "REP003", "REP004", "REP005", "ATT001"],
    });

    expect(result.schemaValid).toBe(true);
    expect(result.evaluations.filter((evaluation) => evaluation.rule.id.startsWith("REP"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: expect.objectContaining({ id: "REP001" }), status: "pass" }),
        expect.objectContaining({ rule: expect.objectContaining({ id: "REP003" }), status: "pass" }),
        expect.objectContaining({ rule: expect.objectContaining({ id: "REP004" }), status: "pass" }),
        expect.objectContaining({ rule: expect.objectContaining({ id: "REP005" }), status: "pass" }),
      ]),
    );
    expect(result.reproducibilitySummary?.allLevelDistribution.R3_independent_reproduction).toBe(1);
    expect(result.findings.some((finding) => finding.ruleId === "REP004")).toBe(false);
  });
});
