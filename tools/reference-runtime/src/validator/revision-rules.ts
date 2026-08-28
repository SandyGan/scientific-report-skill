import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import type { Claim, ClaimSupportStatus, EvidenceItem } from "../lib/types.js";
import { finding, objectVersion, pointer } from "./context.js";
import type { SemanticContext, ValidationFinding } from "./types.js";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function objectCarriesInvalidState(context: SemanticContext, id: string): boolean {
  const collection = context.objectCollectionById.get(id);
  const record = context.objectById.get(id);
  if (record === undefined) return false;
  if (collection === "claims") return ["review_required", "invalidated"].includes(String(record.support_status));
  if (collection === "evidence_items") return ["review_required", "invalidated", "retracted", "superseded"].includes(String(record.evidence_status));
  if (collection === "results") return ["excluded", "superseded", "retracted", "pending_review"].includes(String(record.record_disposition));
  if (collection === "derivations") return ["invalidated", "failed"].includes(String(record.derivation_status));
  if (collection === "claim_dependencies") return ["broken", "invalidated", "review_required"].includes(String(record.dependency_status));
  if (collection === "argument_steps") return ["invalid", "review_required"].includes(String(record.validity_status));
  if (collection === "cross_domain_bridges") {
    return record.validity_status === "invalid" || record.validity_status === "unknown" || record.reviewer_state === "review_required";
  }
  return false;
}

function evidenceDependsOn(evidence: EvidenceItem, ids: Set<string>): boolean {
  return [
    ...evidence.result_ids,
    ...evidence.artifact_ids,
    ...evidence.data_slice_ids,
    ...evidence.derivation_ids,
    ...evidence.analysis_run_ids,
    ...evidence.source_item_ids,
  ].some((id) => ids.has(id));
}

function evidenceEdgesForClaim(context: SemanticContext, claim: Claim) {
  const declared = new Set([...claim.evidence_edge_ids, ...claim.counterevidence_edge_ids]);
  return context.report.evidence_edges.filter(
    (edge) => edge.claim_id === claim.claim_id && declared.has(edge.evidence_edge_id),
  );
}

function evidenceStillAdmissible(
  context: SemanticContext,
  evidence: EvidenceItem,
  affectedEvidence: ReadonlySet<string>,
  affectedObjects: ReadonlySet<string>,
  requireActive: boolean,
): boolean {
  if (affectedEvidence.has(evidence.evidence_item_id) || affectedObjects.has(evidence.evidence_item_id)) return false;
  if (requireActive ? evidence.evidence_status !== "active" : !["active", "qualified"].includes(evidence.evidence_status)) return false;
  const dependentIds = [
    ...evidence.result_ids,
    ...evidence.artifact_ids,
    ...evidence.data_slice_ids,
    ...evidence.derivation_ids,
    ...evidence.analysis_run_ids,
    ...evidence.source_item_ids,
  ];
  if (dependentIds.some((id) => affectedObjects.has(id))) return false;
  if (evidence.result_ids.some((id) => {
    const result = context.report.results.find((item) => item.result_id === id);
    return result === undefined || ["excluded", "superseded", "retracted", "pending_review"].includes(result.record_disposition);
  })) return false;
  if (evidence.derivation_ids.some((id) => !context.report.derivations.some((item) => item.derivation_id === id && item.derivation_status === "complete"))) return false;
  return true;
}

function claimHasAlternativeSupport(
  context: SemanticContext,
  claim: Claim,
  affectedEvidence: Set<string>,
  affectedObjects: Set<string>,
  claimStack: Set<string> = new Set(),
): boolean {
  if (claimStack.has(claim.claim_id)) return false;
  const nextClaimStack = new Set(claimStack).add(claim.claim_id);
  const direct = evidenceEdgesForClaim(context, claim).some((edge) => {
    if (edge.relationship !== "supports" && edge.relationship !== "qualifies") return false;
    const evidence = context.report.evidence_items.find((item) => item.evidence_item_id === edge.evidence_item_id);
    return evidence !== undefined && evidenceStillAdmissible(
      context,
      evidence,
      affectedEvidence,
      affectedObjects,
      claim.support_status === "supported",
    );
  });
  if (direct) return true;
  return claim.argument_step_ids.some((stepId) => {
    if (affectedObjects.has(stepId)) return false;
    const step = context.report.argument_steps.find((candidate) => candidate.argument_step_id === stepId);
    if (step === undefined || (step.validity_status !== "valid_for_scope" && step.validity_status !== "qualified")) return false;
    if (claim.support_status === "supported" && step.validity_status !== "valid_for_scope") return false;
    const premiseIds = new Set(step.premise_edge_ids);
    const premiseEdges = context.report.argument_edges.filter((edge) =>
      premiseIds.has(edge.argument_edge_id) && edge.target_type === "argument_step" && edge.target_id === stepId,
    );
    if (premiseEdges.length !== premiseIds.size) return false;
    return premiseEdges.every((edge) => {
      if (edge.source_type === "evidence_item") {
        const evidence = context.report.evidence_items.find((item) => item.evidence_item_id === edge.source_id);
        return evidence !== undefined && evidenceStillAdmissible(
          context,
          evidence,
          affectedEvidence,
          affectedObjects,
          claim.support_status === "supported",
        );
      }
      if (edge.source_type === "claim") {
        const upstream = context.report.claims.find((item) => item.claim_id === edge.source_id);
        return upstream !== undefined &&
          (upstream.support_status === "supported" || upstream.support_status === "qualified") &&
          (claim.support_status !== "supported" || upstream.support_status === "supported") &&
          claimHasAlternativeSupport(context, upstream, affectedEvidence, affectedObjects, nextClaimStack);
      }
      return false;
    });
  });
}

function affectedPremiseIds(context: SemanticContext, stepId: string, affected: Set<string>): string[] {
  const step = context.report.argument_steps.find((candidate) => candidate.argument_step_id === stepId);
  if (step === undefined) return [];
  const declared = new Set(step.premise_edge_ids);
  return context.report.argument_edges
    .filter((edge) =>
      declared.has(edge.argument_edge_id) &&
      edge.target_type === "argument_step" &&
      edge.target_id === stepId &&
      affected.has(edge.source_id),
    )
    .map((edge) => edge.source_id);
}

function questionRevisionGaps(
  context: SemanticContext,
  questionIndex: number,
  revisionId: string,
  affectedClaims: ReadonlySet<string>,
  affectedEvidence: Set<string>,
  affectedObjects: Set<string>,
  impactListed: ReadonlySet<string>,
  revalidatedVersions: ReadonlyMap<string, string>,
): { gaps: string[]; ids: string[] } {
  const question = context.report.research_questions[questionIndex]!;
  const questionRecord = question as unknown as UnknownRecord;
  const assessmentsValue = questionRecord.resolution_criterion_assessments;
  const assessments = Array.isArray(assessmentsValue)
    ? assessmentsValue.map(record).filter((item): item is UnknownRecord => item !== null)
    : [];
  const remainingClaimIds = new Set<string>();
  for (const assessment of assessments) {
    if (assessment.assessment_status !== "satisfied" || stringArray(assessment.unresolved_blocker_ids).length > 0) continue;
    for (const claimId of stringArray(assessment.satisfying_claim_ids)) {
      if (!question.claim_ids.includes(claimId)) continue;
      const claim = context.report.claims.find((item) => item.claim_id === claimId);
      if (claim === undefined || (claim.support_status !== "supported" && claim.support_status !== "qualified")) continue;
      if (!affectedClaims.has(claimId) || claimHasAlternativeSupport(context, claim, affectedEvidence, affectedObjects)) {
        remainingClaimIds.add(claimId);
      }
    }
  }
  const gaps: string[] = [];
  const ids = new Set<string>([question.research_question_id, ...affectedClaims, ...remainingClaimIds]);
  const questionRevisionIds = stringArray(questionRecord.revision_event_ids);
  const linkedToRevision = questionRevisionIds.includes(revisionId);
  const answerKnown = question.qualified_answer.state === "known";

  if (remainingClaimIds.size === 0) {
    if (question.resolution_status === "resolved") gaps.push("question remains resolved after losing every criterion-satisfying support path");
    if (answerKnown) gaps.push("derived qualified answer remains known after its sole support path was withdrawn");
    if (assessments.some((assessment) => assessment.assessment_status === "satisfied")) {
      gaps.push("criterion assessment remains satisfied after every satisfying claim was affected");
    }
    if (!impactListed.has(question.research_question_id)) gaps.push("revision impact lists omit the affected research question/summary");
    if (!linkedToRevision) gaps.push("affected research question does not link to the revision event");
  } else if (question.resolution_status === "resolved") {
    if (!linkedToRevision) gaps.push("resolved question was not linked to the revision that triggered recomputation");
    if (revalidatedVersions.get(question.research_question_id) !== question.research_question_version) {
      gaps.push("resolved question lacks an exact-version revalidation record");
    }
    const revalidatedAssessment = assessments.some((assessment) => {
      const satisfyingIds = stringArray(assessment.satisfying_claim_ids);
      return assessment.assessment_status === "satisfied" &&
        satisfyingIds.some((id) => remainingClaimIds.has(id)) &&
        stringArray(assessment.assessment_revision_event_ids).includes(revisionId) &&
        stringArray(assessment.unresolved_blocker_ids).length === 0;
    });
    if (!revalidatedAssessment) gaps.push("criterion assessment was not recomputed against a remaining admissible support path");
  }
  return { gaps: [...new Set(gaps)], ids: [...ids] };
}

function allowedDownstreamStatuses(policy: "invalidate_downstream" | "require_review" | "qualify_downstream"): ClaimSupportStatus[] {
  if (policy === "invalidate_downstream") return ["invalidated", "review_required"];
  if (policy === "require_review") return ["review_required", "invalidated"];
  return ["qualified", "contested", "review_required", "invalidated"];
}

export function evaluateREV001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const report = context.report;

  report.revision_events.forEach((revision, revisionIndex) => {
    const explicitlyInvalidated = new Set(revision.invalidated_object_ids);
    const explicitlyReview = new Set(revision.review_required_object_ids);
    const affected = new Set<string>([
      ...revision.superseded_object_refs.map((reference) => reference.object_id),
      ...revision.invalidated_object_ids,
      ...revision.review_required_object_ids,
    ]);

    revision.superseded_object_refs.forEach((reference, referenceIndex) => {
      const record = context.objectById.get(reference.object_id);
      const actualVersion = record === undefined ? undefined : objectVersion(record);
      if (record === undefined || actualVersion !== reference.object_version) return;
      const hasDisposition =
        explicitlyInvalidated.has(reference.object_id) ||
        explicitlyReview.has(reference.object_id) ||
        objectCarriesInvalidState(context, reference.object_id);
      if (!hasDisposition) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: pointer("revision_events", revisionIndex, "superseded_object_refs", referenceIndex),
          affectedObjectIds: [revision.revision_event_id, reference.object_id],
          message: `Superseded object ${reference.object_id}@${reference.object_version} retains a current-valid state and is absent from invalidation/review lists.`,
        }));
      }
    });

    const affectedEvidence = new Set<string>();
    report.evidence_items.forEach((evidence, evidenceIndex) => {
      if (!evidenceDependsOn(evidence, affected)) return;
      affectedEvidence.add(evidence.evidence_item_id);
      affected.add(evidence.evidence_item_id);
      if (evidence.evidence_status === "active") {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: pointer("evidence_items", evidenceIndex, "evidence_status"),
          affectedObjectIds: [revision.revision_event_id, evidence.evidence_item_id],
          message: "Evidence depending on revised/invalidated input remains active without revalidation.",
        }));
      }
      if (!explicitlyInvalidated.has(evidence.evidence_item_id) && !explicitlyReview.has(evidence.evidence_item_id)) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: pointer("revision_events", revisionIndex, "review_required_object_ids"),
          affectedObjectIds: [revision.revision_event_id, evidence.evidence_item_id],
          message: "Revision impact list omits downstream evidence that uses an affected object.",
        }));
      }
    });

    let graphClosureChanged = true;
    while (graphClosureChanged) {
      graphClosureChanged = false;
      report.argument_steps.forEach((step, stepIndex) => {
        if (affected.has(step.argument_step_id)) return;
        const premiseIds = affectedPremiseIds(context, step.argument_step_id, affected);
        if (premiseIds.length === 0) return;
        affected.add(step.argument_step_id);
        graphClosureChanged = true;
        if (step.validity_status === "valid_for_scope") {
          findings.push(finding({
            rule,
            effectiveSeverity: severity,
            pointer: pointer("argument_steps", stepIndex, "validity_status"),
            affectedObjectIds: [revision.revision_event_id, step.argument_step_id, ...premiseIds],
            message: "Argument step with an affected premise remains valid_for_scope without a recorded revalidation.",
          }));
        }
      });
      for (const dependency of report.claim_dependencies) {
        if (affected.has(dependency.upstream_claim_id) && !affected.has(dependency.downstream_claim_id)) {
          affected.add(dependency.downstream_claim_id);
          graphClosureChanged = true;
        }
      }
    }

    report.claims.forEach((claim, claimIndex) => {
      const linkedEvidenceIds = evidenceEdgesForClaim(context, claim)
        .map((edge) => edge.evidence_item_id)
        .filter((id) => affectedEvidence.has(id));
      const linkedStepAffected = claim.argument_step_ids.some((id) => affected.has(id));
      const directlyAffected = affected.has(claim.claim_id);
      if (linkedEvidenceIds.length === 0 && !linkedStepAffected && !directlyAffected) return;
      affected.add(claim.claim_id);
      const alternative = claimHasAlternativeSupport(context, claim, affectedEvidence, affected);
      if (!alternative && claim.support_status === "supported") {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: pointer("claims", claimIndex, "support_status"),
          affectedObjectIds: [revision.revision_event_id, claim.claim_id, ...linkedEvidenceIds],
          message: "Downstream claim remains supported after its support was revised/invalidated and no alternative active support is documented.",
        }));
      }
      if (!explicitlyInvalidated.has(claim.claim_id) && !explicitlyReview.has(claim.claim_id) && !alternative) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: pointer("revision_events", revisionIndex, "review_required_object_ids"),
          affectedObjectIds: [revision.revision_event_id, claim.claim_id],
          message: "Revision event omits a downstream dependent claim from its impact lists.",
        }));
      }
      if (
        !alternative &&
        claim.support_status !== "supported" &&
        claim.support_status !== "unknown" &&
        claim.support_status !== "withheld" &&
        !claim.revision_event_ids.includes(revision.revision_event_id)
      ) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: pointer("claims", claimIndex, "revision_event_ids"),
          affectedObjectIds: [revision.revision_event_id, claim.claim_id],
          message: "Affected claim state does not link back to the revision event.",
        }));
      }
    });

    const affectedClaimIds = new Set(
      report.claims.filter((claim) => affected.has(claim.claim_id)).map((claim) => claim.claim_id),
    );
    const revisionRecord = revision as unknown as UnknownRecord;
    const revalidatedVersions = new Map<string, string>();
    const revalidatedValue = revisionRecord.revalidated_object_refs;
    if (Array.isArray(revalidatedValue)) {
      for (const value of revalidatedValue) {
        const reference = record(value);
        if (reference !== null && typeof reference.object_id === "string" && typeof reference.object_version === "string") {
          revalidatedVersions.set(reference.object_id, reference.object_version);
        }
      }
    }
    const impactListed = new Set([...revision.invalidated_object_ids, ...revision.review_required_object_ids]);
    report.research_questions.forEach((question, questionIndex) => {
      const linkedAffectedClaims = new Set(question.claim_ids.filter((id) => affectedClaimIds.has(id)));
      if (linkedAffectedClaims.size === 0) return;
      affected.add(question.research_question_id);
      const assessment = questionRevisionGaps(
        context,
        questionIndex,
        revision.revision_event_id,
        linkedAffectedClaims,
        affectedEvidence,
        affected,
        impactListed,
        revalidatedVersions,
      );
      if (assessment.gaps.length === 0) return;
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("research_questions", questionIndex, "resolution_status"),
        affectedObjectIds: [revision.revision_event_id, ...assessment.ids],
        sourceBindings: question.source_bindings,
        message: `Revision did not propagate to the research question and derived answer: ${assessment.gaps.join("; ")}.`,
        details: { gaps: assessment.gaps },
      }));
    });

    report.claim_dependencies.forEach((dependency, dependencyIndex) => {
      if (!affected.has(dependency.upstream_claim_id) || dependency.propagation_policy === "no_automatic_change") return;
      const downstream = report.claims.find((claim) => claim.claim_id === dependency.downstream_claim_id);
      if (downstream === undefined) return;
      const allowed = allowedDownstreamStatuses(dependency.propagation_policy);
      if (!allowed.includes(downstream.support_status)) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: pointer("claim_dependencies", dependencyIndex, "propagation_policy"),
          affectedObjectIds: [revision.revision_event_id, dependency.upstream_claim_id, downstream.claim_id, dependency.claim_dependency_id],
          message: `Dependency policy ${dependency.propagation_policy} did not propagate to downstream claim ${downstream.claim_id}.`,
        }));
      }
      if (dependency.dependency_status === "active" && objectCarriesInvalidState(context, dependency.upstream_claim_id)) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: pointer("claim_dependencies", dependencyIndex, "dependency_status"),
          affectedObjectIds: [dependency.claim_dependency_id, dependency.upstream_claim_id],
          message: "Dependency edge remains active after its upstream claim was invalidated or placed under review.",
        }));
      }
    });
  });
  return findings;
}
