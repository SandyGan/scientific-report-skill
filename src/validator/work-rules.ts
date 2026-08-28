import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import type { Attempt, WorkUnit } from "../lib/types.js";
import { finding, pointer } from "./context.js";
import type { SemanticContext, ValidationFinding } from "./types.js";

function attemptsForUnit(context: SemanticContext, unit: WorkUnit): Attempt[] {
  return context.report.attempts.filter((attempt) => attempt.work_unit_id === unit.work_unit_id);
}

function sourceBindingResolves(context: SemanticContext, binding: Attempt["source_bindings"][number]): boolean {
  const source = context.report.source_coverage.items.find((item) => item.source_item_id === binding.source_item_id);
  const snapshot = context.report.source_coverage.snapshots.some((item) => item.source_snapshot_id === binding.source_snapshot_id);
  return source?.disposition === "included" && snapshot &&
    ((typeof binding.content_hash === "string" && binding.content_hash.length > 0) ||
      (typeof binding.excerpt_hash === "string" && binding.excerpt_hash.length > 0) ||
      source.content_hash.state === "known");
}

function hasSourceBoundNotRetryRelation(context: SemanticContext, later: Attempt, prior: Attempt): boolean {
  return (later.attempt_relations ?? []).some((relation) =>
    relation.relationship === "not_a_retry" &&
    relation.prior_attempt_id === prior.attempt_id &&
    relation.rationale.state === "known" &&
    relation.rationale.value.trim().length > 0 &&
    relation.source_bindings.length > 0 &&
    relation.source_bindings.every((binding) => sourceBindingResolves(context, binding)),
  );
}

function attemptHasMaterialFailure(attempt: Attempt, failuresById: ReadonlyMap<string, SemanticContext["report"]["failures"][number]>): boolean {
  if (attempt.attempt_outcome === "failed" || attempt.attempt_outcome === "aborted") return true;
  if (attempt.attempt_outcome !== "partially_succeeded" && attempt.attempt_outcome !== "cancelled_after_start") return false;
  return attempt.failure_event_ids.some((id) => {
    const failure = failuresById.get(id);
    return failure !== undefined && failure.attempt_id === attempt.attempt_id &&
      ["recoverable", "major", "blocking"].includes(failure.severity);
  });
}

export function evaluateWRK001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.work_units.forEach((unit, index) => {
    if (unit.work_state !== "completed") return;
    const attempts = attemptsForUnit(context, unit);
    const completedAttempts = attempts.filter((attempt) => attempt.attempt_outcome === "succeeded");
    if (unit.completion_criteria.state !== "known") {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("work_units", index, "completion_criteria"), affectedObjectIds: [unit.work_unit_id], message: "Completed work unit has no known completion criterion." }));
    }
    if (unit.completion_assessment.state !== "known") {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("work_units", index, "completion_assessment"), affectedObjectIds: [unit.work_unit_id], message: "Completed work unit has no known completion assessment against its mandatory criteria." }));
    }
    if (unit.completion_criterion_timing === "missing" || unit.completion_criterion_timing === "not_applicable") {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("work_units", index, "completion_criterion_timing"), affectedObjectIds: [unit.work_unit_id], message: "Completed work unit has no legitimate completion-criterion timing state." }));
    }
    if (unit.completion_evidence.length === 0 || !unit.completion_evidence.some((binding) => binding.binding_role === "completion_evidence")) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("work_units", index, "completion_evidence"), affectedObjectIds: [unit.work_unit_id], message: "Completed work unit lacks a source binding explicitly identified as completion evidence." }));
    }
    if (completedAttempts.length === 0) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("work_units", index, "attempt_ids"), affectedObjectIds: [unit.work_unit_id, ...attempts.map((attempt) => attempt.attempt_id)], message: "Completed work unit has no completed attempt in its execution history." }));
    }
    const mismatchedScope = completedAttempts.filter((attempt) => attempt.execution_scope !== unit.execution_scope);
    if (mismatchedScope.length > 0) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("work_units", index, "execution_scope"), affectedObjectIds: [unit.work_unit_id, ...mismatchedScope.map((attempt) => attempt.attempt_id)], message: "Completion evidence comes from attempts with a different execution scope." }));
    }
  });

  context.report.attempts.forEach((attempt, index) => {
    if (attempt.attempt_outcome !== "succeeded") return;
    if (attempt.ended_at.state !== "known" && attempt.ended_at.state !== "withheld") {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("attempts", index, "ended_at"), affectedObjectIds: [attempt.attempt_id], message: "Completed attempt has no known or protected completion time." }));
    }
    if (attempt.source_bindings.length === 0) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("attempts", index, "source_bindings"), affectedObjectIds: [attempt.attempt_id], message: "Completed attempt has no execution source binding." }));
    }
  });
  return findings;
}

export function evaluateWRK002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const units = new Map(context.report.work_units.map((unit) => [unit.work_unit_id, unit]));
  context.report.campaigns.forEach((campaign, index) => {
    if (campaign.execution_scope !== "this_project") return;
    const external = campaign.work_unit_ids
      .map((id) => units.get(id))
      .filter((unit): unit is WorkUnit => unit !== undefined)
      .filter((unit) => unit.execution_scope === "external_study" || unit.execution_scope === "upstream_collaborator");
    if (external.length > 0 && campaign.work_state === "completed") {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("campaigns", index, "work_unit_ids"), affectedObjectIds: [campaign.campaign_id, ...external.map((unit) => unit.work_unit_id)], message: "A this-project completed campaign aggregates externally executed work units without a separate scope." }));
    }
  });
  context.report.work_units.forEach((unit, index) => {
    if (unit.execution_scope !== "this_project" || unit.work_state !== "completed") return;
    const attempts = attemptsForUnit(context, unit);
    const completedExternal = attempts.filter(
      (attempt) => attempt.attempt_outcome === "succeeded" && (attempt.execution_scope === "external_study" || attempt.execution_scope === "upstream_collaborator"),
    );
    const completedProject = attempts.some((attempt) => attempt.attempt_outcome === "succeeded" && attempt.execution_scope === "this_project");
    if (!completedProject && completedExternal.length > 0) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("work_units", index, "execution_scope"), affectedObjectIds: [unit.work_unit_id, ...completedExternal.map((attempt) => attempt.attempt_id)] }));
    }
  });
  return findings;
}

export function evaluateWRK003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const attemptsById = new Map(context.report.attempts.map((attempt) => [attempt.attempt_id, attempt]));
  const failuresById = new Map(context.report.failures.map((failure) => [failure.failure_event_id, failure]));
  const segmentsById = new Map(context.report.segments.map((segment) => [segment.segment_id, segment]));

  context.report.work_units.forEach((unit, unitIndex) => {
    const declared = new Set(unit.attempt_ids);
    const actual = attemptsForUnit(context, unit);
    const actualIds = new Set(actual.map((attempt) => attempt.attempt_id));
    const missingFromUnit = actual.filter((attempt) => !declared.has(attempt.attempt_id));
    const foreign = unit.attempt_ids.filter((id) => attemptsById.get(id)?.work_unit_id !== unit.work_unit_id);
    if (missingFromUnit.length > 0 || foreign.length > 0) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("work_units", unitIndex, "attempt_ids"), affectedObjectIds: [unit.work_unit_id, ...missingFromUnit.map((attempt) => attempt.attempt_id), ...foreign], message: "Work-unit attempt list does not preserve the complete bidirectional attempt history." }));
    }
    const ordinalOwners = new Map<number, string[]>();
    for (const attempt of actual) {
      const owners = ordinalOwners.get(attempt.attempt_ordinal) ?? [];
      owners.push(attempt.attempt_id);
      ordinalOwners.set(attempt.attempt_ordinal, owners);
    }
    for (const [ordinal, owners] of ordinalOwners) {
      if (owners.length > 1) findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("work_units", unitIndex, "attempt_ids"), affectedObjectIds: [unit.work_unit_id, ...owners], message: `Attempt ordinal ${ordinal} is reused within one work unit.` }));
    }

    const ordered = [...actual].sort((left, right) => left.attempt_ordinal - right.attempt_ordinal);
    const retrySuccessors = new Map<string, string[]>();
    for (const candidate of actual) {
      const successors = [
        ...(candidate.superseded_by_attempt_id === null ? [] : [candidate.superseded_by_attempt_id]),
        ...candidate.failure_event_ids.flatMap((id) => failuresById.get(id)?.recovery_attempt_ids ?? []),
      ].filter((id) => attemptsById.get(id)?.work_unit_id === unit.work_unit_id);
      retrySuccessors.set(candidate.attempt_id, [...new Set(successors)]);
    }
    const reaches = (from: string, target: string): boolean => {
      const pending = [...(retrySuccessors.get(from) ?? [])];
      const visited = new Set<string>();
      while (pending.length > 0) {
        const next = pending.shift()!;
        if (next === target) return true;
        if (visited.has(next)) continue;
        visited.add(next);
        pending.push(...(retrySuccessors.get(next) ?? []));
      }
      return false;
    };
    for (const [position, attempt] of ordered.entries()) {
      if (attempt.attempt_outcome !== "succeeded") continue;
      const failedPredecessors = ordered.slice(0, position).filter((candidate) => attemptHasMaterialFailure(candidate, failuresById));
      for (const predecessor of failedPredecessors) {
        if (!reaches(predecessor.attempt_id, attempt.attempt_id) && !hasSourceBoundNotRetryRelation(context, attempt, predecessor)) {
          findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("attempts", context.report.attempts.indexOf(attempt)), affectedObjectIds: [unit.work_unit_id, predecessor.attempt_id, attempt.attempt_id], message: "A later successful attempt follows a materially failed attempt without a preserved retry/recovery chain or source-bound not_a_retry relation." }));
        }
      }
    }
    if (actualIds.size !== actual.length) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("work_units", unitIndex, "attempt_ids"), affectedObjectIds: [unit.work_unit_id], message: "Duplicate attempt identifiers prevent immutable history reconstruction." }));
    }
  });

  context.report.attempts.forEach((attempt, index) => {
    if (attempt.attempt_outcome === "failed" || attempt.attempt_outcome === "aborted") {
      const linked = attempt.failure_event_ids.map((id) => failuresById.get(id)).filter((value) => value !== undefined);
      if (linked.length === 0 || linked.some((failure) => failure.attempt_id !== attempt.attempt_id)) {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("attempts", index, "failure_event_ids"), affectedObjectIds: [attempt.attempt_id, ...attempt.failure_event_ids], message: "Failed or aborted attempt does not retain a matching failure event." }));
      }
    }
    for (const [relationIndex, relation] of (attempt.attempt_relations ?? []).entries()) {
      const prior = attemptsById.get(relation.prior_attempt_id);
      const validPrior = prior !== undefined && prior.work_unit_id === attempt.work_unit_id && prior.attempt_ordinal < attempt.attempt_ordinal;
      if (!validPrior || !hasSourceBoundNotRetryRelation(context, attempt, prior!)) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: pointer("attempts", index, "attempt_relations", relationIndex),
          affectedObjectIds: [attempt.attempt_id, relation.prior_attempt_id],
          message: "Attempt not_a_retry relation lacks a valid earlier same-work-unit target or immutable source-bound rationale.",
        }));
      }
    }
    if (attempt.superseded_by_attempt_id !== null) {
      const successor = attemptsById.get(attempt.superseded_by_attempt_id);
      if (successor === undefined || successor.work_unit_id !== attempt.work_unit_id || successor.attempt_ordinal <= attempt.attempt_ordinal) {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("attempts", index, "superseded_by_attempt_id"), affectedObjectIds: [attempt.attempt_id, attempt.superseded_by_attempt_id], message: "Attempt successor is missing, belongs to another work unit, or does not advance the attempt ordinal." }));
      }
    }
    const declaredSegments = new Set(attempt.segment_ids);
    const actualSegments = context.report.segments.filter((segment) => segment.attempt_id === attempt.attempt_id);
    if (actualSegments.some((segment) => !declaredSegments.has(segment.segment_id))) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("attempts", index, "segment_ids"), affectedObjectIds: [attempt.attempt_id, ...actualSegments.map((segment) => segment.segment_id)], message: "Attempt omits one or more of its segments from the immutable history list." }));
    }
    const segmentOrdinals = new Map<number, string[]>();
    for (const segment of actualSegments) {
      const owners = segmentOrdinals.get(segment.segment_ordinal) ?? [];
      owners.push(segment.segment_id);
      segmentOrdinals.set(segment.segment_ordinal, owners);
    }
    for (const [ordinal, owners] of segmentOrdinals) {
      if (owners.length > 1) {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("attempts", index, "segment_ids"), affectedObjectIds: [attempt.attempt_id, ...owners], message: `Segment ordinal ${ordinal} is reused within one attempt.` }));
      }
    }
  });

  context.report.segments.forEach((segment, index) => {
    if (segment.segment_state === "crashed" && segment.failure_event_ids.length === 0) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("segments", index, "failure_event_ids"), affectedObjectIds: [segment.segment_id, segment.attempt_id], message: "Crashed segment has no retained failure event." }));
    }
    if (segment.segment_kind === "restart") {
      const predecessor = segment.predecessor_segment_id === null ? undefined : segmentsById.get(segment.predecessor_segment_id);
      if (predecessor === undefined || predecessor.attempt_id !== segment.attempt_id || predecessor.segment_ordinal >= segment.segment_ordinal) {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("segments", index, "predecessor_segment_id"), affectedObjectIds: [segment.segment_id, ...(segment.predecessor_segment_id === null ? [] : [segment.predecessor_segment_id])], message: "Restart segment does not preserve a valid earlier predecessor in the same attempt." }));
      }
      if (segment.restart_reason.state !== "known" && segment.restart_reason.state !== "withheld") {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("segments", index, "restart_reason"), affectedObjectIds: [segment.segment_id], message: "Restart segment lacks an explicit restart reason." }));
      }
      if (segment.parameter_diff.state === "unknown") {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("segments", index, "parameter_diff"), affectedObjectIds: [segment.segment_id], message: "Restart segment does not state whether parameters changed from its predecessor." }));
      }
    }
  });

  context.report.failures.forEach((failure, index) => {
    const parentAttempt = failure.attempt_id === null ? undefined : attemptsById.get(failure.attempt_id);
    for (const recoveryId of failure.recovery_attempt_ids) {
      const recovery = attemptsById.get(recoveryId);
      if (parentAttempt === undefined || recovery === undefined || recovery.work_unit_id !== failure.work_unit_id || recovery.attempt_ordinal <= parentAttempt.attempt_ordinal) {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("failures", index, "recovery_attempt_ids"), affectedObjectIds: [failure.failure_event_id, recoveryId], message: "Failure recovery link does not point to a later attempt in the same work unit." }));
      }
    }
  });
  return findings;
}

export function evaluateWRK004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const methods = new Map(context.report.methods.map((method) => [method.method_id, method]));
  context.report.attempts.forEach((attempt, index) => {
    if (attempt.attempt_outcome === "outcome_unknown" || attempt.attempt_outcome === "running_at_cutoff") return;
    const nonPerformed = attempt.method_ids
      .map((id) => methods.get(id))
      .filter((method) => method !== undefined)
      .filter((method) => method.execution_status !== "performed" && method.execution_status !== "external");
    if (nonPerformed.length > 0) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("attempts", index, "method_ids"), affectedObjectIds: [attempt.attempt_id, ...nonPerformed.map((method) => method.method_id)], message: "An executed attempt cites a method whose status remains planned, inferred, not performed, or unknown." }));
    }
  });
  return findings;
}
