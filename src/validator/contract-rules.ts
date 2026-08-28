import type { JsonObject, JsonValue } from "../lib/json.js";
import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import type { ScientificReport } from "../lib/types.js";
import { asJsonObject, finding, pointer } from "./context.js";
import type { SemanticContext, ValidationFinding } from "./types.js";

const DOMAIN_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  wet_lab: [
    "wet_lab_material_identity",
    "wet_lab_design_and_controls",
    "wet_lab_protocol_and_measurement",
  ],
  ai_ml: [
    "ai_ml_data_and_labels",
    "ai_ml_training_and_selection",
    "ai_ml_evaluation_and_inference",
  ],
  molecular_dynamics: [
    "md_system_construction",
    "md_execution_and_restarts",
    "md_analysis_and_convergence",
  ],
  cross_domain: ["cross_domain_alignment", "cross_domain_argument"],
};

function extensionPayloads(report: ScientificReport): JsonObject[] {
  const payloads = report.extensions.domain_payloads;
  return Array.isArray(payloads)
    ? payloads.map(asJsonObject).filter((value): value is JsonObject => value !== null)
    : [];
}

function textSuggests(value: string, expression: RegExp): boolean {
  expression.lastIndex = 0;
  return expression.test(value);
}

export function inferredDomainTriggers(report: ScientificReport): Set<string> {
  const triggers = new Set<string>();
  for (const payload of extensionPayloads(report)) {
    if (typeof payload.domain === "string") triggers.add(payload.domain);
  }
  for (const module of report.module_manifest) {
    if (module.detected_triggers.length > 0) triggers.add(module.module_id);
  }
  for (const bridge of report.cross_domain_bridges) {
    triggers.add("cross_domain");
    triggers.add(bridge.source_domain);
    triggers.add(bridge.target_domain);
  }
  for (const entity of report.entities) {
    const kind = entity.entity_kind.toLowerCase();
    if (/(?:organism|donor|sample|specimen|cell|culture|assay|biological|wet[_ -]?lab)/u.test(kind)) triggers.add("wet_lab");
    if (/(?:dataset|model|classifier|predictor|training|machine[_ -]?learning|ai[_ -]?ml)/u.test(kind)) triggers.add("ai_ml");
    if (/(?:simulation|trajectory|molecular[_ -]?system|molecular[_ -]?dynamics|replica)/u.test(kind)) triggers.add("molecular_dynamics");
  }
  for (const method of report.methods) {
    const kind = `${method.method_kind} ${method.name}`.toLowerCase();
    if (/(?:assay|culture|imaging|wet[_ -]?lab|pcr|blot|microscopy)/u.test(kind)) triggers.add("wet_lab");
    if (/(?:training|inference|machine[_ -]?learning|ai[_ -]?ml|classifier|predictor)/u.test(kind)) triggers.add("ai_ml");
    if (/(?:molecular[_ -]?dynamics|simulation|trajectory)/u.test(kind)) triggers.add("molecular_dynamics");
  }
  if (report.analysis_populations.some((population) => ["training", "validation", "test"].includes(population.population_kind))) {
    triggers.add("ai_ml");
  }
  if (report.materials.some((material) => material.material_kind === "molecular_system")) triggers.add("molecular_dynamics");
  return triggers;
}

interface LocatedEnvelope {
  path: string;
  envelope: JsonObject;
}

function scientificEnvelopes(value: unknown): LocatedEnvelope[] {
  const results: LocatedEnvelope[] = [];
  const seen = new Set<object>();
  const walk = (candidate: unknown, path: string): void => {
    if (candidate === null || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((child, index) => walk(child, `${path}/${index}`));
      return;
    }
    const record = candidate as JsonObject;
    if (
      "state" in record &&
      "value" in record &&
      "source_bindings" in record &&
      "derivation_bindings" in record &&
      "missing_reason" in record &&
      "provenance_status" in record
    ) {
      results.push({ path, envelope: record });
      return;
    }
    for (const [key, child] of Object.entries(record)) {
      walk(child, `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
    }
  };
  walk(value, "");
  return results;
}

function extensionFlag(value: unknown, keys: ReadonlySet<string>): Array<{ path: string; value: JsonValue }> {
  const hits: Array<{ path: string; value: JsonValue }> = [];
  const seen = new Set<object>();
  const walk = (candidate: unknown, path: string): void => {
    if (candidate === null || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((child, index) => walk(child, `${path}/${index}`));
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      const childPath = `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      if (keys.has(key)) hits.push({ path: childPath, value: child as JsonValue });
      walk(child, childPath);
    }
  };
  walk(value, "/extensions");
  return hits;
}

function releaseClaim(report: ScientificReport): boolean {
  const keys = new Set(["release_status", "release_eligible", "is_complete_release", "publication_status"]);
  return extensionFlag(report.extensions, keys).some(({ value }) =>
    value === true ||
    (typeof value === "string" && /^(?:complete|eligible|final|published|release[_ -]?eligible)$/iu.test(value.trim())),
  );
}

export function evaluateEPI003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const { path, envelope } of scientificEnvelopes(context.report)) {
    if (envelope.state === "unknown" && envelope.value !== null) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: path,
        message: "An unknown field contains a value; the value must remain null until supported provenance changes the state to known.",
      }));
    }
  }
  for (const hit of extensionFlag(context.report.extensions, new Set(["guessed_value", "imputed_unknown", "filled_from_assumption"]))) {
    if (hit.value !== false && hit.value !== null) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: hit.path, message: "An extension declares that an unknown value was guessed or assumption-filled." }));
    }
  }
  return findings;
}

export function evaluateEPI010(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const forbiddenKeys = new Set([
    "validation_status",
    "validation_passed",
    "validator_result",
    "attestation_status",
    "package_verified",
  ]);
  return extensionFlag(context.report.extensions, forbiddenKeys)
    .filter(({ value }) => value !== null && value !== false && value !== "unknown")
    .map(({ path }) => finding({
      rule,
      effectiveSeverity: severity,
      pointer: path,
      affectedObjectIds: [context.report.report_id],
      message: "Scientific payload extensions assert validation or package status. Such status must exist only in the external payload-bound attestation or manifest.",
    }));
}

export function evaluateEPI011(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const forbiddenKeys = new Set([
    "rendered_claims",
    "rendered_results",
    "render_overrides",
    "presentation_derived_facts",
    "html_only_scientific_content",
  ]);
  return extensionFlag(context.report.extensions, forbiddenKeys)
    .filter(({ value }) => value !== null && value !== false && (!Array.isArray(value) || value.length > 0))
    .map(({ path }) => finding({
      rule,
      effectiveSeverity: severity,
      pointer: path,
      affectedObjectIds: [context.report.report_id],
      message: "Scientific semantics are supplied through a rendering-only extension instead of the canonical report collections.",
    }));
}

export function evaluateEPI012(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  if (context.report.payload_role !== "public_projection") return [];
  const withheld = scientificEnvelopes(context.report).filter(({ envelope }) => envelope.state === "withheld");
  const findings: ValidationFinding[] = [];
  if (context.report.disclosure_state.withheld_field_count !== withheld.length) {
    findings.push(finding({
      rule,
      effectiveSeverity: severity,
      pointer: "/disclosure_state/withheld_field_count",
      affectedObjectIds: [context.report.report_id],
      message: `Public projection declares ${context.report.disclosure_state.withheld_field_count} withheld field(s), but ${withheld.length} explicit withheld envelope(s) are present.`,
      details: { declared_count: context.report.disclosure_state.withheld_field_count, represented_count: withheld.length },
    }));
  }
  if (context.report.disclosure_state.projection_status !== "projected" || context.report.disclosure_state.projection_id === null) {
    findings.push(finding({
      rule,
      effectiveSeverity: severity,
      pointer: "/disclosure_state",
      affectedObjectIds: [context.report.report_id],
      message: "A public payload must identify the completed disclosure projection that preserved its withheld states.",
    }));
  }
  return findings;
}

function applicabilityTargetMatches(target: string, actual: string): boolean {
  if (target === actual || target === "*" || target === "/**") return true;
  const targetSegments = target.split("/");
  const actualSegments = actual.split("/");
  return targetSegments.length === actualSegments.length && targetSegments.every(
    (segment, index) => segment === "*" || segment === actualSegments[index],
  );
}

export function evaluateAPP001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const decisions = new Map(
    context.report.applicability_decisions.map((decision) => [decision.applicability_decision_id, decision]),
  );
  const assessDecision = (
    decisionId: unknown,
    expectedResult: "applicable" | "not_applicable" | "undetermined",
    targetKind: "field" | "section" | "module",
    target: string,
    findingPointer: string,
    affectedObjectIds: string[] = [],
  ): void => {
    if (typeof decisionId !== "string") {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: findingPointer,
        affectedObjectIds,
        message: `${targetKind} applicability state lacks an applicability_decision_id.`,
      }));
      return;
    }
    const decision = decisions.get(decisionId);
    if (decision === undefined) return; // REF001 reports the unresolved identifier.
    const targetMatches = decision.target_kind === targetKind && applicabilityTargetMatches(
      decision.target_pointer_or_section_id,
      target,
    );
    const intrinsicCoreDecision = decision.rule_id === "FA004" &&
      decision.target_kind === "module" &&
      decision.target_pointer_or_section_id === "core" &&
      decision.result === "applicable";
    const traceable = decision.evaluated_context.trim().length > 0 &&
      Number.isFinite(Date.parse(decision.decision_time)) &&
      (decision.evidence_bindings.length > 0 || intrinsicCoreDecision);
    if (decision.result !== expectedResult || !targetMatches || (expectedResult !== "undetermined" && !traceable)) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: findingPointer,
        affectedObjectIds: [decisionId, ...affectedObjectIds],
        sourceBindings: decision.evidence_bindings,
        message: `Applicability decision ${decisionId} does not traceably establish ${expectedResult} for ${targetKind} target ${target}.`,
        details: {
          declared_result: decision.result,
          declared_target_kind: decision.target_kind,
          declared_target: decision.target_pointer_or_section_id,
        },
      }));
    }
  };

  for (const { path, envelope } of scientificEnvelopes(context.report)) {
    if (envelope.state !== "not_applicable") continue;
    if (typeof envelope.missing_reason !== "string" || envelope.missing_reason.trim().length === 0) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: path, message: "not_applicable lacks a recorded applicability rationale." }));
    }
    assessDecision(envelope.applicability_decision_id, "not_applicable", "field", path, path);
  }
  context.report.section_coverage.forEach((section, index) => {
    const sectionPointer = pointer("section_coverage", index, "applicability_decision_id");
    assessDecision(
      section.applicability_decision_id,
      section.applicability,
      "section",
      section.section_id,
      sectionPointer,
      [section.section_id],
    );
    if (section.applicability !== "not_applicable") return;
    if (section.evidence_bindings.length === 0 || section.omission_or_gap_reasons.state !== "known") {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("section_coverage", index),
        affectedObjectIds: [section.section_id],
        sourceBindings: section.evidence_bindings,
        message: "A not-applicable section lacks source-bound coverage evidence and an explicit rationale.",
      }));
    }
  });
  context.report.module_manifest.forEach((module, index) => {
    const expectedResult = module.status === "enabled"
      ? "applicable"
      : module.status === "not_applicable"
        ? "not_applicable"
        : "undetermined";
    assessDecision(
      module.applicability_decision_id,
      expectedResult,
      "module",
      module.module_id,
      pointer("module_manifest", index, "applicability_decision_id"),
      [module.module_id],
    );
    if (module.status !== "not_applicable") return;
    if (module.detected_triggers.length > 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("module_manifest", index),
        affectedObjectIds: [module.module_id],
        message: "A not-applicable module still records an applicability trigger.",
      }));
    }
  });
  return findings;
}

const UNKNOWN_REASON = /\b(?:unknown|not (?:known|recorded|supplied|available)|unavailable|missing|could not (?:determine|establish)|insufficient (?:context|information|evidence))\b|未知|未记录|不可确定/iu;

export function evaluateAPP002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  return scientificEnvelopes(context.report)
    .filter(({ envelope }) =>
      envelope.state === "not_applicable" &&
      typeof envelope.missing_reason === "string" &&
      textSuggests(envelope.missing_reason, UNKNOWN_REASON),
    )
    .map(({ path }) => finding({
      rule,
      effectiveSeverity: severity,
      pointer: path,
      message: "A field is marked not_applicable even though its rationale describes unknown, missing, unavailable, or insufficient context.",
    }));
}

export function evaluateAPP003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  return scientificEnvelopes(context.report)
    .filter(({ envelope }) =>
      envelope.state === "withheld" &&
      (envelope.value !== null || (context.report.payload_role === "public_projection" && envelope.provenance_status !== "absent")),
    )
    .map(({ path }) => finding({
      rule,
      effectiveSeverity: severity,
      pointer: path,
      message: "A withheld envelope was changed into a recoverable value or an incompatible public-provenance state.",
    }));
}

export function evaluateAPP004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const modules = new Map(context.report.module_manifest.map((module) => [module.module_id, module]));
  if (modules.get("core")?.status !== "enabled") {
    findings.push(finding({ rule, effectiveSeverity: severity, pointer: "/module_manifest", affectedObjectIds: ["core"], message: "The core module must always be present and enabled." }));
  }
  for (const domain of inferredDomainTriggers(context.report)) {
    if (!(domain in DOMAIN_SECTIONS)) continue;
    const module = modules.get(domain);
    if (module?.status !== "enabled") {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: "/module_manifest",
        affectedObjectIds: [domain],
        message: `Detected ${domain} content requires an enabled ${domain} module-manifest entry.`,
      }));
    }
  }
  return findings;
}

export function evaluateAPP005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.section_coverage.forEach((section, index) => {
    if (section.coverage_status !== "no_records" && section.coverage_status !== "not_applicable") return;
    const hasReason = section.omission_or_gap_reasons.state === "known" && section.omission_or_gap_reasons.value.length > 0;
    if (!hasReason || section.evidence_bindings.length === 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("section_coverage", index),
        affectedObjectIds: [section.section_id],
        sourceBindings: section.evidence_bindings,
        message: `${section.coverage_status} is supported only by an empty collection; a reason and source-bound inventory/applicability decision are required.`,
      }));
    }
  });
  return findings;
}

export function evaluateMOD001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  return ["summary", "full_archive", "filtered_working_copy"].includes(context.report.report_mode)
    ? []
    : [finding({ rule, effectiveSeverity: severity, pointer: "/report_mode", affectedObjectIds: [context.report.report_id] })];
}

export function evaluateMOD002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  if (context.report.report_mode === "full_archive" || !releaseClaim(context.report)) return [];
  return [finding({
    rule,
    effectiveSeverity: severity,
    pointer: "/report_mode",
    affectedObjectIds: [context.report.report_id],
    message: `${context.report.report_mode} is a partial view but its extensions represent it as a complete or release-eligible artifact.`,
  })];
}

export function evaluateMOD003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  if (!releaseClaim(context.report)) return [];
  const unresolved = [
    ...context.report.review_tasks.filter((task) => task.status === "open" && task.severity === "blocking").map((task) => task.review_task_id),
    ...context.report.source_coverage.items.filter((item) => item.disposition === "pending").map((item) => item.source_item_id),
  ];
  if (unresolved.length === 0 && context.report.disclosure_state.projection_status !== "projection_incomplete" && context.report.disclosure_state.projection_status !== "unknown") return [];
  return [finding({
    rule,
    effectiveSeverity: severity,
    pointer: "/report_mode",
    affectedObjectIds: [context.report.report_id, ...unresolved],
    message: "Report extensions assert a release state while required review, source, or projection gates remain unresolved.",
  })];
}

export function evaluateMOD004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const filters = asJsonObject(context.report.extensions.filters);
  if (filters === null) return [];
  const hidden = Array.isArray(filters.hidden_scientific_states)
    ? filters.hidden_scientific_states.filter((value): value is string => typeof value === "string")
    : [];
  const route = filters.full_view_route;
  if (hidden.length === 0 || (typeof route === "string" && route.trim().length > 0)) return [];
  return [finding({
    rule,
    effectiveSeverity: severity,
    pointer: "/extensions/filters",
    affectedObjectIds: [context.report.report_id],
    message: `A declared filter hides ${hidden.join(", ")} without a route to the complete view.`,
    details: { hidden_scientific_states: hidden },
  })];
}

export function evaluateMOD005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const hits = extensionFlag(context.report.extensions, new Set(["archive_mutated_in_place", "history_rewritten"]));
  return hits
    .filter(({ value }) => value === true)
    .map(({ path }) => finding({ rule, effectiveSeverity: severity, pointer: path, affectedObjectIds: [context.report.report_id] }));
}

export function evaluateREP006(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const summary = asJsonObject(context.report.extensions.reproducibility_summary);
  const findings: ValidationFinding[] = [];
  if (summary !== null) {
    if ("average_score" in summary || "mean_level" in summary) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: "/extensions/reproducibility_summary", message: "Reproducibility summary uses an average score/level instead of a conservative critical-unit lower bound." }));
    }
    const criticalCount = context.report.reproducibility_units.filter((unit) => unit.criticality === "critical").length;
    if (summary.critical_unit_count !== criticalCount || summary.total_unit_count !== context.report.reproducibility_units.length) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: "/extensions/reproducibility_summary",
        affectedObjectIds: context.report.reproducibility_units.map((unit) => unit.reproducibility_unit_id),
        message: "Reproducibility summary omits or misstates its critical/total unit denominator.",
        details: { expected_critical: criticalCount, expected_total: context.report.reproducibility_units.length },
      }));
    }
  }

  const dispositionIsTraceable = (unit: ScientificReport["reproducibility_units"][number]): boolean => {
    const raw = unit as unknown as JsonObject;
    const disposition = asJsonObject(raw.coverage_disposition);
    if (disposition === null) return false;
    const sourceBindings = Array.isArray(disposition.source_bindings)
      ? disposition.source_bindings.map(asJsonObject).filter((binding): binding is JsonObject => binding !== null)
      : [];
    const hasResolvedCoverageTarget = [
      ...unit.covered_work_unit_ids,
      ...unit.covered_analysis_run_ids,
      ...unit.covered_claim_ids,
      ...unit.covered_output_ids,
    ].some((id) => context.knownIds.has(id));
    return (disposition.status === "assessed" || disposition.status === "explicit_gap") &&
      typeof disposition.justification === "string" && disposition.justification.trim().length > 0 &&
      sourceBindings.length > 0 &&
      sourceBindings.every((binding) => typeof binding.source_item_id === "string" && context.knownIds.has(binding.source_item_id)) &&
      hasResolvedCoverageTarget;
  };
  const units = context.report.reproducibility_units;
  for (const [index, run] of context.report.analysis_runs.entries()) {
    const covering = units.filter((unit) => unit.covered_analysis_run_ids.includes(run.analysis_run_id));
    if (covering.length === 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("analysis_runs", index),
        affectedObjectIds: [run.analysis_run_id],
        message: `AnalysisRun ${run.analysis_run_id} is key computational work but has no reproducibility unit or explicit gap disposition.`,
      }));
    } else if (!covering.some(dispositionIsTraceable)) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: "/reproducibility_units",
        affectedObjectIds: [run.analysis_run_id, ...covering.map((unit) => unit.reproducibility_unit_id)],
        message: `AnalysisRun ${run.analysis_run_id} is covered only by units lacking a source-bound assessed/explicit-gap coverage disposition.`,
      }));
    }
  }
  const actualInvocations = context.report.invocations.filter(
    (invocation) => invocation.record_role === "historical_actual" || invocation.record_role === "verification_run",
  );
  for (const invocation of actualInvocations) {
    const covering = units.filter((unit) => unit.historical_invocation_ids.includes(invocation.invocation_id));
    if (covering.length === 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: "/invocations",
        affectedObjectIds: [invocation.invocation_id],
        message: `Actual invocation ${invocation.invocation_id} is computational provenance but has no reproducibility unit or explicit gap disposition.`,
      }));
    } else if (!covering.some(dispositionIsTraceable)) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: "/reproducibility_units",
        affectedObjectIds: [invocation.invocation_id, ...covering.map((unit) => unit.reproducibility_unit_id)],
        message: `Actual invocation ${invocation.invocation_id} is covered only by units lacking a source-bound assessed/explicit-gap coverage disposition.`,
      }));
    }
  }
  return findings;
}

export function evaluateRES001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.attempts.forEach((attempt, index) => {
    if (attempt.attempt_outcome === "failed" && attempt.failure_event_ids.length === 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("attempts", index, "failure_event_ids"),
        affectedObjectIds: [attempt.attempt_id],
        message: "A failed attempt has no separate FailureEvent and therefore collapses technical failure into execution/result state.",
      }));
    }
  });
  context.report.segments.forEach((segment, index) => {
    if (segment.segment_state === "crashed" && segment.failure_event_ids.length === 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("segments", index, "failure_event_ids"),
        affectedObjectIds: [segment.segment_id, segment.attempt_id],
        message: "A crashed segment has no separate FailureEvent.",
      }));
    }
  });
  return findings;
}

export function evaluateRES002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.results.forEach((result, index) => {
    const inferred = result.extensions.inferred_axes;
    if (Array.isArray(inferred) && inferred.length > 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("results", index, "extensions", "inferred_axes"),
        affectedObjectIds: [result.result_id],
        message: "Result extensions declare that one or more orthogonal result axes were inferred rather than independently recorded.",
      }));
    }
  });
  return findings;
}

function summaryCountRecords(report: ScientificReport): JsonObject[] {
  const value = report.extensions.summary_counts;
  if (Array.isArray(value)) return value.map(asJsonObject).filter((item): item is JsonObject => item !== null);
  const single = asJsonObject(value);
  return single === null ? [] : [single];
}

export function evaluateWRK005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  summaryCountRecords(context.report).forEach((count, index) => {
    const required = ["numerator", "denominator", "unit", "scope", "cutoff"];
    const missing = required.filter((key) => !(key in count));
    if (missing.length > 0 || typeof count.numerator !== "number" || typeof count.denominator !== "number") {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("extensions", "summary_counts", index),
        message: `Displayed work count lacks an explicit ${missing.length > 0 ? missing.join(", ") : "numeric numerator/denominator"}.`,
      }));
    }
  });
  return findings;
}

export function evaluateWRK006(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const lowLevel = /^(?:segment|artifact|row|frame|file|output)s?$/iu;
  return summaryCountRecords(context.report)
    .map((count, index) => ({ count, index }))
    .filter(({ count }) => typeof count.unit === "string" && lowLevel.test(count.unit))
    .map(({ count, index }) => finding({
      rule,
      effectiveSeverity: severity,
      pointer: pointer("extensions", "summary_counts", index, "unit"),
      message: `Low-level ${String(count.unit)} records are presented through the work-count interface. WorkUnit and Attempt denominators must remain separate.`,
    }));
}

export function evaluateMNF001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const coverage = new Set(context.report.section_coverage.map((section) => section.section_id));
  const findings: ValidationFinding[] = [];
  context.report.module_manifest.forEach((module, moduleIndex) => {
    module.section_ids.forEach((sectionId, sectionIndex) => {
      if (!coverage.has(sectionId)) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: pointer("module_manifest", moduleIndex, "section_ids", sectionIndex),
          affectedObjectIds: [module.module_id, sectionId],
          message: `Manifest section ${sectionId} has no SectionCoverage entry.`,
        }));
      }
    });
  });
  return findings;
}

export function evaluateMNF002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const valid: Readonly<Record<string, ReadonlySet<string>>> = {
    applicable: new Set(["covered", "partial", "no_records", "unknown", "withheld"]),
    not_applicable: new Set(["not_applicable"]),
    undetermined: new Set(["unknown"]),
  };
  return context.report.section_coverage
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => !valid[section.applicability]?.has(section.coverage_status))
    .map(({ section, index }) => finding({
      rule,
      effectiveSeverity: severity,
      pointer: pointer("section_coverage", index, "coverage_status"),
      affectedObjectIds: [section.section_id],
      message: `Section applicability ${section.applicability} is incompatible with coverage status ${section.coverage_status}.`,
    }));
}

export function evaluateMNF003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  return context.report.section_coverage
    .map((section, index) => ({ section, index }))
    .filter(({ section }) =>
      (section.coverage_status === "covered" || section.coverage_status === "no_records") &&
      (section.source_universe_ids.length === 0 || section.evidence_bindings.length === 0 ||
        (section.coverage_status === "no_records" && (section.omission_or_gap_reasons.state !== "known" || section.omission_or_gap_reasons.value.length === 0))),
    )
    .map(({ section, index }) => finding({
      rule,
      effectiveSeverity: severity,
      pointer: pointer("section_coverage", index),
      affectedObjectIds: [section.section_id],
      sourceBindings: section.evidence_bindings,
      message: `${section.coverage_status} section lacks a source-universe binding, source evidence, or explicit negative-inventory rationale.`,
    }));
}

export function evaluateMNF004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  if (context.report.report_mode !== "full_archive") return [];
  return evaluateMNF001(context, rule, severity);
}

export function evaluateMNF005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const modules = new Map(context.report.module_manifest.map((module) => [module.module_id, module]));
  const coverage = new Set(context.report.section_coverage.map((section) => section.section_id));
  for (const domain of inferredDomainTriggers(context.report)) {
    const requiredSections = DOMAIN_SECTIONS[domain];
    if (requiredSections === undefined) continue;
    const module = modules.get(domain);
    if (module?.status !== "enabled") {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: "/module_manifest", affectedObjectIds: [domain], message: `Triggered domain ${domain} is missing an enabled module.` }));
      continue;
    }
    for (const sectionId of requiredSections) {
      if (!module.section_ids.includes(sectionId) || !coverage.has(sectionId)) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: "/module_manifest",
          affectedObjectIds: [domain, sectionId],
          message: `Triggered domain ${domain} lacks required section ${sectionId} in its manifest or SectionCoverage ledger.`,
        }));
      }
    }
  }
  return findings;
}
