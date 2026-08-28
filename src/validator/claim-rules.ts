import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import type {
  ArgumentStep,
  Claim,
  EvidenceEdge,
  EvidenceItem,
  Result,
  ScientificEffectClass,
  StatisticalDecision,
} from "../lib/types.js";
import { findDirectedCycle, finding, pointer } from "./context.js";
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

function knownFieldValue(value: unknown): unknown {
  const candidate = record(value);
  return candidate?.state === "known" ? candidate.value : undefined;
}

function stableEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function evidenceAdmissible(context: SemanticContext, evidence: EvidenceItem): boolean {
  if (evidence.evidence_status !== "active" && evidence.evidence_status !== "qualified") return false;
  const report = context.report;
  const resultsValid = evidence.result_ids.every((id) => {
    const result = report.results.find((candidate) => candidate.result_id === id);
    if (result === undefined) return false;
    if (["excluded", "superseded", "retracted", "pending_review"].includes(result.record_disposition)) return false;
    if (result.interpretability_status === "not_interpretable") return false;
    const work = report.work_units.find((unit) => unit.work_unit_id === result.work_unit_id);
    return work === undefined || (work.work_state !== "planned" && work.work_state !== "not_performed");
  });
  const derivationsValid = evidence.derivation_ids.every((id) =>
    report.derivations.some((derivation) => derivation.derivation_id === id && derivation.derivation_status === "complete"),
  );
  const sourcesValid = evidence.source_item_ids.every((id) =>
    report.source_coverage.items.some((source) => source.source_item_id === id && source.disposition === "included"),
  );
  const bindingSourcesValid = evidence.source_bindings.every((binding) =>
    report.source_coverage.items.some((source) => source.source_item_id === binding.source_item_id && source.disposition === "included"),
  );
  const artifactsValid = evidence.artifact_ids.every((id) => report.artifacts.some((artifact) => artifact.artifact_id === id));
  const slicesValid = evidence.data_slice_ids.every((id) => report.data_slices.some((slice) => slice.data_slice_id === id));
  const runsValid = evidence.analysis_run_ids.every((id) =>
    report.analysis_runs.some((run) => run.analysis_run_id === id && run.execution_status === "completed"),
  );
  return resultsValid && derivationsValid && sourcesValid && bindingSourcesValid && artifactsValid && slicesValid && runsValid;
}

function edgesForClaim(context: SemanticContext, claim: Claim): EvidenceEdge[] {
  const declared = new Set([...claim.evidence_edge_ids, ...claim.counterevidence_edge_ids]);
  return context.report.evidence_edges.filter((edge) => edge.claim_id === claim.claim_id && declared.has(edge.evidence_edge_id));
}

function directSupport(context: SemanticContext, claim: Claim): boolean {
  return edgesForClaim(context, claim).some((edge) => {
    if (edge.relationship !== "supports" && edge.relationship !== "qualifies") return false;
    const evidence = context.report.evidence_items.find((item) => item.evidence_item_id === edge.evidence_item_id);
    if (evidence === undefined || !evidenceAdmissible(context, evidence)) return false;
    if (claim.support_status === "supported") return edge.relationship === "supports" && evidence.evidence_status === "active";
    return true;
  });
}

function knownNonemptyStringArray(value: unknown): boolean {
  const known = knownFieldValue(value);
  return Array.isArray(known) && known.length > 0 &&
    known.every((item) => typeof item === "string" && item.trim().length > 0);
}

function stepHasRequiredReasoning(step: ArgumentStep, claim: Claim): boolean {
  if (claim.claim_type !== "causal" && claim.claim_type !== "mechanistic") return true;
  const rationale = knownFieldValue(step.rule_or_rationale);
  return typeof rationale === "string" && rationale.trim().length > 0 &&
    knownNonemptyStringArray(step.assumption_states) &&
    knownNonemptyStringArray(step.alternative_explanations);
}

function stepConcludesClaim(context: SemanticContext, step: ArgumentStep, claim: Claim): boolean {
  const ids = new Set(step.conclusion_edge_ids);
  return context.report.argument_edges.some((edge) =>
    ids.has(edge.argument_edge_id) &&
    edge.source_type === "argument_step" &&
    edge.source_id === step.argument_step_id &&
    edge.target_type === "claim" &&
    edge.target_id === claim.claim_id,
  );
}

function argumentSupport(
  context: SemanticContext,
  claim: Claim,
  claimStack: Set<string>,
  stepStack: Set<string>,
): boolean {
  if (claimStack.has(claim.claim_id)) return false;
  const nextClaimStack = new Set(claimStack).add(claim.claim_id);
  return claim.argument_step_ids.some((stepId) => {
    if (stepStack.has(stepId)) return false;
    const step = context.report.argument_steps.find((candidate) => candidate.argument_step_id === stepId);
    if (step === undefined || !stepConcludesClaim(context, step, claim)) return false;
    if (step.validity_status !== "valid_for_scope" && step.validity_status !== "qualified") return false;
    if (claim.support_status === "supported" && step.validity_status !== "valid_for_scope") return false;
    if (step.rule_or_rationale.state !== "known" && step.rule_or_rationale.state !== "withheld") return false;
    if (!stepHasRequiredReasoning(step, claim)) return false;
    const nextStepStack = new Set(stepStack).add(stepId);
    const premiseIds = new Set(step.premise_edge_ids);
    const premiseEdges = context.report.argument_edges.filter((edge) =>
      premiseIds.has(edge.argument_edge_id) && edge.target_type === "argument_step" && edge.target_id === step.argument_step_id,
    );
    if (premiseEdges.length !== premiseIds.size) return false;
    return premiseEdges.every((edge) => {
      if (edge.source_type === "evidence_item") {
        const evidence = context.report.evidence_items.find((item) => item.evidence_item_id === edge.source_id);
        return evidence !== undefined && evidenceAdmissible(context, evidence) &&
          (claim.support_status !== "supported" || evidence.evidence_status === "active");
      }
      if (edge.source_type === "claim") {
        const upstream = context.report.claims.find((item) => item.claim_id === edge.source_id);
        return upstream !== undefined &&
          (upstream.support_status === "supported" || upstream.support_status === "qualified") &&
          (claim.support_status !== "supported" || upstream.support_status === "supported") &&
          admissibleSupport(context, upstream, nextClaimStack, nextStepStack);
      }
      return false;
    });
  });
}

function admissibleSupport(
  context: SemanticContext,
  claim: Claim,
  claimStack: Set<string>,
  stepStack: Set<string>,
): boolean {
  if (claim.support_status !== "supported" && claim.support_status !== "qualified") return false;
  const reasoned = argumentSupport(context, claim, claimStack, stepStack);
  if (claim.claim_type === "causal" || claim.claim_type === "mechanistic") return reasoned;
  return directSupport(context, claim) || reasoned;
}

export function claimHasAdmissibleSupport(context: SemanticContext, claim: Claim): boolean {
  return admissibleSupport(context, claim, new Set(), new Set());
}

interface ResolutionAssessmentResult {
  gaps: string[];
  affectedIds: string[];
}

function assessResolvedQuestion(context: SemanticContext, questionIndex: number): ResolutionAssessmentResult {
  const question = context.report.research_questions[questionIndex]!;
  if (question.resolution_status !== "resolved") return { gaps: [], affectedIds: [] };
  const questionRecord = question as unknown as UnknownRecord;
  const assessmentsValue = questionRecord.resolution_criterion_assessments;
  const assessments = Array.isArray(assessmentsValue) ? assessmentsValue.map(record).filter((item): item is UnknownRecord => item !== null) : [];
  const gaps: string[] = [];
  const affected = new Set<string>([question.research_question_id, ...question.claim_ids]);
  const criterion = knownFieldValue(question.resolution_criteria);
  if (assessments.length === 0) gaps.push("no structured resolution-criterion assessment is recorded");

  for (const [assessmentIndex, assessment] of assessments.entries()) {
    const assessmentId = typeof assessment.criterion_assessment_id === "string"
      ? assessment.criterion_assessment_id
      : `assessment[${assessmentIndex}]`;
    affected.add(assessmentId);
    if (assessment.assessment_status !== "satisfied") {
      gaps.push(`${assessmentId} status is ${String(assessment.assessment_status)}`);
    }
    const assessedCriterion = knownFieldValue(assessment.criterion);
    if (criterion === undefined || assessedCriterion === undefined || !stableEqual(criterion, assessedCriterion)) {
      gaps.push(`${assessmentId} is not tied to the recorded resolution criterion`);
    }
    const blockerIds = stringArray(assessment.unresolved_blocker_ids);
    blockerIds.forEach((id) => affected.add(id));
    if (blockerIds.length > 0) gaps.push(`${assessmentId} retains unresolved blockers: ${blockerIds.join(", ")}`);
    const satisfyingIds = stringArray(assessment.satisfying_claim_ids);
    satisfyingIds.forEach((id) => affected.add(id));
    const admissible = satisfyingIds.filter((claimId) => {
      if (!question.claim_ids.includes(claimId)) return false;
      const claim = context.report.claims.find((candidate) => candidate.claim_id === claimId);
      return claim !== undefined && claimHasAdmissibleSupport(context, claim);
    });
    if (admissible.length === 0) {
      gaps.push(`${assessmentId} has no admissibly supported or qualified satisfying claim`);
    }
  }

  const unresolvedLimitations = context.report.limitations.filter(
    (limitation) => question.limitation_ids.includes(limitation.limitation_id) &&
      (limitation.resolution_status === "open" || limitation.resolution_status === "unknown"),
  );
  for (const limitation of unresolvedLimitations) affected.add(limitation.limitation_id);
  if (unresolvedLimitations.length > 0) {
    gaps.push(`linked unresolved limitations remain: ${unresolvedLimitations.map((item) => item.limitation_id).join(", ")}`);
  }
  const relevantIds = new Set([question.research_question_id, ...question.claim_ids]);
  const openReviewTasks = context.report.review_tasks.filter(
    (task) => task.status === "open" && task.affected_object_ids.some((id) => relevantIds.has(id)),
  );
  for (const task of openReviewTasks) affected.add(task.review_task_id);
  if (openReviewTasks.length > 0) {
    gaps.push(`linked review blockers remain open: ${openReviewTasks.map((item) => item.review_task_id).join(", ")}`);
  }
  return { gaps: [...new Set(gaps)], affectedIds: [...affected] };
}

export function evaluateCLM001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.claims.forEach((claim, index) => {
    if (claim.claim_type === "background") return;
    if (claim.support_status !== "supported" && claim.support_status !== "qualified") return;
    if (!claimHasAdmissibleSupport(context, claim)) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("claims", index),
        affectedObjectIds: [claim.claim_id, ...claim.evidence_edge_ids, ...claim.argument_step_ids],
        sourceBindings: claim.source_bindings,
      }));
    }
  });
  context.report.research_questions.forEach((question, index) => {
    if (question.resolution_status !== "resolved") return;
    const assessment = assessResolvedQuestion(context, index);
    if (assessment.gaps.length === 0) return;
    findings.push(finding({
      rule,
      effectiveSeverity: severity,
      pointer: pointer("research_questions", index, "resolution_status"),
      affectedObjectIds: assessment.affectedIds,
      sourceBindings: question.source_bindings,
      message: `Resolved research question lacks criterion-bound admissible support: ${assessment.gaps.join("; ")}.`,
      details: { gaps: assessment.gaps },
    }));
  });
  return findings;
}

export function evaluateCLM002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const edges = new Map<string, string[]>();
  for (const claim of context.report.claims) edges.set(`claim:${claim.claim_id}`, []);
  for (const step of context.report.argument_steps) edges.set(`step:${step.argument_step_id}`, []);
  for (const dependency of context.report.claim_dependencies) {
    const source = `claim:${dependency.upstream_claim_id}`;
    const targets = edges.get(source) ?? [];
    targets.push(`claim:${dependency.downstream_claim_id}`);
    edges.set(source, targets);
  }
  for (const edge of context.report.argument_edges) {
    const source = edge.source_type === "argument_step" ? `step:${edge.source_id}` : edge.source_type === "claim" ? `claim:${edge.source_id}` : null;
    const target = edge.target_type === "argument_step" ? `step:${edge.target_id}` : `claim:${edge.target_id}`;
    if (source === null) continue;
    const targets = edges.get(source) ?? [];
    targets.push(target);
    edges.set(source, targets);
  }
  const cycle = findDirectedCycle(edges.keys(), edges);
  if (cycle === null) return [];
  const ids = cycle.cycle.map((value) => value.slice(value.indexOf(":") + 1));
  return [finding({ rule, effectiveSeverity: severity, pointer: "/claim_dependencies", affectedObjectIds: ids, message: `Claim/argument dependency graph contains a cycle: ${ids.join(" -> ")}.` })];
}

function addDomain(domainsById: Map<string, Set<string>>, id: string, domain: string): void {
  if (domain === "core" || domain === "cross_domain" || domain.trim().length === 0) return;
  const domains = domainsById.get(id) ?? new Set<string>();
  domains.add(domain);
  domainsById.set(id, domains);
}

function collectKnownIds(value: unknown, knownIds: ReadonlySet<string>, output: Set<string>, seen: Set<object>): void {
  if (typeof value === "string") {
    if (knownIds.has(value)) output.add(value);
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectKnownIds(item, knownIds, output, seen));
    return;
  }
  Object.values(value).forEach((item) => collectKnownIds(item, knownIds, output, seen));
}

function domainAssignments(context: SemanticContext): Map<string, Set<string>> {
  const assignments = new Map<string, Set<string>>();
  const domainPayloads = (context.report.extensions as UnknownRecord).domain_payloads;
  if (Array.isArray(domainPayloads)) {
    for (const value of domainPayloads) {
      const payload = record(value);
      if (payload === null || typeof payload.domain !== "string") continue;
      const ids = new Set<string>();
      collectKnownIds(payload, context.knownIds, ids, new Set<object>());
      ids.forEach((id) => addDomain(assignments, id, payload.domain as string));
    }
  }
  const domainKeys = ["domain", "source_domain", "target_domain"];
  for (const [id, value] of context.objectById) {
    const object = value as unknown as UnknownRecord;
    const extension = record(object.extensions);
    for (const key of domainKeys) {
      const candidate = object[key] ?? extension?.[key];
      if (typeof candidate === "string") addDomain(assignments, id, candidate);
    }
    const domains = object.domains ?? extension?.domains;
    stringArray(domains).forEach((domain) => addDomain(assignments, id, domain));
  }
  return assignments;
}

function inferredEntityDomains(context: SemanticContext, entityId: string): string[] {
  const entity = context.report.entities.find((candidate) => candidate.entity_id === entityId);
  if (entity === undefined) return [];
  const kind = entity.entity_kind.toLowerCase();
  const domains: string[] = [];
  if (/(?:simulat|trajectory|force.?field|molecular.?dynamics|computational.?structure|in.?silico)/u.test(kind)) domains.push("molecular_dynamics");
  if (/(?:assay|specimen|sample|donor|cell|culture|organism|wet.?lab|experimental.?construct)/u.test(kind)) domains.push("wet_lab");
  if (/(?:model|training|validation|test.?set|machine.?learning|ai.?ml)/u.test(kind)) domains.push("ai_ml");
  return domains;
}

interface ClaimDomainClosure {
  domains: Set<string>;
  crossDomainStepDomains: Map<string, Set<string>>;
}

function domainsForClaim(context: SemanticContext, claim: Claim, assignments: Map<string, Set<string>>): ClaimDomainClosure {
  const crossDomainStepDomains = new Map<string, Set<string>>();
  const claimMemo = new Map<string, Set<string>>();
  const stepMemo = new Map<string, Set<string>>();
  const addForId = (domains: Set<string>, id: string): void => {
    assignments.get(id)?.forEach((domain) => domains.add(domain));
  };
  const evidenceDomains = (evidenceId: string): Set<string> => {
    const domains = new Set<string>();
    addForId(domains, evidenceId);
    const evidence = context.report.evidence_items.find((item) => item.evidence_item_id === evidenceId);
    if (evidence === undefined) return domains;
    [
      ...evidence.result_ids,
      ...evidence.artifact_ids,
      ...evidence.data_slice_ids,
      ...evidence.derivation_ids,
      ...evidence.analysis_run_ids,
      ...evidence.source_item_ids,
    ].forEach((id) => addForId(domains, id));
    for (const resultId of evidence.result_ids) {
      const result = context.report.results.find((item) => item.result_id === resultId);
      if (result !== undefined) addForId(domains, result.work_unit_id);
    }
    return domains;
  };
  const visitClaim = (claimId: string, activeClaims: Set<string>, activeSteps: Set<string>): Set<string> => {
    const cached = claimMemo.get(claimId);
    if (cached !== undefined) return new Set(cached);
    if (activeClaims.has(claimId)) return new Set();
    const current = context.report.claims.find((candidate) => candidate.claim_id === claimId);
    if (current === undefined) return new Set();
    const nextClaims = new Set(activeClaims).add(claimId);
    const domains = new Set<string>();
    addForId(domains, claimId);
    for (const subject of current.subject_bindings) {
      addForId(domains, subject.object_id);
      inferredEntityDomains(context, subject.object_id).forEach((domain) => domains.add(domain));
    }
    for (const edge of edgesForClaim(context, current)) {
      evidenceDomains(edge.evidence_item_id).forEach((domain) => domains.add(domain));
    }
    for (const stepId of current.argument_step_ids) {
      visitStep(stepId, nextClaims, activeSteps).forEach((domain) => domains.add(domain));
    }
    claimMemo.set(claimId, new Set(domains));
    return domains;
  };
  const visitStep = (stepId: string, activeClaims: Set<string>, activeSteps: Set<string>): Set<string> => {
    const cached = stepMemo.get(stepId);
    if (cached !== undefined) return new Set(cached);
    if (activeSteps.has(stepId)) return new Set();
    const step = context.report.argument_steps.find((candidate) => candidate.argument_step_id === stepId);
    if (step === undefined) return new Set();
    const nextSteps = new Set(activeSteps).add(stepId);
    const domains = new Set<string>();
    addForId(domains, stepId);
    const premiseIds = new Set(step.premise_edge_ids);
    const premiseEdges = context.report.argument_edges.filter((edge) =>
      premiseIds.has(edge.argument_edge_id) && edge.target_type === "argument_step" && edge.target_id === stepId,
    );
    for (const edge of premiseEdges) {
      if (edge.source_type === "evidence_item") {
        evidenceDomains(edge.source_id).forEach((domain) => domains.add(domain));
      } else if (edge.source_type === "claim") {
        visitClaim(edge.source_id, activeClaims, nextSteps).forEach((domain) => domains.add(domain));
      } else {
        visitStep(edge.source_id, activeClaims, nextSteps).forEach((domain) => domains.add(domain));
      }
    }
    if (domains.size > 1) crossDomainStepDomains.set(stepId, new Set(domains));
    stepMemo.set(stepId, new Set(domains));
    return domains;
  };

  return {
    domains: visitClaim(claim.claim_id, new Set(), new Set()),
    crossDomainStepDomains,
  };
}

function mappingBindingValid(context: SemanticContext, value: unknown): boolean {
  const binding = record(value);
  if (binding === null || typeof binding.source_item_id !== "string") return false;
  const source = context.report.source_coverage.items.find((item) => item.source_item_id === binding.source_item_id);
  if (source?.disposition !== "included") return false;
  const immutable = typeof binding.content_hash === "string" || typeof binding.excerpt_hash === "string" || source.content_hash.state === "known";
  const snapshot = typeof binding.source_snapshot_id === "string" &&
    context.report.source_coverage.snapshots.some((item) => item.source_snapshot_id === binding.source_snapshot_id);
  return immutable && snapshot;
}

function assessContextAlignment(
  context: SemanticContext,
  bridgeId: string,
  bridgeRecord: UnknownRecord,
  dimension: string,
  supported: boolean,
): string[] {
  const assessment = record(bridgeRecord[`${dimension}_alignment`]);
  if (assessment === null) return [`${bridgeId} lacks typed ${dimension} alignment`];
  const state = assessment.alignment;
  const gaps: string[] = [];
  if (state === "unknown" || state === "withheld") gaps.push(`${bridgeId} has unverifiable ${dimension} alignment`);
  else if (state === "mismatched") gaps.push(`${bridgeId} has a material ${dimension} mismatch`);
  else if (state === "partially_matched" && supported) gaps.push(`${bridgeId} requires a ${dimension} qualification`);
  else if (!["matched", "bounded", "transformed", "partially_matched", "not_applicable"].includes(String(state))) gaps.push(`${bridgeId} has invalid ${dimension} alignment state ${String(state)}`);
  if (["matched", "bounded", "transformed"].includes(String(state))) {
    if (knownFieldValue(assessment.source_value) === undefined || knownFieldValue(assessment.target_value) === undefined) {
      gaps.push(`${bridgeId} lacks source/target values for ${dimension} alignment`);
    }
    if (knownFieldValue(assessment.transformation) === undefined) {
      gaps.push(`${bridgeId} lacks a known ${dimension} transformation or identity mapping`);
    }
  }
  const bindings = Array.isArray(assessment.mapping_evidence_bindings) ? assessment.mapping_evidence_bindings : [];
  if (bindings.length === 0 || !bindings.every((binding) => mappingBindingValid(context, binding))) {
    gaps.push(`${bridgeId} lacks immutable source-bound ${dimension} mapping evidence`);
  }
  return gaps;
}

function bridgeNetworkCovers(domains: ReadonlySet<string>, linked: readonly { source_domain: string; target_domain: string }[]): boolean {
  if (domains.size < 2) return true;
  const required = [...domains];
  const visited = new Set<string>([required[0]!]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const bridge of linked) {
      if (visited.has(bridge.source_domain) && !visited.has(bridge.target_domain)) {
        visited.add(bridge.target_domain);
        changed = true;
      }
      if (visited.has(bridge.target_domain) && !visited.has(bridge.source_domain)) {
        visited.add(bridge.source_domain);
        changed = true;
      }
    }
  }
  return required.every((domain) => visited.has(domain));
}

function crossDomainTransferType(context: SemanticContext, claim: Claim): string | undefined {
  const candidates: unknown[] = [];
  const collect = (value: unknown): void => {
    const candidate = record(value);
    if (candidate === null) return;
    candidates.push(candidate.transfer_type, candidate.mapping_type);
    const extension = record(candidate.extensions);
    if (extension !== null) candidates.push(extension.transfer_type, extension.mapping_type);
  };
  collect(claim);
  claim.subject_bindings.forEach((subject) => collect(context.objectById.get(subject.object_id)));
  edgesForClaim(context, claim).forEach((edge) => {
    collect(context.report.evidence_items.find((item) => item.evidence_item_id === edge.evidence_item_id));
  });
  claim.argument_step_ids.forEach((id) => collect(context.report.argument_steps.find((item) => item.argument_step_id === id)));
  return candidates.find((value): value is string =>
    typeof value === "string" && /(?:cross.?domain|computational.?to.?experimental|model.?to.?target|simulation.?to.?assay)/iu.test(value));
}

export function evaluateBRG001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const bridges = new Map(context.report.cross_domain_bridges.map((bridge) => [bridge.bridge_id, bridge]));
  const assignments = domainAssignments(context);
  context.report.claims.forEach((claim, index) => {
    if (claim.support_status !== "supported" && claim.support_status !== "qualified") return;
    const domainClosure = domainsForClaim(context, claim, assignments);
    const derivedDomains = domainClosure.domains;
    const transferType = crossDomainTransferType(context, claim);
    const bridgeRequired = derivedDomains.size > 1 || transferType !== undefined;
    if (!bridgeRequired && claim.cross_domain_bridge_ids.length === 0) return;

    const linked = claim.cross_domain_bridge_ids.map((id) => bridges.get(id)).filter((bridge) => bridge !== undefined);
    const gaps: string[] = [];
    if (bridgeRequired && claim.cross_domain_bridge_ids.length === 0) {
      gaps.push(`no bridge is declared for derived domains ${[...derivedDomains].sort().join(" -> ") || String(transferType)}`);
    }
    if (linked.length !== claim.cross_domain_bridge_ids.length) gaps.push("one or more bridge identifiers do not resolve");
    if (bridgeRequired && !bridgeNetworkCovers(derivedDomains, linked)) {
      gaps.push(`declared bridges do not connect derived domains ${[...derivedDomains].sort().join(", ")}`);
    }
    for (const [stepId, stepDomains] of domainClosure.crossDomainStepDomains) {
      const enablingBridges = linked.filter((bridge) =>
        bridge.enabled_argument_step_ids.includes(stepId) &&
        bridgeNetworkCovers(stepDomains, [bridge]),
      );
      if (enablingBridges.length === 0) {
        gaps.push(`cross-domain premise step ${stepId} is not enabled by a bridge connecting ${[...stepDomains].sort().join(", ")}`);
      }
    }
    const relevantStepIds = new Set([
      ...claim.argument_step_ids,
      ...domainClosure.crossDomainStepDomains.keys(),
    ]);
    for (const bridge of linked) {
      if (bridge.source_domain === bridge.target_domain) gaps.push(`${bridge.bridge_id} does not cross domains`);
      const sourceEntityIds = new Set(bridge.source_entity_version_ids.map((reference) => `${reference.object_id}@${reference.object_version}`));
      const targetEntityIds = new Set(bridge.target_entity_version_ids.map((reference) => `${reference.object_id}@${reference.object_version}`));
      for (const subject of claim.subject_bindings) {
        const subjectDomains = new Set(assignments.get(subject.object_id) ?? []);
        inferredEntityDomains(context, subject.object_id).forEach((domain) => subjectDomains.add(domain));
        const versionedId = `${subject.object_id}@${subject.object_version}`;
        if (subjectDomains.has(bridge.source_domain) && !sourceEntityIds.has(versionedId)) {
          gaps.push(`${bridge.bridge_id} source mapping omits claim entity ${versionedId}`);
        }
        if (subjectDomains.has(bridge.target_domain) && !targetEntityIds.has(versionedId)) {
          gaps.push(`${bridge.bridge_id} target mapping omits claim entity ${versionedId}`);
        }
      }
      if (claim.support_status === "supported" && bridge.validity_status !== "valid") gaps.push(`${bridge.bridge_id} status is ${bridge.validity_status}`);
      if (claim.support_status === "qualified" && bridge.validity_status !== "valid" && bridge.validity_status !== "qualified") gaps.push(`${bridge.bridge_id} status is ${bridge.validity_status}`);
      const alignments = [
        ["identity", bridge.identity_alignment],
        ["construct", bridge.construct_alignment],
        ["condition", bridge.condition_alignment],
        ["scale", bridge.scale_alignment],
      ] as const;
      for (const [dimension, state] of alignments) {
        if (state === "unknown" || state === "withheld") gaps.push(`${bridge.bridge_id} has unverifiable ${dimension} alignment`);
        if (state === "mismatched") gaps.push(`${bridge.bridge_id} has a material ${dimension} mismatch`);
        if (claim.support_status === "supported" && state === "partially_matched") gaps.push(`${bridge.bridge_id} requires a ${dimension} qualification`);
      }
      const bridgeRecord = bridge as unknown as UnknownRecord;
      for (const dimension of ["intervention", "dose", "endpoint", "time", "state"]) {
        gaps.push(...assessContextAlignment(context, bridge.bridge_id, bridgeRecord, dimension, claim.support_status === "supported"));
      }
      if (bridge.transformation_or_mapping_evidence.state !== "known" || bridge.transformation_or_mapping_evidence.source_bindings.length === 0) {
        gaps.push(`${bridge.bridge_id} lacks known source-bound mapping evidence`);
      }
      if (bridge.reviewer_state !== "reviewed") gaps.push(`${bridge.bridge_id} has reviewer state ${bridge.reviewer_state}`);
      const enabled = new Set(bridge.enabled_argument_step_ids);
      if (![...relevantStepIds].some((id) => enabled.has(id))) gaps.push(`${bridge.bridge_id} is not connected to an argument step in this claim's premise closure`);
    }
    if (gaps.length > 0) {
      const uniqueGaps = [...new Set(gaps)];
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("claims", index, "cross_domain_bridge_ids"),
        affectedObjectIds: [claim.claim_id, ...claim.cross_domain_bridge_ids],
        message: `Cross-domain ${claim.claim_type} claim lacks a valid bridge: ${uniqueGaps.join("; ")}.`,
        details: { gaps: uniqueGaps, derived_domains: [...derivedDomains].sort() },
      }));
    }
  });
  return findings;
}

interface EvidenceAncestry {
  keys: Set<string>;
}

function evidenceAncestry(context: SemanticContext, evidence: EvidenceItem): EvidenceAncestry {
  const keys = new Set<string>();
  const visited = new Set<string>();
  const addObject = (id: string): void => {
    keys.add(id);
  };
  const visitMaterial = (materialId: string): void => {
    const token = `material:${materialId}`;
    if (visited.has(token)) return;
    visited.add(token);
    addObject(materialId);
    const material = context.report.materials.find((candidate) => candidate.material_id === materialId);
    if (material !== undefined) keys.add(`material-entity:${material.entity_id}`);
    for (const relationship of context.report.material_relationships) {
      if (!relationship.output_material_ids.includes(materialId)) continue;
      addObject(relationship.relationship_id);
      relationship.input_material_ids.forEach(visitMaterial);
    }
  };
  const visitPopulation = (populationId: string): void => {
    const token = `population:${populationId}`;
    if (visited.has(token)) return;
    visited.add(token);
    addObject(populationId);
    const population = context.report.analysis_populations.find((candidate) => candidate.analysis_population_id === populationId);
    if (population === undefined) return;
    for (const member of population.members.filter((candidate) => candidate.inclusion_status === "included")) {
      const group = knownFieldValue(member.group_key);
      if (typeof group === "string" && group.trim().length > 0) keys.add(`biological-group:${group.trim()}`);
      if (member.material_id !== null) visitMaterial(member.material_id);
      else if ((typeof group !== "string" || group.trim().length === 0) && member.entity_id !== null) {
        keys.add(`population-entity:${member.entity_id}`);
      }
    }
  };
  const visitSlice = (sliceId: string): void => {
    const token = `slice:${sliceId}`;
    if (visited.has(token)) return;
    visited.add(token);
    addObject(sliceId);
    const slice = context.report.data_slices.find((candidate) => candidate.data_slice_id === sliceId);
    if (slice === undefined) return;
    if (slice.analysis_population_id !== null) visitPopulation(slice.analysis_population_id);
    slice.input_artifacts.forEach((binding) => addObject(binding.artifact_id));
    if (slice.created_by_derivation_id !== null) visitDerivation(slice.created_by_derivation_id);
  };
  const visitDerivation = (derivationId: string): void => {
    const token = `derivation:${derivationId}`;
    if (visited.has(token)) return;
    visited.add(token);
    addObject(derivationId);
    const derivation = context.report.derivations.find((candidate) => candidate.derivation_id === derivationId);
    if (derivation === undefined) return;
    derivation.input_data_slice_ids.forEach(visitSlice);
    derivation.input_derivation_ids.forEach(visitDerivation);
    derivation.input_artifact_ids.forEach(addObject);
    if (derivation.analysis_run_id !== null) visitRun(derivation.analysis_run_id);
  };
  const visitRun = (runId: string): void => {
    const token = `run:${runId}`;
    if (visited.has(token)) return;
    visited.add(token);
    addObject(runId);
    const run = context.report.analysis_runs.find((candidate) => candidate.analysis_run_id === runId);
    if (run === undefined) return;
    run.input_data_slice_ids.forEach(visitSlice);
    run.input_derivation_ids.forEach(visitDerivation);
    run.code_artifacts.forEach((binding) => addObject(binding.artifact_id));
    addObject(run.random_state_id);
  };
  const visitResult = (resultId: string): void => {
    const token = `result:${resultId}`;
    if (visited.has(token)) return;
    visited.add(token);
    addObject(resultId);
    const result = context.report.results.find((candidate) => candidate.result_id === resultId);
    if (result === undefined) return;
    if (result.analysis_population_id !== null) visitPopulation(result.analysis_population_id);
    result.data_slice_ids.forEach(visitSlice);
    result.derivation_ids.forEach(visitDerivation);
    result.analysis_run_ids.forEach(visitRun);
    result.output_artifact_ids.forEach(addObject);
    if (result.attempt_id !== null) {
      const attempt = context.report.attempts.find((candidate) => candidate.attempt_id === result.attempt_id);
      attempt?.input_material_ids.forEach(visitMaterial);
    }
  };

  evidence.result_ids.forEach(visitResult);
  evidence.artifact_ids.forEach(addObject);
  evidence.data_slice_ids.forEach(visitSlice);
  evidence.derivation_ids.forEach(visitDerivation);
  evidence.analysis_run_ids.forEach(visitRun);
  if (["source_statement", "external_evidence"].includes(evidence.evidence_kind)) {
    evidence.source_item_ids.forEach(addObject);
  }
  return { keys };
}

function sharedEvidenceAncestors(context: SemanticContext, left: EvidenceItem, right: EvidenceItem): string[] {
  const leftAncestry = evidenceAncestry(context, left);
  const rightAncestry = evidenceAncestry(context, right);
  return [...rightAncestry.keys].filter((id) => leftAncestry.keys.has(id)).sort();
}

export function evaluateDEP001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const evidence = new Map(context.report.evidence_items.map((item) => [item.evidence_item_id, item]));
  const groups = new Map(context.report.evidence_dependency_groups.map((group) => [group.dependency_group_id, group]));
  const independentWording = /\b(?:independent(?:ly)?|replicat(?:ed|ion)|corroborat(?:ed|ion))\b|独立(?:重复|复现|证据)|复现|重复验证/iu;
  context.report.evidence_dependency_groups.forEach((group, groupIndex) => {
    const declared = new Set(group.evidence_item_ids);
    const reciprocal = context.report.evidence_items.filter((item) => item.dependency_group_ids.includes(group.dependency_group_id));
    const reciprocalIds = new Set(reciprocal.map((item) => item.evidence_item_id));
    const membershipMismatch = [...declared].some((id) => !reciprocalIds.has(id)) ||
      [...reciprocalIds].some((id) => !declared.has(id));
    if (membershipMismatch) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("evidence_dependency_groups", groupIndex, "evidence_item_ids"),
        affectedObjectIds: [group.dependency_group_id, ...declared, ...reciprocalIds],
        message: "Evidence dependency-group membership is not reciprocal between the group and its evidence items.",
      }));
    }
    const members = [...declared].map((id) => evidence.get(id)).filter((item) => item !== undefined);
    for (let left = 0; left < members.length; left += 1) {
      for (let right = left + 1; right < members.length; right += 1) {
        const shared = sharedEvidenceAncestors(context, members[left]!, members[right]!);
        if (shared.length === 0) continue;
        const resolvableShared = shared.filter((id) => context.knownIds.has(id));
        const omitted = resolvableShared.filter((id) => !group.shared_ancestor_ids.includes(id));
        if (group.assessment_state === "independent" || omitted.length > 0) {
          findings.push(finding({
            rule,
            effectiveSeverity: severity,
            pointer: pointer("evidence_dependency_groups", groupIndex, "assessment_state"),
            affectedObjectIds: [group.dependency_group_id, members[left]!.evidence_item_id, members[right]!.evidence_item_id, ...resolvableShared],
            message: group.assessment_state === "independent"
              ? "An evidence dependency group is marked independent despite shared population, material, or computational ancestry."
              : "An evidence dependency group omits resolved shared ancestors from shared_ancestor_ids.",
            details: { shared_ancestor_ids: shared, omitted_shared_ancestor_ids: omitted },
          }));
        }
      }
    }
  });
  context.report.claims.forEach((claim, claimIndex) => {
    const links = edgesForClaim(context, claim).filter((edge) => edge.relationship === "supports" || edge.relationship === "qualifies");
    for (let leftIndex = 0; leftIndex < links.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < links.length; rightIndex += 1) {
        const leftEdge = links[leftIndex]!;
        const rightEdge = links[rightIndex]!;
        const leftEvidence = evidence.get(leftEdge.evidence_item_id);
        const rightEvidence = evidence.get(rightEdge.evidence_item_id);
        if (leftEvidence === undefined || rightEvidence === undefined) continue;
        const shared = sharedEvidenceAncestors(context, leftEvidence, rightEvidence);
        if (shared.length > 0 && leftEdge.dependency_group_id !== rightEdge.dependency_group_id) {
          findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("claims", claimIndex, "evidence_edge_ids"), affectedObjectIds: [claim.claim_id, leftEvidence.evidence_item_id, rightEvidence.evidence_item_id, ...shared], message: "Evidence with a shared ancestor is assigned to different dependency groups.", details: { shared_ancestor_ids: shared } }));
        }
      }
    }
    if (independentWording.test(claim.proposition)) {
      const declaredGroups = links.map((edge) => edge.dependency_group_id).filter((id): id is string => id !== null);
      const assessed = [...new Set(declaredGroups)].map((id) => groups.get(id));
      if (declaredGroups.length !== links.length || assessed.length < 2 || assessed.some((group) => group === undefined || group.assessment_state !== "independent")) {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("claims", claimIndex, "proposition"), affectedObjectIds: [claim.claim_id, ...links.map((edge) => edge.evidence_item_id)], message: "Claim uses independence or replication wording without at least two explicit independent evidence groups." }));
      }
    }
  });
  return findings;
}

const EFFECT_INCOMPATIBILITY: Readonly<Record<ScientificEffectClass, readonly ScientificEffectClass[]>> = {
  increase: ["decrease", "no_detectable_effect", "equivalent", "effect_present_direction_uncertain"],
  decrease: ["increase", "no_detectable_effect", "equivalent", "effect_present_direction_uncertain"],
  no_detectable_effect: ["increase", "decrease", "effect_present_direction_uncertain"],
  equivalent: ["increase", "decrease", "heterogeneous", "effect_present_direction_uncertain"],
  heterogeneous: ["equivalent"],
  effect_present_direction_uncertain: ["increase", "decrease", "no_detectable_effect", "equivalent"],
  not_estimated: [],
  unknown: [],
  not_applicable: [],
  withheld: [],
};

const DECISION_INCOMPATIBILITY: Readonly<Record<StatisticalDecision, readonly StatisticalDecision[]>> = {
  reject_null: ["do_not_reject_null", "equivalent", "noninferior", "inconclusive", "descriptive_only", "not_performed"],
  do_not_reject_null: ["reject_null", "equivalent", "noninferior", "inconclusive", "descriptive_only", "not_performed"],
  equivalent: ["reject_null", "do_not_reject_null", "inconclusive", "descriptive_only", "not_performed"],
  noninferior: ["reject_null", "do_not_reject_null", "inconclusive", "descriptive_only", "not_performed"],
  inconclusive: ["reject_null", "do_not_reject_null", "equivalent", "noninferior", "descriptive_only", "not_performed"],
  descriptive_only: ["reject_null", "do_not_reject_null", "equivalent", "noninferior", "inconclusive"],
  not_performed: ["reject_null", "do_not_reject_null", "equivalent", "noninferior", "inconclusive"],
  unknown: [],
  not_applicable: [],
  withheld: [],
};

function incompatibleOnAxis<T extends string>(matrix: Readonly<Record<T, readonly T[]>>, left: T, right: T): boolean {
  return matrix[left].includes(right) || matrix[right].includes(left);
}

function contextFieldNotDemonstrablyDifferent(left: unknown, right: unknown): boolean {
  const leftValue = knownFieldValue(left);
  const rightValue = knownFieldValue(right);
  if (leftValue === undefined || rightValue === undefined) return true;
  return stableEqual(leftValue, rightValue);
}

function optionalContextMatches(left: UnknownRecord, right: UnknownRecord, key: string): boolean {
  const leftPresent = Object.hasOwn(left, key);
  const rightPresent = Object.hasOwn(right, key);
  if (!leftPresent || !rightPresent) return true;
  return contextFieldNotDemonstrablyDifferent(left[key], right[key]);
}

function resultContextsMatch(left: Result, right: Result): boolean {
  if (!contextFieldNotDemonstrablyDifferent(left.estimand, right.estimand)) return false;
  if (!contextFieldNotDemonstrablyDifferent(left.population_or_system, right.population_or_system)) return false;
  if (!contextFieldNotDemonstrablyDifferent(left.condition, right.condition)) return false;
  if (!contextFieldNotDemonstrablyDifferent(left.time_or_frame_scope, right.time_or_frame_scope)) return false;
  if (left.analysis_population_id !== null && right.analysis_population_id !== null && left.analysis_population_id !== right.analysis_population_id) return false;
  const leftRecord = left as unknown as UnknownRecord;
  const rightRecord = right as unknown as UnknownRecord;
  for (const key of ["intervention", "dose", "endpoint", "system_state", "comparison_definition"]) {
    if (!optionalContextMatches(leftRecord, rightRecord, key)) return false;
  }
  if (left.effect_estimate !== null && right.effect_estimate !== null) {
    if (!contextFieldNotDemonstrablyDifferent(left.effect_estimate.scale, right.effect_estimate.scale)) return false;
    if (!contextFieldNotDemonstrablyDifferent(left.effect_estimate.unit, right.effect_estimate.unit)) return false;
  }
  return true;
}

const HETEROGENEITY_DIMENSIONS = [
  "estimand",
  "population_or_system",
  "condition",
  "time_or_frame_scope",
  "analysis_population_id",
  "intervention",
  "dose",
  "endpoint",
  "system_state",
  "comparison_definition",
] as const;

type HeterogeneityDimension = typeof HETEROGENEITY_DIMENSIONS[number];

function resultContextField(result: Result, dimension: HeterogeneityDimension): unknown {
  if (dimension === "analysis_population_id") return result.analysis_population_id;
  return (result as unknown as UnknownRecord)[dimension];
}

function resultContextValue(result: Result, dimension: HeterogeneityDimension): unknown {
  const field = resultContextField(result, dimension);
  return dimension === "analysis_population_id" ? field : knownFieldValue(field);
}

function sourceBoundContextValue(context: SemanticContext, result: Result, dimension: HeterogeneityDimension): boolean {
  if (dimension === "analysis_population_id") {
    if (result.analysis_population_id === null) return false;
    const population = context.report.analysis_populations.find((candidate) => candidate.analysis_population_id === result.analysis_population_id);
    return population !== undefined && population.source_bindings.length > 0 &&
      population.source_bindings.every((binding) => mappingBindingValid(context, binding));
  }
  const field = record(resultContextField(result, dimension));
  const bindings = Array.isArray(field?.source_bindings) ? field.source_bindings : [];
  return field?.state === "known" && bindings.length > 0 && bindings.every((binding) => mappingBindingValid(context, binding));
}

function dimensionNamedInConflict(conflict: UnknownRecord, dimension: HeterogeneityDimension): boolean {
  const matched = knownFieldValue(conflict.matched_context);
  const text = `${typeof matched === "string" ? matched : ""} ${String(conflict.incompatibility_statement ?? "")}`;
  const aliases: Readonly<Record<HeterogeneityDimension, RegExp>> = {
    estimand: /\bestimand\b/iu,
    population_or_system: /\b(?:population|system)\b/iu,
    condition: /\bcondition\b/iu,
    time_or_frame_scope: /\b(?:time|frame|interval|duration)\b/iu,
    analysis_population_id: /\banalysis population\b/iu,
    intervention: /\bintervention\b/iu,
    dose: /\b(?:dose|concentration|exposure)\b/iu,
    endpoint: /\b(?:endpoint|outcome|observable)\b/iu,
    system_state: /\b(?:system state|state)\b/iu,
    comparison_definition: /\bcompar(?:ison|ator)\b/iu,
  };
  return aliases[dimension].test(text);
}

function validHeterogeneityDifference(
  context: SemanticContext,
  conflict: UnknownRecord,
  difference: UnknownRecord,
  left: Result,
  right: Result,
): boolean {
  if (!HETEROGENEITY_DIMENSIONS.includes(difference.dimension as HeterogeneityDimension)) return false;
  const dimension = difference.dimension as HeterogeneityDimension;
  const forward = difference.left_result_id === left.result_id && difference.right_result_id === right.result_id;
  const reverse = difference.left_result_id === right.result_id && difference.right_result_id === left.result_id;
  if (!forward && !reverse) return false;
  const registeredLeft = forward ? left : right;
  const registeredRight = forward ? right : left;
  const leftValue = resultContextValue(registeredLeft, dimension);
  const rightValue = resultContextValue(registeredRight, dimension);
  if (leftValue === undefined || rightValue === undefined || stableEqual(leftValue, rightValue)) return false;
  if (!sourceBoundContextValue(context, registeredLeft, dimension) || !sourceBoundContextValue(context, registeredRight, dimension)) return false;
  if (!stableEqual(knownFieldValue(difference.left_value), leftValue) || !stableEqual(knownFieldValue(difference.right_value), rightValue)) return false;
  const materiality = knownFieldValue(difference.materiality_assessment);
  if (typeof materiality !== "string" || materiality.trim().length === 0) return false;
  const bindings = Array.isArray(difference.source_bindings) ? difference.source_bindings : [];
  if (bindings.length === 0 || !bindings.every((binding) => mappingBindingValid(context, binding))) return false;
  return dimensionNamedInConflict(conflict, dimension);
}

function pairRepresentedAsContested(
  context: SemanticContext,
  leftEvidence: readonly string[],
  rightEvidence: readonly string[],
): boolean {
  const leftIds = new Set(leftEvidence);
  const rightIds = new Set(rightEvidence);
  return context.report.claims.some((claim) => {
    if (claim.support_status !== "contested") return false;
    const evidenceIds = new Set(edgesForClaim(context, claim).map((edge) => edge.evidence_item_id));
    return [...leftIds].some((id) => evidenceIds.has(id)) && [...rightIds].some((id) => evidenceIds.has(id));
  });
}

export function evaluateCNF001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const conflictEdges = new Map(context.report.conflict_member_edges.map((edge) => [edge.conflict_member_edge_id, edge]));
  const conflictsByEvidence = new Map<string, string[]>();
  for (const conflict of context.report.conflict_sets) {
    const members = conflict.member_edge_ids.map((id) => conflictEdges.get(id)).filter((edge) => edge !== undefined);
    for (const edge of members) {
      if (edge.member_type !== "evidence_item") continue;
      const ids = conflictsByEvidence.get(edge.member_id) ?? [];
      ids.push(conflict.conflict_set_id);
      conflictsByEvidence.set(edge.member_id, ids);
    }
    if (conflict.adjudication_status === "retained_as_heterogeneity") {
      const memberEvidenceIds = new Set(members.filter((edge) => edge.member_type === "evidence_item").map((edge) => edge.member_id));
      const memberResults = context.report.evidence_items
        .filter((item) => memberEvidenceIds.has(item.evidence_item_id))
        .flatMap((item) => item.result_ids)
        .map((id) => context.report.results.find((result) => result.result_id === id))
        .filter((result): result is Result => result !== undefined && !["excluded", "superseded", "retracted", "pending_review"].includes(result.record_disposition));
      const conflictRecord = conflict as unknown as UnknownRecord;
      const differences = Array.isArray(conflictRecord.heterogeneity_context_differences)
        ? conflictRecord.heterogeneity_context_differences.map(record).filter((item): item is UnknownRecord => item !== null)
        : [];
      const unsupportedPairs: string[][] = [];
      for (let leftIndex = 0; leftIndex < memberResults.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < memberResults.length; rightIndex += 1) {
          const left = memberResults[leftIndex]!;
          const right = memberResults[rightIndex]!;
          const incompatible = incompatibleOnAxis(EFFECT_INCOMPATIBILITY, left.scientific_effect_class, right.scientific_effect_class) ||
            incompatibleOnAxis(DECISION_INCOMPATIBILITY, left.statistical_decision, right.statistical_decision);
          if (!incompatible) continue;
          if (!differences.some((difference) => validHeterogeneityDifference(context, conflictRecord, difference, left, right))) {
            unsupportedPairs.push([left.result_id, right.result_id]);
          }
        }
      }
      if (unsupportedPairs.length > 0 || memberResults.length < 2) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: `/conflict_sets/${context.report.conflict_sets.indexOf(conflict)}/heterogeneity_context_differences`,
          affectedObjectIds: [conflict.conflict_set_id, ...memberResults.map((result) => result.result_id)],
          message: "Conflict retained as heterogeneity lacks a known, source-bound material context difference for every incompatible result pair.",
          details: { unsupported_result_pairs: unsupportedPairs },
        }));
      }
    }
    if (conflict.adjudication_status === "unresolved") {
      const settledClaims = context.report.claims.filter((claim) =>
        conflict.downstream_claim_ids.includes(claim.claim_id) && claim.support_status === "supported");
      if (settledClaims.length > 0) {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: `/conflict_sets/${context.report.conflict_sets.indexOf(conflict)}/downstream_claim_ids`, affectedObjectIds: [conflict.conflict_set_id, ...settledClaims.map((claim) => claim.claim_id)], message: "Unresolved conflict leaves a downstream claim in supported state." }));
      }
    }
    if (conflict.adjudication_status === "resolved_with_rationale" && conflict.decision_event_id === null) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: `/conflict_sets/${context.report.conflict_sets.indexOf(conflict)}/decision_event_id`, affectedObjectIds: [conflict.conflict_set_id], message: "Resolved conflict lacks an adjudication DecisionEvent." }));
    }
  }

  const evidenceByResult = new Map<string, string[]>();
  for (const item of context.report.evidence_items) {
    for (const resultId of item.result_ids) {
      const ids = evidenceByResult.get(resultId) ?? [];
      ids.push(item.evidence_item_id);
      evidenceByResult.set(resultId, ids);
    }
  }
  const conflicts = new Set(context.report.conflict_sets.map((item) => item.conflict_set_id));
  const results = context.report.results.filter((result) => !["excluded", "superseded", "retracted", "pending_review"].includes(result.record_disposition));
  for (let leftIndex = 0; leftIndex < results.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < results.length; rightIndex += 1) {
      const left = results[leftIndex]!;
      const right = results[rightIndex]!;
      if (!resultContextsMatch(left, right)) continue;
      const effectConflict = incompatibleOnAxis(EFFECT_INCOMPATIBILITY, left.scientific_effect_class, right.scientific_effect_class);
      const decisionConflict = incompatibleOnAxis(DECISION_INCOMPATIBILITY, left.statistical_decision, right.statistical_decision);
      if (!effectConflict && !decisionConflict) continue;
      const leftEvidence = evidenceByResult.get(left.result_id) ?? [];
      const rightEvidence = evidenceByResult.get(right.result_id) ?? [];
      const sharedEvidenceConflict = leftEvidence.some((leftId) =>
        rightEvidence.some((rightId) =>
          (conflictsByEvidence.get(leftId) ?? []).some((conflictId) => (conflictsByEvidence.get(rightId) ?? []).includes(conflictId)),
        ),
      );
      const sharedResultConflict = left.conflict_set_ids.some((id) => conflicts.has(id) && right.conflict_set_ids.includes(id));
      const contested = pairRepresentedAsContested(context, leftEvidence, rightEvidence);
      if (!sharedEvidenceConflict && !sharedResultConflict && !contested) {
        const axes = [effectConflict ? "scientific-effect" : null, decisionConflict ? "statistical-decision" : null]
          .filter((axis): axis is string => axis !== null);
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: "/conflict_sets",
          affectedObjectIds: [left.result_id, right.result_id, ...leftEvidence, ...rightEvidence],
          message: `Incompatible active ${axes.join(" and ")} conclusions for the same estimand and matched context are neither in a ConflictSet nor represented by a contested claim.`,
          details: {
            incompatible_axes: axes,
            left_effect: left.scientific_effect_class,
            right_effect: right.scientific_effect_class,
            left_decision: left.statistical_decision,
            right_decision: right.statistical_decision,
          },
        }));
      }
    }
  }
  return findings;
}

export function claimVersion(claim: Claim): string {
  return claim.object_version;
}
