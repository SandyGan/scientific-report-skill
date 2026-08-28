import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { sha256, sha256CanonicalJson } from "../../src/lib/hash.js";
import { loadSchemas } from "../../src/lib/schema.js";
import { baseReport } from "../fixtures/base-report.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const PROMPT_ROOT = join(PROJECT_ROOT, "prompts");
const REQUEST_SCHEMA_ID = "https://schemas.report-prompt.org/v1/generation-request.schema.json";
const RESPONSE_SCHEMA_ID = "https://schemas.report-prompt.org/v1/generation-response.schema.json";
const REPORT_SCHEMA_ID = "https://schemas.report-prompt.org/v1/scientific-report.schema.json";
const COMMON_SCHEMA_ID = "https://schemas.report-prompt.org/v1/defs/common.schema.json";
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const NOW = "2026-05-13T00:00:00Z";

type JsonRecord = Record<string, any>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function readJson(path: string): Promise<JsonRecord> {
  return JSON.parse(await readFile(path, "utf8")) as JsonRecord;
}

async function requestExample(): Promise<JsonRecord> {
  return readJson(join(PROMPT_ROOT, "contracts", "request.example.json"));
}

async function responseExample(): Promise<JsonRecord> {
  return readJson(join(PROMPT_ROOT, "contracts", "response.example.json"));
}

async function actionableResponseExample(): Promise<JsonRecord> {
  const response = await responseExample();
  const task = clone(response.review_tasks[0]);
  task.review_task_id = "review:wetlab-example:pool-independence";
  task.description = "Establish the number and independence of biological contributors to the pooled sample before assigning biological N.";
  task.required_reviewer_role = "wet-lab study owner";
  const operationId = "candidate:wetlab-example:op:pool-review";
  response.status = "needs_review";
  response.cannot_complete_reason = null;
  response.candidate_operations = [{
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
    source_bindings: clone(response.source_bindings),
    premise_bindings: [],
    rationale: "The source establishes pooling but not independent biological contributors, so the assignment requires review.",
    requires_human_confirmation: true,
  }];
  response.review_tasks = [task];
  response.forbidden_inferences_detected[0].affected_operation_ids = [operationId];
  response.forbidden_inferences_detected[0].disposition = "converted_to_review_task";
  return response;
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry): Promise<string[]> => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  }));
  return nested.flat();
}

function declaration(source: string, label: string): string {
  const match = new RegExp(`^-\\s+\\*\\*${label}:\\*\\*\\s+\\x60([^\\x60]+)\\x60\\s*$`, "mu").exec(source);
  if (match?.[1] === undefined) throw new Error(`Missing ${label} declaration`);
  return match[1];
}

async function routePromptReference(stage: string): Promise<{ id: string; path: string; version: string; hash: string }> {
  const routes: Record<string, { id: string; path: string }> = {
    S0_source_universe_snapshot: { id: "report_prompt.stage.source_universe_snapshot", path: "stages/00-source-universe-snapshot.md" },
    S1_source_inventory: { id: "report_prompt.stage.inventory_snapshot", path: "stages/01-inventory-snapshot.md" },
    S2_atomic_fact_extraction: { id: "report_prompt.stage.extract_atomic_records", path: "stages/02-extract-atomic-records.md" },
    S3_normalization: { id: "report_prompt.stage.normalization_route", path: "stages/03-normalization-route.md" },
    S4_work_and_decision_modeling: { id: "report_prompt.stage.model_work_and_decisions", path: "stages/03-model-work-and-decisions.md" },
    S5_material_and_derivation_modeling: { id: "report_prompt.stage.model_material_and_derivation", path: "stages/04-model-material-and-derivation.md" },
    S6_argument_graph: { id: "report_prompt.stage.build_argument_graph", path: "stages/05-build-argument-graph.md" },
    S7_conflict_and_uncertainty: { id: "report_prompt.stage.assess_conflict_and_uncertainty", path: "stages/06-assess-conflict-and-uncertainty.md" },
    S8_challenge_and_resolution: { id: "report_prompt.stage.challenge_and_resolve", path: "stages/07-challenge-and-resolve.md" },
    S9_reproducibility_authoring: { id: "report_prompt.stage.author_reproducibility", path: "stages/09-author-reproducibility.md" },
    S10_controlled_wording: { id: "report_prompt.stage.controlled_wording", path: "stages/08-controlled-wording.md" },
  };
  const route = routes[stage];
  if (route === undefined) throw new Error(`Unknown test stage ${stage}`);
  const bytes = await readFile(join(PROMPT_ROOT, route.path));
  const source = bytes.toString("utf8");
  return { ...route, version: declaration(source, "Version"), hash: sha256(bytes) };
}

async function setStage(request: JsonRecord, stage: string): Promise<void> {
  const route = await routePromptReference(stage);
  request.stage = stage;
  const stageIndex = request.prompt_contracts.findIndex((entry: JsonRecord) =>
    typeof entry.contract_id === "string" && entry.contract_id.startsWith("report_prompt.stage."),
  );
  if (stageIndex < 0) throw new Error("Request fixture has no stage prompt reference");
  request.prompt_contracts[stageIndex] = {
    contract_id: route.id,
    contract_path: route.path,
    contract_version: route.version,
    contract_hash: route.hash,
  };
  request.prompt_contracts_hash = sha256CanonicalJson(request.prompt_contracts);
}

function fullSourceBinding(sourceItemId = "source:accepted-state"): JsonRecord {
  const contentHash = sha256(`accepted content for ${sourceItemId}`);
  return {
    source_item_id: sourceItemId,
    source_snapshot_id: "snapshot:accepted-state",
    snapshot_registry_hash: HASH_A,
    content_hash: contentHash,
    excerpt_hash: contentHash,
    chunk_ids: [`chunk:${sourceItemId}`],
    locator: {
      locator_type: "whole_source",
      value: "entire accepted-state fixture source",
      parser_name: "identity-text-parser",
      parser_version: "1.0.0",
    },
    parser_identity: {
      parser_name: "identity-text-parser",
      parser_version: "1.0.0",
      configuration_hash: HASH_B,
      parser_result_id: `parser-result:${sourceItemId}`,
    },
    binding_scope: "whole_source",
    binding_role: "direct",
  };
}

function upgradeSourceBindings(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(upgradeSourceBindings);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as JsonRecord;
  if (typeof record.source_item_id === "string" && record.locator !== undefined && typeof record.binding_role === "string") {
    const replacement = fullSourceBinding(record.source_item_id);
    replacement.source_snapshot_id = record.source_snapshot_id ?? replacement.source_snapshot_id;
    replacement.content_hash = record.content_hash ?? replacement.content_hash;
    replacement.excerpt_hash = replacement.content_hash;
    replacement.locator = record.locator;
    replacement.binding_role = record.binding_role;
    Object.assign(record, replacement);
  }
  Object.values(record).forEach(upgradeSourceBindings);
}

function unknown(reason: string): JsonRecord {
  return {
    state: "unknown",
    value: null,
    source_bindings: [],
    derivation_bindings: [],
    missing_reason: reason,
    provenance_status: "absent",
  };
}

async function acceptedArgumentState(): Promise<JsonRecord> {
  const report = await readJson(join(PROJECT_ROOT, "examples", "cross-domain", "scientific-report.json"));
  const question = clone(report.research_questions[0]);
  const evidence = clone(report.evidence_items[0]);
  upgradeSourceBindings(question);
  upgradeSourceBindings(evidence);
  const binding = fullSourceBinding();
  const result = {
    result_id: "result:accepted-state",
    result_version: "1.0.0",
    result_kind: "observation",
    statement: "The bounded source records an observation for argument construction.",
    work_unit_id: "work:accepted-state",
    attempt_id: null,
    segment_id: null,
    analysis_population_id: null,
    estimand: unknown("No estimand is required for this qualitative observation."),
    population_or_system: unknown("The accepted source does not define a broader population."),
    condition: unknown("The accepted source does not define an additional condition."),
    time_or_frame_scope: unknown("The accepted source does not define a time scope."),
    unit: unknown("This qualitative observation has no stated unit."),
    effect_estimate: null,
    derivation_closure_status: "absent",
    scientific_effect_class: "not_estimated",
    statistical_decision: "not_performed",
    interpretability_status: "qualified",
    record_disposition: "pending_review",
    disposition_reason: unknown("No final disposition decision is accepted."),
    qualification_ids: [],
    blocker_ids: [],
    negative_evidence_assessment: null,
    data_slice_ids: [],
    derivation_ids: [],
    analysis_run_ids: [],
    output_artifact_ids: [],
    decision_event_ids: [],
    conflict_set_ids: [],
    source_bindings: [binding],
    extensions: {},
  };

  const specs: Array<[string, string, string, Array<{ id: string; version: string; body: JsonRecord }>]> = [
    ["research_questions", "research_question", "https://schemas.report-prompt.org/v1/defs/claim-argument.schema.json#/$defs/ResearchQuestion", [{ id: question.research_question_id, version: question.research_question_version, body: question }]],
    ["results", "result", "https://schemas.report-prompt.org/v1/defs/result-and-disposition.schema.json#/$defs/Result", [{ id: result.result_id, version: result.result_version, body: result }]],
    ["evidence_items", "evidence_item", "https://schemas.report-prompt.org/v1/defs/claim-argument.schema.json#/$defs/EvidenceItem", [{ id: evidence.evidence_item_id, version: evidence.evidence_item_version, body: evidence }]],
    ["failures", "failure", "https://schemas.report-prompt.org/v1/defs/result-and-disposition.schema.json#/$defs/FailureEvent", []],
    ["limitations", "limitation", "https://schemas.report-prompt.org/v1/defs/common.schema.json#/$defs/Limitation", []],
    ["derivations", "derivation", "https://schemas.report-prompt.org/v1/defs/quantitative-derivation.schema.json#/$defs/DerivationRecord", []],
    ["revision_events", "revision_event", "https://schemas.report-prompt.org/v1/defs/claim-argument.schema.json#/$defs/RevisionEvent", []],
  ];
  const collections = specs.map(([collection, objectType, objectSchemaId, entries]) => {
    const objects = entries.map(({ id, version, body }) => ({
      object_type: objectType,
      object_id: id,
      object_version: version,
      object_hash: sha256CanonicalJson(body),
      acceptance_status: "accepted",
      trust_status: "orchestrator_verified",
      accepted_by_orchestrator_id: "orchestrator:fixture",
      accepted_at: NOW,
      body,
    }));
    return {
      collection,
      object_schema_id: objectSchemaId,
      collection_version: "1.0.0",
      collection_hash: sha256CanonicalJson(objects),
      acceptance_status: "accepted",
      trust_status: "orchestrator_verified",
      accepted_by_orchestrator_id: "orchestrator:fixture",
      accepted_at: NOW,
      objects,
    };
  });
  return {
    state_snapshot_id: "accepted-state:argument:1",
    state_version: "1.0.0",
    state_hash: sha256CanonicalJson(collections),
    acceptance_status: "accepted",
    trust_status: "orchestrator_verified",
    accepted_by_orchestrator_id: "orchestrator:fixture",
    accepted_at: NOW,
    collections,
  };
}

function acceptedStateIntegrityIsValid(state: JsonRecord): boolean {
  if (state.state_hash !== sha256CanonicalJson(state.collections)) return false;
  const names = new Set<string>();
  for (const collection of state.collections as JsonRecord[]) {
    if (names.has(collection.collection)) return false;
    names.add(collection.collection);
    if (collection.collection_hash !== sha256CanonicalJson(collection.objects)) return false;
    for (const object of collection.objects as JsonRecord[]) {
      if (object.object_hash !== sha256CanonicalJson(object.body)) return false;
      if (object.acceptance_status !== "accepted" || object.trust_status !== "orchestrator_verified") return false;
    }
  }
  return true;
}

interface PatchPreflight {
  valid: boolean;
  reasons: string[];
}

function preflightPatch(request: JsonRecord, response: JsonRecord, targetSchema: JsonRecord): PatchPreflight {
  const reasons: string[] = [];
  if (request.target_schema_id !== response.target_schema_id || request.target_schema_id !== targetSchema.$id) reasons.push("target-schema-mismatch");
  if (request.target_schema_version !== response.target_schema_version) reasons.push("target-version-mismatch");
  if (request.request_id !== response.request_id) reasons.push("request-mismatch");
  if (request.stage !== response.stage) reasons.push("stage-mismatch");
  if (request.prompt_contracts_hash !== response.prompt_contracts_hash) reasons.push("prompt-contract-mismatch");
  const requested = new Set<string>(request.permitted_patch_roots);
  const echoed = new Set<string>(response.authorized_patch_roots);
  for (const root of echoed) if (!requested.has(root)) reasons.push(`echoed-root-not-authorized:${root}`);
  const targetProperties = targetSchema.properties as JsonRecord;
  for (const operation of response.candidate_operations as JsonRecord[]) {
    const root = operation.authorized_root as string;
    const property = root.slice(1);
    if (!requested.has(root) || !echoed.has(root)) reasons.push(`operation-root-not-authorized:${root}`);
    if (!(property in targetProperties)) reasons.push(`target-root-absent:${root}`);
    if (operation.path !== root && !String(operation.path).startsWith(`${root}/`)) reasons.push(`path-root-mismatch:${operation.path}`);
  }
  return { valid: reasons.length === 0, reasons };
}

function applyOperationsAtomically(target: JsonRecord, response: JsonRecord): JsonRecord {
  const result = clone(target);
  for (const operation of response.candidate_operations as JsonRecord[]) {
    const tokens = String(operation.path).split("/").slice(1).map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
    let parent: any = result;
    for (const token of tokens.slice(0, -1)) parent = parent[token];
    const leaf = tokens.at(-1);
    if (leaf === undefined) throw new Error("Root-document patches are forbidden");
    if (operation.op === "add" && Array.isArray(parent) && leaf === "-") parent.push(clone(operation.value));
    else if (operation.op === "add" || operation.op === "replace") parent[leaf] = clone(operation.value);
    else if (operation.op === "remove") Array.isArray(parent) ? parent.splice(Number(leaf), 1) : delete parent[leaf];
    else if (operation.op === "test" && JSON.stringify(parent[leaf]) !== JSON.stringify(operation.value)) throw new Error("test operation failed");
  }
  return result;
}

function reproducibilityCoverageIsComplete(request: JsonRecord, response: JsonRecord): boolean {
  const inventory = request.computational_work_inventory as JsonRecord;
  const coverage = response.reproducibility_coverage as JsonRecord | null;
  if (coverage === null || coverage.inventory_id !== inventory.inventory_id || coverage.inventory_hash !== inventory.inventory_hash) return false;
  const targets = new Set<string>((inventory.key_computations as JsonRecord[]).map((item) => item.computation_id));
  const counts = new Map<string, number>();
  const operationIds = new Set<string>((response.candidate_operations as JsonRecord[]).map((item) => item.operation_id));
  for (const disposition of coverage.dispositions as JsonRecord[]) {
    if (!targets.has(disposition.computation_id)) return false;
    counts.set(disposition.computation_id, (counts.get(disposition.computation_id) ?? 0) + 1);
    if ((disposition.candidate_operation_ids as string[]).some((id) => !operationIds.has(id))) return false;
    if (disposition.disposition === "gap_recorded" && (typeof disposition.justification !== "string" || disposition.justification.trim() === "")) return false;
  }
  return [...targets].every((id) => counts.get(id) === 1)
    && (coverage.uncovered_computation_ids as string[]).length === 0;
}

async function reproducibilityRequest(): Promise<JsonRecord> {
  const request = await requestExample();
  await setStage(request, "S9_reproducibility_authoring");
  request.input_chunks = [];
  request.base_report_version = "1.0.0";
  request.base_payload_hash = HASH_A;
  request.permitted_patch_roots = ["/reproducibility_units", "/limitations", "/review_tasks"];
  const required = [
    ["derivations", "derivation", "https://schemas.report-prompt.org/v1/defs/quantitative-derivation.schema.json#/$defs/DerivationRecord"],
    ["invocations", "invocation", "https://schemas.report-prompt.org/v1/defs/invocation.schema.json#/$defs/Invocation"],
    ["environments", "environment", "https://schemas.report-prompt.org/v1/defs/environment.schema.json#/$defs/Environment"],
    ["random_states", "random_state", "https://schemas.report-prompt.org/v1/defs/random-state.schema.json#/$defs/RandomState"],
    ["analysis_runs", "analysis_run", "https://schemas.report-prompt.org/v1/defs/quantitative-derivation.schema.json#/$defs/AnalysisRun"],
    ["artifacts", "artifact", "https://schemas.report-prompt.org/v1/defs/common.schema.json#/$defs/Artifact"],
    ["results", "result", "https://schemas.report-prompt.org/v1/defs/result-and-disposition.schema.json#/$defs/Result"],
    ["reproducibility_units", "reproducibility_unit", "https://schemas.report-prompt.org/v1/defs/reproducibility-unit.schema.json#/$defs/ReproducibilityUnit"],
  ];
  const collections = required.map(([collection, _objectType, objectSchemaId]) => ({
    collection,
    object_schema_id: objectSchemaId,
    collection_version: "1.0.0",
    collection_hash: sha256CanonicalJson([]),
    acceptance_status: "accepted",
    trust_status: "orchestrator_verified",
    accepted_by_orchestrator_id: "orchestrator:fixture",
    accepted_at: NOW,
    objects: [],
  }));
  request.accepted_state = {
    state_snapshot_id: "accepted-state:repro:1",
    state_version: "1.0.0",
    state_hash: sha256CanonicalJson(collections),
    acceptance_status: "accepted",
    trust_status: "orchestrator_verified",
    accepted_by_orchestrator_id: "orchestrator:fixture",
    accepted_at: NOW,
    collections,
  };
  const keyComputations = [
    {
      computation_id: "computation:key-analysis",
      description: "Primary quantitative analysis producing the key result.",
      criticality: "key",
      work_unit_ids: ["work:key-analysis"],
      analysis_run_ids: ["run:key-analysis"],
      derivation_ids: ["derivation:key-analysis"],
      output_artifact_ids: ["artifact:key-analysis"],
      claim_ids: ["claim:key-analysis"],
    },
    {
      computation_id: "computation:sensitivity",
      description: "Sensitivity computation constraining the key interpretation.",
      criticality: "supporting",
      work_unit_ids: ["work:sensitivity"],
      analysis_run_ids: ["run:sensitivity"],
      derivation_ids: ["derivation:sensitivity"],
      output_artifact_ids: ["artifact:sensitivity"],
      claim_ids: [],
    },
  ];
  request.computational_work_inventory = {
    inventory_id: "computational-inventory:fixture",
    inventory_version: "1.0.0",
    inventory_hash: sha256CanonicalJson(keyComputations),
    applicability: "applicable",
    applicability_decision_id: null,
    key_computations: keyComputations,
  };
  return request;
}

function gapOperation(operationId: string, taskId: string, affectedId: string): JsonRecord {
  const task = {
    review_task_id: taskId,
    category: "other",
    description: `Resolve the reproducibility gap for ${affectedId}.`,
    severity: "blocking",
    affected_object_ids: [affectedId],
    required_reviewer_role: "computational workflow owner",
    status: "open",
  };
  return {
    operation_id: operationId,
    op: "add",
    object_type: "review_task",
    object_id: taskId,
    base_object_version: null,
    authorized_root: "/review_tasks",
    path: "/review_tasks/-",
    value: task,
    proposed_object_version: "1.0.0",
    provenance_kind: "operator_authorized",
    source_bindings: [],
    premise_bindings: [],
    rationale: "The independent inventory identifies work whose reproducibility prerequisites are absent.",
    requires_human_confirmation: true,
  };
}

async function reproducibilityResponse(request: JsonRecord): Promise<JsonRecord> {
  const response = await responseExample();
  const operations = [
    gapOperation("operation:gap:key-analysis", "review:gap:key-analysis", "computation:key-analysis"),
    gapOperation("operation:gap:sensitivity", "review:gap:sensitivity", "computation:sensitivity"),
  ];
  response.request_id = request.request_id;
  response.request_contract_hash = sha256CanonicalJson(request);
  response.prompt_contracts_hash = request.prompt_contracts_hash;
  response.authorized_patch_roots = request.permitted_patch_roots;
  response.accepted_state_hash = request.accepted_state.state_hash;
  response.stage = request.stage;
  response.status = "needs_review";
  response.cannot_complete_reason = null;
  response.candidate_operations = operations;
  response.source_bindings = [];
  response.processed_unit_ids = request.computational_work_inventory.key_computations.map((item: JsonRecord) => item.computation_id);
  response.review_tasks = operations.map((operation) => operation.value);
  response.forbidden_inferences_detected = [];
  response.reproducibility_coverage = {
    inventory_id: request.computational_work_inventory.inventory_id,
    inventory_hash: request.computational_work_inventory.inventory_hash,
    dispositions: [
      {
        computation_id: "computation:key-analysis",
        disposition: "gap_recorded",
        reproducibility_unit_id: null,
        candidate_operation_ids: ["operation:gap:key-analysis"],
        justification: "The accepted state contains no resolvable recipe or replay context for the key analysis.",
        applicability_decision_id: null,
      },
      {
        computation_id: "computation:sensitivity",
        disposition: "gap_recorded",
        reproducibility_unit_id: null,
        candidate_operation_ids: ["operation:gap:sensitivity"],
        justification: "The accepted state contains no invocation, environment, random-state, or comparison evidence for the sensitivity computation.",
        applicability_decision_id: null,
      },
    ],
    uncovered_computation_ids: [],
  };
  return response;
}

describe("frozen prompt/schema contract repairs", () => {
  it("validates every documented JSON snippet unchanged against its named structural contract (F4)", async () => {
    const schemas = loadSchemas();
    const snippets: Array<{ path: string; value: JsonRecord; schemaId: string }> = [];
    for (const path of await markdownFiles(PROMPT_ROOT)) {
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(/```json\s*\n([\s\S]*?)\n```/gu)) {
        const value = JSON.parse(match[1] ?? "null") as JsonRecord;
        const schemaId = value.response_id !== undefined
          ? RESPONSE_SCHEMA_ID
          : value.operation_id !== undefined
            ? `${RESPONSE_SCHEMA_ID}#/$defs/CandidateOperation`
            : `${COMMON_SCHEMA_ID}#/$defs/KnownValue`;
        snippets.push({ path: relative(PROMPT_ROOT, path).split(sep).join("/"), value, schemaId });
      }
    }
    expect(snippets).toHaveLength(3);
    for (const snippet of snippets) {
      const result = schemas.validate(snippet.schemaId, snippet.value);
      expect(result.issues, snippet.path).toEqual([]);
      expect(result.valid, snippet.path).toBe(true);
    }
  });

  it("resolves every referenced prompt uniquely with current version and exact byte hash (F9)", async () => {
    const request = await requestExample();
    const seen = new Set<string>();
    for (const reference of request.prompt_contracts as JsonRecord[]) {
      expect(seen.has(reference.contract_id), reference.contract_id).toBe(false);
      seen.add(reference.contract_id);
      expect(String(reference.contract_path).includes(".."), reference.contract_path).toBe(false);
      const bytes = await readFile(join(PROMPT_ROOT, reference.contract_path));
      const source = bytes.toString("utf8");
      expect(declaration(source, "Prompt ID"), reference.contract_path).toBe(reference.contract_id);
      expect(declaration(source, "Version"), reference.contract_path).toBe(reference.contract_version);
      expect(sha256(bytes), reference.contract_path).toBe(reference.contract_hash);
    }
    expect(request.prompt_contracts_hash).toBe(sha256CanonicalJson(request.prompt_contracts));
    const response = await responseExample();
    expect(response.prompt_contracts_hash).toBe(request.prompt_contracts_hash);
    expect(response.request_contract_hash).toBe(sha256CanonicalJson(request));
  });

  it("proves a stage-code bijection and routes normalization only to deterministic non-LLM code (F3)", async () => {
    const requestSchema = await readJson(join(PROJECT_ROOT, "schemas", "generation-request.schema.json"));
    const acceptedCodes = requestSchema.$defs.StageCode.enum as string[];
    const declarations: Array<{ code: string; implementation: string; path: string }> = [];
    const declaredIds = new Map<string, string>();
    for (const path of (await markdownFiles(join(PROMPT_ROOT, "stages"))).sort()) {
      const source = await readFile(path, "utf8");
      const code = declaration(source, "Stage code");
      declarations.push({
        code,
        implementation: declaration(source, "Implementation"),
        path: relative(PROMPT_ROOT, path).split(sep).join("/"),
      });
      declaredIds.set(code, declaration(source, "Prompt ID"));
    }
    expect(declarations.map(({ code }) => code).sort()).toEqual([...acceptedCodes].sort());
    expect(new Set(declarations.map(({ code }) => code)).size).toBe(declarations.length);

    const schemaRoutes = new Map<string, string>();
    for (const condition of requestSchema.allOf as JsonRecord[]) {
      const code = condition.if?.properties?.stage?.const;
      const contractId = condition.then?.properties?.prompt_contracts?.contains?.properties?.contract_id?.const;
      if (typeof code === "string" && typeof contractId === "string") {
        expect(schemaRoutes.has(code), code).toBe(false);
        schemaRoutes.set(code, contractId);
      }
    }
    expect([...schemaRoutes.keys()].sort()).toEqual([...acceptedCodes].sort());
    for (const code of acceptedCodes) expect(schemaRoutes.get(code), code).toBe(declaredIds.get(code));

    expect(declarations.filter(({ code }) => code === "S3_normalization")).toEqual([
      { code: "S3_normalization", implementation: "deterministic_non_llm", path: "stages/03-normalization-route.md" },
    ]);
    expect(declarations.filter(({ code }) => code !== "S3_normalization").every(({ implementation }) => implementation === "prompt")).toBe(true);

    const readme = await readFile(join(PROMPT_ROOT, "README.md"), "utf8");
    const rows = [...readme.matchAll(/^\| `(S\d+_[^`]+)` \| `(stages\/[^`]+)` \| ([a-z_]+) \|$/gmu)]
      .map((match) => ({ code: match[1]!, path: match[2]!, implementation: match[3]! }));
    expect(rows).toHaveLength(acceptedCodes.length);
    expect(rows.sort((left, right) => left.code.localeCompare(right.code))).toEqual(
      declarations.sort((left, right) => left.code.localeCompare(right.code)),
    );
  });

  it("requires normalization to carry a hash-pinned deterministic implementation, full input response, and input/output schema validation (F3)", async () => {
    const schemas = loadSchemas();
    const request = await requestExample();
    const inputResponse = await responseExample();
    await setStage(request, "S3_normalization");
    request.input_chunks = [];
    request.normalization_route = {
      implementation_kind: "deterministic_non_llm",
      normalizer_id: "normalizer:canonical-patch",
      normalizer_version: "1.0.0",
      normalizer_hash: HASH_A,
      input_response_id: inputResponse.response_id,
      input_response_hash: sha256CanonicalJson(inputResponse),
      input_response: inputResponse,
      source_schema_id: RESPONSE_SCHEMA_ID,
      source_schema_version: inputResponse.schema_version,
      target_schema_id: REPORT_SCHEMA_ID,
      target_schema_version: request.target_schema_version,
      profile_id: "normalization-profile:canonical-patch",
      profile_version: "1.0.0",
      profile_hash: HASH_B,
      validation_mode: "validate_input_and_output",
    };
    const valid = schemas.validate(REQUEST_SCHEMA_ID, request);
    expect(valid.issues).toEqual([]);
    expect(valid.valid).toBe(true);

    const modelRoute = clone(request);
    modelRoute.normalization_route.implementation_kind = "model";
    expect(schemas.validate(REQUEST_SCHEMA_ID, modelRoute).valid).toBe(false);

    const referencesOnly = clone(request);
    delete referencesOnly.normalization_route.input_response;
    expect(schemas.validate(REQUEST_SCHEMA_ID, referencesOnly).valid).toBe(false);

    const uncheckedOutput = clone(request);
    uncheckedOutput.normalization_route.validation_mode = "validate_input_only";
    expect(schemas.validate(REQUEST_SCHEMA_ID, uncheckedOutput).valid).toBe(false);
  });

  it("requires full typed accepted collections for S6 and detects body/hash tampering (F1)", async () => {
    const schemas = loadSchemas();
    const missing = await requestExample();
    await setStage(missing, "S6_argument_graph");
    missing.input_chunks = [];
    missing.base_report_version = "1.0.0";
    missing.base_payload_hash = HASH_A;
    missing.permitted_patch_roots = ["/claims", "/argument_steps", "/argument_edges", "/review_tasks"];
    expect(schemas.validate(REQUEST_SCHEMA_ID, missing).valid).toBe(false);

    const complete = clone(missing);
    complete.accepted_state = await acceptedArgumentState();
    const valid = schemas.validate(REQUEST_SCHEMA_ID, complete);
    expect(valid.issues).toEqual([]);
    expect(valid.valid).toBe(true);
    expect(acceptedStateIntegrityIsValid(complete.accepted_state)).toBe(true);

    const referencesOnly = clone(complete);
    referencesOnly.accepted_state.collections[0].objects[0].body = undefined;
    expect(schemas.validate(REQUEST_SCHEMA_ID, referencesOnly).valid).toBe(false);

    const tampered = clone(complete);
    tampered.accepted_state.collections[0].objects[0].body.question = "Tampered after acceptance";
    expect(schemas.validate(REQUEST_SCHEMA_ID, tampered).valid).toBe(true);
    expect(acceptedStateIntegrityIsValid(tampered.accepted_state)).toBe(false);
  });

  it("applies the published patch to an existing target root and rejects unauthorized, absent, or mismatched roots before atomic application (F2)", async () => {
    const schemas = loadSchemas();
    const request = await requestExample();
    const response = await actionableResponseExample();
    const targetSchema = await readJson(join(PROJECT_ROOT, "schemas", "scientific-report.schema.json"));
    expect(preflightPatch(request, response, targetSchema)).toEqual({ valid: true, reasons: [] });
    const taskValidation = schemas.validate(`${COMMON_SCHEMA_ID}#/$defs/ReviewTask`, response.candidate_operations[0].value);
    expect(taskValidation.valid).toBe(true);
    const target = baseReport() as unknown as JsonRecord;
    upgradeSourceBindings(target);
    expect(schemas.validate(REPORT_SCHEMA_ID, target).valid).toBe(true);
    const patched = applyOperationsAtomically(target, response);
    expect(patched.review_tasks).toEqual([response.candidate_operations[0].value]);
    expect(target.review_tasks).toEqual([]);
    expect(schemas.validate(REPORT_SCHEMA_ID, patched).valid).toBe(true);

    const outsideAuthorization = clone(response);
    outsideAuthorization.candidate_operations[0].authorized_root = "/claims";
    outsideAuthorization.candidate_operations[0].path = "/claims/-";
    outsideAuthorization.candidate_operations[0].object_type = "claim";
    expect(schemas.validate(RESPONSE_SCHEMA_ID, outsideAuthorization).valid).toBe(true);
    expect(preflightPatch(request, outsideAuthorization, targetSchema).valid).toBe(false);

    const absentRoot = clone(response);
    absentRoot.candidate_operations[0].authorized_root = "/staging/atomic_records";
    absentRoot.candidate_operations[0].path = "/staging/atomic_records/-";
    expect(schemas.validate(RESPONSE_SCHEMA_ID, absentRoot).valid).toBe(false);

    const mismatchedPath = clone(response);
    mismatchedPath.candidate_operations[0].path = "/claims/-";
    expect(schemas.validate(RESPONSE_SCHEMA_ID, mismatchedPath).valid).toBe(false);
  });

  it("requires immutable source, excerpt, chunk, and parser identity for source-derived operations (F7)", async () => {
    const schemas = loadSchemas();
    const response = await actionableResponseExample();
    expect(schemas.validate(RESPONSE_SCHEMA_ID, response).valid).toBe(true);

    const noBinding = clone(response);
    noBinding.candidate_operations[0].source_bindings = [];
    expect(schemas.validate(RESPONSE_SCHEMA_ID, noBinding).valid).toBe(false);

    const mutableLabelOnly = clone(response);
    mutableLabelOnly.candidate_operations[0].source_bindings = [{
      source_item_id: "source:mutable-label",
      locator: { locator_type: "other", value: "results section" },
      binding_role: "direct",
    }];
    expect(schemas.validate(RESPONSE_SCHEMA_ID, mutableLabelOnly).valid).toBe(false);

    for (const field of ["source_snapshot_id", "snapshot_registry_hash", "content_hash", "excerpt_hash", "chunk_ids", "parser_identity"] as const) {
      const missing = clone(response);
      delete missing.candidate_operations[0].source_bindings[0][field];
      expect(schemas.validate(RESPONSE_SCHEMA_ID, missing).valid, field).toBe(false);
    }
  });

  it("rejects bare unreadable/excluded IDs and accepts complete traceable dispositions (F8)", async () => {
    const schemas = loadSchemas();
    const response = await responseExample();
    const bare = clone(response);
    bare.unreadable_items = [{ item_id: "source:eln-entry-42" }];
    expect(schemas.validate(RESPONSE_SCHEMA_ID, bare).valid).toBe(false);

    const full = clone(response);
    full.unreadable_items = [{
      item_id: "source:eln-entry-42",
      disposition: "unreadable",
      cause: "parser_failure",
      explanation: "The supplied parser result failed before a scientific span could be extracted.",
      parser_status: "failure",
      access_status: "available",
      source_reference: {
        source_item_id: "source:eln-entry-42",
        source_snapshot_id: "snapshot:example-001",
        snapshot_registry_hash: response.source_bindings[0].snapshot_registry_hash,
        content_identity_status: "known",
        content_hash: response.source_bindings[0].content_hash,
        chunk_ids: ["chunk:eln-entry-42:0"],
        locator: response.source_bindings[0].locator,
        parser_result_id: response.source_bindings[0].parser_identity.parser_result_id,
      },
      retryable: true,
      stage_disposition: "defer_for_review",
      applicable_rule_id: null,
    }];
    expect(schemas.validate(RESPONSE_SCHEMA_ID, full).valid).toBe(true);

    const excludedWithoutReason = clone(response);
    excludedWithoutReason.excluded_items = [{ item_id: "source:eln-entry-42", disposition: "excluded" }];
    expect(schemas.validate(RESPONSE_SCHEMA_ID, excludedWithoutReason).valid).toBe(false);
  });

  it("requires a dedicated reproducibility response to disposition every independently inventoried computation (REPRO-007 prompt portion)", async () => {
    const schemas = loadSchemas();
    const request = await reproducibilityRequest();
    const requestResult = schemas.validate(REQUEST_SCHEMA_ID, request);
    expect(requestResult.issues).toEqual([]);
    expect(requestResult.valid).toBe(true);

    const covered = await reproducibilityResponse(request);
    const coveredResult = schemas.validate(RESPONSE_SCHEMA_ID, covered);
    expect(coveredResult.issues).toEqual([]);
    expect(coveredResult.valid).toBe(true);
    expect(reproducibilityCoverageIsComplete(request, covered)).toBe(true);

    const zeroUnitsAndNoGaps = clone(covered);
    zeroUnitsAndNoGaps.status = "ok";
    zeroUnitsAndNoGaps.candidate_operations = [];
    zeroUnitsAndNoGaps.review_tasks = [];
    zeroUnitsAndNoGaps.reproducibility_coverage.dispositions = [];
    zeroUnitsAndNoGaps.reproducibility_coverage.uncovered_computation_ids = ["computation:key-analysis", "computation:sensitivity"];
    expect(schemas.validate(RESPONSE_SCHEMA_ID, zeroUnitsAndNoGaps).valid).toBe(false);
    expect(reproducibilityCoverageIsComplete(request, zeroUnitsAndNoGaps)).toBe(false);

    const hiddenUncovered = clone(covered);
    hiddenUncovered.reproducibility_coverage.dispositions.pop();
    hiddenUncovered.reproducibility_coverage.uncovered_computation_ids = [];
    expect(schemas.validate(RESPONSE_SCHEMA_ID, hiddenUncovered).valid).toBe(true);
    expect(reproducibilityCoverageIsComplete(request, hiddenUncovered)).toBe(false);

    const unjustifiedGap = clone(covered);
    unjustifiedGap.reproducibility_coverage.dispositions[0].justification = null;
    expect(schemas.validate(RESPONSE_SCHEMA_ID, unjustifiedGap).valid).toBe(false);
  });
});
