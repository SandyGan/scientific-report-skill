import type { JsonObject, JsonValue } from "../lib/json.js";
import type { Locator, ScientificReport, SourceBinding } from "../lib/types.js";
import type { SchemaRepository, SchemaRepositoryOptions } from "../lib/schema.js";

export type GenerationRequest = JsonObject;
export type GenerationResponse = JsonObject;

export interface GenerationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface TrustedParserIdentity {
  parser_name: string;
  parser_version: string;
  configuration_hash: string;
  parser_result_id: string;
}

/**
 * Orchestrator-owned extraction bytes and identities used to authenticate model
 * provenance. `excerpt` is deliberately required: an asserted excerpt hash is
 * never accepted as evidence of the bytes it claims to identify.
 */
export interface TrustedExtractionRecord {
  source_item_id: string;
  source_snapshot_id: string;
  snapshot_registry_hash: string;
  content_hash: string;
  chunk_ids: readonly string[];
  locator: Locator;
  parser_identity: TrustedParserIdentity;
  binding_scope: SourceBinding["binding_scope"];
  excerpt: string | Uint8Array;
  source_extent: {
    unit: "utf8_bytes" | "unicode_code_points" | "records" | "frames" | "pages";
    start: number;
    end_exclusive: number;
  };
}

export interface GenerationValidationOptions extends SchemaRepositoryOptions {
  schemas?: SchemaRepository;
  /** Overrides request-derived records; only these orchestrator-trusted records are accepted. */
  trustedExtractions?: readonly TrustedExtractionRecord[];
  consumedContinuationNonces?: ReadonlySet<string>;
}

export interface GenerationExchangeResult {
  ok: boolean;
  valid: boolean;
  issues: GenerationIssue[];
  requestedUnitIds: string[];
}

export interface GenerationApplyResult extends GenerationExchangeResult {
  /** Present only after every preflight, operation, and final schema check succeeds. */
  report?: ScientificReport;
}

export interface PromptContractReference {
  contract_id: string;
  contract_path: string;
  contract_version: string;
  contract_hash: string;
}

export interface PromptCompositionResult {
  ok: boolean;
  valid: boolean;
  issues: GenerationIssue[];
  expected: PromptContractReference[];
}

export interface GenerationProfileDescriptor {
  profile_id: string;
  profile_version: string;
  profile_hash: string;
  implementation_id: string;
  implementation_version: string;
  implementation_hash: string;
  readonly [key: string]: unknown;
}

export interface NormalizeS2Options extends GenerationValidationOptions {
  responseId?: string;
  createdAt?: string;
}

export interface NormalizationResult {
  ok: boolean;
  valid: boolean;
  issues: GenerationIssue[];
  response?: GenerationResponse;
}

export interface RootRoute {
  root: string;
  objectType: string;
  collection: boolean;
  targetSchemaPointer: string | null;
  objectIdField: string | null;
}

export type CandidateOperationValue = JsonValue;
