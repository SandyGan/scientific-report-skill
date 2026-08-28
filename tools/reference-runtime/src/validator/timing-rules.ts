import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import type { DecisionEvent, ScientificField, SourceBinding } from "../lib/types.js";
import { finding, pointer } from "./context.js";
import type { SemanticContext, ValidationFinding } from "./types.js";

function dateValue(field: ScientificField<string>): number | undefined {
  if (field.state !== "known") return undefined;
  const value = Date.parse(field.value);
  return Number.isFinite(value) ? value : undefined;
}

function targetStart(context: SemanticContext, id: string): number | undefined {
  const collection = context.objectCollectionById.get(id);
  const report = context.report;
  if (collection === "attempts") return dateValue(report.attempts.find((item) => item.attempt_id === id)!.started_at);
  if (collection === "analysis_runs") return dateValue(report.analysis_runs.find((item) => item.analysis_run_id === id)!.started_at);
  if (collection === "segments") return dateValue(report.segments.find((item) => item.segment_id === id)!.started_at);
  if (collection === "results") {
    const result = report.results.find((item) => item.result_id === id)!;
    if (result.attempt_id !== null) {
      const attempt = report.attempts.find((item) => item.attempt_id === result.attempt_id);
      return attempt === undefined ? undefined : dateValue(attempt.started_at);
    }
  }
  if (collection === "work_units") {
    const starts = report.attempts
      .filter((attempt) => attempt.work_unit_id === id)
      .map((attempt) => dateValue(attempt.started_at))
      .filter((value): value is number => value !== undefined);
    return starts.length === 0 ? undefined : Math.min(...starts);
  }
  return undefined;
}

function isTrustworthyTimingBinding(context: SemanticContext, binding: SourceBinding): boolean {
  if (binding.binding_role !== "decision_timing") return false;
  const source = context.report.source_coverage.items.find((item) => item.source_item_id === binding.source_item_id);
  if (source === undefined || source.disposition !== "included" || source.content_hash.state !== "known") return false;
  if (binding.content_hash !== source.content_hash.value) return false;
  const snapshot = context.report.source_coverage.snapshots.find(
    (candidate) => candidate.source_snapshot_id === binding.source_snapshot_id,
  );
  if (snapshot === undefined || snapshot.registry_hash.state !== "known") return false;
  if (binding.snapshot_registry_hash !== snapshot.registry_hash.value) return false;
  return binding.excerpt_hash.length > "sha256:".length && binding.chunk_ids.length > 0;
}

function prospectiveDecisionFindings(
  context: SemanticContext,
  decision: DecisionEvent,
  index: number,
  rule: RuleDefinition,
  severity: RuleSeverity,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const bindings = decision.source_bindings.filter((binding) => binding.binding_role === "decision_timing");
  const trustworthy = bindings.filter((binding) => isTrustworthyTimingBinding(context, binding));
  if (trustworthy.length === 0) {
    findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("decision_events", index, "source_bindings"), affectedObjectIds: [decision.decision_event_id, ...decision.affected_object_ids], sourceBindings: bindings, message: "Prospective/predefined decision lacks a snapshot-bound timing source with integrity evidence." }));
  }
  const decidedAt = dateValue(decision.decided_at);
  if (decidedAt === undefined) {
    findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("decision_events", index, "decided_at"), affectedObjectIds: [decision.decision_event_id], message: "Prospective/predefined decision has no known decision time." }));
  } else {
    const starts = decision.affected_object_ids
      .map((id) => targetStart(context, id))
      .filter((value): value is number => value !== undefined);
    if (starts.length > 0 && decidedAt >= Math.min(...starts)) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("decision_events", index, "decided_at"), affectedObjectIds: [decision.decision_event_id, ...decision.affected_object_ids], message: "Decision time is not earlier than the earliest known affected execution start." }));
    }
  }
  return findings;
}

export function evaluateTIM001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.decision_events.forEach((decision, index) => {
    if (decision.timing_class === "predefined") findings.push(...prospectiveDecisionFindings(context, decision, index, rule, severity));
  });
  context.report.work_units.forEach((unit, index) => {
    if (unit.completion_criterion_timing !== "predefined") return;
    const timingBindings = unit.completion_evidence.filter((binding) => binding.binding_role === "decision_timing");
    if (!timingBindings.some((binding) => isTrustworthyTimingBinding(context, binding))) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("work_units", index, "completion_criterion_timing"), affectedObjectIds: [unit.work_unit_id], sourceBindings: timingBindings, message: "Predefined completion criterion lacks trustworthy pre-outcome timing evidence." }));
    }
  });
  context.report.research_questions.forEach((question, index) => {
    if (question.resolution_criterion_timing !== "predefined") return;
    const bindings = question.source_bindings.filter((binding) => binding.binding_role === "decision_timing");
    if (!bindings.some((binding) => isTrustworthyTimingBinding(context, binding))) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("research_questions", index, "resolution_criterion_timing"), affectedObjectIds: [question.research_question_id], sourceBindings: bindings, message: "Predefined question-resolution criterion lacks trustworthy timing evidence." }));
    }
  });
  return findings;
}

export function evaluateTIM002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.decision_events.forEach((decision, index) => {
    if (decision.timing_class !== "adaptive") return;
    const timingBindings = decision.source_bindings.filter((binding) => binding.binding_role === "decision_timing");
    const lockedRuleRepresented = decision.rationale.state === "known" && decision.triggering_object_ids.length > 0;
    if (!lockedRuleRepresented || !timingBindings.some((binding) => isTrustworthyTimingBinding(context, binding))) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("decision_events", index), affectedObjectIds: [decision.decision_event_id, ...decision.triggering_object_ids], sourceBindings: timingBindings, message: "Adaptive decision lacks a source-bound rule/rationale and explicit triggering state." }));
    }
  });
  return findings;
}

export function evaluateTIM003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const decisions = new Set(context.report.decision_events.map((decision) => decision.decision_event_id));
  context.report.decision_events.forEach((decision, index) => {
    if (decision.timing_class !== "post_hoc") return;
    const prior = typeof decision.extensions.prior_decision_id === "string"
      ? decision.extensions.prior_decision_id
      : typeof decision.extensions.supersedes_decision_id === "string"
        ? decision.extensions.supersedes_decision_id
        : null;
    const materialReplacement = decision.extensions.material_change === true || decision.extensions.replaces_prior_decision === true;
    const historyExplicitlyLost = decision.extensions.prior_decision_preserved === false || decision.extensions.history_overwritten === true;
    if (historyExplicitlyLost || (materialReplacement && prior === null)) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("decision_events", index, "extensions"),
        affectedObjectIds: [decision.decision_event_id],
        message: "A post-hoc material change declares that prior decision history was overwritten or fails to identify the prior decision.",
      }));
    } else if (prior !== null && !decisions.has(prior)) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("decision_events", index, "extensions", "prior_decision_id"),
        affectedObjectIds: [decision.decision_event_id, prior],
        message: `Post-hoc decision references prior decision ${prior}, but that immutable record is absent.`,
      }));
    }
  });
  return findings;
}

const PROSPECTIVE_WORDING = /\b(?:predefined|prospective|pre-registered|preregistered|pre-specified|prespecified)\b|预先定义|前瞻性|预注册|预先指定/iu;

export function evaluateTIM004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.decision_events.forEach((decision, index) => {
    if (decision.timing_class !== "missing") return;
    const texts = [decision.description];
    if (decision.rationale.state === "known") texts.push(decision.rationale.value);
    if (texts.some((text) => PROSPECTIVE_WORDING.test(text))) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("decision_events", index, "timing_class"), affectedObjectIds: [decision.decision_event_id] }));
    }
  });
  return findings;
}

export function evaluateTIM005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.decision_events.forEach((decision, index) => {
    if (decision.timing_class !== "predefined" && decision.timing_class !== "adaptive") return;
    const timingBindings = decision.source_bindings.filter((binding) => binding.binding_role === "decision_timing");
    if (timingBindings.length > 0 && !timingBindings.some((binding) => isTrustworthyTimingBinding(context, binding))) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("decision_events", index, "source_bindings"), affectedObjectIds: [decision.decision_event_id], sourceBindings: timingBindings, message: "Timing classification relies only on unversioned or integrity-unbound metadata." }));
    }
  });
  return findings;
}
