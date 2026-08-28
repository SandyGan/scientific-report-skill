import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { loadSchemas } from "../../src/lib/schema.js";
import { baseReport, known } from "../fixtures/base-report.js";
import { evaluationFor, findingsFor, validateSelected } from "../fixtures/validation-assertions.js";

describe("canonical scientific-report schema", () => {
  it("accepts the checked-in cross-domain report as a concrete canonical payload", () => {
    const examplePath = new URL("../../../../examples/cross-domain/scientific-report.json", import.meta.url);
    const example = JSON.parse(readFileSync(examplePath, "utf8")) as unknown;

    const result = loadSchemas().validateScientificReport(example);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("accepts explicit unknown, not_applicable, and withheld envelopes without collapsing them", () => {
    const report = baseReport();
    const structural = loadSchemas().validateScientificReport(report);
    const validated = validateSelected(report, ["COV002"]);

    expect(structural.valid).toBe(true);
    expect(validated.schemaValid).toBe(true);
    expect(evaluationFor(validated, "MIS001").status).toBe("pass");
    expect(validated.report?.scope.started_at).toMatchObject({
      state: "unknown",
      value: null,
      missing_reason: "The project start was not recorded.",
      provenance_status: "absent",
    });
    expect(validated.report?.scope.ended_at).toMatchObject({
      state: "not_applicable",
      value: null,
      missing_reason: "The bounded review is not an execution interval.",
      provenance_status: "absent",
    });
    expect(validated.report?.scope.cutoff_at).toMatchObject({
      state: "withheld",
      value: null,
      missing_reason: "The exact internal cutoff is protected in this projection.",
      provenance_status: "partial",
    });
  });

  it.each([
    {
      name: "unknown field exposes a guessed value",
      pointer: "/scope/started_at/value",
      mutate: (report: Record<string, unknown>) => {
        const scope = report.scope as Record<string, unknown>;
        const field = scope.started_at as Record<string, unknown>;
        field.value = "2026-01-01T00:00:00.000Z";
      },
    },
    {
      name: "not_applicable field claims complete provenance",
      pointer: "/scope/ended_at/provenance_status",
      mutate: (report: Record<string, unknown>) => {
        const scope = report.scope as Record<string, unknown>;
        const field = scope.ended_at as Record<string, unknown>;
        field.provenance_status = "complete";
      },
    },
    {
      name: "withheld field leaks the protected value",
      pointer: "/scope/cutoff_at/value",
      mutate: (report: Record<string, unknown>) => {
        const scope = report.scope as Record<string, unknown>;
        const field = scope.cutoff_at as Record<string, unknown>;
        field.value = "2026-08-24T00:00:00.000Z";
      },
    },
    {
      name: "withheld field omits its disclosure decision",
      pointer: "/scope/cutoff_at",
      mutate: (report: Record<string, unknown>) => {
        const scope = report.scope as Record<string, unknown>;
        const field = scope.cutoff_at as Record<string, unknown>;
        delete field.disclosure_decision_id;
      },
    },
    {
      name: "withheld field uses an unsupported reason code",
      pointer: "/scope/cutoff_at/withholding_reason_code",
      mutate: (report: Record<string, unknown>) => {
        const scope = report.scope as Record<string, unknown>;
        const field = scope.cutoff_at as Record<string, unknown>;
        field.withholding_reason_code = "redacted";
      },
    },
    {
      name: "known field has neither source nor derivation provenance",
      pointer: "/source_coverage/cutoff",
      mutate: (report: Record<string, unknown>) => {
        const sourceCoverage = report.source_coverage as Record<string, unknown>;
        const field = sourceCoverage.cutoff as Record<string, unknown>;
        field.state = "known";
        field.value = "2026-08-24T00:00:00.000Z";
        field.source_bindings = [];
        field.derivation_bindings = [];
        field.missing_reason = null;
        field.provenance_status = "complete";
      },
    },
    {
      name: "missing field omits its reason",
      pointer: "/scope/started_at/missing_reason",
      mutate: (report: Record<string, unknown>) => {
        const scope = report.scope as Record<string, unknown>;
        const field = scope.started_at as Record<string, unknown>;
        field.missing_reason = "";
      },
    },
  ])("rejects $name", ({ mutate, pointer }) => {
    const malformed = structuredClone(baseReport()) as unknown as Record<string, unknown>;
    mutate(malformed);

    const result = loadSchemas().validateScientificReport(malformed);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.instancePointer === pointer)).toBe(true);
  });

  it("uses MIS001 to reject absent provenance for a non-public withheld field", () => {
    const report = baseReport();
    report.scope.cutoff_at.provenance_status = "absent";

    const result = validateSelected(report, ["COV002"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "MIS001").status).toBe("fail");
    expect(findingsFor(result, "MIS001")).toEqual([
      expect.objectContaining({
        ruleId: "MIS001",
        instancePointer: "/scope/cutoff_at",
        message: expect.stringContaining("Non-public withheld field"),
      }),
    ]);
  });

  it("accepts an absent, binding-free withheld envelope in a public projection", () => {
    const report = baseReport();
    report.payload_role = "public_projection";
    report.disclosure_state.level = "public";
    report.disclosure_state.projection_status = "projected";
    report.disclosure_state.projection_id = "projection.public-fixture";
    report.scope.cutoff_at.provenance_status = "absent";

    const result = validateSelected(report, ["COV002"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "MIS001").status).toBe("pass");
    expect(report.scope.cutoff_at).toMatchObject({
      state: "withheld",
      value: null,
      source_bindings: [],
      derivation_bindings: [],
      provenance_status: "absent",
    });
  });

  it("uses MIS001 to reject a schema-shaped sentinel instead of converting it to unknown", () => {
    const report = baseReport();
    report.section_coverage[0]!.omission_or_gap_reasons = known(["N/A"]);

    const result = validateSelected(report, ["COV002"]);
    const findings = findingsFor(result, "MIS001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "MIS001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "MIS001",
      instancePointer: "/section_coverage/0/omission_or_gap_reasons",
    });
    expect(findings[0]!.message).toContain("forbidden sentinel string");
    expect(report.section_coverage[0]!.omission_or_gap_reasons.state).toBe("known");
  });
});
