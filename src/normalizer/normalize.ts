import { createHash } from "node:crypto";

import { loadSchemas, SCIENTIFIC_REPORT_SCHEMA_ID } from "../lib/schema.js";
import {
  BUILT_IN_MODULE_ORDER,
  CORE_SECTIONS,
  DOMAIN_SECTIONS,
  OBJECT_SHAPES,
  OBJECT_TYPE_ALIASES,
  RECORD_KIND_TO_COLLECTION,
  REPORT_COLLECTIONS,
  SECTION_RECORD_KINDS,
  type DefaultMarker,
  type ObjectShape,
} from "./schema-shapes.js";
import type {
  JsonObject,
  JsonValue,
  NormalizeAuthoringOptions,
  NormalizationFinding,
  NormalizationResult,
  NormalizationSeverity,
  NormalizationTodo,
} from "./types.js";

const CREATED_AT_PLACEHOLDER = "1970-01-01T00:00:00.000Z";
const AUTHORING_INPUT_SCHEMA_ID = "https://schemas.report-prompt.org/v1/authoring-input.schema.json";
const NORMALIZER_SECTION_DERIVATION = "normalizer.section_coverage";
const FORBIDDEN_SENTINELS = new Set(["", "tbd", "tba", "n/a", "na", "unknown_as_text", "redacted_as_text"]);
const MISSING_STATES = new Set(["known", "unknown", "not_applicable", "withheld"]);
const PROVENANCE_STATES = new Set(["complete", "partial", "absent"]);

const RECORD_KINDS = new Set([
  ...Object.keys(RECORD_KIND_TO_COLLECTION),
  "other",
]);
const EXECUTION_ASSERTIONS = new Set([
  "performed", "planned", "inferred", "external", "not_performed", "unknown", "not_applicable",
]);

const ENUM_VALUES: Readonly<Record<string, readonly string[]>> = {
  provenance_status: ["complete", "partial", "absent"],
  report_mode: ["summary", "full_archive", "filtered_working_copy"],
  module_status: ["enabled", "not_applicable", "undetermined"],
  applicability: ["applicable", "not_applicable", "undetermined"],
  coverage_status: ["covered", "partial", "no_records", "unknown", "not_applicable", "withheld"],
  authority_basis: ["authoritative_registry", "reconciled_authoritative_registries", "declared_inventory", "discovery_process", "none"],
  enumeration_status: ["authoritative_exhaustive", "registered_not_proven_exhaustive", "open_ended", "unknown"],
  report_completeness: ["proven_within_declared_universe", "registered_sources_accounted_for", "partial", "cannot_be_established"],
  inventory_accounting: ["complete", "incomplete", "unknown"],
  accessibility: ["all_accessible", "limitations_present", "unknown"],
  scientific_incorporation: ["complete_within_boundary", "partial", "none", "unknown"],
  source_kind: [
    "eln_entry", "file", "directory_inventory", "instrument_run", "compute_job", "ml_trial", "trajectory",
    "checkpoint_or_restart", "database_record", "publication", "correspondence", "human_declaration",
    "external_record", "other",
  ],
  authority_membership: ["in_authoritative_universe", "registered_non_authoritative", "membership_unknown"],
  disposition: ["included", "excluded_with_reason", "unreadable", "inaccessible", "duplicate", "unmapped", "pending"],
  content_access: ["available", "available_with_conditions", "partially_accessible", "unreadable", "inaccessible", "unknown", "withheld"],
  disclosure_class: ["public", "internal", "restricted", "secret", "unknown"],
  disclosure_level: ["public", "internal", "restricted"],
  withholding_reason_code: [
    "privacy", "ethics_or_consent", "license_or_contract", "security", "controlled_access",
    "source_confidentiality", "other_restricted",
  ],
  projection_status: ["not_projected", "projected", "projection_incomplete", "unknown"],
  binding_role: ["direct", "derived_input", "context", "counterevidence", "decision_timing", "completion_evidence", "disclosure_evidence"],
  locator_type: [
    "json_pointer", "line_range", "page_range", "table_cell", "figure_panel", "timestamp_range",
    "frame_range", "record_key", "query", "uri_fragment", "whole_source", "other",
  ],
  work_state: ["planned", "attempted", "completed", "not_performed", "unknown"],
  execution_scope: ["this_project", "reanalysis", "external_study", "upstream_collaborator", "synthetic"],
  execution_status: ["performed", "planned", "inferred", "external", "not_performed", "unknown", "completed", "failed", "interrupted", "running"],
  attempt_outcome: ["succeeded", "partially_succeeded", "failed", "aborted", "cancelled_after_start", "running_at_cutoff", "outcome_unknown"],
  segment_kind: ["phase", "checkpoint_interval", "restart", "replicate_interval", "batch", "other"],
  segment_state: ["completed", "stopped", "crashed", "superseded_by_restart", "running_at_cutoff", "unknown"],
  usable_output_status: ["usable", "usable_with_qualification", "not_usable", "not_assessed", "unknown"],
  completion_criterion_timing: ["predefined", "adaptive", "post_hoc", "missing", "not_applicable"],
  resolution_criterion_timing: ["predefined", "adaptive", "post_hoc", "missing", "not_applicable"],
  timing_class: ["predefined", "adaptive", "post_hoc", "missing", "not_applicable"],
  resolution_status: [
    "resolved", "partially_resolved", "unresolved", "not_addressed", "not_evaluable", "open", "mitigated",
    "accepted", "unknown", "resolved_by_adjudication", "resolved_by_correction", "retained_as_heterogeneity",
    "review_required",
  ],
  identity_status: ["verified", "provisional", "ambiguous", "withheld", "unknown"],
  material_status: ["available", "consumed", "discarded", "lost", "contaminated", "restricted", "unknown"],
  lineage_status: ["closed", "partial", "broken", "unknown"],
  derivation_status: ["complete", "partial", "failed", "invalidated", "unknown"],
  run_role: ["historical_primary", "historical_secondary", "sensitivity", "verification_rerun", "exploratory", "external", "unknown"],
  scientific_effect_class: [
    "increase", "decrease", "no_detectable_effect", "equivalent", "heterogeneous",
    "effect_present_direction_uncertain", "not_estimated", "unknown", "not_applicable", "withheld",
  ],
  statistical_decision: [
    "reject_null", "do_not_reject_null", "equivalent", "noninferior", "inconclusive",
    "descriptive_only", "not_performed", "unknown", "not_applicable", "withheld",
  ],
  interpretability_status: ["interpretable", "qualified", "inconclusive", "not_interpretable", "unknown", "not_applicable", "withheld"],
  record_disposition: ["primary", "sensitivity_only", "contextual", "excluded", "superseded", "retracted", "pending_review", "unknown", "not_applicable", "withheld"],
  evidence_status: ["active", "qualified", "invalidated", "retracted", "superseded", "review_required", "unknown", "withheld"],
  quality_assessment: ["high", "moderate", "low", "not_assessed", "unknown", "withheld"],
  claim_type: ["background", "descriptive", "quantitative", "comparative", "associational", "predictive", "causal", "mechanistic", "methodological", "negative_or_absence", "resolution"],
  support_status: ["supported", "qualified", "contested", "unsupported", "invalidated", "review_required", "unknown", "withheld"],
  decision_timing: ["predefined", "adaptive", "post_hoc", "missing", "not_applicable"],
  validity_status: ["valid", "valid_for_scope", "qualified", "invalid", "review_required", "unknown", "not_applicable", "withheld"],
  reviewer_state: ["reviewed", "review_required", "unknown", "withheld"],
  identity_alignment: ["matched", "partially_matched", "mismatched", "unknown", "not_applicable", "withheld"],
  construct_alignment: ["matched", "partially_matched", "mismatched", "unknown", "not_applicable", "withheld"],
  condition_alignment: ["matched", "partially_matched", "mismatched", "unknown", "not_applicable", "withheld"],
  scale_alignment: ["matched", "partially_matched", "mismatched", "unknown", "not_applicable", "withheld"],
  mapping_type: ["identity", "sequence_or_structure", "construct", "material_lineage", "condition", "temporal_scale", "spatial_scale", "computational_to_experimental_observable", "model_to_target_population", "other_declared"],
  adjudication_status: ["unresolved", "resolved_with_rationale", "retained_as_heterogeneity", "review_required", "unknown", "withheld"],
  assessment_state: ["independent", "partially_dependent", "dependent", "unknown", "not_applicable", "withheld"],
  access_state: ["open", "available_with_conditions", "restricted", "unavailable", "unknown", "not_applicable"],
  termination_status: ["not_started", "running", "completed", "failed", "interrupted", "aborted", "unknown"],
  randomness_used: ["yes", "no", "unknown", "not_applicable"],
  capture_status: ["complete", "partial", "absent", "unknown", "not_applicable"],
  completeness: ["complete", "partial", "absent", "unknown"],
  decision_kind: [
    "scope_change", "method_change", "stopping", "restart", "exclusion", "outlier_handling",
    "population_definition", "metric_or_endpoint_selection", "model_or_trial_selection",
    "conflict_adjudication", "disclosure", "other",
  ],
  material_kind: [
    "biological_source", "sample", "aliquot", "pool", "well_or_container", "construct", "reagent",
    "specimen", "molecular_system", "dataset_record", "synthetic_material", "other",
  ],
  relationship_kind: [
    "derived_from", "aliquoted_from", "split_from", "pooled_from", "combined_with", "transformed_from",
    "measured_from", "filtered_from", "mapped_to_dataset_record", "identity_assertion", "other",
  ],
  population_kind: [
    "intention_to_treat", "per_protocol", "complete_case", "quality_control_passed", "training",
    "validation", "test", "simulation_frames", "other",
  ],
  inclusion_status: ["included", "excluded", "withdrawn", "unknown"],
  locator_kind: ["table_rows", "records", "array_slice", "frames", "time_window", "query", "files", "other"],
  derivation_kind: ["filter", "transform", "aggregation", "statistical_estimate", "model_fit", "simulation_analysis", "manual_calculation", "mapping", "other"],
  result_kind: ["quantitative", "qualitative", "observation", "classification", "comparison", "other"],
  failure_class: ["instrument", "reagent_or_material", "protocol_deviation", "data_integrity", "software", "hardware", "resource_exhaustion", "convergence_or_stability", "quality_control", "access_or_permission", "operator_or_process", "unknown", "withheld"],
  severity: ["information", "recoverable", "major", "blocking", "warning", "unknown", "withheld"],
  evidence_kind: ["result", "observation", "artifact", "source_statement", "derived_value", "method_validation", "external_evidence", "counterevidence", "other"],
  relationship: ["supports", "contradicts", "qualifies"],
  source_type: ["claim", "evidence_item", "argument_step"],
  target_type: ["argument_step", "claim"],
  member_type: ["claim", "evidence_item"],
  dependency_kind: ["logical_prerequisite", "shared_data", "shared_material", "shared_method", "shared_checkpoint", "derived_from", "cross_domain", "other"],
  propagation_policy: ["invalidate_downstream", "require_review", "qualify_downstream", "no_automatic_change"],
  dependency_status: ["active", "broken", "invalidated", "review_required", "unknown"],
  dimension: ["entity_identity", "entity_version", "construct_or_sequence", "material_or_system", "condition", "dose_or_concentration", "time_scale", "spatial_or_resolution_scale", "population", "measurement_or_endpoint", "other"],
  event_kind: ["correction", "retraction", "supersession", "source_update", "entity_merge_or_split", "disclosure_change", "other"],
  artifact_role: ["raw_input", "processed_input", "dataset", "code", "configuration", "environment_lock", "checkpoint", "result_output", "figure", "table", "log", "protocol", "recipe", "report", "other"],
  unit_kind: ["data_acquisition", "material_preparation", "wet_lab_experiment", "data_transformation", "statistical_analysis", "model_training", "model_inference", "simulation", "trajectory_analysis", "figure_or_table_derivation", "integrated_workflow", "other_declared"],
  criticality: ["critical", "supporting", "contextual"],
  invocation_kind: ["command", "notebook", "workflow", "instrument", "protocol", "manual_action", "service_call", "other", "unknown"],
  record_role: ["historical_actual", "planned", "recipe_template", "verification_run", "external_record", "unknown"],
  component_kind: ["cpu", "accelerator", "memory", "storage", "instrument", "sensor", "network", "other"],
  conservative_level: ["not_assessed", "R0_documented", "R1_replay_ready", "R2_verified_replay", "R3_independent_reproduction"],
};

const SPECIAL_ENUM_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {};

function collectionSpecificEnumValues(key: string, path: string): readonly string[] | undefined {
  if (key === "severity") {
    if (path.startsWith("/failures/")) return ["information", "recoverable", "major", "blocking", "unknown", "withheld"];
    if (path.startsWith("/review_tasks/")) return ["information", "warning", "blocking"];
  }
  if (key === "resolution_status") {
    if (path.startsWith("/research_questions/")) return ["resolved", "partially_resolved", "unresolved", "not_addressed", "not_evaluable"];
    if (path.startsWith("/limitations/")) return ["open", "mitigated", "resolved", "accepted", "unknown"];
    if (path.startsWith("/failures/")) return ["unresolved", "mitigated", "resolved_for_future_attempts", "not_applicable", "unknown", "withheld"];
  }
  if (key === "execution_status") {
    if (path.startsWith("/methods/")) return ["performed", "planned", "inferred", "external", "not_performed", "unknown"];
    if (path.startsWith("/analysis_runs/")) return ["completed", "failed", "interrupted", "running", "unknown"];
  }
  if (key === "validity_status") {
    if (path.startsWith("/argument_steps/")) return ["valid_for_scope", "qualified", "invalid", "review_required", "unknown", "withheld"];
    if (path.startsWith("/cross_domain_bridges/")) return ["valid", "qualified", "invalid", "unknown", "not_applicable", "withheld"];
  }
  if (key === "identity_status" && path.startsWith("/entities/")) {
    return ["verified", "provisional", "ambiguous", "withheld", "unknown"];
  }
  if (key === "category") {
    if (path.startsWith("/limitations/")) return ["scope", "source_coverage", "method", "data", "analysis", "uncertainty", "conflict", "access", "reproducibility", "disclosure", "other"];
    if (path.startsWith("/review_tasks/")) return ["entity_identity", "completion_evidence", "decision_timing", "conflict_adjudication", "exclusion", "causal_claim", "cross_domain_bridge", "revision_impact", "ethics_or_disclosure", "other"];
  }
  if (key === "status") {
    if (path.startsWith("/review_tasks/")) return ["open", "resolved", "waived", "not_applicable"];
    if (path.includes("/access_assessment/status")) return ["available_now", "verified_procedure", "controlled_access", "unavailable", "unknown", "not_applicable", "withheld"];
    if (path.includes("/coverage_disposition/status")) return ["assessed", "explicit_gap"];
  }
  if (key === "target_kind") {
    if (path.startsWith("/applicability_decisions/")) return ["field", "section", "module"];
    if (path.includes("/coverage_denominator_decision/exclusions/")) return ["claim", "output"];
  }
  return undefined;
}

const REFERENCE_EXCLUDED_KEYS = new Set([
  "source_item_id", "source_item_ids", "source_snapshot_id", "snapshot_id", "module_id", "domain_module_id",
  "universe_id", "source_universe_ids", "chunk_id", "projection_id", "authoring_input_id", "record_id", "review_task_id",
]);

const SOURCE_BINDING_REQUIRED_COLLECTIONS = new Set([
  "applicability_decisions", "attempts", "segments", "materials", "material_relationships", "analysis_populations", "analysis_runs",
  "results", "failures", "cross_domain_bridges", "conflict_sets", "revision_events",
]);

interface TodoDraft {
  category: NormalizationTodo["category"];
  severity: "warning" | "error";
  path: string;
  description: string;
  affectedObjectIds: string[];
}

class NormalizationContext {
  readonly findings: NormalizationFinding[] = [];
  readonly todoDrafts: TodoDraft[] = [];
  readonly rootUnmappedRecords: JsonObject[] = [];
  readonly rootRecordMetadata: JsonObject[] = [];
  readonly domainPayloads: JsonObject[] = [];
  readonly domainPayloadBindings: JsonObject[] = [];
  readonly applicabilityPlaceholderTargets = new Map<string, { targetKind: "field" | "section" | "module"; target: string; ruleId: string }>();

  add(
    code: string,
    severity: NormalizationSeverity,
    path: string,
    message: string,
    options: {
      recordId?: string | undefined;
      todoCategory?: TodoDraft["category"] | undefined;
      affectedObjectIds?: string[] | undefined;
    } = {},
  ): void {
    const finding: NormalizationFinding = { code, severity, path, message };
    if (options.recordId !== undefined) finding.record_id = options.recordId;
    this.findings.push(finding);
    if (severity !== "information" && options.todoCategory !== undefined) {
      this.todoDrafts.push({
        category: options.todoCategory,
        severity,
        path,
        description: message,
        affectedObjectIds: [...(options.affectedObjectIds ?? (options.recordId === undefined ? [] : [options.recordId]))],
      });
    }
  }
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneJson<T extends JsonValue>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneJson(item)) as T;
  if (isObject(value)) {
    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value)) result[key] = cloneJson(item);
    return result as T;
  }
  return value;
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function objectValue(value: JsonValue | undefined): JsonObject | undefined {
  return isObject(value) ? value : undefined;
}

function arrayValue(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function pointerEscape(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function stableStringify(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key] as JsonValue)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareJson(a: JsonValue, b: JsonValue): number {
  return stableStringify(a).localeCompare(stableStringify(b), "en");
}

function token(value: string): string {
  return value.trim().replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();
}

function identifierLike(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9._:-]*$/.test(value);
}

function normalizedEnum(
  key: string,
  value: JsonValue,
  path: string,
  context: NormalizationContext,
): JsonValue {
  if (typeof value !== "string") return value;
  const normalizedToken = token(value);
  const alias = SPECIAL_ENUM_ALIASES[key]?.[normalizedToken];
  const allowed = collectionSpecificEnumValues(key, path) ?? ENUM_VALUES[key];
  let replacement: string | undefined = alias;
  if (replacement === undefined && allowed !== undefined) {
    replacement = allowed.find((candidate) => token(candidate) === normalizedToken);
  }
  if (replacement !== undefined && replacement !== value) {
    context.add(
      "NORM_ENUM_ALIAS",
      "information",
      path,
      `Normalized enumeration alias ${JSON.stringify(value)} to ${JSON.stringify(replacement)}.`,
    );
    return replacement;
  }
  if (allowed !== undefined && replacement === undefined) {
    const conservative = allowed.includes("unknown") ? "unknown" : undefined;
    context.add(
      "NORM_ENUM_UNSUPPORTED",
      "error",
      path,
      conservative === undefined
        ? `Enumeration value ${JSON.stringify(value)} has no lossless mapping in the active collection schema and was preserved for contract review.`
        : `Enumeration value ${JSON.stringify(value)} is invalid for this collection and was conservatively changed to "unknown".`,
      { todoCategory: "contract_mismatch" },
    );
    return conservative ?? value;
  }
  return value;
}

function normalizeRecordKind(value: JsonValue | undefined, path: string, context: NormalizationContext): string | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = token(value);
  if (RECORD_KINDS.has(candidate)) {
    if (candidate !== value) {
      context.add("NORM_ENUM_ALIAS", "information", path, `Normalized record kind ${JSON.stringify(value)} to ${JSON.stringify(candidate)}.`);
    }
    return candidate;
  }
  return value;
}

function normalizeExecutionAssertion(value: JsonValue | undefined, path: string, context: NormalizationContext): string | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = token(value);
  if (!EXECUTION_ASSERTIONS.has(candidate)) return value;
  if (candidate !== value) {
    context.add("NORM_ENUM_ALIAS", "information", path, `Normalized execution assertion ${JSON.stringify(value)} to ${JSON.stringify(candidate)}.`);
  }
  return candidate;
}

function normalizeObjectType(value: string): string | undefined {
  const candidate = token(value);
  return OBJECT_TYPE_ALIASES[candidate];
}

function normalizeModuleId(value: string): string {
  return token(value);
}

function normalizeSourceBindings(
  value: JsonValue | undefined,
  path: string,
  context: NormalizationContext,
): JsonObject[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    context.add("NORM_SOURCE_BINDINGS_TYPE", "error", path, "Source bindings must be an array; the invalid value was not used.", {
      todoCategory: "contract_mismatch",
    });
    return [];
  }
  const bindings: JsonObject[] = [];
  value.forEach((entry, index) => {
    if (!isObject(entry)) {
      context.add("NORM_SOURCE_BINDING_TYPE", "error", `${path}/${index}`, "Source binding must be an object; the invalid entry was not used.", {
        todoCategory: "contract_mismatch",
      });
      return;
    }
    const binding = cloneJson(entry);
    if (binding.binding_role !== undefined) {
      binding.binding_role = normalizedEnum("binding_role", binding.binding_role, `${path}/${index}/binding_role`, context);
    }
    const locator = objectValue(binding.locator);
    if (locator?.locator_type !== undefined) {
      locator.locator_type = normalizedEnum("locator_type", locator.locator_type, `${path}/${index}/locator/locator_type`, context);
    }
    bindings.push(binding);
  });
  const deduplicated = new Map<string, JsonObject>();
  for (const binding of bindings) deduplicated.set(stableStringify(binding), binding);
  return [...deduplicated.values()].sort(compareJson);
}

function mergeSourceBindings(
  a: JsonValue | undefined,
  b: JsonValue | undefined,
  path: string,
  context: NormalizationContext,
): JsonObject[] {
  return normalizeSourceBindings([...normalizeSourceBindings(a, path, context), ...normalizeSourceBindings(b, path, context)], path, context);
}

function isForbiddenSentinel(value: JsonValue): boolean {
  return typeof value === "string" && FORBIDDEN_SENTINELS.has(value.trim().toLowerCase());
}

function missingReason(recordId: string | undefined, fieldPath: string): string {
  const fieldLabel = fieldPath.split("/").filter(Boolean).join(".") || "the required field";
  return recordId === undefined
    ? `No value was supplied for ${fieldLabel}.`
    : `Authoring record ${recordId} did not supply a value for ${fieldLabel}.`;
}

function makeUnknownEnvelope(
  reason: string,
  sourceBindings: JsonObject[] = [],
  provenanceStatus?: "partial" | "absent",
): JsonObject {
  return {
    state: "unknown",
    value: null,
    source_bindings: sourceBindings,
    derivation_bindings: [],
    missing_reason: reason,
    provenance_status: provenanceStatus ?? (sourceBindings.length > 0 ? "partial" : "absent"),
  };
}

function makeKnownDerivedEnvelope(value: JsonValue, reasonBinding = NORMALIZER_SECTION_DERIVATION): JsonObject {
  return {
    state: "known",
    value,
    source_bindings: [],
    derivation_bindings: [reasonBinding],
    missing_reason: null,
    provenance_status: "complete",
  };
}

function looksLikeEnvelope(value: JsonObject): boolean {
  return "state" in value && ("value" in value || "missing_reason" in value || "provenance_status" in value || "derivation_bindings" in value);
}

function normalizeEnvelope(
  input: JsonValue | undefined,
  path: string,
  inheritedBindings: JsonObject[],
  context: NormalizationContext,
  recordId?: string,
): JsonObject {
  if (input === undefined || input === null || (input !== undefined && isForbiddenSentinel(input))) {
    if (input !== undefined) {
      context.add(
        "NORM_AMBIGUOUS_MISSING_VALUE",
        "warning",
        path,
        "Converted an empty, null, or ambiguous missing-value sentinel to an explicit unknown envelope; no not-applicable or withheld state was inferred.",
        { recordId, todoCategory: "missing_value" },
      );
    } else {
      context.add("NORM_UNKNOWN_EXPANDED", "warning", path, `Expanded a missing source-derived field as unknown at ${path}.`, {
        recordId,
        todoCategory: "missing_value",
      });
    }
    return makeUnknownEnvelope(missingReason(recordId, path), inheritedBindings);
  }

  if (!isObject(input) || !looksLikeEnvelope(input)) {
    const provenance = inheritedBindings.length > 0 ? "partial" : "absent";
    if (inheritedBindings.length === 0) {
      context.add(
        "NORM_KNOWN_VALUE_WITHOUT_PROVENANCE",
        "error",
        path,
        "Wrapped the supplied value as known, but no source or derivation binding establishes its provenance.",
        { recordId, todoCategory: "missing_value" },
      );
    }
    return {
      state: "known",
      value: normalizeDeep(input, path, inheritedBindings, context, recordId),
      source_bindings: inheritedBindings,
      derivation_bindings: [],
      missing_reason: null,
      provenance_status: provenance,
    };
  }

  const envelope = cloneJson(input);
  envelope.state = normalizedEnum("state", envelope.state as JsonValue, `${path}/state`, context);
  let state = stringValue(envelope.state);
  if (state === undefined || !MISSING_STATES.has(state)) {
    context.add("NORM_INVALID_MISSING_STATE", "error", `${path}/state`, "The missingness envelope has an invalid state; it was conservatively changed to unknown.", {
      recordId,
      todoCategory: "contract_mismatch",
    });
    state = "unknown";
    envelope.state = state;
  }

  envelope.source_bindings = mergeSourceBindings(envelope.source_bindings, inheritedBindings, `${path}/source_bindings`, context);
  const derivationBindings = Array.isArray(envelope.derivation_bindings)
    ? envelope.derivation_bindings.filter((item): item is string => typeof item === "string")
    : [];
  envelope.derivation_bindings = [...new Set(derivationBindings)].sort((a, b) => a.localeCompare(b, "en"));

  if (state === "known") {
    if (!("value" in envelope) || envelope.value === null || isForbiddenSentinel(envelope.value as JsonValue)) {
      context.add(
        "NORM_KNOWN_WITHOUT_VALUE",
        "error",
        path,
        "A known envelope had no usable value; it was conservatively changed to unknown rather than inventing a value.",
        { recordId, todoCategory: "missing_value" },
      );
      envelope.state = "unknown";
      envelope.value = null;
      envelope.missing_reason = missingReason(recordId, path);
      envelope.provenance_status = (envelope.source_bindings as JsonValue[]).length > 0 ? "partial" : "absent";
      return envelope;
    }
    envelope.value = normalizeDeep(envelope.value as JsonValue, `${path}/value`, inheritedBindings, context, recordId);
    envelope.missing_reason = null;
    const suppliedProvenance = stringValue(envelope.provenance_status);
    if (suppliedProvenance === undefined || !PROVENANCE_STATES.has(suppliedProvenance)) {
      envelope.provenance_status = (envelope.source_bindings as JsonValue[]).length > 0 || derivationBindings.length > 0 ? "complete" : "absent";
    }
    if ((envelope.source_bindings as JsonValue[]).length === 0 && derivationBindings.length === 0) {
      context.add("NORM_KNOWN_VALUE_WITHOUT_PROVENANCE", "error", path, "Known value has neither a source binding nor a derivation binding.", {
        recordId,
        todoCategory: "missing_value",
      });
    }
    return envelope;
  }

  if (envelope.value !== undefined && envelope.value !== null) {
    context.add(
      state === "withheld" ? "NORM_WITHHELD_VALUE_REMOVED" : "NORM_NONKNOWN_VALUE_REMOVED",
      "error",
      `${path}/value`,
      `Removed a non-null value from a ${state} envelope to preserve its explicit missingness/disclosure semantics.`,
      { recordId, todoCategory: "contract_mismatch" },
    );
  }
  envelope.value = null;
  const reason = stringValue(envelope.missing_reason);
  if (reason === undefined || reason.trim() === "") {
    envelope.missing_reason = missingReason(recordId, path);
    context.add("NORM_MISSING_REASON_EXPANDED", "warning", `${path}/missing_reason`, `Added a reason for the explicit ${state} state.`, {
      recordId,
      todoCategory: "missing_value",
    });
  }
  const suppliedProvenance = stringValue(envelope.provenance_status);
  if (suppliedProvenance === undefined || !PROVENANCE_STATES.has(suppliedProvenance)) {
    envelope.provenance_status = (envelope.source_bindings as JsonValue[]).length > 0 ? "partial" : "absent";
  }
  if (state === "withheld") {
    if (typeof envelope.withholding_reason_code === "string") {
      envelope.withholding_reason_code = normalizedEnum(
        "withholding_reason_code",
        envelope.withholding_reason_code,
        `${path}/withholding_reason_code`,
        context,
      );
    } else {
      context.add(
        "NORM_WITHHOLDING_REASON_CODE_REQUIRED",
        "error",
        `${path}/withholding_reason_code`,
        "A withheld field requires an author-supplied non-sensitive withholding reason code; none was invented.",
        { recordId, todoCategory: "review_required" },
      );
    }
    if (!identifierLike(envelope.disclosure_decision_id)) {
      context.add(
        "NORM_DISCLOSURE_DECISION_REQUIRED",
        "error",
        `${path}/disclosure_decision_id`,
        "A withheld field requires an author-supplied disclosure decision identifier; none was invented.",
        { recordId, todoCategory: "review_required" },
      );
    }
  }
  if (state === "not_applicable" && typeof envelope.applicability_decision_id !== "string") {
    const diagnosticDecisionId = `applicability.field.${createHash("sha256").update(path).digest("hex").slice(0, 20)}`;
    envelope.applicability_decision_id = diagnosticDecisionId;
    context.applicabilityPlaceholderTargets.set(diagnosticDecisionId, {
      targetKind: "field",
      target: path,
      ruleId: "FA001",
    });
    context.add(
      "NORM_APPLICABILITY_DECISION_REQUIRED",
      "error",
      `${path}/applicability_decision_id`,
      "A not_applicable field requires a traceable applicability decision; a deterministic undetermined placeholder was linked without inventing an applicability outcome.",
      { recordId, todoCategory: "review_required", affectedObjectIds: [diagnosticDecisionId] },
    );
  }
  return envelope;
}

function normalizeDeep(
  input: JsonValue,
  path: string,
  inheritedBindings: JsonObject[],
  context: NormalizationContext,
  recordId?: string,
): JsonValue {
  if (Array.isArray(input)) {
    return input.map((item, index) => normalizeDeep(item, `${path}/${index}`, inheritedBindings, context, recordId));
  }
  if (!isObject(input)) return input;
  if (looksLikeEnvelope(input)) return normalizeEnvelope(input, path, inheritedBindings, context, recordId);

  const output: JsonObject = {};
  for (const [key, raw] of Object.entries(input)) {
    const childPath = `${path}/${pointerEscape(key)}`;
    if (key === "source_bindings" || key === "evidence_bindings") {
      output[key] = normalizeSourceBindings(raw, childPath, context);
    } else {
      const normalized = normalizeDeep(raw, childPath, inheritedBindings, context, recordId);
      output[key] = normalizedEnum(key, normalized, childPath, context);
    }
  }
  return output;
}

function materializeDefault(
  marker: DefaultMarker,
  existing: JsonValue | undefined,
  path: string,
  bindings: JsonObject[],
  context: NormalizationContext,
  recordId?: string,
): JsonValue {
  switch (marker.kind) {
    case "array":
      if (existing === undefined) {
        context.add("NORM_EMPTY_COLLECTION_PLACEHOLDER", "warning", path, "Created an empty structural collection because no items were supplied; this does not establish no records or not applicable.", {
          recordId,
          todoCategory: "missing_value",
        });
        return [];
      }
      if (!Array.isArray(existing)) {
        context.add("NORM_EXPECTED_ARRAY", "error", path, "Expected an array; the supplied value was preserved for review.", {
          recordId,
          todoCategory: "contract_mismatch",
        });
        return normalizeDeep(existing, path, bindings, context, recordId);
      }
      return normalizeDeep(existing, path, bindings, context, recordId);
    case "null":
      return existing === undefined ? null : normalizeDeep(existing, path, bindings, context, recordId);
    case "extensions":
      if (existing === undefined) return {};
      return normalizeDeep(existing, path, bindings, context, recordId);
    case "literal":
      if (existing !== undefined) return normalizedEnum(path.slice(path.lastIndexOf("/") + 1), normalizeDeep(existing, path, bindings, context, recordId), path, context);
      if (["unknown", "missing", "not_evaluable", "not_assessed"].includes(String(marker.value))) {
        context.add("NORM_UNKNOWN_STATE_DEFAULTED", "warning", path, `Defaulted the absent field to ${JSON.stringify(marker.value)}; the value was not inferred.`, {
          recordId,
          todoCategory: "missing_value",
        });
      }
      return marker.value;
    case "unknown-envelope":
      return normalizeEnvelope(existing, path, bindings, context, recordId);
    case "object": {
      const source = isObject(existing) ? cloneJson(existing) : {};
      if (existing !== undefined && !isObject(existing)) {
        context.add("NORM_EXPECTED_OBJECT", "error", path, "Expected an object; an explicit incomplete object was created for review.", {
          recordId,
          todoCategory: "contract_mismatch",
        });
      }
      for (const [key, childMarker] of Object.entries(marker.fields)) {
        source[key] = materializeDefault(childMarker, source[key], `${path}/${pointerEscape(key)}`, bindings, context, recordId);
      }
      return normalizeDeep(source, path, bindings, context, recordId);
    }
  }
}

function sourceBindingIds(bindings: JsonObject[]): string[] {
  return [...new Set(bindings.map((binding) => stringValue(binding.source_item_id)).filter((id): id is string => id !== undefined))]
    .sort((a, b) => a.localeCompare(b, "en"));
}

function normalizeIdArray(value: JsonValue[]): JsonValue[] {
  if (!value.every((item) => typeof item === "string")) return value;
  return [...new Set(value as string[])].sort((a, b) => a.localeCompare(b, "en"));
}

function rewriteReferences(input: JsonValue, key: string | undefined, idMap: ReadonlyMap<string, string>): JsonValue {
  if (typeof input === "string" && key !== undefined && !REFERENCE_EXCLUDED_KEYS.has(key)) {
    const isReference = key === "object_id" || key.endsWith("_id") || key.endsWith("_ids") || key === "affected_ids";
    if (isReference) return idMap.get(input) ?? input;
    return input;
  }
  if (Array.isArray(input)) return input.map((item) => rewriteReferences(item, key, idMap));
  if (!isObject(input)) return input;
  const result: JsonObject = {};
  for (const [childKey, value] of Object.entries(input)) result[childKey] = rewriteReferences(value, childKey, idMap);
  return result;
}

function stableOrderDeep(input: JsonValue, key?: string): JsonValue {
  if (Array.isArray(input)) {
    let values = input.map((item) => stableOrderDeep(item));
    if (key !== undefined && (key.endsWith("_ids") || key === "affected_ids")) values = normalizeIdArray(values);
    if (key === "source_bindings" || key === "evidence_bindings") {
      const unique = new Map(values.map((item) => [stableStringify(item), item]));
      values = [...unique.values()].sort(compareJson);
    }
    if (key === "identifiers") values.sort(compareJson);
    if (key === "evidence_links") values.sort(compareJson);
    return values;
  }
  if (!isObject(input)) return input;
  const result: JsonObject = {};
  for (const [childKey, value] of Object.entries(input)) result[childKey] = stableOrderDeep(value, childKey);
  return result;
}

function applyAssertionDefaults(
  object: JsonObject,
  collection: string,
  assertion: string | undefined,
  path: string,
  context: NormalizationContext,
  recordId: string,
): void {
  if (assertion === undefined) return;
  if ((collection === "campaigns" || collection === "work_units") && object.work_state === undefined) {
    const mapping: Readonly<Record<string, string>> = {
      performed: "attempted",
      planned: "planned",
      inferred: "unknown",
      external: "unknown",
      not_performed: "not_performed",
      unknown: "unknown",
      not_applicable: "unknown",
    };
    object.work_state = mapping[assertion] ?? "unknown";
    if (assertion === "performed") {
      context.add(
        "NORM_PERFORMED_NOT_PROMOTED_TO_COMPLETED",
        "information",
        `${path}/work_state`,
        "Mapped performed to attempted, not completed; completion requires separate criteria and evidence.",
        { recordId },
      );
    }
  }
  if (collection === "methods" && object.execution_status === undefined) {
    const supported = new Set(["performed", "planned", "inferred", "external", "not_performed", "unknown"]);
    object.execution_status = supported.has(assertion) ? assertion : "unknown";
  }
  if (assertion === "not_applicable" && collection !== "research_questions") {
    context.add(
      "NORM_ASSERTION_NOT_APPLICABLE_UNREPRESENTABLE",
      "warning",
      path,
      "The authoring execution assertion is not_applicable, but this canonical object has no equivalent execution state; it remains recorded in extensions and the canonical state was left unknown.",
      { recordId, todoCategory: "contract_mismatch" },
    );
  }
  if ((collection === "attempts" || collection === "segments" || collection === "analysis_runs") && ["planned", "not_performed"].includes(assertion)) {
    context.add(
      "NORM_EXECUTION_RECORD_ASSERTION_CONFLICT",
      "error",
      path,
      `A ${collection.slice(0, -1)} record is classified as ${assertion}; normalization did not convert it into evidence of execution.`,
      { recordId, todoCategory: "contract_mismatch" },
    );
  }
}

function makeAuthoringMetadata(record: JsonObject): JsonObject {
  return {
    record_id: cloneJson(record.record_id as JsonValue),
    execution_assertion: cloneJson(record.execution_assertion as JsonValue),
    domain_module_id: cloneJson(record.domain_module_id as JsonValue),
    subject_ids: cloneJson((record.subject_ids ?? []) as JsonValue),
    review_status: cloneJson(record.review_status as JsonValue),
  };
}

function applyMissingnessRecords(
  object: JsonObject,
  missingFields: JsonValue | undefined,
  localId: string,
  canonicalId: string,
  path: string,
  bindings: JsonObject[],
  shape: ObjectShape,
  context: NormalizationContext,
): void {
  if (!Array.isArray(missingFields)) return;
  missingFields.forEach((entry, index) => {
    if (!isObject(entry)) {
      context.add("NORM_MISSINGNESS_RECORD_TYPE", "error", `${path}/missing_fields/${index}`, "Missingness entry must be an object.", {
        recordId: localId,
        todoCategory: "contract_mismatch",
      });
      return;
    }
    const targetObject = stringValue(entry.object_id);
    if (targetObject !== undefined && targetObject !== localId && targetObject !== canonicalId) return;
    let pointer = stringValue(entry.field_pointer);
    if (pointer === undefined || !pointer.startsWith("/")) {
      context.add("NORM_MISSINGNESS_POINTER", "error", `${path}/missing_fields/${index}/field_pointer`, "Missingness field pointer is invalid.", {
        recordId: localId,
        todoCategory: "contract_mismatch",
      });
      return;
    }
    if (pointer.startsWith("/payload/")) pointer = pointer.slice("/payload".length);
    const segments = pointer.slice(1).split("/").map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
    if (segments.some((segment) => ["__proto__", "prototype", "constructor"].includes(segment))) {
      context.add("NORM_UNSAFE_POINTER", "error", `${path}/missing_fields/${index}/field_pointer`, "Unsafe missingness pointer was rejected.", {
        recordId: localId,
        todoCategory: "contract_mismatch",
      });
      return;
    }
    const rootField = segments[0];
    if (rootField === undefined || !shape.allowedKeys.includes(rootField)) {
      context.rootUnmappedRecords.push({
        record_id: localId,
        canonical_object_id: canonicalId,
        unmapped_missingness_record: cloneJson(entry),
        source_bindings: bindings,
      });
      context.add(
        "NORM_MISSINGNESS_FIELD_UNMAPPED",
        "warning",
        `${path}/missing_fields/${index}/field_pointer`,
        `Missingness pointer ${pointer} is not represented by the ${shape.collection} schema; it remains preserved in authoring metadata rather than becoming an invalid canonical property.`,
        { recordId: localId, todoCategory: "contract_mismatch", affectedObjectIds: [canonicalId] },
      );
      return;
    }
    let cursor: JsonObject = object;
    for (const segment of segments.slice(0, -1)) {
      if (!isObject(cursor[segment])) cursor[segment] = {};
      cursor = cursor[segment] as JsonObject;
    }
    const finalSegment = segments.at(-1);
    if (finalSegment === undefined || finalSegment === "") return;
    const existing = cursor[finalSegment];
    const stateCandidate = typeof entry.state === "string" ? token(entry.state) : "unknown";
    const state = MISSING_STATES.has(stateCandidate) && stateCandidate !== "known" ? stateCandidate : "unknown";
    const reason = stringValue(entry.reason) ?? missingReason(localId, `${path}${pointer}`);
    const provenanceCandidate = stringValue(entry.provenance_status);
    const provenance = provenanceCandidate !== undefined && PROVENANCE_STATES.has(provenanceCandidate)
      ? provenanceCandidate
      : (bindings.length > 0 ? "partial" : "absent");
    let applicabilityDecisionId = state === "not_applicable"
      ? stringValue(entry.applicability_decision_id)
      : undefined;
    if (state === "not_applicable" && applicabilityDecisionId === undefined) {
      applicabilityDecisionId = `applicability.field.${createHash("sha256").update(`${path}${pointer}`).digest("hex").slice(0, 20)}`;
      context.applicabilityPlaceholderTargets.set(applicabilityDecisionId, {
        targetKind: "field",
        target: `${path}${pointer}`,
        ruleId: "FA001",
      });
      context.add(
        "NORM_APPLICABILITY_DECISION_REQUIRED",
        "error",
        `${path}${pointer}/applicability_decision_id`,
        "A not_applicable missingness record requires a traceable applicability decision; a deterministic undetermined placeholder was linked without inventing an applicability outcome.",
        { recordId: localId, todoCategory: "review_required", affectedObjectIds: [canonicalId, applicabilityDecisionId] },
      );
    }
    if (isObject(existing) && looksLikeEnvelope(existing)) {
      const existingState = stringValue(existing.state);
      if (existingState !== undefined && token(existingState) !== state) {
        context.add(
          "NORM_MISSINGNESS_CONFLICT",
          "error",
          `${path}${pointer}`,
          `The payload envelope state ${existingState} conflicts with missing_fields state ${state}; the explicit payload envelope was preserved.`,
          { recordId: localId, todoCategory: "contract_mismatch" },
        );
        return;
      }
      cursor[finalSegment] = {
        ...existing,
        state,
        value: null,
        source_bindings: mergeSourceBindings(existing.source_bindings, bindings, `${path}${pointer}/source_bindings`, context),
        derivation_bindings: Array.isArray(existing.derivation_bindings) ? existing.derivation_bindings : [],
        missing_reason: reason,
        provenance_status: provenance,
        ...(state === "not_applicable" ? { applicability_decision_id: applicabilityDecisionId ?? null } : {}),
      };
      return;
    }
    cursor[finalSegment] = {
      state,
      value: null,
      source_bindings: bindings,
      derivation_bindings: [],
      missing_reason: reason,
      provenance_status: provenance,
      ...(state === "not_applicable" ? { applicability_decision_id: applicabilityDecisionId ?? null } : {}),
    };
  });
}

function arrayHasValues(object: JsonObject, key: string, minimum = 1): boolean {
  return Array.isArray(object[key]) && (object[key] as JsonValue[]).length >= minimum;
}

function addObjectRequirementFindings(
  object: JsonObject,
  shape: ObjectShape,
  path: string,
  recordId: string,
  canonicalId: string,
  context: NormalizationContext,
): void {
  const requireArray = (key: string, minimum = 1, message?: string): void => {
    if (arrayHasValues(object, key, minimum)) return;
    context.add(
      "NORM_REQUIRED_RELATIONSHIP_MISSING",
      "error",
      `${path}/${pointerEscape(key)}`,
      message ?? `Field ${key} requires at least ${minimum} author-supplied item${minimum === 1 ? "" : "s"}; normalization left it empty rather than inventing references.`,
      { recordId, todoCategory: "missing_reference", affectedObjectIds: [canonicalId] },
    );
  };
  const requireAnyArray = (keys: string[], message: string): void => {
    if (keys.some((key) => arrayHasValues(object, key))) return;
    context.add("NORM_REQUIRED_RELATIONSHIP_MISSING", "error", path, message, {
      recordId,
      todoCategory: "missing_reference",
      affectedObjectIds: [canonicalId],
    });
  };

  const canonicalBindingField = shape.allowedKeys.includes("evidence_bindings") ? "evidence_bindings" : "source_bindings";
  if (SOURCE_BINDING_REQUIRED_COLLECTIONS.has(shape.collection) && !arrayHasValues(object, canonicalBindingField)) {
    context.add("NORM_REQUIRED_SOURCE_BINDING_MISSING", "error", `${path}/${canonicalBindingField}`, "This canonical object requires source or evidence bindings; none were invented.", {
      recordId,
      todoCategory: "missing_value",
      affectedObjectIds: [canonicalId],
    });
  }

  switch (shape.collection) {
    case "applicability_decisions":
      break;
    case "work_units":
      if (object.work_state === "completed") {
        const criteria = objectValue(object.completion_criteria);
        if (criteria?.state !== "known") {
          context.add("NORM_COMPLETION_UNSUPPORTED", "error", `${path}/completion_criteria`, "Completed work requires known completion criteria; normalization did not create them.", {
            recordId,
            todoCategory: "review_required",
            affectedObjectIds: [canonicalId],
          });
        }
        const assessment = objectValue(object.completion_assessment);
        if (assessment?.state !== "known") {
          context.add("NORM_COMPLETION_UNSUPPORTED", "error", `${path}/completion_assessment`, "Completed work requires a known completion assessment; normalization did not create one.", {
            recordId,
            todoCategory: "review_required",
            affectedObjectIds: [canonicalId],
          });
        }
        requireArray("completion_evidence", 1, "Completed work requires author-supplied completion evidence; none was invented.");
        requireArray("attempt_ids", 1, "Completed work requires at least one author-supplied attempt reference; none was invented.");
      }
      break;
    case "attempts":
      if (["failed", "aborted"].includes(String(object.attempt_outcome))) {
        requireArray("failure_event_ids", 1, "Failed or aborted attempts require an author-supplied failure-event reference; none was invented.");
      }
      break;
    case "segments":
      if (object.segment_kind === "restart") {
        if (typeof object.predecessor_segment_id !== "string") {
          context.add("NORM_REQUIRED_RELATIONSHIP_MISSING", "error", `${path}/predecessor_segment_id`, "A restart segment requires an author-supplied predecessor segment; none was invented.", {
            recordId,
            todoCategory: "missing_reference",
            affectedObjectIds: [canonicalId],
          });
        }
        const reason = objectValue(object.restart_reason);
        if (reason?.state !== "known" && reason?.state !== "withheld") {
          context.add("NORM_REQUIRED_FIELD_MISSING", "error", `${path}/restart_reason`, "A restart segment requires a known or withheld restart reason; none was invented.", {
            recordId,
            todoCategory: "missing_value",
            affectedObjectIds: [canonicalId],
          });
        }
      }
      break;
    case "methods":
      if (object.execution_status === "performed") {
        requireArray("actual_parameters", 1, "A performed method requires author-supplied actual parameters; planned or default values were not promoted.");
        if (!arrayHasValues(object, "source_bindings")) {
          context.add("NORM_REQUIRED_SOURCE_BINDING_MISSING", "error", `${path}/source_bindings`, "A performed method requires source bindings; none were invented.", {
            recordId,
            todoCategory: "missing_value",
            affectedObjectIds: [canonicalId],
          });
        }
      }
      break;
    case "decision_events":
      requireArray("affected_object_ids");
      if (["predefined", "adaptive", "post_hoc"].includes(String(object.timing_class))) {
        const timingBindings = arrayValue(object.source_bindings).filter(isObject)
          .filter((binding) => binding.binding_role === "decision_timing");
        if (timingBindings.length === 0) {
          context.add("NORM_DECISION_TIMING_EVIDENCE_MISSING", "error", `${path}/source_bindings`, "A predefined, adaptive, or post-hoc timing class requires a decision_timing source binding; none was invented.", {
            recordId,
            todoCategory: "review_required",
            affectedObjectIds: [canonicalId],
          });
        }
      }
      break;
    case "material_relationships":
      requireArray("input_material_ids");
      requireArray("output_material_ids");
      break;
    case "data_slices": {
      requireArray("input_artifacts");
      const locator = objectValue(object.locator);
      if (locator === undefined || typeof locator.locator_kind !== "string") {
        context.add("NORM_REQUIRED_FIELD_MISSING", "error", `${path}/locator/locator_kind`, "Data-slice locator kind is not supplied; normalization did not classify the slice locator as a guessed 'other'.", {
          recordId,
          todoCategory: "missing_value",
          affectedObjectIds: [canonicalId],
        });
      }
      break;
    }
    case "derivations":
      requireAnyArray(
        ["input_data_slice_ids", "input_derivation_ids", "input_artifact_ids"],
        "A derivation requires at least one author-supplied input data slice, upstream derivation, or artifact; none was invented.",
      );
      break;
    case "results":
      if (object.result_kind === "quantitative" && !isObject(object.effect_estimate)) {
        context.add("NORM_REQUIRED_FIELD_MISSING", "error", `${path}/effect_estimate`, "A quantitative result requires an author-supplied effect estimate; none was invented.", {
          recordId,
          todoCategory: "missing_value",
          affectedObjectIds: [canonicalId],
        });
      }
      if (object.derivation_closure_status === "complete") {
        requireArray("analysis_run_ids");
        requireArray("data_slice_ids");
        requireArray("derivation_ids");
      }
      if (["no_detectable_effect", "equivalent"].includes(String(object.scientific_effect_class)) && !isObject(object.negative_evidence_assessment)) {
        context.add("NORM_NEGATIVE_ASSESSMENT_MISSING", "error", `${path}/negative_evidence_assessment`, "A no-detectable-effect or equivalence result requires an explicit negative-evidence assessment; normalization did not infer assay adequacy.", {
          recordId,
          todoCategory: "review_required",
          affectedObjectIds: [canonicalId],
        });
      }
      if (["excluded", "superseded", "retracted"].includes(String(object.record_disposition))) {
        requireArray("decision_event_ids", 1, "Excluded, superseded, or retracted results require an author-supplied decision-event reference; none was invented.");
      }
      break;
    case "failures":
      break;
    case "evidence_items":
      requireAnyArray(
        ["result_ids", "artifact_ids", "derivation_ids", "source_item_ids", "source_bindings"],
        "An evidence item requires at least one result, artifact, derivation, source item, or source binding; none was invented.",
      );
      break;
    case "evidence_dependency_groups":
      requireArray("evidence_item_ids");
      break;
    case "claims":
      requireArray("subject_bindings");
      if (object.claim_type !== "background" && ["supported", "qualified"].includes(String(object.support_status))) {
        requireAnyArray(
          ["evidence_edge_ids", "argument_step_ids"],
          "A supported or qualified non-background claim requires evidence edges or argument steps; none were invented.",
        );
      }
      if (object.support_status === "invalidated") {
        requireArray("revision_event_ids", 1, "An invalidated claim requires a revision-event reference; none was invented.");
      }
      break;
    case "argument_steps":
      requireArray("premise_edge_ids");
      requireArray("conclusion_edge_ids");
      break;
    case "cross_domain_bridges":
      requireArray("source_entity_version_ids");
      requireArray("target_entity_version_ids");
      requireArray("enabled_argument_step_ids");
      break;
    case "conflict_sets":
      requireArray("member_edge_ids", 2);
      break;
    case "reproducibility_units":
      requireAnyArray(
        ["covered_work_unit_ids", "covered_analysis_run_ids", "covered_claim_ids", "covered_output_ids"],
        "A reproducibility unit requires at least one author-supplied target; none was invented.",
      );
      break;
    case "revision_events":
      requireArray("superseded_object_refs");
      break;
  }
}

function normalizeObject(
  payloadInput: JsonObject,
  shape: ObjectShape,
  identity: { canonicalId: string; version?: string; localId: string },
  record: JsonObject | undefined,
  path: string,
  idMap: ReadonlyMap<string, string>,
  context: NormalizationContext,
): JsonObject {
  const payload = cloneJson(payloadInput);
  const payloadBindingValue = payload.source_bindings ?? payload.evidence_bindings;
  const recordBindings = record === undefined
    ? normalizeSourceBindings(payloadBindingValue, `${path}/source_bindings`, context)
    : normalizeSourceBindings(record.source_bindings, `${path}/source_bindings`, context);
  const payloadBindings = normalizeSourceBindings(payloadBindingValue, `${path}/source_bindings`, context);
  const bindings = mergeSourceBindings(payloadBindings, recordBindings, `${path}/source_bindings`, context);

  const output: JsonObject = {};
  const extras: JsonObject = {};
  const allowed = new Set(shape.allowedKeys);
  for (const [key, value] of Object.entries(payload)) {
    if (allowed.has(key)) output[key] = cloneJson(value);
    else extras[key] = cloneJson(value);
  }

  output[shape.idKey] = identity.canonicalId;
  if (shape.versionKey !== undefined) {
    const payloadVersion = stringValue(output[shape.versionKey]);
    if (identity.version !== undefined) {
      if (payloadVersion !== undefined && payloadVersion !== identity.version) {
        context.add(
          "NORM_VERSION_REGISTRY_CONFLICT",
          "warning",
          `${path}/${shape.versionKey}`,
          `Used registry object version ${identity.version} instead of payload version ${payloadVersion}.`,
          { recordId: identity.localId, todoCategory: "missing_identity", affectedObjectIds: [identity.canonicalId] },
        );
      }
      output[shape.versionKey] = identity.version;
    } else if (payloadVersion === undefined) {
      output[shape.versionKey] = "draft";
      context.add(
        "NORM_DRAFT_VERSION_ASSIGNED",
        "warning",
        `${path}/${shape.versionKey}`,
        "Assigned the deterministic display version 'draft'; register an authoritative object version before release.",
        { recordId: identity.localId, todoCategory: "missing_identity", affectedObjectIds: [identity.canonicalId] },
      );
    }
  }

  const assertion = record === undefined ? undefined : stringValue(record.execution_assertion);
  applyAssertionDefaults(output, shape.collection, assertion, path, context, identity.localId);

  const bindingField = allowed.has("source_bindings")
    ? "source_bindings"
    : allowed.has("evidence_bindings")
      ? "evidence_bindings"
      : undefined;
  if (bindingField !== undefined) output[bindingField] = bindings;
  if (record !== undefined) {
    applyMissingnessRecords(output, record.missing_fields, identity.localId, identity.canonicalId, path, bindings, shape, context);
  }
  for (const [key, marker] of Object.entries(shape.defaults)) {
    if (key === "source_bindings" || key === "evidence_bindings") {
      output[key] = bindings;
      continue;
    }
    output[key] = materializeDefault(marker, output[key], `${path}/${pointerEscape(key)}`, bindings, context, identity.localId);
  }

  for (const key of shape.plainRequired) {
    const value = output[key];
    if (value === undefined || value === null || (typeof value === "string" && isForbiddenSentinel(value))) {
      if (typeof value === "string" && isForbiddenSentinel(value)) delete output[key];
      context.add(
        "NORM_REQUIRED_FIELD_MISSING",
        "error",
        `${path}/${pointerEscape(key)}`,
        `Required field ${key} is not supplied; normalization did not invent a scientific value.`,
        { recordId: identity.localId, todoCategory: key.endsWith("_id") ? "missing_reference" : "missing_value", affectedObjectIds: [identity.canonicalId] },
      );
    }
  }
  addObjectRequirementFindings(output, shape, path, identity.localId, identity.canonicalId, context);

  if (record !== undefined) {
    const metadata = makeAuthoringMetadata(record);
    if (allowed.has("extensions")) {
      const extensionMap = isObject(output.extensions) ? output.extensions : {};
      extensionMap["report_prompt.authoring"] = metadata;
      if (Object.keys(extras).length > 0) extensionMap["report_prompt.authoring_extras"] = extras;
      if (bindingField === undefined && bindings.length > 0) extensionMap["report_prompt.source_bindings"] = bindings;
      output.extensions = extensionMap;
    } else {
      context.rootRecordMetadata.push({ object_id: identity.canonicalId, ...metadata });
      if (Object.keys(extras).length > 0) {
        context.rootUnmappedRecords.push({
          record_id: identity.localId,
          canonical_object_id: identity.canonicalId,
          unmapped_payload_fields: extras,
          source_bindings: bindings,
        });
        context.add(
          "NORM_PAYLOAD_EXTRAS_PRESERVED_AT_ROOT",
          "warning",
          path,
          "Payload fields not represented by the canonical object were preserved in the root extension for review.",
          { recordId: identity.localId, todoCategory: "contract_mismatch", affectedObjectIds: [identity.canonicalId] },
        );
      }
    }
  } else if (Object.keys(extras).length > 0) {
    if (allowed.has("extensions")) {
      const extensionMap = isObject(output.extensions) ? output.extensions : {};
      extensionMap["report_prompt.existing_object_extras"] = extras;
      output.extensions = extensionMap;
    } else {
      context.rootUnmappedRecords.push({ canonical_object_id: identity.canonicalId, unmapped_payload_fields: extras });
    }
  }

  const normalized = normalizeDeep(output, path, bindings, context, identity.localId);
  const rewritten = rewriteReferences(normalized, undefined, idMap);
  return stableOrderDeep(rewritten) as JsonObject;
}

function findShapeByPayload(payload: JsonObject): ObjectShape | undefined {
  const matches = Object.values(OBJECT_SHAPES).filter((shape) => typeof payload[shape.idKey] === "string");
  if (matches.length <= 1) return matches[0];
  const scored = matches
    .map((shape) => ({
      shape,
      score: Object.keys(payload).filter((key) => shape.allowedKeys.includes(key)).length
        + (shape.versionKey !== undefined && payload[shape.versionKey] !== undefined ? 100 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.shape.collection.localeCompare(b.shape.collection, "en"));
  const first = scored[0];
  const second = scored[1];
  return first !== undefined && (second === undefined || first.score > second.score) ? first.shape : undefined;
}

function isDomainPayload(payload: JsonObject): boolean {
  return typeof payload.payload_id === "string" && typeof payload.domain === "string" && ["wet_lab", "ai_ml", "molecular_dynamics"].includes(token(payload.domain));
}

function recordCollection(record: JsonObject, path: string, context: NormalizationContext): string | undefined {
  const kind = normalizeRecordKind(record.record_kind, `${path}/record_kind`, context);
  if (kind !== undefined && kind !== "other") return RECORD_KIND_TO_COLLECTION[kind];
  const payload = objectValue(record.payload);
  if (payload === undefined || isDomainPayload(payload)) return undefined;
  return findShapeByPayload(payload)?.collection;
}

function registryEntries(input: JsonObject): JsonObject[] {
  return arrayValue(input.id_registry).filter(isObject).map((entry) => cloneJson(entry));
}

function matchingRegistryEntry(entries: JsonObject[], collection: string, localId: string): JsonObject | undefined {
  return entries.find((entry) => {
    const localKey = stringValue(entry.local_key);
    const objectType = stringValue(entry.object_type);
    return localKey === localId && objectType !== undefined && normalizeObjectType(objectType) === collection;
  });
}

interface RecordIdentity {
  collection?: string;
  canonicalId?: string;
  version?: string;
  localId: string;
  payload: JsonObject;
  record: JsonObject;
  path: string;
}

function buildRecordIdentities(input: JsonObject, context: NormalizationContext): RecordIdentity[] {
  const entries = registryEntries(input);
  const records = arrayValue(input.records).filter(isObject).map((record) => cloneJson(record));
  records.sort((a, b) => {
    const ak = `${stringValue(a.record_kind) ?? ""}\u0000${stringValue(a.record_id) ?? ""}`;
    const bk = `${stringValue(b.record_kind) ?? ""}\u0000${stringValue(b.record_id) ?? ""}`;
    return ak.localeCompare(bk, "en");
  });
  return records.map((record, index): RecordIdentity => {
    const path = `/records/${index}`;
    const normalizedAssertion = normalizeExecutionAssertion(record.execution_assertion, `${path}/execution_assertion`, context);
    if (normalizedAssertion !== undefined) record.execution_assertion = normalizedAssertion;
    const localId = stringValue(record.record_id) ?? `record.missing.${index + 1}`;
    if (record.record_id === undefined) {
      context.add("NORM_RECORD_ID_MISSING", "error", `${path}/record_id`, "Record ID is missing; a deterministic display ID was assigned only for diagnostics.", {
        recordId: localId,
        todoCategory: "missing_identity",
      });
    }
    const payload = objectValue(record.payload) ?? {};
    const collection = recordCollection(record, path, context);
    if (collection === undefined) return { localId, payload, record, path };
    const shape = OBJECT_SHAPES[collection];
    if (shape === undefined) return { localId, payload, record, path };
    const registry = matchingRegistryEntry(entries, collection, localId);
    const registryId = registry === undefined ? undefined : stringValue(registry.canonical_id);
    const registryIdentityStatus = registry === undefined ? undefined : stringValue(registry.identity_status);
    const payloadId = stringValue(payload[shape.idKey]);
    const canonicalId = registryId ?? payloadId ?? localId;
    const version = registry === undefined ? undefined : stringValue(registry.object_version);
    if (["ambiguous", "review_required"].includes(registryIdentityStatus ?? "")) {
      context.add("NORM_IDENTITY_REVIEW_REQUIRED", "warning", `${path}/record_id`, `Identifier registry marks ${canonicalId} as ${registryIdentityStatus}; normalization did not merge or relabel the object.`, {
        recordId: localId,
        todoCategory: "review_required",
        affectedObjectIds: [canonicalId],
      });
    }
    if (registryId !== undefined && payloadId !== undefined && registryId !== payloadId) {
      context.add(
        "NORM_ID_REGISTRY_CONFLICT",
        "warning",
        `${path}/payload/${shape.idKey}`,
        `Used registered canonical ID ${registryId} instead of payload ID ${payloadId}.`,
        { recordId: localId, todoCategory: "missing_identity", affectedObjectIds: [registryId] },
      );
    }
    if (registryId === undefined && payloadId === undefined) {
      context.add(
        "NORM_DISPLAY_ID_ASSIGNED",
        "warning",
        `${path}/payload/${shape.idKey}`,
        `Used authoring record ID ${localId} as a deterministic display ID; register an opaque canonical ID before release.`,
        { recordId: localId, todoCategory: "missing_identity", affectedObjectIds: [canonicalId] },
      );
    }
    return {
      collection,
      canonicalId,
      ...(version === undefined ? {} : { version }),
      localId,
      payload,
      record,
      path,
    };
  });
}

function buildIdMap(identities: RecordIdentity[], input: JsonObject): Map<string, string> {
  const result = new Map<string, string>();
  for (const identity of identities) {
    if (identity.canonicalId === undefined) continue;
    result.set(identity.localId, identity.canonicalId);
    const shape = identity.collection === undefined ? undefined : OBJECT_SHAPES[identity.collection];
    if (shape !== undefined) {
      const payloadId = stringValue(identity.payload[shape.idKey]);
      if (payloadId !== undefined) result.set(payloadId, identity.canonicalId);
    }
  }
  for (const entry of registryEntries(input)) {
    const localKey = stringValue(entry.local_key);
    const canonicalId = stringValue(entry.canonical_id);
    if (localKey !== undefined && canonicalId !== undefined) result.set(localKey, canonicalId);
  }
  return result;
}

function normalizeExistingObjects(
  input: JsonObject,
  idMap: ReadonlyMap<string, string>,
  context: NormalizationContext,
): Map<string, Map<string, JsonObject>> {
  const collections = new Map<string, Map<string, JsonObject>>();
  for (const collection of REPORT_COLLECTIONS) collections.set(collection, new Map());
  const existing = arrayValue(input.existing_objects).filter(isObject).map((entry) => cloneJson(entry));
  existing.sort(compareJson);
  existing.forEach((entry, index) => {
    const reference = objectValue(entry.object_ref);
    const objectType = reference === undefined ? undefined : stringValue(reference.object_type);
    const collection = objectType === undefined ? undefined : normalizeObjectType(objectType);
    const value = objectValue(entry.value);
    if (collection === undefined || value === undefined || OBJECT_SHAPES[collection] === undefined) {
      context.rootUnmappedRecords.push({ existing_object: entry });
      context.add("NORM_EXISTING_OBJECT_UNMAPPED", "warning", `/existing_objects/${index}`, "Existing object type could not be mapped to a canonical report collection and was preserved in the root extension.", {
        todoCategory: "unmapped_record",
      });
      return;
    }
    const shape = OBJECT_SHAPES[collection];
    const refId = reference === undefined ? undefined : stringValue(reference.object_id);
    const refVersion = reference === undefined ? undefined : stringValue(reference.object_version);
    const valueId = stringValue(value[shape.idKey]);
    const canonicalId = idMap.get(refId ?? "") ?? refId ?? valueId;
    if (canonicalId === undefined) {
      context.add("NORM_EXISTING_OBJECT_ID_MISSING", "error", `/existing_objects/${index}/object_ref/object_id`, "Existing object has no usable ID.", {
        todoCategory: "missing_identity",
      });
      return;
    }
    const normalized = normalizeObject(value, shape, {
      canonicalId,
      ...(refVersion === undefined ? {} : { version: refVersion }),
      localId: canonicalId,
    }, undefined, `/${collection}/${pointerEscape(canonicalId)}`, idMap, context);
    collections.get(collection)?.set(canonicalId, normalized);
  });
  return collections;
}

function addRecordObjects(
  identities: RecordIdentity[],
  collections: Map<string, Map<string, JsonObject>>,
  idMap: ReadonlyMap<string, string>,
  context: NormalizationContext,
): void {
  const seen = new Set<string>();
  for (const identity of identities) {
    if (identity.record.review_status === "rejected") {
      context.rootUnmappedRecords.push(cloneJson(identity.record));
      context.add("NORM_REJECTED_RECORD_EXCLUDED", "information", identity.path, `Rejected authoring record ${identity.localId} was preserved for audit but not promoted into the canonical report candidate.`, {
        recordId: identity.localId,
      });
      continue;
    }
    if (isDomainPayload(identity.payload)) {
      const normalizedPayload = normalizeDeep(identity.payload, `${identity.path}/payload`, normalizeSourceBindings(identity.record.source_bindings, `${identity.path}/source_bindings`, context), context, identity.localId);
      const payload = rewriteReferences(normalizedPayload, undefined, idMap) as JsonObject;
      payload.domain = normalizeModuleId(String(payload.domain));
      context.domainPayloads.push(stableOrderDeep(payload) as JsonObject);
      const bindings = normalizeSourceBindings(identity.record.source_bindings, `${identity.path}/source_bindings`, context);
      if (bindings.length > 0) context.domainPayloadBindings.push({ payload_id: payload.payload_id as JsonValue, source_bindings: bindings });
      continue;
    }
    if (identity.collection === undefined || identity.canonicalId === undefined) {
      const preserved = cloneJson(identity.record);
      preserved.payload = normalizeDeep(identity.payload, `${identity.path}/payload`, normalizeSourceBindings(identity.record.source_bindings, `${identity.path}/source_bindings`, context), context, identity.localId);
      context.rootUnmappedRecords.push(preserved);
      context.add("NORM_RECORD_UNMAPPED", "warning", identity.path, "Authoring record could not be mapped to a canonical collection and was preserved in the root extension.", {
        recordId: identity.localId,
        todoCategory: "unmapped_record",
      });
      continue;
    }
    const key = `${identity.collection}\u0000${identity.canonicalId}`;
    if (seen.has(key)) {
      context.rootUnmappedRecords.push(cloneJson(identity.record));
      context.add("NORM_DUPLICATE_CANONICAL_ID", "error", identity.path, `Multiple authoring records map to ${identity.canonicalId}; the first stable record was retained and the duplicate was preserved for review.`, {
        recordId: identity.localId,
        todoCategory: "missing_identity",
        affectedObjectIds: [identity.canonicalId],
      });
      continue;
    }
    seen.add(key);
    const shape = OBJECT_SHAPES[identity.collection];
    if (shape === undefined) continue;
    const normalized = normalizeObject(identity.payload, shape, {
      canonicalId: identity.canonicalId,
      ...(identity.version === undefined ? {} : { version: identity.version }),
      localId: identity.localId,
    }, identity.record, `/${identity.collection}/${pointerEscape(identity.canonicalId)}`, idMap, context);
    const collection = collections.get(identity.collection);
    const prior = collection?.get(identity.canonicalId);
    if (prior !== undefined && stableStringify(prior) !== stableStringify(normalized)) {
      context.add("NORM_EXISTING_OBJECT_REPLACED", "warning", identity.path, `Authoring record replaces a different existing representation of ${identity.canonicalId}; review version and revision-event handling.`, {
        recordId: identity.localId,
        todoCategory: "review_required",
        affectedObjectIds: [identity.canonicalId],
      });
    }
    collection?.set(identity.canonicalId, normalized);
  }
}

function sectionIdsForModule(moduleId: string): readonly string[] {
  return moduleId === "core" ? CORE_SECTIONS : (DOMAIN_SECTIONS[moduleId] ?? []);
}

function normalizeModules(
  input: JsonObject,
  identities: RecordIdentity[],
  schemaVersion: string,
  context: NormalizationContext,
): JsonObject[] {
  const modules = new Map<string, JsonObject>();
  arrayValue(input.enabled_modules).forEach((entry, index) => {
    if (!isObject(entry)) {
      context.add("NORM_MODULE_TYPE", "error", `/enabled_modules/${index}`, "Module manifest item must be an object.", {
        todoCategory: "contract_mismatch",
      });
      return;
    }
    const module = cloneJson(entry);
    const rawId = stringValue(module.module_id);
    if (rawId === undefined) return;
    const id = normalizeModuleId(rawId);
    module.module_id = id;
    if (module.status !== undefined) module.status = normalizedEnum("module_status", module.status, `/enabled_modules/${index}/status`, context);

    const legacy: JsonObject = {};
    for (const key of ["module_version", "module_kind", "applicability"]) {
      if (module[key] === undefined) continue;
      legacy[key] = module[key] as JsonValue;
      delete module[key];
    }
    if (Object.keys(legacy).length > 0) {
      context.rootUnmappedRecords.push({ module_id: id, legacy_module_manifest_fields: legacy });
      context.add("NORM_MODULE_MANIFEST_LEGACY_SHAPE", "error", `/enabled_modules/${index}`, "Legacy compressed module-manifest fields are not canonical; supply protocol_version, status, applicability_decision_id, detected_triggers, and section_ids.", {
        todoCategory: "contract_mismatch",
        affectedObjectIds: [id],
      });
    }
    modules.set(id, module);
  });

  for (const moduleId of BUILT_IN_MODULE_ORDER) {
    const existing = modules.get(moduleId);
    if (existing === undefined) {
      const status = moduleId === "core" ? "enabled" : "undetermined";
      modules.set(moduleId, {
        module_id: moduleId,
        protocol_version: schemaVersion,
        status,
        applicability_decision_id: `applicability.${moduleId}.${status}`,
        detected_triggers: [],
        section_ids: [...sectionIdsForModule(moduleId)],
      });
      context.add(
        moduleId === "core" ? "NORM_CORE_MODULE_ADDED" : "NORM_MODULE_APPLICABILITY_UNDETERMINED",
        moduleId === "core" ? "information" : "warning",
        `/module_manifest/${moduleId}`,
        moduleId === "core"
          ? "Added the mandatory enabled core module manifest item."
          : `Added ${moduleId} with undetermined applicability; omission was not treated as not applicable.`,
        moduleId === "core" ? {} : { todoCategory: "missing_value" },
      );
      continue;
    }
    if (existing.protocol_version === undefined) existing.protocol_version = schemaVersion;
    if (existing.status === undefined) existing.status = moduleId === "core" ? "enabled" : "undetermined";
    if (existing.applicability_decision_id === undefined) {
      existing.applicability_decision_id = `applicability.${moduleId}.${String(existing.status)}`;
      context.add("NORM_MODULE_DECISION_ID_REQUIRED", "warning", `/module_manifest/${moduleId}/applicability_decision_id`, "Assigned a deterministic applicability decision placeholder; bind the actual applicability decision before release.", {
        todoCategory: "review_required",
        affectedObjectIds: [moduleId],
      });
    }
    if (!Array.isArray(existing.detected_triggers)) existing.detected_triggers = [];
    if (!Array.isArray(existing.section_ids) || existing.section_ids.length === 0) {
      existing.section_ids = [...sectionIdsForModule(moduleId)];
    }
  }

  const core = modules.get("core");
  if (core !== undefined) {
    core.status = "enabled";
    if (core.protocol_version === undefined) core.protocol_version = schemaVersion;
    if (!Array.isArray(core.section_ids) || core.section_ids.length === 0) core.section_ids = [...CORE_SECTIONS];
  }

  const recordModules = new Set(
    identities
      .filter((identity) => identity.record.review_status !== "rejected")
      .map((identity) => stringValue(identity.record.domain_module_id))
      .filter((id): id is string => id !== undefined)
      .map(normalizeModuleId),
  );
  for (const moduleId of recordModules) {
    if (moduleId === "core") continue;
    const existing = modules.get(moduleId);
    const trigger = `authoring_record:${moduleId}`;
    if (existing === undefined) {
      const sectionIds = [...sectionIdsForModule(moduleId)];
      modules.set(moduleId, {
        module_id: moduleId,
        protocol_version: schemaVersion,
        status: "enabled",
        applicability_decision_id: `applicability.${moduleId}.record-trigger`,
        detected_triggers: [trigger],
        section_ids: sectionIds.length > 0 ? sectionIds : [`${moduleId}.unmapped_section`],
      });
      if (sectionIds.length === 0) {
        context.add("NORM_LOCAL_MODULE_SECTIONS_REQUIRED", "error", `/module_manifest/${moduleId}/section_ids`, "A local module trigger has no registered section manifest; a diagnostic placeholder was used and must be replaced.", {
          todoCategory: "contract_mismatch",
          affectedObjectIds: [moduleId],
        });
      }
    } else {
      existing.status = "enabled";
      const triggers = arrayValue(existing.detected_triggers).filter((value): value is string => typeof value === "string");
      existing.detected_triggers = [...new Set([...triggers, trigger])].sort((a, b) => a.localeCompare(b, "en"));
    }
  }

  const applicabilityDecisionIds = new Set(
    identities
      .filter((identity) => identity.collection === "applicability_decisions" && identity.canonicalId !== undefined)
      .map((identity) => identity.canonicalId as string),
  );
  for (const module of modules.values()) {
    const moduleId = stringValue(module.module_id) ?? "unknown";
    const decisionId = stringValue(module.applicability_decision_id);
    if (decisionId === undefined || !applicabilityDecisionIds.has(decisionId)) {
      if (decisionId !== undefined) {
        context.applicabilityPlaceholderTargets.set(decisionId, {
          targetKind: "module",
          target: moduleId,
          ruleId: "FA004",
        });
      }
      context.add(
        "NORM_MODULE_APPLICABILITY_DECISION_UNRESOLVED",
        "error",
        `/module_manifest/${pointerEscape(moduleId)}/applicability_decision_id`,
        "Module applicability_decision_id does not resolve to an author-supplied applicability-decision record.",
        { todoCategory: "review_required", affectedObjectIds: [moduleId, ...(decisionId === undefined ? [] : [decisionId])] },
      );
    }
  }

  const order = new Map<string, number>(BUILT_IN_MODULE_ORDER.map((id, index) => [id, index]));
  return [...modules.values()]
    .map((module) => stableOrderDeep(module) as JsonObject)
    .sort((a, b) => {
      const aid = stringValue(a.module_id) ?? "";
      const bid = stringValue(b.module_id) ?? "";
      return (order.get(aid) ?? Number.MAX_SAFE_INTEGER) - (order.get(bid) ?? Number.MAX_SAFE_INTEGER)
        || aid.localeCompare(bid, "en");
    });
}

function sectionCoverageInput(input: JsonObject): JsonObject[] {
  const extensions = objectValue(input.extensions);
  const reportFrame = extensions === undefined ? undefined : objectValue(extensions.report_frame);
  const candidates = [
    reportFrame?.section_coverage,
    extensions?.section_coverage,
    extensions?.["report_prompt.section_coverage"],
  ];
  const selected = candidates.find(Array.isArray);
  return selected === undefined ? [] : selected.filter(isObject).map((item) => cloneJson(item));
}

function sectionSourceIds(
  sectionId: string,
  identities: RecordIdentity[],
  context: NormalizationContext,
): string[] {
  const kinds = SECTION_RECORD_KINDS[sectionId];
  if (kinds === undefined) return [];
  const wanted = new Set(kinds);
  const ids: string[] = [];
  for (const identity of identities) {
    if (identity.record.review_status === "rejected") continue;
    const kind = normalizeRecordKind(identity.record.record_kind, `${identity.path}/record_kind`, context);
    if (kind !== undefined && wanted.has(kind)) {
      ids.push(...sourceBindingIds(normalizeSourceBindings(identity.record.source_bindings, `${identity.path}/source_bindings`, context)));
    }
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b, "en"));
}

function sectionObjectIds(sectionId: string, identities: RecordIdentity[], context: NormalizationContext): string[] {
  const kinds = SECTION_RECORD_KINDS[sectionId];
  if (kinds === undefined) return [];
  const wanted = new Set(kinds);
  return [...new Set(
    identities
      .filter((identity) => identity.record.review_status !== "rejected" && identity.canonicalId !== undefined)
      .filter((identity) => {
        const kind = normalizeRecordKind(identity.record.record_kind, `${identity.path}/record_kind`, context);
        return kind !== undefined && wanted.has(kind);
      })
      .map((identity) => identity.canonicalId as string),
  )].sort((a, b) => a.localeCompare(b, "en"));
}

function sectionEvidenceBindings(sectionId: string, identities: RecordIdentity[], context: NormalizationContext): JsonObject[] {
  const kinds = SECTION_RECORD_KINDS[sectionId];
  if (kinds === undefined) return [];
  const wanted = new Set(kinds);
  const bindings = identities
    .filter((identity) => identity.record.review_status !== "rejected")
    .flatMap((identity) => {
      const kind = normalizeRecordKind(identity.record.record_kind, `${identity.path}/record_kind`, context);
      return kind !== undefined && wanted.has(kind)
        ? normalizeSourceBindings(identity.record.source_bindings, `${identity.path}/source_bindings`, context)
        : [];
    });
  return normalizeSourceBindings(bindings, `/section_coverage/${pointerEscape(sectionId)}/evidence_bindings`, context);
}

function normalizeSectionCoverage(
  input: JsonObject,
  modules: JsonObject[],
  identities: RecordIdentity[],
  context: NormalizationContext,
): JsonObject[] {
  const supplied = new Map<string, JsonObject>();
  for (const entry of sectionCoverageInput(input)) {
    const id = stringValue(entry.section_id);
    if (id !== undefined) supplied.set(id, entry);
  }
  const expected: Array<{ sectionId: string; module: JsonObject }> = [];
  for (const module of modules) {
    const moduleId = stringValue(module.module_id);
    if (moduleId === undefined) continue;
    for (const sectionId of arrayValue(module.section_ids).filter((value): value is string => typeof value === "string")) {
      expected.push({ sectionId, module });
    }
  }

  const universeId = stringValue(objectValue(input.source_coverage)?.universe_id);
  const normalizeEntry = (entry: JsonObject, sectionId: string): JsonObject => {
    const path = `/section_coverage/${pointerEscape(sectionId)}`;
    const normalized = normalizeDeep(entry, path, [], context) as JsonObject;
    if (normalized.applicability !== undefined) {
      normalized.applicability = normalizedEnum("applicability", normalized.applicability, `${path}/applicability`, context);
    }
    if (typeof normalized.applicability_decision_id !== "string") {
      normalized.applicability_decision_id = `applicability.section.${sectionId}`;
      context.applicabilityPlaceholderTargets.set(String(normalized.applicability_decision_id), {
        targetKind: "section",
        target: sectionId,
        ruleId: "FA003",
      });
      context.add(
        "NORM_SECTION_APPLICABILITY_DECISION_REQUIRED",
        "error",
        `${path}/applicability_decision_id`,
        "Section coverage requires a traceable applicability decision; a deterministic diagnostic identifier was used without inventing a decision record.",
        { todoCategory: "review_required", affectedObjectIds: [sectionId] },
      );
    }
    if (normalized.coverage_status !== undefined) {
      normalized.coverage_status = normalizedEnum("coverage_status", normalized.coverage_status, `${path}/coverage_status`, context);
    }
    normalized.source_universe_ids = normalizeIdArray(arrayValue(normalized.source_universe_ids));
    normalized.represented_object_ids = rewriteReferences(
      normalizeIdArray(arrayValue(normalized.represented_object_ids)),
      "represented_object_ids",
      new Map(identities.flatMap((identity) => identity.canonicalId === undefined ? [] : [[identity.localId, identity.canonicalId]])),
    );
    normalized.omission_or_gap_reasons = normalizeEnvelope(
      normalized.omission_or_gap_reasons,
      `${path}/omission_or_gap_reasons`,
      [],
      context,
    );
    normalized.evidence_bindings = normalizeSourceBindings(normalized.evidence_bindings, `${path}/evidence_bindings`, context);
    normalized.last_evaluated_at = normalizeEnvelope(normalized.last_evaluated_at, `${path}/last_evaluated_at`, [], context);

    const legacy: JsonObject = {};
    for (const key of ["reason", "source_item_ids"]) {
      if (normalized[key] === undefined) continue;
      legacy[key] = normalized[key] as JsonValue;
      delete normalized[key];
    }
    if (Object.keys(legacy).length > 0) {
      context.rootUnmappedRecords.push({ section_id: sectionId, legacy_section_coverage_fields: legacy });
      context.add("NORM_SECTION_COVERAGE_LEGACY_SHAPE", "error", path, "Legacy compressed section-coverage fields are not canonical; supply source-universe IDs, represented objects, gap reasons, evidence bindings, and evaluation time.", {
        todoCategory: "contract_mismatch",
        affectedObjectIds: [sectionId],
      });
    }
    return stableOrderDeep(normalized) as JsonObject;
  };

  const result: JsonObject[] = [];
  for (const { sectionId, module } of expected) {
    const existing = supplied.get(sectionId);
    if (existing !== undefined) {
      result.push(normalizeEntry(existing, sectionId));
      supplied.delete(sectionId);
      continue;
    }

    const moduleStatus = stringValue(module.status);
    const representedObjectIds = sectionObjectIds(sectionId, identities, context);
    const evidenceBindings = sectionEvidenceBindings(sectionId, identities, context);
    let applicability: string;
    let coverageStatus: string;
    let reason: string;
    if (moduleStatus === "enabled") {
      applicability = "applicable";
      coverageStatus = representedObjectIds.length > 0 ? "partial" : "unknown";
      reason = representedObjectIds.length > 0
        ? "Authoring records are present, but section-level source accounting was not supplied."
        : "Section coverage was not supplied; an empty record collection was not treated as no records or not applicable.";
    } else if (moduleStatus === "not_applicable") {
      applicability = "not_applicable";
      coverageStatus = "not_applicable";
      reason = `Module ${String(module.module_id)} was explicitly marked not applicable, but section evidence remains required.`;
    } else {
      applicability = "undetermined";
      coverageStatus = "unknown";
      reason = `Applicability of module ${String(module.module_id)} is undetermined.`;
    }
    const sectionDecisionId = `applicability.section.${sectionId}`;
    context.applicabilityPlaceholderTargets.set(sectionDecisionId, {
      targetKind: "section",
      target: sectionId,
      ruleId: "FA003",
    });
    result.push({
      section_id: sectionId,
      applicability,
      applicability_decision_id: sectionDecisionId,
      coverage_status: coverageStatus,
      source_universe_ids: universeId === undefined ? [] : [universeId],
      represented_object_ids: representedObjectIds,
      omission_or_gap_reasons: makeKnownDerivedEnvelope([reason]),
      evidence_bindings: evidenceBindings,
      last_evaluated_at: makeUnknownEnvelope("Section coverage evaluation time was not supplied."),
    });
    context.add("NORM_SECTION_APPLICABILITY_DECISION_REQUIRED", "error", `/section_coverage/${pointerEscape(sectionId)}/applicability_decision_id`, "Section coverage requires a traceable applicability decision; a deterministic diagnostic identifier was used without inventing a decision record.", {
      todoCategory: "review_required",
      affectedObjectIds: [sectionId],
    });
    context.add("NORM_SECTION_COVERAGE_EXPANDED", "warning", `/section_coverage/${pointerEscape(sectionId)}`, `Created explicit ${coverageStatus} coverage for section ${sectionId}; no completeness or no-records claim was inferred.`, {
      todoCategory: "missing_value",
    });
  }
  for (const remaining of [...supplied.values()].sort(compareJson)) {
    const id = stringValue(remaining.section_id) ?? "unknown";
    result.push(normalizeEntry(remaining, id));
  }
  const order = new Map([...CORE_SECTIONS, ...Object.values(DOMAIN_SECTIONS).flat()].map((id, index) => [id, index]));
  result.sort((a, b) => {
    const aid = stringValue(a.section_id) ?? "";
    const bid = stringValue(b.section_id) ?? "";
    return (order.get(aid) ?? Number.MAX_SAFE_INTEGER) - (order.get(bid) ?? Number.MAX_SAFE_INTEGER)
      || aid.localeCompare(bid, "en");
  });
  return result;
}

function normalizeSourceCoverage(
  inputValue: JsonValue | undefined,
  idMap: ReadonlyMap<string, string>,
  identities: RecordIdentity[],
  context: NormalizationContext,
): JsonObject {
  if (!isObject(inputValue)) {
    context.add("NORM_SOURCE_COVERAGE_MISSING", "error", "/source_coverage", "Source coverage is missing; normalization did not invent a source universe.", {
      todoCategory: "missing_value",
    });
    return {};
  }
  const coverage = normalizeDeep(cloneJson(inputValue), "/source_coverage", [], context) as JsonObject;
  const sourceToObjects = new Map<string, Set<string>>();
  for (const identity of identities) {
    if (identity.canonicalId === undefined || identity.record.review_status === "rejected") continue;
    const bindings = normalizeSourceBindings(identity.record.source_bindings, `${identity.path}/source_bindings`, context);
    for (const sourceId of sourceBindingIds(bindings)) {
      const values = sourceToObjects.get(sourceId) ?? new Set<string>();
      values.add(identity.canonicalId);
      sourceToObjects.set(sourceId, values);
    }
  }

  const items = arrayValue(coverage.items).filter(isObject).map((item, index) => {
    const normalized = normalizeDeep(item, `/source_coverage/items/${index}`, [], context) as JsonObject;
    normalized.mapped_object_ids = rewriteReferences(normalized.mapped_object_ids ?? [], "mapped_object_ids", idMap);
    const sourceId = stringValue(normalized.source_item_id);
    if (sourceId !== undefined) {
      const mapped = arrayValue(normalized.mapped_object_ids).filter((value): value is string => typeof value === "string");
      for (const objectId of sourceToObjects.get(sourceId) ?? []) mapped.push(objectId);
      normalized.mapped_object_ids = [...new Set(mapped)].sort((a, b) => a.localeCompare(b, "en"));
      if (normalized.disposition === "included" && mapped.length === 0) {
        context.add("NORM_INCLUDED_SOURCE_UNMAPPED", "error", `/source_coverage/items/${pointerEscape(sourceId)}/mapped_object_ids`, "Included source has no mapped canonical object; normalization did not invent a mapping.", {
          todoCategory: "missing_reference",
          affectedObjectIds: [sourceId],
        });
      }
    }
    return stableOrderDeep(normalized) as JsonObject;
  });
  items.sort((a, b) => (stringValue(a.source_item_id) ?? "").localeCompare(stringValue(b.source_item_id) ?? "", "en"));
  coverage.items = items;

  const snapshots = arrayValue(coverage.snapshots).filter(isObject).map((item) => stableOrderDeep(normalizeDeep(item, "/source_coverage/snapshots", [], context)) as JsonObject);
  snapshots.sort((a, b) => (stringValue(a.source_snapshot_id) ?? "").localeCompare(stringValue(b.source_snapshot_id) ?? "", "en"));
  coverage.snapshots = snapshots;

  const dispositions = ["included", "excluded_with_reason", "unreadable", "inaccessible", "duplicate", "unmapped", "pending"] as const;
  const sourceIds = items.map((item) => stringValue(item.source_item_id)).filter((id): id is string => id !== undefined);
  const uniqueSourceIds = new Set(sourceIds);
  if (uniqueSourceIds.size !== sourceIds.length) {
    context.add("NORM_DUPLICATE_SOURCE_ID", "error", "/source_coverage/items", "Duplicate source_item_id values were retained for review but counted once in coverage reconciliation.", {
      todoCategory: "missing_identity",
    });
  }

  const itemIds = [...uniqueSourceIds].sort((a, b) => a.localeCompare(b, "en"));
  if (coverage.item_ids !== undefined && stableStringify(coverage.item_ids) !== stableStringify(itemIds)) {
    context.add("NORM_SOURCE_ITEM_IDS_RECONCILED", "warning", "/source_coverage/item_ids", "Recomputed source-universe item_ids from the registered items.", {
      todoCategory: "review_required",
    });
  }
  coverage.item_ids = itemIds;

  const snapshotIds = snapshots
    .map((snapshot) => stringValue(snapshot.source_snapshot_id))
    .filter((id): id is string => id !== undefined);
  const snapshotBindings = [...new Set(snapshotIds)].sort((a, b) => a.localeCompare(b, "en"));
  if (coverage.snapshot_bindings !== undefined && stableStringify(coverage.snapshot_bindings) !== stableStringify(snapshotBindings)) {
    context.add("NORM_SOURCE_SNAPSHOT_BINDINGS_RECONCILED", "warning", "/source_coverage/snapshot_bindings", "Recomputed source-universe snapshot_bindings from the registered snapshots.", {
      todoCategory: "review_required",
    });
  }
  coverage.snapshot_bindings = snapshotBindings;

  const counts = Object.fromEntries(dispositions.map((disposition) => [
    disposition,
    new Set(
      items
        .filter((item) => item.disposition === disposition)
        .map((item) => stringValue(item.source_item_id))
        .filter((id): id is string => id !== undefined),
    ).size,
  ])) as Record<(typeof dispositions)[number], number>;
  const reconciliation: JsonObject = {
    registered: uniqueSourceIds.size,
    terminally_disposed: uniqueSourceIds.size - counts.pending,
    included: counts.included,
    excluded_with_reason: counts.excluded_with_reason,
    unreadable: counts.unreadable,
    inaccessible: counts.inaccessible,
    duplicate: counts.duplicate,
    unmapped: counts.unmapped,
    pending: counts.pending,
    included_mapped: new Set(
      items
        .filter((item) => item.disposition === "included" && arrayValue(item.mapped_object_ids).length > 0)
        .map((item) => stringValue(item.source_item_id))
        .filter((id): id is string => id !== undefined),
    ).size,
  };
  if (coverage.reconciliation !== undefined && stableStringify(coverage.reconciliation) !== stableStringify(reconciliation)) {
    context.add("NORM_SOURCE_RECONCILIATION_RECOMPUTED", "warning", "/source_coverage/reconciliation", "Recomputed source coverage reconciliation from registered item dispositions and mappings.", {
      todoCategory: "review_required",
    });
  }
  coverage.reconciliation = reconciliation;

  const legacyKeys = ["universe_status", "boundary_statement", "authority_description", "expected_item_count", "counts", "completeness_claim"];
  const legacyValues: JsonObject = {};
  for (const key of legacyKeys) {
    if (coverage[key] === undefined) continue;
    legacyValues[key] = coverage[key] as JsonValue;
    delete coverage[key];
  }
  if (Object.keys(legacyValues).length > 0) {
    context.rootUnmappedRecords.push({ source_coverage_legacy_fields: legacyValues });
    context.add("NORM_SOURCE_COVERAGE_LEGACY_SHAPE", "error", "/source_coverage", "Legacy compressed source-coverage fields are not canonical and were preserved only in normalization metadata; supply the protocol-aligned authority, enumeration, reconciliation, axis, and completeness fields.", {
      todoCategory: "contract_mismatch",
    });
  }
  return stableOrderDeep(coverage) as JsonObject;
}

function reportFrame(input: JsonObject): JsonObject {
  const extensions = objectValue(input.extensions);
  return extensions === undefined ? {} : (objectValue(extensions.report_frame) ?? {});
}

function chooseCreatedAt(
  input: JsonObject,
  options: NormalizeAuthoringOptions,
  context: NormalizationContext,
): string {
  const candidate = options.createdAt ?? stringValue(reportFrame(input).created_at);
  if (candidate !== undefined && Number.isFinite(Date.parse(candidate))) return new Date(candidate).toISOString();
  context.add(
    "NORM_CREATED_AT_REQUIRED",
    "error",
    "/created_at",
    `The authoring schema does not supply report creation time. The deterministic candidate placeholder ${CREATED_AT_PLACEHOLDER} was used; provide createdAt before release.`,
    { todoCategory: "missing_value" },
  );
  return CREATED_AT_PLACEHOLDER;
}

function chooseReportId(input: JsonObject, options: NormalizeAuthoringOptions, context: NormalizationContext): string {
  const fromFrame = stringValue(reportFrame(input).report_id);
  const explicit = options.reportId ?? fromFrame;
  if (explicit !== undefined && identifierLike(explicit)) return explicit;
  const authoringId = stringValue(input.authoring_input_id);
  const rawDisplayId = authoringId === undefined ? "report.missing" : `report.${authoringId}`;
  const displayId = rawDisplayId.length <= 160
    ? rawDisplayId
    : `report_${createHash("sha256").update(rawDisplayId).digest("hex").slice(0, 32)}`;
  context.add("NORM_REPORT_DISPLAY_ID_ASSIGNED", "warning", "/report_id", `Assigned deterministic display report ID ${displayId}; provide a registered report ID before release.`, {
    todoCategory: "missing_identity",
    affectedObjectIds: [displayId],
  });
  return displayId;
}

function chooseReportVersion(input: JsonObject, options: NormalizeAuthoringOptions, context: NormalizationContext): string {
  const explicit = options.reportVersion ?? stringValue(reportFrame(input).report_version);
  if (explicit !== undefined) return explicit;
  const authoringVersion = stringValue(input.authoring_input_version);
  if (authoringVersion !== undefined) {
    context.add("NORM_REPORT_VERSION_DERIVED", "warning", "/report_version", "Used authoring_input_version as the candidate report display version; confirm the report revision before release.", {
      todoCategory: "missing_identity",
    });
    return authoringVersion;
  }
  context.add("NORM_REPORT_VERSION_MISSING", "error", "/report_version", "No report version was supplied; deterministic display version 'draft' was used.", {
    todoCategory: "missing_identity",
  });
  return "draft";
}

function normalizeReviewTasks(input: JsonObject, idMap: ReadonlyMap<string, string>, context: NormalizationContext): JsonObject[] {
  const tasks = arrayValue(input.review_tasks).filter(isObject).map((task, index) => {
    const normalized = normalizeDeep(task, `/review_tasks/${index}`, [], context) as JsonObject;
    normalized.affected_object_ids = rewriteReferences(normalized.affected_object_ids ?? [], "affected_object_ids", idMap);
    return stableOrderDeep(normalized) as JsonObject;
  });
  tasks.sort((a, b) => (stringValue(a.review_task_id) ?? "").localeCompare(stringValue(b.review_task_id) ?? "", "en"));
  for (const task of tasks) {
    if (task.status === "open") {
      const id = stringValue(task.review_task_id);
      context.todoDrafts.push({
        category: "review_required",
        severity: task.severity === "blocking" ? "error" : "warning",
        path: `/review_tasks/${pointerEscape(id ?? "unknown")}`,
        description: stringValue(task.description) ?? "Open authoring review task.",
        affectedObjectIds: arrayValue(task.affected_object_ids).filter((value): value is string => typeof value === "string"),
      });
    }
  }
  return tasks;
}

function addRecordReviewTodos(identities: RecordIdentity[], context: NormalizationContext): void {
  for (const identity of identities) {
    if (identity.record.review_status !== "review_required") continue;
    context.todoDrafts.push({
      category: "review_required",
      severity: "warning",
      path: identity.path,
      description: `Authoring record ${identity.localId} is marked review_required.`,
      affectedObjectIds: identity.canonicalId === undefined ? [identity.localId] : [identity.canonicalId],
    });
  }
}

function extensionObject(
  input: JsonObject,
  idMap: ReadonlyMap<string, string>,
  context: NormalizationContext,
): JsonObject {
  const raw = objectValue(input.extensions);
  const normalizedRaw = raw === undefined ? {} : normalizeDeep(cloneJson(raw), "/extensions", [], context);
  const extensions = rewriteReferences(normalizedRaw, undefined, idMap) as JsonObject;
  delete extensions.report_frame;
  delete extensions.section_coverage;
  delete extensions["report_prompt.section_coverage"];
  if (context.domainPayloads.length > 0) {
    const existing = arrayValue(extensions.domain_payloads).filter(isObject);
    const combined = [...existing, ...context.domainPayloads];
    const unique = new Map(combined.map((payload) => [stableStringify(payload), payload]));
    extensions.domain_payloads = [...unique.values()].sort((a, b) => {
      const aid = stringValue(a.payload_id) ?? "";
      const bid = stringValue(b.payload_id) ?? "";
      return aid.localeCompare(bid, "en") || compareJson(a, b);
    });
  }
  if (context.domainPayloadBindings.length > 0) {
    extensions["report_prompt.domain_payload_source_bindings"] = context.domainPayloadBindings.sort(compareJson);
  }
  if (context.rootUnmappedRecords.length > 0) {
    extensions["report_prompt.unmapped_authoring_records"] = context.rootUnmappedRecords.sort(compareJson);
  }
  if (context.rootRecordMetadata.length > 0) {
    extensions["report_prompt.authoring_record_metadata"] = context.rootRecordMetadata
      .map((metadata) => rewriteReferences(metadata, undefined, idMap) as JsonObject)
      .sort(compareJson);
  }
  return stableOrderDeep(extensions) as JsonObject;
}

function countState(input: JsonValue, state: string): number {
  if (Array.isArray(input)) return input.reduce<number>((sum, item) => sum + countState(item, state), 0);
  if (!isObject(input)) return 0;
  const own = input.state === state && looksLikeEnvelope(input) ? 1 : 0;
  return own + Object.values(input).reduce<number>((sum, item) => sum + countState(item, state), 0);
}

function finalizeFindingsAndTodos(context: NormalizationContext): { findings: NormalizationFinding[]; todo: NormalizationTodo[] } {
  const findingMap = new Map<string, NormalizationFinding>();
  for (const finding of context.findings) {
    const key = `${finding.code}\u0000${finding.severity}\u0000${finding.path}\u0000${finding.message}\u0000${finding.record_id ?? ""}`;
    findingMap.set(key, finding);
  }
  const severityOrder: Readonly<Record<NormalizationSeverity, number>> = { error: 0, warning: 1, information: 2 };
  const findings = [...findingMap.values()].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    || a.path.localeCompare(b.path, "en")
    || a.code.localeCompare(b.code, "en")
    || a.message.localeCompare(b.message, "en"));

  const draftMap = new Map<string, TodoDraft>();
  for (const draft of context.todoDrafts) {
    const affected = [...new Set(draft.affectedObjectIds)].sort((a, b) => a.localeCompare(b, "en"));
    const normalized: TodoDraft = { ...draft, affectedObjectIds: affected };
    const key = `${normalized.category}\u0000${normalized.severity}\u0000${normalized.path}\u0000${normalized.description}\u0000${affected.join("\u0000")}`;
    draftMap.set(key, normalized);
  }
  const drafts = [...draftMap.values()].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1)
    || a.path.localeCompare(b.path, "en")
    || a.description.localeCompare(b.description, "en"));
  const todos: NormalizationTodo[] = drafts.map((draft) => {
    const digest = createHash("sha256")
      .update(`${draft.category}\u0000${draft.severity}\u0000${draft.path}\u0000${draft.description}\u0000${draft.affectedObjectIds.join("\u0000")}`)
      .digest("hex")
      .slice(0, 16);
    return {
      todo_id: `todo_${digest}`,
      category: draft.category,
      severity: draft.severity,
      path: draft.path,
      description: draft.description,
      affected_object_ids: draft.affectedObjectIds,
    };
  });
  const todoBySignature = new Map(todos.map((todo) => [`${todo.path}\u0000${todo.description}`, todo.todo_id]));
  for (const finding of findings) {
    const todoId = todoBySignature.get(`${finding.path}\u0000${finding.message}`);
    if (todoId !== undefined) finding.todo_id = todoId;
  }
  return { findings, todo: todos };
}

/**
 * Expand compact authoring input into a deterministic canonical report candidate.
 *
 * The function never promotes execution to completed, never derives a scientific
 * value from a default, and never collapses unknown, not_applicable, or withheld.
 * Missing source-derived fields become explicit unknown envelopes and unresolved
 * structural requirements are returned as findings/todo rather than guessed.
 */
export function normalizeAuthoringInput(
  inputValue: unknown,
  options: NormalizeAuthoringOptions = {},
): NormalizationResult {
  if (!isObject(inputValue)) throw new TypeError("Authoring input must be a JSON object.");
  const input = cloneJson(inputValue);
  const context = new NormalizationContext();
  const repository = loadSchemas(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot });
  const inputContract = repository.validate(AUTHORING_INPUT_SCHEMA_ID, inputValue);
  for (const issue of inputContract.issues) {
    context.add(
      "NORM_INPUT_SCHEMA",
      "error",
      issue.instancePointer,
      `Authoring input violates its canonical schema: ${issue.message} (${issue.keyword}; ${issue.schemaPointer}).`,
      { todoCategory: "contract_mismatch" },
    );
  }
  const identities = buildRecordIdentities(input, context);
  const idMap = buildIdMap(identities, input);
  const collections = normalizeExistingObjects(input, idMap, context);
  addRecordObjects(identities, collections, idMap, context);
  addRecordReviewTodos(identities, context);

  const schemaVersion = stringValue(input.schema_version) ?? "draft";
  if (stringValue(input.schema_version) === undefined) {
    context.add("NORM_SCHEMA_VERSION_MISSING", "error", "/schema_version", "No schema version was supplied; deterministic candidate version 'draft' was used only as a display placeholder.", {
      todoCategory: "missing_identity",
    });
  }
  const modules = normalizeModules(input, identities, schemaVersion, context);
  const sections = normalizeSectionCoverage(input, modules, identities, context);
  const sourceCoverage = normalizeSourceCoverage(input.source_coverage, idMap, identities, context);
  const scope = objectValue(input.scope) === undefined
    ? {}
    : normalizeDeep(input.scope as JsonValue, "/scope", [], context) as JsonObject;
  if (objectValue(input.scope) === undefined) {
    context.add("NORM_SCOPE_MISSING", "error", "/scope", "Report scope is missing; normalization did not invent it.", {
      todoCategory: "missing_value",
    });
  }
  const cutoff = scope.cutoff_at === undefined
    ? makeUnknownEnvelope("The authoring input does not supply a scope cutoff.")
    : normalizeEnvelope(scope.cutoff_at, "/cutoff", [], context);

  const reportId = chooseReportId(input, options, context);
  const projectId = stringValue(input.project_id) ?? `project.${createHash("sha256").update(reportId).digest("hex").slice(0, 24)}`;
  if (stringValue(input.project_id) === undefined) {
    context.add("NORM_PROJECT_DISPLAY_ID_ASSIGNED", "error", "/project_id", `Assigned deterministic display project ID ${projectId}; normalization did not infer a project identity.`, {
      todoCategory: "missing_identity",
      affectedObjectIds: [projectId],
    });
  }
  const report: JsonObject = {
    report_id: reportId,
    project_id: projectId,
    report_version: chooseReportVersion(input, options, context),
    schema_version: schemaVersion,
    payload_role: "canonical_authoritative",
    created_at: chooseCreatedAt(input, options, context),
    scope,
    cutoff,
    module_manifest: modules,
    section_coverage: sections,
    source_coverage: sourceCoverage,
  };
  if (typeof input.title === "string" && input.title.trim() !== "") report.title = input.title;
  else {
    context.add("NORM_TITLE_MISSING", "error", "/title", "Report title is missing; normalization did not invent one.", {
      todoCategory: "missing_value",
    });
  }
  if (typeof input.language === "string" && input.language.trim() !== "") report.language = input.language;
  else {
    context.add("NORM_LANGUAGE_MISSING", "error", "/language", "Report language is missing; normalization did not infer one.", {
      todoCategory: "missing_value",
    });
  }
  if (typeof input.report_mode === "string") {
    report.report_mode = normalizedEnum("report_mode", input.report_mode, "/report_mode", context);
  } else {
    context.add("NORM_REPORT_MODE_MISSING", "error", "/report_mode", "Report mode is missing; normalization did not choose one.", {
      todoCategory: "missing_value",
    });
  }

  for (const collection of REPORT_COLLECTIONS) {
    const shape = OBJECT_SHAPES[collection];
    const values = [...(collections.get(collection)?.values() ?? [])];
    values.sort((a, b) => {
      const aid = shape === undefined ? "" : stringValue(a[shape.idKey]) ?? "";
      const bid = shape === undefined ? "" : stringValue(b[shape.idKey]) ?? "";
      return aid.localeCompare(bid, "en") || compareJson(a, b);
    });
    report[collection] = values;
  }

  const applicabilityDecisions = arrayValue(report.applicability_decisions).filter(isObject);
  const existingApplicabilityDecisionIds = new Set(
    applicabilityDecisions
      .map((decision) => stringValue(decision.applicability_decision_id))
      .filter((id): id is string => id !== undefined),
  );
  for (const [decisionId, target] of context.applicabilityPlaceholderTargets) {
    if (existingApplicabilityDecisionIds.has(decisionId)) continue;
    applicabilityDecisions.push({
      applicability_decision_id: decisionId,
      object_version: "diagnostic",
      target_kind: target.targetKind,
      target_pointer_or_section_id: target.target,
      rule_id: target.ruleId,
      result: "undetermined",
      evaluated_context: "The authoring input did not provide a source-bound applicability decision for this target.",
      evidence_bindings: [],
      decision_time: String(report.created_at),
      extensions: {
        diagnostic_placeholder: true,
        release_status: "not_release_eligible",
      },
    });
  }
  applicabilityDecisions.sort((left, right) =>
    (stringValue(left.applicability_decision_id) ?? "").localeCompare(
      stringValue(right.applicability_decision_id) ?? "",
      "en",
    ),
  );
  report.applicability_decisions = applicabilityDecisions;

  if (arrayValue(report.research_questions).length === 0) {
    context.add("NORM_RESEARCH_QUESTION_REQUIRED", "error", "/research_questions", "Canonical report requires at least one research question; none was supplied and no question was invented.", {
      todoCategory: "missing_value",
    });
  }

  report.review_tasks = normalizeReviewTasks(input, idMap, context);
  const disclosureLevel = typeof input.disclosure_level === "string" ? input.disclosure_level : "restricted";
  if (typeof input.disclosure_level !== "string") {
    context.add("NORM_DISCLOSURE_LEVEL_MISSING", "error", "/disclosure_state/level", "Disclosure level is missing; the candidate was conservatively restricted rather than treated as public.", {
      todoCategory: "review_required",
    });
  }
  report.disclosure_state = {
    level: normalizedEnum("disclosure_level", disclosureLevel, "/disclosure_state/level", context),
    projection_status: "not_projected",
    withheld_field_count: 0,
    omitted_object_count: 0,
    projection_id: null,
  };
  report.extensions = extensionObject(input, idMap, context);
  (report.disclosure_state as JsonObject).withheld_field_count = countState(report, "withheld");

  const orderedReport = stableOrderDeep(report) as JsonObject;
  const outputContract = repository.validate(SCIENTIFIC_REPORT_SCHEMA_ID, orderedReport);
  for (const issue of outputContract.issues) {
    context.add(
      "NORM_OUTPUT_SCHEMA",
      "error",
      issue.instancePointer,
      `Normalized output violates the canonical scientific-report schema: ${issue.message} (${issue.keyword}; ${issue.schemaPointer}).`,
      { todoCategory: "contract_mismatch" },
    );
  }
  const { findings, todo } = finalizeFindingsAndTodos(context);
  const mapIssues = (issues: typeof inputContract.issues) => issues.map((issue) => ({
    instancePointer: issue.instancePointer,
    schemaPointer: issue.schemaPointer,
    keyword: issue.keyword,
    message: issue.message,
  }));
  return {
    report: orderedReport,
    findings,
    todo,
    contractValidation: {
      input: { valid: inputContract.valid, issues: mapIssues(inputContract.issues) },
      output: { valid: outputContract.valid, issues: mapIssues(outputContract.issues) },
    },
  };
}
