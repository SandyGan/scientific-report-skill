import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import type {
  CoverageAxes,
  CoverageReconciliation,
  ReportCompleteness,
  ScientificField,
  SourceDisposition,
} from "../lib/types.js";
import { finding, pointer } from "./context.js";
import type { SemanticContext, ValidationFinding } from "./types.js";

const TERMINAL_DISPOSITIONS: SourceDisposition[] = [
  "included",
  "excluded_with_reason",
  "unreadable",
  "inaccessible",
  "duplicate",
  "unmapped",
];
const ALL_DISPOSITIONS: SourceDisposition[] = [...TERMINAL_DISPOSITIONS, "pending"];

function knownDate(field: ScientificField<string>): number | undefined {
  if (field.state !== "known") return undefined;
  const value = Date.parse(field.value);
  return Number.isFinite(value) ? value : undefined;
}

function reconciledCounts(context: SemanticContext): CoverageReconciliation {
  const items = context.report.source_coverage.items;
  const count = (disposition: SourceDisposition): number =>
    new Set(items.filter((item) => item.disposition === disposition).map((item) => item.source_item_id)).size;
  const includedMapped = new Set(
    items.filter((item) => item.disposition === "included" && item.mapped_object_ids.length > 0)
      .map((item) => item.source_item_id),
  ).size;
  return {
    registered: new Set(items.map((item) => item.source_item_id)).size,
    terminally_disposed: new Set(
      items.filter((item) => TERMINAL_DISPOSITIONS.includes(item.disposition)).map((item) => item.source_item_id),
    ).size,
    included: count("included"),
    excluded_with_reason: count("excluded_with_reason"),
    unreadable: count("unreadable"),
    inaccessible: count("inaccessible"),
    duplicate: count("duplicate"),
    unmapped: count("unmapped"),
    pending: count("pending"),
    included_mapped: includedMapped,
  };
}

function derivedAxes(context: SemanticContext, reconciliation: CoverageReconciliation): CoverageAxes {
  const coverage = context.report.source_coverage;
  const items = coverage.items;
  const inventory: CoverageAxes["inventory_accounting"] = coverage.snapshot_bindings.length === 0
    ? "unknown"
    : reconciliation.pending > 0 || reconciliation.registered !== coverage.item_ids.length
      ? "incomplete"
      : "complete";
  const accessibility: CoverageAxes["accessibility"] = items.some(
    (item) => item.disposition === "unreadable" || item.disposition === "inaccessible",
  )
    ? "limitations_present"
    : items.some((item) => item.content_access === "unknown" || item.content_access === "withheld")
      ? "unknown"
      : "all_accessible";
  let scientific: CoverageAxes["scientific_incorporation"];
  if (items.length === 0) scientific = "none";
  else if (
    inventory === "complete" &&
    reconciliation.included === reconciliation.included_mapped &&
    reconciliation.unmapped === 0 &&
    !items.some((item) =>
      (item.disposition === "unreadable" || item.disposition === "inaccessible") &&
      ["unknown", "withheld"].includes(item.content_access))
  ) scientific = "complete_within_boundary";
  else if (inventory === "unknown") scientific = "unknown";
  else scientific = "partial";
  return { inventory_accounting: inventory, accessibility, scientific_incorporation: scientific };
}

function derivedCompleteness(context: SemanticContext, axes: CoverageAxes): ReportCompleteness {
  const coverage = context.report.source_coverage;
  if (coverage.enumeration_status === "open_ended" || coverage.enumeration_status === "unknown" || coverage.snapshot_bindings.length === 0) {
    return "cannot_be_established";
  }
  if (
    coverage.enumeration_status === "authoritative_exhaustive" &&
    axes.inventory_accounting === "complete" &&
    axes.scientific_incorporation === "complete_within_boundary" &&
    coverage.cutoff.state === "known"
  ) return "proven_within_declared_universe";
  if (coverage.enumeration_status === "registered_not_proven_exhaustive" && axes.inventory_accounting === "complete") {
    return "registered_sources_accounted_for";
  }
  return "partial";
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);
}

export function evaluateCOV001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const coverage = context.report.source_coverage;
  const findings: ValidationFinding[] = [];
  const expected = reconciledCounts(context);
  for (const [name, value] of Object.entries(expected)) {
    const declared = coverage.reconciliation[name as keyof CoverageReconciliation];
    if (declared !== value) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: `/source_coverage/reconciliation/${name}`,
        affectedObjectIds: [coverage.universe_id],
        message: `Declared source reconciliation ${name}=${declared} does not match ${value} unique registered source records.`,
        details: { declared, reconciled: value },
      }));
    }
  }

  const itemIds = coverage.items.map((item) => item.source_item_id);
  if (!sameStringSet(coverage.item_ids, [...new Set(itemIds)])) {
    findings.push(finding({ rule, effectiveSeverity: severity, pointer: "/source_coverage/item_ids", affectedObjectIds: [coverage.universe_id, ...itemIds], message: "Source universe item_ids do not exactly reconcile with the registered source items." }));
  }
  const snapshotIds = coverage.snapshots.map((snapshot) => snapshot.source_snapshot_id);
  if (!sameStringSet(coverage.snapshot_bindings, [...new Set(snapshotIds)])) {
    findings.push(finding({ rule, effectiveSeverity: severity, pointer: "/source_coverage/snapshot_bindings", affectedObjectIds: [coverage.universe_id, ...snapshotIds], message: "Source universe snapshot_bindings do not exactly reconcile with the declared snapshots." }));
  }
  const snapshotSet = new Set(snapshotIds);
  coverage.items.forEach((item, index) => {
    if (item.universe_id !== coverage.universe_id) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("source_coverage", "items", index, "universe_id"), affectedObjectIds: [coverage.universe_id, item.source_item_id], message: "Source item is bound to a different source universe." }));
    }
    if (!snapshotSet.has(item.snapshot_id)) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("source_coverage", "items", index, "snapshot_id"), affectedObjectIds: [item.source_item_id], message: "Source item is not bound to a declared source snapshot." }));
    }
  });

  if (coverage.enumeration_status === "authoritative_exhaustive") {
    if (!["authoritative_registry", "reconciled_authoritative_registries"].includes(coverage.authority_basis)) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: "/source_coverage/authority_basis", affectedObjectIds: [coverage.universe_id], message: "Authoritative exhaustive enumeration lacks an authoritative registry basis." }));
    }
    if (coverage.authority_evidence.state !== "known") {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: "/source_coverage/authority_evidence", affectedObjectIds: [coverage.universe_id], message: "Authoritative exhaustive enumeration lacks known evidence for registry identity, scope, snapshot, and cutoff." }));
    }
    const pending = coverage.items.filter((item) => item.disposition === "pending");
    if (pending.length > 0) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: "/source_coverage/items", affectedObjectIds: pending.map((item) => item.source_item_id), message: `Authoritative universe contains ${pending.length} source item(s) without a terminal disposition.` }));
    }
  }

  const expectedAxes = derivedAxes(context, expected);
  for (const [name, value] of Object.entries(expectedAxes)) {
    const declared = coverage.coverage_axes[name as keyof CoverageAxes];
    if (declared !== value) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: `/source_coverage/coverage_axes/${name}`, affectedObjectIds: [coverage.universe_id], message: `Declared coverage axis ${name}=${declared} does not match the conservative derived state ${value}.` }));
    }
  }
  const expectedCompleteness = derivedCompleteness(context, expectedAxes);
  if (coverage.report_completeness !== expectedCompleteness) {
    findings.push(finding({ rule, effectiveSeverity: severity, pointer: "/source_coverage/report_completeness", affectedObjectIds: [coverage.universe_id], message: `Declared report completeness ${coverage.report_completeness} does not match conservative derived state ${expectedCompleteness}.` }));
  }
  return findings;
}

const ABSOLUTE_COMPLETENESS = /\b(?:complete report|all available evidence|exhaustive review|fully complete|complete and exhaustive|all evidence was included)\b|完整报告|所有可用证据|穷尽(?:性)?审查|全部证据均已纳入/iu;

function narrativeFields(context: SemanticContext): Array<{ pointer: string; text: string; ids: string[] }> {
  const report = context.report;
  const fields: Array<{ pointer: string; text: string; ids: string[] }> = [
    { pointer: "/title", text: report.title, ids: [report.report_id] },
    { pointer: "/scope/scope_statement", text: report.scope.scope_statement, ids: [report.report_id] },
    { pointer: "/source_coverage/scope_statement", text: report.source_coverage.scope_statement, ids: [report.source_coverage.universe_id] },
  ];
  report.research_questions.forEach((question, index) => {
    fields.push({ pointer: pointer("research_questions", index, "question"), text: question.question, ids: [question.research_question_id] });
    if (question.qualified_answer.state === "known") fields.push({ pointer: pointer("research_questions", index, "qualified_answer", "value"), text: question.qualified_answer.value, ids: [question.research_question_id] });
  });
  report.claims.forEach((claim, index) => fields.push({ pointer: pointer("claims", index, "proposition"), text: claim.proposition, ids: [claim.claim_id] }));
  return fields;
}

export function evaluateCOV002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const coverage = context.report.source_coverage;
  if (coverage.report_completeness === "proven_within_declared_universe") return [];
  const findings: ValidationFinding[] = [];
  if (coverage.report_completeness === "registered_sources_accounted_for" && coverage.coverage_limitations.length === 0) {
    findings.push(finding({ rule, effectiveSeverity: severity, pointer: "/source_coverage/coverage_limitations", affectedObjectIds: [coverage.universe_id], message: "Registered-source accounting lacks the required limitation that overall completeness is unproved." }));
  }
  for (const field of narrativeFields(context)) {
    if (ABSOLUTE_COMPLETENESS.test(field.text)) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: field.pointer, affectedObjectIds: field.ids, message: `Absolute completeness wording is not supported by report completeness state ${coverage.report_completeness}.` }));
    }
  }
  return findings;
}

export function evaluateCOV003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.source_coverage.items.forEach((item, index) => {
    if (!ALL_DISPOSITIONS.includes(item.disposition)) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("source_coverage", "items", index, "disposition"), affectedObjectIds: [item.source_item_id] }));
    }
  });
  return findings;
}

export function evaluateCOV004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const items = new Map(context.report.source_coverage.items.map((item) => [item.source_item_id, item]));
  context.report.source_coverage.items.forEach((item, index) => {
    if (item.disposition !== "duplicate") return;
    const target = item.canonical_source_item_id === null ? undefined : items.get(item.canonical_source_item_id);
    if (target === undefined || target.source_item_id === item.source_item_id) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("source_coverage", "items", index, "canonical_source_item_id"), affectedObjectIds: [item.source_item_id], message: "Duplicate source does not identify a distinct declared canonical source." }));
    }
    if (item.equivalence_basis.state !== "known" && item.equivalence_basis.state !== "withheld") {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("source_coverage", "items", index, "equivalence_basis"), affectedObjectIds: [item.source_item_id], message: "Duplicate source lacks an explicit equivalence basis." }));
    }
  });
  return findings;
}

export function evaluateCOV005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const evidenceBySource = new Map<string, string[]>();
  for (const evidence of context.report.evidence_items) {
    for (const sourceId of evidence.source_item_ids) {
      const ids = evidenceBySource.get(sourceId) ?? [];
      ids.push(evidence.evidence_item_id);
      evidenceBySource.set(sourceId, ids);
    }
  }
  context.report.source_coverage.items.forEach((item, index) => {
    if (item.disposition !== "unmapped") return;
    const incorporated = evidenceBySource.get(item.source_item_id) ?? [];
    if (item.mapped_object_ids.length > 0 || incorporated.length > 0) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("source_coverage", "items", index), affectedObjectIds: [item.source_item_id, ...item.mapped_object_ids, ...incorporated], message: "A source disposed as unmapped is simultaneously represented as mapped or incorporated evidence." }));
    }
  });
  return findings;
}

export function evaluateCOV006(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const snapshots = new Map(context.report.source_coverage.snapshots.map((snapshot) => [snapshot.source_snapshot_id, snapshot]));
  const revisedIds = new Set(
    context.report.revision_events
      .filter((revision) => revision.event_kind === "source_update")
      .flatMap((revision) => [
        ...revision.superseded_object_refs.map((reference) => reference.object_id),
        ...revision.replacement_object_refs.map((reference) => reference.object_id),
        ...revision.invalidated_object_ids,
        ...revision.review_required_object_ids,
      ]),
  );
  context.report.source_coverage.items.forEach((item, index) => {
    const snapshot = snapshots.get(item.snapshot_id);
    if (snapshot === undefined) return;
    const registeredAt = knownDate(item.registered_at);
    const snapshotAt = knownDate(snapshot.created_at);
    if (registeredAt !== undefined && snapshotAt !== undefined && registeredAt > snapshotAt && !revisedIds.has(item.source_item_id) && !revisedIds.has(snapshot.source_snapshot_id)) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("source_coverage", "items", index, "registered_at"), affectedObjectIds: [item.source_item_id, snapshot.source_snapshot_id], message: "Source was registered after its claimed frozen snapshot without a source-update revision event." }));
    }
  });
  return findings;
}
