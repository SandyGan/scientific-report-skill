import { sha256CanonicalJson } from "../lib/hash.js";
import { loadSchemas, SCIENTIFIC_REPORT_SCHEMA_ID, type SchemaRepository } from "../lib/schema.js";
import { validateGenerationExchange, GENERATION_REQUEST_SCHEMA_ID, GENERATION_RESPONSE_SCHEMA_ID } from "./exchange.js";
import { validatePromptComposition } from "./prompts.js";
import type {
  GenerationIssue,
  GenerationProfileDescriptor,
  GenerationResponse,
  NormalizationResult,
  NormalizeS2Options,
} from "./types.js";

interface UnknownRecord {
  [key: string]: unknown;
}

const IMPLEMENTATION_CONTRACT = {
  implementation_id: "normalizer:canonical-s2-exchange",
  implementation_version: "1.0.0",
  algorithm: "validate-copy-rebind-validate",
  operation_policy: "preserve_order_identity_value_and_provenance",
  diagnostic_policy: "preserve_all_s2_classes",
  continuation_policy: "preserve_exact_partition_and_cursor",
  output_policy: "candidate_only_no_acceptance_claim",
} as const;

const PROFILE_CONTRACT = {
  profile_id: "normalization-profile:s2-preserving-v1",
  profile_version: "1.0.0",
  source_stage: "S2_atomic_fact_extraction",
  target_stage: "S3_normalization",
  source_schema_id: GENERATION_RESPONSE_SCHEMA_ID,
  target_schema_id: GENERATION_RESPONSE_SCHEMA_ID,
  canonical_target_schema_id: SCIENTIFIC_REPORT_SCHEMA_ID,
  preserved_record_classes: [
    "candidate_operations",
    "attempts",
    "failures",
    "negative_results",
    "exclusions",
    "unreadable_items",
    "conflicts",
    "missingness",
    "review_tasks",
    "forbidden_inferences",
    "source_bindings",
    "premise_bindings",
    "processed_units",
    "continuation",
  ],
  canonicalization: "RFC8785-compatible repository canonical JSON hashing; no scientific record synthesis or deletion",
} as const;

const implementationHash = sha256CanonicalJson(IMPLEMENTATION_CONTRACT);
const profileHash = sha256CanonicalJson(PROFILE_CONTRACT);

export const S3_NORMALIZATION_PROFILE: GenerationProfileDescriptor = Object.freeze({
  ...PROFILE_CONTRACT,
  profile_hash: profileHash,
  implementation_id: IMPLEMENTATION_CONTRACT.implementation_id,
  implementation_version: IMPLEMENTATION_CONTRACT.implementation_version,
  implementation_hash: implementationHash,
});

export const S3_NORMALIZER_ID = IMPLEMENTATION_CONTRACT.implementation_id;
export const S3_NORMALIZER_VERSION = IMPLEMENTATION_CONTRACT.implementation_version;
export const S3_NORMALIZER_HASH = implementationHash;
export const S3_PROFILE_ID = PROFILE_CONTRACT.profile_id;
export const S3_PROFILE_VERSION = PROFILE_CONTRACT.profile_version;
export const S3_PROFILE_HASH = profileHash;

function issue(code: string, message: string, path?: string): GenerationIssue {
  return path === undefined ? { code, message } : { code, message, path };
}

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function repository(options: NormalizeS2Options): SchemaRepository {
  if (options.schemas !== undefined) return options.schemas;
  if (options.projectRoot !== undefined && options.schemasDirectory !== undefined) {
    return loadSchemas({ projectRoot: options.projectRoot, schemasDirectory: options.schemasDirectory });
  }
  if (options.projectRoot !== undefined) return loadSchemas({ projectRoot: options.projectRoot });
  if (options.schemasDirectory !== undefined) return loadSchemas({ schemasDirectory: options.schemasDirectory });
  return loadSchemas();
}

export function resolveGenerationProfile(
  profileId: string,
  profileVersion: string,
  expectedHash: string,
): GenerationProfileDescriptor | null {
  return profileId === S3_PROFILE_ID && profileVersion === S3_PROFILE_VERSION && expectedHash === S3_PROFILE_HASH
    ? S3_NORMALIZATION_PROFILE
    : null;
}

function validateRoute(request: UnknownRecord, schemas: SchemaRepository, options: NormalizeS2Options): GenerationIssue[] {
  const issues: GenerationIssue[] = [];
  const structural = schemas.validate(GENERATION_REQUEST_SCHEMA_ID, request);
  issues.push(...structural.issues.map((item) => issue(`RP-ROUTE-001.request-schema.${item.keyword}`, item.message, item.instancePointer)));
  if (!structural.valid) return issues;
  if (request.stage !== "S3_normalization") {
    issues.push(issue("RP-ROUTE-001.stage", "S3 normalizer accepts only S3_normalization requests.", "/stage"));
  }
  const composition = validatePromptComposition(
    request,
    options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot },
  );
  issues.push(...composition.issues);
  const route = record(request.normalization_route);
  if (route === null) {
    issues.push(issue("RP-ROUTE-001.route", "S3 request has no normalization_route.", "/normalization_route"));
    return issues;
  }
  const expectedTuples: Array<[string, unknown, unknown]> = [
    ["implementation_kind", route.implementation_kind, "deterministic_non_llm"],
    ["normalizer_id", route.normalizer_id, S3_NORMALIZER_ID],
    ["normalizer_version", route.normalizer_version, S3_NORMALIZER_VERSION],
    ["normalizer_hash", route.normalizer_hash, S3_NORMALIZER_HASH],
    ["source_schema_id", route.source_schema_id, GENERATION_RESPONSE_SCHEMA_ID],
    ["target_schema_id", route.target_schema_id, SCIENTIFIC_REPORT_SCHEMA_ID],
    ["target_schema_version", route.target_schema_version, request.target_schema_version],
    ["profile_id", route.profile_id, S3_PROFILE_ID],
    ["profile_version", route.profile_version, S3_PROFILE_VERSION],
    ["profile_hash", route.profile_hash, S3_PROFILE_HASH],
    ["validation_mode", route.validation_mode, "validate_input_and_output"],
  ];
  for (const [field, actual, expected] of expectedTuples) {
    if (actual !== expected) issues.push(issue("RP-ROUTE-001.pin", `${field} is not the installed deterministic S3 tuple.`, `/normalization_route/${field}`));
  }
  const input = record(route.input_response);
  if (input === null) {
    issues.push(issue("RP-ROUTE-001.input", "S3 route must embed the complete S2 response.", "/normalization_route/input_response"));
    return issues;
  }
  const inputValidation = schemas.validate(GENERATION_RESPONSE_SCHEMA_ID, input);
  issues.push(...inputValidation.issues.map((item) => issue(`RP-ROUTE-001.input-schema.${item.keyword}`, item.message, `/normalization_route/input_response${item.instancePointer}`)));
  if (route.input_response_id !== input.response_id || route.input_response_hash !== sha256CanonicalJson(input)) {
    issues.push(issue("RP-ROUTE-001.input-hash", "Embedded S2 response does not match input_response_id/hash.", "/normalization_route/input_response_hash"));
  }
  if (input.stage !== "S2_atomic_fact_extraction") {
    issues.push(issue("RP-ROUTE-001.source-stage", "S3 profile accepts only a full S2_atomic_fact_extraction response.", "/normalization_route/input_response/stage"));
  }
  if (sha256CanonicalJson(input.authorized_patch_roots) !== sha256CanonicalJson(request.permitted_patch_roots)) {
    issues.push(issue("RP-ROUTE-001.authorization", "Embedded S2 authorized roots must exactly equal the S3 request-owned roots; normalization cannot add, remove, or reorder authority.", "/normalization_route/input_response/authorized_patch_roots"));
  }
  if (input.target_schema_id !== request.target_schema_id || input.target_schema_version !== request.target_schema_version) {
    issues.push(issue("RP-ROUTE-001.target", "Embedded S2 target schema tuple differs from the S3 target tuple.", "/normalization_route/input_response/target_schema_id"));
  }
  if (input.accepted_state_hash !== record(request.accepted_state)?.state_hash) {
    issues.push(issue("RP-ROUTE-001.state", "Embedded S2 accepted-state hash differs from the S3 request state.", "/normalization_route/input_response/accepted_state_hash"));
  }
  if (route.source_schema_version !== input.schema_version) {
    issues.push(issue("RP-ROUTE-001.source-version", "source_schema_version does not match the embedded S2 response.", "/normalization_route/source_schema_version"));
  }
  return issues;
}

/**
 * Deterministically rebind a complete S2 exchange as an S3 candidate response.
 * Scientific operations and every adverse/lineage class are copied byte-value
 * exactly; this route never silently synthesizes or drops a record.
 */
export function normalizeS2Response(
  requestValue: unknown,
  options: NormalizeS2Options = {},
): NormalizationResult {
  const request = record(requestValue);
  if (request === null) return { ok: false, valid: false, issues: [issue("RP-ROUTE-001.request", "S3 request is not an object.")] };
  const schemas = repository(options);
  const issues = validateRoute(request, schemas, options);
  if (issues.length > 0) return { ok: false, valid: false, issues };
  const route = record(request.normalization_route)!;
  const input = record(route.input_response)!;
  const responseSeed = {
    request_id: request.request_id,
    input_response_hash: route.input_response_hash,
    profile_hash: S3_PROFILE_HASH,
    accepted_state_hash: record(request.accepted_state)?.state_hash,
  };
  const seedHash = sha256CanonicalJson(responseSeed).slice("sha256:".length);
  const response = {
    response_id: options.responseId ?? `response:s3:${seedHash.slice(0, 32)}`,
    response_version: "1.0.0",
    schema_version: input.schema_version,
    request_id: request.request_id,
    request_contract_hash: sha256CanonicalJson(request),
    prompt_id: "report_prompt.bundle",
    prompt_version: "0.3.0",
    prompt_contracts_hash: request.prompt_contracts_hash,
    target_schema_id: request.target_schema_id,
    target_schema_version: request.target_schema_version,
    authorized_patch_roots: structuredClone(request.permitted_patch_roots),
    accepted_state_hash: record(request.accepted_state)?.state_hash,
    stage: "S3_normalization",
    status: input.status,
    cannot_complete_reason: input.cannot_complete_reason,
    candidate_operations: structuredClone(input.candidate_operations),
    source_bindings: structuredClone(input.source_bindings),
    processed_unit_ids: structuredClone(input.processed_unit_ids),
    excluded_items: structuredClone(input.excluded_items),
    unreadable_items: structuredClone(input.unreadable_items),
    conflicts: structuredClone(input.conflicts),
    missingness: structuredClone(input.missingness),
    review_tasks: structuredClone(input.review_tasks),
    forbidden_inferences_detected: structuredClone(input.forbidden_inferences_detected),
    reproducibility_coverage: null,
    continuation: structuredClone(input.continuation),
    created_at: options.createdAt ?? request.created_at,
    extensions: {
      ...(record(structuredClone(input.extensions)) ?? {}),
      normalization_profile_id: S3_PROFILE_ID,
      normalization_profile_version: S3_PROFILE_VERSION,
      normalization_profile_hash: S3_PROFILE_HASH,
      normalizer_id: S3_NORMALIZER_ID,
      normalizer_version: S3_NORMALIZER_VERSION,
      normalizer_hash: S3_NORMALIZER_HASH,
      normalized_input_response_id: input.response_id,
      normalized_input_response_hash: route.input_response_hash,
      preservation_policy: "all_s2_record_classes_and_lineage",
    },
  } as unknown as GenerationResponse;
  const exchange = validateGenerationExchange(request, response, options);
  if (!exchange.valid) return { ok: false, valid: false, issues: exchange.issues };
  return { ok: true, valid: true, issues: [], response };
}

export const normalizeAtomicExtractionResponse = normalizeS2Response;
export const getGenerationProfile = resolveGenerationProfile;
