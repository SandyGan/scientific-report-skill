import type { ScientificReport } from "../../src/lib/types.js";
import { baseReport, known, sourceBinding, unknown } from "./base-report.js";
import {
  makeCampaign,
  makeClaim,
  makeConflictSet,
  makeDecision,
  makeEntity,
  makeEvidence,
  makeEvidenceEdge,
  makeInterval,
  makeResult,
  makeWorkUnit,
} from "./record-builders.js";

export function unsupportedScientificClaimReport(): ScientificReport {
  const report = baseReport();
  const evidence = makeEvidence("evidence.invalidated", {
    evidence_status: "invalidated",
    summary: "An invalidated source statement that cannot support an active claim.",
  });
  const claim = makeClaim("claim.unsupported", {
    claim_type: "comparative",
    proposition: "The intervention improves the endpoint under the fixture conditions.",
    support_status: "supported",
    evidence_edge_ids: ["edge.invalidated-support"],
    argument_step_ids: [],
  });
  report.evidence_items = [evidence];
  report.evidence_edges = [
    makeEvidenceEdge("edge.invalidated-support", evidence.evidence_item_id, claim.claim_id),
  ];
  report.claims = [claim];
  return report;
}

export function claimDependencyReport(cyclic: boolean): ScientificReport {
  const report = baseReport();
  const claimA = makeClaim("claim.a", {
    claim_type: "background",
    proposition: "Background premise A.",
    support_status: "unknown",
    dependency_edge_ids: ["dependency.a-to-b"],
  });
  const claimB = makeClaim("claim.b", {
    claim_type: "background",
    proposition: "Background premise B.",
    support_status: "unknown",
    dependency_edge_ids: cyclic ? ["dependency.b-to-a"] : [],
  });
  report.claims = [claimA, claimB];
  report.claim_dependencies = [
    {
      claim_dependency_id: "dependency.a-to-b",
      dependency_version: "1.0.0",
      upstream_claim_id: claimA.claim_id,
      upstream_claim_version: claimA.object_version,
      downstream_claim_id: claimB.claim_id,
      downstream_claim_version: claimB.object_version,
      dependency_kind: "logical_prerequisite",
      propagation_policy: "require_review",
      dependency_status: "active",
      source_bindings: [sourceBinding()],
    },
    ...(cyclic
      ? [
          {
            claim_dependency_id: "dependency.b-to-a",
            dependency_version: "1.0.0",
            upstream_claim_id: claimB.claim_id,
            upstream_claim_version: claimB.object_version,
            downstream_claim_id: claimA.claim_id,
            downstream_claim_version: claimA.object_version,
            dependency_kind: "logical_prerequisite" as const,
            propagation_policy: "require_review" as const,
            dependency_status: "active" as const,
            source_bindings: [sourceBinding()],
          },
        ]
      : []),
  ];
  return report;
}

export function crossDomainBridgeReport(valid: boolean): ScientificReport {
  const report = baseReport();
  const simulationEntity = makeEntity("entity.simulation-construct", {
    entity_kind: "simulation_construct",
    label: known("Simulated construct version 3"),
  });
  const assayEntity = makeEntity("entity.assay-construct", {
    entity_kind: "assay_construct",
    label: known("Assayed construct version 3"),
  });
  const evidence = makeEvidence("evidence.bridge", {
    evidence_kind: "source_statement",
    summary: "Domain-specific evidence linked by an explicit cross-domain mapping.",
  });
  const claim = makeClaim("claim.cross-domain-mechanism", {
    claim_type: "mechanistic",
    proposition: "The simulated structural change explains the assayed response under aligned conditions.",
    subject_bindings: [
      { object_type: "entity", object_id: simulationEntity.entity_id, object_version: simulationEntity.entity_version },
      { object_type: "entity", object_id: assayEntity.entity_id, object_version: assayEntity.entity_version },
    ],
    evidence_edge_ids: ["edge.bridge-support"],
    argument_step_ids: ["argument.bridge-enabled"],
    cross_domain_bridge_ids: ["bridge.simulation-to-assay"],
  });
  const evidenceEdge = makeEvidenceEdge("edge.bridge-support", evidence.evidence_item_id, claim.claim_id);

  report.entities = [simulationEntity, assayEntity];
  report.evidence_items = [evidence];
  report.evidence_edges = [evidenceEdge];
  report.claims = [claim];
  report.argument_steps = [
    {
      argument_step_id: "argument.bridge-enabled",
      object_version: "1.0.0",
      rule_or_rationale: known("A mapped structural observable may support the bounded assay mechanism only when identity, construct, condition, and scale align."),
      premise_edge_ids: ["argument-edge.bridge-premise"],
      conclusion_edge_ids: ["argument-edge.bridge-conclusion"],
      assumption_states: known(["The declared mapping remains valid for the registered entity versions."]),
      alternative_explanations: known(["A correlated assay factor could account for the response."]),
      validity_status: valid ? "valid_for_scope" : "review_required",
      bridge_ids: ["bridge.simulation-to-assay"],
      source_bindings: [sourceBinding()],
      extensions: {},
    },
  ];
  report.argument_edges = [
    {
      argument_edge_id: "argument-edge.bridge-premise",
      source_type: "evidence_item",
      source_id: evidence.evidence_item_id,
      target_type: "argument_step",
      target_id: "argument.bridge-enabled",
    },
    {
      argument_edge_id: "argument-edge.bridge-conclusion",
      source_type: "argument_step",
      source_id: "argument.bridge-enabled",
      target_type: "claim",
      target_id: claim.claim_id,
    },
  ];
  report.cross_domain_bridges = [
    {
      bridge_id: "bridge.simulation-to-assay",
      object_version: "1.0.0",
      source_domain: "molecular_dynamics",
      target_domain: "wet_lab",
      source_entity_version_ids: [
        { object_type: "entity", object_id: simulationEntity.entity_id, object_version: simulationEntity.entity_version },
      ],
      target_entity_version_ids: [
        { object_type: "entity", object_id: assayEntity.entity_id, object_version: assayEntity.entity_version },
      ],
      mapping_type: "computational_to_experimental_observable",
      identity_alignment: "matched",
      construct_alignment: valid ? "matched" : "mismatched",
      condition_alignment: "matched",
      scale_alignment: valid ? "matched" : "unknown",
      transformation_or_mapping_evidence: valid
        ? known("The registered mapping record aligns construct version, assay condition, and observation scale.")
        : unknown<string>("No validated mapping reconciles the construct mismatch and missing scale alignment."),
      assumptions: known(["The structural observable is comparable to the registered assay readout."]),
      limitations: valid
        ? known(["The bridge applies only to the registered construct and assay condition."])
        : known(["The construct mismatch prevents the proposed transfer."]),
      validity_status: valid ? "valid" : "invalid",
      reviewer_state: valid ? "reviewed" : "review_required",
      enabled_argument_step_ids: ["argument.bridge-enabled"],
      source_bindings: [sourceBinding()],
      extensions: {},
    },
  ];
  return report;
}

export function negativeResultReport(qualifiedForCounterevidence: boolean): ScientificReport {
  const report = baseReport();
  const campaign = makeCampaign("campaign.negative", "this_project", "attempted", {
    work_unit_ids: ["work.negative"],
  });
  const unit = makeWorkUnit("work.negative", campaign.campaign_id, "this_project", "attempted", {
    output_object_ids: ["result.negative"],
  });
  const assessment = qualifiedForCounterevidence
    ? {
        control_status: "valid" as const,
        quality_control_status: "passed" as const,
        sensitivity_status: "adequate" as const,
        detection_limit: known(0.2),
        minimum_detectable_effect: known(0.5),
        equivalence_bounds: null,
        observed_interval: makeInterval(-0.2, 0.3),
        eligible_for_biological_counterevidence: true,
        eligibility_reason: "Controls and QC passed, sensitivity was adequate, and the observed interval excludes the prespecified meaningful effect.",
      }
    : {
        control_status: "failed" as const,
        quality_control_status: "partial" as const,
        sensitivity_status: "not_established" as const,
        detection_limit: unknown<number>("The detection limit was not established."),
        minimum_detectable_effect: unknown<number>("No minimum detectable effect was recorded."),
        equivalence_bounds: null,
        observed_interval: null,
        eligible_for_biological_counterevidence: false,
        eligibility_reason: "The failed control and missing sensitivity evidence prevent a biological absence claim.",
      };
  const result = makeResult("result.negative", unit.work_unit_id, {
    statement: "No statistically detectable endpoint difference was observed.",
    scientific_effect_class: "no_detectable_effect",
    statistical_decision: "do_not_reject_null",
    interpretability_status: qualifiedForCounterevidence ? "interpretable" : "qualified",
    negative_evidence_assessment: assessment,
  });
  const evidence = makeEvidence("evidence.negative", {
    evidence_kind: "result",
    summary: "The registered null-result record.",
    result_ids: [result.result_id],
  });
  const claim = makeClaim("claim.biological-absence", {
    claim_type: "negative_or_absence",
    proposition: "The intervention has no biologically meaningful effect under the tested conditions.",
    evidence_edge_ids: ["edge.negative-support"],
  });

  report.campaigns = [campaign];
  report.work_units = [unit];
  report.results = [result];
  report.evidence_items = [evidence];
  report.evidence_edges = [makeEvidenceEdge("edge.negative-support", evidence.evidence_item_id, claim.claim_id)];
  report.claims = [claim];
  return report;
}

export type ConflictFixtureMode = "unregistered_true_conflict" | "registered_true_conflict" | "retained_heterogeneity";

export function conflictClassificationReport(mode: ConflictFixtureMode): ScientificReport {
  const report = baseReport();
  const heterogeneous = mode === "retained_heterogeneity";
  if (heterogeneous) {
    report.campaigns = [
      makeCampaign("campaign.early", "this_project", "attempted", { work_unit_ids: ["work.early"] }),
      makeCampaign("campaign.late", "this_project", "attempted", { work_unit_ids: ["work.late"] }),
    ];
    report.work_units = [
      makeWorkUnit("work.early", "campaign.early", "this_project", "attempted"),
      makeWorkUnit("work.late", "campaign.late", "this_project", "attempted"),
    ];
  } else {
    report.campaigns = [
      makeCampaign("campaign.same-context", "this_project", "attempted", {
        work_unit_ids: ["work.same-context"],
      }),
    ];
    report.work_units = [
      makeWorkUnit("work.same-context", "campaign.same-context", "this_project", "attempted"),
    ];
  }
  const firstWorkId = heterogeneous ? "work.early" : "work.same-context";
  const secondWorkId = heterogeneous ? "work.late" : "work.same-context";
  report.results = [
    makeResult("result.increase", firstWorkId, {
      statement: heterogeneous ? "The endpoint increased at 5 minutes." : "The endpoint increased in the primary analysis.",
      scientific_effect_class: "increase",
      statistical_decision: "reject_null",
      time_or_frame_scope: known(heterogeneous ? "5 minutes" : "Primary analysis interval"),
    }),
    makeResult("result.decrease", secondWorkId, {
      statement: heterogeneous ? "The endpoint decreased at 24 hours." : "The endpoint decreased in the same primary analysis.",
      scientific_effect_class: "decrease",
      statistical_decision: "reject_null",
      time_or_frame_scope: known(heterogeneous ? "24 hours" : "Primary analysis interval"),
    }),
  ];
  const increaseEvidence = makeEvidence("evidence.increase", { evidence_kind: "result", result_ids: ["result.increase"] });
  const decreaseEvidence = makeEvidence("evidence.decrease", { evidence_kind: "result", result_ids: ["result.decrease"] });
  report.evidence_items = [increaseEvidence, decreaseEvidence];
  if (mode !== "unregistered_true_conflict") {
    const conflictId = heterogeneous ? "conflict.heterogeneous-timepoints" : "conflict.same-context";
    const memberIds = ["conflict-member.increase", "conflict-member.decrease"];
    report.conflict_member_edges = [
      { conflict_member_edge_id: memberIds[0]!, conflict_set_id: conflictId, member_type: "evidence_item", member_id: increaseEvidence.evidence_item_id },
      { conflict_member_edge_id: memberIds[1]!, conflict_set_id: conflictId, member_type: "evidence_item", member_id: decreaseEvidence.evidence_item_id },
    ];
    report.conflict_sets = [
      makeConflictSet(
        conflictId,
        heterogeneous ? "retained_as_heterogeneity" : "unresolved",
        {
          matched_context: heterogeneous
            ? known("The estimand is shared, but the time points differ and are intentionally retained as heterogeneity.")
            : known("The estimand, population, condition, and analysis interval are matched."),
          member_edge_ids: memberIds,
          incompatibility_statement: heterogeneous
            ? "The directions differ across distinct time points and must not be collapsed into one value."
            : "The two active results have opposite directions for the same estimand and matched context.",
          ...(heterogeneous
            ? {
                heterogeneity_context_differences: [
                  {
                    dimension: "time_or_frame_scope" as const,
                    left_result_id: "result.increase",
                    right_result_id: "result.decrease",
                    left_value: known("5 minutes"),
                    right_value: known("24 hours"),
                    materiality_assessment: known("The source-bound 5-minute and 24-hour intervals represent materially different biological response contexts."),
                    source_bindings: [sourceBinding()],
                  },
                ],
              }
            : {}),
        },
      ),
    ];
    report.results[0]!.conflict_set_ids = [conflictId];
    report.results[1]!.conflict_set_ids = [conflictId];
  }
  return report;
}

export function revisionPropagationReport(propagated: boolean): ScientificReport {
  const report = baseReport();
  const campaign = makeCampaign("campaign.revision", "this_project", "attempted", {
    work_unit_ids: ["work.revision"],
  });
  const unit = makeWorkUnit("work.revision", campaign.campaign_id, "this_project", "attempted", {
    output_object_ids: ["result.withdrawn"],
  });
  const result = makeResult("result.withdrawn", unit.work_unit_id, {
    statement: "The upstream estimate was withdrawn after a source correction.",
    record_disposition: "retracted",
    disposition_reason: known("A registered correction invalidated the input record."),
    decision_event_ids: ["decision.withdraw-result"],
  });
  const evidence = makeEvidence("evidence.withdrawn", {
    evidence_kind: "result",
    summary: "Evidence derived from the subsequently withdrawn result.",
    result_ids: [result.result_id],
    evidence_status: propagated ? "review_required" : "active",
  });
  const revisionId = "revision.source-correction";
  const claim = makeClaim("claim.withdrawn-support", {
    proposition: "The withdrawn result supports the reported endpoint direction.",
    evidence_edge_ids: ["edge.withdrawn-support"],
    support_status: propagated ? "review_required" : "supported",
    revision_event_ids: propagated ? [revisionId] : [],
  });

  report.campaigns = [campaign];
  report.work_units = [unit];
  report.decision_events = [
    makeDecision("decision.withdraw-result", [result.result_id], {
      decision_kind: "other",
      description: "Withdraw the result after the upstream source correction.",
      timing_class: "post_hoc",
    }),
  ];
  report.results = [result];
  report.evidence_items = [evidence];
  report.evidence_edges = [makeEvidenceEdge("edge.withdrawn-support", evidence.evidence_item_id, claim.claim_id)];
  report.claims = [claim];
  report.revision_events = [
    {
      revision_event_id: revisionId,
      revision_event_version: "1.0.0",
      event_kind: "retraction",
      occurred_at: known("2026-08-23T00:00:00.000Z"),
      reason: "A corrected upstream source invalidated the reported result.",
      superseded_object_refs: [
        {
          object_type: "result",
          object_id: result.result_id,
          object_version: result.result_version,
        },
      ],
      replacement_object_refs: [],
      invalidated_object_ids: [result.result_id],
      review_required_object_ids: propagated ? [evidence.evidence_item_id, claim.claim_id] : [],
      impact_statement: propagated
        ? "Downstream evidence and claims require review before reuse."
        : "The result was withdrawn, but downstream impact was not recorded.",
      source_bindings: [sourceBinding()],
      extensions: {},
    },
  ];
  return report;
}
