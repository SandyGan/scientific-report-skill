import { describe, expect, it } from "vitest";

import { known, sourceBinding } from "../fixtures/base-report.js";
import {
  decisionTimingReport,
  failedRetryReport,
  mixedExecutionScopeReport,
} from "../fixtures/execution-scenarios.js";
import { evaluationFor, findingsFor, validateSelected } from "../fixtures/validation-assertions.js";

describe("work ownership and immutable attempts", () => {
  it("keeps this-project, reanalysis, and external completion denominators separate", () => {
    const report = mixedExecutionScopeReport(false);
    const result = validateSelected(report, ["WRK002"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "WRK002").status).toBe("pass");
    expect(result.workSummary?.completedWorkUnitsByScope).toMatchObject({
      this_project: 1,
      reanalysis: 1,
      external_study: 1,
      upstream_collaborator: 0,
    });
    expect(result.workSummary?.thisProjectCompleted).toEqual({ numerator: 1, denominator: 1, state: "known" });
    expect(result.workSummary?.reanalysisCompleted).toEqual({ numerator: 1, denominator: 1, state: "known" });
    expect(result.workSummary?.externalCompleted).toEqual({ numerator: 1, denominator: 1, state: "known" });
  });

  it("raises WRK002 when a completed this-project campaign absorbs an external study unit", () => {
    const result = validateSelected(mixedExecutionScopeReport(true), ["WRK002"]);
    const findings = findingsFor(result, "WRK002");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "WRK002").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "WRK002",
      instancePointer: "/campaigns/0/work_unit_ids",
      affectedObjectIds: ["campaign.mixed", "work.external"],
    });
    expect(findings[0]!.message).toContain("externally executed work units");
    expect(result.workSummary?.thisProjectCompleted.numerator).toBe(1);
    expect(result.workSummary?.externalCompleted.numerator).toBe(1);
  });

  it("raises WRK003 when a later success has no append-only recovery edge to the failed attempt", () => {
    const result = validateSelected(failedRetryReport(false), ["WRK003"]);
    const findings = findingsFor(result, "WRK003");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "WRK003").status).toBe("fail");
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "WRK003",
          instancePointer: "/attempts/1",
          affectedObjectIds: expect.arrayContaining(["work.retry", "attempt.failed", "attempt.recovery"]),
        }),
      ]),
    );
    expect(findings.some((finding) => finding.message.includes("without a preserved retry/recovery chain"))).toBe(true);
  });

  it("[SCIENTIFIC-009 negative] treats a partially_succeeded attempt with a major failure as a retry-chain predecessor", () => {
    const report = failedRetryReport(false);
    report.attempts[0]!.attempt_outcome = "partially_succeeded";
    report.attempts[0]!.usable_output_status = "usable_with_qualification";
    report.failures[0]!.severity = "major";
    report.failures[0]!.description = "The attempt produced a partial output but failed before the required endpoint.";

    const result = validateSelected(report, ["WRK003"]);
    const findings = findingsFor(result, "WRK003");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "WRK003").status).toBe("fail");
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        instancePointer: "/attempts/1",
        affectedObjectIds: expect.arrayContaining(["attempt.failed", "attempt.recovery"]),
      }),
    ]));
    expect(findings.some((finding) => finding.message.includes("materially failed attempt"))).toBe(true);
  });

  it("[SCIENTIFIC-009 positive recovery] accepts a partial-failure successor linked by recovery and supersession", () => {
    const report = failedRetryReport(true);
    report.attempts[0]!.attempt_outcome = "partially_succeeded";
    report.failures[0]!.severity = "major";

    const result = validateSelected(report, ["WRK003"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "WRK003").status).toBe("pass");
    expect(findingsFor(result, "WRK003")).toEqual([]);
  });

  it("[SCIENTIFIC-009 positive independent] accepts an independent later success only with a typed source-bound not_a_retry relation", () => {
    const report = failedRetryReport(false);
    report.attempts[0]!.attempt_outcome = "partially_succeeded";
    report.failures[0]!.severity = "major";
    report.attempts[1]!.attempt_relations = [
      {
        relation_id: "attempt-relation.independent-run",
        prior_attempt_id: "attempt.failed",
        relationship: "not_a_retry",
        rationale: known("The later attempt used an independently planned input and was not a recovery or continuation of the partial failure."),
        source_bindings: [sourceBinding()],
      },
    ];

    const result = validateSelected(report, ["WRK003"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "WRK003").status).toBe("pass");
    expect(findingsFor(result, "WRK003")).toEqual([]);
  });

  it("preserves the failed attempt, partial result, failure event, and recovery edge after success", () => {
    const report = failedRetryReport(true);
    const result = validateSelected(report, ["WRK003"]);

    expect(evaluationFor(result, "WRK003").status).toBe("pass");
    expect(report.work_units[0]!.attempt_ids).toEqual(["attempt.failed", "attempt.recovery"]);
    expect(report.attempts[0]).toMatchObject({
      attempt_id: "attempt.failed",
      attempt_outcome: "failed",
      result_ids: ["result.partial"],
      failure_event_ids: ["failure.compute"],
      superseded_by_attempt_id: "attempt.recovery",
    });
    expect(report.failures[0]).toMatchObject({
      failure_event_id: "failure.compute",
      partial_result_ids: ["result.partial"],
      recovery_attempt_ids: ["attempt.recovery"],
    });
    expect(report.results[0]).toMatchObject({
      result_id: "result.partial",
      record_disposition: "sensitivity_only",
      interpretability_status: "qualified",
    });
  });
});

describe("decision timing", () => {
  it("raises TIM001 when a predefined decision was recorded after execution started", () => {
    const result = validateSelected(
      decisionTimingReport({
        decidedAt: "2026-08-11T00:00:00.000Z",
        trustworthyTimingSource: true,
      }),
      ["TIM001"],
    );
    const findings = findingsFor(result, "TIM001");

    expect(evaluationFor(result, "TIM001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "TIM001",
      instancePointer: "/decision_events/0/decided_at",
      affectedObjectIds: expect.arrayContaining(["decision.endpoint", "attempt.timing"]),
    });
    expect(findings[0]!.message).toContain("not earlier than the earliest known affected execution start");
  });

  it("raises TIM001 when prospective wording has no snapshot-bound timing evidence", () => {
    const result = validateSelected(
      decisionTimingReport({
        decidedAt: "2026-08-09T00:00:00.000Z",
        trustworthyTimingSource: false,
      }),
      ["TIM001"],
    );
    const findings = findingsFor(result, "TIM001");

    expect(evaluationFor(result, "TIM001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "TIM001",
      instancePointer: "/decision_events/0/source_bindings",
      affectedObjectIds: expect.arrayContaining(["decision.endpoint", "attempt.timing"]),
    });
    expect(findings[0]!.message).toContain("snapshot-bound timing source with integrity evidence");
  });

  it("accepts a predefined decision with integrity-bound evidence recorded before execution", () => {
    const result = validateSelected(
      decisionTimingReport({
        decidedAt: "2026-08-09T00:00:00.000Z",
        trustworthyTimingSource: true,
      }),
      ["TIM001"],
    );

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "TIM001").status).toBe("pass");
    expect(findingsFor(result, "TIM001")).toEqual([]);
  });
});
