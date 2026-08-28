import { describe, expect, it } from "vitest";

import { sha256 } from "../../src/lib/hash.js";
import type { ScientificReport } from "../../src/lib/types.js";
import { baseReport, known, sourceBinding, sourceHash } from "../fixtures/base-report.js";
import { quantitativeDerivationReport } from "../fixtures/derivation-scenarios.js";
import { pooledBiologicalNReport } from "../fixtures/execution-scenarios.js";
import { makeClaim, makeEvidence, makeEvidenceEdge } from "../fixtures/record-builders.js";
import { evaluationFor, findingsFor, validateSelected as validateSelectedRaw } from "../fixtures/validation-assertions.js";

type UnknownRecord = Record<string, unknown>;

function upgradeFixtureSourceBindings(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => upgradeFixtureSourceBindings(item, seen));
    return;
  }
  const candidate = value as UnknownRecord;
  const locator = candidate.locator as UnknownRecord | undefined;
  if (typeof candidate.source_item_id === "string" && locator !== undefined && typeof candidate.binding_role === "string") {
    const hash = typeof candidate.content_hash === "string" ? candidate.content_hash : sourceHash(candidate.source_item_id);
    candidate.source_snapshot_id ??= "snapshot.base";
    candidate.snapshot_registry_hash ??= sha256("fixture source registry");
    candidate.content_hash ??= hash;
    candidate.excerpt_hash ??= sha256(`fixture excerpt ${candidate.source_item_id} ${String(locator.value)}`);
    candidate.chunk_ids ??= [`chunk.${candidate.source_item_id}`];
    candidate.parser_identity ??= {
      parser_name: "fixture-parser",
      parser_version: "1.0.0",
      configuration_hash: sha256("fixture parser configuration"),
      parser_result_id: `parser-result.${candidate.source_item_id}`,
    };
    candidate.binding_scope ??= locator.locator_type === "whole_source" ? "whole_source" : "content_excerpt";
  }
  Object.values(candidate).forEach((item) => upgradeFixtureSourceBindings(item, seen));
}

function validateSelected(report: ScientificReport, selectedRuleIds: string[]) {
  upgradeFixtureSourceBindings(report);
  return validateSelectedRaw(report, selectedRuleIds);
}

function externalQuantitativeClaimReport(exactLocator: boolean): ScientificReport {
  const report = baseReport();
  const binding = sourceBinding();
  binding.locator = exactLocator
    ? { locator_type: "table_cell", value: "Table 2, row endpoint-A, column estimate" }
    : { locator_type: "whole_source", value: "entire fixture source" };
  binding.binding_scope = exactLocator ? "content_excerpt" : "whole_source";
  binding.excerpt_hash = sha256(`fixture excerpt ${binding.source_item_id} ${binding.locator.value}`);
  const evidence = makeEvidence("evidence.external-quantity", {
    evidence_kind: "external_evidence",
    summary: "An externally reported quantitative value.",
    result_ids: [],
    derivation_ids: [],
    source_item_ids: [binding.source_item_id],
    source_bindings: [binding],
  });
  const claim = makeClaim("claim.external-quantity", {
    claim_type: "quantitative",
    proposition: "The externally reported endpoint estimate is 12.4 units.",
    evidence_edge_ids: ["edge.external-quantity"],
    argument_step_ids: [],
  });
  report.evidence_items = [evidence];
  report.evidence_edges = [makeEvidenceEdge(
    "edge.external-quantity",
    evidence.evidence_item_id,
    claim.claim_id,
  )];
  report.claims = [claim];
  return report;
}

function lineageAwarePoolReport(sharedDonor: boolean, technicalN = 2): ScientificReport {
  const report = baseReport();
  report.module_manifest.push({
    module_id: "wet_lab",
    protocol_version: "1.0.0",
    status: "enabled",
    applicability_decision_id: "applicability.core.always",
    detected_triggers: ["wet-lab specimen lineage fixture"],
    section_ids: ["core.empty-ledger"],
  });
  const specimen = (
    specimenId: string,
    kind: string,
    parents: string[],
    donor: string,
    poolMembers: string[] = [],
  ) => ({
    specimen_id: specimenId,
    kind,
    parent_specimen_ids: parents,
    source_bindings: [sourceBinding()],
    donor: known(donor),
    pool_members: known(poolMembers),
  });
  const secondDonor = sharedDonor ? "donor.A" : "donor.B";
  (report.extensions as unknown as UnknownRecord).domain_payloads = [
    {
      domain: "wet_lab",
      applies_to: { work_unit_ids: ["work.pools"], attempt_ids: [], result_ids: [], entity_ids: [] },
      specimen_records: [
        specimen("specimen.donor-A", "donor", [], "donor.A"),
        specimen("specimen.aliquot-A", "aliquot", ["specimen.donor-A"], "donor.A"),
        specimen("specimen.pool-A", "pool", ["specimen.aliquot-A"], "donor.A", ["specimen.aliquot-A"]),
        ...(sharedDonor
          ? [
              specimen("specimen.aliquot-B", "aliquot", ["specimen.donor-A"], "donor.A"),
              specimen("specimen.pool-B", "pool", ["specimen.aliquot-B"], "donor.A", ["specimen.aliquot-B"]),
            ]
          : [
              specimen("specimen.donor-B", "donor", [], secondDonor),
              specimen("specimen.aliquot-B", "aliquot", ["specimen.donor-B"], secondDonor),
              specimen("specimen.pool-B", "pool", ["specimen.aliquot-B"], secondDonor, ["specimen.aliquot-B"]),
            ]),
      ],
      replicate_designs: [
        {
          design_id: "design.pools",
          work_unit_id: "work.pools",
          specimen_ids: ["specimen.pool-A", "specimen.pool-B"],
          source_bindings: [sourceBinding()],
          biological_unit: known("Independent donor ancestor"),
          technical_unit: known("Pooled measurement"),
          analysis_unit: known("One registered pool"),
          biological_n: known(2),
          technical_n: known(technicalN),
          pool_counting_policy: known("Pools count independently only when their registered donor lineages are distinct and nonoverlapping."),
        },
      ],
    },
  ];
  return report;
}

function directSameDonorReport(): ScientificReport {
  const report = lineageAwarePoolReport(true);
  const payloads = (report.extensions as unknown as UnknownRecord).domain_payloads as UnknownRecord[];
  const payload = payloads[0]!;
  const specimens = payload.specimen_records as UnknownRecord[];
  const directSamples = ["specimen.pool-A", "specimen.pool-B"].map((id, index) => {
    const record = structuredClone(specimens.find((candidate) => candidate.specimen_id === id)!);
    record.specimen_id = `specimen.direct-${index + 1}`;
    record.kind = "primary_sample";
    record.parent_specimen_ids = [];
    record.pool_members = known([]);
    record.donor = known("donor.A");
    return record;
  });
  payload.specimen_records = directSamples;
  const design = (payload.replicate_designs as UnknownRecord[])[0]!;
  design.specimen_ids = directSamples.map((record) => record.specimen_id);
  design.technical_unit = known("Primary sample measurement");
  design.analysis_unit = known("Primary sample");
  design.pool_counting_policy = known("Distinct sample labels are counted separately.");
  return report;
}

function scopedMultiWorkWetLabReport(declaredN: number): ScientificReport {
  const report = baseReport();
  report.module_manifest.push({
    module_id: "wet_lab",
    protocol_version: "1.0.0",
    status: "enabled",
    applicability_decision_id: "applicability.core.always",
    detected_triggers: ["two explicitly scoped wet-lab replicate designs"],
    section_ids: ["core.empty-ledger"],
  });
  const specimen = (specimenId: string, donor: string, workUnitId: string) => ({
    specimen_id: specimenId,
    kind: "primary_sample",
    parent_specimen_ids: [],
    source_bindings: [sourceBinding()],
    donor: known(donor),
    pool_members: known([]),
    collection_context: known(`Collected exclusively for ${workUnitId}.`),
  });
  (report.extensions as unknown as UnknownRecord).domain_payloads = [
    {
      domain: "wet_lab",
      applies_to: { work_unit_ids: ["work.a", "work.b"], attempt_ids: [], result_ids: [], entity_ids: [] },
      specimen_records: [
        specimen("specimen.a1", "donor.a1", "work.a"),
        specimen("specimen.a2", "donor.a2", "work.a"),
        specimen("specimen.b1", "donor.b1", "work.b"),
        specimen("specimen.b2", "donor.b2", "work.b"),
      ],
      replicate_designs: [
        {
          design_id: "design.a",
          work_unit_id: "work.a",
          specimen_ids: ["specimen.a1", "specimen.a2"],
          source_bindings: [sourceBinding()],
          biological_unit: known("Independent donor"),
          technical_unit: known("One assayed primary specimen"),
          analysis_unit: known("One assayed primary specimen"),
          biological_n: known(declaredN),
          technical_n: known(declaredN),
          pool_counting_policy: known("Registered donor lineages are independent, distinct, and nonoverlapping."),
        },
        {
          design_id: "design.b",
          work_unit_id: "work.b",
          specimen_ids: ["specimen.b1", "specimen.b2"],
          source_bindings: [sourceBinding()],
          biological_unit: known("Independent donor"),
          technical_unit: known("One assayed primary specimen"),
          analysis_unit: known("One assayed primary specimen"),
          biological_n: known(declaredN),
          technical_n: known(declaredN),
          pool_counting_policy: known("Registered donor lineages are independent, distinct, and nonoverlapping."),
        },
      ],
    },
  ];
  return report;
}

describe("biological replicate accounting", () => {
  it("raises MAT001 when two technical measurements of one pool are declared as biological N=2", () => {
    const result = validateSelected(pooledBiologicalNReport(2), ["MAT001"]);
    const findings = findingsFor(result, "MAT001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "MAT001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "MAT001",
      instancePointer: "/analysis_populations/0/replicate_structure/biological_unit_count",
      affectedObjectIds: ["population.pool-A"],
      details: {
        included_members: 2,
        unique_group_keys: 1,
      },
    });
    expect(findings[0]!.message).toContain("Biological-unit count 2 does not reconcile with 1 unique included group keys");
  });

  it("counts one pooled group as biological N=1 while retaining both technical members", () => {
    const report = pooledBiologicalNReport(1);
    const result = validateSelected(report, ["MAT001"]);
    const population = report.analysis_populations[0]!;

    expect(evaluationFor(result, "MAT001").status).toBe("pass");
    expect(population.members).toHaveLength(2);
    expect(population.members.map((member) => member.group_key)).toEqual([
      expect.objectContaining({ state: "known", value: "biological-unit.pool-A" }),
      expect.objectContaining({ state: "known", value: "biological-unit.pool-A" }),
    ]);
    expect(population.replicate_structure.biological_unit_count).toMatchObject({ state: "known", value: 1 });
    expect(population.replicate_structure.technical_unit_count).toMatchObject({ state: "known", value: 2 });
  });
});

describe("wet-lab specimen-lineage biological N", () => {
  it("[SCI-007] raises WET001 when two pools from one donor are declared as biological N=2", () => {
    const report = lineageAwarePoolReport(true);

    const result = validateSelected(report, ["WET001"]);
    const findings = findingsFor(result, "WET001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "WET001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      instancePointer: "/extensions/domain_payloads/0/replicate_designs/0/biological_n",
      affectedObjectIds: expect.arrayContaining([
        "design.pools",
        "specimen.donor-A",
        "specimen.pool-A",
        "specimen.pool-B",
      ]),
      details: expect.objectContaining({
        independent_ancestor_groups: 1,
        lineage_complete: true,
        pool_count: 2,
      }),
    });
    expect((findings[0]!.details as { gaps: string[] }).gaps).toContain(
      "biological N=2 does not equal 1 independent ancestor group(s) in the explicit design denominator",
    );
  });

  it("[acceptance-direct-donor] rejects biological N=2 for two direct samples from one donor", () => {
    const result = validateSelected(directSameDonorReport(), ["WET001"]);
    const findings = findingsFor(result, "WET001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "WET001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      instancePointer: "/extensions/domain_payloads/0/replicate_designs/0/biological_n",
      details: expect.objectContaining({
        independent_ancestor_groups: 1,
        pool_count: 0,
        specimen_count: 2,
      }),
    });
    expect((findings[0]!.details as { gaps: string[] }).gaps).toContain(
      "biological N=2 does not equal 1 independent ancestor group(s) in the explicit design denominator",
    );
  });

  it("accepts biological N=2 only when both pools trace to distinct source-bound donor lineages", () => {
    const report = lineageAwarePoolReport(false);

    const result = validateSelected(report, ["WET001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "WET001").status).toBe("pass");
    expect(findingsFor(result, "WET001")).toEqual([]);
  });

  it("keeps technical N and analysis units separate from biological ancestor groups", () => {
    const report = lineageAwarePoolReport(false, 1);

    const result = validateSelected(report, ["WET001"]);
    const gaps = (findingsFor(result, "WET001")[0]!.details as { gaps: string[] }).gaps;

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "WET001").status).toBe("fail");
    expect(gaps).toEqual(expect.arrayContaining([
      "technical N=1 is smaller than biological N=2",
      "technical N=1 does not equal 2 explicitly registered analysis specimens",
    ]));
  });
  it("[SCIENTIFIC-006 negative] rejects N=4 when each of two work-unit designs explicitly owns only two specimens", () => {
    const result = validateSelected(scopedMultiWorkWetLabReport(4), ["WET001"]);
    const findings = findingsFor(result, "WET001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "WET001").status).toBe("fail");
    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => (finding.details as { specimen_count: number }).specimen_count)).toEqual([2, 2]);
    for (const finding of findings) {
      expect((finding.details as { gaps: string[] }).gaps).toEqual(expect.arrayContaining([
        "biological N=4 does not equal 2 independent ancestor group(s) in the explicit design denominator",
        "technical N=4 does not equal 2 explicitly registered analysis specimens",
      ]));
    }
  });

  it("[SCIENTIFIC-006 positive] accepts explicit two-specimen denominators scoped independently to both work units", () => {
    const report = scopedMultiWorkWetLabReport(2);
    const result = validateSelected(report, ["WET001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "WET001").status).toBe("pass");
    expect(findingsFor(result, "WET001")).toEqual([]);
    const payload = ((report.extensions as unknown as UnknownRecord).domain_payloads as UnknownRecord[])[0]!;
    expect((payload.replicate_designs as UnknownRecord[]).map((design) => design.specimen_ids)).toEqual([
      ["specimen.a1", "specimen.a2"],
      ["specimen.b1", "specimen.b2"],
    ]);
  });
});

describe("quantitative derivation closure", () => {
  it("accepts a closed DataSlice to derivation, run, output, evidence, and claim path", () => {
    const report = quantitativeDerivationReport();
    const result = validateSelected(report, ["DER001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "DER001").status).toBe("pass");
    expect(findingsFor(result, "DER001")).toEqual([]);
    expect(report.results[0]).toMatchObject({
      result_id: "result.estimate",
      derivation_closure_status: "complete",
      data_slice_ids: ["slice.primary"],
      derivation_ids: ["derivation.estimate"],
      analysis_run_ids: ["run.estimate"],
      output_artifact_ids: ["artifact.estimate"],
    });
    expect(report.evidence_items[0]!.result_ids).toEqual(["result.estimate"]);
    expect(report.evidence_edges[0]).toMatchObject({
      evidence_item_id: "evidence.estimate",
      claim_id: "claim.estimate",
      relationship: "supports",
    });
  });

  it("raises DER001 when the selected DataSlice has no integrity hash even though the graph is connected", () => {
    const result = validateSelected(
      quantitativeDerivationReport({ unknownSliceHash: true }),
      ["DER001"],
    );
    const findings = findingsFor(result, "DER001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "DER001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "DER001",
      instancePointer: "/results/0/derivation_closure_status",
      affectedObjectIds: expect.arrayContaining(["result.estimate", "slice.primary"]),
    });
    expect((findings[0]!.details as { gaps: string[] }).gaps).toContain(
      "DataSlice slice.primary has no known slice hash",
    );
  });

  it("raises DER001 when the derivation does not consume the result-linked DataSlice", () => {
    const result = validateSelected(
      quantitativeDerivationReport({ disconnectSliceFromDerivation: true }),
      ["DER001"],
    );
    const findings = findingsFor(result, "DER001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "DER001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "DER001",
      instancePointer: "/results/0/derivation_closure_status",
      affectedObjectIds: expect.arrayContaining(["result.estimate", "derivation.estimate"]),
    });
    expect((findings[0]!.details as { gaps: string[] }).gaps).toContain(
      "linked derivation graph does not consume any result-linked DataSlice",
    );
  });

  it("raises DER001 when a reportable estimate has an unknown slice hash and its derivation consumes no linked slice", () => {
    const result = validateSelected(
      quantitativeDerivationReport({
        unknownSliceHash: true,
        disconnectSliceFromDerivation: true,
      }),
      ["DER001"],
    );
    const findings = findingsFor(result, "DER001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "DER001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "DER001",
      instancePointer: "/results/0/derivation_closure_status",
      affectedObjectIds: expect.arrayContaining([
        "result.estimate",
        "slice.primary",
        "derivation.estimate",
        "run.estimate",
        "artifact.estimate",
        "evidence.estimate",
      ]),
    });
    const details = findings[0]!.details as { gaps: string[] };
    expect(details.gaps).toEqual(
      expect.arrayContaining([
        "DataSlice slice.primary has no known slice hash",
        "linked derivation graph does not consume any result-linked DataSlice",
      ]),
    );
    expect(findings[0]!.message).toContain("lacks a closed derivation path");
  });

  it("raises DER001 for a quantitative claim backed only by a source-item ID and whole-source locator", () => {
    const report = externalQuantitativeClaimReport(false);

    const result = validateSelected(report, ["DER001"]);
    const findings = findingsFor(result, "DER001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "DER001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      instancePointer: "/claims/0/evidence_edge_ids",
      affectedObjectIds: expect.arrayContaining([
        "claim.external-quantity",
        "evidence.external-quantity",
        "edge.external-quantity",
      ]),
    });
    expect(findings[0]!.message).toContain("neither closed quantitative result/derivation evidence nor an exact immutable external locator");
  });

  it("does not treat a table name without a row/column or cell coordinate as an exact external locator", () => {
    const report = externalQuantitativeClaimReport(true);
    report.evidence_items[0]!.source_bindings[0]!.locator.value = "Table 2";

    const result = validateSelected(report, ["DER001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "DER001").status).toBe("fail");
    expect(findingsFor(result, "DER001")).toHaveLength(1);
  });

  it("accepts an external quantitative claim only with an immutable snapshot/hash and exact table-cell locator", () => {
    const report = externalQuantitativeClaimReport(true);

    const result = validateSelected(report, ["DER001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "DER001").status).toBe("pass");
    expect(findingsFor(result, "DER001")).toEqual([]);
  });
});
