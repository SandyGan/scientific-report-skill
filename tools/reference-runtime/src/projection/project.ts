import { containsAbsoluteFilesystemReference } from "../lib/absolute-path.js";
import { sha256CanonicalJson } from "../lib/hash.js";
import { canonicalJson, isJsonObject, type JsonObject, type JsonValue } from "../lib/json.js";
import { loadSchemas, SCIENTIFIC_REPORT_SCHEMA_ID } from "../lib/schema.js";
import type { ScientificReport } from "../lib/types.js";
import {
  nearestObjectId,
  pointerGet,
  pointerParent,
  pointerParentPath,
  pointerRemove,
  pointerSet,
  sortRemovalsForApplication,
} from "./pointer.js";
import type {
  DisclosureProjectionRecord,
  ProjectDisclosureOptions,
  ProjectionActionKind,
  ProjectionEpistemicState,
  ProjectionFieldAction,
  ProjectionInstruction,
  ProjectionResult,
} from "./types.js";

export const DISCLOSURE_PROJECTION_SCHEMA_ID = "https://schemas.report-prompt.org/v1/disclosure-projection.schema.json";
const PROJECTION_TOOL_NAME = "report-prompt-disclosure-projector";
const PROJECTION_TOOL_VERSION = "1.0.0";
const SECRET_PATTERN = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:password|passwd|secret|access[_ -]?token|auth[_ -]?token|api[_ -]?key)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/iu;
const DANGEROUS_URL = /(?:javascript\s*:|data\s*:\s*text\/html|vbscript\s*:)/iu;

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

function canonicalIso(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new RangeError(`createdAt must be a canonical ISO 8601 timestamp: ${value}`);
  }
  return value;
}

export function epistemicState(value: JsonValue | undefined): ProjectionEpistemicState {
  if (value === undefined) return "not_present";
  if (isJsonObject(value) && ["known", "unknown", "not_applicable", "withheld"].includes(String(value.state))) {
    return value.state as ProjectionEpistemicState;
  }
  return "not_enveloped";
}

function assertInstruction(instruction: ProjectionInstruction): void {
  if (!instruction.sourcePointer.startsWith("/") || instruction.reason.trim() === "" || instruction.policyRuleId.trim() === "") {
    throw new TypeError("Projection instructions require a non-root JSON pointer, reason, and policy rule id");
  }
  const needsValue = ["generalized", "replaced_with_public_identifier", "hash_only"].includes(instruction.action);
  if (needsValue !== (instruction.projectedValue !== undefined)) {
    throw new TypeError(`${instruction.action} ${needsValue ? "requires" : "does not accept"} projectedValue at ${instruction.sourcePointer}`);
  }
  if (instruction.action === "withheld_envelope" &&
      (instruction.withholdingReasonCode === undefined || instruction.disclosureDecisionId === undefined)) {
    throw new TypeError(`withheld_envelope requires a reason code and disclosure decision id at ${instruction.sourcePointer}`);
  }
}

function assertNonOverlapping(instructions: readonly ProjectionInstruction[]): void {
  const paths = instructions.map((instruction) => instruction.sourcePointer).sort();
  for (let index = 1; index < paths.length; index += 1) {
    const previous = paths[index - 1]!;
    const current = paths[index]!;
    if (current === previous || current.startsWith(`${previous}/`)) {
      throw new Error(`Projection instructions overlap at ${previous} and ${current}`);
    }
  }
}

function makeWithheldEnvelope(instruction: ProjectionInstruction): JsonObject {
  return {
    state: "withheld",
    value: null,
    source_bindings: [],
    derivation_bindings: [],
    missing_reason: instruction.reason,
    provenance_status: "absent",
    withholding_reason_code: instruction.withholdingReasonCode!,
    disclosure_decision_id: instruction.disclosureDecisionId!,
  };
}

function textLocations(value: JsonValue): Array<{ text: string; fieldName: string; pointer: string; locatorType?: string }> {
  const result: Array<{ text: string; fieldName: string; pointer: string; locatorType?: string }> = [];
  const walk = (candidate: JsonValue, pointer: string): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => walk(item, `${pointer}/${index}`));
      return;
    }
    if (!isJsonObject(candidate)) return;
    for (const [key, item] of Object.entries(candidate)) {
      const childPointer = `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      if (typeof item === "string") {
        const locatorType = key === "value" && typeof candidate.locator_type === "string"
          ? candidate.locator_type
          : undefined;
        result.push({ text: item, fieldName: key, pointer: childPointer, ...(locatorType === undefined ? {} : { locatorType }) });
      } else walk(item, childPointer);
    }
  };
  walk(value, "");
  return result;
}

export function runProjectionDisclosureChecks(
  source: ScientificReport,
  projected: ScientificReport,
  actions: readonly ProjectionFieldAction[],
  executedAt: string,
): DisclosureProjectionRecord["disclosure_checks"] {
  const locations = textLocations(projected as unknown as JsonValue);
  const secretCount = locations.filter((location) => SECRET_PATTERN.test(location.text)).length;
  const absolutePathCount = locations.filter((location) => containsAbsoluteFilesystemReference(location.text, {
    fieldName: location.fieldName,
    instancePointer: location.pointer,
    ...(location.locatorType === undefined ? {} : { locatorType: location.locatorType }),
  })).length;
  const dangerousCount = locations.filter((location) => DANGEROUS_URL.test(location.text)).length;
  let leakCount = 0;
  for (const action of actions.filter((candidate) => candidate.action === "withheld_envelope" || candidate.action === "omitted_object")) {
    let leaked = false;
    let sourceValue: JsonValue;
    try {
      sourceValue = pointerGet(source as unknown as JsonValue, action.source_pointer);
    } catch {
      leakCount += 1;
      continue;
    }
    if (action.source_value_hash !== sha256CanonicalJson(sourceValue)) leaked = true;

    if (action.action === "omitted_object") {
      try {
        const projectedParent = pointerGet(projected as unknown as JsonValue, pointerParentPath(action.source_pointer));
        if (!Array.isArray(projectedParent) || projectedParent.some((value) => sha256CanonicalJson(value) === action.source_value_hash)) {
          leaked = true;
        }
      } catch {
        leaked = true;
      }
      if (action.target_pointer !== null || action.target_object_id !== null || action.projected_value_hash !== null) leaked = true;
    } else {
      try {
        const targetValue = pointerGet(projected as unknown as JsonValue, action.target_pointer ?? action.source_pointer);
        if (!isJsonObject(targetValue) || targetValue.state !== "withheld" || targetValue.value !== null) leaked = true;
        const protectedValue = isJsonObject(sourceValue) && "value" in sourceValue ? sourceValue.value : undefined;
        if (protectedValue !== undefined && protectedValue !== null && isJsonObject(targetValue) && sha256CanonicalJson(targetValue.value ?? null) === sha256CanonicalJson(protectedValue)) {
          leaked = true;
        }
      } catch {
        leaked = true;
      }
    }
    if (leaked) leakCount += 1;
  }
  const check = (
    id: string,
    kind: DisclosureProjectionRecord["disclosure_checks"][number]["check_kind"],
    count: number,
  ): DisclosureProjectionRecord["disclosure_checks"][number] => ({
    check_id: id,
    check_kind: kind,
    status: count === 0 ? "pass" : "fail",
    finding_count: count,
    executed_at: executedAt,
    tool_name: PROJECTION_TOOL_NAME,
    tool_version: PROJECTION_TOOL_VERSION,
    details_artifact_id: null,
  });
  return [
    check("projection.secret-scan", "secret_scan", secretCount),
    check("projection.absolute-path-scan", "absolute_path_scan", absolutePathCount),
    check("projection.dangerous-url-scan", "dangerous_url_scan", dangerousCount),
    check("projection.withheld-leak-scan", "withheld_value_leak_scan", leakCount),
  ];
}

function countWithheld(value: JsonValue): number {
  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value) total += countWithheld(item);
    return total;
  }
  if (!isJsonObject(value)) return 0;
  let total = value.state === "withheld" && "value" in value ? 1 : 0;
  for (const item of Object.values(value)) total += countWithheld(item);
  return total;
}

function actionCounts(actions: readonly ProjectionFieldAction[]): Record<ProjectionActionKind, number> {
  const result: Record<ProjectionActionKind, number> = {
    retained: 0,
    withheld_envelope: 0,
    omitted_object: 0,
    generalized: 0,
    replaced_with_public_identifier: 0,
    hash_only: 0,
  };
  actions.forEach((action) => { result[action.action] += 1; });
  return result;
}

/**
 * Deterministically project one schema-valid canonical report into a public
 * report. Every scientific change is explicit, hash-bound, and later replayed
 * by verifyDisclosureProjection; metadata-only role/projection fields are the
 * sole implicit changes.
 */
export function projectDisclosure(
  sourceValue: ScientificReport,
  options: ProjectDisclosureOptions,
): ProjectionResult {
  const repository = loadSchemas();
  const sourceValidation = repository.validateScientificReport(sourceValue);
  if (!sourceValidation.valid) {
    throw new Error(`Canonical source report fails schema validation (${sourceValidation.issues.length} issue(s))`);
  }
  if (sourceValue.payload_role !== "canonical_authoritative") {
    throw new Error(`Disclosure projection requires canonical_authoritative input, received ${sourceValue.payload_role}`);
  }
  const createdAt = canonicalIso(options.createdAt);
  const instructions = [...(options.instructions ?? [])];
  instructions.forEach(assertInstruction);
  assertNonOverlapping(instructions);

  const source = cloneJson(sourceValue as unknown as JsonValue) as unknown as ScientificReport;
  let projected = cloneJson(sourceValue as unknown as JsonValue) as unknown as ScientificReport;
  const actions: ProjectionFieldAction[] = [];
  const removals: Array<{ instruction: ProjectionInstruction; sourceValue: JsonValue; sourceObjectId: string }> = [];

  for (const [index, instruction] of instructions.entries()) {
    const sourceField = pointerGet(source as unknown as JsonValue, instruction.sourcePointer);
    const sourceObjectId = nearestObjectId(source as unknown as JsonValue, instruction.sourcePointer, source.report_id);
    if (instruction.action === "omitted_object") {
      const parent = pointerParent(projected as unknown as JsonValue, instruction.sourcePointer);
      if (!Array.isArray(parent)) {
        throw new Error(`omitted_object may target only an array member: ${instruction.sourcePointer}`);
      }
      removals.push({ instruction, sourceValue: sourceField, sourceObjectId });
      continue;
    }

    let projectedField: JsonValue;
    if (instruction.action === "retained") projectedField = cloneJson(sourceField);
    else if (instruction.action === "withheld_envelope") {
      if (epistemicState(sourceField) === "not_enveloped") {
        throw new Error(`withheld_envelope must target a scientific missingness envelope: ${instruction.sourcePointer}`);
      }
      projectedField = makeWithheldEnvelope(instruction);
    } else projectedField = cloneJson(instruction.projectedValue!);

    projected = pointerSet(projected as unknown as JsonValue, instruction.sourcePointer, projectedField) as unknown as ScientificReport;
    actions.push({
      action_id: `${options.projectionId}.action.${index + 1}`,
      source_object_id: sourceObjectId,
      source_pointer: instruction.sourcePointer,
      target_object_id: nearestObjectId(projected as unknown as JsonValue, instruction.sourcePointer, projected.report_id),
      target_pointer: instruction.sourcePointer,
      action: instruction.action,
      source_epistemic_state: epistemicState(sourceField),
      projected_epistemic_state: epistemicState(projectedField),
      source_value_hash: sha256CanonicalJson(sourceField),
      projected_value_hash: sha256CanonicalJson(projectedField),
      reason: instruction.reason,
      policy_rule_id: instruction.policyRuleId,
      review_status: instruction.reviewStatus ?? "not_required",
    });
  }

  for (const removal of sortRemovalsForApplication(
    source as unknown as JsonValue,
    removals,
    (candidate) => candidate.instruction.sourcePointer,
  )) {
    pointerRemove(projected as unknown as JsonValue, removal.instruction.sourcePointer);
    const index = instructions.indexOf(removal.instruction);
    actions.push({
      action_id: `${options.projectionId}.action.${index + 1}`,
      source_object_id: removal.sourceObjectId,
      source_pointer: removal.instruction.sourcePointer,
      target_object_id: null,
      target_pointer: null,
      action: "omitted_object",
      source_epistemic_state: epistemicState(removal.sourceValue),
      projected_epistemic_state: "not_present",
      source_value_hash: sha256CanonicalJson(removal.sourceValue),
      projected_value_hash: null,
      reason: removal.instruction.reason,
      policy_rule_id: removal.instruction.policyRuleId,
      review_status: removal.instruction.reviewStatus ?? "not_required",
    });
  }
  actions.sort((left, right) => left.action_id.localeCompare(right.action_id, "en"));

  projected.payload_role = "public_projection";
  projected.disclosure_state = {
    level: "public",
    projection_status: "projected",
    withheld_field_count: 0,
    omitted_object_count: actions.filter((action) => action.action === "omitted_object").length,
    projection_id: options.projectionId,
  };
  projected.disclosure_state.withheld_field_count = countWithheld(projected as unknown as JsonValue);

  const checks = runProjectionDisclosureChecks(source, projected, actions, createdAt);
  const unresolvedReviewTaskIds = actions
    .filter((action) => action.review_status === "not_reviewed" || action.review_status === "changes_requested")
    .map((action) => action.action_id);
  const status = checks.every((check) => check.status === "pass") && unresolvedReviewTaskIds.length === 0
    ? "complete"
    : "incomplete";
  if (status !== "complete") projected.disclosure_state.projection_status = "projection_incomplete";

  const projection: DisclosureProjectionRecord = {
    projection_id: options.projectionId,
    projection_version: options.projectionVersion ?? "1.0.0",
    schema_version: source.schema_version,
    source_report_id: source.report_id,
    source_report_version: source.report_version,
    source_payload_hash: sha256CanonicalJson(source),
    projected_report_id: projected.report_id,
    projected_report_version: projected.report_version,
    projected_payload_hash: sha256CanonicalJson(projected),
    source_disclosure_level: source.disclosure_state.level,
    target_disclosure_level: "public",
    policy_id: options.policy.policy_id,
    policy_version: options.policy.policy_version,
    policy_hash: sha256CanonicalJson(options.policy),
    created_at: createdAt,
    projection_status: status,
    field_actions: actions,
    counts: actionCounts(actions),
    disclosure_checks: checks,
    unresolved_review_task_ids: unresolvedReviewTaskIds,
    extensions: {
      "report_prompt.projection": {
        implementation: `${PROJECTION_TOOL_NAME}/${PROJECTION_TOOL_VERSION}`,
        hash_basis: "canonical-json-v1",
        intrinsic_metadata_changes: ["/payload_role", "/disclosure_state"],
        policy_contract: options.policy.rules,
      },
    },
  };

  const projectedValidation = repository.validate(SCIENTIFIC_REPORT_SCHEMA_ID, projected);
  const projectionValidation = repository.validate(DISCLOSURE_PROJECTION_SCHEMA_ID, projection);
  if (!projectedValidation.valid || !projectionValidation.valid) {
    throw new Error(`Projection output failed schema validation (report=${projectedValidation.issues.length}, record=${projectionValidation.issues.length})`);
  }
  return { report: projected, projection };
}
