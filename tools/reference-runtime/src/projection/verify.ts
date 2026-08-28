import { sha256CanonicalJson } from "../lib/hash.js";
import { canonicalJson, isJsonObject, type JsonValue } from "../lib/json.js";
import { loadSchemas, SCIENTIFIC_REPORT_SCHEMA_ID } from "../lib/schema.js";
import type { ScientificReport } from "../lib/types.js";
import {
  nearestObjectId,
  pointerGet,
  pointerParent,
  pointerRemove,
  pointerSet,
  sortRemovalsForApplication,
} from "./pointer.js";
import {
  DISCLOSURE_PROJECTION_SCHEMA_ID,
  epistemicState,
  runProjectionDisclosureChecks,
} from "./project.js";
import type {
  DisclosureProjectionRecord,
  ProjectionActionKind,
  ProjectionVerificationIssue,
  ProjectionVerificationResult,
} from "./types.js";

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

function issue(
  issues: ProjectionVerificationIssue[],
  code: string,
  pointer: string,
  message: string,
): void {
  issues.push({ code, pointer, message });
}

function actionCountTemplate(): Record<ProjectionActionKind, number> {
  return {
    retained: 0,
    withheld_envelope: 0,
    omitted_object: 0,
    generalized: 0,
    replaced_with_public_identifier: 0,
    hash_only: 0,
  };
}

function stateTransitionAllowed(
  action: DisclosureProjectionRecord["field_actions"][number],
  sourceState: ReturnType<typeof epistemicState>,
  targetState: ReturnType<typeof epistemicState>,
): boolean {
  if (action.action === "omitted_object") return targetState === "not_present";
  if (action.action === "withheld_envelope") return sourceState !== "not_present" && sourceState !== "not_enveloped" && targetState === "withheld";
  if (action.action === "retained") return sourceState === targetState;
  // Generalization and identifier/hash replacement may reduce precision, but
  // must not launder known/unknown/not-applicable scientific state.
  if (sourceState === "known" || sourceState === "unknown" || sourceState === "not_applicable" || sourceState === "withheld") {
    return sourceState === targetState;
  }
  return targetState === "not_enveloped";
}

/**
 * Reconcile a projection record against both complete payloads. The verifier
 * replays every action, permits only the two intrinsic projection metadata
 * changes, and rejects unrecorded provenance/state changes.
 */
export function verifyDisclosureProjection(
  sourceValue: unknown,
  projectedValue: unknown,
  projectionValue: unknown,
): ProjectionVerificationResult {
  const repository = loadSchemas();
  const sourceValidation = repository.validate<ScientificReport>(SCIENTIFIC_REPORT_SCHEMA_ID, sourceValue);
  const projectedValidation = repository.validate<ScientificReport>(SCIENTIFIC_REPORT_SCHEMA_ID, projectedValue);
  const recordValidation = repository.validate<DisclosureProjectionRecord>(DISCLOSURE_PROJECTION_SCHEMA_ID, projectionValue);
  const sourcePayloadHash = sha256CanonicalJson(sourceValue);
  const projectedPayloadHash = sha256CanonicalJson(projectedValue);
  const issues: ProjectionVerificationIssue[] = [];

  for (const schemaIssue of sourceValidation.issues) {
    issue(issues, "SOURCE_SCHEMA", schemaIssue.instancePointer, `Source report: ${schemaIssue.message}`);
  }
  for (const schemaIssue of projectedValidation.issues) {
    issue(issues, "PROJECTED_SCHEMA", schemaIssue.instancePointer, `Projected report: ${schemaIssue.message}`);
  }
  for (const schemaIssue of recordValidation.issues) {
    issue(issues, "PROJECTION_SCHEMA", schemaIssue.instancePointer, `Projection record: ${schemaIssue.message}`);
  }
  if (!sourceValidation.valid || !projectedValidation.valid || !recordValidation.valid) {
    return {
      valid: false,
      schemaValid: false,
      issues,
      sourcePayloadHash,
      projectedPayloadHash,
    };
  }

  const source = sourceValidation.typedValue!;
  const projected = projectedValidation.typedValue!;
  const projection = recordValidation.typedValue!;
  if (source.payload_role !== "canonical_authoritative") {
    issue(issues, "SOURCE_ROLE", "/payload_role", "Projection source is not canonical_authoritative.");
  }
  if (projected.payload_role !== "public_projection") {
    issue(issues, "PROJECTED_ROLE", "/payload_role", "Projection target is not public_projection.");
  }
  const bindings: Array<[boolean, string, string]> = [
    [projection.source_report_id === source.report_id, "/source_report_id", "source report id"],
    [projection.source_report_version === source.report_version, "/source_report_version", "source report version"],
    [projection.source_payload_hash === sourcePayloadHash, "/source_payload_hash", "source payload hash"],
    [projection.projected_report_id === projected.report_id, "/projected_report_id", "projected report id"],
    [projection.projected_report_version === projected.report_version, "/projected_report_version", "projected report version"],
    [projection.projected_payload_hash === projectedPayloadHash, "/projected_payload_hash", "projected payload hash"],
    [projected.disclosure_state.projection_id === projection.projection_id, "/projection_id", "target disclosure projection id"],
    [projected.disclosure_state.level === projection.target_disclosure_level, "/target_disclosure_level", "target disclosure level"],
  ];
  bindings.filter(([matches]) => !matches).forEach(([, pointer, label]) => {
    issue(issues, "BINDING_MISMATCH", pointer, `Projection ${label} does not match the bound payload.`);
  });

  const metadata = isJsonObject(projection.extensions["report_prompt.projection"])
    ? projection.extensions["report_prompt.projection"]
    : null;
  const policyContract = metadata?.policy_contract;
  if (policyContract === undefined || projection.policy_hash !== sha256CanonicalJson({
    policy_id: projection.policy_id,
    policy_version: projection.policy_version,
    rules: policyContract,
  })) {
    issue(issues, "POLICY_HASH", "/policy_hash", "Projection policy hash is not bound to the embedded public policy contract.");
  }

  let replay = cloneJson(source as unknown as JsonValue);
  const seenPointers = new Set<string>();
  const counts = actionCountTemplate();
  const removals: typeof projection.field_actions = [];
  for (const [index, action] of projection.field_actions.entries()) {
    counts[action.action] += 1;
    if (seenPointers.has(action.source_pointer) || [...seenPointers].some((pointer) => action.source_pointer.startsWith(`${pointer}/`) || pointer.startsWith(`${action.source_pointer}/`))) {
      issue(issues, "OVERLAPPING_ACTION", `/field_actions/${index}/source_pointer`, "Projection action overlaps another action.");
      continue;
    }
    seenPointers.add(action.source_pointer);
    let sourceField: JsonValue;
    try {
      sourceField = pointerGet(source as unknown as JsonValue, action.source_pointer);
    } catch (error) {
      issue(issues, "SOURCE_POINTER", `/field_actions/${index}/source_pointer`, error instanceof Error ? error.message : String(error));
      continue;
    }
    const sourceState = epistemicState(sourceField);
    if (action.source_object_id !== nearestObjectId(source as unknown as JsonValue, action.source_pointer, source.report_id)) {
      issue(issues, "SOURCE_OBJECT", `/field_actions/${index}/source_object_id`, "Action source object id is not the nearest bound source object.");
    }
    if (action.source_value_hash !== sha256CanonicalJson(sourceField)) {
      issue(issues, "SOURCE_VALUE_HASH", `/field_actions/${index}/source_value_hash`, "Action source value hash does not match the canonical source value.");
    }
    if (action.source_epistemic_state !== sourceState) {
      issue(issues, "SOURCE_STATE", `/field_actions/${index}/source_epistemic_state`, "Action source epistemic state does not match the source value.");
    }

    if (action.action === "omitted_object") {
      if (!Array.isArray(pointerParent(source as unknown as JsonValue, action.source_pointer))) {
        issue(issues, "OMISSION_SOURCE", `/field_actions/${index}/source_pointer`, "Omitted-object action does not target an array member in the bound source.");
      }
      if (action.target_pointer !== null || action.target_object_id !== null || action.projected_value_hash !== null) {
        issue(issues, "OMISSION_TARGET", `/field_actions/${index}`, "Omitted-object action retains a target pointer, object, or hash.");
      }
      removals.push(action);
      continue;
    }
    if (action.target_pointer === null) {
      issue(issues, "TARGET_POINTER", `/field_actions/${index}/target_pointer`, "Non-omission action has no target pointer.");
      continue;
    }
    let targetField: JsonValue;
    try {
      targetField = pointerGet(projected as unknown as JsonValue, action.target_pointer);
    } catch (error) {
      issue(issues, "TARGET_POINTER", `/field_actions/${index}/target_pointer`, error instanceof Error ? error.message : String(error));
      continue;
    }
    const targetState = epistemicState(targetField);
    if (action.target_object_id !== nearestObjectId(projected as unknown as JsonValue, action.target_pointer, projected.report_id)) {
      issue(issues, "TARGET_OBJECT", `/field_actions/${index}/target_object_id`, "Action target object id is not the nearest bound projected object.");
    }
    if (action.projected_value_hash !== sha256CanonicalJson(targetField)) {
      issue(issues, "TARGET_VALUE_HASH", `/field_actions/${index}/projected_value_hash`, "Action projected value hash does not match the canonical target value.");
    }
    if (action.projected_epistemic_state !== targetState) {
      issue(issues, "TARGET_STATE", `/field_actions/${index}/projected_epistemic_state`, "Action target epistemic state does not match the projected value.");
    }
    if (!stateTransitionAllowed(action, sourceState, targetState)) {
      issue(issues, "EPISTEMIC_LAUNDERING", `/field_actions/${index}`, `Action changes ${sourceState} to ${targetState}, which is not permitted for ${action.action}.`);
    }
    if (action.action === "retained" && canonicalJson(sourceField) !== canonicalJson(targetField)) {
      issue(issues, "RETAINED_CHANGED", `/field_actions/${index}`, "Retained action changes the source value.");
    }
    replay = pointerSet(replay, action.source_pointer, cloneJson(targetField));
  }

  for (const action of sortRemovalsForApplication(
    source as unknown as JsonValue,
    removals,
    (candidate) => candidate.source_pointer,
  )) {
    try {
      pointerRemove(replay, action.source_pointer);
    } catch (error) {
      issue(issues, "OMISSION_REPLAY", action.source_pointer, error instanceof Error ? error.message : String(error));
    }
  }
  if (canonicalJson(counts) !== canonicalJson(projection.counts)) {
    issue(issues, "ACTION_COUNTS", "/counts", "Projection action counts do not reconcile with field_actions.");
  }

  const replayReport = replay as unknown as ScientificReport;
  replayReport.payload_role = projected.payload_role;
  replayReport.disclosure_state = cloneJson(projected.disclosure_state as unknown as JsonValue) as unknown as ScientificReport["disclosure_state"];
  if (canonicalJson(replayReport) !== canonicalJson(projected)) {
    issue(issues, "UNRECORDED_CHANGE", "", "Projected payload contains a scientific or provenance change not represented by a field action.");
  }

  const recomputedChecks = runProjectionDisclosureChecks(source, projected, projection.field_actions, projection.created_at);
  const recordedByKind = new Map(projection.disclosure_checks.map((check) => [check.check_kind, check]));
  for (const check of recomputedChecks) {
    const recorded = recordedByKind.get(check.check_kind);
    if (recorded === undefined || recorded.status !== check.status || recorded.finding_count !== check.finding_count) {
      issue(issues, "DISCLOSURE_CHECK", "/disclosure_checks", `Recorded ${check.check_kind} result does not match verifier recomputation.`);
    }
  }
  if (projection.projection_status !== "complete" || projection.disclosure_checks.some((check) => check.status !== "pass") || projection.unresolved_review_task_ids.length > 0) {
    issue(issues, "INCOMPLETE_PROJECTION", "/projection_status", "Projection is not complete with all disclosure checks passed and all reviews resolved.");
  }

  return {
    valid: issues.length === 0,
    schemaValid: true,
    issues,
    sourcePayloadHash,
    projectedPayloadHash,
  };
}
