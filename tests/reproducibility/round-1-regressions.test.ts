import { describe, expect, it } from "vitest";

import type { ScientificReport } from "../../src/lib/types.js";
import { summarizeReproducibility } from "../../src/lib/summaries.js";
import { known, notApplicable, unknown } from "../fixtures/base-report.js";
import { quantitativeDerivationReport } from "../fixtures/derivation-scenarios.js";
import { scopedReproducibilityReport as originalScopedReport } from "../fixtures/reproducibility-scenarios.js";
import { evaluationFor, findingsFor, validateSelected } from "../fixtures/validation-assertions.js";
import {
  completeFixtureSourceBindings,
  explicitComputationalGapReport,
  replayIds,
  replayReadyReport,
  verifiedReplayReport,
} from "./fixtures.js";

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Expected object.");
  return value as Record<string, unknown>;
}

function conservativeLevelFinding(report: ScientificReport) {
  const result = validateSelected(report, ["REP001"]);
  const match = findingsFor(result, "REP001").find((finding) => finding.instancePointer.endsWith("/conservative_level"));
  if (match === undefined) throw new Error("Expected a conservative-level finding.");
  return { result, finding: match };
}

describe("REPRO-001 resolvable replay records", () => {
  it("caps the original invented-recipe/unknown-invocation/null-capture probe at R0", () => {
    const report = replayReadyReport();
    const unit = report.reproducibility_units[1]!;
    const invocation = report.invocations[0]!;
    delete object(unit).recipe_record;
    invocation.command_line = unknown<string>("The exact historical command line was not retained.");
    invocation.working_directory = unknown<string>("The historical working directory was not retained.");
    invocation.arguments = [];
    invocation.input_artifact_ids = [];
    unit.environment_record.record_id = null;
    unit.random_state_record.record_id = null;
    Object.assign(object(invocation), { environment_id: null, random_state_id: null });
    completeFixtureSourceBindings(report);

    const { result, finding } = conservativeLevelFinding(report);

    expect(result.schemaValid).toBe(true);
    expect(result.releaseEligible).toBe(false);
    expect(finding.details).toMatchObject({
      declared_level: "R1_replay_ready",
      highest_supported_level: "R0_documented",
      failed_prerequisites: expect.arrayContaining([
        "versioned recipe content is absent or unresolved",
        `invocation ${replayIds.historicalInvocation} command line is not known`,
        `invocation ${replayIds.historicalInvocation} working directory is not known`,
        `invocation ${replayIds.historicalInvocation} has no enumerated input artifacts`,
        "bound environment record is absent or unresolved",
        "bound random-state record is absent or unresolved",
      ]),
    });
  });

  it("rejects recipe content that no longer matches its canonical record and artifact hashes", () => {
    const report = replayReadyReport();
    const recipe = object(object(report.reproducibility_units[1]!).recipe_record);
    recipe.purpose = "Tampered purpose that was not incorporated into the bound recipe digest.";

    const { finding } = conservativeLevelFinding(report);

    expect(finding.details).toMatchObject({
      highest_supported_level: "R0_documented",
      failed_prerequisites: expect.arrayContaining([
        "inline recipe record hash is absent or does not match canonical recipe content",
        `recipe artifact ${replayIds.recipeArtifact} hash does not bind the canonical inline recipe record`,
      ]),
    });
  });

  it("permits R1 only with versioned recipe content and complete invocation/environment/random-state bindings", () => {
    const result = validateSelected(replayReadyReport(), ["REP001", "REP002"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REP001").status).toBe("pass");
    expect(evaluationFor(result, "REP002").status).toBe("pass");
    expect(result.reproducibilitySummary?.criticalLevelDistribution.R1_replay_ready).toBe(1);
  });
});

describe("REPRO-002 machine-verifiable R2 comparison", () => {
  it("rejects the original bare-met replay with unknown semantics and absent replay evidence/context", () => {
    const report = verifiedReplayReport();
    const unit = report.reproducibility_units[1]!;
    const verificationInvocation = report.invocations.find((invocation) => invocation.invocation_id === "invocation.verification")!;
    const replay = unit.replay_events[0]!;
    unit.comparison_specification.comparator_type = "numeric_tolerance";
    unit.comparison_specification.equivalence_definition = unknown<string>("No numeric equivalence definition was retained.");
    unit.comparison_specification.tolerances = unknown<string>("No absolute or relative tolerance was retained.");
    unit.comparison_specification.allowed_nondeterminism = unknown<string>("Allowed nondeterminism was not recorded.");
    delete object(unit.comparison_specification).decision_rule;
    replay.input_artifact_ids = [];
    replay.environment_id = null;
    delete object(replay).comparison_evidence_artifact_ids;
    delete object(replay).target_comparisons;
    verificationInvocation.command_line = unknown<string>("The actual rerun command was not retained.");
    verificationInvocation.input_artifact_ids = [];
    unit.axis_assessments.replay_verification.evidence_artifact_ids = [];
    completeFixtureSourceBindings(report);

    const result = validateSelected(report, ["REP001", "REP003"]);
    const levelFinding = findingsFor(result, "REP001").find((finding) => finding.instancePointer.endsWith("/conservative_level"));

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REP003").status).toBe("fail");
    expect(levelFinding?.details).toMatchObject({
      highest_supported_level: "R0_documented",
      failed_prerequisites: expect.arrayContaining([
        "comparison equivalence definition is not known",
        "allowed nondeterminism is not known",
        "typed comparator decision rule is absent",
      ]),
    });
    expect(findingsFor(result, "REP003")[0]?.details).toMatchObject({
      failed_prerequisites: expect.arrayContaining([
        "no completed replay has complete context and hash-bound target-level machine-checked agreement",
      ]),
    });
    expect(findingsFor(result, "REP003")[0]?.message).toContain("R2 replay evidence is incomplete or not machine-verifiable");
  });

  it("permits R2 when every target has hash-bound evidence and the declared comparator recomputes to met", () => {
    const result = validateSelected(verifiedReplayReport(), ["REP001", "REP002", "REP003"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REP001").status).toBe("pass");
    expect(evaluationFor(result, "REP003").status).toBe("pass");
    expect(result.reproducibilitySummary?.criticalLevelDistribution.R2_verified_replay).toBe(1);
  });
});

describe("REPRO-003 declared bundle dependency reconciliation", () => {
  it("rejects an available known-hash R1 dependency omitted from the required bundle set", () => {
    const report = replayReadyReport();
    const unit = report.reproducibility_units[1]!;
    const extension = object(unit);
    extension.bundle_dependency_artifact_ids = (extension.bundle_dependency_artifact_ids as string[])
      .filter((id) => id !== replayIds.output);

    const { finding } = conservativeLevelFinding(report);

    expect(finding.details).toMatchObject({
      highest_supported_level: "R0_documented",
      failed_prerequisites: expect.arrayContaining([
        `required bundle dependency set omits: ${replayIds.output}`,
      ]),
    });
    const output = report.artifacts.find((artifact) => artifact.artifact_id === replayIds.output)!;
    expect(output.access_state).toBe("open");
    expect(output.content_hash.state).toBe("known");
  });
});

describe("REPRO-004 exact DataSlice selection", () => {
  it("rejects the original 12-of-14 table-name-only probe and caps its derivation claim at partial", () => {
    const report = quantitativeDerivationReport();
    const locator = report.data_slices[0]!.locator;
    locator.row_or_record_selector = unknown<string>("The selected rows were not retained.");
    locator.query = unknown<string>("The data query was not retained.");
    locator.filter_expressions = unknown<string[]>("The filtering expressions were not retained.");
    completeFixtureSourceBindings(report);

    const result = validateSelected(report, ["DER001", "REP001"]);
    const locatorFinding = findingsFor(result, "REP001").find((finding) => finding.instancePointer === "/data_slices/0/locator");

    expect(result.schemaValid).toBe(true);
    expect(locatorFinding).toMatchObject({
      affectedObjectIds: ["slice.primary"],
      details: {
        locator_kind: "table_rows",
        failed_prerequisites: expect.arrayContaining([
          "table_rows locator has no deterministic row/record selector, query, filters, or all-records declaration",
        ]),
      },
    });
    expect(locatorFinding?.message).toContain("can support at most partial derivation closure");
  });

  it("accepts the exact selector in a report whose key computation is retained as an explicit justified gap", () => {
    const result = validateSelected(explicitComputationalGapReport(), ["REP001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REP001").status).toBe("pass");
  });

  it("accepts an explicit all-records declaration only with zero known exclusions", () => {
    const report = explicitComputationalGapReport();
    const locator = object(report.data_slices[0]!.locator);
    report.data_slices[0]!.locator.row_or_record_selector = unknown<string>("No subset selector applies.");
    report.data_slices[0]!.locator.query = unknown<string>("No subset query applies.");
    report.data_slices[0]!.locator.filter_expressions = unknown<string[]>("No subset filters apply.");
    locator.all_records = known(true);
    report.data_slices[0]!.excluded_unit_count = known(0);
    completeFixtureSourceBindings(report);

    const result = validateSelected(report, ["REP001"]);

    expect(findingsFor(result, "REP001").filter((finding) => finding.instancePointer.includes("/data_slices/"))).toEqual([]);
  });

  const locatorCases: Array<[string, (locator: Record<string, unknown>) => void]> = [
    ["table_rows", (locator) => { locator.row_or_record_selector = known("row_id IN ('r1','r2')"); }],
    ["records", (locator) => { locator.row_or_record_selector = known("record_id IN ('r1','r2')"); }],
    ["array_slice", (locator) => { locator.row_or_record_selector = known("indices [0:12]"); }],
    ["frames", (locator) => { locator.frame_or_time_selector = known("frames 100:199 inclusive"); }],
    ["time_window", (locator) => { locator.frame_or_time_selector = known("time >= 10s AND time < 20s"); }],
    ["query", (locator) => { locator.query = known("SELECT * FROM measurements WHERE row_id IN ('r1','r2') ORDER BY row_id"); }],
    ["files", (locator) => { locator.file_selectors = known(["shard-001.parquet", "shard-002.parquet"]); }],
    ["other", (locator) => { locator.selection_semantics = known("Select records whose immutable IDs are listed in artifact.selection-manifest."); }],
  ];

  it.each(locatorCases)("enforces %s-specific deterministic selection semantics", (kind, makeExact) => {
    const report = explicitComputationalGapReport();
    const locator = object(report.data_slices[0]!.locator);
    locator.locator_kind = kind;
    locator.row_or_record_selector = unknown<string>("No row selector was retained.");
    locator.frame_or_time_selector = unknown<string>("No frame/time selector was retained.");
    locator.query = unknown<string>("No query was retained.");
    locator.filter_expressions = unknown<string[]>("No filters were retained.");
    delete locator.all_records;
    delete locator.file_selectors;
    delete locator.selection_semantics;
    completeFixtureSourceBindings(report);

    const missingResult = validateSelected(report, ["REP001"]);
    expect(findingsFor(missingResult, "REP001").some((finding) => finding.instancePointer === "/data_slices/0/locator")).toBe(true);

    makeExact(locator);
    completeFixtureSourceBindings(report);
    const exactResult = validateSelected(report, ["REP001"]);
    expect(findingsFor(exactResult, "REP001").some((finding) => finding.instancePointer === "/data_slices/0/locator")).toBe(false);
  });
});

describe("REPRO-005 independent denominators", () => {
  it("never infers the claim denominator from the same covered IDs and lists uncovered targets", () => {
    const report = originalScopedReport();
    report.reproducibility_units[1]!.covered_claim_ids = ["claim.covered"];

    const withoutIndependentDenominator = summarizeReproducibility(report.reproducibility_units);
    const withIndependentDenominator = summarizeReproducibility(report.reproducibility_units, {
      criticalClaimIds: ["claim.covered", "claim.uncovered"],
    });

    expect(withoutIndependentDenominator.criticalClaimCoverage).toEqual({
      covered: 0,
      target: 0,
      state: "unknown",
      uncoveredIds: [],
    });
    expect(withIndependentDenominator.criticalClaimCoverage).toEqual({
      covered: 1,
      target: 2,
      state: "known",
      uncoveredIds: ["claim.uncovered"],
    });
  });

  it("does not let an unreviewed critical-to-supporting relabel raise the floor", () => {
    const report = replayReadyReport();
    report.reproducibility_units[0]!.criticality = "supporting";

    const result = validateSelected(report, ["REP001"]);

    expect(findingsFor(result, "REP001").some((finding) => finding.message.includes("relabelled noncritical without an exclusion decision"))).toBe(true);
    expect(result.reproducibilitySummary).toMatchObject({
      criticalUnitCount: 2,
      conservativeCriticalLowerBound: { state: "known", value: "R0_documented" },
    });
  });

  it("changes the floor only after a source-bound denominator exclusion decision", () => {
    const report = replayReadyReport();
    const unit = report.reproducibility_units[0]!;
    unit.criticality = "supporting";
    const decision = object(unit).coverage_denominator_decision as Record<string, unknown>;
    decision.critical_unit_membership = "excluded";

    const result = validateSelected(report, ["REP001"]);

    expect(evaluationFor(result, "REP001").status).toBe("pass");
    expect(result.reproducibilitySummary).toMatchObject({
      criticalUnitCount: 1,
      conservativeCriticalLowerBound: { state: "known", value: "R1_replay_ready" },
    });
  });
});

describe("REPRO-006 actionable access and nonvacuous dependencies", () => {
  it("rejects the original unknown verified-procedure/empty-dependency probe", () => {
    const report = replayReadyReport();
    const unit = report.reproducibility_units[1]!;
    unit.access_assessment.status = "verified_procedure";
    unit.access_assessment.conditions = unknown<string>("The access procedure, license, and permission conditions were not retained.");
    unit.access_assessment.artifact_ids = [];
    unit.axis_assessments.data_and_artifact_access.evidence_artifact_ids = [];
    object(unit.access_assessment).procedure_attestation_artifact_id = null;

    const { finding } = conservativeLevelFinding(report);

    expect(finding.details).toMatchObject({
      highest_supported_level: "R0_documented",
      failed_prerequisites: expect.arrayContaining([
        "verified access procedure has neither actionable conditions nor an integrity-bound private attestation",
        "access assessment artifact set is empty",
      ]),
    });
    expect((finding.details as { failed_prerequisites: string[] }).failed_prerequisites.some((gap) => gap.startsWith("access assessment omits replay dependencies:"))).toBe(true);
  });

  it("rejects not_applicable access for a hashed R1 dependency", () => {
    const report = replayReadyReport();
    const unit = report.reproducibility_units[1]!;
    unit.access_assessment.status = "not_applicable";
    unit.access_assessment.conditions = notApplicable<string>("The author asserted that access does not apply.");

    const { finding } = conservativeLevelFinding(report);

    expect(finding.details).toMatchObject({
      failed_prerequisites: expect.arrayContaining([
        "data/artifact access is not_applicable; R1+ requires available_now or verified_procedure",
      ]),
    });
  });

  it("accepts a scoped actor, authority/terms, actionable or attested procedure, and reconciled dependency sets", () => {
    const result = validateSelected(replayReadyReport(), ["REP001"]);

    expect(evaluationFor(result, "REP001").status).toBe("pass");
  });
});

describe("REPRO-007 semantic authoring gate", () => {
  it("blocks the original computational report with six provenance record classes and zero reproducibility units", () => {
    const report = quantitativeDerivationReport();
    completeFixtureSourceBindings(report);

    const result = validateSelected(report, ["REP001"]);
    const coverageFinding = findingsFor(result, "REP001").find((finding) => finding.instancePointer === "/reproducibility_units");

    expect(report.data_slices).toHaveLength(1);
    expect(report.derivations).toHaveLength(1);
    expect(report.analysis_runs).toHaveLength(1);
    expect(report.invocations).toHaveLength(1);
    expect(report.environments).toHaveLength(1);
    expect(report.random_states).toHaveLength(1);
    expect(report.reproducibility_units).toEqual([]);
    expect(coverageFinding).toMatchObject({
      affectedObjectIds: expect.arrayContaining(["work.derivation", "run.estimate", "claim.estimate", "artifact.estimate"]),
      details: {
        uncovered_work_unit_ids: ["work.derivation"],
        uncovered_analysis_run_ids: ["run.estimate"],
        unclassified_claim_ids: ["claim.estimate"],
        unclassified_output_ids: ["artifact.estimate", "result.estimate"],
        uncovered_claim_ids: [],
        uncovered_output_ids: [],
      },
    });
    expect(result.releaseEligible).toBe(false);
  });

  it("passes the gate only after key work has a decision-bound unit or explicit source-bound gap", () => {
    const result = validateSelected(explicitComputationalGapReport(), ["REP001"]);

    expect(evaluationFor(result, "REP001").status).toBe("pass");
    expect(findingsFor(result, "REP001")).toEqual([]);
  });
});
