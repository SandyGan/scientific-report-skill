import type { JsonValue } from "../lib/json.js";
import type { ScientificReport } from "../lib/types.js";

export type ProjectionActionKind =
  | "retained"
  | "withheld_envelope"
  | "omitted_object"
  | "generalized"
  | "replaced_with_public_identifier"
  | "hash_only";

export type ProjectionEpistemicState =
  | "known"
  | "unknown"
  | "not_applicable"
  | "withheld"
  | "not_enveloped"
  | "not_present";

export interface ProjectionInstruction {
  sourcePointer: string;
  action: ProjectionActionKind;
  reason: string;
  policyRuleId: string;
  /** Required for generalized/replaced/hash_only actions. */
  projectedValue?: JsonValue;
  withholdingReasonCode?:
    | "privacy"
    | "ethics_or_consent"
    | "license_or_contract"
    | "security"
    | "controlled_access"
    | "source_confidentiality"
    | "other_restricted";
  disclosureDecisionId?: string;
  reviewStatus?: "not_reviewed" | "approved" | "changes_requested" | "not_required";
}

export interface DisclosureProjectionPolicy {
  policy_id: string;
  policy_version: string;
  rules: JsonValue;
}

export interface ProjectDisclosureOptions {
  projectionId: string;
  projectionVersion?: string;
  createdAt: string;
  policy: DisclosureProjectionPolicy;
  instructions?: readonly ProjectionInstruction[];
}

export interface ProjectionFieldAction {
  action_id: string;
  source_object_id: string;
  source_pointer: string;
  target_object_id: string | null;
  target_pointer: string | null;
  action: ProjectionActionKind;
  source_epistemic_state: ProjectionEpistemicState;
  projected_epistemic_state: ProjectionEpistemicState;
  source_value_hash: `sha256:${string}`;
  projected_value_hash: `sha256:${string}` | null;
  reason: string;
  policy_rule_id: string;
  review_status: "not_reviewed" | "approved" | "changes_requested" | "not_required";
}

export interface DisclosureProjectionRecord {
  projection_id: string;
  projection_version: string;
  schema_version: string;
  source_report_id: string;
  source_report_version: string;
  source_payload_hash: `sha256:${string}`;
  projected_report_id: string;
  projected_report_version: string;
  projected_payload_hash: `sha256:${string}`;
  source_disclosure_level: "public" | "internal" | "restricted";
  target_disclosure_level: "public" | "internal" | "restricted";
  policy_id: string;
  policy_version: string;
  policy_hash: `sha256:${string}`;
  created_at: string;
  projection_status: "complete" | "incomplete" | "failed";
  field_actions: ProjectionFieldAction[];
  counts: Record<ProjectionActionKind, number>;
  disclosure_checks: Array<{
    check_id: string;
    check_kind: "secret_scan" | "absolute_path_scan" | "remote_dependency_scan" | "dangerous_url_scan" | "filename_scan" | "withheld_value_leak_scan" | "other";
    status: "pass" | "fail" | "not_run" | "error" | "not_applicable";
    finding_count: number;
    executed_at: string | null;
    tool_name: string | null;
    tool_version: string | null;
    details_artifact_id: string | null;
  }>;
  unresolved_review_task_ids: string[];
  extensions: Record<string, JsonValue>;
}

export interface ProjectionResult {
  report: ScientificReport;
  projection: DisclosureProjectionRecord;
}

export interface ProjectionVerificationIssue {
  code: string;
  pointer: string;
  message: string;
}

export interface ProjectionVerificationResult {
  valid: boolean;
  schemaValid: boolean;
  issues: ProjectionVerificationIssue[];
  sourcePayloadHash: `sha256:${string}`;
  projectedPayloadHash: `sha256:${string}`;
}
