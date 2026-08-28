import { readFile } from "node:fs/promises";

import { canonicalJson, canonicalJsonBytes, parseJson } from "../lib/json.js";
import { sha256, sha256CanonicalJson } from "../lib/hash.js";
import { projectPaths } from "../lib/project-paths.js";
import { effectiveSeverity, loadRuleSet, type RuleDefinition } from "../lib/rules.js";
import { assertCompiledRuleContracts } from "../lib/rule-support.js";
import {
  loadSchemas,
  VALIDATION_ATTESTATION_SCHEMA_ID,
  type SchemaIssue,
} from "../lib/schema.js";
import { summarizeReproducibility, summarizeWork } from "../lib/summaries.js";
import { verifyDisclosureProjection } from "../projection/index.js";
import { createValidationAttestation } from "./attestation.js";
import { buildSemanticContext, categoryForRule, finding, makeInternalRule } from "./context.js";
import { DOMAIN_PACK_RULE } from "./domain.js";
import { assessSupportedReproducibilityLevel } from "./reproducibility-rules.js";
import { MISSINGNESS_RULE, REFERENCE_RULE } from "./reference.js";
import { DOMAIN_OVERLAY_COVERAGE_RULE, validateSemantics } from "./semantic.js";
import type {
  RuleEvaluation,
  ValidateReportFileOptions,
  ValidateReportOptions,
  ValidationFinding,
  ValidationResult,
  ValidationAttestation,
} from "./types.js";

const SCHEMA_RULE = makeInternalRule(
  "SCHEMA001",
  "Canonical scientific-report schema validation",
  "blocker",
  "/",
  "Scientific report does not conform to the canonical draft 2020-12 schema.",
  "Correct the reported schema issues without inventing unknown, not-applicable, or withheld values.",
  "schema_and_missingness",
);

const ATTESTATION_SCHEMA_RULE = makeInternalRule(
  "ATTESTATION_SCHEMA001",
  "Generated validation attestation schema validation",
  "blocker",
  "/",
  "Generated validation attestation does not conform to its canonical schema.",
  "Treat the validation run as an internal error and correct the attestation implementation before release.",
  "package_identity",
);

const PROFILE_PREREQUISITE_RULE = makeInternalRule(
  "PROFILE001",
  "Severity-profile release prerequisites",
  "blocker",
  "/severity_profile",
  "One or more release prerequisites declared by the selected severity profile are not complete.",
  "Run and integrity-bind every rule or external artifact required by the selected profile before release.",
  "package_identity",
);

function nowValue(option: ValidateReportOptions["now"]): string {
  const value = typeof option === "function" ? option() : option ?? new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError(`Invalid validator clock value: ${String(value)}`);
  return date.toISOString();
}

function schemaEvaluation(issues: readonly SchemaIssue[]): RuleEvaluation {
  const findings: ValidationFinding[] = issues.map((issue) =>
    finding({
      rule: SCHEMA_RULE,
      effectiveSeverity: "blocker",
      category: "schema_and_missingness",
      pointer: issue.instancePointer,
      message: `${issue.message} (${issue.keyword}; schema ${issue.schemaPointer}).`,
      details: {
        keyword: issue.keyword,
        schema_pointer: issue.schemaPointer,
      },
    }),
  );
  return {
    rule: SCHEMA_RULE,
    category: "schema_and_missingness",
    status: findings.length === 0 ? "pass" : "fail",
    effectiveSeverity: "blocker",
    findings,
    message: findings.length === 0
      ? "Canonical scientific-report schema validation passed."
      : `Canonical scientific-report schema validation produced ${findings.length} issue(s).`,
    automated: true,
    applicable: true,
  };
}

function prerequisiteNotRun(rule: RuleDefinition, message: string, severity = rule.severity): RuleEvaluation {
  return {
    rule,
    category: categoryForRule(rule),
    status: "not_run",
    effectiveSeverity: severity,
    findings: [],
    message,
    automated: false,
    applicable: true,
  };
}

function profilePrerequisiteEvaluation(
  evaluations: readonly RuleEvaluation[],
  report: NonNullable<ValidationResult["report"]>,
  ruleSet: ReturnType<typeof loadRuleSet>,
): RuleEvaluation {
  const gate = ruleSet.profile.release_gate;
  const requiredRuleIds = new Set<string>();
  if (typeof gate.require_attestation_rule === "string") requiredRuleIds.add(gate.require_attestation_rule);
  if (typeof gate.require_accessibility_rule === "string") requiredRuleIds.add(gate.require_accessibility_rule);
  if (Array.isArray(gate.require_disclosure_rules)) {
    gate.require_disclosure_rules.filter((id): id is string => typeof id === "string").forEach((id) => requiredRuleIds.add(id));
  }
  const unresolved: string[] = [];
  const failed: string[] = [];
  for (const ruleId of requiredRuleIds) {
    const evaluation = evaluations.find((candidate) => candidate.rule.id === ruleId);
    if (evaluation?.status === "pass") continue;
    if (evaluation?.status === "fail" || evaluation?.status === "error") failed.push(`${ruleId}=${evaluation.status}`);
    else unresolved.push(`${ruleId}=${evaluation?.status ?? "missing"}`);
  }
  if (gate.require_external_attestation === true) {
    unresolved.push("external_attestation=not_run");
  }
  if (gate.require_fresh_rerun_evidence_for_claimed_reruns === true) {
    const claimed = report.reproducibility_units.filter((unit) =>
      unit.conservative_level === "R2_verified_replay" || unit.conservative_level === "R3_independent_reproduction",
    );
    for (const unit of claimed) {
      const fresh = unit.replay_events.some((event) => {
        const raw = event as unknown as Record<string, unknown>;
        const executionTime = raw.execution_time;
        if (executionTime === null || typeof executionTime !== "object" || Array.isArray(executionTime)) return false;
        const field = executionTime as Record<string, unknown>;
        return field.state === "known" && typeof field.value === "string" &&
          Number.isFinite(Date.parse(field.value)) && Date.parse(field.value) >= Date.parse(report.created_at) &&
          event.comparison_result === "met";
      });
      if (!fresh) unresolved.push(`${unit.reproducibility_unit_id}.fresh_rerun=not_run`);
    }
  }

  if (failed.length > 0) {
    const findingRecord = finding({
      rule: PROFILE_PREREQUISITE_RULE,
      effectiveSeverity: "blocker",
      category: "package_and_identity",
      pointer: "/severity_profile",
      affectedObjectIds: [report.report_id],
      message: `Severity profile ${ruleSet.profileName} has failed release prerequisites: ${failed.join(", ")}.`,
      details: { failed_prerequisites: failed, unresolved_prerequisites: unresolved },
    });
    return {
      rule: PROFILE_PREREQUISITE_RULE,
      category: "package_and_identity",
      status: "fail",
      effectiveSeverity: "blocker",
      findings: [findingRecord],
      message: findingRecord.message,
      automated: true,
      applicable: true,
    };
  }
  if (unresolved.length > 0) {
    return prerequisiteNotRun(
      PROFILE_PREREQUISITE_RULE,
      `Severity profile ${ruleSet.profileName} prerequisites are incomplete: ${unresolved.join(", ")}. No release pass is asserted.`,
      "blocker",
    );
  }
  return {
    rule: PROFILE_PREREQUISITE_RULE,
    category: "package_and_identity",
    status: "pass",
    effectiveSeverity: "blocker",
    findings: [],
    message: `Every release prerequisite declared by severity profile ${ruleSet.profileName} is complete for this validation scope.`,
    automated: true,
    applicable: true,
  };
}

function schemaBlockedEvaluations(
  ruleSet: ReturnType<typeof loadRuleSet>,
  selectedRuleIds: string[] | undefined,
): RuleEvaluation[] {
  const selected = selectedRuleIds === undefined ? null : new Set(selectedRuleIds);
  if (selected !== null) {
    const known = new Set(ruleSet.registry.rules.map((rule) => rule.id));
    const unknown = [...selected].filter((id) => !known.has(id));
    if (unknown.length > 0) throw new Error(`Unknown selected rule id(s): ${unknown.join(", ")}`);
  }
  const internal = [REFERENCE_RULE, MISSINGNESS_RULE, DOMAIN_OVERLAY_COVERAGE_RULE, DOMAIN_PACK_RULE].map((rule) =>
    prerequisiteNotRun(rule, `${rule.id} was not run because canonical schema validation failed.`, rule.severity),
  );
  const catalog = ruleSet.registry.rules
    .map((rule) =>
      prerequisiteNotRun(
        rule,
        `${rule.id} was not run because canonical schema validation failed. No pass is asserted.`,
        effectiveSeverity(rule, ruleSet.profile),
      ),
    );
  return [...internal, ...catalog];
}

function attestationErrorEvaluation(issues: readonly SchemaIssue[]): RuleEvaluation {
  return {
    rule: ATTESTATION_SCHEMA_RULE,
    category: "package_and_identity",
    status: "error",
    effectiveSeverity: "blocker",
    findings: [],
    message: `Generated attestation failed schema validation: ${issues
      .map((issue) => `${issue.instancePointer || "/"} ${issue.message}`)
      .join("; ")}`,
    automated: true,
    applicable: true,
  };
}

function resolveAttestationBindingEvaluation(
  evaluations: readonly RuleEvaluation[],
  preliminary: ValidationAttestation,
  report: NonNullable<ValidationResult["report"]>,
  payloadHash: ValidationResult["payloadHash"],
  ruleSet: ReturnType<typeof loadRuleSet>,
): RuleEvaluation[] {
  return evaluations.map((evaluation) => {
    if (evaluation.rule.id !== "ATT001") return evaluation;
    const mismatches: string[] = [];
    if (preliminary.scientific_payload_hash !== payloadHash) mismatches.push("scientific payload hash");
    if (preliminary.report_id !== report.report_id) mismatches.push("report_id");
    if (preliminary.report_version !== report.report_version) mismatches.push("report_version");
    if (preliminary.schema_version !== report.schema_version) mismatches.push("schema_version");
    if (preliminary.ruleset_version !== ruleSet.registry.registry_version) mismatches.push("ruleset_version");
    if (preliminary.ruleset_id !== "report-rule-registry") mismatches.push("ruleset_id");
    if (report.payload_role === "public_projection") {
      const projection = preliminary.disclosure_projection_binding;
      if (projection === null) mismatches.push("disclosure_projection_binding");
      else {
        if (projection.projection_id !== report.disclosure_state.projection_id) mismatches.push("projection_id");
        if (projection.projected_payload_hash !== sha256CanonicalJson(report)) mismatches.push("projection projected_payload_hash");
      }
    }
    const findings = mismatches.length === 0
      ? []
      : [finding({
          rule: evaluation.rule,
          effectiveSeverity: evaluation.effectiveSeverity,
          category: "package_and_identity",
          pointer: "/scientific_payload_hash",
          affectedObjectIds: [report.report_id],
          message: `Generated attestation binding mismatch: ${mismatches.join(", ")}.`,
          details: { mismatched_fields: mismatches },
        })];
    return {
      ...evaluation,
      status: findings.length === 0 ? "pass" : "fail",
      findings,
      message: findings.length === 0
        ? "ATT001 verified the generated attestation identity and exact scientific payload hash."
        : `ATT001 produced ${findings.length} binding finding(s).`,
      automated: true,
      applicable: true,
    };
  });
}

function ensurePayloadBytesMatch(value: unknown, payloadBytes: Uint8Array): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadBytes).toString("utf8"));
  } catch (error) {
    throw new SyntaxError(`payloadBytes are not the JSON representation of report: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (canonicalJson(parsed) !== canonicalJson(value)) {
    throw new Error("payloadBytes parse to a different JSON value than the report argument");
  }
}

/** Validate an in-memory report and create a payload-bound attestation. */
export function validateReport(report: unknown, options: ValidateReportOptions = {}): ValidationResult {
  const startedAt = nowValue(options.now);
  const paths = projectPaths(options.projectRoot);
  const repository = options.schemaRepository ?? loadSchemas({ projectRoot: paths.root });
  const ruleSet = options.ruleSet ?? loadRuleSet({
    projectRoot: paths.root,
    ...(options.severityProfile === undefined ? {} : { profile: options.severityProfile }),
  });
  assertCompiledRuleContracts(ruleSet.registry, ruleSet.overlays);
  const canonicalBytes = canonicalJsonBytes(report);
  const payloadBytes = options.payloadBytes ?? canonicalBytes;
  if (options.payloadBytes !== undefined) ensurePayloadBytesMatch(report, options.payloadBytes);
  const payloadHash = sha256(payloadBytes);
  const payloadHashBasis = options.payloadBytes === undefined ? "canonical-json-v1" : "exact-file-bytes";
  const structural = repository.validateScientificReport(report);
  let evaluations: RuleEvaluation[] = [schemaEvaluation(structural.issues)];
  const typedReport = structural.valid ? structural.typedValue ?? null : null;
  const projectionVerification = typedReport !== null && options.disclosureProjection !== undefined
    ? verifyDisclosureProjection(
        options.disclosureProjection.sourceReport,
        typedReport,
        options.disclosureProjection.projection,
      )
    : null;
  const projectionRecord = options.disclosureProjection?.projection;
  const projectionRecordObject = projectionRecord !== null && typeof projectionRecord === "object" && !Array.isArray(projectionRecord)
    ? projectionRecord as Record<string, unknown>
    : null;
  const disclosureProjectionBinding = projectionVerification?.valid === true &&
      projectionRecordObject !== null && typeof projectionRecordObject.projection_id === "string"
    ? {
        projection_id: projectionRecordObject.projection_id,
        projection_hash: sha256CanonicalJson(projectionRecord),
        source_payload_hash: projectionVerification.sourcePayloadHash,
        projected_payload_hash: projectionVerification.projectedPayloadHash,
        verification_status: "pass" as const,
      }
    : null;
  let semanticContext: ReturnType<typeof buildSemanticContext> | null = null;

  if (typedReport !== null) {
    semanticContext = buildSemanticContext(typedReport, ruleSet, projectionVerification);
    evaluations.push(
      ...validateSemantics(semanticContext, {
        repository,
        ...(options.selectedRuleIds === undefined ? {} : { selectedRuleIds: options.selectedRuleIds }),
        ...(options.validateDomainPacks === undefined ? {} : { validateDomainPacks: options.validateDomainPacks }),
        ...(options.domainPackPayloads === undefined ? {} : { additionalDomainPackPayloads: options.domainPackPayloads }),
      }),
    );
  } else {
    evaluations.push(...schemaBlockedEvaluations(ruleSet, options.selectedRuleIds));
  }

  const completedAt = nowValue(options.now);
  const create = () =>
    createValidationAttestation({
      report: typedReport,
      rawReport: report,
      payloadHash,
      payloadHashBasis,
      payloadByteSize: payloadBytes.byteLength,
      evaluations,
      ruleSet,
      repository,
      projectRoot: paths.root,
      startedAt,
      completedAt,
      disclosureProjectionBinding,
      ...(options.selectedRuleIds === undefined ? {} : { selectedRuleIds: options.selectedRuleIds }),
      ...(options.name === undefined ? {} : { name: options.name }),
      ...(options.version === undefined ? {} : { version: options.version }),
      ...(options.buildHash === undefined ? {} : { buildHash: options.buildHash }),
    });

  let attestation = create();
  if (typedReport !== null && evaluations.some((evaluation) => evaluation.rule.id === "ATT001")) {
    evaluations = resolveAttestationBindingEvaluation(
      evaluations,
      attestation,
      typedReport,
      payloadHash,
      ruleSet,
    );
    attestation = create();
  }
  if (typedReport !== null) {
    evaluations = [...evaluations, profilePrerequisiteEvaluation(evaluations, typedReport, ruleSet)];
    attestation = create();
  }
  const attestationSchema = repository.validate(VALIDATION_ATTESTATION_SCHEMA_ID, attestation);
  if (!attestationSchema.valid) {
    evaluations = [...evaluations, attestationErrorEvaluation(attestationSchema.issues)];
    attestation = create();
  }

  const findings = evaluations.flatMap((evaluation) => evaluation.findings);
  const profileFailOn = new Set(ruleSet.profile.release_gate.fail_on);
  const gatedFailure = evaluations.some(
    (evaluation) => evaluation.status === "fail" && profileFailOn.has(evaluation.effectiveSeverity),
  );
  const errors = evaluations.some((evaluation) => evaluation.status === "error");
  const complete = !evaluations.some((evaluation) => evaluation.status === "not_run" || evaluation.status === "error");
  const valid = attestation.overall_status === "valid";
  const semanticEvaluations = evaluations.filter((evaluation) => evaluation.rule.id !== SCHEMA_RULE.id);
  const semanticValid = !semanticEvaluations.some((evaluation) => evaluation.status === "fail" || evaluation.status === "error");
  const releaseEligible =
    structural.valid &&
    semanticValid &&
    complete &&
    attestation.coverage.release_coverage_complete &&
    !gatedFailure &&
    !errors &&
    ruleSet.profile.release_gate.publishable !== false;
  const reproducibilitySummary = typedReport === null || semanticContext === null
    ? null
    : summarizeReproducibility(typedReport.reproducibility_units, {
        levelBasis: "validator_supported",
        levelOverrides: new Map(
          typedReport.reproducibility_units.map((unit) => [
            unit.reproducibility_unit_id,
            assessSupportedReproducibilityLevel(semanticContext, unit).highestSupportedLevel,
          ]),
        ),
      });

  return {
    valid,
    complete,
    releaseEligible,
    schemaValid: structural.valid,
    semanticValid,
    report: typedReport,
    rawReport: report,
    payloadHash,
    payloadHashBasis,
    schemaIssues: structural.issues,
    findings,
    evaluations,
    workSummary: typedReport === null ? null : summarizeWork(typedReport),
    reproducibilitySummary,
    attestation,
  };
}

/** Parse and validate one exact JSON file; the attestation binds its exact bytes. */
export async function validateReportFile(
  filePath: string,
  options: ValidateReportFileOptions = {},
): Promise<ValidationResult> {
  const bytes = await readFile(filePath);
  const report = parseJson(bytes.toString("utf8"), filePath);
  return validateReport(report, { ...options, payloadBytes: bytes });
}

export * from "./attestation.js";
export * from "./context.js";
export * from "./domain.js";
export * from "./reproducibility-rules.js";
export * from "./semantic.js";
export * from "./severity.js";
export * from "./types.js";
