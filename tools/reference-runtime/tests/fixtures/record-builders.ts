import type {
  Artifact,
  Attempt,
  AttemptOutcome,
  Campaign,
  Claim,
  ConflictSet,
  DecisionEvent,
  Entity,
  EvidenceEdge,
  EvidenceItem,
  ExecutionScope,
  FailureEvent,
  Material,
  NumericInterval,
  Result,
  ScientificReport,
  WorkState,
  WorkUnit,
} from "../../src/lib/types.js";
import { FIXTURE_NOW, known, notApplicable, sourceBinding, sourceHash, unknown } from "./base-report.js";

export function makeCampaign(
  campaignId: string,
  executionScope: ExecutionScope = "this_project",
  workState: WorkState = "attempted",
  overrides: Partial<Campaign> = {},
): Campaign {
  return {
    campaign_id: campaignId,
    campaign_version: "1.0.0",
    title: `Campaign ${campaignId}`,
    objective: known(`Preserve the execution ledger for ${campaignId}.`),
    work_state: workState,
    execution_scope: executionScope,
    work_unit_ids: [],
    source_bindings: [sourceBinding()],
    extensions: {},
    ...overrides,
  };
}

export function makeWorkUnit(
  workUnitId: string,
  campaignId: string,
  executionScope: ExecutionScope = "this_project",
  workState: WorkState = "attempted",
  overrides: Partial<WorkUnit> = {},
): WorkUnit {
  const completed = workState === "completed";
  return {
    work_unit_id: workUnitId,
    work_unit_version: "1.0.0",
    campaign_id: campaignId,
    title: `Work unit ${workUnitId}`,
    objective: known(`Execute the bounded task ${workUnitId}.`),
    work_state: workState,
    execution_scope: executionScope,
    completion_criterion_timing: completed ? "predefined" : "missing",
    completion_criteria: completed
      ? known(`A successful attempt and its declared output exist for ${workUnitId}.`)
      : unknown<string>("Completion criteria were not recorded for this attempted work."),
    completion_assessment: completed
      ? known("The predefined completion criterion was met by the linked attempt and output evidence.")
      : unknown<string>("Completion has not been established."),
    completion_evidence: completed
      ? [sourceBinding(undefined, "completion_evidence"), sourceBinding(undefined, "decision_timing")]
      : [],
    attempt_ids: [],
    method_ids: [],
    decision_event_ids: [],
    input_entity_ids: [],
    output_object_ids: [],
    source_bindings: [sourceBinding()],
    extensions: {},
    ...overrides,
  };
}

export function makeAttempt(
  attemptId: string,
  workUnitId: string,
  attemptOrdinal: number,
  attemptOutcome: AttemptOutcome,
  executionScope: ExecutionScope = "this_project",
  overrides: Partial<Attempt> = {},
): Attempt {
  const ongoing = attemptOutcome === "running_at_cutoff";
  return {
    attempt_id: attemptId,
    attempt_version: "1.0.0",
    work_unit_id: workUnitId,
    attempt_ordinal: attemptOrdinal,
    execution_scope: executionScope,
    attempt_outcome: attemptOutcome,
    started_at: known("2026-08-10T00:00:00.000Z"),
    ended_at: ongoing
      ? unknown<string>("The attempt was running at the report cutoff.")
      : known("2026-08-12T00:00:00.000Z"),
    method_ids: [],
    parameter_set: [],
    input_material_ids: [],
    input_artifact_ids: [],
    segment_ids: [],
    result_ids: [],
    failure_event_ids: [],
    output_artifact_ids: [],
    usable_output_status: attemptOutcome === "succeeded"
      ? "usable"
      : attemptOutcome === "partially_succeeded"
        ? "usable_with_qualification"
        : "not_usable",
    superseded_by_attempt_id: null,
    source_bindings: [sourceBinding()],
    extensions: {},
    ...overrides,
  };
}

export function makeFailure(
  failureEventId: string,
  workUnitId: string,
  attemptId: string,
  overrides: Partial<FailureEvent> = {},
): FailureEvent {
  return {
    failure_event_id: failureEventId,
    failure_event_version: "1.0.0",
    failure_class: "software",
    severity: "recoverable",
    description: "The attempt terminated before producing its planned final output.",
    onset_or_detection: known("2026-08-11T00:00:00.000Z"),
    affected_object_id: attemptId,
    work_unit_id: workUnitId,
    attempt_id: attemptId,
    segment_id: null,
    related_object_ids: [attemptId],
    partial_result_ids: [],
    impact: "The failed attempt cannot be counted as completed work.",
    resolution_status: "resolved_for_future_attempts",
    recovery_attempt_ids: [],
    evidence_bindings: [sourceBinding()],
    extensions: {},
    ...overrides,
  };
}

export function makeDecision(
  decisionEventId: string,
  affectedObjectIds: string[],
  overrides: Partial<DecisionEvent> = {},
): DecisionEvent {
  return {
    decision_event_id: decisionEventId,
    decision_event_version: "1.0.0",
    decision_kind: "metric_or_endpoint_selection",
    description: "Select the primary endpoint before execution begins.",
    timing_class: "predefined",
    decided_at: known("2026-08-09T00:00:00.000Z"),
    decision_maker: known("Fixture study team"),
    triggering_object_ids: [],
    affected_object_ids: affectedObjectIds,
    rationale: known("The endpoint follows the prespecified scientific question."),
    alternatives_considered: known(["Secondary endpoint"]),
    source_bindings: [sourceBinding(undefined, "decision_timing")],
    extensions: {},
    ...overrides,
  };
}

export function makeEntity(entityId: string, overrides: Partial<Entity> = {}): Entity {
  return {
    entity_id: entityId,
    entity_version: "1.0.0",
    entity_kind: "biological_source",
    label: known(`Entity ${entityId}`),
    identifiers: [],
    identity_status: "verified",
    source_bindings: [sourceBinding()],
    extensions: {},
    ...overrides,
  };
}

export function makeMaterial(
  materialId: string,
  entityId: string,
  overrides: Partial<Material> = {},
): Material {
  return {
    material_id: materialId,
    material_version: "1.0.0",
    entity_id: entityId,
    material_kind: "sample",
    label: known(`Material ${materialId}`),
    batch_or_lot: unknown<string>("No batch or lot was recorded."),
    quantity: unknown<number>("The source record does not quantify this material."),
    unit: notApplicable<string>("No quantity is available, so a unit does not apply."),
    material_status: "consumed",
    disclosure_class: "internal",
    source_bindings: [sourceBinding()],
    extensions: {},
    ...overrides,
  };
}

export function makeArtifact(
  artifactId: string,
  artifactRole: Artifact["artifact_role"] = "result_output",
  overrides: Partial<Artifact> = {},
): Artifact {
  return {
    artifact_id: artifactId,
    artifact_version: "1.0.0",
    artifact_role: artifactRole,
    media_type: known("application/json"),
    location: known(`artifacts/${artifactId}.json`),
    content_hash: known(sourceHash(`artifact:${artifactId}`)),
    byte_size: known(128),
    access_state: "open",
    disclosure_class: "internal",
    created_at: known(FIXTURE_NOW),
    source_item_ids: [],
    derivation_ids: [],
    analysis_run_ids: [],
    supersedes_artifact_ids: [],
    extensions: {},
    ...overrides,
  };
}

export function makeResult(
  resultId: string,
  workUnitId: string,
  overrides: Partial<Result> = {},
): Result {
  return {
    result_id: resultId,
    result_version: "1.0.0",
    result_kind: "comparison",
    statement: `Bounded result ${resultId}.`,
    work_unit_id: workUnitId,
    attempt_id: null,
    segment_id: null,
    analysis_population_id: null,
    estimand: known("Difference in the prespecified endpoint"),
    population_or_system: known("The bounded fixture population"),
    condition: known("The registered fixture condition"),
    time_or_frame_scope: known("The prespecified fixture observation interval"),
    unit: notApplicable<string>("The default fixture result is not a numeric estimate."),
    effect_estimate: null,
    derivation_closure_status: "not_applicable",
    scientific_effect_class: "not_estimated",
    statistical_decision: "not_performed",
    interpretability_status: "interpretable",
    record_disposition: "primary",
    disposition_reason: notApplicable<string>("Primary results do not require an exclusion reason."),
    qualification_ids: [],
    blocker_ids: [],
    negative_evidence_assessment: null,
    data_slice_ids: [],
    derivation_ids: [],
    analysis_run_ids: [],
    output_artifact_ids: [],
    decision_event_ids: [],
    conflict_set_ids: [],
    source_bindings: [sourceBinding()],
    extensions: {},
    ...overrides,
  };
}

export function makeEvidence(
  evidenceItemId: string,
  overrides: Partial<EvidenceItem> = {},
): EvidenceItem {
  return {
    evidence_item_id: evidenceItemId,
    evidence_item_version: "1.0.0",
    evidence_kind: "source_statement",
    summary: `Bounded evidence ${evidenceItemId}.`,
    result_ids: [],
    artifact_ids: [],
    data_slice_ids: [],
    derivation_ids: [],
    analysis_run_ids: [],
    source_item_ids: ["source.base"],
    evidence_status: "active",
    quality_assessment: "moderate",
    dependency_group_ids: [],
    source_bindings: [sourceBinding()],
    extensions: {},
    ...overrides,
  };
}

export function makeEvidenceEdge(
  edgeId: string,
  evidenceItemId: string,
  claimId: string,
  relationship: EvidenceEdge["relationship"] = "supports",
  dependencyGroupId: string | null = null,
  overrides: Partial<EvidenceEdge> = {},
): EvidenceEdge {
  return {
    evidence_edge_id: edgeId,
    evidence_item_id: evidenceItemId,
    claim_id: claimId,
    relationship,
    dependency_group_id: dependencyGroupId,
    weighting_note: known("Count this evidence once within its declared dependency group."),
    source_bindings: [sourceBinding()],
    ...overrides,
  };
}

export function makeClaim(
  claimId: string,
  overrides: Partial<Claim> = {},
): Claim {
  return {
    claim_id: claimId,
    object_version: "1.0.0",
    proposition: `Bounded scientific claim ${claimId}.`,
    claim_type: "descriptive",
    subject_bindings: [
      { object_type: "research_question", object_id: "question.fixture", object_version: "1.0.0" },
    ],
    context: known("The registered fixture context."),
    scope: known("The claim applies only to the registered fixture conditions."),
    decision_timing: "predefined",
    support_status: "supported",
    evidence_edge_ids: [],
    dependency_edge_ids: [],
    counterevidence_edge_ids: [],
    argument_step_ids: [],
    cross_domain_bridge_ids: [],
    conflict_set_ids: [],
    limitation_ids: [],
    revision_event_ids: [],
    source_bindings: [sourceBinding()],
    extensions: {},
    ...overrides,
  };
}

export function makeInterval(lower: number, upper: number, level = 0.95): NumericInterval {
  return {
    lower: known(lower),
    upper: known(upper),
    level: known(level),
    interval_kind: "confidence",
    unit: known("relative units"),
  };
}

export function makeConflictSet(
  conflictSetId: string,
  adjudicationStatus: ConflictSet["adjudication_status"] = "unresolved",
  overrides: Partial<ConflictSet> = {},
): ConflictSet {
  return {
    conflict_set_id: conflictSetId,
    object_version: "1.0.0",
    matched_context: known("The members address the same estimand under matched fixture conditions."),
    member_edge_ids: [],
    incompatibility_statement: "The registered members assert materially incompatible values.",
    adjudication_status: adjudicationStatus,
    decision_event_id: null,
    downstream_claim_ids: [],
    source_bindings: [sourceBinding()],
    extensions: {},
    ...overrides,
  };
}

export function addEvidenceSupport(
  report: ScientificReport,
  claim: Claim,
  evidence: EvidenceItem,
  relationship: EvidenceEdge["relationship"] = "supports",
  dependencyGroupId: string | null = null,
): EvidenceEdge {
  const edge = makeEvidenceEdge(
    `edge.${claim.claim_id}.${evidence.evidence_item_id}.${relationship}`,
    evidence.evidence_item_id,
    claim.claim_id,
    relationship,
    dependencyGroupId,
  );
  report.evidence_edges.push(edge);
  if (relationship === "contradicts") claim.counterevidence_edge_ids.push(edge.evidence_edge_id);
  else claim.evidence_edge_ids.push(edge.evidence_edge_id);
  return edge;
}
