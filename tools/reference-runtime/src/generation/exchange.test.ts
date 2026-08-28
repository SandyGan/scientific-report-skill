import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { sha256, sha256CanonicalJson } from "../lib/hash.js";
import { loadSchemas } from "../lib/schema.js";
import type { ScientificReport, SourceBinding } from "../lib/types.js";
import { validateDomainPacks } from "../validator/domain.js";
import { baseReport } from "../../tests/fixtures/base-report.js";
import { failedRetryReport } from "../../tests/fixtures/execution-scenarios.js";
import {
  applyGenerationResponse,
  normalizeS2Response,
  S3_NORMALIZER_HASH,
  S3_NORMALIZER_ID,
  S3_NORMALIZER_VERSION,
  S3_PROFILE_HASH,
  S3_PROFILE_ID,
  S3_PROFILE_VERSION,
  trustedExtractionsFromRequest,
  validateGenerationExchange,
  validatePromptComposition,
} from "./index.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const PROMPT_ROOT = join(PROJECT_ROOT, "prompts");
const RESPONSE_SCHEMA_ID = "https://schemas.report-prompt.org/v1/generation-response.schema.json";
const REPORT_SCHEMA_ID = "https://schemas.report-prompt.org/v1/scientific-report.schema.json";
const NOW = "2026-08-26T00:00:00Z";

type JsonRecord = Record<string, any>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function json(path: string): Promise<JsonRecord> {
  return JSON.parse(await readFile(path, "utf8")) as JsonRecord;
}

async function examples(): Promise<{ request: JsonRecord; response: JsonRecord }> {
  return {
    request: await json(join(PROMPT_ROOT, "contracts", "request.example.json")),
    response: await json(join(PROMPT_ROOT, "contracts", "response.example.json")),
  };
}

function rebind(request: JsonRecord, response: JsonRecord): void {
  response.request_id = request.request_id;
  response.request_contract_hash = sha256CanonicalJson(request);
  response.prompt_contracts_hash = request.prompt_contracts_hash;
  response.target_schema_id = request.target_schema_id;
  response.target_schema_version = request.target_schema_version;
  response.authorized_patch_roots = clone(request.permitted_patch_roots);
  response.accepted_state_hash = request.accepted_state.state_hash;
  response.stage = request.stage;
}

function candidateReviewResponse(response: JsonRecord): JsonRecord {
  const result = clone(response);
  const task = clone(result.review_tasks[0]);
  task.review_task_id = "review:exchange:adverse-authorization";
  const operationId = "operation:exchange:review";
  result.status = "needs_review";
  result.cannot_complete_reason = null;
  result.candidate_operations = [{
    operation_id: operationId,
    op: "add",
    object_type: "review_task",
    object_id: task.review_task_id,
    base_object_version: null,
    authorized_root: "/review_tasks",
    path: "/review_tasks/-",
    value: task,
    proposed_object_version: "1.0.0",
    provenance_kind: "source_derived",
    source_bindings: clone(result.source_bindings),
    premise_bindings: [],
    rationale: "The bounded adverse-record authorization gap requires orchestration review.",
    requires_human_confirmation: true,
  }];
  result.review_tasks = [task];
  result.forbidden_inferences_detected[0].affected_operation_ids = [operationId];
  result.forbidden_inferences_detected[0].disposition = "converted_to_review_task";
  return result;
}

function replaceOperationBinding(response: JsonRecord, mutate: (binding: JsonRecord) => void): void {
  const binding = clone(response.source_bindings[0]);
  mutate(binding);
  response.source_bindings = [binding];
  response.candidate_operations[0].source_bindings = [clone(binding)];
}

function secondCompleteChunk(request: JsonRecord): JsonRecord {
  const chunk = clone(request.input_chunks[0]);
  const content = "A second registered source unit records no additional scientific facts.";
  chunk.chunk_id = "chunk:second-source:0";
  chunk.source_item_id = "source:second-source";
  chunk.source_snapshot_id = "snapshot:second-source";
  chunk.snapshot_registry_hash = sha256("second registry");
  chunk.content_hash = sha256(content);
  chunk.chunk_content_hash = sha256(content);
  chunk.source_extent.start = 0;
  chunk.source_extent.end_exclusive = Array.from(content).length;
  chunk.source_extent.total = Array.from(content).length;
  chunk.sequence.index = 0;
  chunk.sequence.count = 1;
  chunk.sequence.previous_chunk_id = null;
  chunk.sequence.next_chunk_id = null;
  chunk.parser_result.parser_result_id = "parser-result:second-source:0";
  chunk.stable_sub_item.sub_item_id = "subitem:second-source:whole";
  chunk.stable_sub_item.index = 0;
  chunk.stable_sub_item.count = 1;
  chunk.content = content;
  request.source_universe.item_ids.push(chunk.source_item_id);
  request.source_universe.snapshot_references.push({
    source_snapshot_id: chunk.source_snapshot_id,
    registry_hash: chunk.snapshot_registry_hash,
  });
  return chunk;
}

function truncatedCursor(request: JsonRecord, nextUnitId: string): { cursor: JsonRecord; verification: JsonRecord } {
  const token = "opaque.signed.exchange.cursor";
  const acceptedOperationIds: string[] = [];
  const cursor = {
    token,
    token_hash: sha256(token),
    lineage_id: "lineage:exchange",
    page_index: 1,
    request_id: request.request_id,
    stage: request.stage,
    accepted_state_hash: request.accepted_state.state_hash,
    source_snapshot_set_hash: sha256CanonicalJson(request.source_universe.snapshot_references),
    prior_response_hash: sha256("prior exchange response"),
    accepted_operation_ids: acceptedOperationIds,
    operation_set_hash: sha256CanonicalJson(acceptedOperationIds),
    next_unit_id: nextUnitId,
    nonce_usage_id: "nonce-use:exchange:1",
  };
  return {
    cursor,
    verification: {
      status: "verified",
      verification_method: "signed_token",
      verifier_id: "orchestrator:exchange-test",
      verified_cursor_hash: cursor.token_hash,
      verified_at: NOW,
      expires_at: null,
    },
  };
}

async function setStagePrompt(request: JsonRecord, stage: string, id: string, path: string): Promise<void> {
  const bytes = await readFile(join(PROMPT_ROOT, path));
  const version = /^-\s+\*\*Version:\*\*\s+`([^`]+)`\s*$/mu.exec(bytes.toString("utf8"))?.[1];
  if (version === undefined) throw new Error(`No version in ${path}`);
  const index = request.prompt_contracts.findIndex((entry: JsonRecord) => String(entry.contract_id).startsWith("report_prompt.stage."));
  request.stage = stage;
  request.prompt_contracts[index] = {
    contract_id: id,
    contract_path: path,
    contract_version: version,
    contract_hash: sha256(bytes),
  };
  request.prompt_contracts_hash = sha256CanonicalJson(request.prompt_contracts);
}

function replaceAllBindings(value: unknown, binding: SourceBinding): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => replaceAllBindings(entry, binding));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const item = value as JsonRecord;
  if (typeof item.source_item_id === "string"
    && typeof item.source_snapshot_id === "string"
    && typeof item.excerpt_hash === "string"
    && Array.isArray(item.chunk_ids)
    && item.parser_identity !== undefined) {
    for (const key of Object.keys(item)) delete item[key];
    Object.assign(item, clone(binding));
    return;
  }
  if (Array.isArray(item.source_bindings)) item.source_bindings = [clone(binding)];
  Object.values(item).forEach((entry) => replaceAllBindings(entry, binding));
}

function versionOf(value: JsonRecord): string {
  const candidates = Object.entries(value)
    .filter(([key, entry]) => key.endsWith("_version") && !["schema_version", "protocol_version", "pack_version"].includes(key) && typeof entry === "string")
    .map(([, entry]) => entry as string);
  if (typeof value.object_version === "string") return value.object_version;
  if (candidates.length !== 1) throw new Error(`Fixture has ambiguous version fields: ${candidates.join(",")}`);
  return candidates[0]!;
}

function sourceReference(request: JsonRecord): JsonRecord {
  const chunk = request.input_chunks[0];
  return {
    source_item_id: chunk.source_item_id,
    source_snapshot_id: chunk.source_snapshot_id,
    snapshot_registry_hash: chunk.snapshot_registry_hash,
    content_identity_status: "known",
    content_hash: chunk.content_hash,
    chunk_ids: [chunk.chunk_id],
    locator: clone(chunk.locator),
    parser_result_id: chunk.parser_result.parser_result_id,
  };
}

describe("production generation exchange", () => {
  it("[RP-SOURCE-001] reconciles every provenance identity and recomputes excerpt hashes from trusted bytes/spans", async () => {
    const { request, response: published } = await examples();
    const response = candidateReviewResponse(published);
    expect(validateGenerationExchange(request, response)).toMatchObject({ valid: true, issues: [] });

    const mutations: Array<[string, (binding: JsonRecord) => void]> = [
      ["out-of-bounds locator", (binding) => { binding.locator = { ...binding.locator, locator_type: "line_range", value: "9999-10000" }; }],
      ["unrelated registry", (binding) => { binding.snapshot_registry_hash = sha256("unrelated registry"); }],
      ["invented excerpt", (binding) => { binding.excerpt_hash = sha256("invented excerpt"); }],
      ["nonexistent chunk", (binding) => { binding.chunk_ids = ["chunk:does-not-exist"]; }],
      ["invented parser", (binding) => { binding.parser_identity.parser_result_id = "parser-result:invented"; }],
    ];
    for (const [label, mutate] of mutations) {
      const invalid = clone(response);
      replaceOperationBinding(invalid, mutate);
      const result = validateGenerationExchange(request, invalid);
      expect(result.valid, label).toBe(false);
      expect(result.issues.some((entry) => entry.code.startsWith("RP-SOURCE-001")), label).toBe(true);
    }

    const trusted = trustedExtractionsFromRequest(request);
    expect(trusted.some((entry) => entry.binding_scope === "whole_source"
      && sha256(entry.excerpt) === response.source_bindings[0].excerpt_hash
      && entry.source_extent.start === 0
      && entry.source_extent.end_exclusive === Array.from(request.input_chunks[0].content).length)).toBe(true);
  });

  it("[RP-COMPLETE-001] requires an exact ordered unit partition and the first-omitted cursor", async () => {
    const { request, response: published } = await examples();
    request.input_chunks.push(secondCompleteChunk(request));
    const response = candidateReviewResponse(published);
    rebind(request, response);
    const incomplete = validateGenerationExchange(request, response);
    expect(incomplete.valid).toBe(false);
    expect(incomplete.issues.some((entry) => entry.code === "RP-COMPLETE-001.partition")).toBe(true);

    response.processed_unit_ids = request.input_chunks.map((chunk: JsonRecord) => chunk.chunk_id);
    expect(validateGenerationExchange(request, response)).toMatchObject({ valid: true, issues: [] });

    const { cursor, verification } = truncatedCursor(request, request.input_chunks[1].chunk_id);
    response.processed_unit_ids = [request.input_chunks[0].chunk_id];
    response.continuation = {
      state: "truncated",
      omitted_unit_ids: [request.input_chunks[1].chunk_id],
      next_cursor: cursor,
      orchestrator_verification: verification,
    };
    expect(validateGenerationExchange(request, response)).toMatchObject({ valid: true, issues: [] });

    response.continuation.next_cursor.next_unit_id = request.input_chunks[0].chunk_id;
    const wrongCursor = validateGenerationExchange(request, response);
    expect(wrongCursor.valid).toBe(false);
    expect(wrongCursor.issues.some((entry) => entry.code === "RP-COMPLETE-001.cursor")).toBe(true);
  });

  it("[RP-AUTH-001] rejects response-owned roots and enforces target/root/object-type mapping", async () => {
    const { request, response: published } = await examples();
    const positive = candidateReviewResponse(published);
    expect(validateGenerationExchange(request, positive)).toMatchObject({ valid: true, issues: [] });

    const injected = clone(positive);
    injected.authorized_patch_roots.push("/claims");
    injected.candidate_operations[0].authorized_root = "/claims";
    injected.candidate_operations[0].path = "/claims/-";
    injected.candidate_operations[0].object_type = "claim";
    const result = validateGenerationExchange(request, injected);
    expect(result.valid).toBe(false);
    expect(result.issues.some((entry) => entry.code.startsWith("RP-AUTH-001"))).toBe(true);
  });

  it("[RP-COMPOSE-001] requires exact core, stage, and enabled-pack current tuples with unique IDs", async () => {
    const { request } = await examples();
    expect(validatePromptComposition(request)).toMatchObject({ valid: true, issues: [] });

    const omitted = clone(request);
    const integrity = clone(omitted.prompt_contracts.find((entry: JsonRecord) => entry.contract_id === "report_prompt.core.scientific_integrity"));
    for (const missingId of ["report_prompt.core.untrusted_input_boundary", "report_prompt.pack.wet_lab"]) {
      const index = omitted.prompt_contracts.findIndex((entry: JsonRecord) => entry.contract_id === missingId);
      omitted.prompt_contracts[index] = clone(integrity);
    }
    omitted.prompt_contracts_hash = sha256CanonicalJson(omitted.prompt_contracts);
    const result = validatePromptComposition(omitted);
    expect(result.valid).toBe(false);
    expect(result.issues.some((entry) => entry.code === "RP-COMPOSE-001.duplicate")).toBe(true);
    expect(result.issues.filter((entry) => entry.code === "RP-COMPOSE-001.missing")).toHaveLength(2);

    const stale = clone(request);
    stale.prompt_contracts[0].contract_hash = sha256("stale prompt bytes");
    stale.prompt_contracts_hash = sha256CanonicalJson(stale.prompt_contracts);
    expect(validatePromptComposition(stale).issues.some((entry) => entry.code === "RP-COMPOSE-001.stale")).toBe(true);
  });

  it("[RP-NEGATIVE-001] publishes a cannot_complete adverse example when request-owned roots cannot preserve the records", async () => {
    const { request, response } = await examples();
    expect(validateGenerationExchange(request, response)).toMatchObject({ valid: true, issues: [] });
    expect(response.status).toBe("cannot_complete");
    expect(response.candidate_operations).toEqual([]);
    expect(response.extensions.scientific_extraction_complete).toBe(false);
    const text = `${response.cannot_complete_reason} ${response.review_tasks[0].description}`.toLowerCase();
    for (const required of ["attempt", "failed positive control", "no-signal", "exclusion", "planned", "withholding"]) {
      expect(text).toContain(required);
    }
  });

  it("[RP-PACK-001] applies one schema-typed payload through only the reserved nested route and passes PACK001", async () => {
    const { request, response: published } = await examples();
    const sourceReport = failedRetryReport(true);
    const payloadSource = await json(join(PROJECT_ROOT, "examples", "cross-domain", "scientific-report.json"));
    const payload = clone(payloadSource.extensions.domain_payloads[0]);
    const binding = clone(published.source_bindings[0]) as SourceBinding;
    replaceAllBindings(payload, binding);

    const target = baseReport() as ScientificReport;
    target.applicability_decisions.push(clone(request.applicability_decisions.find((entry: JsonRecord) => entry.target_pointer_or_section_id === "wet_lab")));
    target.module_manifest.push(clone(request.enabled_modules.find((entry: JsonRecord) => entry.module_id === "wet_lab")));
    request.report_id = target.report_id;
    request.project_id = target.project_id;
    request.base_report_version = target.report_version;
    request.base_payload_hash = sha256CanonicalJson(target);
    request.permitted_patch_roots = ["/extensions/domain_payloads"];
    request.requested_object_types = ["domain_payload"];

    const response = clone(published);
    response.status = "ok";
    response.cannot_complete_reason = null;
    response.candidate_operations = [{
      operation_id: "operation:add:wet-lab-payload",
      op: "add",
      object_type: "domain_payload",
      object_id: payload.payload_id,
      base_object_version: null,
      authorized_root: "/extensions/domain_payloads",
      path: "/extensions/domain_payloads/-",
      value: payload,
      proposed_object_version: payload.pack_version,
      provenance_kind: "source_derived",
      source_bindings: [binding],
      premise_bindings: [],
      rationale: "The typed wet-lab payload preserves the source-bounded domain records.",
      requires_human_confirmation: true,
    }];
    response.review_tasks = [];
    response.forbidden_inferences_detected = [];
    rebind(request, response);

    const applied = applyGenerationResponse(request, response, target);
    expect(applied.issues).toEqual([]);
    expect(applied.valid).toBe(true);
    expect((applied.report!.extensions as JsonRecord).domain_payloads).toEqual([payload]);
    const pack = validateDomainPacks({
      report: applied.report!,
      ruleSet: {
        overlays: [{
          domain: "wet_lab",
          payload_schema_id: "https://schemas.report-prompt.org/v1/packs/wet-lab.schema.json",
          applicability: {
            module_manifest_token: "wet_lab",
            payload_discriminator_value: "wet_lab",
          },
        }],
      },
    } as any, loadSchemas());
    expect(pack.findings).toEqual([]);

    const arbitrary = clone(request);
    arbitrary.permitted_patch_roots = ["/extensions"];
    rebind(arbitrary, response);
    expect(validateGenerationExchange(arbitrary, response).valid).toBe(false);

    const invalidPayload = clone(response);
    delete invalidPayload.candidate_operations[0].value.specimen_records;
    expect(validateGenerationExchange(request, invalidPayload).valid).toBe(false);
  });

  it("[RP-ROUTE-001] deterministically preserves S2 failures, negative results, exclusions, missingness, provenance, and continuation", async () => {
    const { request: sourceRequest, response: published } = await examples();
    const trusted = trustedExtractionsFromRequest(sourceRequest);
    const binding = clone(published.source_bindings[0]) as SourceBinding;
    const execution = failedRetryReport(true);
    const records: Array<{ root: string; type: string; idField: string; value: JsonRecord }> = [
      { root: "/attempts", type: "attempt", idField: "attempt_id", value: clone(execution.attempts[0]) as JsonRecord },
      { root: "/failures", type: "failure", idField: "failure_event_id", value: clone(execution.failures[0]) as JsonRecord },
      { root: "/results", type: "result", idField: "result_id", value: clone(execution.results[0]) as JsonRecord },
    ];
    records[2]!.value.statement = "The bounded failed attempt produced a directionally negative finding.";
    records[2]!.value.scientific_effect_class = "decrease";
    records.forEach((entry) => replaceAllBindings(entry.value, binding));

    const inputResponse = clone(published);
    inputResponse.status = "needs_review";
    inputResponse.cannot_complete_reason = null;
    inputResponse.authorized_patch_roots = records.map((entry) => entry.root);
    inputResponse.candidate_operations = records.map((entry, index) => ({
      operation_id: `operation:s2:${entry.type}`,
      op: "add",
      object_type: entry.type,
      object_id: entry.value[entry.idField],
      base_object_version: null,
      authorized_root: entry.root,
      path: `${entry.root}/-`,
      value: entry.value,
      proposed_object_version: versionOf(entry.value),
      provenance_kind: "source_derived",
      source_bindings: [clone(binding)],
      premise_bindings: [],
      rationale: `Preserve the source-bounded ${entry.type} record.`,
      requires_human_confirmation: false,
    }));
    inputResponse.excluded_items = [{
      item_id: sourceRequest.input_chunks[0].source_item_id,
      disposition: "excluded",
      cause: "scope_rule",
      explanation: "The source records an explicit exclusion from primary analysis after control failure.",
      parser_status: "success",
      access_status: "available",
      source_reference: sourceReference(sourceRequest),
      retryable: false,
      stage_disposition: "continue_with_limitation",
      applicable_rule_id: null,
    }];
    inputResponse.missingness = [{
      object_id: "material:withheld-donor",
      field_pointer: "/donor_identity",
      state: "withheld",
      reason: "Donor identity is withheld under the supplied disclosure policy.",
      provenance_status: "partial",
      withholding_reason_code: "privacy",
      disclosure_decision_id: "disclosure:DP-01",
    }];
    inputResponse.review_tasks = clone(published.review_tasks);
    inputResponse.forbidden_inferences_detected = clone(published.forbidden_inferences_detected);
    inputResponse.forbidden_inferences_detected[0].affected_operation_ids = inputResponse.candidate_operations.map((operation: JsonRecord) => operation.operation_id);
    inputResponse.forbidden_inferences_detected[0].disposition = "rejected";

    const target = baseReport();
    const request = clone(sourceRequest);
    await setStagePrompt(request, "S3_normalization", "report_prompt.stage.normalization_route", "stages/03-normalization-route.md");
    request.input_chunks = [];
    request.report_id = target.report_id;
    request.project_id = target.project_id;
    request.base_report_version = target.report_version;
    request.base_payload_hash = sha256CanonicalJson(target);
    request.requested_object_types = records.map((entry) => entry.type);
    request.permitted_patch_roots = records.map((entry) => entry.root);
    inputResponse.request_id = sourceRequest.request_id;
    inputResponse.request_contract_hash = sha256CanonicalJson(sourceRequest);
    inputResponse.prompt_contracts_hash = sourceRequest.prompt_contracts_hash;
    inputResponse.target_schema_id = REPORT_SCHEMA_ID;
    inputResponse.target_schema_version = request.target_schema_version;
    inputResponse.accepted_state_hash = sourceRequest.accepted_state.state_hash;
    inputResponse.stage = "S2_atomic_fact_extraction";
    inputResponse.processed_unit_ids = [sourceRequest.input_chunks[0].chunk_id];
    inputResponse.continuation = clone(published.continuation);
    request.normalization_route = {
      implementation_kind: "deterministic_non_llm",
      normalizer_id: S3_NORMALIZER_ID,
      normalizer_version: S3_NORMALIZER_VERSION,
      normalizer_hash: S3_NORMALIZER_HASH,
      input_response_id: inputResponse.response_id,
      input_response_hash: sha256CanonicalJson(inputResponse),
      input_response: inputResponse,
      source_schema_id: RESPONSE_SCHEMA_ID,
      source_schema_version: inputResponse.schema_version,
      target_schema_id: REPORT_SCHEMA_ID,
      target_schema_version: request.target_schema_version,
      profile_id: S3_PROFILE_ID,
      profile_version: S3_PROFILE_VERSION,
      profile_hash: S3_PROFILE_HASH,
      validation_mode: "validate_input_and_output",
    };

    const normalized = normalizeS2Response(request, { trustedExtractions: trusted });
    expect(normalized.issues).toEqual([]);
    expect(normalized.valid).toBe(true);
    for (const field of [
      "candidate_operations", "source_bindings", "excluded_items", "unreadable_items", "conflicts",
      "missingness", "review_tasks", "forbidden_inferences_detected", "processed_unit_ids", "continuation",
    ]) {
      expect(normalized.response![field], field).toEqual(inputResponse[field]);
    }
    expect((normalized.response!.extensions as JsonRecord).candidate_only).toBe(inputResponse.extensions.candidate_only);
    expect((normalized.response!.extensions as JsonRecord).normalization_profile_hash).toBe(S3_PROFILE_HASH);
    const wrongProfile = clone(request);
    wrongProfile.normalization_route.profile_hash = sha256("uninstalled normalization profile");
    expect(normalizeS2Response(wrongProfile, { trustedExtractions: trusted }).valid).toBe(false);
    const applied = applyGenerationResponse(request, normalized.response, target, { trustedExtractions: trusted });
    expect(applied.issues).toEqual([]);
    expect(applied.valid).toBe(true);
    expect(applied.report!.attempts).toHaveLength(1);
    expect(applied.report!.failures).toHaveLength(1);
    expect(applied.report!.results[0]?.scientific_effect_class).toBe("decrease");
  });
});
