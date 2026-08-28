import {
  containsAbsoluteFilesystemReference,
  type AbsolutePathContext,
} from "../lib/absolute-path.js";
import {
  VALIDATION_ATTESTATION_SCHEMA_ID,
  loadSchemas,
} from "../lib/schema.js";
import {
  isJsonObject,
  normalizeJsonObject,
  serializePublicPayload,
} from "./canonical-json.js";
import { RendererError, type JsonObject, type JsonValue } from "./types.js";

const MISSING_STATES = new Set(["known", "unknown", "not_applicable", "withheld"]);
const NON_KNOWN_STATES = new Set(["unknown", "not_applicable", "withheld"]);
const WITHHOLDING_REASON_CODES = new Set([
  "privacy",
  "ethics_or_consent",
  "license_or_contract",
  "security",
  "controlled_access",
  "source_confidentiality",
  "other_restricted",
]);

export interface ValidationBinding {
  attestation: JsonObject | null;
  bound: boolean;
  status: string;
  payloadHashDisplay: string;
}

/**
 * Rendering is downstream of disclosure projection. Refuse canonical private or
 * incomplete projections instead of attempting render-time redaction.
 */
export function assertPublicScientificPayload(payload: JsonObject): void {
  if (payload.payload_role !== "public_projection") {
    throw new RendererError(
      "NOT_PUBLIC_PROJECTION",
      `Renderer input must declare payload_role "public_projection"; received ${displayType(payload.payload_role)}. Run disclosure projection before rendering.`,
      "$/payload_role",
    );
  }

  const disclosureState = payload.disclosure_state;
  if (!isJsonObject(disclosureState)) {
    throw new RendererError("INVALID_DISCLOSURE_STATE", "Renderer input has no disclosure_state object.", "$/disclosure_state");
  }
  if (disclosureState.level !== "public") {
    throw new RendererError(
      "NON_PUBLIC_DISCLOSURE_LEVEL",
      `Renderer input disclosure_state.level must be "public"; received ${displayType(disclosureState.level)}.`,
      "$/disclosure_state/level",
    );
  }
  if (disclosureState.projection_status !== "projected") {
    throw new RendererError(
      "INCOMPLETE_DISCLOSURE_PROJECTION",
      `Renderer input disclosure_state.projection_status must be "projected"; received ${displayType(disclosureState.projection_status)}.`,
      "$/disclosure_state/projection_status",
    );
  }

  for (const key of ["validation", "validation_status", "validation_attestation", "build_state", "build_status", "generation_audit"] as const) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      throw new RendererError(
        "EMBEDDED_NON_SCIENTIFIC_STATUS",
        `${key} must remain outside the scientific payload and be supplied through the renderer's independent options.`,
        `$/${key}`,
      );
    }
  }
  const extensions = payload.extensions;
  if (isJsonObject(extensions)) {
    for (const key of ["validation", "validation_status", "validation_attestation", "build_state", "build_status", "generation_audit"] as const) {
      if (Object.prototype.hasOwnProperty.call(extensions, key)) {
        throw new RendererError(
          "EMBEDDED_NON_SCIENTIFIC_STATUS",
          `extensions.${key} cannot be used to carry validation, build, or generation status inside the scientific payload.`,
          `$/extensions/${key}`,
        );
      }
    }
  }

  for (const key of ["report_id", "report_version", "project_id", "schema_version", "title", "language"] as const) {
    if (typeof payload[key] !== "string" || payload[key].length === 0) {
      throw new RendererError("MISSING_REPORT_IDENTITY", `Renderer input ${key} must be a non-empty string.`, `$/${key}`);
    }
  }

  assertMissingnessSemantics(payload);
  assertPublicWithheldSemantics(payload);
  assertNoAbsoluteFilesystemReferences(payload);
}

/** Refuse host-local paths before they can be duplicated into HTML or JSON output. */
export function assertNoAbsoluteFilesystemReferences(
  value: JsonValue,
  pointer = "",
  context: AbsolutePathContext = {},
): void {
  if (typeof value === "string") {
    if (containsAbsoluteFilesystemReference(value, context)) {
      const fieldPointer = pointer === "" ? "/" : pointer;
      throw new RendererError(
        "ABSOLUTE_PATH_IN_PUBLIC_PAYLOAD",
        `Public payload contains a host-local absolute filesystem reference at ${fieldPointer}. Apply disclosure projection before rendering.`,
        fieldPointer,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoAbsoluteFilesystemReferences(entry, `${pointer}/${index}`, context));
    return;
  }
  if (!isJsonObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    assertNoAbsoluteFilesystemReferences(child, `${pointer}/${escapePointer(key)}`, {
      fieldName: key,
      instancePointer: `${pointer}/${escapePointer(key)}`,
      ...(key === "value" && typeof value.locator_type === "string"
        ? { locatorType: value.locator_type }
        : {}),
    });
  }
}

/** Ensure non-known envelopes can never carry a renderable value. */
export function assertMissingnessSemantics(value: JsonValue, pointer = ""): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertMissingnessSemantics(entry, `${pointer}/${index}`));
    return;
  }
  if (!isJsonObject(value)) return;

  const state = value.state;
  if (typeof state === "string" && MISSING_STATES.has(state) && Object.prototype.hasOwnProperty.call(value, "value")) {
    const fieldPointer = pointer === "" ? "/" : pointer;
    if (state === "known" && value.value === null) {
      throw new RendererError("KNOWN_VALUE_IS_NULL", `Known envelope at ${fieldPointer} has a null value.`, fieldPointer);
    }
    if (NON_KNOWN_STATES.has(state) && value.value !== null) {
      throw new RendererError(
        "NON_KNOWN_VALUE_PRESENT",
        `${state} envelope at ${fieldPointer} has a non-null value. Rendering is refused to prevent state coercion or disclosure leakage.`,
        fieldPointer,
      );
    }
    if (NON_KNOWN_STATES.has(state) && (typeof value.missing_reason !== "string" || value.missing_reason.trim() === "")) {
      throw new RendererError("MISSING_STATE_REASON", `${state} envelope at ${fieldPointer} lacks a non-empty missing_reason.`, fieldPointer);
    }
  }

  for (const [key, child] of Object.entries(value)) {
    assertMissingnessSemantics(child, `${pointer}/${escapePointer(key)}`);
  }
}

/** Public withheld envelopes must not retain protected provenance locators or derivation identifiers. */
export function assertPublicWithheldSemantics(value: JsonValue, pointer = ""): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPublicWithheldSemantics(entry, `${pointer}/${index}`));
    return;
  }
  if (!isJsonObject(value)) return;

  if (value.state === "withheld" && Object.prototype.hasOwnProperty.call(value, "value")) {
    const fieldPointer = pointer === "" ? "/" : pointer;
    const sourceBindings = value.source_bindings;
    const derivationBindings = value.derivation_bindings;
    if (
      value.provenance_status !== "absent" ||
      !Array.isArray(sourceBindings) ||
      sourceBindings.length !== 0 ||
      !Array.isArray(derivationBindings) ||
      derivationBindings.length !== 0
    ) {
      throw new RendererError(
        "PUBLIC_WITHHELD_PROVENANCE",
        `Public withheld envelope at ${fieldPointer} retains protected or malformed provenance metadata. Rendering is refused before any output is written.`,
        fieldPointer,
      );
    }
    if (typeof value.withholding_reason_code !== "string" || !WITHHOLDING_REASON_CODES.has(value.withholding_reason_code)) {
      throw new RendererError(
        "PUBLIC_WITHHELD_REASON_CODE",
        `Public withheld envelope at ${fieldPointer} lacks an allowed non-sensitive withholding_reason_code.`,
        fieldPointer,
      );
    }
    if (typeof value.disclosure_decision_id !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{0,159}$/u.test(value.disclosure_decision_id)) {
      throw new RendererError(
        "PUBLIC_WITHHELD_DECISION",
        `Public withheld envelope at ${fieldPointer} lacks a valid disclosure_decision_id.`,
        fieldPointer,
      );
    }
  }

  for (const [key, child] of Object.entries(value)) {
    assertPublicWithheldSemantics(child, `${pointer}/${escapePointer(key)}`);
  }
}

/**
 * Bind validation display state to the exact payload bytes. Hash or identity
 * mismatches fail before any file is written. A claimed valid attestation is
 * displayed as valid only if its own required pass invariants are consistent.
 */
export function bindValidationAttestation(
  supplied: unknown,
  payload: JsonObject,
  payloadHash: string,
): ValidationBinding {
  if (supplied === undefined || supplied === null) {
    return {
      attestation: null,
      bound: false,
      status: "not_attested",
      payloadHashDisplay: "No validation attestation supplied",
    };
  }

  const attestation = normalizeJsonObject(supplied, "$attestation");
  if (attestation.scientific_payload_hash !== payloadHash) {
    throw new RendererError(
      "ATTESTATION_HASH_MISMATCH",
      `Validation attestation binds ${displayType(attestation.scientific_payload_hash)}, but the deterministic public payload hashes to ${payloadHash}.`,
      "$attestation/scientific_payload_hash",
    );
  }
  if (attestation.report_id !== payload.report_id || attestation.report_version !== payload.report_version) {
    throw new RendererError(
      "ATTESTATION_IDENTITY_MISMATCH",
      "Validation attestation report_id/report_version does not match the public scientific payload.",
      "$attestation/report_id",
    );
  }

  const schemaResult = loadSchemas().validate(VALIDATION_ATTESTATION_SCHEMA_ID, attestation);
  if (!schemaResult.valid) {
    const pointers = [...new Set(schemaResult.issues.map((issue) => issue.instancePointer || "/"))]
      .slice(0, 5)
      .join(", ");
    throw new RendererError(
      "ATTESTATION_SCHEMA_INVALID",
      `Validation attestation does not satisfy the canonical schema${pointers === "" ? "." : ` at ${pointers}.`}`,
      "$attestation",
    );
  }

  const payloadByteSize = Buffer.byteLength(serializePublicPayload(payload), "utf8");
  if (attestation.payload_byte_size !== payloadByteSize) {
    throw new RendererError(
      "ATTESTATION_PAYLOAD_SIZE_MISMATCH",
      `Validation attestation payload_byte_size does not equal the exact ${payloadByteSize}-byte serialized public payload.`,
      "$attestation/payload_byte_size",
    );
  }
  assertAttestationCheckConsistency(attestation);

  return {
    attestation,
    bound: true,
    status: String(attestation.overall_status),
    payloadHashDisplay: payloadHash,
  };
}

export function assertGenerationAuditBinding(
  supplied: unknown,
  payload: JsonObject,
  payloadHash: string,
): JsonObject | null {
  if (supplied === undefined || supplied === null) return null;
  const audit = normalizeJsonObject(supplied, "$generationAudit");
  if (audit.audit_disclosure_level !== "public") {
    throw new RendererError(
      "NON_PUBLIC_GENERATION_AUDIT",
      "A generation audit may be placed in a public render only when audit_disclosure_level is public.",
      "$generationAudit/audit_disclosure_level",
    );
  }
  if (audit.scientific_payload_hash !== payloadHash || audit.report_id !== payload.report_id || audit.report_version !== payload.report_version) {
    throw new RendererError(
      "GENERATION_AUDIT_BINDING_MISMATCH",
      "Generation audit payload hash or report identity does not match the rendered public payload.",
      "$generationAudit/scientific_payload_hash",
    );
  }
  if (audit.scientific_payload_impact !== "none" || audit.removable_without_scientific_change !== true) {
    throw new RendererError(
      "GENERATION_AUDIT_NOT_PERIPHERAL",
      "Generation audit must declare no scientific payload impact and removable_without_scientific_change true.",
      "$generationAudit/scientific_payload_impact",
    );
  }
  assertMissingnessSemantics(audit);
  assertPublicWithheldSemantics(audit);
  assertNoAbsoluteFilesystemReferences(audit);
  return audit;
}

function assertAttestationCheckConsistency(attestation: JsonObject): void {
  const checks = (attestation.checks as JsonValue[]).map((check) => check as JsonObject);
  const summary = attestation.summary as JsonObject;
  const checkIds = checks.map((check) => String(check.check_id));
  if (new Set(checkIds).size !== checkIds.length) {
    throw new RendererError(
      "ATTESTATION_CHECK_BINDING_MISMATCH",
      "Validation attestation check_id values must be unique.",
      "$attestation/checks",
    );
  }

  const expectedSummary: Record<string, number> = {
    total: checks.length,
    passed: checks.filter((check) => check.status === "pass").length,
    failed: checks.filter((check) => check.status === "fail").length,
    not_run: checks.filter((check) => check.status === "not_run").length,
    errors: checks.filter((check) => check.status === "error").length,
    not_applicable: checks.filter((check) => check.status === "not_applicable").length,
    warnings: checks.filter(
      (check) => (check.status === "fail" || check.status === "waived") && check.severity === "warning",
    ).length,
    blocking_findings: checks.filter(
      (check) => check.status === "fail" && check.severity === "blocking",
    ).length,
    waived_findings: checks.filter((check) => check.status === "waived").length,
  };
  for (const [key, expected] of Object.entries(expectedSummary)) {
    if (summary[key] !== expected) {
      throw new RendererError(
        "ATTESTATION_CHECK_SUMMARY_MISMATCH",
        `Validation attestation summary.${key} does not equal the value derived from checks.`,
        `$attestation/summary/${key}`,
      );
    }
  }

  const expectedBlockingIds = checks
    .filter((check) => check.status === "fail" && check.severity === "blocking")
    .map((check) => String(check.check_id))
    .sort((left, right) => left.localeCompare(right, "en"));
  const recordedBlockingIds = (attestation.unresolved_blocking_check_ids as JsonValue[])
    .map(String)
    .sort((left, right) => left.localeCompare(right, "en"));
  if (
    expectedBlockingIds.length !== recordedBlockingIds.length
    || expectedBlockingIds.some((id, index) => id !== recordedBlockingIds[index])
  ) {
    throw new RendererError(
      "ATTESTATION_CHECK_BINDING_MISMATCH",
      "Validation attestation unresolved_blocking_check_ids does not exactly bind the failed blocking checks.",
      "$attestation/unresolved_blocking_check_ids",
    );
  }

  const derivedStatus = checks.some((check) => check.status === "error")
    ? "error"
    : checks.some((check) => check.status === "fail")
      ? "invalid"
      : checks.some((check) => check.status === "not_run")
        ? "incomplete"
        : "valid";
  if (attestation.overall_status !== derivedStatus) {
    throw new RendererError(
      "ATTESTATION_CHECK_SUMMARY_MISMATCH",
      `Validation attestation overall_status must be ${derivedStatus} for its recorded checks.`,
      "$attestation/overall_status",
    );
  }
}

function displayType(value: JsonValue | undefined): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
