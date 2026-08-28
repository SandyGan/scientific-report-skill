import { sha256CanonicalJson } from "../lib/hash.js";
import { canonicalJson } from "../lib/json.js";
import {
  DOMAIN_PACK_SCHEMA_IDS,
  loadSchemas,
  SCIENTIFIC_REPORT_SCHEMA_ID,
  type SchemaRepository,
} from "../lib/schema.js";
import type { ScientificReport } from "../lib/types.js";
import { validateGenerationExchange } from "./exchange.js";
import { generationRootRoute } from "./routes.js";
import type {
  GenerationApplyResult,
  GenerationIssue,
  GenerationValidationOptions,
  RootRoute,
} from "./types.js";

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

function objects(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is UnknownRecord => item !== null) : [];
}

function repository(options: GenerationValidationOptions): SchemaRepository {
  if (options.schemas !== undefined) return options.schemas;
  if (options.projectRoot !== undefined && options.schemasDirectory !== undefined) {
    return loadSchemas({ projectRoot: options.projectRoot, schemasDirectory: options.schemasDirectory });
  }
  if (options.projectRoot !== undefined) return loadSchemas({ projectRoot: options.projectRoot });
  if (options.schemasDirectory !== undefined) return loadSchemas({ schemasDirectory: options.schemasDirectory });
  return loadSchemas();
}

function decodePointer(path: string): string[] | null {
  if (path === "") return [];
  if (!path.startsWith("/")) return null;
  const tokens: string[] = [];
  for (const encoded of path.slice(1).split("/")) {
    if (/~(?:[^01]|$)/u.test(encoded)) return null;
    const token = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (["__proto__", "prototype", "constructor"].includes(token)) return null;
    tokens.push(token);
  }
  return tokens;
}

function valueAt(root: unknown, tokens: readonly string[]): { found: boolean; value: unknown } {
  let current = root;
  for (const token of tokens) {
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

function objectVersion(value: unknown, route: RootRoute): string | null {
  const item = record(value);
  if (item === null) return null;
  if (typeof item.object_version === "string") return item.object_version;
  const direct = `${route.objectType}_version`;
  if (typeof item[direct] === "string") return item[direct];
  const candidates = Object.entries(item)
    .filter(([key, candidate]) => key.endsWith("_version")
      && !["schema_version", "protocol_version", "pack_version"].includes(key)
      && typeof candidate === "string")
    .map(([, candidate]) => candidate as string);
  return candidates.length === 1 ? candidates[0]! : null;
}

function routeTokens(route: RootRoute): string[] {
  return decodePointer(route.root) ?? [];
}

function containingObject(target: unknown, pathTokens: readonly string[], route: RootRoute): unknown {
  if (!route.collection) return valueAt(target, routeTokens(route)).value;
  const rootTokens = routeTokens(route);
  const indexToken = pathTokens[rootTokens.length];
  if (indexToken === undefined || indexToken === "-" || !/^(?:0|[1-9][0-9]*)$/u.test(indexToken)) return undefined;
  return valueAt(target, [...rootTokens, indexToken]).value;
}

function checkOperationAgainstTarget(
  target: unknown,
  operation: UnknownRecord,
  operationIndex: number,
  route: RootRoute,
): GenerationIssue[] {
  const issues: GenerationIssue[] = [];
  const path = `/candidate_operations/${operationIndex}`;
  if (typeof operation.path !== "string") return issues;
  const tokens = decodePointer(operation.path);
  if (tokens === null) {
    issues.push(issue("generation.apply-pointer", "Operation path is not a safe RFC 6901 pointer.", `${path}/path`));
    return issues;
  }
  const existingObject = containingObject(target, tokens, route);
  const existingRecord = record(existingObject);
  if (operation.op === "add") {
    if (operation.base_object_version !== null) {
      issues.push(issue("generation.apply-base-version", "Add operations must not assert an existing base object version.", `${path}/base_object_version`));
    }
    if (route.collection) {
      const rootValue = valueAt(target, routeTokens(route)).value;
      if (Array.isArray(rootValue) && route.objectIdField !== null
        && rootValue.some((entry) => record(entry)?.[route.objectIdField!] === operation.object_id)) {
        issues.push(issue("generation.apply-id-collision", `Object ID ${String(operation.object_id)} already exists at ${route.root}.`, `${path}/object_id`));
      }
    }
    const proposed = objectVersion(operation.value, route);
    if (proposed !== null && proposed !== operation.proposed_object_version) {
      issues.push(issue("generation.apply-proposed-version", "Operation proposed_object_version does not match the added object body.", `${path}/proposed_object_version`));
    }
    return issues;
  }
  if (existingObject === undefined) {
    issues.push(issue("generation.apply-target", "Operation does not resolve to an existing target object.", `${path}/path`));
    return issues;
  }
  if (route.objectIdField !== null && existingRecord?.[route.objectIdField] !== operation.object_id) {
    issues.push(issue("generation.apply-identity", "Operation object_id does not match the existing target object at its path.", `${path}/object_id`));
  }
  const existingVersion = objectVersion(existingObject, route);
  if (existingVersion === null || operation.base_object_version !== existingVersion) {
    issues.push(issue("generation.apply-base-version", "Operation base_object_version does not match the existing target object.", `${path}/base_object_version`));
  }
  if (operation.op === "replace" && operation.path === `${route.root}/${tokens.at(-1) ?? ""}`) {
    const proposed = objectVersion(operation.value, route);
    if (proposed !== null && proposed !== operation.proposed_object_version) {
      issues.push(issue("generation.apply-proposed-version", "Operation proposed_object_version does not match the replacement body.", `${path}/proposed_object_version`));
    }
  }
  return issues;
}

function ensureDomainPayloadCollection(target: UnknownRecord): void {
  const extensions = record(target.extensions);
  if (extensions === null) throw new TypeError("Canonical report extensions must be an object");
  if (extensions.domain_payloads === undefined) extensions.domain_payloads = [];
  if (!Array.isArray(extensions.domain_payloads)) throw new TypeError("Reserved extensions.domain_payloads must be an array");
}

function applyOne(target: UnknownRecord, operation: UnknownRecord): void {
  if (typeof operation.path !== "string" || typeof operation.op !== "string") throw new TypeError("Malformed candidate operation");
  if (operation.authorized_root === "/extensions/domain_payloads") ensureDomainPayloadCollection(target);
  const tokens = decodePointer(operation.path);
  if (tokens === null || tokens.length === 0) throw new TypeError(`Unsafe or root-document operation path: ${operation.path}`);
  const parentResult = valueAt(target, tokens.slice(0, -1));
  if (!parentResult.found) throw new RangeError(`Operation parent does not exist: ${operation.path}`);
  const parent = parentResult.value;
  const leaf = tokens.at(-1)!;
  if (Array.isArray(parent)) {
    if (operation.op === "add") {
      if (leaf === "-") parent.push(structuredClone(operation.value));
      else {
        if (!/^(?:0|[1-9][0-9]*)$/u.test(leaf) || Number(leaf) > parent.length) throw new RangeError(`Invalid array insertion: ${operation.path}`);
        parent.splice(Number(leaf), 0, structuredClone(operation.value));
      }
      return;
    }
    if (!/^(?:0|[1-9][0-9]*)$/u.test(leaf) || Number(leaf) >= parent.length) throw new RangeError(`Array target does not exist: ${operation.path}`);
    const index = Number(leaf);
    if (operation.op === "replace") parent[index] = structuredClone(operation.value);
    else if (operation.op === "remove") parent.splice(index, 1);
    else if (operation.op === "test" && canonicalJson(parent[index]) !== canonicalJson(operation.value)) throw new Error(`JSON Patch test failed: ${operation.path}`);
    else if (!['replace', 'remove', 'test'].includes(operation.op)) throw new TypeError(`Unsupported operation ${operation.op}`);
    return;
  }
  const parentObject = record(parent);
  if (parentObject === null) throw new TypeError(`Operation parent is not a container: ${operation.path}`);
  const exists = Object.prototype.hasOwnProperty.call(parentObject, leaf);
  if (operation.op === "add") parentObject[leaf] = structuredClone(operation.value);
  else if (operation.op === "replace") {
    if (!exists) throw new RangeError(`Replace target does not exist: ${operation.path}`);
    parentObject[leaf] = structuredClone(operation.value);
  } else if (operation.op === "remove") {
    if (!exists) throw new RangeError(`Remove target does not exist: ${operation.path}`);
    delete parentObject[leaf];
  } else if (operation.op === "test") {
    if (!exists || canonicalJson(parentObject[leaf]) !== canonicalJson(operation.value)) throw new Error(`JSON Patch test failed: ${operation.path}`);
  } else throw new TypeError(`Unsupported operation ${operation.op}`);
}

function validateBaseReport(request: UnknownRecord, target: UnknownRecord): GenerationIssue[] {
  const issues: GenerationIssue[] = [];
  if (target.report_id !== request.report_id) issues.push(issue("generation.apply-report", "Target report_id does not match the request.", "/report_id"));
  if (target.project_id !== request.project_id) issues.push(issue("generation.apply-project", "Target project_id does not match the request.", "/project_id"));
  if (target.schema_version !== request.target_schema_version) issues.push(issue("generation.apply-schema-version", "Target report schema_version does not match the requested target version.", "/schema_version"));
  if (typeof request.base_report_version === "string") {
    if (target.report_version !== request.base_report_version) issues.push(issue("generation.apply-report-version", "Target report_version does not match base_report_version.", "/report_version"));
    if (request.base_payload_hash !== sha256CanonicalJson(target)) issues.push(issue("generation.apply-payload-hash", "Target report does not match base_payload_hash.", "/base_payload_hash"));
  }
  return issues;
}

function validateAppliedDomainPayloads(target: UnknownRecord, schemas: SchemaRepository): GenerationIssue[] {
  const payloads = record(target.extensions)?.domain_payloads;
  if (payloads === undefined) return [];
  if (!Array.isArray(payloads)) return [issue("RP-PACK-001.persist", "Reserved extensions.domain_payloads is not an array.", "/extensions/domain_payloads")];
  const issues: GenerationIssue[] = [];
  const ids = new Set<string>();
  for (const [index, payloadValue] of payloads.entries()) {
    const payload = record(payloadValue);
    if (payload === null || typeof payload.domain !== "string" || typeof payload.payload_id !== "string") {
      issues.push(issue("RP-PACK-001.persist", "Persisted domain payload lacks typed domain/payload identity.", `/extensions/domain_payloads/${index}`));
      continue;
    }
    if (ids.has(payload.payload_id)) issues.push(issue("RP-PACK-001.persist", `Domain payload_id ${payload.payload_id} is repeated.`, `/extensions/domain_payloads/${index}/payload_id`));
    ids.add(payload.payload_id);
    const schemaId = DOMAIN_PACK_SCHEMA_IDS[payload.domain as keyof typeof DOMAIN_PACK_SCHEMA_IDS];
    if (schemaId === undefined || !schemas.validate(schemaId, payload).valid) {
      issues.push(issue("RP-PACK-001.persist", `Persisted ${payload.domain} payload does not pass its canonical pack schema.`, `/extensions/domain_payloads/${index}`));
    }
  }
  return issues;
}

/** Atomically apply a response only after the complete production exchange gate. */
export function applyGenerationResponse(
  requestValue: unknown,
  responseValue: unknown,
  targetValue: unknown,
  options: GenerationValidationOptions = {},
): GenerationApplyResult {
  const exchange = validateGenerationExchange(requestValue, responseValue, options);
  if (!exchange.valid) return exchange;
  const schemas = repository(options);
  const targetValidation = schemas.validate<ScientificReport>(SCIENTIFIC_REPORT_SCHEMA_ID, targetValue);
  if (!targetValidation.valid) {
    const issues = targetValidation.issues.map((item) => issue(`generation.target-schema.${item.keyword}`, item.message, item.instancePointer));
    return { ok: false, valid: false, issues, requestedUnitIds: exchange.requestedUnitIds };
  }
  const request = record(requestValue)!;
  const response = record(responseValue)!;
  const target = structuredClone(targetValue) as UnknownRecord;
  const issues = validateBaseReport(request, target);
  const operationIds = new Set<string>();
  for (const [index, operation] of objects(response.candidate_operations).entries()) {
    if (typeof operation.operation_id === "string") {
      if (operationIds.has(operation.operation_id)) issues.push(issue("generation.apply-operation-id", "Candidate operation_id is repeated.", `/candidate_operations/${index}/operation_id`));
      operationIds.add(operation.operation_id);
    }
    if (typeof operation.authorized_root !== "string") continue;
    const route = generationRootRoute(operation.authorized_root);
    if (route !== undefined) issues.push(...checkOperationAgainstTarget(target, operation, index, route));
  }
  if (issues.length > 0) return { ok: false, valid: false, issues, requestedUnitIds: exchange.requestedUnitIds };

  try {
    for (const operation of objects(response.candidate_operations)) applyOne(target, operation);
  } catch (error) {
    return {
      ok: false,
      valid: false,
      issues: [issue("generation.apply-atomic", error instanceof Error ? error.message : String(error))],
      requestedUnitIds: exchange.requestedUnitIds,
    };
  }

  const finalSchema = schemas.validate<ScientificReport>(SCIENTIFIC_REPORT_SCHEMA_ID, target);
  const finalIssues = [
    ...finalSchema.issues.map((item) => issue(`generation.applied-schema.${item.keyword}`, item.message, item.instancePointer)),
    ...validateAppliedDomainPayloads(target, schemas),
  ];
  if (finalIssues.length > 0) return { ok: false, valid: false, issues: finalIssues, requestedUnitIds: exchange.requestedUnitIds };
  return {
    ok: true,
    valid: true,
    issues: [],
    requestedUnitIds: exchange.requestedUnitIds,
    report: target as unknown as ScientificReport,
  };
}

export const preflightAndApplyGenerationResponse = applyGenerationResponse;
export const applyGenerationExchange = applyGenerationResponse;
