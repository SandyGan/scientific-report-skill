import { describe, expect, it } from "vitest";

import { sha256 } from "../../src/lib/hash.js";
import type { ScientificReport } from "../../src/lib/types.js";
import { known, sourceBinding, sourceHash, unknown } from "../fixtures/base-report.js";
import { pooledBiologicalNReport } from "../fixtures/execution-scenarios.js";
import { makeCampaign, makeClaim, makeEvidence, makeEvidenceEdge, makeResult, makeWorkUnit } from "../fixtures/record-builders.js";
import {
  claimDependencyReport,
  conflictClassificationReport,
  crossDomainBridgeReport,
  negativeResultReport,
  revisionPropagationReport,
  unsupportedScientificClaimReport,
} from "../fixtures/argument-scenarios.js";
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

type ContextAlignmentState = "matched" | "bounded" | "transformed" | "partially_matched" | "mismatched" | "unknown";

function contextAlignment(
  dimension: string,
  alignment: ContextAlignmentState = "matched",
  sourceValue = `registered ${dimension}`,
  targetValue = sourceValue,
): UnknownRecord {
  return {
    alignment,
    source_value: known(sourceValue),
    target_value: known(targetValue),
    transformation: known(
      alignment === "transformed" || alignment === "bounded"
        ? `Source-bound ${dimension} transformation maps the registered source and target contexts.`
        : `No ${dimension} conversion is required for the matched registered contexts.`,
    ),
    mapping_evidence_bindings: [sourceBinding()],
  };
}

function addBridgeContextAlignments(
  report: ScientificReport,
  overrides: Partial<Record<"intervention" | "dose" | "endpoint" | "time" | "state", UnknownRecord>> = {},
): void {
  const bridge = report.cross_domain_bridges[0] as unknown as UnknownRecord;
  for (const dimension of ["intervention", "dose", "endpoint", "time", "state"] as const) {
    bridge[`${dimension}_alignment`] = overrides[dimension] ?? contextAlignment(dimension);
  }
  (report.extensions as unknown as UnknownRecord).domain_payloads = [
    {
      domain: "molecular_dynamics",
      applies_to: { work_unit_ids: [], attempt_ids: [], result_ids: [], entity_ids: ["entity.simulation-construct"] },
    },
    {
      domain: "wet_lab",
      applies_to: { work_unit_ids: [], attempt_ids: [], result_ids: [], entity_ids: ["entity.assay-construct"] },
    },
  ];
}

function addNegativeAnalysisPopulation(report: ScientificReport): void {
  const lineageFixture = pooledBiologicalNReport(1);
  const population = structuredClone(lineageFixture.analysis_populations[0]!);
  population.analysis_population_id = "population.negative";
  population.analysis_population_version = "1.0.0";
  population.name = "Prespecified negative-result analysis population";
  population.estimand = structuredClone(report.results[0]!.estimand);
  population.lineage_status = "closed";
  report.entities = structuredClone(lineageFixture.entities);
  report.materials = structuredClone(lineageFixture.materials);
  report.analysis_populations = [population];
  report.results[0]!.analysis_population_id = population.analysis_population_id;
  const assessment = report.results[0]!.negative_evidence_assessment as unknown as UnknownRecord;
  assessment.analysis_population_id = population.analysis_population_id;
}

function addWetLabNegativeRecords(report: ScientificReport, controlStatus: "passed" | "failed", qcOutcome: "pass" | "fail" | "indeterminate"): void {
  const assessment = report.results[0]!.negative_evidence_assessment as unknown as UnknownRecord;
  assessment.control_record_ids = ["control.required-positive"];
  assessment.quality_control_event_ids = ["qc.required"];
  assessment.analysis_context_ids = [];
  (report.extensions as unknown as UnknownRecord).domain_payloads = [
    {
      domain: "wet_lab",
      applies_to: {
        work_unit_ids: [report.results[0]!.work_unit_id],
        attempt_ids: [],
        result_ids: [report.results[0]!.result_id],
        entity_ids: [],
      },
      control_records: [
        {
          control_id: "control.required-positive",
          work_unit_id: report.results[0]!.work_unit_id,
          kind: "positive",
          source_bindings: [sourceBinding()],
          expected_behavior: known("Detectable positive response"),
          observed_behavior: known(controlStatus === "passed" ? "Detectable positive response" : "No positive response"),
          acceptance_criterion: known("The required positive control must respond."),
          status: known(controlStatus),
          assay_sensitivity: known(controlStatus === "passed" ? "adequate" : "inadequate"),
          detection_limit: known(0.2),
          minimum_detectable_effect: known(0.5),
          equivalence_bounds: known("-0.5 to 0.5"),
        },
      ],
      qc_events: [
        {
          qc_event_id: "qc.required",
          work_unit_id: report.results[0]!.work_unit_id,
          attempt_id: "attempt.negative",
          kind: "control_failure",
          source_bindings: [sourceBinding()],
          observed: known(qcOutcome === "pass" ? "QC passed" : "QC did not pass"),
          criterion: known("All required QC events must pass."),
          outcome: qcOutcome,
          affected_ids: [report.results[0]!.result_id],
          action_taken: known(qcOutcome === "pass" ? "Result retained" : "Result blocked from absence interpretation"),
        },
      ],
      analysis_contexts: [],
    },
  ];
}

function conflictEquivalenceAssessment() {
  const assessment = structuredClone(negativeResultReport(true).results[0]!.negative_evidence_assessment)!;
  assessment.eligible_for_biological_counterevidence = false;
  assessment.eligibility_reason = "This fixture exercises conflict classification only and does not use equivalence as biological counterevidence.";
  return assessment;
}

function attachResolutionAssessment(
  report: ScientificReport,
  satisfyingClaimIds: string[],
  status: "satisfied" | "not_satisfied" = "satisfied",
  revisionEventIds: string[] = [],
): void {
  const question = report.research_questions[0]!;
  question.resolution_criterion_timing = "predefined";
  question.resolution_criteria = known("At least one admissibly supported claim establishes the bounded answer with no unresolved blocker.");
  question.resolution_status = status === "satisfied" ? "resolved" : "unresolved";
  question.qualified_answer = status === "satisfied"
    ? known("The bounded answer follows from the criterion-satisfying admissible claim path.")
    : unknown<string>("The prior answer was withdrawn after its sole support path was retracted.");
  question.claim_ids = [...new Set([...question.claim_ids, ...satisfyingClaimIds])];
  Object.assign(question as unknown as UnknownRecord, {
    resolution_criterion_assessments: [
      {
        criterion_assessment_id: "criterion-assessment.fixture",
        criterion: structuredClone(question.resolution_criteria),
        assessment_status: status,
        satisfying_claim_ids: status === "satisfied" ? satisfyingClaimIds : [],
        unresolved_blocker_ids: status === "satisfied" ? [] : ["claim.withdrawn-support"],
        rationale: known(status === "satisfied" ? "The listed claim meets the recorded criterion." : "No admissible support path remains."),
        assessed_at: known("2026-08-24T00:00:00.000Z"),
        assessment_revision_event_ids: revisionEventIds,
        source_bindings: [sourceBinding()],
      },
    ],
    revision_event_ids: revisionEventIds,
  });
}

function causalReasoningReport(claimType: "causal" | "mechanistic", includeReasoningStep: boolean): ScientificReport {
  const report = unsupportedScientificClaimReport();
  const evidence = report.evidence_items[0]!;
  const claim = report.claims[0]!;
  evidence.evidence_status = "active";
  evidence.evidence_kind = "source_statement";
  evidence.summary = "Exposure and endpoint co-occurred in the registered observational source.";
  claim.claim_type = claimType;
  claim.proposition = claimType === "causal"
    ? "The exposure causes the endpoint."
    : "The exposure changes the endpoint through the proposed mechanism.";
  if (includeReasoningStep) {
    claim.argument_step_ids = ["argument.causal-mechanistic"];
    report.argument_steps = [
      {
        argument_step_id: "argument.causal-mechanistic",
        object_version: "1.0.0",
        rule_or_rationale: known("The bounded causal interpretation follows only after the registered assumptions and alternatives are considered against the premise evidence."),
        premise_edge_ids: ["argument-edge.association-premise"],
        conclusion_edge_ids: ["argument-edge.causal-conclusion"],
        assumption_states: known(["The measured exposure precedes the endpoint and the registered adjustment set is adequate for this bounded scope."]),
        alternative_explanations: known(["A shared upstream factor could produce the observed co-occurrence without the proposed causal path."]),
        validity_status: "valid_for_scope",
        bridge_ids: [],
        source_bindings: [sourceBinding()],
        extensions: {},
      },
    ];
    report.argument_edges = [
      {
        argument_edge_id: "argument-edge.association-premise",
        source_type: "evidence_item",
        source_id: evidence.evidence_item_id,
        target_type: "argument_step",
        target_id: "argument.causal-mechanistic",
      },
      {
        argument_edge_id: "argument-edge.causal-conclusion",
        source_type: "argument_step",
        source_id: "argument.causal-mechanistic",
        target_type: "claim",
        target_id: claim.claim_id,
      },
    ];
  } else {
    claim.argument_step_ids = [];
    report.argument_steps = [];
    report.argument_edges = [];
  }
  attachResolutionAssessment(report, [claim.claim_id]);
  return report;
}

function premiseOnlyCrossDomainReport(withBridge: boolean, cyclic = false): ScientificReport {
  const report = crossDomainBridgeReport(true);
  addBridgeContextAlignments(report);
  const mdEntity = report.entities[0]!;
  const wetEntity = report.entities[1]!;
  const mdEvidence = makeEvidence("evidence.md-premise", {
    evidence_kind: "source_statement",
    summary: "Registered molecular-dynamics premise evidence.",
  });
  const wetEvidence = makeEvidence("evidence.wet-premise", {
    evidence_kind: "source_statement",
    summary: "Registered wet-lab premise evidence.",
  });
  const mdClaim = makeClaim("claim.md-premise", {
    claim_type: "descriptive",
    proposition: "The molecular-dynamics state is present under the registered simulation context.",
    subject_bindings: [{ object_type: "entity", object_id: mdEntity.entity_id, object_version: mdEntity.entity_version }],
    evidence_edge_ids: ["edge.md-premise"],
    argument_step_ids: cyclic ? ["argument.cycle-md"] : [],
  });
  const wetClaim = makeClaim("claim.wet-premise", {
    claim_type: "descriptive",
    proposition: "The assay response is present under the registered wet-lab context.",
    subject_bindings: [{ object_type: "entity", object_id: wetEntity.entity_id, object_version: wetEntity.entity_version }],
    evidence_edge_ids: ["edge.wet-premise"],
  });
  const conclusion = report.claims[0]!;
  conclusion.subject_bindings = [{
    object_type: "research_question",
    object_id: report.research_questions[0]!.research_question_id,
    object_version: report.research_questions[0]!.research_question_version,
  }];
  conclusion.evidence_edge_ids = [];
  conclusion.argument_step_ids = ["argument.bridge-enabled"];
  conclusion.cross_domain_bridge_ids = withBridge ? ["bridge.simulation-to-assay"] : [];

  report.evidence_items = [mdEvidence, wetEvidence];
  report.evidence_edges = [
    makeEvidenceEdge("edge.md-premise", mdEvidence.evidence_item_id, mdClaim.claim_id),
    makeEvidenceEdge("edge.wet-premise", wetEvidence.evidence_item_id, wetClaim.claim_id),
  ];
  report.claims = [mdClaim, wetClaim, conclusion];
  report.argument_steps = [
    {
      argument_step_id: "argument.bridge-enabled",
      object_version: "1.0.0",
      rule_or_rationale: known("The bounded conclusion combines the registered simulation and assay premises only through an explicit domain bridge."),
      premise_edge_ids: ["argument-edge.md-premise", "argument-edge.wet-premise"],
      conclusion_edge_ids: ["argument-edge.integrated-conclusion"],
      assumption_states: known(["The mapped simulation and assay contexts remain comparable."]),
      alternative_explanations: known(["An assay-specific factor may explain the response independently of the simulated state."]),
      validity_status: "valid_for_scope",
      bridge_ids: withBridge ? ["bridge.simulation-to-assay"] : [],
      source_bindings: [sourceBinding()],
      extensions: {},
    },
    ...(cyclic
      ? [{
          argument_step_id: "argument.cycle-md",
          object_version: "1.0.0",
          rule_or_rationale: known("Synthetic cycle used to verify bounded premise-closure traversal."),
          premise_edge_ids: ["argument-edge.cycle-premise"],
          conclusion_edge_ids: ["argument-edge.cycle-conclusion"],
          assumption_states: known(["The synthetic cycle is not treated as scientific support."]),
          alternative_explanations: known(["The cyclic path is invalid and independently rejected by CLM002."]),
          validity_status: "review_required" as const,
          bridge_ids: [],
          source_bindings: [sourceBinding()],
          extensions: {},
        }]
      : []),
  ];
  report.argument_edges = [
    { argument_edge_id: "argument-edge.md-premise", source_type: "claim", source_id: mdClaim.claim_id, target_type: "argument_step", target_id: "argument.bridge-enabled" },
    { argument_edge_id: "argument-edge.wet-premise", source_type: "claim", source_id: wetClaim.claim_id, target_type: "argument_step", target_id: "argument.bridge-enabled" },
    { argument_edge_id: "argument-edge.integrated-conclusion", source_type: "argument_step", source_id: "argument.bridge-enabled", target_type: "claim", target_id: conclusion.claim_id },
    ...(cyclic
      ? [
          { argument_edge_id: "argument-edge.cycle-premise", source_type: "claim" as const, source_id: conclusion.claim_id, target_type: "argument_step" as const, target_id: "argument.cycle-md" },
          { argument_edge_id: "argument-edge.cycle-conclusion", source_type: "argument_step" as const, source_id: "argument.cycle-md", target_type: "claim" as const, target_id: mdClaim.claim_id },
        ]
      : []),
  ];
  if (withBridge) {
    report.cross_domain_bridges[0]!.enabled_argument_step_ids = ["argument.bridge-enabled"];
  } else {
    report.cross_domain_bridges = [];
  }
  return report;
}

function biologicalIndependenceReport(sharedPopulation: boolean): ScientificReport {
  const report = pooledBiologicalNReport(1);
  const firstPopulation = report.analysis_populations[0]!;
  const secondPopulation = structuredClone(firstPopulation);
  secondPopulation.analysis_population_id = "population.pool-B";
  secondPopulation.name = "Measurements from an independent biological pool";
  secondPopulation.members.forEach((member, index) => {
    member.member_id = `member.pool-B.tech-${index + 1}`;
    member.material_id = "material.pool-B";
    member.entity_id = "entity.donor-pool-B";
    member.group_key = known("biological-unit.pool-B");
  });
  const secondEntity = structuredClone(report.entities[0]!);
  secondEntity.entity_id = "entity.donor-pool-B";
  secondEntity.label = known("Independent pooled donor material B");
  const secondMaterial = structuredClone(report.materials[0]!);
  secondMaterial.material_id = "material.pool-B";
  secondMaterial.entity_id = secondEntity.entity_id;
  secondMaterial.label = known("Independent Pool B technical measurements");
  report.entities.push(secondEntity);
  report.materials.push(secondMaterial);
  report.analysis_populations.push(secondPopulation);

  const campaign = makeCampaign("campaign.replication", "this_project", "attempted", { work_unit_ids: ["work.replication"] });
  const unit = makeWorkUnit("work.replication", campaign.campaign_id, "this_project", "attempted");
  const firstResult = makeResult("result.replication-A", unit.work_unit_id, {
    analysis_population_id: firstPopulation.analysis_population_id,
    scientific_effect_class: "increase",
    statistical_decision: "reject_null",
  });
  const secondResult = makeResult("result.replication-B", unit.work_unit_id, {
    analysis_population_id: sharedPopulation ? firstPopulation.analysis_population_id : secondPopulation.analysis_population_id,
    scientific_effect_class: "increase",
    statistical_decision: "reject_null",
  });
  const firstEvidence = makeEvidence("evidence.replication-A", {
    evidence_kind: "result",
    result_ids: [firstResult.result_id],
    dependency_group_ids: ["dependency-group.replication-A"],
  });
  const secondEvidence = makeEvidence("evidence.replication-B", {
    evidence_kind: "result",
    result_ids: [secondResult.result_id],
    dependency_group_ids: ["dependency-group.replication-B"],
  });
  const claim = makeClaim("claim.independently-replicated", {
    claim_type: "comparative",
    proposition: "The increase was independently replicated in two biological evidence groups.",
    evidence_edge_ids: ["edge.replication-A", "edge.replication-B"],
  });
  report.campaigns = [campaign];
  report.work_units = [unit];
  report.results = [firstResult, secondResult];
  report.evidence_items = [firstEvidence, secondEvidence];
  report.evidence_edges = [
    makeEvidenceEdge("edge.replication-A", firstEvidence.evidence_item_id, claim.claim_id, "supports", "dependency-group.replication-A"),
    makeEvidenceEdge("edge.replication-B", secondEvidence.evidence_item_id, claim.claim_id, "supports", "dependency-group.replication-B"),
  ];
  report.evidence_dependency_groups = [
    {
      dependency_group_id: "dependency-group.replication-A",
      dependency_basis: known("Biological ancestry closure for Pool A."),
      shared_ancestor_ids: [],
      assessment_state: "independent",
      evidence_item_ids: [firstEvidence.evidence_item_id],
      source_bindings: [sourceBinding()],
    },
    {
      dependency_group_id: "dependency-group.replication-B",
      dependency_basis: known("Biological ancestry closure for the registered second result."),
      shared_ancestor_ids: [],
      assessment_state: "independent",
      evidence_item_ids: [secondEvidence.evidence_item_id],
      source_bindings: [sourceBinding()],
    },
  ];
  report.claims = [claim];
  return report;
}

describe("claim DAG and cross-domain bridges", () => {
  it("raises CLM001 when an affirmative scientific claim relies only on invalidated evidence", () => {
    const result = validateSelected(unsupportedScientificClaimReport(), ["CLM001"]);
    const findings = findingsFor(result, "CLM001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "CLM001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "CLM001",
      instancePointer: "/claims/0",
      affectedObjectIds: ["claim.unsupported", "edge.invalidated-support"],
      message: "A report claim has no valid evidence or supported premises.",
    });
  });

  it.each(["causal", "mechanistic"] as const)(
    "[SCIENTIFIC-001 negative] rejects a resolved %s claim supported only by direct association evidence",
    (claimType) => {
      const result = validateSelected(causalReasoningReport(claimType, false), ["CLM001"]);
      const findings = findingsFor(result, "CLM001");

      expect(result.schemaValid).toBe(true);
      expect(evaluationFor(result, "CLM001").status).toBe("fail");
      expect(findings.map((finding) => finding.instancePointer)).toEqual(expect.arrayContaining([
        "/claims/0",
        "/research_questions/0/resolution_status",
      ]));
      expect(findings.some((finding) => finding.message.includes("no admissibly supported or qualified satisfying claim"))).toBe(true);
    },
  );

  it.each(["causal", "mechanistic"] as const)(
    "[SCIENTIFIC-001 positive] accepts a resolved %s claim only with an admissible step and known assumptions and alternatives",
    (claimType) => {
      const report = causalReasoningReport(claimType, true);
      const result = validateSelected(report, ["CLM001"]);

      expect(result.schemaValid).toBe(true);
      expect(evaluationFor(result, "CLM001").status).toBe("pass");
      expect(findingsFor(result, "CLM001")).toEqual([]);
      expect(report.argument_steps[0]).toMatchObject({
        assumption_states: expect.objectContaining({ state: "known" }),
        alternative_explanations: expect.objectContaining({ state: "known" }),
      });
    },
  );

  it("raises CLM002 for a cycle across versioned claim dependencies", () => {
    const result = validateSelected(claimDependencyReport(true), ["CLM002"]);
    const findings = findingsFor(result, "CLM002");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "CLM002").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "CLM002",
      instancePointer: "/claim_dependencies",
      affectedObjectIds: expect.arrayContaining(["claim.a", "claim.b"]),
    });
    expect(findings[0]!.message).toContain("claim.a");
    expect(findings[0]!.message).toContain("claim.b");
  });

  it("accepts an acyclic, version-matched claim dependency graph", () => {
    const report = claimDependencyReport(false);
    const result = validateSelected(report, ["CLM002"]);

    expect(evaluationFor(result, "REF001").status).toBe("pass");
    expect(evaluationFor(result, "CLM002").status).toBe("pass");
    expect(report.claim_dependencies).toHaveLength(1);
    expect(report.claim_dependencies[0]).toMatchObject({
      upstream_claim_id: "claim.a",
      upstream_claim_version: "1.0.0",
      downstream_claim_id: "claim.b",
      downstream_claim_version: "1.0.0",
    });
  });

  it("raises BRG001 for an unknown scale alignment and an unbounded construct mismatch", () => {
    const result = validateSelected(crossDomainBridgeReport(false), ["BRG001"]);
    const findings = findingsFor(result, "BRG001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "BRG001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "BRG001",
      instancePointer: "/claims/0/cross_domain_bridge_ids",
      affectedObjectIds: expect.arrayContaining(["claim.cross-domain-mechanism", "bridge.simulation-to-assay"]),
    });
    const details = findings[0]!.details as { gaps: string[] };
    expect(details.gaps).toEqual(
      expect.arrayContaining([
        "bridge.simulation-to-assay status is invalid",
        "bridge.simulation-to-assay has a material construct mismatch",
        "bridge.simulation-to-assay has unverifiable scale alignment",
      ]),
    );
  });

  it("structurally rejects a bridge labelled valid when typed intervention, dose, endpoint, time, and state assessments are absent", () => {
    const report = crossDomainBridgeReport(true);

    const result = validateSelected(report, ["BRG001"]);

    expect(result.schemaValid).toBe(false);
    const missing = result.schemaIssues
      .filter((issue) => issue.keyword === "required")
      .map((issue) => (issue.params as { missingProperty?: string }).missingProperty);
    expect(missing).toEqual(expect.arrayContaining([
      "intervention_alignment",
      "dose_alignment",
      "endpoint_alignment",
      "time_alignment",
      "state_alignment",
    ]));
  });

  it("accepts a supported cross-domain mechanism only when every required alignment is matched", () => {
    const report = crossDomainBridgeReport(true);
    addBridgeContextAlignments(report);
    const result = validateSelected(report, ["BRG001"]);
    const bridge = report.cross_domain_bridges[0]!;

    expect(evaluationFor(result, "BRG001").status).toBe("pass");
    expect([
      bridge.identity_alignment,
      bridge.construct_alignment,
      bridge.condition_alignment,
      bridge.scale_alignment,
    ]).toEqual(["matched", "matched", "matched", "matched"]);
    expect(bridge.validity_status).toBe("valid");
    expect(bridge.reviewer_state).toBe("reviewed");
  });

  it("[SCI-001] raises BRG001 for a mechanistic MD-to-wet-lab claim after every declared bridge ID and bridge record is removed", () => {
    const report = crossDomainBridgeReport(true);
    addBridgeContextAlignments(report);
    report.claims[0]!.cross_domain_bridge_ids = [];
    report.argument_steps[0]!.bridge_ids = [];
    report.cross_domain_bridges = [];

    const result = validateSelected(report, ["BRG001"]);
    const findings = findingsFor(result, "BRG001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "BRG001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect((findings[0]!.details as { gaps: string[]; derived_domains: string[] }).derived_domains).toEqual([
      "molecular_dynamics",
      "wet_lab",
    ]);
    expect(findings[0]!.message).toContain("no bridge is declared for derived domains");
  });

  it("[acceptance-cross-domain] requires a bridge for a supported descriptive cross-domain inference", () => {
    const report = crossDomainBridgeReport(true);
    addBridgeContextAlignments(report);
    report.claims[0]!.claim_type = "descriptive";
    report.claims[0]!.cross_domain_bridge_ids = [];
    report.argument_steps[0]!.bridge_ids = [];
    report.cross_domain_bridges = [];

    const result = validateSelected(report, ["BRG001"]);
    const findings = findingsFor(result, "BRG001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "BRG001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("no bridge is declared for derived domains");
  });

  it("[SCIENTIFIC-004 negative] requires a bridge when MD and wet-lab domains occur only in premise-claim closure", () => {
    const report = premiseOnlyCrossDomainReport(false);
    const result = validateSelected(report, ["BRG001"]);
    const findings = findingsFor(result, "BRG001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "BRG001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect((findings[0]!.details as { derived_domains: string[] }).derived_domains).toEqual([
      "molecular_dynamics",
      "wet_lab",
    ]);
    expect(findings[0]!.message).toContain("cross-domain premise step argument.bridge-enabled");
  });

  it("[SCIENTIFIC-004 positive] accepts premise-only cross-domain inference when the exact step is bridge-enabled", () => {
    const report = premiseOnlyCrossDomainReport(true);
    const result = validateSelected(report, ["BRG001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "BRG001").status).toBe("pass");
    expect(findingsFor(result, "BRG001")).toEqual([]);
    expect(report.cross_domain_bridges[0]!.enabled_argument_step_ids).toEqual(["argument.bridge-enabled"]);
  });

  it("[SCIENTIFIC-004 cycle safety] terminates premise traversal and still finds both domains when the claim graph is cyclic", () => {
    const result = validateSelected(premiseOnlyCrossDomainReport(false, true), ["BRG001"]);
    const findings = findingsFor(result, "BRG001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "BRG001").status).toBe("fail");
    expect((findings[0]!.details as { derived_domains: string[] }).derived_domains).toEqual([
      "molecular_dynamics",
      "wet_lab",
    ]);
  });

  it("does not require a bridge for a same-domain mechanistic claim", () => {
    const report = crossDomainBridgeReport(true);
    report.claims[0]!.cross_domain_bridge_ids = [];
    report.argument_steps[0]!.bridge_ids = [];
    report.cross_domain_bridges = [];
    report.entities[0]!.entity_kind = "assay_construct";
    (report.extensions as unknown as UnknownRecord).domain_payloads = [
      {
        domain: "wet_lab",
        applies_to: {
          work_unit_ids: [],
          attempt_ids: [],
          result_ids: [],
          entity_ids: report.entities.map((entity) => entity.entity_id),
        },
      },
    ];

    const result = validateSelected(report, ["BRG001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "BRG001").status).toBe("pass");
    expect(findingsFor(result, "BRG001")).toEqual([]);
  });

  it("[SCI-002] rejects a bridge labelled valid when 1 nM versus 10 µM dose and occupancy versus viability endpoint are mismatched", () => {
    const report = crossDomainBridgeReport(true);
    addBridgeContextAlignments(report, {
      dose: contextAlignment("dose", "mismatched", "1 nM", "10 µM"),
      endpoint: contextAlignment("endpoint", "mismatched", "contact occupancy", "cell viability"),
    });

    const result = validateSelected(report, ["BRG001"]);
    const findings = findingsFor(result, "BRG001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "BRG001").status).toBe("fail");
    expect((findings[0]!.details as { gaps: string[] }).gaps).toEqual(
      expect.arrayContaining([
        "bridge.simulation-to-assay has a material dose mismatch",
        "bridge.simulation-to-assay has a material endpoint mismatch",
      ]),
    );
  });

  it("accepts a dose difference only when a source-bound transformation explicitly resolves it", () => {
    const report = crossDomainBridgeReport(true);
    addBridgeContextAlignments(report, {
      dose: contextAlignment("dose", "transformed", "1 nM source exposure", "10 µM assay dose"),
      endpoint: contextAlignment("endpoint", "transformed", "contact occupancy", "viability calibrated to occupancy"),
    });

    const result = validateSelected(report, ["BRG001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "BRG001").status).toBe("pass");
    expect(findingsFor(result, "BRG001")).toEqual([]);
  });

  it("[SCI-003] raises CLM001 when a resolved question names only an unsupported evidence-free claim as satisfying its criterion", () => {
    const report = unsupportedScientificClaimReport();
    const claim = report.claims[0]!;
    claim.support_status = "unsupported";
    claim.evidence_edge_ids = [];
    report.evidence_items = [];
    report.evidence_edges = [];
    attachResolutionAssessment(report, [claim.claim_id]);

    const result = validateSelected(report, ["CLM001"]);
    const findings = findingsFor(result, "CLM001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "CLM001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      instancePointer: "/research_questions/0/resolution_status",
      affectedObjectIds: expect.arrayContaining(["question.fixture", "claim.unsupported"]),
    });
    expect(findings[0]!.message).toContain("no admissibly supported or qualified satisfying claim");
  });

  it("does not allow an otherwise supported question to resolve while a linked limitation remains open", () => {
    const report = unsupportedScientificClaimReport();
    report.evidence_items[0]!.evidence_status = "active";
    attachResolutionAssessment(report, [report.claims[0]!.claim_id]);
    report.limitations = [
      {
        limitation_id: "limitation.unresolved-criterion-blocker",
        category: "uncertainty",
        statement: "A criterion-critical uncertainty remains unresolved.",
        impact: "The bounded answer cannot yet be treated as resolved.",
        affected_object_ids: [report.research_questions[0]!.research_question_id],
        resolution_status: "open",
        source_bindings: [sourceBinding()],
      },
    ];
    report.research_questions[0]!.limitation_ids = ["limitation.unresolved-criterion-blocker"];

    const result = validateSelected(report, ["CLM001"]);
    const findings = findingsFor(result, "CLM001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "CLM001").status).toBe("fail");
    expect((findings[0]!.details as { gaps: string[] }).gaps).toContain(
      "linked unresolved limitations remain: limitation.unresolved-criterion-blocker",
    );
  });

  it("permits resolution when the structured criterion assessment names an admissibly supported claim and no blocker", () => {
    const report = unsupportedScientificClaimReport();
    report.evidence_items[0]!.evidence_status = "active";
    attachResolutionAssessment(report, [report.claims[0]!.claim_id]);

    const result = validateSelected(report, ["CLM001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "CLM001").status).toBe("pass");
    expect(findingsFor(result, "CLM001")).toEqual([]);
  });
});

describe("biological evidence independence", () => {
  it("[SCIENTIFIC-003 negative] rejects distinct result IDs routed from the same AnalysisPopulation as independent replication", () => {
    const result = validateSelected(biologicalIndependenceReport(true), ["DEP001"]);
    const findings = findingsFor(result, "DEP001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "DEP001").status).toBe("fail");
    expect(findings.some((finding) =>
      (finding.details as { shared_ancestor_ids?: string[] } | undefined)?.shared_ancestor_ids?.includes("population.pool-A") === true
    )).toBe(true);
    expect(findings.some((finding) => finding.message.includes("shared ancestor"))).toBe(true);
  });

  it("[SCIENTIFIC-003 ancestry negative] rejects distinct AnalysisPopulation IDs that share one biological group and material ancestry", () => {
    const report = biologicalIndependenceReport(false);
    const secondPopulation = report.analysis_populations.find((population) => population.analysis_population_id === "population.pool-B")!;
    secondPopulation.members.forEach((member) => {
      member.group_key = known("biological-unit.pool-A");
      member.material_id = "material.pool-A";
      member.entity_id = "entity.donor-pool";
    });

    const result = validateSelected(report, ["DEP001"]);
    const findings = findingsFor(result, "DEP001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "DEP001").status).toBe("fail");
    expect(findings.some((finding) => {
      const shared = (finding.details as { shared_ancestor_ids?: string[] } | undefined)?.shared_ancestor_ids ?? [];
      return shared.includes("material.pool-A") && shared.includes("biological-group:biological-unit.pool-A");
    })).toBe(true);
  });

  it("[SCIENTIFIC-003 positive] accepts independent wording only for distinct population, group, and material ancestry", () => {
    const result = validateSelected(biologicalIndependenceReport(false), ["DEP001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "DEP001").status).toBe("pass");
    expect(findingsFor(result, "DEP001")).toEqual([]);
  });
});

describe("negative-result qualification", () => {
  it("structurally rejects an eligibility=true assessment with no concrete control, QC, analysis-context, or population links", () => {
    const report = negativeResultReport(true);

    const result = validateSelected(report, ["NUL001"]);

    expect(result.schemaValid).toBe(false);
    const missing = result.schemaIssues
      .filter((issue) => issue.keyword === "required")
      .map((issue) => (issue.params as { missingProperty?: string }).missingProperty);
    expect(missing).toEqual(expect.arrayContaining([
      "control_record_ids",
      "quality_control_event_ids",
      "analysis_context_ids",
      "analysis_population_id",
    ]));
  });

  it("[SCIENTIFIC-002 negative] fails NUL001 and REF001 when passing aggregates name nonexistent control and QC records", () => {
    const report = negativeResultReport(true);
    addNegativeAnalysisPopulation(report);
    const assessment = report.results[0]!.negative_evidence_assessment as unknown as UnknownRecord;
    assessment.control_record_ids = ["control.does-not-exist"];
    assessment.quality_control_event_ids = ["qc.does-not-exist"];
    assessment.analysis_context_ids = [];

    const result = validateSelected(report, ["NUL001"]);
    const nulFindings = findingsFor(result, "NUL001");
    const referenceFindings = findingsFor(result, "REF001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "NUL001").status).toBe("fail");
    expect(evaluationFor(result, "REF001").status).toBe("fail");
    expect((nulFindings[0]!.details as { gaps: string[] }).gaps).toEqual(expect.arrayContaining([
      "linked control record control.does-not-exist is unresolved or belongs to another work unit",
      "linked QC event qc.does-not-exist is unresolved or belongs to another work unit",
    ]));
    expect(referenceFindings.map((finding) => finding.instancePointer)).toEqual(expect.arrayContaining([
      "/results/0/negative_evidence_assessment/control_record_ids/0",
      "/results/0/negative_evidence_assessment/quality_control_event_ids/0",
    ]));
  });

  it("[SCI-006] raises NUL001 when a failed control and unknown MDE are used to support biological absence", () => {
    const result = validateSelected(negativeResultReport(false), ["NUL001"]);
    const findings = findingsFor(result, "NUL001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "NUL001").status).toBe("fail");
    expect(findings.map((finding) => finding.ruleId)).toEqual(["NUL001", "NUL001"]);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "NUL001",
          instancePointer: "/results/0/negative_evidence_assessment",
          affectedObjectIds: expect.arrayContaining(["result.negative", "claim.biological-absence"]),
        }),
        expect.objectContaining({
          ruleId: "NUL001",
          instancePointer: "/results/0/statistical_decision",
          affectedObjectIds: expect.arrayContaining(["result.negative", "claim.biological-absence"]),
        }),
      ]),
    );
    const assessmentFinding = findings.find((finding) => finding.instancePointer.endsWith("negative_evidence_assessment"));
    expect(assessmentFinding?.message).toContain("control_status=failed");
    expect(assessmentFinding?.message).toContain("sensitivity_status=not_established");
    expect(assessmentFinding?.message).toContain("no known detection limit, MDE, or equivalence bounds");
    expect(assessmentFinding?.message).toContain("no valid observed interval");
  });

  it("[SCIENTIFIC-002 positive] accepts biological counterevidence only with valid controls, adequate sensitivity, an analysis population, and an observed interval", () => {
    const report = negativeResultReport(true);
    addNegativeAnalysisPopulation(report);
    addWetLabNegativeRecords(report, "passed", "pass");
    const result = validateSelected(report, ["NUL001"]);
    const assessment = report.results[0]!.negative_evidence_assessment;

    expect(evaluationFor(result, "NUL001").status).toBe("pass");
    expect(findingsFor(result, "NUL001")).toEqual([]);
    expect(assessment).toMatchObject({
      control_status: "valid",
      quality_control_status: "passed",
      sensitivity_status: "adequate",
      eligible_for_biological_counterevidence: true,
    });
    expect(assessment?.minimum_detectable_effect).toMatchObject({ state: "known", value: 0.5 });
    expect(assessment?.observed_interval).not.toBeNull();
  });

  it.each([
    ["failed", "pass"],
    ["passed", "indeterminate"],
  ] as const)(
    "blocks biological absence when detached aggregate flags pass but the required control is %s and QC is %s",
    (controlStatus, qcOutcome) => {
      const report = negativeResultReport(true);
      addNegativeAnalysisPopulation(report);
      addWetLabNegativeRecords(report, controlStatus, qcOutcome);

      const result = validateSelected(report, ["NUL001"]);
      const findings = findingsFor(result, "NUL001");

      expect(result.schemaValid).toBe(true);
      expect(evaluationFor(result, "NUL001").status).toBe("fail");
      const gaps = (findings[0]!.details as { gaps: string[] }).gaps;
      if (controlStatus === "failed") {
        expect(gaps).toEqual(expect.arrayContaining([
          "required positive control control.required-positive status=failed",
          "required positive control control.required-positive assay_sensitivity=inadequate",
        ]));
      }
      if (qcOutcome === "indeterminate") {
        expect(gaps).toContain("QC event qc.required outcome=indeterminate");
      }
    },
  );

  it("blocks biological absence when the analysis population is missing despite passing detached flags", () => {
    const report = negativeResultReport(true);
    addWetLabNegativeRecords(report, "passed", "pass");
    (report.results[0]!.negative_evidence_assessment as unknown as UnknownRecord).analysis_population_id = "population.missing";

    const result = validateSelected(report, ["NUL001"]);
    const findings = findingsFor(result, "NUL001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "NUL001").status).toBe("fail");
    expect((findings[0]!.details as { gaps: string[] }).gaps).toContain("analysis_population_id is missing");
  });

  it("accepts biological counterevidence when linked positive-control, QC, population, sensitivity, and interval records all pass", () => {
    const report = negativeResultReport(true);
    addNegativeAnalysisPopulation(report);
    addWetLabNegativeRecords(report, "passed", "pass");

    const result = validateSelected(report, ["NUL001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REF001").status).toBe("pass");
    expect(evaluationFor(result, "NUL001").status).toBe("pass");
    expect(findingsFor(result, "NUL001")).toEqual([]);
  });
});

describe("true conflict versus contextual heterogeneity", () => {
  it("raises CNF001 when opposite results share the same work unit, population, and estimand but no ConflictSet", () => {
    const result = validateSelected(conflictClassificationReport("unregistered_true_conflict"), ["CNF001"]);
    const findings = findingsFor(result, "CNF001");

    expect(evaluationFor(result, "CNF001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "CNF001",
      instancePointer: "/conflict_sets",
      affectedObjectIds: expect.arrayContaining(["result.increase", "result.decrease"]),
    });
    expect(findings[0]!.message).toContain("same estimand and matched context");
  });

  it("accepts like-for-like opposite values once they are retained as a true ConflictSet", () => {
    const report = conflictClassificationReport("registered_true_conflict");
    const result = validateSelected(report, ["CNF001"]);

    expect(evaluationFor(result, "CNF001").status).toBe("pass");
    expect(report.conflict_sets[0]).toMatchObject({
      adjudication_status: "unresolved",
    });
    expect(report.conflict_member_edges.map((edge) => edge.member_id)).toEqual([
      "evidence.increase",
      "evidence.decrease",
    ]);
  });

  it("[SCIENTIFIC-005 negative] rejects retained_as_heterogeneity for opposite results with identical source-bound context", () => {
    const report = conflictClassificationReport("registered_true_conflict");
    const conflict = report.conflict_sets[0]!;
    conflict.adjudication_status = "retained_as_heterogeneity";
    conflict.heterogeneity_context_differences = [
      {
        dimension: "time_or_frame_scope",
        left_result_id: "result.increase",
        right_result_id: "result.decrease",
        left_value: known("Primary analysis interval"),
        right_value: known("Primary analysis interval"),
        materiality_assessment: known("The records are asserted to differ, despite containing the same interval."),
        source_bindings: [sourceBinding()],
      },
    ];

    const result = validateSelected(report, ["CNF001"]);
    const findings = findingsFor(result, "CNF001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "CNF001").status).toBe("fail");
    expect(findings.some((finding) => finding.instancePointer.endsWith("/heterogeneity_context_differences"))).toBe(true);
    expect(findings[0]!.message).toContain("known, source-bound material context difference");
  });

  it("[SCIENTIFIC-005 positive] retains opposite time-point results as heterogeneity only with a typed source-bound difference", () => {
    const report = conflictClassificationReport("retained_heterogeneity");
    const result = validateSelected(report, ["CNF001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "CNF001").status).toBe("pass");
    expect(report.conflict_sets[0]!.heterogeneity_context_differences).toEqual([
      expect.objectContaining({
        dimension: "time_or_frame_scope",
        left_result_id: "result.increase",
        right_result_id: "result.decrease",
      }),
    ]);
  });

  it("retains opposite time-point results as heterogeneity instead of flattening them into a true conflict", () => {
    const report = conflictClassificationReport("retained_heterogeneity");
    const result = validateSelected(report, ["CNF001"]);

    expect(evaluationFor(result, "CNF001").status).toBe("pass");
    expect(report.results.map((resultItem) => resultItem.work_unit_id)).toEqual(["work.early", "work.late"]);
    expect(report.conflict_sets[0]).toMatchObject({
      conflict_set_id: "conflict.heterogeneous-timepoints",
      adjudication_status: "retained_as_heterogeneity",
    });
    expect(report.results.map((resultItem) => resultItem.time_or_frame_scope)).toEqual([
      expect.objectContaining({ state: "known", value: "5 minutes" }),
      expect.objectContaining({ state: "known", value: "24 hours" }),
    ]);
  });

  it("requires a conflict record for incompatible statistical decisions even when the scientific-effect labels match", () => {
    const report = conflictClassificationReport("unregistered_true_conflict");
    report.results[1]!.scientific_effect_class = "increase";
    report.results[0]!.statistical_decision = "reject_null";
    report.results[1]!.statistical_decision = "do_not_reject_null";

    const result = validateSelected(report, ["CNF001"]);
    const findings = findingsFor(result, "CNF001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "CNF001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.details).toMatchObject({
      incompatible_axes: ["statistical-decision"],
      left_decision: "reject_null",
      right_decision: "do_not_reject_null",
    });
  });

  it("[SCI-005] requires a conflict record for like-for-like equivalence versus increase conclusions", () => {
    const report = conflictClassificationReport("unregistered_true_conflict");
    report.results[1]!.scientific_effect_class = "equivalent";
    report.results[1]!.statistical_decision = "equivalent";
    report.results[1]!.negative_evidence_assessment = conflictEquivalenceAssessment();

    const result = validateSelected(report, ["CNF001"]);
    const findings = findingsFor(result, "CNF001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "CNF001").status).toBe("fail");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      affectedObjectIds: expect.arrayContaining(["result.increase", "result.decrease"]),
      details: expect.objectContaining({
        incompatible_axes: expect.arrayContaining(["scientific-effect", "statistical-decision"]),
      }),
    });
  });

  it("treats equivalence versus increase at different doses as contextual heterogeneity, not a false conflict", () => {
    const report = conflictClassificationReport("unregistered_true_conflict");
    report.results[1]!.scientific_effect_class = "equivalent";
    report.results[1]!.statistical_decision = "equivalent";
    report.results[1]!.negative_evidence_assessment = conflictEquivalenceAssessment();
    (report.results[0] as unknown as UnknownRecord).dose = known("1 nM");
    (report.results[1] as unknown as UnknownRecord).dose = known("10 µM");

    const result = validateSelected(report, ["CNF001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "CNF001").status).toBe("pass");
    expect(findingsFor(result, "CNF001")).toEqual([]);
  });

  it("does not let an unknown dose value launder a like-for-like incompatibility into apparent heterogeneity", () => {
    const report = conflictClassificationReport("unregistered_true_conflict");
    report.results[1]!.scientific_effect_class = "equivalent";
    report.results[1]!.statistical_decision = "equivalent";
    report.results[1]!.negative_evidence_assessment = conflictEquivalenceAssessment();
    (report.results[0] as unknown as UnknownRecord).dose = known("1 nM");
    (report.results[1] as unknown as UnknownRecord).dose = unknown<string>("The dose was not reported.");

    const result = validateSelected(report, ["CNF001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "CNF001").status).toBe("fail");
    expect(findingsFor(result, "CNF001")).toHaveLength(1);
  });

  it("accepts like-for-like incompatible results when one contested claim explicitly links both evidence items", () => {
    const report = conflictClassificationReport("unregistered_true_conflict");
    report.results[1]!.scientific_effect_class = "equivalent";
    report.results[1]!.statistical_decision = "equivalent";
    report.results[1]!.negative_evidence_assessment = conflictEquivalenceAssessment();
    const claim = makeClaim("claim.contested-effect", {
      support_status: "contested",
      evidence_edge_ids: ["edge.contested-increase", "edge.contested-equivalence"],
    });
    report.claims = [claim];
    report.evidence_edges = [
      makeEvidenceEdge("edge.contested-increase", "evidence.increase", claim.claim_id),
      makeEvidenceEdge("edge.contested-equivalence", "evidence.decrease", claim.claim_id, "contradicts"),
    ];

    const result = validateSelected(report, ["CNF001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "CNF001").status).toBe("pass");
    expect(findingsFor(result, "CNF001")).toEqual([]);
  });
});

describe("revision propagation", () => {
  it("raises REV001 when retracted support leaves downstream evidence and claim active", () => {
    const result = validateSelected(revisionPropagationReport(false), ["REV001"]);
    const findings = findingsFor(result, "REV001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REV001").status).toBe("fail");
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "REV001",
          instancePointer: "/evidence_items/0/evidence_status",
          affectedObjectIds: expect.arrayContaining(["revision.source-correction", "evidence.withdrawn"]),
        }),
        expect.objectContaining({
          ruleId: "REV001",
          instancePointer: "/claims/0/support_status",
          affectedObjectIds: expect.arrayContaining([
            "revision.source-correction",
            "claim.withdrawn-support",
            "evidence.withdrawn",
          ]),
        }),
      ]),
    );
    expect(findings.some((finding) => finding.message.includes("Revision impact list omits downstream evidence"))).toBe(true);
    expect(findings.some((finding) => finding.message.includes("omits a downstream dependent claim"))).toBe(true);
  });

  it("accepts a propagated review_required transition linked to the revision event", () => {
    const report = revisionPropagationReport(true);
    const result = validateSelected(report, ["REV001"]);

    expect(evaluationFor(result, "REV001").status).toBe("pass");
    expect(findingsFor(result, "REV001")).toEqual([]);
    expect(report.evidence_items[0]!.evidence_status).toBe("review_required");
    expect(report.claims[0]).toMatchObject({
      support_status: "review_required",
      revision_event_ids: ["revision.source-correction"],
    });
    expect(report.revision_events[0]!.review_required_object_ids).toEqual([
      "evidence.withdrawn",
      "claim.withdrawn-support",
    ]);
  });

  it("[SCI-004] reopens a resolved question and invalidates its derived answer when the sole support is retracted", () => {
    const report = revisionPropagationReport(false);
    attachResolutionAssessment(report, ["claim.withdrawn-support"]);

    const result = validateSelected(report, ["REV001"]);
    const findings = findingsFor(result, "REV001");

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REV001").status).toBe("fail");
    const questionFinding = findings.find((finding) => finding.instancePointer === "/research_questions/0/resolution_status");
    expect(questionFinding).toBeDefined();
    expect((questionFinding!.details as { gaps: string[] }).gaps).toEqual(expect.arrayContaining([
      "question remains resolved after losing every criterion-satisfying support path",
      "derived qualified answer remains known after its sole support path was withdrawn",
      "criterion assessment remains satisfied after every satisfying claim was affected",
    ]));
  });

  it("accepts reopening when the question, criterion assessment, and bounded answer all propagate the retraction", () => {
    const report = revisionPropagationReport(true);
    attachResolutionAssessment(report, ["claim.withdrawn-support"], "not_satisfied", ["revision.source-correction"]);
    report.revision_events[0]!.review_required_object_ids.push("question.fixture");

    const result = validateSelected(report, ["REV001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REV001").status).toBe("pass");
    expect(findingsFor(result, "REV001")).toEqual([]);
    expect(report.research_questions[0]).toMatchObject({
      resolution_status: "unresolved",
      qualified_answer: expect.objectContaining({ state: "unknown" }),
    });
  });

  it("keeps a question resolved only after an independent remaining support path is criterion-assessed and exact-version revalidated", () => {
    const report = revisionPropagationReport(true);
    const independentEvidence = makeEvidence("evidence.independent", {
      evidence_status: "active",
      summary: "Independent evidence that does not depend on the retracted result.",
    });
    const independentClaim = makeClaim("claim.independent-support", {
      support_status: "supported",
      evidence_edge_ids: ["edge.independent-support"],
    });
    report.evidence_items.push(independentEvidence);
    report.evidence_edges.push(makeEvidenceEdge(
      "edge.independent-support",
      independentEvidence.evidence_item_id,
      independentClaim.claim_id,
    ));
    report.claims.push(independentClaim);
    attachResolutionAssessment(
      report,
      ["claim.withdrawn-support", independentClaim.claim_id],
      "satisfied",
      ["revision.source-correction"],
    );
    const assessment = ((report.research_questions[0] as unknown as UnknownRecord).resolution_criterion_assessments as UnknownRecord[])[0]!;
    assessment.satisfying_claim_ids = [independentClaim.claim_id];
    (report.revision_events[0] as unknown as UnknownRecord).revalidated_object_refs = [
      {
        object_type: "research_question",
        object_id: "question.fixture",
        object_version: report.research_questions[0]!.research_question_version,
      },
    ];

    const result = validateSelected(report, ["REV001"]);

    expect(result.schemaValid).toBe(true);
    expect(evaluationFor(result, "REV001").status).toBe("pass");
    expect(findingsFor(result, "REV001")).toEqual([]);
    expect(report.research_questions[0]!.resolution_status).toBe("resolved");
  });
});
