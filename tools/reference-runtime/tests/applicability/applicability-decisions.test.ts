import { describe, expect, it } from "vitest";

import { loadSchemas } from "../../src/lib/schema.js";
import { baseReport, cloneReport } from "../fixtures/base-report.js";
import { evaluationFor, findingsFor, validateSelected } from "../fixtures/validation-assertions.js";

describe("traceable applicability decisions", () => {
  it("accepts field, section, and module states only when their decisions resolve and match", () => {
    const report = baseReport();

    const result = validateSelected(report, ["APP001", "APP002"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REF001").status).toBe("pass");
    expect(evaluationFor(result, "APP001").status).toBe("pass");
    expect(evaluationFor(result, "APP002").status).toBe("pass");
  });

  it("rejects a not-applicable field that points at an unrelated valid decision", () => {
    const report = cloneReport(baseReport());
    report.scope.ended_at.applicability_decision_id = "applicability.core.always";

    const result = validateSelected(report, ["APP001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REF001").status).toBe("pass");
    expect(evaluationFor(result, "APP001").status).toBe("fail");
    expect(findingsFor(result, "APP001")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePointer: "/scope/ended_at",
          message: expect.stringContaining("does not traceably establish not_applicable"),
        }),
      ]),
    );
  });

  it("structurally rejects a not-applicable envelope with no decision identity", () => {
    const report = structuredClone(baseReport()) as unknown as Record<string, unknown>;
    const scope = report.scope as Record<string, unknown>;
    const endedAt = scope.ended_at as Record<string, unknown>;
    delete endedAt.applicability_decision_id;

    const result = loadSchemas().validateScientificReport(report);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePointer: "/scope/ended_at",
          keyword: "required",
        }),
      ]),
    );
  });

  it("keeps missing context unknown instead of accepting it as non-applicability", () => {
    const report = cloneReport(baseReport());
    report.scope.ended_at.missing_reason = "Required context is missing, so applicability is unknown.";

    const result = validateSelected(report, ["APP002"]);

    expect(evaluationFor(result, "APP002").status).toBe("fail");
    expect(findingsFor(result, "APP002")[0]?.instancePointer).toBe("/scope/ended_at");
  });
});
