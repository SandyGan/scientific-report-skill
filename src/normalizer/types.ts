export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type NormalizationSeverity = "information" | "warning" | "error";

export interface NormalizationFinding {
  code: string;
  severity: NormalizationSeverity;
  path: string;
  message: string;
  record_id?: string;
  todo_id?: string;
}

export interface NormalizationTodo {
  todo_id: string;
  category:
    | "missing_value"
    | "missing_identity"
    | "missing_reference"
    | "review_required"
    | "contract_mismatch"
    | "unmapped_record"
    | "other";
  severity: Exclude<NormalizationSeverity, "information">;
  path: string;
  description: string;
  affected_object_ids: string[];
}

export interface NormalizeAuthoringOptions {
  /** Project root used to resolve canonical authoring/output schemas. */
  projectRoot?: string;
  /**
   * Explicit report creation time. The authoring schema has no creation-time
   * field, so callers that need a releasable candidate should provide one.
   */
  createdAt?: string;
  /** Override the deterministic report display identifier. */
  reportId?: string;
  /** Override the report version used for the candidate. */
  reportVersion?: string;
}

export interface NormalizationSchemaIssue {
  instancePointer: string;
  schemaPointer: string;
  keyword: string;
  message: string;
}

export interface NormalizationContractValidation {
  input: { valid: boolean; issues: NormalizationSchemaIssue[] };
  output: { valid: boolean; issues: NormalizationSchemaIssue[] };
}

export interface NormalizationResult {
  report: JsonObject;
  findings: NormalizationFinding[];
  /** Ordered, deduplicated authoring and review work that remains open. */
  todo: NormalizationTodo[];
  /** Pre-normalization authoring and post-normalization canonical schema results. */
  contractValidation: NormalizationContractValidation;
}

export type NormalizeAuthoringFileOptions = NormalizeAuthoringOptions;

export interface NormalizeAuthoringFileToPathOptions extends NormalizeAuthoringOptions {
  /** Pretty-print indentation for the written report. Defaults to 2. */
  indent?: number;
}
