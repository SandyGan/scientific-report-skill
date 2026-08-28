#!/usr/bin/env node

import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { lstat, mkdir, open, readFile, realpath, rename, rm, copyFile, chmod } from "node:fs/promises";
import { Command, CommanderError, Option } from "commander";
import { parse as parseYaml } from "yaml";
import {
  normalizeAuthoringFile,
  normalizeAuthoringInput,
} from "../normalizer/index.js";
import { validateReport, validateReportFile } from "../validator/index.js";
import {
  projectDisclosure,
  type DisclosureProjectionPolicy,
  type DisclosureProjectionRecord,
  type ProjectionInstruction,
} from "../projection/index.js";
import type { ScientificReport } from "../lib/types.js";
import { renderReport, type RenderResult } from "../renderer/index.js";
import {
  BundleBuildError,
  bundleDirectory,
  collectReplayArtifactRequirements,
  defaultPackageReadme,
  isPathInside,
  scanBundleTree,
  sha256File,
  type BundleResult,
} from "../bundler/index.js";
import { formatVerificationResult, verifyBundle } from "../verifier/index.js";

interface NormalizeResult {
  report: unknown;
  findings: unknown[];
  todo: unknown[];
}

interface ValidateResult {
  valid: boolean;
  complete?: boolean;
  releaseEligible?: boolean;
  findings: unknown[];
  attestation: unknown;
}

interface DisclosureValidationInput {
  sourceReport: ScientificReport;
  projection: DisclosureProjectionRecord;
}

const DEFAULT_VERSION = "0.2.0-dev";
const AUTHORING_FILE = "authoring-input.json";

class CliError extends Error {
  readonly exitCode: number;
  readonly hint: string | null;

  constructor(message: string, options: { exitCode?: number; hint?: string } = {}) {
    super(message);
    this.name = "CliError";
    this.exitCode = options.exitCode ?? 1;
    this.hint = options.hint ?? null;
  }
}

export function assertRenderEligibility(
  validation: Pick<ValidateResult, "valid" | "complete" | "releaseEligible">,
  workingCopy: boolean,
): void {
  if (workingCopy) return;
  if (validation.valid === true && validation.complete === true && validation.releaseEligible === true) return;
  throw new CliError("Rendering refused because the scientific report is not release-eligible.", {
    hint:
      "Resolve structural/safety errors first, then resolve incomplete, not_run, and release-gate findings. Use --working-copy only for renderer-safe input that needs a prominently marked, non-release semantic review artifact.",
  });
}

export function workingCopyBanner(overallStatus: unknown): string {
  const status = typeof overallStatus === "string" ? overallStatus.replace(/[^A-Za-z0-9_-]/gu, "") : "unknown";
  return `<aside role="alert" data-release-status="not-release-eligible"><strong>NOT RELEASE-ELIGIBLE — WORKING COPY</strong><p>Validation status: ${status || "unknown"}. This artifact preserves every validation check status, including failed and not_run when present, and must not be used as a release bundle.</p></aside>`;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return plainObject(value) ? value : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizationTodo(result: NormalizeResult): unknown[] {
  return array(result.todo);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function severityOf(value: unknown): string {
  const source = record(value);
  return String(source.severity ?? source.level ?? source.status ?? "information").toLowerCase();
}

function isBlocking(value: unknown): boolean {
  return ["error", "blocking", "blocker", "fatal", "fail", "failed"].includes(severityOf(value));
}

function hasBlocking(findings: readonly unknown[]): boolean {
  return findings.some(isBlocking);
}

function findingCode(value: unknown): string {
  const source = record(value);
  return stringField(source.rule_code ?? source.ruleCode ?? source.ruleId ?? source.code ?? source.id, "UNSPECIFIED");
}

function findingMessage(value: unknown): string {
  const source = record(value);
  if (typeof value === "string") return value;
  return stringField(source.message ?? source.description ?? source.title, JSON.stringify(value));
}

function findingPath(value: unknown): string | null {
  const source = record(value);
  const candidate = source.instance_pointer ?? source.instancePointer ?? source.instancePath ?? source.pointer ?? source.path;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function printFindings(findings: readonly unknown[]): void {
  if (findings.length === 0) {
    process.stdout.write("No findings were returned.\n");
    return;
  }
  for (const item of findings) {
    const location = findingPath(item);
    process.stdout.write(
      `- ${severityOf(item).toUpperCase()} ${findingCode(item)}${location === null ? "" : ` [${location}]`}: ${findingMessage(item)}\n`,
    );
    const remediation = record(item).remediation;
    if (typeof remediation === "string" && remediation.length > 0) {
      process.stdout.write(`  Action: ${remediation}\n`);
    }
  }
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (plainObject(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(filePath: string): Promise<unknown> {
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    throw new CliError(`Cannot read JSON input ${filePath}: ${error instanceof Error ? error.message : String(error)}`, {
      hint: "Check the path and read permissions, then run the command again.",
    });
  }
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new CliError(`Cannot parse JSON input ${filePath}: ${error instanceof Error ? error.message : String(error)}`, {
      hint: "Correct the JSON syntax; the CLI does not silently recover or truncate malformed input.",
    });
  }
}

async function readDisclosureValidationInput(
  sourceReportPath: string | undefined,
  projectionPath: string | undefined,
  required: boolean,
): Promise<DisclosureValidationInput | undefined> {
  if (sourceReportPath === undefined && projectionPath === undefined) {
    if (!required) return undefined;
    throw new CliError("A public render requires both --source-report and --projection.", {
      hint: "Run the project command first, then supply its canonical source and disclosure-projection record.",
    });
  }
  if (sourceReportPath === undefined || projectionPath === undefined) {
    throw new CliError("--source-report and --projection must be supplied together.", {
      hint: "A projection cannot be verified from only one side of its source/output binding.",
    });
  }
  const sourceReport = await readJson(path.resolve(sourceReportPath));
  const projection = await readJson(path.resolve(projectionPath));
  if (!plainObject(sourceReport) || !plainObject(projection)) {
    throw new CliError("Disclosure source report and projection record must both be JSON objects.");
  }
  return {
    sourceReport: sourceReport as unknown as ScientificReport,
    projection: projection as unknown as DisclosureProjectionRecord,
  };
}

async function writeJson(filePath: string, value: unknown, force: boolean): Promise<void> {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`, force);
}

async function writeText(filePath: string, content: string, force: boolean): Promise<void> {
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  if (!force) {
    try {
      const handle = await open(target, "wx", 0o644);
      try {
        await handle.writeFile(content, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return;
    } catch (error) {
      if (plainObject(error) && error.code === "EEXIST") {
        throw new CliError(`Refusing to overwrite existing file: ${target}`, {
          hint: "Choose a different --out path or pass --force after reviewing the existing file.",
        });
      }
      throw error;
    }
  }

  if (await exists(target)) {
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink()) {
      throw new CliError(`Refusing to overwrite a symbolic link: ${target}`, {
        hint: "Remove the symbolic link or choose a regular output path.",
      });
    }
    if (!targetStat.isFile()) {
      throw new CliError(`Output path is not a regular file: ${target}`);
    }
  }
  const temporary = `${target}.tmp-${randomUUID()}`;
  try {
    const handle = await open(temporary, "wx", 0o644);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function markWorkingCopyOutput(outputDirectory: string, attestation: unknown): Promise<void> {
  const overallStatus = record(attestation).overall_status;
  const banner = workingCopyBanner(overallStatus);
  const files = await scanBundleTree(outputDirectory, { excludeManifest: true });
  for (const file of files) {
    if (!file.relativePath.toLowerCase().endsWith(".html")) continue;
    const html = await readFile(file.absolutePath, "utf8");
    if (html.includes('data-release-status="not-release-eligible"')) continue;
    const bodyMatch = /<body\b[^>]*>/iu.exec(html);
    const marked = bodyMatch === null
      ? `${banner}\n${html}`
      : `${html.slice(0, bodyMatch.index + bodyMatch[0].length)}\n${banner}${html.slice(bodyMatch.index + bodyMatch[0].length)}`;
    await writeText(file.absolutePath, marked, true);
  }

  const readmePath = path.join(outputDirectory, "README.txt");
  const existingReadme = (await exists(readmePath)) ? await readFile(readmePath, "utf8") : defaultPackageReadme();
  const warning = [
    "NOT RELEASE-ELIGIBLE — WORKING COPY",
    "=================================================",
    "",
    `Validation status: ${typeof overallStatus === "string" ? overallStatus : "unknown"}`,
    "Every validation check status is preserved in validation-attestation.json, including failed and not_run when present.",
    "This directory is for review only and must not be represented as a release bundle.",
    "",
  ].join("\n");
  await writeText(readmePath, `${warning}${existingReadme}`, true);
}

function unknownField(reason: string): Record<string, unknown> {
  return {
    state: "unknown",
    value: null,
    source_bindings: [],
    derivation_bindings: [],
    missing_reason: reason,
    provenance_status: "absent",
  };
}

function typedId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function createAuthoringScaffold(options: {
  title: string;
  language: string;
  projectId?: string;
}): Record<string, unknown> {
  if (options.title.trim().length === 0) {
    throw new CliError("The authoring scaffold title must contain non-whitespace text.");
  }
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(options.language)) {
    throw new CliError(`Invalid language tag: ${options.language}`, {
      hint: "Use a BCP 47-style tag such as en, zh-CN, or pt-BR.",
    });
  }
  if (
    options.projectId !== undefined &&
    !/^[A-Za-z][A-Za-z0-9._:-]{0,159}$/u.test(options.projectId)
  ) {
    throw new CliError(`Invalid project identifier: ${options.projectId}`, {
      hint: "Use an opaque contract identifier beginning with a letter; do not encode a protected label or path.",
    });
  }
  const projectId = options.projectId ?? typedId("prj");
  const universeId = typedId("srcu");
  const snapshotId = typedId("snap");
  const questionId = typedId("rq");
  const decisionTime = new Date().toISOString();
  const scopeReviewId = typedId("rvt");
  const inventoryReviewId = typedId("rvt");
  return {
    authoring_input_id: typedId("ain"),
    authoring_input_version: "1",
    schema_version: "1",
    project_id: projectId,
    title: options.title,
    language: options.language,
    report_mode: "full_archive",
    scope: {
      scope_statement: "Authoring scaffold; the scientific scope has not yet been established.",
      started_at: unknownField("The project start time has not yet been supplied from a source."),
      ended_at: unknownField("The project end time has not yet been supplied from a source."),
      cutoff_at: unknownField("The report cutoff has not yet been supplied from a source."),
      included_boundaries: [],
      excluded_boundaries: [],
    },
    enabled_modules: [
      {
        module_id: "core",
        protocol_version: "1",
        status: "enabled",
        applicability_decision_id: "applicability.core.always",
        detected_triggers: [],
        section_ids: [
          "identity_and_scope",
          "module_and_section_coverage",
          "source_universe_and_coverage",
          "research_questions_and_resolution",
          "entities_materials_and_systems",
          "execution_history",
          "methods_parameters_and_deviations",
          "results_failures_and_dispositions",
          "quantitative_derivations",
          "claims_arguments_and_bridges",
          "conflicts_counterevidence_and_uncertainty",
          "artifacts_and_reproducibility",
          "revisions_corrections_and_retractions",
          "disclosure_and_limitations",
          "validation_and_package_status",
        ],
      },
      {
        module_id: "wet_lab",
        protocol_version: "1",
        status: "undetermined",
        applicability_decision_id: "applicability.wet_lab.pending",
        detected_triggers: [],
        section_ids: ["wet_lab_material_identity", "wet_lab_design_and_controls", "wet_lab_protocol_and_measurement"],
      },
      {
        module_id: "ai_ml",
        protocol_version: "1",
        status: "undetermined",
        applicability_decision_id: "applicability.ai_ml.pending",
        detected_triggers: [],
        section_ids: ["ai_ml_data_and_labels", "ai_ml_training_and_selection", "ai_ml_evaluation_and_inference"],
      },
      {
        module_id: "molecular_dynamics",
        protocol_version: "1",
        status: "undetermined",
        applicability_decision_id: "applicability.molecular_dynamics.pending",
        detected_triggers: [],
        section_ids: ["md_system_construction", "md_execution_and_restarts", "md_analysis_and_convergence"],
      },
      {
        module_id: "cross_domain",
        protocol_version: "1",
        status: "undetermined",
        applicability_decision_id: "applicability.cross_domain.pending",
        detected_triggers: [],
        section_ids: ["cross_domain_alignment", "cross_domain_argument"],
      },
    ],
    source_coverage: {
      universe_id: universeId,
      title: "Unpopulated source universe",
      scope_statement: "No sources have been registered; the source boundary and overall completeness are not established.",
      inclusion_boundary: "No inclusion boundary has yet been approved.",
      exclusion_boundary: "No exclusion boundary has yet been approved.",
      cutoff: unknownField("No source-universe cutoff has been supplied from a source."),
      cutoff_event_semantics: unknownField("No source-universe cutoff event has been defined."),
      authority_basis: "none",
      authority_evidence: unknownField("No authoritative source-universe registry has been supplied."),
      enumeration_status: "open_ended",
      snapshot_bindings: [snapshotId],
      item_ids: [],
      snapshots: [
        {
          source_snapshot_id: snapshotId,
          created_at: unknownField("No source-registry snapshot time has been supplied."),
          registry_hash: unknownField("No populated source-registry snapshot exists to hash."),
          snapshot_method: unknownField("No source-registry snapshot method has been recorded."),
          source_bindings: [],
        },
      ],
      items: [],
      reconciliation: {
        registered: 0,
        terminally_disposed: 0,
        included: 0,
        excluded_with_reason: 0,
        unreadable: 0,
        inaccessible: 0,
        duplicate: 0,
        unmapped: 0,
        pending: 0,
        included_mapped: 0,
      },
      coverage_axes: {
        inventory_accounting: "unknown",
        accessibility: "unknown",
        scientific_incorporation: "none",
      },
      report_completeness: "cannot_be_established",
      coverage_limitations: [
        "No authoritative source universe, approved discovery process, or registered source item has been supplied.",
      ],
    },
    input_chunks: [],
    id_registry: [
      {
        object_type: "research_question",
        local_key: questionId,
        canonical_id: questionId,
        object_version: "1",
        identity_status: "review_required",
      },
      ...[
        "applicability.core.always",
        "applicability.wet_lab.pending",
        "applicability.ai_ml.pending",
        "applicability.molecular_dynamics.pending",
        "applicability.cross_domain.pending",
      ].map((decisionId) => ({
        object_type: "applicability_decision",
        local_key: decisionId,
        canonical_id: decisionId,
        object_version: "1",
        identity_status: "review_required",
      })),
    ],
    existing_objects: [],
    records: [
      {
        record_id: questionId,
        record_kind: "research_question",
        execution_assertion: "unknown",
        domain_module_id: "core",
        subject_ids: [],
        payload: {
          question: "Which scientific question should this bounded report evaluate?",
          resolution_criterion_timing: "missing",
          resolution_status: "not_evaluable",
        },
        source_bindings: [],
        missing_fields: [],
        review_status: "review_required",
      },
      ...[
        ["applicability.core.always", "core", "applicable", "The core reporting contract always applies."],
        ["applicability.wet_lab.pending", "wet_lab", "undetermined", "Wet-lab applicability has not been assessed."],
        ["applicability.ai_ml.pending", "ai_ml", "undetermined", "AI/ML applicability has not been assessed."],
        ["applicability.molecular_dynamics.pending", "molecular_dynamics", "undetermined", "Molecular-dynamics applicability has not been assessed."],
        ["applicability.cross_domain.pending", "cross_domain", "undetermined", "Cross-domain applicability has not been assessed."],
      ].map(([decisionId, moduleId, result, evaluatedContext]) => ({
        record_id: decisionId,
        record_kind: "applicability_decision",
        execution_assertion: "unknown",
        domain_module_id: "core",
        subject_ids: [],
        payload: {
          target_kind: "module",
          target_pointer_or_section_id: moduleId,
          rule_id: "FA004",
          result,
          evaluated_context: evaluatedContext,
          decision_time: decisionTime,
        },
        source_bindings: [],
        missing_fields: [],
        review_status: result === "applicable" ? "author_confirmed" : "review_required",
      })),
    ],
    review_tasks: [
      {
        review_task_id: scopeReviewId,
        category: "other",
        description: "Define the scientific scope, inclusion/exclusion boundaries, and report cutoff from accountable records.",
        severity: "blocking",
        affected_object_ids: [projectId],
        required_reviewer_role: "report author",
        status: "open",
      },
      {
        review_task_id: inventoryReviewId,
        category: "other",
        description: "Register the source universe, create a snapshot, and explicitly dispose every registered source item.",
        severity: "blocking",
        affected_object_ids: [universeId, snapshotId],
        required_reviewer_role: "source custodian",
        status: "open",
      },
    ],
    disclosure_level: "public",
    extensions: {
      scaffold_state: "unpopulated",
    },
  };
}

function collectUnknownTodos(value: unknown, includeOpenReviewTasks = true): unknown[] {
  const todos: unknown[] = [];
  const seen = new WeakSet<object>();
  const visit = (current: unknown, pointer: string): void => {
    if (typeof current !== "object" || current === null || seen.has(current)) return;
    seen.add(current);
    if (!Array.isArray(current)) {
      const object = current as Record<string, unknown>;
      if (object.state === "unknown") {
        todos.push({
          code: "UNKNOWN_FIELD",
          severity: "warning",
          pointer: pointer || "/",
          message: stringField(object.missing_reason ?? object.reason, "A field remains explicitly unknown."),
        });
      }
      if (includeOpenReviewTasks && object.status === "open" && typeof object.description === "string") {
        todos.push({
          code: stringField(object.review_task_id, "OPEN_REVIEW_TASK"),
          severity: stringField(object.severity, "warning"),
          pointer: pointer || "/",
          message: object.description,
        });
      }
    }
    const entries: [string, unknown][] = Array.isArray(current)
      ? current.map((item, index) => [String(index), item])
      : Object.entries(current as Record<string, unknown>);
    for (const [key, child] of entries) {
      const escaped = key.replaceAll("~", "~0").replaceAll("/", "~1");
      visit(child, `${pointer}/${escaped}`);
    }
  };
  visit(value, "");
  return todos;
}

function dedupeTodos(items: readonly unknown[]): unknown[] {
  const byKey = new Map<string, unknown>();
  for (const item of items) {
    const source = record(item);
    const todoId = source.todo_id;
    const key = typeof todoId === "string" && todoId.length > 0
      ? `todo\0${todoId}`
      : `${findingCode(item)}\0${findingPath(item) ?? ""}\0${findingMessage(item)}`;
    byKey.set(key, item);
  }
  return [...byKey.values()];
}

async function loadVersion(): Promise<string> {
  const candidates = [
    fileURLToPath(new URL("../../VERSION", import.meta.url)),
    fileURLToPath(new URL("../../../VERSION", import.meta.url)),
    fileURLToPath(new URL("../../../../VERSION", import.meta.url)),
    path.resolve(process.cwd(), "VERSION"),
  ];
  for (const candidate of candidates) {
    try {
      const version = (await readFile(candidate, "utf8")).trim();
      if (version.length > 0) return version;
    } catch (error) {
      if (!(plainObject(error) && error.code === "ENOENT")) throw error;
    }
  }
  return DEFAULT_VERSION;
}

async function locateProjectFile(relativePath: string): Promise<string> {
  const candidates = [
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)),
    path.resolve(process.cwd(), relativePath),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new CliError(`Required project file was not found: ${relativePath}`, {
    hint: `Install the complete package or run from the project root. Checked: ${candidates.join(", ")}`,
  });
}

async function explainRule(ruleCode: string | undefined, jsonOutput: boolean): Promise<void> {
  const registryPath = await locateProjectFile("rules/registry.yaml");
  const registry = parseYaml(await readFile(registryPath, "utf8")) as unknown;
  const registryObject = record(registry);
  const rules = array(registryObject.rules).filter(plainObject);
  if (ruleCode === undefined) {
    if (jsonOutput) {
      process.stdout.write(`${JSON.stringify({ registry_version: registryObject.registry_version, rules }, null, 2)}\n`);
      return;
    }
    process.stdout.write(`Rule registry ${stringField(registryObject.registry_version, "unknown version")} (${rules.length} rules)\n`);
    for (const rule of rules) {
      process.stdout.write(`- ${stringField(rule.id, "UNKNOWN")}: ${stringField(rule.title, "Untitled rule")} [${stringField(rule.severity, "unspecified")}]\n`);
    }
    process.stdout.write("\nRun 'scientific-report-console explain <RULE_CODE>' for condition and remediation details.\n");
    return;
  }

  const normalizedCode = ruleCode.toUpperCase();
  const matched = rules.find((rule) => String(rule.id).toUpperCase() === normalizedCode);
  if (matched === undefined) {
    const prefix = normalizedCode.slice(0, 3);
    const suggestions = rules
      .map((rule) => String(rule.id))
      .filter((id) => id.startsWith(prefix))
      .slice(0, 8);
    throw new CliError(`Rule code not found: ${ruleCode}`, {
      hint:
        suggestions.length > 0
          ? `Related codes: ${suggestions.join(", ")}. Run 'scientific-report-console explain' to list all rules.`
          : "Run 'scientific-report-console explain' to list all registered rule codes.",
    });
  }
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(matched, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${stringField(matched.id, normalizedCode)} — ${stringField(matched.title, "Untitled rule")}\n`);
  process.stdout.write(`Severity: ${stringField(matched.severity, "unspecified")}\n`);
  process.stdout.write(`Pointer: ${stringField(matched.pointer_hint, "not specified")}\n\n`);
  process.stdout.write(`Condition\n${stringField(matched.condition, "Not specified.")}\n\n`);
  process.stdout.write(`Message\n${stringField(matched.message, "Not specified.")}\n\n`);
  process.stdout.write(`Action\n${stringField(matched.remediation, "Consult the rule registry.")}\n`);
  const waiver = record(matched.waiver_policy);
  process.stdout.write(`\nWaiver: ${waiver.allowed === true ? "allowed under the recorded policy" : "not allowed"}\n`);
  if (typeof waiver.rationale === "string") process.stdout.write(`${waiver.rationale}\n`);
}

function normalizedOutputPath(inputPath: string, explicit: string | undefined): string {
  if (explicit !== undefined) return path.resolve(explicit);
  return path.join(path.dirname(path.resolve(inputPath)), "scientific-report.json");
}

async function performNormalize(
  inputPath: string,
  options: {
    out?: string;
    force: boolean;
    json: boolean;
    inMemory: boolean;
    createdAt?: string;
    reportId?: string;
    reportVersion?: string;
  },
): Promise<NormalizeResult> {
  const absoluteInput = path.resolve(inputPath);
  const normalizationOptions = {
    ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    ...(options.reportId === undefined ? {} : { reportId: options.reportId }),
    ...(options.reportVersion === undefined ? {} : { reportVersion: options.reportVersion }),
  };
  const result = options.inMemory
    ? await normalizeAuthoringInput(await readJson(absoluteInput), normalizationOptions)
    : await normalizeAuthoringFile(absoluteInput, normalizationOptions);
  if (!plainObject(result) || !("report" in result)) {
    throw new CliError("Normalizer returned no report object.", {
      hint: "Inspect normalizer findings and ensure the authoring input matches the active schema.",
    });
  }
  const normalized: Required<Pick<NormalizeResult, "report" | "findings">> & { todo: unknown[] } = {
    report: result.report,
    findings: array(result.findings),
    todo: normalizationTodo(result),
  };
  const outputPath = normalizedOutputPath(absoluteInput, options.out);
  if (outputPath === absoluteInput) {
    throw new CliError("Refusing to overwrite the authoring input with the normalized report.", {
      hint: "Choose a separate --out path so the source-bound authoring record remains available for review.",
    });
  }
  await writeJson(outputPath, normalized.report, options.force);
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({ output: outputPath, findings: normalized.findings, todo: normalized.todo }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(`Normalized report written to ${outputPath}\n`);
    process.stdout.write(`Findings: ${normalized.findings.length}; open todo items: ${normalized.todo.length}\n`);
    printFindings(normalized.findings);
  }
  if (hasBlocking(normalized.findings)) process.exitCode = 1;
  return normalized;
}

async function performProject(
  inputPath: string,
  options: {
    out: string;
    projectionOut: string;
    projectionId: string;
    createdAt: string;
    policyPath: string;
    instructionsPath?: string;
    force: boolean;
    json: boolean;
  },
): Promise<void> {
  const absoluteInput = path.resolve(inputPath);
  const outputPath = path.resolve(options.out);
  const projectionOutputPath = path.resolve(options.projectionOut);
  if (new Set([absoluteInput, outputPath, projectionOutputPath]).size !== 3) {
    throw new CliError("Canonical source, public report, and projection record must use three distinct paths.");
  }
  const sourceValue = await readJson(absoluteInput);
  const policyValue = await readJson(path.resolve(options.policyPath));
  if (!plainObject(sourceValue) || !plainObject(policyValue)) {
    throw new CliError("Canonical report and disclosure policy must both be JSON objects.");
  }
  if (
    typeof policyValue.policy_id !== "string" ||
    typeof policyValue.policy_version !== "string" ||
    !("rules" in policyValue)
  ) {
    throw new CliError("Disclosure policy requires policy_id, policy_version, and rules.");
  }
  let instructions: ProjectionInstruction[] = [];
  if (options.instructionsPath !== undefined) {
    const instructionValue = await readJson(path.resolve(options.instructionsPath));
    const candidates = Array.isArray(instructionValue)
      ? instructionValue
      : plainObject(instructionValue) && Array.isArray(instructionValue.instructions)
        ? instructionValue.instructions
        : null;
    if (candidates === null || !candidates.every(plainObject)) {
      throw new CliError("Projection instructions must be a JSON array of instruction objects (or an object with an instructions array).");
    }
    instructions = candidates as unknown as ProjectionInstruction[];
  }
  const sourceDisclosure = plainObject(sourceValue.disclosure_state) ? sourceValue.disclosure_state : {};
  if (sourceDisclosure.level !== "public" && instructions.length === 0) {
    throw new CliError("A non-public canonical report cannot be projected with an empty instruction set.", {
      hint: "Supply reviewed --instructions that explicitly withhold, omit, generalize, replace, or hash protected fields.",
    });
  }
  const result = projectDisclosure(sourceValue as unknown as ScientificReport, {
    projectionId: options.projectionId,
    createdAt: options.createdAt,
    policy: policyValue as unknown as DisclosureProjectionPolicy,
    instructions,
  });
  await writeJson(outputPath, result.report, options.force);
  await writeJson(projectionOutputPath, result.projection, options.force);
  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      public_report: outputPath,
      disclosure_projection: projectionOutputPath,
      projection_status: result.projection.projection_status,
      projected_payload_hash: result.projection.projected_payload_hash,
      field_action_count: result.projection.field_actions.length,
    }, null, 2)}\n`);
  } else {
    process.stdout.write(`Public report written to ${outputPath}\n`);
    process.stdout.write(`Disclosure projection written to ${projectionOutputPath}\n`);
    process.stdout.write(`Projection status: ${result.projection.projection_status}; explicit field actions: ${result.projection.field_actions.length}\n`);
  }
  if (result.projection.projection_status !== "complete") process.exitCode = 1;
}

async function performValidate(
  inputPath: string,
  options: {
    attestationOut?: string;
    sourceReport?: string;
    projection?: string;
    force: boolean;
    json: boolean;
  },
): Promise<ValidateResult> {
  const disclosureProjection = await readDisclosureValidationInput(
    options.sourceReport,
    options.projection,
    false,
  );
  const result = await validateReportFile(path.resolve(inputPath), {
    ...(disclosureProjection === undefined ? {} : { disclosureProjection }),
  });
  const validated: ValidateResult = {
    valid: result.valid === true,
    ...(typeof result.complete === "boolean" ? { complete: result.complete } : {}),
    ...(typeof result.releaseEligible === "boolean" ? { releaseEligible: result.releaseEligible } : {}),
    findings: array(result.findings),
    attestation: result.attestation,
  };
  if (options.attestationOut !== undefined) {
    if (path.resolve(options.attestationOut) === path.resolve(inputPath)) {
      throw new CliError("Refusing to overwrite the scientific report with its validation attestation.", {
        hint: "Choose a separate --attestation-out path, normally validation-attestation.json.",
      });
    }
    if (validated.attestation === undefined || validated.attestation === null) {
      throw new CliError("Validator returned no attestation to write.", {
        hint: "Resolve validator execution errors and run validation again.",
      });
    }
    await writeJson(options.attestationOut, validated.attestation, options.force);
  }
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          valid: validated.valid,
          complete: validated.complete ?? null,
          release_eligible: validated.releaseEligible ?? null,
          findings: validated.findings,
          attestation: validated.attestation,
          attestation_output: options.attestationOut ?? null,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(`Validation status: ${validated.valid ? "valid" : "not valid"}\n`);
    if (validated.complete !== undefined) {
      process.stdout.write(`Implemented-check coverage: ${validated.complete ? "complete" : "incomplete"}\n`);
    }
    if (validated.releaseEligible !== undefined) {
      process.stdout.write(`Release gate: ${validated.releaseEligible ? "eligible" : "not eligible"}\n`);
    }
    if (options.attestationOut !== undefined) {
      process.stdout.write(`Attestation written to ${path.resolve(options.attestationOut)}\n`);
    } else {
      process.stdout.write("Attestation was not written (use --attestation-out <file> to persist it).\n");
    }
    printFindings(validated.findings);
  }
  if (!validated.valid) process.exitCode = 1;
  return validated;
}

async function performTodo(inputPath: string, jsonOutput: boolean): Promise<void> {
  const absolute = path.resolve(inputPath);
  const input = await readJson(absolute);
  const source = record(input);
  let pipelineTodos: unknown[] = [];
  let findings: unknown[] = [];
  const isAuthoringInput = typeof source.authoring_input_id === "string";

  if (isAuthoringInput) {
    const result = await normalizeAuthoringFile(absolute);
    pipelineTodos = normalizationTodo(result);
    findings = array(result.findings);
  } else if (typeof source.report_id === "string") {
    const result = await validateReportFile(absolute);
    findings = array(result.findings);
  } else {
    throw new CliError("Input is neither an authoring-input object nor a scientific-report object.", {
      hint: "Use a JSON document with authoring_input_id or report_id and its corresponding active schema.",
    });
  }

  const todos = dedupeTodos([
    ...pipelineTodos,
    ...collectUnknownTodos(input, !isAuthoringInput),
    ...findings.filter((item) => isBlocking(item) || severityOf(item) === "warning"),
  ]);
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify({ input: absolute, total: todos.length, todo: todos }, null, 2)}\n`);
  } else {
    process.stdout.write(`Open authoring/review items: ${todos.length}\n`);
    if (todos.length === 0) {
      process.stdout.write("No open items were discovered by the implemented checks. This is not proof of scientific completeness.\n");
    } else {
      printFindings(todos);
    }
    process.stdout.write(
      "\nnot_applicable and withheld states are preserved as resolved epistemic states; they are not silently converted into unknown-value tasks.\n",
    );
  }
}

function renderOutputDirectory(result: RenderResult): string {
  return path.resolve(result.outDir);
}

async function stageReplayArtifacts(
  report: unknown,
  inputPath: string,
  outputDirectory: string,
  explicitArtifactRoot?: string,
): Promise<void> {
  const contract = collectReplayArtifactRequirements(report);
  if (contract.issues.length > 0) {
    throw new CliError(`R1+ replay artifact contract is incomplete: ${contract.issues.map((issue) => issue.message).join("; ")}`);
  }
  if (contract.requirements.length === 0) return;
  const root = await realpath(path.resolve(explicitArtifactRoot ?? path.dirname(inputPath))).catch((error: unknown) => {
    throw new CliError(`Cannot resolve replay artifact root: ${error instanceof Error ? error.message : String(error)}`);
  });
  for (const requirement of contract.requirements) {
    const source = path.resolve(root, ...requirement.path.split("/"));
    if (!isPathInside(root, source)) {
      throw new CliError(`Replay artifact path escapes --artifact-root: ${requirement.path}`);
    }
    const info = await lstat(source).catch((error: unknown) => {
      throw new CliError(`Declared R1+ artifact ${requirement.artifactId} is unavailable at ${source}: ${error instanceof Error ? error.message : String(error)}`);
    });
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new CliError(`Declared R1+ artifact must be a regular non-symlink file: ${source}`);
    }
    const canonicalSource = await realpath(source);
    if (!isPathInside(root, canonicalSource)) {
      throw new CliError(`Declared R1+ artifact resolves outside --artifact-root: ${requirement.path}`);
    }
    const digest = await sha256File(canonicalSource);
    if (digest.contentHash !== requirement.contentHash || digest.byteSize !== requirement.byteSize) {
      throw new CliError(`Declared R1+ artifact bytes do not match report metadata: ${requirement.artifactId}`);
    }
    const target = path.resolve(outputDirectory, ...requirement.path.split("/"));
    if (!isPathInside(outputDirectory, target)) {
      throw new CliError(`Replay artifact output escapes render directory: ${requirement.path}`);
    }
    await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    await copyFile(canonicalSource, target);
    await chmod(target, 0o644);
  }
}

async function performRender(
  inputPath: string,
  outputPath: string,
  options: {
    force: boolean;
    json: boolean;
    workingCopy: boolean;
    sourceReport: string;
    projection: string;
    artifactRoot?: string;
  },
): Promise<{ bundle: BundleResult; verification: Awaited<ReturnType<typeof verifyBundle>> }> {
  const absoluteInput = path.resolve(inputPath);
  const outputRoot = path.resolve(outputPath);
  if (outputRoot === absoluteInput || isPathInside(outputRoot, absoluteInput)) {
    throw new CliError(`Refusing to render into a directory that contains the input report: ${outputRoot}`, {
      hint: "Choose a new --out directory outside the input report's containing tree; --force never authorizes deleting source input.",
    });
  }
  const report = await readJson(absoluteInput);
  const disclosureProjection = await readDisclosureValidationInput(
    options.sourceReport,
    options.projection,
    true,
  );
  if (disclosureProjection === undefined) throw new CliError("Disclosure projection inputs are required.");
  const validation = await validateReport(report, { disclosureProjection });
  const releaseReady =
    validation.valid === true && validation.complete === true && validation.releaseEligible === true;
  if (!releaseReady && !options.workingCopy) {
    const findings = array(validation.findings);
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            rendered: false,
            stage: "validation",
            valid: validation.valid,
            complete: validation.complete,
            release_eligible: validation.releaseEligible,
            findings,
          },
          null,
          2,
        )}\n`,
      );
    } else {
      printFindings(findings);
    }
    assertRenderEligibility(validation, false);
  }
  if (validation.attestation === undefined || validation.attestation === null) {
    throw new CliError("Rendering refused because validation returned no payload-bound attestation.", {
      hint: "Run the validator successfully and ensure it emits a validation attestation.",
    });
  }

  await mkdir(path.dirname(outputRoot), { recursive: true });
  const renderStage = `${outputRoot}.render-${randomUUID()}`;
  if (isPathInside(renderStage, absoluteInput)) {
    throw new CliError("Input report cannot be inside the temporary render output directory.");
  }
  try {
    const renderResult = await renderReport(report, {
      outDir: renderStage,
      attestation: validation.attestation,
    });
    if (!plainObject(renderResult) || typeof renderResult.payloadHash !== "string") {
      throw new CliError("Renderer returned an incomplete result (payloadHash is missing).", {
        hint: "Inspect renderer diagnostics; no bundle verification claim has been made.",
      });
    }
    if (renderResult.validationAttestationBound === false) {
      throw new CliError("Renderer reported that the validation attestation does not bind the rendered payload bytes.", {
        hint: "Revalidate the exact canonical public payload and render again.",
      });
    }
    await writeJson(
      path.join(renderStage, "disclosure-projection.json"),
      disclosureProjection.projection,
      false,
    );
    await stageReplayArtifacts(report, absoluteInput, renderStage, options.artifactRoot);
    const renderedDirectory = renderOutputDirectory(renderResult);
    if (options.workingCopy) {
      await markWorkingCopyOutput(renderedDirectory, validation.attestation);
    }
    const bundle = await bundleDirectory(renderedDirectory, outputRoot, {
      force: options.force,
      createReadme: true,
      ...(options.workingCopy
        ? {
            extensions: {
              artifact_mode: "working_copy",
              release_notice: "NOT RELEASE-ELIGIBLE — WORKING COPY",
              release_status: "not_release_eligible",
              validation_completeness: validation.complete === true ? "complete" : "incomplete",
            },
          }
        : {}),
    });
    const verification = await verifyBundle(outputRoot, {
      requireValidAttestation: !options.workingCopy,
    });
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            outDir: bundle.outDir,
            files: bundle.files,
            workingCopy: options.workingCopy,
            releaseNotice: options.workingCopy ? "NOT RELEASE-ELIGIBLE — WORKING COPY" : null,
            releaseEligible: options.workingCopy ? false : releaseReady,
            sourceReportReleaseEligible: releaseReady,
            attestationStatus: record(validation.attestation).overall_status ?? null,
            payloadHash: renderResult.payloadHash,
            manifestPath: bundle.manifestPath,
            verification,
          },
          null,
          2,
        )}\n`,
      );
    } else {
      if (options.workingCopy) {
        process.stdout.write(
          `NOT RELEASE-ELIGIBLE — WORKING COPY. Validation status is ${String(record(validation.attestation).overall_status ?? "unknown")}; validation-attestation.json preserves every check status, including failed and not_run when present.\n`,
        );
      }
      process.stdout.write(`Rendered and bundled report: ${bundle.outDir}\n`);
      process.stdout.write(`Payload hash: ${renderResult.payloadHash}\n`);
      process.stdout.write(`Manifest: ${bundle.manifestPath}\n`);
      process.stdout.write(formatVerificationResult(verification));
    }
    if (!verification.ok) process.exitCode = 1;
    return { bundle, verification };
  } finally {
    await rm(renderStage, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function locateDemoFixture(): Promise<string> {
  const relativeCandidates = [
    "examples/cross-domain/scientific-report.json",
    "examples/minimal/scientific-report.json",
  ];
  for (const relative of relativeCandidates) {
    try {
      return await locateProjectFile(relative);
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
    }
  }
  throw new CliError("No demonstration scientific report fixture is available.", {
    hint:
      "Add examples/cross-domain/scientific-report.json (preferred) or examples/minimal/scientific-report.json, then run demo again. The CLI will not invent placeholder scientific facts.",
  });
}

function defaultBundleOutput(source: string): string {
  const absolute = path.resolve(source);
  return path.join(path.dirname(absolute), `${path.basename(absolute)}-bundle`);
}

function configureCommands(program: Command): void {
  program
    .command("init")
    .description("Create a source-empty authoring scaffold without inventing scientific facts")
    .argument("[directory]", "directory that will contain the authoring file", ".")
    .option("--file <name>", "authoring filename relative to the directory", AUTHORING_FILE)
    .option("--title <title>", "report title", "Untitled scientific report")
    .option("--language <tag>", "BCP 47 language tag", "en")
    .option("--project-id <id>", "existing opaque project identifier")
    .option("--force", "replace an existing regular authoring file", false)
    .action(async (directory: string, options: Record<string, unknown>) => {
      const root = path.resolve(directory);
      const filename = stringField(options.file, AUTHORING_FILE);
      const output = path.resolve(root, filename);
      if (!isPathInside(root, output)) {
        throw new CliError(`--file must stay inside the initialization directory: ${filename}`);
      }
      const scaffold = createAuthoringScaffold({
        title: stringField(options.title, "Untitled scientific report"),
        language: stringField(options.language, "en"),
        ...(typeof options.projectId === "string" ? { projectId: options.projectId } : {}),
      });
      await writeJson(output, scaffold, options.force === true);
      process.stdout.write(`Authoring scaffold created: ${output}\n`);
      process.stdout.write(
        "The scaffold records unknown scope and source-inventory state explicitly. Complete its open review tasks before normalization or release.\n",
      );
    });

  program
    .command("normalize")
    .description("Normalize a compact authoring input into a canonical report candidate")
    .argument("<input>", "authoring-input JSON file")
    .option("-o, --out <file>", "output JSON path (default: scientific-report.json beside input)")
    .option("--created-at <timestamp>", "report creation time as a canonical ISO 8601 UTC timestamp")
    .option("--report-id <id>", "registered report identifier for the normalized candidate")
    .option("--report-version <version>", "report revision for the normalized candidate")
    .option("--force", "replace an existing regular output file", false)
    .option("--json", "emit machine-readable command results", false)
    .option("--in-memory", "load JSON and call the object normalizer instead of the file helper", false)
    .action(async (input: string, options: Record<string, unknown>) => {
      await performNormalize(input, {
        ...(typeof options.out === "string" ? { out: options.out } : {}),
        force: options.force === true,
        json: options.json === true,
        inMemory: options.inMemory === true,
        ...(typeof options.createdAt === "string" ? { createdAt: options.createdAt } : {}),
        ...(typeof options.reportId === "string" ? { reportId: options.reportId } : {}),
        ...(typeof options.reportVersion === "string" ? { reportVersion: options.reportVersion } : {}),
      });
    });

  program
    .command("project")
    .description("Create a hash-bound public disclosure projection from a canonical report")
    .argument("<input>", "canonical_authoritative scientific-report JSON file")
    .requiredOption("-o, --out <file>", "public scientific-report JSON output")
    .requiredOption("--projection-out <file>", "disclosure-projection record output")
    .requiredOption("--projection-id <id>", "stable projection identifier")
    .requiredOption("--created-at <timestamp>", "canonical ISO 8601 UTC projection time")
    .requiredOption("--policy <file>", "JSON disclosure policy with policy_id, policy_version, and rules")
    .option("--instructions <file>", "JSON array of explicit projection field actions")
    .option("--force", "replace existing regular output files", false)
    .option("--json", "emit machine-readable projection results", false)
    .action(async (input: string, options: Record<string, unknown>) => {
      await performProject(input, {
        out: stringField(options.out, ""),
        projectionOut: stringField(options.projectionOut, ""),
        projectionId: stringField(options.projectionId, ""),
        createdAt: stringField(options.createdAt, ""),
        policyPath: stringField(options.policy, ""),
        ...(typeof options.instructions === "string" ? { instructionsPath: options.instructions } : {}),
        force: options.force === true,
        json: options.json === true,
      });
    });

  program
    .command("todo")
    .description("List explicit unknown fields, open review tasks, and actionable findings")
    .argument("<input>", "authoring-input or scientific-report JSON file")
    .option("--json", "emit machine-readable todo records", false)
    .action(async (input: string, options: Record<string, unknown>) => {
      await performTodo(input, options.json === true);
    });

  program
    .command("validate")
    .description("Run structural and semantic validation without modifying the input")
    .argument("<input>", "scientific-report JSON file")
    .option("--attestation-out <file>", "write the returned attestation to this file")
    .option("--source-report <file>", "canonical source report used to verify a public projection")
    .option("--projection <file>", "disclosure-projection record paired with --source-report")
    .option("--force", "replace an existing regular attestation file", false)
    .option("--json", "emit findings and attestation as JSON", false)
    .action(async (input: string, options: Record<string, unknown>) => {
      await performValidate(input, {
        ...(typeof options.attestationOut === "string" ? { attestationOut: options.attestationOut } : {}),
        ...(typeof options.sourceReport === "string" ? { sourceReport: options.sourceReport } : {}),
        ...(typeof options.projection === "string" ? { projection: options.projection } : {}),
        force: options.force === true,
        json: options.json === true,
      });
    });

  program
    .command("explain")
    .description("Explain one rule, or list every rule when no code is supplied")
    .argument("[rule-code]", "registered rule code such as COV001")
    .option("--json", "emit the rule record as JSON", false)
    .action(async (ruleCode: string | undefined, options: Record<string, unknown>) => {
      await explainRule(ruleCode, options.json === true);
    });

  program
    .command("render")
    .description("Validate, deterministically render, package, and verify a scientific report")
    .argument("<input>", "public_projection scientific-report JSON file")
    .requiredOption("-o, --out <directory>", "new offline bundle directory")
    .requiredOption("--source-report <file>", "canonical source report used to verify disclosure projection")
    .requiredOption("--projection <file>", "disclosure-projection record")
    .option("--artifact-root <directory>", "root containing declared relative R1+ artifact locations (default: report directory)")
    .option("--force", "atomically replace an existing non-symlink output", false)
    .option(
      "--working-copy",
      "render renderer-safe input with incomplete/nonvalid semantic checks as a clearly non-release working copy",
      false,
    )
    .option("--json", "emit render, manifest, and verification results as JSON", false)
    .action(async (input: string, options: Record<string, unknown>) => {
      await performRender(input, stringField(options.out, ""), {
        force: options.force === true,
        json: options.json === true,
        workingCopy: options.workingCopy === true,
        sourceReport: stringField(options.sourceReport, ""),
        projection: stringField(options.projection, ""),
        ...(typeof options.artifactRoot === "string" ? { artifactRoot: options.artifactRoot } : {}),
      });
    });

  program
    .command("bundle")
    .description("Copy a rendered tree into a fresh SHA-256-manifested offline bundle")
    .argument("<source>", "rendered source directory")
    .option("-o, --out <directory>", "new bundle directory (default: <source>-bundle)")
    .option("--force", "atomically replace an existing non-symlink output", false)
    .addOption(new Option("--no-create-readme", "require an existing README.txt instead of creating the standard one"))
    .option("--json", "emit bundle and verification results as JSON", false)
    .action(async (source: string, options: Record<string, unknown>) => {
      const output = typeof options.out === "string" ? options.out : defaultBundleOutput(source);
      const bundled = await bundleDirectory(source, output, {
        force: options.force === true,
        createReadme: options.createReadme !== false,
      });
      const verification = await verifyBundle(bundled.outDir);
      if (options.json === true) {
        process.stdout.write(`${JSON.stringify({ bundle: bundled, verification }, null, 2)}\n`);
      } else {
        process.stdout.write(`Bundle created: ${bundled.outDir}\n`);
        process.stdout.write(`Manifest: ${bundled.manifestPath}\n`);
        process.stdout.write(formatVerificationResult(verification));
      }
      if (!verification.ok) process.exitCode = 1;
    });

  program
    .command("verify")
    .description("Verify final bundle paths, inventory, SHA-256 hashes, binding, and offline references")
    .argument("<bundle>", "offline bundle directory")
    .option("--json", "emit the verification result as JSON", false)
    .option("--working-copy", "verify a marked working copy without treating it as release-eligible", false)
    .option("--allow-nonvalid-attestation", "deprecated alias for --working-copy", false)
    .option("--allow-extra-files", "do not fail for unmanifested regular files", false)
    .action(async (bundle: string, options: Record<string, unknown>) => {
      const workingCopy = options.workingCopy === true || options.allowNonvalidAttestation === true;
      const result = await verifyBundle(bundle, {
        requireValidAttestation: !workingCopy,
        rejectExtraFiles: options.allowExtraFiles !== true,
      });
      if (options.json === true) {
        process.stdout.write(
          `${JSON.stringify(
            workingCopy
              ? {
                  workingCopy: true,
                  releaseNotice: "NOT RELEASE-ELIGIBLE — WORKING COPY",
                  verification: result,
                }
              : result,
            null,
            2,
          )}\n`,
        );
      } else {
        if (workingCopy) {
          process.stdout.write("NOT RELEASE-ELIGIBLE — WORKING COPY. Integrity verification does not make this a release bundle.\n");
        }
        process.stdout.write(formatVerificationResult(result));
      }
      if (!result.ok) process.exitCode = 1;
    });

  program
    .command("demo")
    .description("Render the checked-in cross-domain example, falling back to the minimal example")
    .option("--input <file>", "explicit demonstration report JSON file")
    .option("-o, --out <directory>", "new demonstration bundle directory", "dist/demo")
    .option("--force", "atomically replace an existing non-symlink demo output", false)
    .option(
      "--release-only",
      "require a fully valid, complete, release-eligible demonstration instead of the marked working-copy mode",
      false,
    )
    .option("--json", "emit render and verification results as JSON", false)
    .action(async (options: Record<string, unknown>) => {
      const fixture = typeof options.input === "string" ? path.resolve(options.input) : await locateDemoFixture();
      const fixtureDirectory = path.dirname(fixture);
      if (options.json !== true) process.stdout.write(`Demo input: ${fixture}\n`);
      await performRender(fixture, stringField(options.out, "dist/demo"), {
        force: options.force === true,
        json: options.json === true,
        workingCopy: options.releaseOnly !== true,
        sourceReport: path.join(fixtureDirectory, "scientific-report.canonical.json"),
        projection: path.join(fixtureDirectory, "disclosure-projection.json"),
        artifactRoot: fixtureDirectory,
      });
    });
}

export function createCliProgram(version = DEFAULT_VERSION): Command {
  const program = new Command();
  program
    .name("scientific-report-reference")
    .description("Provider-neutral authoring, validation, rendering, and offline bundle toolchain")
    .version(version)
    .showHelpAfterError()
    .showSuggestionAfterError()
    .exitOverride();
  configureCommands(program);
  return program;
}

export async function runCli(argv: readonly string[] = process.argv): Promise<number> {
  const version = await loadVersion();
  const program = createCliProgram(version);
  process.exitCode = 0;
  try {
    await program.parseAsync([...argv]);
  } catch (error) {
    if (error instanceof CommanderError) {
      if (["commander.helpDisplayed", "commander.version"].includes(error.code)) return 0;
      process.stderr.write(`Error: ${error.message}\n`);
      return error.exitCode || 1;
    }
    if (error instanceof CliError) {
      process.stderr.write(`Error: ${error.message}\n`);
      if (error.hint !== null) process.stderr.write(`Action: ${error.hint}\n`);
      return error.exitCode;
    }
    if (error instanceof BundleBuildError) {
      process.stderr.write(`Error [${error.code}]: ${error.message}\n`);
      process.stderr.write("Action: Correct the rendered tree or choose a safe, unused output path, then run the command again.\n");
      return 1;
    }
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  return process.exitCode ?? 0;
}

export async function isDirectCliInvocation(
  argvEntry: string | undefined,
  moduleUrl = import.meta.url,
): Promise<boolean> {
  if (argvEntry === undefined) return false;
  const modulePath = path.resolve(fileURLToPath(moduleUrl));
  const entryPath = path.resolve(argvEntry);
  try {
    return path.resolve(await realpath(entryPath)) === path.resolve(await realpath(modulePath));
  } catch {
    // Preserve direct source execution diagnostics when either path disappears
    // between process startup and this check. A missing symlink target still
    // compares false and cannot accidentally execute an imported module.
    return entryPath === modulePath;
  }
}

if (await isDirectCliInvocation(process.argv[1])) {
  const code = await runCli(process.argv);
  process.exitCode = code;
}
