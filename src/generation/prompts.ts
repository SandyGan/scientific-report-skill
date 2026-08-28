import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256, sha256CanonicalJson } from "../lib/hash.js";
import { findProjectRoot } from "../lib/project-paths.js";
import type {
  GenerationIssue,
  PromptCompositionResult,
  PromptContractReference,
} from "./types.js";

interface PromptRoute {
  id: string;
  path: string;
}

const CORE_ROUTES: readonly PromptRoute[] = [
  { id: "report_prompt.core.scientific_integrity", path: "core/scientific-integrity.md" },
  { id: "report_prompt.core.untrusted_input_boundary", path: "core/untrusted-input-boundary.md" },
  { id: "report_prompt.core.missingness_and_status", path: "core/missingness-and-status.md" },
  { id: "report_prompt.core.output_patch_contract", path: "core/output-patch-contract.md" },
] as const;

const STAGE_ROUTES: Readonly<Record<string, PromptRoute>> = {
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
} as const;

const PACK_ROUTES: Readonly<Record<string, PromptRoute>> = {
  wet_lab: { id: "report_prompt.pack.wet_lab", path: "packs/wet-lab.md" },
  ai_ml: { id: "report_prompt.pack.ai_ml", path: "packs/ai-ml.md" },
  molecular_dynamics: { id: "report_prompt.pack.molecular_dynamics", path: "packs/molecular-dynamics.md" },
} as const;

function issue(code: string, message: string, path?: string): GenerationIssue {
  return path === undefined ? { code, message } : { code, message, path };
}

function promptRoot(projectRoot?: string): string {
  const root = projectRoot ?? findProjectRoot(dirname(fileURLToPath(import.meta.url)));
  return join(root, "prompts");
}

function declaration(source: string, label: string, path: string): string {
  const match = new RegExp(`^-\\s+\\*\\*${label}:\\*\\*\\s+\\x60([^\\x60]+)\\x60\\s*$`, "mu").exec(source);
  if (match?.[1] === undefined) throw new Error(`Prompt ${path} has no ${label} declaration`);
  return match[1];
}

function resolveRoute(route: PromptRoute, root: string): PromptContractReference {
  const absolutePath = join(root, route.path);
  const bytes = readFileSync(absolutePath);
  const source = bytes.toString("utf8");
  const declaredId = declaration(source, "Prompt ID", route.path);
  if (declaredId !== route.id) {
    throw new Error(`Prompt ${route.path} declares ${declaredId}, expected ${route.id}`);
  }
  return {
    contract_id: route.id,
    contract_path: route.path,
    contract_version: declaration(source, "Version", route.path),
    contract_hash: sha256(bytes),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function resolveRequiredPromptContracts(
  request: unknown,
  options: { projectRoot?: string } = {},
): PromptContractReference[] {
  const value = record(request);
  if (value === null) throw new TypeError("Generation request must be an object");
  const stage = value.stage;
  if (typeof stage !== "string") throw new TypeError("Generation request stage must be a string");
  const stageRoute = STAGE_ROUTES[stage];
  if (stageRoute === undefined) throw new RangeError(`No prompt route is registered for stage ${stage}`);

  const enabledModules = Array.isArray(value.enabled_modules) ? value.enabled_modules : [];
  const moduleIds = new Set<string>();
  const enabledPackRoutes: PromptRoute[] = [];
  for (const [index, item] of enabledModules.entries()) {
    const module = record(item);
    if (module === null || typeof module.module_id !== "string" || typeof module.status !== "string") {
      throw new TypeError(`enabled_modules/${index} is not a typed module-manifest item`);
    }
    if (moduleIds.has(module.module_id)) throw new Error(`Module ${module.module_id} is repeated`);
    moduleIds.add(module.module_id);
    if (module.status !== "enabled" || module.module_id === "core") continue;
    const route = PACK_ROUTES[module.module_id];
    if (route === undefined) throw new Error(`Enabled module ${module.module_id} has no registered prompt pack`);
    enabledPackRoutes.push(route);
  }
  if (!moduleIds.has("core")) throw new Error("The core module must be present and enabled");
  const core = enabledModules.find((item) => record(item)?.module_id === "core");
  if (record(core)?.status !== "enabled") throw new Error("The core module must be enabled");

  const root = promptRoot(options.projectRoot);
  return [...CORE_ROUTES, stageRoute, ...enabledPackRoutes].map((route) => resolveRoute(route, root));
}

/**
 * Verify the exact executable prompt bundle. Recomputed set hashes do not make
 * omitted, duplicated, stale, or unregistered contracts acceptable.
 */
export function validatePromptComposition(
  request: unknown,
  options: { projectRoot?: string } = {},
): PromptCompositionResult {
  const issues: GenerationIssue[] = [];
  let expected: PromptContractReference[] = [];
  try {
    expected = resolveRequiredPromptContracts(request, options);
  } catch (error) {
    issues.push(issue(
      "RP-COMPOSE-001.resolution",
      error instanceof Error ? error.message : String(error),
      "/prompt_contracts",
    ));
    return { ok: false, valid: false, issues, expected };
  }

  const value = record(request);
  const actual = Array.isArray(value?.prompt_contracts) ? value.prompt_contracts : [];
  const actualById = new Map<string, Record<string, unknown>>();
  for (const [index, entryValue] of actual.entries()) {
    const entry = record(entryValue);
    const id = entry?.contract_id;
    if (typeof id !== "string") {
      issues.push(issue("RP-COMPOSE-001.reference", "Prompt reference has no contract_id.", `/prompt_contracts/${index}`));
      continue;
    }
    if (actualById.has(id)) {
      issues.push(issue("RP-COMPOSE-001.duplicate", `Prompt contract ${id} is repeated.`, `/prompt_contracts/${index}/contract_id`));
      continue;
    }
    actualById.set(id, entry!);
  }

  const expectedIds = new Set(expected.map((entry) => entry.contract_id));
  for (const expectedEntry of expected) {
    const actualEntry = actualById.get(expectedEntry.contract_id);
    if (actualEntry === undefined) {
      issues.push(issue("RP-COMPOSE-001.missing", `Required prompt contract ${expectedEntry.contract_id} is absent.`, "/prompt_contracts"));
      continue;
    }
    for (const key of ["contract_path", "contract_version", "contract_hash"] as const) {
      if (actualEntry[key] !== expectedEntry[key]) {
        issues.push(issue(
          "RP-COMPOSE-001.stale",
          `${expectedEntry.contract_id} has a non-current ${key}; exact current path/version/byte hash is required.`,
          `/prompt_contracts/${actual.indexOf(actualEntry)}/${key}`,
        ));
      }
    }
  }
  for (const [id] of actualById) {
    if (!expectedIds.has(id)) {
      issues.push(issue("RP-COMPOSE-001.extra", `Unrequired prompt contract ${id} is present.`, "/prompt_contracts"));
    }
  }
  const actualIds = actual
    .map((entry) => record(entry)?.contract_id)
    .filter((id): id is string => typeof id === "string");
  const expectedOrder = expected.map((entry) => entry.contract_id);
  if (actualIds.length !== expectedOrder.length || actualIds.some((id, index) => id !== expectedOrder[index])) {
    issues.push(issue(
      "RP-COMPOSE-001.order",
      "Prompt contracts must be ordered as the four core contracts, the exact stage contract, then enabled pack contracts in enabled_modules order.",
      "/prompt_contracts",
    ));
  }
  if (actual.length !== expected.length) {
    issues.push(issue(
      "RP-COMPOSE-001.cardinality",
      `Prompt bundle has ${actual.length} references; the exact executable bundle has ${expected.length}.`,
      "/prompt_contracts",
    ));
  }
  if (value?.prompt_contracts_hash !== sha256CanonicalJson(actual)) {
    issues.push(issue("RP-COMPOSE-001.set-hash", "prompt_contracts_hash does not hash the ordered prompt_contracts array.", "/prompt_contracts_hash"));
  }

  const valid = issues.length === 0;
  return { ok: valid, valid, issues, expected };
}

export const REQUIRED_CORE_PROMPT_IDS = CORE_ROUTES.map((route) => route.id);
export const GENERATION_STAGE_PROMPT_ROUTES = STAGE_ROUTES;
export const GENERATION_PACK_PROMPT_ROUTES = PACK_ROUTES;
