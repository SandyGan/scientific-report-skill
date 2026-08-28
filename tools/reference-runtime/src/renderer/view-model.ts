import { stableStringify } from "./canonical-json.js";
import type { ValidationBinding } from "./safety.js";
import type { JsonObject, JsonValue } from "./types.js";
import {
  NOT_RECORDED,
  arrayAt,
  asObject,
  compareIdentifiers,
  displayDateField,
  displayField,
  explicitDomain,
  firstIdentifier,
  firstSourceId,
  identifierList,
  joinIdentifiers,
  labelize,
  numberAt,
  objectArrayAt,
  objectAt,
  optionalStringAt,
  projectField,
  sourceLocator,
  stateOfField,
  stringAt,
} from "./view-helpers.js";

export type ViewObject = Record<string, unknown>;

interface ReportIndexes {
  argumentSteps: Map<string, JsonObject>;
  attempts: Map<string, JsonObject>;
  bridges: Map<string, JsonObject>;
  claims: Map<string, JsonObject>;
  conflicts: Map<string, JsonObject>;
  decisions: Map<string, JsonObject>;
  dependencies: Map<string, JsonObject>;
  evidence: Map<string, JsonObject>;
  evidenceEdges: Map<string, JsonObject>;
  failures: Map<string, JsonObject>;
  limitations: Map<string, JsonObject>;
  segments: Map<string, JsonObject>;
}

export function buildReportViewModel(
  report: JsonObject,
  payloadHash: string,
  validation: ValidationBinding,
  generationAudit: JsonObject | null = null,
): ViewObject {
  const indexes = buildIndexes(report);
  const coverage = buildCoverageModel(report);
  const sourceCoverage = buildSourceCoverageModel(report);
  const researchQuestions = objectArrayAt(report, "research_questions").map((question) => mapResearchQuestion(question, indexes));
  const claims = objectArrayAt(report, "claims").map((claim) => mapClaim(claim, indexes));
  const workUnits = objectArrayAt(report, "work_units").map((workUnit) => mapWorkUnit(workUnit, indexes));
  const results = objectArrayAt(report, "results").map((result) => mapResult(result, indexes));
  const failures = objectArrayAt(report, "failures").map((failure) => mapFailure(failure));
  const methods = objectArrayAt(report, "methods").map((method) => mapMethod(method, report));
  const reproducibilityUnits = objectArrayAt(report, "reproducibility_units").map((unit) => mapReproducibilityUnit(unit, indexes));
  const artifacts = objectArrayAt(report, "artifacts").map(mapArtifact);
  const sources = objectArrayAt(objectAt(report, "source_coverage"), "items").map(mapSource);
  const limitations = objectArrayAt(report, "limitations").map(mapLimitation);
  const overview = buildOverview(report, indexes, sourceCoverage);
  const evidenceItems = objectArrayAt(report, "evidence_items").map((evidence) => mapAnnexEvidence(evidence, report));
  const entities = objectArrayAt(report, "entities").map(mapEntity);
  const revisions = objectArrayAt(report, "revision_events").map(mapRevision);

  const view: ViewObject = {
    report_id: stringAt(report, "report_id"),
    report_version: stringAt(report, "report_version"),
    project_id: stringAt(report, "project_id"),
    schema_version: stringAt(report, "schema_version"),
    title: stringAt(report, "title", "Untitled scientific report"),
    language: stringAt(report, "language", "en"),
    report_mode: stringAt(report, "report_mode"),
    payload_hash: payloadHash,
    cutoff: {
      display_text: displayDateField(report.cutoff),
      state: stateOfField(report.cutoff),
    },
    disclosure_state: displayDisclosureState(objectAt(report, "disclosure_state")),
    validation: {
      status: validation.status,
      payload_hash: validation.payloadHashDisplay,
      binding_status: validation.bound ? "exact_payload_binding" : "not_bound",
      attestation_id: validation.attestation === null ? NOT_RECORDED : stringAt(validation.attestation, "attestation_id"),
    },
    scope: mapScope(objectAt(report, "scope")),
    source_coverage: sourceCoverage,
    section_coverage: coverage.byRole,
    section_coverage_records: coverage.records,
    overview,
    research_questions: researchQuestions,
    claims,
    work_units: workUnits,
    results,
    failures,
    methods,
    sources,
    reproducibility_units: reproducibilityUnits,
    reproducibility_overview: buildReproducibilityOverview(objectArrayAt(report, "reproducibility_units")),
    artifacts,
    artifact_count: artifacts.length,
    evidence_items: evidenceItems,
    entities,
    revision_events: revisions,
    limitations,
    filters: buildFilters(collectConsoleFilterRecords({
      overview,
      research_questions: researchQuestions,
      claims,
      work_units: workUnits,
      results,
      failures,
      methods,
      sources,
      reproducibility_units: reproducibilityUnits,
      artifacts,
    })),
    ai_audit: mapGenerationAudit(generationAudit),
  };
  return view;
}

export function buildCatalogViewModel(report: JsonObject, base: ViewObject): ViewObject {
  const preferredOrder = [
    "report_id", "project_id", "report_version", "schema_version", "payload_role", "title", "language", "report_mode", "created_at",
    "scope", "cutoff", "module_manifest", "section_coverage", "source_coverage", "research_questions", "entities", "campaigns", "work_units",
    "attempts", "segments", "methods", "decision_events", "materials", "material_relationships", "analysis_populations", "data_slices", "derivations",
    "invocations", "environments", "random_states", "analysis_runs", "results", "failures", "evidence_items", "evidence_edges",
    "evidence_dependency_groups", "claims", "argument_steps", "argument_edges", "claim_dependencies",
    "cross_domain_bridges", "conflict_sets", "conflict_member_edges", "artifacts", "reproducibility_units", "limitations", "revision_events", "review_tasks",
    "disclosure_state", "extensions",
  ];
  const rank = new Map(preferredOrder.map((key, index) => [key, index]));
  const sections = Object.keys(report)
    .sort((left, right) => (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right, "en"))
    .map((key) => {
      const value = report[key] as JsonValue;
      const count = Array.isArray(value) ? value.length : null;
      return {
        key,
        label: labelize(key),
        record_count: count,
        value_kind: Array.isArray(value) ? "array" : value === null ? "null" : typeof value,
        json: stableStringify(value, 2),
      };
    });
  return { ...base, catalog_sections: sections };
}

function buildIndexes(report: JsonObject): ReportIndexes {
  return {
    argumentSteps: indexBy(report, "argument_steps", "argument_step_id"),
    attempts: indexBy(report, "attempts", "attempt_id"),
    bridges: indexBy(report, "cross_domain_bridges", "bridge_id"),
    claims: indexBy(report, "claims", "claim_id"),
    conflicts: indexBy(report, "conflict_sets", "conflict_set_id"),
    decisions: indexBy(report, "decision_events", "decision_event_id"),
    dependencies: indexBy(report, "claim_dependencies", "claim_dependency_id"),
    evidence: indexBy(report, "evidence_items", "evidence_item_id"),
    evidenceEdges: indexBy(report, "evidence_edges", "evidence_edge_id"),
    failures: indexBy(report, "failures", "failure_event_id"),
    limitations: indexBy(report, "limitations", "limitation_id"),
    segments: indexBy(report, "segments", "segment_id"),
  };
}

function indexBy(report: JsonObject, collectionKey: string, idKey: string): Map<string, JsonObject> {
  return indexObjects(objectArrayAt(report, collectionKey), idKey);
}

function indexObjects(records: JsonObject[], idKey: string): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (const record of records) {
    const id = record[idKey];
    if (typeof id === "string" && !result.has(id)) result.set(id, record);
  }
  return result;
}

function mapScope(scope: JsonObject | undefined): ViewObject {
  const inclusions = identifierList(scope, "included_boundaries").map((displayText) => ({ display_text: displayText }));
  const exclusions = identifierList(scope, "excluded_boundaries").map((displayText) => ({ display_text: displayText, reason: null }));
  const statement = stringAt(scope, "scope_statement");
  return {
    boundary_statement: statement,
    summary: statement,
    inclusions,
    exclusions,
    started_at: displayDateField(scope?.started_at),
    ended_at: displayDateField(scope?.ended_at),
    cutoff_at: displayDateField(scope?.cutoff_at),
  };
}

function buildCoverageModel(report: JsonObject): { byRole: ViewObject; records: ViewObject[] } {
  const records = objectArrayAt(report, "section_coverage").map((coverage) => ({
    section_id: stringAt(coverage, "section_id"),
    label: labelize(stringAt(coverage, "section_id")),
    applicability: stringAt(coverage, "applicability"),
    state: stringAt(coverage, "coverage_status"),
    reason: displayField(coverage.omission_or_gap_reasons),
    basis: `${joinIdentifiers(identifierList(coverage, "source_universe_ids"))}; ${sourceLocator(coverage.evidence_bindings)}`,
    domain: explicitDomain(coverage),
    safety_relevance: stringAt(coverage, "coverage_status") !== "covered",
  }));

  const canonical = objectArrayAt(report, "section_coverage");
  const role = (aliases: readonly string[]): ViewObject => {
    const match = canonical.find((entry) => {
      const sectionId = optionalStringAt(entry, "section_id");
      return sectionId !== null && aliases.includes(sectionId);
    });
    if (match === undefined) {
      return { state: "unregistered", reason: `No SectionCoverage record matches: ${aliases.join(", ")}.` };
    }
    return { state: stringAt(match, "coverage_status"), reason: displayField(match.omission_or_gap_reasons), applicability: stringAt(match, "applicability") };
  };

  return {
    records,
    byRole: {
      resolution: role(["research_questions_and_resolution"]),
      claims: role(["claims_arguments_and_bridges"]),
      execution: role(["execution_history"]),
      results: role(["results_failures_and_dispositions"]),
      failures: role(["results_failures_and_dispositions"]),
      methods: role(["methods_parameters_and_deviations"]),
      reproducibility: role(["artifacts_and_reproducibility"]),
    },
  };
}

function buildSourceCoverageModel(report: JsonObject): ViewObject {
  const sourceCoverage = objectAt(report, "source_coverage");
  const counts = objectAt(sourceCoverage, "reconciliation");
  const count = (key: string): number | string => numberAt(counts, key) ?? NOT_RECORDED;
  const completeness = stringAt(sourceCoverage, "report_completeness");
  const boundary = `${stringAt(sourceCoverage, "scope_statement")} Inclusion: ${stringAt(sourceCoverage, "inclusion_boundary")} Exclusion: ${stringAt(sourceCoverage, "exclusion_boundary")}`;
  return {
    universe_id: stringAt(sourceCoverage, "universe_id"),
    universe_authority_state: `${stringAt(sourceCoverage, "authority_basis")} · ${stringAt(sourceCoverage, "enumeration_status")}`,
    completeness_state: completeness,
    statement: completenessStatement(completeness, boundary, identifierList(sourceCoverage, "coverage_limitations")),
    boundary_statement: boundary,
    authority_description: displayField(sourceCoverage?.authority_evidence),
    expected_item_count: count("registered"),
    counts: {
      registered: count("registered"),
      included: count("included"),
      excluded_with_reason: count("excluded_with_reason"),
      unreadable: count("unreadable"),
      inaccessible: count("inaccessible"),
      duplicate: count("duplicate"),
      unmapped: count("unmapped"),
      pending: count("pending"),
      disposed: count("terminally_disposed"),
    },
  };
}

function completenessStatement(claim: string, boundary: string, limitations: string[]): string {
  const qualification = limitations.length === 0 ? "" : ` Limitations: ${limitations.join("; ")}`;
  switch (claim) {
    case "proven_within_declared_universe":
      return `The payload proves disposition and scientific incorporation within its authoritative declared source universe. Boundary: ${boundary}.${qualification}`;
    case "registered_sources_accounted_for":
      return `The payload accounts for registered source items only; overall completeness is not established. Boundary: ${boundary}.${qualification}`;
    case "partial":
      return `The payload records partial source coverage. Boundary: ${boundary}.${qualification}`;
    case "cannot_be_established":
      return `The payload records that source completeness cannot be established. Boundary: ${boundary}.${qualification}`;
    default:
      return `Source completeness declaration: ${claim}. Boundary: ${boundary}.${qualification}`;
  }
}

function buildOverview(report: JsonObject, indexes: ReportIndexes, sourceCoverage: ViewObject): ViewObject {
  const questions = objectArrayAt(report, "research_questions");
  const primaryQuestion = questions[0];
  const keyClaimId = primaryQuestion === undefined ? undefined : identifierList(primaryQuestion, "claim_ids")[0];
  const keyClaim = keyClaimId === undefined ? undefined : indexes.claims.get(keyClaimId);
  const counterevidence = objectArrayAt(report, "evidence_items").find((evidence) => evidence.evidence_kind === "counterevidence");
  const blockingReview = objectArrayAt(report, "review_tasks").find((task) => task.severity === "blocking" && task.status === "open");
  const openLimitation = objectArrayAt(report, "limitations").find((limitation) => limitation.resolution_status === "open");
  const blocker = blockingReview ?? openLimitation;
  const projectWorkUnits = objectArrayAt(report, "work_units").filter((unit) => unit.execution_scope === "this_project");
  const attempts = objectArrayAt(report, "attempts");
  const criticalUnits = objectArrayAt(report, "reproducibility_units").filter((unit) => unit.criticality === "critical");
  const replayCovered = criticalUnits.filter((unit) => unit.conservative_level === "R1_replay_ready" || unit.conservative_level === "R2_verified_replay" || unit.conservative_level === "R3_independent_reproduction");
  const answer = projectField(primaryQuestion?.qualified_answer);

  return {
    primary_question: primaryQuestion === undefined
      ? "No research question record is available for the ordered overview; inspect section coverage."
      : `First question in declared order (the canonical contract encodes no ranking or designation): ${stringAt(primaryQuestion, "question")}`,
    qualified_answer: answer.display,
    answer_state: answer.state,
    answer_provenance_status: answer.provenanceStatus,
    answer_missing_reason: answer.missingReason,
    resolution_status: stringAt(primaryQuestion, "resolution_status", "not_evaluable"),
    key_claim: keyClaim === undefined ? {
      claim_id: NOT_RECORDED,
      statement: "No active key claim is selected for this overview; inspect claim coverage.",
      status: "not_selected",
      domain: "general",
    } : {
      claim_id: stringAt(keyClaim, "claim_id"),
      statement: `First claim linked by the first research-question record; no ranking is implied: ${stringAt(keyClaim, "proposition")}`,
      status: stringAt(keyClaim, "support_status"),
      domain: explicitDomain(keyClaim),
    },
    strongest_counterevidence: counterevidence === undefined ? {
      evidence_id: NOT_RECORDED,
      statement: "No counterevidence record is selected for this ordered overview; inspect the full challenge ledger and its coverage state.",
      status: "not_designated",
      domain: "general",
    } : {
      evidence_id: stringAt(counterevidence, "evidence_item_id"),
      statement: `First counterevidence record in declared array order; no strength ranking is implied: ${stringAt(counterevidence, "summary")}`,
      status: stringAt(counterevidence, "evidence_status"),
      domain: explicitDomain(counterevidence),
    },
    primary_blocker: blocker === undefined ? {
      record_id: NOT_RECORDED,
      statement: "No blocker or open-gap record is selected for this ordered overview; inspect review tasks, limitations, conflicts, failures, and coverage states.",
      status: "not_designated",
      domain: "general",
    } : {
      record_id: firstIdentifier(blocker),
      statement: `First recorded ${blockingReview !== undefined ? "blocking review task" : "open limitation"} in the applicable collection; no comparative ranking is implied: ${typeof blocker.description === "string" ? blocker.description : stringAt(blocker, "statement")}`,
      status: stringAt(blocker, "status", stringAt(blocker, "resolution_status")),
      domain: explicitDomain(blocker),
    },
    counts: {
      completed_work_units: projectWorkUnits.filter((unit) => unit.work_state === "completed").length,
      total_work_units: projectWorkUnits.length,
      failed_attempts: attempts.filter((attempt) => attempt.attempt_outcome === "failed" || attempt.attempt_outcome === "aborted" || attempt.attempt_outcome === "cancelled_after_start").length,
      total_attempts: attempts.length,
      replay_covered: replayCovered.length,
      replay_total: criticalUnits.length,
    },
    linked_record_count: indexes.claims.size + indexes.evidence.size,
    source_coverage: sourceCoverage,
  };
}

function mapResearchQuestion(question: JsonObject, indexes: ReportIndexes): ViewObject {
  const claimIds = identifierList(question, "claim_ids");
  const relatedClaims = claimIds.map((id) => indexes.claims.get(id)).filter((value): value is JsonObject => value !== undefined);
  const supportingClaims = relatedClaims.map((claim) => ({
    claim_id: stringAt(claim, "claim_id"),
    statement: `Question-linked claim (the canonical question link does not encode a support role): ${stringAt(claim, "proposition")}`,
    dependency_class: `support status ${stringAt(claim, "support_status")}; dependency class is recorded on explicit dependency edges`,
  }));
  const challenges: ViewObject[] = [];
  for (const claim of relatedClaims) {
    const challengeEdgeIds = [...new Set([
      ...identifierList(claim, "counterevidence_edge_ids"),
      ...identifierList(claim, "evidence_edge_ids").filter((id) => indexes.evidenceEdges.get(id)?.relationship === "qualifies"),
    ])];
    for (const edgeId of challengeEdgeIds) {
      const edge = indexes.evidenceEdges.get(edgeId);
      if (edge === undefined) continue;
      const evidence = indexes.evidence.get(stringAt(edge, "evidence_item_id", ""));
      if (evidence !== undefined) challenges.push({
        record_id: stringAt(evidence, "evidence_item_id"),
        statement: stringAt(evidence, "summary"),
        status: stringAt(evidence, "evidence_status"),
      });
    }
    for (const conflictId of identifierList(claim, "conflict_set_ids")) {
      const conflict = indexes.conflicts.get(conflictId);
      if (conflict !== undefined) challenges.push({ record_id: conflictId, statement: stringAt(conflict, "incompatibility_statement"), status: stringAt(conflict, "adjudication_status") });
    }
  }
  const openItems = identifierList(question, "limitation_ids")
    .map((id) => indexes.limitations.get(id))
    .filter((value): value is JsonObject => value !== undefined)
    .map((limitation) => ({ record_id: stringAt(limitation, "limitation_id"), statement: stringAt(limitation, "statement"), state: stringAt(limitation, "resolution_status") }));
  const answer = projectField(question.qualified_answer);
  return {
    question_id: stringAt(question, "research_question_id"),
    question_text: stringAt(question, "question"),
    qualified_answer: answer.display,
    answer_state: answer.state,
    domain: explicitDomain(question),
    resolution_status: stringAt(question, "resolution_status"),
    criteria_timing: stringAt(question, "resolution_criterion_timing"),
    resolution_criteria: displayField(question.resolution_criteria),
    criteria_assessment: `Recorded resolution status: ${stringAt(question, "resolution_status")}`,
    support_count: supportingClaims.length,
    challenge_count: challenges.length,
    open_gap_count: openItems.filter((item) => item.state === "open" || item.state === "unknown").length,
    supporting_claims: supportingClaims,
    challenges,
    open_items: openItems,
    safety_relevance: stringAt(question, "resolution_status") !== "resolved",
  };
}

function mapClaim(claim: JsonObject, indexes: ReportIndexes): ViewObject {
  const evidence = identifierList(claim, "evidence_edge_ids")
    .map((id) => indexes.evidenceEdges.get(id))
    .filter((value): value is JsonObject => value !== undefined)
    .map((edge) => mapEvidenceLink(edge, indexes));
  const counterevidence = identifierList(claim, "counterevidence_edge_ids")
    .map((id) => indexes.evidenceEdges.get(id))
    .filter((value): value is JsonObject => value !== undefined)
    .map((edge) => mapCounterevidenceLink(edge, indexes));
  const argumentSteps = identifierList(claim, "argument_step_ids").map((id, index) => {
    const step = indexes.argumentSteps.get(id);
    return {
      argument_step_id: id,
      step_index: index + 1,
      statement: step === undefined ? "Referenced argument step is not present in this projection." : displayField(step.rule_or_rationale),
      premise_status: step === undefined ? "missing_reference" : stringAt(step, "validity_status"),
      status: step === undefined ? "missing_reference" : stringAt(step, "validity_status"),
      domain: explicitDomain(step),
    };
  });
  const dependencies = identifierList(claim, "dependency_edge_ids").map((id) => indexes.dependencies.get(id)).filter((value): value is JsonObject => value !== undefined).map((dependency) => ({
    upstream_claim_id: stringAt(dependency, "upstream_claim_id"),
    relationship: stringAt(dependency, "dependency_kind"),
    validity_status: stringAt(dependency, "dependency_status"),
  }));
  const bridges = identifierList(claim, "cross_domain_bridge_ids").map((id) => indexes.bridges.get(id)).filter((value): value is JsonObject => value !== undefined).map(mapBridge);
  const conflicts = identifierList(claim, "conflict_set_ids").map((id) => indexes.conflicts.get(id)).filter((value): value is JsonObject => value !== undefined).map((conflict) => ({
    conflict_id: stringAt(conflict, "conflict_set_id"),
    summary: stringAt(conflict, "incompatibility_statement"),
    status: stringAt(conflict, "adjudication_status"),
    adjudication_status: stringAt(conflict, "adjudication_status"),
    domain: explicitDomain(conflict),
  }));
  const limitations = identifierList(claim, "limitation_ids").map((id) => indexes.limitations.get(id)).filter((value): value is JsonObject => value !== undefined).map((limitation) => ({
    limitation_id: stringAt(limitation, "limitation_id"), statement: stringAt(limitation, "statement"), status: stringAt(limitation, "resolution_status"),
  }));
  const status = stringAt(claim, "support_status");
  const claimType = stringAt(claim, "claim_type");
  return {
    claim_id: stringAt(claim, "claim_id"),
    claim_class: claimType,
    statement: stringAt(claim, "proposition"),
    qualification: status === "qualified" ? `${displayField(claim.context)}; ${displayField(claim.scope)}` : null,
    scope_text: displayField(claim.scope),
    status,
    independence_class: "Dependency is represented by evidence dependency groups and explicit claim dependencies.",
    object_version: stringAt(claim, "object_version"),
    domain: explicitDomain(claim),
    evidence_count: evidence.length,
    counterevidence_count: counterevidence.length,
    dependency_count: dependencies.length,
    evidence,
    counterevidence,
    argument_steps: argumentSteps,
    dependencies,
    bridges,
    conflicts,
    limitations,
    safety_relevance: ["contested", "unsupported", "review_required", "invalidated", "unknown", "withheld"].includes(status) || claimType === "negative_or_absence",
  };
}

function mapEvidenceLink(link: JsonObject, indexes: ReportIndexes): ViewObject {
  const id = stringAt(link, "evidence_item_id");
  const evidence = indexes.evidence.get(id);
  return {
    evidence_id: id,
    summary: evidence === undefined ? "Referenced evidence is not present in this projection." : stringAt(evidence, "summary"),
    status: evidence === undefined ? "missing_reference" : stringAt(evidence, "evidence_status"),
    role: stringAt(link, "relationship"),
    source_locator: evidence === undefined ? NOT_RECORDED : sourceLocator(evidence.source_bindings),
    independence_class: optionalStringAt(link, "dependency_group_id") ?? "No dependency group recorded",
    disposition: evidence === undefined ? "missing_reference" : `Evidence status: ${stringAt(evidence, "evidence_status")}; quality assessment: ${stringAt(evidence, "quality_assessment")}`,
    domain: explicitDomain(evidence),
  };
}

function mapCounterevidenceLink(link: JsonObject, indexes: ReportIndexes): ViewObject {
  const mapped = mapEvidenceLink(link, indexes);
  return { ...mapped, evidence_id: mapped.evidence_id, summary: mapped.summary, source_locator: mapped.source_locator };
}

function mapBridge(bridge: JsonObject): ViewObject {
  const contextualAlignment = (key: string): string => {
    const assessment = asObject(bridge[key]);
    return assessment === undefined ? NOT_RECORDED : stringAt(assessment, "alignment");
  };
  return {
    bridge_id: stringAt(bridge, "bridge_id"),
    statement: displayField(bridge.transformation_or_mapping_evidence),
    domains: `${stringAt(bridge, "source_domain")} ${stringAt(bridge, "target_domain")}`,
    entity_alignment: stringAt(bridge, "identity_alignment"),
    construct_alignment: stringAt(bridge, "construct_alignment"),
    condition_alignment: stringAt(bridge, "condition_alignment"),
    intervention_alignment: contextualAlignment("intervention_alignment"),
    dose_alignment: contextualAlignment("dose_alignment"),
    endpoint_alignment: contextualAlignment("endpoint_alignment"),
    time_alignment: contextualAlignment("time_alignment"),
    state_alignment: contextualAlignment("state_alignment"),
    scale_alignment: stringAt(bridge, "scale_alignment"),
    status: stringAt(bridge, "validity_status"),
    reviewer_state: stringAt(bridge, "reviewer_state"),
    safety_relevance: stringAt(bridge, "validity_status") !== "valid" || stringAt(bridge, "reviewer_state") !== "reviewed",
  };
}

function mapWorkUnit(workUnit: JsonObject, indexes: ReportIndexes): ViewObject {
  const attempts = identifierList(workUnit, "attempt_ids").map((id) => indexes.attempts.get(id)).filter((value): value is JsonObject => value !== undefined)
    .sort((left, right) => (numberAt(left, "attempt_ordinal") ?? Number.MAX_SAFE_INTEGER) - (numberAt(right, "attempt_ordinal") ?? Number.MAX_SAFE_INTEGER) || compareIdentifiers(left, right));
  const mappedAttempts = attempts.map((attempt) => mapAttempt(attempt, indexes));
  const completionEvidence = arrayAt(workUnit, "completion_evidence");
  return {
    work_unit_id: stringAt(workUnit, "work_unit_id"),
    campaign_id: stringAt(workUnit, "campaign_id"),
    title: stringAt(workUnit, "title"),
    objective: displayField(workUnit.objective),
    work_state: stringAt(workUnit, "work_state"),
    execution_scope: stringAt(workUnit, "execution_scope"),
    completion_criteria: `${displayField(workUnit.completion_criteria)} Assessment: ${displayField(workUnit.completion_assessment)}`,
    completion_evidence: sourceLocator(completionEvidence),
    attempt_count: mappedAttempts.length,
    failed_attempt_count: attempts.filter((attempt) => attempt.attempt_outcome === "failed" || attempt.attempt_outcome === "aborted" || attempt.attempt_outcome === "cancelled_after_start").length,
    completed_attempt_count: attempts.filter((attempt) => attempt.attempt_outcome === "succeeded").length,
    unknown_attempt_count: attempts.filter((attempt) => attempt.attempt_outcome === "outcome_unknown" || attempt.attempt_outcome === "running_at_cutoff").length,
    attempts: mappedAttempts,
    domain: explicitDomain(workUnit),
    safety_relevance: workUnit.work_state === "unknown" || workUnit.work_state === "not_performed",
  };
}

function mapAttempt(attempt: JsonObject, indexes: ReportIndexes): ViewObject {
  const failureIds = identifierList(attempt, "failure_event_ids");
  const firstFailure = failureIds.map((id) => indexes.failures.get(id)).find((value): value is JsonObject => value !== undefined);
  const segmentIds = identifierList(attempt, "segment_ids");
  const segmentRecords = segmentIds.map((id) => indexes.segments.get(id)).filter((value): value is JsonObject => value !== undefined)
    .sort((left, right) => (numberAt(left, "segment_ordinal") ?? Number.MAX_SAFE_INTEGER) - (numberAt(right, "segment_ordinal") ?? Number.MAX_SAFE_INTEGER) || compareIdentifiers(left, right));
  const decisionRecords = [...indexes.decisions.values()].filter((decision) => {
    const related = [...identifierList(decision, "triggering_object_ids"), ...identifierList(decision, "affected_object_ids")];
    return related.includes(stringAt(attempt, "attempt_id")) || related.some((id) => segmentIds.includes(id));
  });
  return {
    attempt_id: stringAt(attempt, "attempt_id"),
    sequence: numberAt(attempt, "attempt_ordinal") ?? NOT_RECORDED,
    status: stringAt(attempt, "attempt_outcome"),
    record_disposition: `usable_output_status: ${stringAt(attempt, "usable_output_status")}`,
    purpose: `Attempt for work unit ${stringAt(attempt, "work_unit_id")}; usable-output status: ${stringAt(attempt, "usable_output_status")}.`,
    actual_start: displayDateField(attempt.started_at),
    actual_end: displayDateField(attempt.ended_at),
    performed_by: `Execution scope: ${stringAt(attempt, "execution_scope")}; actor/system is not represented by the canonical Attempt contract.`,
    invocation_id: "No invocation link is represented by the canonical Attempt contract.",
    failure: firstFailure === undefined ? null : {
      failure_id: stringAt(firstFailure, "failure_event_id"),
      domain: explicitDomain(firstFailure),
      status: stringAt(firstFailure, "resolution_status"),
      summary: failureIds.length > 1 ? `${stringAt(firstFailure, "description")} (${failureIds.length} failure records are linked; inspect the failure ledger.)` : stringAt(firstFailure, "description"),
      stage: stringAt(firstFailure, "failure_class"),
      observed_at: displayDateField(firstFailure.onset_or_detection),
      partial_output_disposition: joinIdentifiers(identifierList(firstFailure, "partial_result_ids")),
      recovery_attempt_id: joinIdentifiers(identifierList(firstFailure, "recovery_attempt_ids")),
    },
    segments: segmentRecords.map(mapSegment),
    decisions: decisionRecords.map(mapDecision),
    domain: explicitDomain(attempt),
    safety_relevance: ["failed", "aborted", "cancelled_after_start", "outcome_unknown", "running_at_cutoff"].includes(stringAt(attempt, "attempt_outcome")),
  };
}

function mapSegment(segment: JsonObject): ViewObject {
  const input = optionalStringAt(segment, "checkpoint_input_artifact_id");
  const outputs = [optionalStringAt(segment, "checkpoint_output_artifact_id"), ...identifierList(segment, "output_artifact_ids")].filter((value): value is string => value !== null);
  return {
    segment_id: stringAt(segment, "segment_id"),
    range_or_phase: `${stringAt(segment, "segment_kind")} · ordinal ${numberAt(segment, "segment_ordinal") ?? NOT_RECORDED}`,
    status: stringAt(segment, "segment_state"),
    input_reference: input ?? NOT_RECORDED,
    output_reference: outputs.length === 0 ? NOT_RECORDED : [...new Set(outputs)].join(", "),
    notes: displayField(segment.restart_reason),
    domain: explicitDomain(segment),
    safety_relevance: stringAt(segment, "segment_state") !== "completed",
  };
}

function mapDecision(decision: JsonObject): ViewObject {
  return {
    decision_id: stringAt(decision, "decision_event_id"),
    decision_text: stringAt(decision, "description"),
    timing_status: stringAt(decision, "timing_class"),
    timing_evidence: sourceLocator(decision.source_bindings),
    domain: explicitDomain(decision),
    safety_relevance: decision.timing_class === "missing",
  };
}

function mapResult(result: JsonObject, indexes: ReportIndexes): ViewObject {
  const estimate = objectAt(result, "effect_estimate");
  const negative = objectAt(result, "negative_evidence_assessment");
  const derivationIds = identifierList(result, "derivation_ids");
  const linkedEvidence = [...indexes.evidence.values()].filter((item) => identifierList(item, "result_ids").includes(stringAt(result, "result_id")));
  const estimates = estimate === undefined ? [] : [{
    label: displayField(result.estimand),
    display_estimate: displayField(estimate.estimate),
    display_interval: formatInterval(objectAt(estimate, "interval")),
    unit: displayField(estimate.unit),
    independent_n: displayField(estimate.sample_or_analysis_unit_count),
    analysis_population: optionalStringAt(result, "analysis_population_id") ?? NOT_RECORDED,
    state: stateOfField(estimate.estimate),
    domain: explicitDomain(result),
  }];
  const negativeNote = negative === undefined ? null : `${negative.eligible_for_biological_counterevidence === true ? "Eligible" : "Not eligible"} for biological counterevidence as recorded: ${stringAt(negative, "eligibility_reason")}`;
  return {
    result_id: stringAt(result, "result_id"),
    title: labelize(stringAt(result, "result_kind")),
    summary: stringAt(result, "statement"),
    domain: explicitDomain(result),
    scientific_effect_class: stringAt(result, "scientific_effect_class"),
    statistical_decision: stringAt(result, "statistical_decision"),
    interpretability_status: stringAt(result, "interpretability_status"),
    record_disposition: stringAt(result, "record_disposition"),
    negative_result_note: negativeNote,
    estimate_count: estimates.length,
    estimates,
    derivation_status: stringAt(result, "derivation_closure_status"),
    control_status: stringAt(negative, "control_status"),
    sensitivity_status: stringAt(negative, "sensitivity_status"),
    detection_limit_or_mde: negative === undefined ? NOT_RECORDED : `Detection limit: ${displayField(negative.detection_limit)}; minimum detectable effect: ${displayField(negative.minimum_detectable_effect)}`,
    equivalence_boundary: negative === undefined ? NOT_RECORDED : formatInterval(objectAt(negative, "equivalence_bounds")),
    multiplicity_handling: "Not represented by the canonical Result contract.",
    derivation: {
      data_slice_id: joinIdentifiers(identifierList(result, "data_slice_ids")),
      derivation_id: joinIdentifiers(derivationIds),
      analysis_run_id: joinIdentifiers(identifierList(result, "analysis_run_ids")),
      output_artifact_id: joinIdentifiers(identifierList(result, "output_artifact_ids")),
      evidence_id: joinIdentifiers(linkedEvidence.map((item) => stringAt(item, "evidence_item_id"))),
    },
    disposition_reason: displayField(result.disposition_reason),
    safety_relevance: ["excluded", "superseded", "retracted"].includes(stringAt(result, "record_disposition")) || ["not_interpretable", "unknown"].includes(stringAt(result, "interpretability_status")) || result.scientific_effect_class === "no_detectable_effect",
  };
}

function mapFailure(failure: JsonObject): ViewObject {
  return {
    failure_id: stringAt(failure, "failure_event_id"),
    title: labelize(stringAt(failure, "failure_class")),
    summary: stringAt(failure, "description"),
    work_unit_id: stringAt(failure, "work_unit_id"),
    attempt_id: optionalStringAt(failure, "attempt_id") ?? NOT_RECORDED,
    failure_class: stringAt(failure, "failure_class"),
    stage: optionalStringAt(failure, "segment_id") ?? NOT_RECORDED,
    partial_result_disposition: joinIdentifiers(identifierList(failure, "partial_result_ids")),
    recovery_attempt_id: joinIdentifiers(identifierList(failure, "recovery_attempt_ids")),
    observed_evidence: sourceLocator(failure.evidence_bindings),
    source_locator: sourceLocator(failure.evidence_bindings),
    scientific_impact: stringAt(failure, "impact"),
    affected_record_ids: joinIdentifiers([stringAt(failure, "affected_object_id"), ...identifierList(failure, "related_object_ids")]),
    status: stringAt(failure, "resolution_status"),
    domain: explicitDomain(failure),
  };
}

function mapMethod(method: JsonObject, report: JsonObject): ViewObject {
  const actualParameters = objectArrayAt(method, "actual_parameters");
  const plannedParameters = objectArrayAt(method, "planned_parameters");
  const allNames = [...new Set([...actualParameters, ...plannedParameters].map((parameter) => stringAt(parameter, "name")))].sort((left, right) => left.localeCompare(right, "en"));
  const actualByName = indexObjects(actualParameters, "name");
  const plannedByName = indexObjects(plannedParameters, "name");
  const parameters = allNames.map((name) => mapParameterComparison(name, actualByName.get(name), plannedByName.get(name), explicitDomain(method)));
  const differences = parameters.filter((parameter) => parameter.difference_status !== "same_recorded_value").map((parameter) => ({
    field: parameter.name,
    description: `${parameter.actual_display_value} → ${parameter.planned_display_value}`,
    status: parameter.difference_status,
    domain: explicitDomain(method),
    safety_relevance: parameter.difference_status === "different_recorded_value",
  }));
  const hasComparable = parameters.some((parameter) => parameter.difference_status === "same_recorded_value" || parameter.difference_status === "different_recorded_value");
  const comparisonStatus = !hasComparable ? "not_evaluable" : differences.some((difference) => difference.status === "different_recorded_value") ? "differs" : "same_recorded_values";
  const linkedWork = objectArrayAt(report, "work_units").filter((workUnit) => identifierList(workUnit, "method_ids").includes(stringAt(method, "method_id"))).map((workUnit) => ({ record_id: stringAt(workUnit, "work_unit_id"), relationship: "declared method" }));
  return {
    method_id: stringAt(method, "method_id"),
    title: stringAt(method, "name"),
    summary: displayField(method.description),
    state: stringAt(method, "execution_status"),
    execution_scope: stringAt(method, "execution_scope"),
    domain: explicitDomain(method),
    known_parameter_count: actualParameters.filter((parameter) => stateOfField(parameter.value) === "known").length,
    unknown_parameter_count: actualParameters.filter((parameter) => stateOfField(parameter.value) === "unknown").length,
    recipe_comparison_status: comparisonStatus,
    recipe_comparison_summary: comparisonStatus === "not_evaluable" ? "No actual/planned parameter pairs are available for direct recorded-value comparison." : "This is a literal recorded-value comparison, not a claim of procedural equivalence.",
    recipe_difference_safety_relevance: comparisonStatus !== "same_recorded_values",
    actual: {
      state: stringAt(method, "execution_status"),
      summary: displayField(method.description),
      invocation_display: "No invocation is linked by the canonical Method contract; standalone invocation records remain in the full record catalog.",
      invocation_id: NOT_RECORDED,
      code_reference: joinIdentifiers(identifierList(method, "protocol_artifact_ids")),
      working_context: NOT_RECORDED,
      exit_status: stringAt(method, "execution_status"),
    },
    recipe: {
      state: plannedParameters.length === 0 ? "not_recorded" : "planned_parameters_recorded",
      summary: plannedParameters.length === 0 ? "No planned parameter records are linked to this method." : "Planned parameters are recorded separately from actual parameters.",
      invocation_display: "No recipe invocation is linked by the canonical Method contract; recipe identity may be recorded per reproducibility unit.",
      recipe_id: NOT_RECORDED,
      code_reference: joinIdentifiers(identifierList(method, "protocol_artifact_ids")),
      environment_id: NOT_RECORDED,
      smoke_test_state: "not_recorded",
    },
    recipe_differences: differences,
    parameters,
    deviations: identifierList(method, "deviation_descriptions").map((summary) => ({ deviation_id: "No canonical deviation ID", summary, status: "recorded" })),
    controls: [],
    links: linkedWork,
    safety_relevance: method.execution_status === "unknown" || method.execution_status === "not_performed",
  };
}

function mapParameterComparison(name: string, actual: JsonObject | undefined, planned: JsonObject | undefined, domain: string): ViewObject {
  const actualField = projectField(actual?.value);
  const plannedField = projectField(planned?.value);
  let difference = "not_comparable";
  if (actual !== undefined && planned !== undefined && actualField.state === "known" && plannedField.state === "known") {
    difference = stableStringify(actualField.value as JsonValue, 0) === stableStringify(plannedField.value as JsonValue, 0) ? "same_recorded_value" : "different_recorded_value";
  } else if (actual !== undefined && planned !== undefined) {
    difference = `actual_${actualField.state}__planned_${plannedField.state}`;
  }
  return {
    name,
    actual_display_value: actual === undefined ? NOT_RECORDED : `${actualField.display}${displayUnit(actual)}`,
    planned_display_value: planned === undefined ? NOT_RECORDED : `${plannedField.display}${displayUnit(planned)}`,
    state: actual === undefined ? "not_recorded" : actualField.state,
    missing_reason: actualField.missingReason,
    provenance_status: actualField.provenanceStatus,
    difference_status: difference,
    domain,
    safety_relevance: actualField.state === "unknown" || actualField.state === "withheld" || difference === "different_recorded_value",
  };
}

function displayUnit(parameter: JsonObject): string {
  const unit = projectField(parameter.unit);
  if (unit.state === "known" && unit.display !== NOT_RECORDED) return ` ${unit.display}`;
  if (unit.state === "not_applicable") return "";
  return ` [unit: ${unit.display}]`;
}

function mapReproducibilityUnit(unit: JsonObject, indexes: ReportIndexes): ViewObject {
  const inputClosure = objectAt(unit, "input_closure");
  const artifactClosure = objectAt(unit, "artifact_closure");
  const access = objectAt(unit, "access_assessment");
  const environmentRecord = objectAt(unit, "environment_record");
  const randomRecord = objectAt(unit, "random_state_record");
  const environmentRecordAssessment = objectAt(environmentRecord, "assessment");
  const randomRecordAssessment = objectAt(randomRecord, "assessment");
  const assessments = objectAt(unit, "axis_assessments");
  const provenance = objectAt(assessments, "provenance_closure");
  const recipe = objectAt(assessments, "recipe_fidelity");
  const artifactAccess = objectAt(assessments, "data_and_artifact_access");
  const environment = objectAt(assessments, "environment_capture");
  const random = objectAt(assessments, "random_state_capture");
  const rerun = objectAt(assessments, "replay_verification");
  const computationalIndependence = objectAt(assessments, "independent_computational_reproduction");
  const experimentalIndependence = objectAt(assessments, "independent_experimental_replication");
  const coverage = objectAt(assessments, "claim_and_output_coverage");
  const limitations = identifierList(unit, "limitation_ids").map((id) => indexes.limitations.get(id)).filter((value): value is JsonObject => value !== undefined);
  const replayEvents = objectArrayAt(unit, "replay_events");
  return {
    unit_id: stringAt(unit, "reproducibility_unit_id"),
    title: stringAt(unit, "title"),
    level: stringAt(unit, "conservative_level"),
    status: stringAt(rerun, "state"),
    domain: explicitDomain(unit),
    scope_statement: `${displayField(unit.scope)} ${stringAt(unit, "level_reason")}`,
    axes: {
      source_closure: axis(provenance),
      recipe_fidelity: axis(recipe),
      artifact_access: axis(artifactAccess),
      environment: {
        status: conservativeAxisStatus(stringAt(environment, "state"), stringAt(random, "state")),
        note: `Environment axis: ${stringAt(environment, "rationale")}; random-state axis: ${stringAt(random, "rationale")}`,
      },
      verified_rerun: axis(rerun),
      independence: {
        status: conservativeAxisStatus(stringAt(computationalIndependence, "state"), stringAt(experimentalIndependence, "state")),
        note: `Computational axis: ${stringAt(computationalIndependence, "rationale")}; experimental axis: ${stringAt(experimentalIndependence, "rationale")}`,
      },
      claim_coverage: axis(coverage),
    },
    diagnostics: {
      input_closure: axis(inputClosure),
      artifact_closure: axis(artifactClosure),
      access: {
        status: stringAt(access, "status"),
        note: displayField(access?.conditions),
      },
      environment_record: axis(environmentRecordAssessment),
      random_state_record: axis(randomRecordAssessment),
    },
    recipe_id: optionalStringAt(unit, "recipe_id") ?? NOT_RECORDED,
    historical_invocation_id: joinIdentifiers(identifierList(unit, "historical_invocation_ids")),
    environment_id: optionalStringAt(environmentRecord, "record_id") ?? NOT_RECORDED,
    random_state_id: optionalStringAt(randomRecord, "record_id") ?? NOT_RECORDED,
    input_artifact_ids: joinIdentifiers(identifierList(access, "artifact_ids")),
    output_artifact_ids: joinIdentifiers(identifierList(unit, "covered_output_ids")),
    access_conditions: displayField(access?.conditions),
    verification_evidence: replayEvents.length === 0
      ? NOT_RECORDED
      : replayEvents.map((event) => `${stringAt(event, "replay_event_id")}: ${stringAt(event, "comparison_result")} (${stringAt(event, "exit_or_completion_status")})`).join("; "),
    gaps: limitations.map((limitation) => ({ gap_id: stringAt(limitation, "limitation_id"), summary: stringAt(limitation, "statement"), status: stringAt(limitation, "resolution_status") })),
    safety_relevance: unit.conservative_level === "not_assessed" || unit.conservative_level === "R0_documented" || stringAt(rerun, "state") !== "satisfied",
  };
}

function axis(assessment: JsonObject | undefined): ViewObject {
  return { status: stringAt(assessment, "state"), note: stringAt(assessment, "rationale") };
}

function conservativeAxisStatus(left: string, right: string): string {
  if (left === right) return left;
  const rank: Record<string, number> = { unsatisfied: 0, unknown: 1, withheld: 1, partial: 2, satisfied: 3, not_applicable: 4 };
  if (rank[left] === undefined || rank[right] === undefined) return `${left} ${right}`;
  return (rank[left] as number) <= (rank[right] as number) ? left : right;
}

function buildReproducibilityOverview(units: JsonObject[]): ViewObject {
  const critical = units.filter((unit) => unit.criticality === "critical");
  const rank: Record<string, number> = { not_assessed: 0, R0_documented: 1, R1_replay_ready: 2, R2_verified_replay: 3, R3_independent_reproduction: 4 };
  const floor = critical.length === 0 ? "not_assessed" : critical.reduce((current, unit) => {
    const candidate = stringAt(unit, "conservative_level", "not_assessed");
    return (rank[candidate] ?? -1) < (rank[current] ?? -1) ? candidate : current;
  }, stringAt(critical[0], "conservative_level", "not_assessed"));
  const targetClaims = new Set(critical.flatMap((unit) => identifierList(unit, "covered_claim_ids")));
  const accessStates = [...new Set(critical.map((unit) => stringAt(objectAt(unit, "access_assessment"), "status")))];
  const rerunStates = [...new Set(critical.map((unit) => stringAt(objectAt(objectAt(unit, "axis_assessments"), "replay_verification"), "state")))];
  return {
    conservative_floor: floor,
    statement: critical.length === 0 ? "No critical reproducibility units are recorded; no report-wide replay level is inferred." : `Minimum recorded conservative level across ${critical.length} critical unit(s). This is a presentation floor, not an opaque composite score.`,
    critical_unit_count: critical.length,
    claim_coverage: `${targetClaims.size} distinct claims are explicitly covered by critical units`,
    access_condition: accessStates.length === 0 ? NOT_RECORDED : accessStates.join(", "),
    verified_rerun_scope: rerunStates.length === 0 ? NOT_RECORDED : rerunStates.join(", "),
  };
}

function mapSource(source: JsonObject): ViewObject {
  const firstBinding = arrayAt(source, "source_bindings").map(asObject).find((value): value is JsonObject => value !== undefined);
  const locator = objectAt(firstBinding, "locator");
  return {
    source_id: stringAt(source, "source_item_id"),
    label: displayField(source.title),
    source_type: stringAt(source, "source_kind"),
    domain: explicitDomain(source),
    disposition: stringAt(source, "disposition"),
    disposition_reason: displayField(source.disposition_reason),
    snapshot_or_content_id: displayField(source.content_hash),
    locator: displayField(source.location),
    parser_version: stringAt(locator, "parser_version"),
    revision_id: stringAt(source, "snapshot_id"),
    safety_relevance: source.disposition !== "included" && source.disposition !== "duplicate" && source.disposition !== "excluded_with_reason",
  };
}

function mapAnnexEvidence(evidence: JsonObject, report: JsonObject): ViewObject {
  const linkedClaimIds = objectArrayAt(report, "evidence_edges")
    .filter((edge) => edge.evidence_item_id === evidence.evidence_item_id)
    .map((edge) => stringAt(edge, "claim_id"));
  return {
    evidence_id: stringAt(evidence, "evidence_item_id"),
    label: labelize(stringAt(evidence, "evidence_kind")),
    summary: stringAt(evidence, "summary"),
    role: stringAt(evidence, "evidence_kind"),
    disposition: stringAt(evidence, "evidence_status"),
    independence_class: joinIdentifiers(identifierList(evidence, "dependency_group_ids")),
    source_id: firstOrNotRecorded(identifierList(evidence, "source_item_ids")),
    source_locator: sourceLocator(evidence.source_bindings),
    claim_ids: joinIdentifiers(linkedClaimIds),
    derivation_id: joinIdentifiers(identifierList(evidence, "derivation_ids")),
    object_version: stringAt(evidence, "evidence_item_version"),
    status: stringAt(evidence, "evidence_status"),
    domain: explicitDomain(evidence),
    safety_relevance: evidence.evidence_status !== "active",
  };
}

function mapEntity(entity: JsonObject): ViewObject {
  const identifiers = objectArrayAt(entity, "identifiers").map((identifier) => `${stringAt(identifier, "scheme")}: ${displayField(identifier.value)}`);
  return {
    entity_id: stringAt(entity, "entity_id"),
    entity_class: stringAt(entity, "entity_kind"),
    display_name: displayField(entity.label),
    version_or_identity: `${stringAt(entity, "entity_version")} · ${identifiers.length === 0 ? NOT_RECORDED : identifiers.join("; ")}`,
    parent_or_source_id: firstSourceId(entity.source_bindings),
    state: stringAt(entity, "identity_status"),
    notes: sourceLocator(entity.source_bindings),
    domain: explicitDomain(entity),
    safety_relevance: entity.identity_status === "ambiguous" || entity.identity_status === "withheld" || entity.identity_status === "unknown",
  };
}

function mapArtifact(artifact: JsonObject): ViewObject {
  return {
    artifact_id: stringAt(artifact, "artifact_id"),
    label: stringAt(artifact, "artifact_role"),
    role: stringAt(artifact, "artifact_role"),
    media_type: displayField(artifact.media_type),
    access_state: stringAt(artifact, "access_state"),
    access_conditions: artifact.access_state === "open" ? "Open as recorded" : `Access state: ${stringAt(artifact, "access_state")}`,
    integrity_algorithm: "SHA-256 field",
    integrity_display: displayField(artifact.content_hash),
    integrity_state: stateOfField(artifact.content_hash),
    reference_display: displayField(artifact.location),
    revision_state: identifierList(artifact, "supersedes_artifact_ids").length === 0 ? "No superseded artifact IDs recorded" : `Supersedes ${joinIdentifiers(identifierList(artifact, "supersedes_artifact_ids"))}`,
    domain: explicitDomain(artifact),
    safety_relevance: artifact.access_state !== "open" || stateOfField(artifact.content_hash) !== "known",
  };
}

function mapRevision(revision: JsonObject): ViewObject {
  const superseded = objectArrayAt(revision, "superseded_object_refs").map((reference) => stringAt(reference, "object_id"));
  const affected = [...identifierList(revision, "invalidated_object_ids"), ...identifierList(revision, "review_required_object_ids")];
  return {
    revision_event_id: stringAt(revision, "revision_event_id"),
    event_type: stringAt(revision, "event_kind"),
    status: identifierList(revision, "invalidated_object_ids").length > 0 ? "invalidated_downstream" : identifierList(revision, "review_required_object_ids").length > 0 ? "review_required" : "recorded",
    title: labelize(stringAt(revision, "event_kind")),
    summary: stringAt(revision, "impact_statement"),
    effective_time: displayDateField(revision.occurred_at),
    triggering_source_id: firstSourceId(revision.source_bindings),
    affected_object_ids: joinIdentifiers(affected),
    propagation_status: `Invalidated: ${joinIdentifiers(identifierList(revision, "invalidated_object_ids"))}; review required: ${joinIdentifiers(identifierList(revision, "review_required_object_ids"))}`,
    supersedes_id: joinIdentifiers(superseded),
    domain: explicitDomain(revision),
    safety_relevance: true,
  };
}

function mapLimitation(limitation: JsonObject): ViewObject {
  return {
    limitation_id: stringAt(limitation, "limitation_id"),
    title: labelize(stringAt(limitation, "category")),
    statement: stringAt(limitation, "statement"),
    limitation_class: stringAt(limitation, "category"),
    affected_record_ids: joinIdentifiers(identifierList(limitation, "affected_object_ids")),
    mitigation: `Recorded impact: ${stringAt(limitation, "impact")}. A mitigation field is not represented by the canonical Limitation contract.`,
    provenance_status: arrayAt(limitation, "source_bindings").length > 0 ? "source bindings recorded" : "no source bindings recorded",
    status: stringAt(limitation, "resolution_status"),
    domain: explicitDomain(limitation),
  };
}

function mapGenerationAudit(audit: JsonObject | null): ViewObject {
  if (audit === null) return { present: false };
  const events = objectArrayAt(audit, "audit_events");
  const invocations = objectArrayAt(audit, "generation_invocations");
  return {
    present: true,
    audit_id: stringAt(audit, "generation_audit_id"),
    process_class: stringAt(audit, "stage"),
    run_count: invocations.length,
    human_review_state: events.some((event) => event.event_kind === "human_decision_recorded") ? "human decision event recorded" : "no human decision event recorded in this audit",
    removal_invariance_state: audit.removable_without_scientific_change === true ? "declared removable without scientific change" : "not established",
    stages: events.map((event, index) => ({ sequence: index + 1, stage_label: stringAt(event, "event_kind"), summary: stringAt(event, "description"), status: stringAt(event, "actor_kind") })),
    qualifications: [{ display_text: "This audit is peripheral and is excluded from scientific conclusions, validation status, and reproducibility level." }],
    forbidden_inference_review: "Not represented as a dedicated field in the generation-audit contract; consult audit events and the separate validation record.",
  };
}

interface ConsoleFilterRecord {
  kind: string;
  domain: string;
  state: string;
}

/**
 * Mirror every data-record emitted by report.html and its partials. Keeping the
 * complete attribute strings here means every selectable token is derived from
 * the same mapped values that the templates emit, including nested records.
 */
function collectConsoleFilterRecords(view: ViewObject): ConsoleFilterRecord[] {
  const records: ConsoleFilterRecord[] = [];
  const add = (
    kind: string,
    record: ViewObject | undefined,
    stateKey = "status",
    domainKey = "domain",
  ): void => {
    if (record === undefined) return;
    records.push({
      kind,
      domain: stringViewValue(record[domainKey]),
      state: stringViewValue(record[stateKey]),
    });
  };

  const overview = viewObject(view.overview);
  add("claim", viewObject(overview?.key_claim));
  add("counterevidence", viewObject(overview?.strongest_counterevidence));
  add("blocker", viewObject(overview?.primary_blocker));

  for (const question of viewObjectArray(view.research_questions)) {
    add("research-question", question, "resolution_status");
  }
  for (const claim of viewObjectArray(view.claims)) {
    add("claim", claim);
    viewObjectArray(claim.evidence).forEach((record) => add("evidence", record));
    viewObjectArray(claim.argument_steps).forEach((record) => add("argument-step", record));
    viewObjectArray(claim.bridges).forEach((record) => add("cross-domain-bridge", record, "status", "domains"));
    viewObjectArray(claim.counterevidence).forEach((record) => add("counterevidence", record));
    viewObjectArray(claim.conflicts).forEach((record) => add("conflict", record));
  }
  for (const workUnit of viewObjectArray(view.work_units)) {
    add("work-unit", workUnit, "work_state");
    for (const attempt of viewObjectArray(workUnit.attempts)) {
      add("attempt", attempt);
      add("failure", viewObject(attempt.failure));
      viewObjectArray(attempt.segments).forEach((record) => add("segment", record));
      viewObjectArray(attempt.decisions).forEach((record) => add("decision", record, "timing_status"));
    }
  }
  for (const result of viewObjectArray(view.results)) {
    add(
      `result ${stringViewValue(result.record_disposition)} ${stringViewValue(result.scientific_effect_class)}`,
      {
        ...result,
        filter_state: `${stringViewValue(result.interpretability_status)} ${stringViewValue(result.record_disposition)}`,
      },
      "filter_state",
    );
    viewObjectArray(result.estimates).forEach((record) => add("estimate", record, "state"));
  }
  viewObjectArray(view.failures).forEach((record) => add("failure", record));
  for (const method of viewObjectArray(view.methods)) {
    add("method", method, "state");
    viewObjectArray(method.recipe_differences).forEach((record) => add("recipe-difference", record));
    viewObjectArray(method.parameters).forEach((record) => add("parameter", record, "state"));
  }
  for (const source of viewObjectArray(view.sources)) {
    add(`source ${stringViewValue(source.disposition)}`, source, "disposition");
  }
  for (const unit of viewObjectArray(view.reproducibility_units)) {
    add("reproducibility-unit", {
      ...unit,
      filter_state: `${stringViewValue(unit.level)} ${stringViewValue(unit.status)}`,
    }, "filter_state");
  }
  for (const artifact of viewObjectArray(view.artifacts)) {
    add("artifact", {
      ...artifact,
      filter_state: `${stringViewValue(artifact.access_state)} ${stringViewValue(artifact.integrity_state)}`,
    }, "filter_state");
  }
  return records;
}

function buildFilters(records: ConsoleFilterRecord[]): ViewObject {
  const domains = new Set<string>();
  const states = new Set<string>();
  const kinds = new Set<string>();
  const addTokens = (target: Set<string>, value: string): void => {
    value.split(/[\s,|]+/u).filter(Boolean).forEach((token) => target.add(token));
  };
  for (const record of records) {
    addTokens(domains, record.domain);
    addTokens(states, record.state);
    addTokens(kinds, record.kind);
  }
  const options = (values: Set<string>): ViewObject[] => [...values]
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((value) => ({ value, label: labelize(value) }));
  return { domains: options(domains), states: options(states), kinds: options(kinds) };
}

function viewObject(value: unknown): ViewObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as ViewObject
    : undefined;
}

function viewObjectArray(value: unknown): ViewObject[] {
  return Array.isArray(value)
    ? value.map(viewObject).filter((entry): entry is ViewObject => entry !== undefined)
    : [];
}

function stringViewValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formatInterval(interval: JsonObject | undefined): string {
  if (interval === undefined) return NOT_RECORDED;
  const unit = projectField(interval.unit);
  return `${displayField(interval.lower)} to ${displayField(interval.upper)} [interval unit: ${unit.display}]; ${displayField(interval.level)} ${stringAt(interval, "interval_kind")}`;
}

function displayDisclosureState(disclosure: JsonObject | undefined): string {
  if (disclosure === undefined) return NOT_RECORDED;
  return `${stringAt(disclosure, "level")} · ${stringAt(disclosure, "projection_status")} · withheld fields ${numberAt(disclosure, "withheld_field_count") ?? NOT_RECORDED} · omitted objects ${numberAt(disclosure, "omitted_object_count") ?? NOT_RECORDED}`;
}

function firstOrNotRecorded(values: readonly string[]): string {
  return values[0] ?? NOT_RECORDED;
}
