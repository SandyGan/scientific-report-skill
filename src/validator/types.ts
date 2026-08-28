import type { SchemaIssue, SchemaRepository } from "../lib/schema.js";
import type { LoadedRuleSet, RuleDefinition, RuleSeverity } from "../lib/rules.js";
import type { JsonObject, JsonValue } from "../lib/json.js";
import type {
  Identifier,
  ReproducibilityLevel,
  ScientificReport,
  SourceBinding,
  Version,
} from "../lib/types.js";
import type { ReproducibilitySummary, WorkSummary } from "../lib/summaries.js";
import type { Sha256Hash } from "../lib/hash.js";
import type { DisclosureProjectionRecord, ProjectionVerificationResult } from "../projection/types.js";

export type ValidationCategory =
  | "package_and_identity"
  | "schema_and_missingness"
  | "source_coverage"
  | "references_and_graph"
  | "execution_state"
  | "decision_timing"
  | "material_lineage"
  | "quantitative_derivation"
  | "claims_and_argument"
  | "revision_propagation"
  | "domain_overlay"
  | "access_and_reproducibility"
  | "disclosure_and_security"
  | "offline_and_accessibility"
  | "other";

export type CheckStatus = "pass" | "fail" | "waived" | "not_run" | "error" | "not_applicable";
export type AttestationSeverity = "information" | "warning" | "blocking";

export interface ValidationFinding {
  ruleId: string;
  title: string;
  category: ValidationCategory;
  severity: RuleSeverity;
  effectiveSeverity: RuleSeverity;
  instancePointer: string;
  message: string;
  remediation: string;
  affectedObjectIds: Identifier[];
  sourceBindings: SourceBinding[];
  details?: JsonValue;
}

export interface RuleEvaluation {
  rule: RuleDefinition;
  category: ValidationCategory;
  status: CheckStatus;
  effectiveSeverity: RuleSeverity;
  findings: ValidationFinding[];
  message: string;
  automated: boolean;
  applicable: boolean;
}

export interface ValidationWaiver {
  waiver_id: Identifier;
  authorized_by: string;
  reason: string;
  authorized_at: string;
  expires_at: string | null;
}

export interface ValidationCheck {
  check_id: Identifier;
  category: ValidationCategory;
  rule_code: Identifier;
  status: CheckStatus;
  severity: AttestationSeverity;
  message: string;
  instance_pointer: string;
  affected_object_ids: Identifier[];
  waiver: ValidationWaiver | null;
  evidence_artifact_ids: Identifier[];
}

export interface ValidationSummary {
  total: number;
  passed: number;
  failed: number;
  not_run: number;
  errors: number;
  not_applicable: number;
  warnings: number;
  blocking_findings: number;
  waived_findings: number;
}

export interface ValidationCoverage {
  registry_rule_count: number;
  executed_registry_rule_ids: Identifier[];
  skipped_registry_rule_ids: Identifier[];
  loaded_overlay_ids: Identifier[];
  domain_pack_status: CheckStatus;
  profile_prerequisite_status: CheckStatus;
  full_registry_coverage: boolean;
  full_domain_coverage: boolean;
  profile_prerequisites_complete: boolean;
  release_coverage_complete: boolean;
  compiled_support_manifest_hash: Sha256Hash;
}

export interface DisclosureProjectionBinding {
  projection_id: Identifier;
  projection_hash: Sha256Hash;
  source_payload_hash: Sha256Hash;
  projected_payload_hash: Sha256Hash;
  verification_status: "pass";
}

export interface ValidationAttestation {
  attestation_id: Identifier;
  attestation_version: Version;
  schema_version: Version;
  report_id: Identifier;
  report_version: Version;
  scientific_payload_hash: Sha256Hash;
  payload_hash_basis: "canonical-json-v1" | "exact-file-bytes";
  canonicalization: "sorted-keys-utf8-v1" | "not_applicable_exact_bytes";
  payload_byte_size: number;
  schema_set_hash: Sha256Hash;
  validator: {
    name: string;
    version: Version;
    build_hash: Sha256Hash;
  };
  ruleset_id: Identifier;
  ruleset_version: Version;
  ruleset_hash: Sha256Hash;
  severity_profile: Identifier;
  disclosure_projection_binding: DisclosureProjectionBinding | null;
  validation_scope: "full" | "incremental" | "selected_rules";
  coverage: ValidationCoverage;
  started_at: string;
  completed_at: string | null;
  overall_status: "valid" | "invalid" | "incomplete" | "error";
  checks: ValidationCheck[];
  summary: ValidationSummary;
  unresolved_blocking_check_ids: Identifier[];
  signature: null;
  extensions: Record<string, JsonValue>;
}

export interface ValidatorIdentityOptions {
  name?: string;
  version?: string;
  buildHash?: Sha256Hash;
}

export interface ValidateReportOptions extends ValidatorIdentityOptions {
  projectRoot?: string;
  schemaRepository?: SchemaRepository;
  ruleSet?: LoadedRuleSet;
  severityProfile?: string;
  selectedRuleIds?: string[];
  /** Exact bytes to bind. Omit for canonical-json-v1 object hashing. */
  payloadBytes?: Uint8Array;
  /** Deterministic clock injection for attestations and tests. */
  now?: string | Date | (() => string | Date);
  validateDomainPacks?: boolean;
  /** Additional pack payloads; report.extensions.domain_payloads are also used. */
  domainPackPayloads?: unknown[];
  /** Canonical source and record required to validate a public disclosure projection. */
  disclosureProjection?: {
    sourceReport: unknown;
    projection: DisclosureProjectionRecord | unknown;
  };
}

export type ValidateReportFileOptions = Omit<ValidateReportOptions, "payloadBytes">;

export interface SupportedLevelAssessment {
  declaredLevel: ReproducibilityLevel;
  highestSupportedLevel: ReproducibilityLevel;
  failedPrerequisites: string[];
}

export interface ValidationResult {
  valid: boolean;
  complete: boolean;
  releaseEligible: boolean;
  schemaValid: boolean;
  semanticValid: boolean;
  report: ScientificReport | null;
  rawReport: unknown;
  payloadHash: Sha256Hash;
  payloadHashBasis: "canonical-json-v1" | "exact-file-bytes";
  schemaIssues: SchemaIssue[];
  findings: ValidationFinding[];
  evaluations: RuleEvaluation[];
  workSummary: WorkSummary | null;
  reproducibilitySummary: ReproducibilitySummary | null;
  attestation: ValidationAttestation;
}

export interface SemanticContext {
  report: ScientificReport;
  objectById: Map<string, ObjectRecord>;
  objectCollectionById: Map<string, string>;
  knownIds: Set<string>;
  duplicateIds: Map<string, string[]>;
  ruleSet: LoadedRuleSet;
  projectionVerification: ProjectionVerificationResult | null;
}

export interface ObjectRecord extends JsonObject {
  [key: string]: JsonValue;
}
