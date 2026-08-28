import { sha256, sha256CanonicalJson } from "../lib/hash.js";
import { canonicalJson } from "../lib/json.js";
import {
  DOMAIN_PACK_SCHEMA_IDS,
  loadSchemas,
  SCIENTIFIC_REPORT_SCHEMA_ID,
  type SchemaIssue,
  type SchemaRepository,
} from "../lib/schema.js";
import { generationRootRoute } from "./routes.js";
import {
  reconcileSourceBindings,
  requestSourcesAreComplete,
  sourceBindingKey,
  trustedExtractionsFromRequest,
  validateRequestChunkIntegrity,
} from "./provenance.js";
import { validatePromptComposition } from "./prompts.js";
import type {
  GenerationExchangeResult,
  GenerationIssue,
  GenerationValidationOptions,
  TrustedExtractionRecord,
} from "./types.js";

export const GENERATION_REQUEST_SCHEMA_ID =
  "https://schemas.report-prompt.org/v1/generation-request.schema.json";
export const GENERATION_RESPONSE_SCHEMA_ID =
  "https://schemas.report-prompt.org/v1/generation-response.schema.json";

interface UnknownRecord {
  [key: string]: unknown;
}

function issue(code: string, message: string, path?: string): GenerationIssue {
  return path === undefined ? { code, message } : { code, message, path };
}

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function schemaRepository(options: GenerationValidationOptions): SchemaRepository {
  if (options.schemas !== undefined) return options.schemas;
  if (options.projectRoot !== undefined && options.schemasDirectory !== undefined) {
    return loadSchemas({ projectRoot: options.projectRoot, schemasDirectory: options.schemasDirectory });
  }
  if (options.projectRoot !== undefined) return loadSchemas({ projectRoot: options.projectRoot });
  if (options.schemasDirectory !== undefined) return loadSchemas({ schemasDirectory: options.schemasDirectory });
  return loadSchemas();
}

function schemaIssues(prefix: string, issues: readonly SchemaIssue[]): GenerationIssue[] {
  return issues.map((item) => issue(
    `${prefix}.${item.keyword}`,
    item.message,
    item.instancePointer === "" ? undefined : item.instancePointer,
  ));
}

function equalArray(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function objects(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is UnknownRecord => item !== null) : [];
}

function distinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function acceptedObjects(request: UnknownRecord): UnknownRecord[] {
  const state = record(request.accepted_state);
  return objects(state?.collections).flatMap((collection) => objects(collection.objects));
}

/** Ordered denominator owned by the request, never by the response. */
export function requestedGenerationUnitIds(requestValue: unknown): string[] {
  const request = record(requestValue);
  if (request === null) return [];
  const chunks = objects(request.input_chunks);
  if (chunks.length > 0) return chunks.map((chunk) => chunk.chunk_id).filter((id): id is string => typeof id === "string");

  const normalizationRoute = record(request.normalization_route);
  const inputResponse = record(normalizationRoute?.input_response);
  if (inputResponse !== null) {
    const processed = strings(inputResponse.processed_unit_ids);
    const omitted = strings(record(inputResponse.continuation)?.omitted_unit_ids);
    return [...processed, ...omitted];
  }

  const inventory = record(request.computational_work_inventory);
  const computationIds = objects(inventory?.key_computations)
    .map((item) => item.computation_id)
    .filter((id): id is string => typeof id === "string");
  if (computationIds.length > 0) return computationIds;

  const acceptedIds = acceptedObjects(request)
    .map((item) => item.object_id)
    .filter((id): id is string => typeof id === "string");
  if (acceptedIds.length > 0) return acceptedIds;
  return strings(record(request.source_universe)?.item_ids);
}

function validateAcceptedState(request: UnknownRecord): GenerationIssue[] {
  const issues: GenerationIssue[] = [];
  const state = record(request.accepted_state);
  if (state === null) return issues;
  const collections = Array.isArray(state.collections) ? state.collections : [];
  if (state.state_hash !== sha256CanonicalJson(collections)) {
    issues.push(issue("generation.accepted-state-hash", "accepted_state.state_hash does not hash the ordered collections.", "/accepted_state/state_hash"));
  }
  const collectionNames = new Set<string>();
  for (const [collectionIndex, collectionValue] of collections.entries()) {
    const collection = record(collectionValue);
    if (collection === null) continue;
    if (typeof collection.collection === "string") {
      if (collectionNames.has(collection.collection)) {
        issues.push(issue("generation.accepted-state-duplicate", `Accepted collection ${collection.collection} is repeated.`, `/accepted_state/collections/${collectionIndex}/collection`));
      }
      collectionNames.add(collection.collection);
    }
    const collectionObjects = Array.isArray(collection.objects) ? collection.objects : [];
    if (collection.collection_hash !== sha256CanonicalJson(collectionObjects)) {
      issues.push(issue("generation.accepted-collection-hash", "Accepted collection hash does not hash its ordered objects.", `/accepted_state/collections/${collectionIndex}/collection_hash`));
    }
    const objectIds = new Set<string>();
    for (const [objectIndex, objectValue] of collectionObjects.entries()) {
      const object = record(objectValue);
      if (object === null) continue;
      if (typeof object.object_id === "string") {
        if (objectIds.has(object.object_id)) {
          issues.push(issue("generation.accepted-object-duplicate", `Accepted object ${object.object_id} is repeated in its collection.`, `/accepted_state/collections/${collectionIndex}/objects/${objectIndex}/object_id`));
        }
        objectIds.add(object.object_id);
      }
      if (object.object_hash !== sha256CanonicalJson(object.body)) {
        issues.push(issue("generation.accepted-object-hash", "Accepted object hash does not match its complete body.", `/accepted_state/collections/${collectionIndex}/objects/${objectIndex}/object_hash`));
      }
    }
  }
  return issues;
}

function pointerValue(value: unknown, pointer: string): { found: boolean; value: unknown } {
  if (pointer === "") return { found: true, value };
  if (!pointer.startsWith("/")) return { found: false, value: undefined };
  let current = value;
  for (const encoded of pointer.slice(1).split("/")) {
    const token = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) return { found: false, value: undefined };
      const index = Number(token);
      if (index >= current.length) return { found: false, value: undefined };
      current = current[index];
      continue;
    }
    const item = record(current);
    if (item === null || !Object.prototype.hasOwnProperty.call(item, token)) return { found: false, value: undefined };
    current = item[token];
  }
  return { found: true, value: current };
}

function validatePremiseBindings(request: UnknownRecord, response: UnknownRecord): GenerationIssue[] {
  const issues: GenerationIssue[] = [];
  const state = record(request.accepted_state);
  if (state === null) return issues;
  const byKey = new Map<string, UnknownRecord>();
  for (const object of acceptedObjects(request)) {
    if (typeof object.object_type === "string" && typeof object.object_id === "string") {
      byKey.set(`${object.object_type}\u0000${object.object_id}`, object);
    }
  }
  for (const [operationIndex, operation] of objects(response.candidate_operations).entries()) {
    for (const [bindingIndex, binding] of objects(operation.premise_bindings).entries()) {
      const path = `/candidate_operations/${operationIndex}/premise_bindings/${bindingIndex}`;
      if (binding.accepted_state_snapshot_id !== state.state_snapshot_id || binding.accepted_state_hash !== state.state_hash) {
        issues.push(issue("generation.premise-state", "Premise binding does not identify the request's exact accepted-state snapshot/hash.", path));
        continue;
      }
      const premise = typeof binding.object_type === "string" && typeof binding.object_id === "string"
        ? byKey.get(`${binding.object_type}\u0000${binding.object_id}`)
        : undefined;
      if (premise === undefined
        || premise.object_version !== binding.object_version
        || premise.object_hash !== binding.object_hash) {
        issues.push(issue("generation.premise-object", "Premise binding does not match an exact accepted object type/ID/version/hash.", path));
        continue;
      }
      if (typeof binding.field_pointer !== "string" || !pointerValue(premise.body, binding.field_pointer).found) {
        issues.push(issue("generation.premise-pointer", "Premise field_pointer does not resolve in the accepted object body.", `${path}/field_pointer`));
      }
    }
  }
  return issues;
}

function validateRequestContinuation(
  request: UnknownRecord,
  requested: readonly string[],
  options: GenerationValidationOptions,
): GenerationIssue[] {
  const issues: GenerationIssue[] = [];
  const continuation = record(request.continuation);
  if (continuation === null || continuation.state === "initial") return issues;
  const cursor = record(continuation.cursor);
  const verification = record(continuation.orchestrator_verification);
  if (cursor === null || verification === null) return issues;
  const state = record(request.accepted_state);
  const snapshots = objects(record(request.source_universe)?.snapshot_references);
  const acceptedIds = strings(cursor.accepted_operation_ids);
  if (typeof cursor.token !== "string" || cursor.token_hash !== sha256(cursor.token)) {
    issues.push(issue("generation.continuation-token", "Resume cursor token_hash does not match the exact token bytes.", "/continuation/cursor/token_hash"));
  }
  if (verification.status !== "verified" || verification.verified_cursor_hash !== cursor.token_hash) {
    issues.push(issue("generation.continuation-verification", "Resume cursor lacks matching orchestrator verification.", "/continuation/orchestrator_verification"));
  }
  if (cursor.request_id !== request.request_id || cursor.stage !== request.stage || cursor.accepted_state_hash !== state?.state_hash) {
    issues.push(issue("generation.continuation-lineage", "Resume cursor request/stage/accepted-state lineage is stale or mismatched.", "/continuation/cursor"));
  }
  if (cursor.source_snapshot_set_hash !== sha256CanonicalJson(snapshots)) {
    issues.push(issue("generation.continuation-sources", "Resume cursor source snapshot set hash is stale or mismatched.", "/continuation/cursor/source_snapshot_set_hash"));
  }
  if (cursor.prior_response_hash !== continuation.prior_response_hash
    || cursor.operation_set_hash !== sha256CanonicalJson(acceptedIds)
    || !equalArray(acceptedIds, strings(continuation.accepted_operation_ids))) {
    issues.push(issue("generation.continuation-history", "Resume cursor prior-response or accepted-operation history is inconsistent.", "/continuation"));
  }
  if (!distinct(acceptedIds)) issues.push(issue("generation.continuation-history", "Resume cursor repeats an accepted operation ID.", "/continuation/cursor/accepted_operation_ids"));
  if (requested[0] !== cursor.next_unit_id) {
    issues.push(issue("RP-COMPLETE-001.resume-unit", "Resume cursor next_unit_id is not the request's first ordered unit.", "/continuation/cursor/next_unit_id"));
  }
  if (typeof cursor.nonce_usage_id === "string" && options.consumedContinuationNonces?.has(cursor.nonce_usage_id) === true) {
    issues.push(issue("generation.continuation-replay", "Resume cursor nonce has already been consumed.", "/continuation/cursor/nonce_usage_id"));
  }
  return issues;
}

function validateResponsePartition(request: UnknownRecord, response: UnknownRecord, requested: readonly string[]): GenerationIssue[] {
  const issues: GenerationIssue[] = [];
  const processed = strings(response.processed_unit_ids);
  const continuation = record(response.continuation);
  const omitted = strings(continuation?.omitted_unit_ids);
  if (!distinct(requested)) issues.push(issue("RP-COMPLETE-001.request-denominator", "Request-owned unit denominator contains duplicate IDs."));
  if (!distinct(processed) || !distinct(omitted)) {
    issues.push(issue("RP-COMPLETE-001.partition", "Processed and omitted unit lists must each contain unique IDs.", "/continuation"));
  }
  const overlap = processed.filter((id) => omitted.includes(id));
  if (overlap.length > 0) {
    issues.push(issue("RP-COMPLETE-001.partition", `Processed and omitted unit lists overlap at ${overlap.join(", ")}.`, "/continuation/omitted_unit_ids"));
  }
  if (!equalArray([...processed, ...omitted], requested)) {
    issues.push(issue(
      "RP-COMPLETE-001.partition",
      "processed_unit_ids followed by omitted_unit_ids must be the disjoint exact ordered partition of the request-owned denominator.",
      "/processed_unit_ids",
    ));
  }
  if (continuation?.state === "complete") {
    if (omitted.length !== 0 || !equalArray(processed, requested)) {
      issues.push(issue("RP-COMPLETE-001.complete", "A complete response must process every requested unit in request order and omit none.", "/continuation"));
    }
    if (!requestSourcesAreComplete(request)) {
      issues.push(issue("RP-COMPLETE-001.source-boundary", "A response cannot be complete while requested source extraction is truncated, gapped, degraded, or unverifiable.", "/continuation/state"));
    }
  } else if (continuation?.state === "truncated") {
    const cursor = record(continuation.next_cursor);
    const verification = record(continuation.orchestrator_verification);
    if (omitted.length === 0 || cursor?.next_unit_id !== omitted[0]) {
      issues.push(issue("RP-COMPLETE-001.cursor", "A truncated cursor must point to the first omitted unit.", "/continuation/next_cursor/next_unit_id"));
    }
    if (cursor?.request_id !== request.request_id || cursor?.stage !== request.stage || cursor?.accepted_state_hash !== record(request.accepted_state)?.state_hash) {
      issues.push(issue("generation.continuation-lineage", "Truncated cursor request/stage/accepted-state lineage is mismatched.", "/continuation/next_cursor"));
    }
    if (typeof cursor?.token !== "string" || cursor.token_hash !== sha256(cursor.token) || verification?.verified_cursor_hash !== cursor.token_hash || verification?.status !== "verified") {
      issues.push(issue("generation.continuation-verification", "Truncated cursor and orchestrator verification are not mutually hash-bound.", "/continuation"));
    }
  }
  return issues;
}

function isUnderRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function fullObjectValuePath(path: string, root: string, collection: boolean): boolean {
  if (!collection) return path === root;
  const suffix = path.slice(root.length + 1);
  return suffix === "-" || /^(?:0|[1-9][0-9]*)$/u.test(suffix);
}

function enabledDomainModules(request: UnknownRecord): Set<string> {
  return new Set(objects(request.enabled_modules)
    .filter((module) => module.status === "enabled" && module.module_id !== "core")
    .map((module) => module.module_id)
    .filter((id): id is string => typeof id === "string"));
}

function validateDomainPayload(
  request: UnknownRecord,
  operation: UnknownRecord,
  operationIndex: number,
  schemas: SchemaRepository,
): GenerationIssue[] {
  const issues: GenerationIssue[] = [];
  const value = record(operation.value);
  const path = `/candidate_operations/${operationIndex}`;
  if (operation.op !== "add" || operation.path !== "/extensions/domain_payloads/-") {
    issues.push(issue("RP-PACK-001.route", "Domain payload route permits only typed append operations at /extensions/domain_payloads/-.", path));
    return issues;
  }
  if (value === null || typeof value.domain !== "string") {
    issues.push(issue("RP-PACK-001.type", "Domain payload has no supported domain discriminator.", `${path}/value/domain`));
    return issues;
  }
  if (!enabledDomainModules(request).has(value.domain)) {
    issues.push(issue("RP-PACK-001.activation", `Domain ${value.domain} is not an enabled request module.`, `${path}/value/domain`));
  }
  const schemaId = DOMAIN_PACK_SCHEMA_IDS[value.domain as keyof typeof DOMAIN_PACK_SCHEMA_IDS];
  if (schemaId === undefined) {
    issues.push(issue("RP-PACK-001.type", `No compiled schema is registered for domain ${value.domain}.`, `${path}/value/domain`));
  } else {
    const result = schemas.validate(schemaId, value);
    issues.push(...schemaIssues("RP-PACK-001.schema", result.issues).map((item) => ({
      ...item,
      path: `${path}/value${item.path ?? ""}`,
    })));
  }
  if (value.payload_id !== operation.object_id) {
    issues.push(issue("RP-PACK-001.identity", "Domain payload_id must equal the operation object_id.", `${path}/object_id`));
  }
  return issues;
}

function validateRoutes(request: UnknownRecord, response: UnknownRecord, schemas: SchemaRepository): GenerationIssue[] {
  const issues: GenerationIssue[] = [];
  const requestedRoots = strings(request.permitted_patch_roots);
  const echoedRoots = strings(response.authorized_patch_roots);
  if (!equalArray(requestedRoots, echoedRoots)) {
    issues.push(issue("RP-AUTH-001.root-set", "authorized_patch_roots must exactly echo the request-owned permitted_patch_roots array.", "/authorized_patch_roots"));
  }
  const requestedTypes = new Set(strings(request.requested_object_types));
  for (const [operationIndex, operation] of objects(response.candidate_operations).entries()) {
    const path = `/candidate_operations/${operationIndex}`;
    if (typeof operation.authorized_root !== "string" || typeof operation.path !== "string" || typeof operation.object_type !== "string") continue;
    const route = generationRootRoute(operation.authorized_root);
    if (!requestedRoots.includes(operation.authorized_root) || !echoedRoots.includes(operation.authorized_root)) {
      issues.push(issue("RP-AUTH-001.operation-root", `Operation root ${operation.authorized_root} is not request-owned and exactly echoed.`, `${path}/authorized_root`));
    }
    if (route === undefined) {
      issues.push(issue("RP-AUTH-001.unknown-root", `Operation root ${operation.authorized_root} has no production target mapping.`, `${path}/authorized_root`));
      continue;
    }
    if (!isUnderRoot(operation.path, route.root)) {
      issues.push(issue("RP-AUTH-001.path", `Operation path ${operation.path} escapes authorized root ${route.root}.`, `${path}/path`));
    }
    if (operation.object_type !== route.objectType) {
      issues.push(issue("RP-AUTH-001.object-type", `Root ${route.root} maps only to object_type ${route.objectType}.`, `${path}/object_type`));
    }
    if (!requestedTypes.has(operation.object_type)) {
      issues.push(issue("RP-AUTH-001.unrequested-type", `Object type ${operation.object_type} was not requested.`, `${path}/object_type`));
    }
    if (route.root === "/extensions/domain_payloads") {
      issues.push(...validateDomainPayload(request, operation, operationIndex, schemas));
      continue;
    }
    if (route.targetSchemaPointer === null || !schemas.has(route.targetSchemaPointer)) {
      issues.push(issue("RP-AUTH-001.target-root", `Target schema has no resolvable route for ${route.root}.`, `${path}/authorized_root`));
      continue;
    }
    if (operation.op !== "remove" && fullObjectValuePath(operation.path, route.root, route.collection)) {
      const validation = schemas.validate(route.targetSchemaPointer, operation.value);
      issues.push(...schemaIssues("generation.operation-value-schema", validation.issues).map((item) => ({
        ...item,
        path: `${path}/value${item.path ?? ""}`,
      })));
      const body = record(operation.value);
      if (route.objectIdField !== null && body?.[route.objectIdField] !== operation.object_id) {
        issues.push(issue("generation.operation-identity", `${route.objectIdField} must equal operation object_id.`, `${path}/object_id`));
      }
    }
  }
  return issues;
}

function collectNestedSourceBindings(value: unknown, path: string, output: Array<{ bindings: unknown[]; path: string }>): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectNestedSourceBindings(item, `${path}/${index}`, output));
    return;
  }
  const item = record(value);
  if (item === null) return;
  if (typeof item.source_item_id === "string"
    && typeof item.source_snapshot_id === "string"
    && typeof item.excerpt_hash === "string"
    && Array.isArray(item.chunk_ids)
    && record(item.parser_identity) !== null) {
    output.push({ bindings: [item], path });
    return;
  }
  for (const [key, nested] of Object.entries(item)) {
    collectNestedSourceBindings(nested, `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`, output);
  }
}

function validateProvenance(
  request: UnknownRecord,
  response: UnknownRecord,
  trusted: readonly TrustedExtractionRecord[],
): GenerationIssue[] {
  const issues: GenerationIssue[] = [];
  const groups: Array<{ bindings: unknown[]; path: string }> = [];
  groups.push({ bindings: Array.isArray(response.source_bindings) ? response.source_bindings : [], path: "/source_bindings" });
  const topKeys = new Set((Array.isArray(response.source_bindings) ? response.source_bindings : [])
    .map(sourceBindingKey)
    .filter((key): key is string => key !== null));
  for (const [index, operation] of objects(response.candidate_operations).entries()) {
    const operationBindings = Array.isArray(operation.source_bindings) ? operation.source_bindings : [];
    groups.push({ bindings: operationBindings, path: `/candidate_operations/${index}/source_bindings` });
    for (const binding of operationBindings) {
      const key = sourceBindingKey(binding);
      if (key === null || !topKeys.has(key)) {
        issues.push(issue("RP-SOURCE-001.aggregate", "Every operation source binding must appear exactly in response.source_bindings.", `/candidate_operations/${index}/source_bindings`));
      }
    }
    collectNestedSourceBindings(operation.value, `/candidate_operations/${index}/value`, groups);
  }
  for (const group of groups) issues.push(...reconcileSourceBindings(group.bindings, trusted, group.path));

  const snapshots = objects(record(request.source_universe)?.snapshot_references);
  const itemIds = new Set(strings(record(request.source_universe)?.item_ids));
  const requestedChunkIds = new Set(objects(request.input_chunks)
    .map((chunk) => chunk.chunk_id)
    .filter((id): id is string => typeof id === "string"));
  for (const [index, extraction] of trusted.entries()) {
    if (!itemIds.has(extraction.source_item_id)) {
      issues.push(issue("RP-SOURCE-001.universe", "Trusted extraction source item is outside the request source universe.", `/trusted_extractions/${index}/source_item_id`));
    }
    if (!snapshots.some((snapshot) => snapshot.source_snapshot_id === extraction.source_snapshot_id && snapshot.registry_hash === extraction.snapshot_registry_hash)) {
      issues.push(issue("RP-SOURCE-001.registry", "Trusted extraction snapshot/registry tuple is absent from the request source universe.", `/trusted_extractions/${index}/snapshot_registry_hash`));
    }
    if (requestedChunkIds.size > 0 && extraction.chunk_ids.some((id) => !requestedChunkIds.has(id))) {
      issues.push(issue("RP-SOURCE-001.chunk", "Trusted extraction names a chunk outside this request.", `/trusted_extractions/${index}/chunk_ids`));
    }
  }
  return issues;
}

function validateDispositionReferences(response: UnknownRecord, trusted: readonly TrustedExtractionRecord[]): GenerationIssue[] {
  const issues: GenerationIssue[] = [];
  for (const field of ["excluded_items", "unreadable_items"] as const) {
    for (const [index, disposition] of objects(response[field]).entries()) {
      const reference = record(disposition.source_reference);
      if (reference === null) continue;
      const chunkIds = strings(reference.chunk_ids);
      const matches = trusted.some((extraction) => extraction.source_item_id === reference.source_item_id
        && extraction.source_snapshot_id === reference.source_snapshot_id
        && extraction.snapshot_registry_hash === reference.snapshot_registry_hash
        && extraction.content_hash === reference.content_hash
        && equalArray(extraction.chunk_ids, chunkIds)
        && canonicalJson(extraction.locator) === canonicalJson(reference.locator)
        && extraction.parser_identity.parser_result_id === reference.parser_result_id);
      if (!matches || disposition.item_id !== reference.source_item_id) {
        issues.push(issue("RP-SOURCE-001.disposition", "Disposition source reference does not reconcile to trusted extraction identity.", `/${field}/${index}/source_reference`));
      }
    }
  }
  return issues;
}

function deduplicateIssues(issues: readonly GenerationIssue[]): GenerationIssue[] {
  const seen = new Set<string>();
  return issues.filter((item) => {
    const key = `${item.code}\u0000${item.path ?? ""}\u0000${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Production request/response exchange gate. Structural schema success alone is
 * insufficient: this binds authorization, units, prompt bytes, state, lineage,
 * and source provenance before any candidate can be applied.
 */
export function validateGenerationExchange(
  requestValue: unknown,
  responseValue: unknown,
  options: GenerationValidationOptions = {},
): GenerationExchangeResult {
  const schemas = schemaRepository(options);
  const requestedUnitIds = requestedGenerationUnitIds(requestValue);
  const requestValidation = schemas.validate(GENERATION_REQUEST_SCHEMA_ID, requestValue);
  const responseValidation = schemas.validate(GENERATION_RESPONSE_SCHEMA_ID, responseValue);
  const issues: GenerationIssue[] = [
    ...schemaIssues("generation.request-schema", requestValidation.issues),
    ...schemaIssues("generation.response-schema", responseValidation.issues),
  ];
  const request = record(requestValue);
  const response = record(responseValue);
  if (request === null || response === null || !requestValidation.valid || !responseValidation.valid) {
    const unique = deduplicateIssues(issues);
    return { ok: false, valid: false, issues: unique, requestedUnitIds };
  }

  const composition = validatePromptComposition(
    request,
    options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot },
  );
  issues.push(...composition.issues);
  issues.push(...validateRequestChunkIntegrity(request));
  issues.push(...validateAcceptedState(request));

  if (response.request_id !== request.request_id) issues.push(issue("generation.request-id", "Response request_id does not match the request.", "/request_id"));
  if (response.request_contract_hash !== sha256CanonicalJson(request)) issues.push(issue("generation.request-hash", "Response request_contract_hash does not hash the exact request.", "/request_contract_hash"));
  if (response.prompt_contracts_hash !== request.prompt_contracts_hash) issues.push(issue("RP-COMPOSE-001.response-hash", "Response prompt_contracts_hash does not match the request bundle.", "/prompt_contracts_hash"));
  if (response.target_schema_id !== request.target_schema_id || response.target_schema_version !== request.target_schema_version) {
    issues.push(issue("generation.target", "Response target schema ID/version does not match the request.", "/target_schema_id"));
  }
  if (request.target_schema_id !== SCIENTIFIC_REPORT_SCHEMA_ID) {
    issues.push(issue("generation.target", `Production generation supports only ${SCIENTIFIC_REPORT_SCHEMA_ID}.`, "/target_schema_id"));
  }
  if (response.stage !== request.stage) issues.push(issue("generation.stage", "Response stage does not match the request.", "/stage"));
  if (response.accepted_state_hash !== record(request.accepted_state)?.state_hash) {
    issues.push(issue("generation.accepted-state", "Response accepted_state_hash does not match the request's exact accepted state.", "/accepted_state_hash"));
  }

  issues.push(...validateRequestContinuation(request, requestedUnitIds, options));
  issues.push(...validateResponsePartition(request, response, requestedUnitIds));
  issues.push(...validateRoutes(request, response, schemas));
  issues.push(...validatePremiseBindings(request, response));

  const priorOperationIds = new Set(strings(record(request.continuation)?.accepted_operation_ids));
  for (const [index, operation] of objects(response.candidate_operations).entries()) {
    if (typeof operation.operation_id === "string" && priorOperationIds.has(operation.operation_id)) {
      issues.push(issue("generation.continuation-duplicate-operation", "Current response repeats a previously accepted operation ID.", `/candidate_operations/${index}/operation_id`));
    }
  }

  const trusted = options.trustedExtractions ?? trustedExtractionsFromRequest(request);
  issues.push(...validateProvenance(request, response, trusted));
  issues.push(...validateDispositionReferences(response, trusted));

  const unique = deduplicateIssues(issues);
  const valid = unique.length === 0;
  return { ok: valid, valid, issues: unique, requestedUnitIds };
}

export const preflightGenerationExchange = validateGenerationExchange;
export const validateGenerationRequestResponse = validateGenerationExchange;
