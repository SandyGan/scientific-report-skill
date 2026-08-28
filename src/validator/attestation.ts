import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { sha256CanonicalJson, type Sha256Hash } from "../lib/hash.js";
import { COMPILED_RULE_SUPPORT_MANIFEST_HASH } from "../lib/rule-support.js";
import type { JsonValue } from "../lib/json.js";
import type { LoadedRuleSet, RuleSeverity } from "../lib/rules.js";
import type { SchemaRepository } from "../lib/schema.js";
import type { ScientificReport } from "../lib/types.js";
import { automatedRuleIds } from "./semantic.js";
import type {
  AttestationSeverity,
  RuleEvaluation,
  ValidationAttestation,
  ValidationCheck,
  ValidationSummary,
  ValidatorIdentityOptions,
  DisclosureProjectionBinding,
} from "./types.js";

function attestationSeverity(severity: RuleSeverity): AttestationSeverity {
  if (severity === "information") return "information";
  if (severity === "warning") return "warning";
  return "blocking";
}

function sanitizeIdentifierPart(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._:-]+/gu, "-").replace(/^[^A-Za-z]+/u, "x-");
  return sanitized.length === 0 ? "x" : sanitized.slice(0, 120);
}

export function evaluationsToChecks(evaluations: readonly RuleEvaluation[]): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const counts = new Map<string, number>();
  const nextId = (ruleId: string): string => {
    const next = (counts.get(ruleId) ?? 0) + 1;
    counts.set(ruleId, next);
    return `check:${sanitizeIdentifierPart(ruleId)}:${next}`;
  };

  for (const evaluation of evaluations) {
    if (evaluation.findings.length > 0) {
      for (const finding of evaluation.findings) {
        checks.push({
          check_id: nextId(evaluation.rule.id),
          category: finding.category,
          rule_code: evaluation.rule.id,
          status: "fail",
          severity: attestationSeverity(finding.effectiveSeverity),
          message: finding.message,
          instance_pointer: finding.instancePointer,
          affected_object_ids: finding.affectedObjectIds,
          waiver: null,
          evidence_artifact_ids: [],
        });
      }
      continue;
    }
    checks.push({
      check_id: nextId(evaluation.rule.id),
      category: evaluation.category,
      rule_code: evaluation.rule.id,
      status: evaluation.status,
      severity: attestationSeverity(evaluation.effectiveSeverity),
      message: evaluation.message,
      instance_pointer: "",
      affected_object_ids: [],
      waiver: null,
      evidence_artifact_ids: [],
    });
  }
  return checks;
}

export function summarizeChecks(checks: readonly ValidationCheck[]): ValidationSummary {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "pass").length,
    failed: checks.filter((check) => check.status === "fail").length,
    not_run: checks.filter((check) => check.status === "not_run").length,
    errors: checks.filter((check) => check.status === "error").length,
    not_applicable: checks.filter((check) => check.status === "not_applicable").length,
    warnings: checks.filter(
      (check) =>
        (check.status === "fail" || check.status === "waived") &&
        check.severity === "warning",
    ).length,
    blocking_findings: checks.filter(
      (check) => check.status === "fail" && check.severity === "blocking",
    ).length,
    waived_findings: checks.filter((check) => check.status === "waived").length,
  };
}

function overallStatus(checks: readonly ValidationCheck[]): ValidationAttestation["overall_status"] {
  if (checks.some((check) => check.status === "error")) return "error";
  if (checks.some((check) => check.status === "fail")) return "invalid";
  if (checks.some((check) => check.status === "not_run")) return "incomplete";
  return "valid";
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  function walk(directory: string): void {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) &&
        !entry.name.includes(".test.") &&
        !entry.name.includes(".spec.")
      ) files.push(path);
    }
  }
  walk(join(root, "src", "lib"));
  walk(join(root, "src", "projection"));
  walk(join(root, "src", "validator"));
  return files;
}

function validatorSourceHash(root: string, fallback: JsonValue): Sha256Hash {
  const files = sourceFiles(root);
  if (files.length === 0) return sha256CanonicalJson(fallback);
  const hash = createHash("sha256");
  for (const path of files) {
    const name = relative(root, path).replaceAll("\\", "/");
    const bytes = readFileSync(path);
    hash.update(`${name.length}:${name}:${bytes.byteLength}:`, "utf8");
    hash.update(bytes);
  }
  return `sha256:${hash.digest("hex")}`;
}

function validatorVersion(root: string): string {
  try {
    const version = readFileSync(join(root, "VERSION"), "utf8").trim();
    return version === "" ? "0" : version;
  } catch {
    return "0";
  }
}

export interface CreateAttestationInput extends ValidatorIdentityOptions {
  report: ScientificReport | null;
  rawReport: unknown;
  payloadHash: Sha256Hash;
  payloadHashBasis: "canonical-json-v1" | "exact-file-bytes";
  payloadByteSize: number;
  evaluations: RuleEvaluation[];
  ruleSet: LoadedRuleSet;
  repository: SchemaRepository;
  projectRoot: string;
  startedAt: string;
  completedAt: string;
  selectedRuleIds?: string[];
  disclosureProjectionBinding?: DisclosureProjectionBinding | null;
}

function safeIdentifier(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9._:-]{0,159}$/u.test(value)
    ? value
    : fallback;
}

function safeVersion(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[0-9A-Za-z][0-9A-Za-z._+-]{0,79}$/u.test(value)
    ? value
    : fallback;
}

export function createValidationAttestation(input: CreateAttestationInput): ValidationAttestation {
  const checks = evaluationsToChecks(input.evaluations);
  const summary = summarizeChecks(checks);
  const status = overallStatus(checks);
  const reportRecord =
    input.rawReport !== null && typeof input.rawReport === "object" && !Array.isArray(input.rawReport)
      ? (input.rawReport as Record<string, unknown>)
      : {};
  const reportId = safeIdentifier(
    input.report?.report_id ?? reportRecord.report_id,
    "unknown-report",
  );
  const reportVersion = safeVersion(
    input.report?.report_version ?? reportRecord.report_version,
    "0",
  );
  const schemaVersion = safeVersion(
    input.report?.schema_version ?? reportRecord.schema_version,
    "unknown",
  );
  const rulesetHash = sha256CanonicalJson({
    registry: input.ruleSet.registry,
    profile_name: input.ruleSet.profileName,
    profile: input.ruleSet.profile,
    overlays: input.ruleSet.overlays,
    compiled_support_manifest_hash: COMPILED_RULE_SUPPORT_MANIFEST_HASH,
    selected_rule_ids: input.selectedRuleIds ?? null,
  });
  const automated = new Set(automatedRuleIds());
  const notYetAutomated = input.evaluations
    .filter((evaluation) => evaluation.applicable && !evaluation.automated)
    .map((evaluation) => evaluation.rule.id)
    .sort();
  const notApplicable = input.evaluations
    .filter((evaluation) => evaluation.status === "not_applicable")
    .map((evaluation) => evaluation.rule.id)
    .sort();
  const buildHash = input.buildHash ?? validatorSourceHash(input.projectRoot, {
    validator_contract: "report-prompt-validator/v1",
    automated_rule_ids: [...automated].sort(),
    schema_set_hash: input.repository.schemaSetHash,
  });
  const unresolved = checks
    .filter((check) => check.status === "fail" && check.severity === "blocking")
    .map((check) => check.check_id);
  const registryIds = new Set(input.ruleSet.registry.rules.map((rule) => rule.id));
  const registryEvaluations = input.evaluations.filter((evaluation) => registryIds.has(evaluation.rule.id));
  const executedRegistryRuleIds = registryEvaluations
    .filter((evaluation) => evaluation.status !== "not_run" && evaluation.status !== "error")
    .map((evaluation) => evaluation.rule.id)
    .sort();
  const skippedRegistryRuleIds = registryEvaluations
    .filter((evaluation) => evaluation.status === "not_run" || evaluation.status === "error")
    .map((evaluation) => evaluation.rule.id)
    .sort();
  const domainPackStatus = input.evaluations.find((evaluation) => evaluation.rule.id === "PACK001")?.status ?? "not_run";
  const overlayCoverageStatus = input.evaluations.find((evaluation) => evaluation.rule.id === "OVERLAY001")?.status ?? "not_run";
  const profilePrerequisiteStatus = input.evaluations.find((evaluation) => evaluation.rule.id === "PROFILE001")?.status ?? "not_run";
  const fullRegistryCoverage = input.selectedRuleIds === undefined &&
    registryEvaluations.length === registryIds.size && skippedRegistryRuleIds.length === 0;
  const fullDomainCoverage = domainPackStatus === "pass" && overlayCoverageStatus === "pass";
  const profilePrerequisitesComplete = profilePrerequisiteStatus === "pass";
  const releaseCoverageComplete = fullRegistryCoverage && fullDomainCoverage && profilePrerequisitesComplete;

  return {
    attestation_id: `attestation:${sanitizeIdentifierPart(reportId)}:${input.payloadHash.slice("sha256:".length, "sha256:".length + 16)}`,
    attestation_version: "1.0.0",
    schema_version: schemaVersion,
    report_id: reportId,
    report_version: reportVersion,
    scientific_payload_hash: input.payloadHash,
    payload_hash_basis: input.payloadHashBasis,
    canonicalization: input.payloadHashBasis === "canonical-json-v1" ? "sorted-keys-utf8-v1" : "not_applicable_exact_bytes",
    payload_byte_size: input.payloadByteSize,
    schema_set_hash: input.repository.schemaSetHash,
    validator: {
      name: input.name ?? "report-prompt-core-validator",
      version: input.version ?? validatorVersion(input.projectRoot),
      build_hash: buildHash,
    },
    ruleset_id: "report-rule-registry",
    ruleset_version: input.ruleSet.registry.registry_version,
    ruleset_hash: rulesetHash,
    severity_profile: input.ruleSet.profileName,
    disclosure_projection_binding: input.disclosureProjectionBinding ?? null,
    validation_scope: input.selectedRuleIds === undefined ? "full" : "selected_rules",
    coverage: {
      registry_rule_count: registryIds.size,
      executed_registry_rule_ids: executedRegistryRuleIds,
      skipped_registry_rule_ids: skippedRegistryRuleIds,
      loaded_overlay_ids: input.ruleSet.overlays.map((overlay) => overlay.overlay_id).sort(),
      domain_pack_status: domainPackStatus,
      profile_prerequisite_status: profilePrerequisiteStatus,
      full_registry_coverage: fullRegistryCoverage,
      full_domain_coverage: fullDomainCoverage,
      profile_prerequisites_complete: profilePrerequisitesComplete,
      release_coverage_complete: releaseCoverageComplete,
      compiled_support_manifest_hash: COMPILED_RULE_SUPPORT_MANIFEST_HASH,
    },
    started_at: input.startedAt,
    completed_at: input.completedAt,
    overall_status: status,
    checks,
    summary,
    unresolved_blocking_check_ids: unresolved,
    signature: null,
    extensions: {
      "report_prompt.validation": {
        automated_rule_ids: input.evaluations.filter((evaluation) => evaluation.automated).map((evaluation) => evaluation.rule.id).sort(),
        not_yet_automated_rule_ids: notYetAutomated,
        not_applicable_rule_ids: notApplicable,
        selected_rule_ids: input.selectedRuleIds ?? null,
        payload_hash_basis: input.payloadHashBasis,
        payload_byte_size: input.payloadByteSize,
        compiled_support_manifest_hash: COMPILED_RULE_SUPPORT_MANIFEST_HASH,
        release_coverage_complete: releaseCoverageComplete,
        validated_artifacts: ["scientific_report"],
        attestation_scope_note: "Automated checks establish structural and declared-record consistency only; they do not establish real-world scientific truth, publisher identity, or unrecorded-source exhaustiveness.",
      },
    },
  };
}
