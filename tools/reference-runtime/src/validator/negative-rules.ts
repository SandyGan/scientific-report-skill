import { assessExtractionCoverage } from "../lib/source-extraction.js";
import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import type { NegativeEvidenceAssessment, NumericInterval, Result } from "../lib/types.js";
import { finding, pointer } from "./context.js";
import type { SemanticContext, ValidationFinding } from "./types.js";

function intervalKnown(interval: NumericInterval | null): boolean {
  return (
    interval !== null &&
    interval.lower.state === "known" &&
    interval.upper.state === "known" &&
    interval.lower.value <= interval.upper.value
  );
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function knownValue(value: unknown): unknown {
  const candidate = record(value);
  return candidate?.state === "known" ? candidate.value : undefined;
}

function nestedRecords(payload: UnknownRecord, key: string): UnknownRecord[] {
  const value = payload[key];
  return Array.isArray(value) ? value.map(record).filter((item): item is UnknownRecord => item !== null) : [];
}

function recordIdentifier(value: UnknownRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === "string") return value[key] as string;
  }
  return undefined;
}

function wetLabPayloadsForResult(context: SemanticContext, result: Result): UnknownRecord[] {
  const value = (context.report.extensions as UnknownRecord).domain_payloads;
  if (!Array.isArray(value)) return [];
  return value.map(record).filter((payload): payload is UnknownRecord => {
    if (payload === null || payload.domain !== "wet_lab") return false;
    const appliesTo = record(payload.applies_to);
    if (stringArray(appliesTo?.result_ids).includes(result.result_id) || stringArray(appliesTo?.work_unit_ids).includes(result.work_unit_id)) return true;
    return nestedRecords(payload, "control_records").some((item) => item.work_unit_id === result.work_unit_id) ||
      nestedRecords(payload, "qc_events").some((item) => item.work_unit_id === result.work_unit_id);
  });
}

function statusPasses(value: unknown): boolean {
  const status = knownValue(value);
  if (status === true) return true;
  return typeof status === "string" && /^(?:pass(?:ed)?|valid|met|acceptable|adequate|within[_ -]?range)$/iu.test(status.trim());
}

function statusDescription(value: unknown): string {
  const status = knownValue(value);
  return status === undefined ? "unknown" : String(status);
}

function fieldHasKnownValue(value: unknown): boolean {
  return knownValue(value) !== undefined;
}

function concreteNegativeEvidenceGaps(
  context: SemanticContext,
  result: Result,
  assessment: NegativeEvidenceAssessment,
): { gaps: string[]; ids: string[] } {
  const gaps: string[] = [];
  const ids = new Set<string>();
  const assessmentRecord = assessment as unknown as UnknownRecord;

  if (result.analysis_population_id === null) {
    gaps.push("analysis_population_id is missing");
  } else {
    ids.add(result.analysis_population_id);
    const population = context.report.analysis_populations.find((item) => item.analysis_population_id === result.analysis_population_id);
    if (population === undefined) gaps.push(`analysis population ${result.analysis_population_id} is unresolved`);
    else {
      if (population.lineage_status !== "closed") gaps.push(`analysis population ${population.analysis_population_id} lineage_status=${population.lineage_status}`);
      if (population.members.length === 0) gaps.push(`analysis population ${population.analysis_population_id} has no registered members`);
      if (population.estimand.state !== "known" || result.estimand.state !== "known" || population.estimand.value !== result.estimand.value) {
        gaps.push(`analysis population ${population.analysis_population_id} does not match the result estimand`);
      }
    }
  }
  const assessedPopulationId = assessmentRecord.analysis_population_id;
  if (assessedPopulationId !== undefined && assessedPopulationId !== result.analysis_population_id) {
    gaps.push(`assessment analysis_population_id=${String(assessedPopulationId)} does not match result analysis_population_id=${String(result.analysis_population_id)}`);
  }

  const payloads = wetLabPayloadsForResult(context, result);
  const controls = payloads.flatMap((payload) => nestedRecords(payload, "control_records"))
    .filter((item) => item.work_unit_id === result.work_unit_id);
  const linkedControlIds = new Set(stringArray(assessmentRecord.control_record_ids));
  const controlsById = new Map(controls.map((item) => [recordIdentifier(item, ["control_id"]), item]));
  controls.forEach((item) => {
    const id = recordIdentifier(item, ["control_id"]);
    if (id !== undefined) ids.add(id);
  });
  if (controls.length === 0) gaps.push("no concrete control records are linked to the wet-lab result");
  if (linkedControlIds.size === 0) gaps.push("negative assessment has no control_record_ids");
  for (const id of linkedControlIds) {
    ids.add(id);
    if (!controlsById.has(id)) gaps.push(`linked control record ${id} is unresolved or belongs to another work unit`);
  }
  for (const [id] of controlsById) {
    if (id !== undefined && !linkedControlIds.has(id)) gaps.push(`control record ${id} is omitted from the assessment links`);
  }
  const positiveControls = controls.filter((item) => item.kind === "positive");
  if (positiveControls.length === 0) gaps.push("no required positive-control record is present");
  for (const control of positiveControls) {
    const id = recordIdentifier(control, ["control_id"]) ?? "unknown-control";
    if (!statusPasses(control.status)) gaps.push(`required positive control ${id} status=${statusDescription(control.status)}`);
    if (!statusPasses(control.assay_sensitivity)) gaps.push(`required positive control ${id} assay_sensitivity=${statusDescription(control.assay_sensitivity)}`);
    if (![control.detection_limit, control.minimum_detectable_effect, control.equivalence_bounds].some(fieldHasKnownValue)) {
      gaps.push(`required positive control ${id} has no known sensitivity bound`);
    }
    const concreteDetectionLimit = knownValue(control.detection_limit);
    const concreteMde = knownValue(control.minimum_detectable_effect);
    const assessedDetectionLimit = assessment.detection_limit.state === "known" ? assessment.detection_limit.value : undefined;
    const assessedMde = assessment.minimum_detectable_effect.state === "known" ? assessment.minimum_detectable_effect.value : undefined;
    if (concreteDetectionLimit !== undefined && assessedDetectionLimit !== undefined && JSON.stringify(concreteDetectionLimit) !== JSON.stringify(assessedDetectionLimit)) {
      gaps.push(`required positive control ${id} detection limit disagrees with the negative assessment`);
    }
    if (concreteMde !== undefined && assessedMde !== undefined && JSON.stringify(concreteMde) !== JSON.stringify(assessedMde)) {
      gaps.push(`required positive control ${id} minimum detectable effect disagrees with the negative assessment`);
    }
  }

  const qcEvents = payloads.flatMap((payload) => nestedRecords(payload, "qc_events"))
    .filter((item) => item.work_unit_id === result.work_unit_id || stringArray(item.affected_ids).some((id) => id === result.result_id || id === result.work_unit_id));
  const linkedQcIds = new Set(stringArray(assessmentRecord.quality_control_event_ids));
  const qcById = new Map(qcEvents.map((item) => [recordIdentifier(item, ["qc_event_id"]), item]));
  qcEvents.forEach((item) => {
    const id = recordIdentifier(item, ["qc_event_id"]);
    if (id !== undefined) ids.add(id);
  });
  if (qcEvents.length === 0) gaps.push("no concrete quality-control event is linked to the wet-lab result");
  if (linkedQcIds.size === 0) gaps.push("negative assessment has no quality_control_event_ids");
  for (const id of linkedQcIds) {
    ids.add(id);
    if (!qcById.has(id)) gaps.push(`linked QC event ${id} is unresolved or belongs to another work unit`);
  }
  for (const [id, event] of qcById) {
    if (id !== undefined && !linkedQcIds.has(id)) gaps.push(`QC event ${id} is omitted from the assessment links`);
    if (event.outcome !== "pass") gaps.push(`QC event ${id ?? "unknown-qc"} outcome=${String(event.outcome)}`);
  }

  const contexts = payloads.flatMap((payload) => nestedRecords(payload, "analysis_contexts"));
  const linkedContextIds = new Set(stringArray(assessmentRecord.analysis_context_ids));
  const contextById = new Map(contexts.map((item) => [recordIdentifier(item, ["analysis_context_id"]), item]));
  for (const id of linkedContextIds) {
    ids.add(id);
    const analysisContext = contextById.get(id);
    if (analysisContext === undefined) {
      gaps.push(`linked analysis context ${id} is unresolved`);
      continue;
    }
    if (!fieldHasKnownValue(analysisContext.population_definition)) gaps.push(`analysis context ${id} lacks a known population definition`);
    if (![analysisContext.detection_limit, analysisContext.minimum_detectable_effect, analysisContext.equivalence_bounds].some(fieldHasKnownValue)) {
      gaps.push(`analysis context ${id} has no known sensitivity bound`);
    }
    if (typeof analysisContext.analysis_run_id === "string" && !result.analysis_run_ids.includes(analysisContext.analysis_run_id)) {
      gaps.push(`analysis context ${id} is not linked to a result analysis run`);
    }
  }
  return { gaps: [...new Set(gaps)], ids: [...ids] };
}

function negativeAssessmentGaps(result: Result, assessment: NegativeEvidenceAssessment): string[] {
  const gaps: string[] = [];
  if (assessment.control_status !== "valid") gaps.push(`control_status=${assessment.control_status}`);
  if (assessment.quality_control_status !== "passed") gaps.push(`quality_control_status=${assessment.quality_control_status}`);
  if (assessment.sensitivity_status !== "adequate") gaps.push(`sensitivity_status=${assessment.sensitivity_status}`);
  const hasSensitivityBound =
    assessment.detection_limit.state === "known" ||
    assessment.minimum_detectable_effect.state === "known" ||
    intervalKnown(assessment.equivalence_bounds);
  if (!hasSensitivityBound) gaps.push("no known detection limit, MDE, or equivalence bounds");
  if (!intervalKnown(assessment.observed_interval)) gaps.push("no valid observed interval");
  if (result.scientific_effect_class === "equivalent" && !intervalKnown(assessment.equivalence_bounds)) gaps.push("equivalence result lacks equivalence bounds");
  if (assessment.eligible_for_biological_counterevidence && gaps.length > 0) gaps.push("eligibility flag is true despite unmet prerequisites");
  return [...new Set(gaps)];
}

function resultUsedAsBiologicalCounterevidence(context: SemanticContext, resultId: string): { used: boolean; claimIds: string[] } {
  const evidenceIds = new Set(
    context.report.evidence_items
      .filter((evidence) => evidence.result_ids.includes(resultId))
      .map((evidence) => evidence.evidence_item_id),
  );
  const edges = new Map(context.report.evidence_edges.map((edge) => [edge.evidence_edge_id, edge]));
  const claims = context.report.claims.filter((claim) => {
    if (claim.support_status !== "supported" && claim.support_status !== "qualified") return false;
    const linkedEdges = [...claim.evidence_edge_ids, ...claim.counterevidence_edge_ids]
      .map((edgeId) => edges.get(edgeId))
      .filter((edge) => edge !== undefined)
      .filter((edge) => edge.claim_id === claim.claim_id && evidenceIds.has(edge.evidence_item_id));
    return linkedEdges.some((edge) =>
      edge.relationship === "contradicts" ||
      (claim.claim_type === "negative_or_absence" && (edge.relationship === "supports" || edge.relationship === "qualifies")),
    );
  });
  return { used: claims.length > 0, claimIds: claims.map((claim) => claim.claim_id) };
}

export function evaluateNUL001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.results.forEach((result, index) => {
    const potentiallyNegative =
      result.scientific_effect_class === "no_detectable_effect" ||
      result.scientific_effect_class === "equivalent" ||
      result.statistical_decision === "do_not_reject_null" ||
      result.statistical_decision === "equivalent";
    if (!potentiallyNegative) return;
    const use = resultUsedAsBiologicalCounterevidence(context, result.result_id);
    const assessment = result.negative_evidence_assessment;
    if (assessment === null) {
      if (use.used || result.scientific_effect_class === "equivalent") {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("results", index, "negative_evidence_assessment"), affectedObjectIds: [result.result_id, ...use.claimIds], message: "Negative/equivalence result is used interpretively without a NegativeEvidenceAssessment." }));
      }
      return;
    }
    const gaps = negativeAssessmentGaps(result, assessment);
    const concrete = concreteNegativeEvidenceGaps(context, result, assessment);
    gaps.push(...concrete.gaps);
    const uniqueGaps = [...new Set(gaps)];
    const eligible = assessment.eligible_for_biological_counterevidence && uniqueGaps.filter((gap) => !gap.startsWith("eligibility flag")).length === 0;
    if ((use.used || result.scientific_effect_class === "equivalent" || assessment.eligible_for_biological_counterevidence) && !eligible) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("results", index, "negative_evidence_assessment"), affectedObjectIds: [result.result_id, ...use.claimIds, ...concrete.ids], message: `Negative result is stronger than its controls/sensitivity support: ${uniqueGaps.join("; ")}.`, details: { gaps: uniqueGaps } }));
    }
    if (
      result.statistical_decision === "do_not_reject_null" &&
      use.used &&
      !assessment.eligible_for_biological_counterevidence
    ) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("results", index, "statistical_decision"), affectedObjectIds: [result.result_id, ...use.claimIds], message: "A do-not-reject-null decision is used as biological absence/counterevidence without qualified sensitivity evidence." }));
    }
  });
  return findings;
}

function extensionContainsAdverseState(value: unknown): boolean {
  if (typeof value === "string") return /^(?:failed|failure|crashed|aborted|excluded|retracted|superseded|no[_ -]?effect|null[_ -]?result)$/iu.test(value.trim());
  if (Array.isArray(value)) return value.some(extensionContainsAdverseState);
  if (value !== null && typeof value === "object") return Object.values(value).some(extensionContainsAdverseState);
  return false;
}

export function evaluateNEG001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const report = context.report;
  const attempts = new Map(report.attempts.map((attempt) => [attempt.attempt_id, attempt]));
  const segments = new Map(report.segments.map((segment) => [segment.segment_id, segment]));
  const results = new Map(report.results.map((result) => [result.result_id, result]));
  const failures = new Map(report.failures.map((failure) => [failure.failure_event_id, failure]));
  const revisions = new Map(report.revision_events.map((revision) => [revision.revision_event_id, revision]));
  const domainPayloads = Array.isArray((report.extensions as UnknownRecord).domain_payloads)
    ? ((report.extensions as UnknownRecord).domain_payloads as unknown[]).map(record).filter((item): item is UnknownRecord => item !== null)
    : [];
  const qcEvents = new Map(
    domainPayloads.flatMap((payload) => nestedRecords(payload, "qc_events"))
      .flatMap((event) => {
        const id = recordIdentifier(event, ["qc_event_id"]);
        return id === undefined ? [] : [[id, event] as const];
      }),
  );
  const excludedPopulationMemberIds = new Set(
    report.analysis_populations.flatMap((population) =>
      population.members.filter((member) => member.inclusion_status === "excluded").map((member) => member.member_id),
    ),
  );
  const adverseRecordMatches = (category: string, id: string): boolean => {
    const failure = failures.get(id);
    const attempt = attempts.get(id);
    const segment = segments.get(id);
    const result = results.get(id);
    const revision = revisions.get(id);
    if (category === "failed_attempt") {
      return failure !== undefined || (attempt !== undefined && ["partially_succeeded", "failed", "aborted", "cancelled_after_start"].includes(attempt.attempt_outcome));
    }
    if (category === "crashed_segment") {
      return (segment !== undefined && ["stopped", "crashed", "superseded_by_restart"].includes(segment.segment_state)) ||
        (failure !== undefined && ["software", "hardware", "resource_exhaustion"].includes(failure.failure_class));
    }
    if (category === "adverse_quality_event") {
      const qc = qcEvents.get(id);
      return (failure !== undefined && failure.failure_class === "quality_control") ||
        (qc !== undefined && qc.outcome !== "pass");
    }
    if (category === "exclusion") {
      return excludedPopulationMemberIds.has(id) || result?.record_disposition === "excluded";
    }
    if (category === "negative_or_null_result") {
      return result !== undefined && (
        result.scientific_effect_class === "no_detectable_effect" ||
        result.scientific_effect_class === "equivalent" ||
        result.statistical_decision === "do_not_reject_null" ||
        result.statistical_decision === "equivalent"
      );
    }
    if (category === "retraction") {
      return result?.record_disposition === "retracted" || revision?.event_kind === "retraction";
    }
    if (category === "supersession") {
      return result?.record_disposition === "superseded" || revision?.event_kind === "supersession";
    }
    return false;
  };

  report.failures.forEach((failure, index) => {
    const attemptLinked = failure.attempt_id !== null && attempts.get(failure.attempt_id)?.failure_event_ids.includes(failure.failure_event_id);
    const segmentLinked = failure.segment_id !== null && segments.get(failure.segment_id)?.failure_event_ids.includes(failure.failure_event_id);
    if (!attemptLinked && !segmentLinked) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("failures", index), affectedObjectIds: [failure.failure_event_id, ...(failure.attempt_id === null ? [] : [failure.attempt_id]), ...(failure.segment_id === null ? [] : [failure.segment_id])], message: "Failure event exists but is detached from its attempt/segment execution ledger." }));
    }
  });

  report.results.forEach((result, index) => {
    const adverseDisposition = ["excluded", "superseded", "retracted"].includes(result.record_disposition);
    if (!adverseDisposition) return;
    const attemptLinked = result.attempt_id !== null && attempts.get(result.attempt_id)?.result_ids.includes(result.result_id);
    const segmentLinked = result.segment_id !== null && segments.get(result.segment_id)?.result_ids.includes(result.result_id);
    if (!attemptLinked && !segmentLinked) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("results", index), affectedObjectIds: [result.result_id], message: "Excluded, superseded, or retracted result is not retained in its attempt/segment ledger." }));
    }
  });

  report.source_coverage.items.forEach((source, index) => {
    if (source.disposition !== "included") return;
    const mapped = source.mapped_object_ids.map((id) => context.objectCollectionById.get(id));
    const extraction = assessExtractionCoverage(source);
    const extractedAdverseFindings = extraction.attestation?.adverse_content_findings ?? [];
    const titleAdverse = /\b(?:fail(?:ed|ure)?|crash(?:ed)?|abort(?:ed)?|retract(?:ed|ion)|excluded)\b|失败|崩溃|撤回|排除/iu.test(
      source.title.state === "known" ? source.title.value : "",
    );
    const extensionAdverse = extensionContainsAdverseState(source.extensions);
    const sourceMappedAdverse = source.mapped_object_ids.some((id) =>
      [
        "failed_attempt",
        "crashed_segment",
        "adverse_quality_event",
        "exclusion",
        "negative_or_null_result",
        "retraction",
        "supersession",
      ].some((category) => adverseRecordMatches(category, id)),
    );

    for (const adverse of extractedAdverseFindings) {
      const candidateIds = adverse.mapped_object_ids;
      const hasMappedAdverseRecord = adverse.disposition === "mapped" && candidateIds.length > 0 && candidateIds.every((id) =>
        source.mapped_object_ids.includes(id) && adverseRecordMatches(adverse.category, id),
      );
      if (!hasMappedAdverseRecord) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: pointer("source_coverage", "items", index, "extraction_coverage_attestation", "adverse_content_findings"),
          affectedObjectIds: [source.source_item_id, ...candidateIds],
          message: `Byte-bound extraction found ${adverse.category} content at bytes ${adverse.start_byte}-${adverse.end_byte_exclusive}, but it is not mapped to a corresponding canonical adverse record.`,
          details: {
            finding_id: adverse.finding_id,
            category: adverse.category,
            disposition: adverse.disposition,
            byte_range: [adverse.start_byte, adverse.end_byte_exclusive],
          },
        }));
      }
    }

    if (extractedAdverseFindings.length === 0 && (titleAdverse || extensionAdverse) && !sourceMappedAdverse) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("source_coverage", "items", index, "mapped_object_ids"),
        affectedObjectIds: [source.source_item_id, ...source.mapped_object_ids],
        message: "Included source is explicitly marked adverse/failed/excluded but maps to no corresponding failure, adverse attempt/segment, negative result, or excluded result.",
        details: { mapped_collections: mapped.filter((item): item is string => item !== undefined) },
      }));
    }
  });
  return findings;
}
