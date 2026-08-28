import { describe, expect, it } from "vitest";

import type { AccessAssessment, AxisAssessment, ScientificReport } from "../../src/lib/types.js";
import { unknown } from "../fixtures/base-report.js";
import { evaluationFor, findingsFor, validateSelected } from "../fixtures/validation-assertions.js";
import { replayReadyReport } from "./fixtures.js";

function scopedReproducibilityReport(options: {
  replayableEnvironmentState?: AxisAssessment["state"];
  replayableAccessStatus?: AccessAssessment["status"];
} = {}): ScientificReport {
  const report = replayReadyReport();
  const unit = report.reproducibility_units[1]!;
  if (options.replayableEnvironmentState !== undefined) {
    unit.environment_record.assessment.state = options.replayableEnvironmentState;
    unit.axis_assessments.environment_capture.state = options.replayableEnvironmentState;
  }
  if (options.replayableAccessStatus !== undefined) {
    unit.access_assessment.status = options.replayableAccessStatus;
    unit.access_assessment.conditions = unknown<string>("Artifact access was not established for this unit.");
    unit.axis_assessments.data_and_artifact_access.state = options.replayableAccessStatus === "unknown" ? "unknown" : "unsatisfied";
  }
  return report;
}

describe("scoped reproducibility units", () => {
  it("assesses each unit independently and reports the conservative critical lower bound", () => {
    const report = scopedReproducibilityReport();
    const result = validateSelected(report, ["REP001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REP001").status).toBe("pass");
    expect(findingsFor(result, "REP001")).toEqual([]);
    expect(result.reproducibilitySummary).toMatchObject({
      levelBasis: "validator_supported",
      criticalUnitCount: 2,
      totalUnitCount: 2,
      conservativeCriticalLowerBound: {
        state: "known",
        value: "R0_documented",
      },
      criticalOutputCoverage: {
        covered: 1,
        target: 1,
        state: "known",
      },
    });
    expect(result.reproducibilitySummary?.criticalLevelDistribution).toMatchObject({
      not_assessed: 0,
      R0_documented: 1,
      R1_replay_ready: 1,
      R2_verified_replay: 0,
      R3_independent_reproduction: 0,
    });
    expect(report.reproducibility_units[0]!.conservative_level).toBe("R0_documented");
    expect(report.reproducibility_units[1]!.conservative_level).toBe("R1_replay_ready");
    expect(report.payload_role).toBe("canonical_authoritative");
    expect(report.disclosure_state.level).toBe("internal");
    expect(report.reproducibility_units[1]!.access_assessment).toMatchObject({
      status: "verified_procedure",
      conditions: {
        state: "withheld",
        value: null,
        provenance_status: "partial",
      },
    });
  });

  it("raises REP001 only for the R1 unit whose own environment axis is partial", () => {
    const result = validateSelected(
      scopedReproducibilityReport({ replayableEnvironmentState: "partial" }),
      ["REP001"],
    );
    const findings = findingsFor(result, "REP001");

    expect(evaluationFor(result, "REP001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "REP001",
      instancePointer: "/reproducibility_units/1/conservative_level",
      affectedObjectIds: expect.arrayContaining(["repro.replayable", "artifact.replayable-output"]),
      details: {
        declared_level: "R1_replay_ready",
        highest_supported_level: "R0_documented",
        failed_prerequisites: ["environment capture is not satisfied"],
      },
    });
    expect(findings[0]!.affectedObjectIds).not.toContain("repro.documented");
    expect(findings[0]!.message).toContain("Declared R1_replay_ready exceeds supported R0_documented");
    expect(result.reproducibilitySummary?.criticalLevelDistribution.R0_documented).toBe(2);
  });

  it("preserves unknown access and conservatively downgrades only that unit", () => {
    const report = scopedReproducibilityReport({ replayableAccessStatus: "unknown" });
    const result = validateSelected(report, ["REP001"]);

    expect(report.reproducibility_units[1]!.access_assessment).toMatchObject({
      status: "unknown",
      conditions: {
        state: "unknown",
        value: null,
      },
    });
    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REP001").status).toBe("fail");
    const findings = findingsFor(result, "REP001");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      instancePointer: "/reproducibility_units/1/conservative_level",
      details: {
        declared_level: "R1_replay_ready",
        highest_supported_level: "R0_documented",
        failed_prerequisites: expect.arrayContaining([
          "data/artifact access is unknown; R1+ requires available_now or verified_procedure",
          "data/artifact access axis is unknown",
        ]),
      },
    });
    expect(result.reproducibilitySummary?.criticalLevelDistribution.R0_documented).toBe(2);
  });
});
