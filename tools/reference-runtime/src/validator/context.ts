import type { JsonObject, JsonValue } from "../lib/json.js";
import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import type { ScientificField, ScientificReport, SourceBinding } from "../lib/types.js";
import type {
  ObjectRecord,
  SemanticContext,
  ValidationCategory,
  ValidationFinding,
} from "./types.js";

interface CollectionDescriptor {
  name: keyof ScientificReport | "source_snapshots" | "source_items";
  records: readonly unknown[];
  idField: string;
  versionField?: string;
}

export function coreCollections(report: ScientificReport): CollectionDescriptor[] {
  return [
    { name: "source_snapshots", records: report.source_coverage.snapshots, idField: "source_snapshot_id" },
    { name: "source_items", records: report.source_coverage.items, idField: "source_item_id" },
    { name: "applicability_decisions", records: report.applicability_decisions, idField: "applicability_decision_id", versionField: "object_version" },
    { name: "research_questions", records: report.research_questions, idField: "research_question_id", versionField: "research_question_version" },
    { name: "entities", records: report.entities, idField: "entity_id", versionField: "entity_version" },
    { name: "campaigns", records: report.campaigns, idField: "campaign_id", versionField: "campaign_version" },
    { name: "work_units", records: report.work_units, idField: "work_unit_id", versionField: "work_unit_version" },
    { name: "attempts", records: report.attempts, idField: "attempt_id", versionField: "attempt_version" },
    { name: "segments", records: report.segments, idField: "segment_id", versionField: "segment_version" },
    { name: "methods", records: report.methods, idField: "method_id", versionField: "method_version" },
    { name: "decision_events", records: report.decision_events, idField: "decision_event_id", versionField: "decision_event_version" },
    { name: "materials", records: report.materials, idField: "material_id", versionField: "material_version" },
    { name: "material_relationships", records: report.material_relationships, idField: "relationship_id", versionField: "relationship_version" },
    { name: "analysis_populations", records: report.analysis_populations, idField: "analysis_population_id", versionField: "analysis_population_version" },
    { name: "data_slices", records: report.data_slices, idField: "data_slice_id", versionField: "data_slice_version" },
    { name: "derivations", records: report.derivations, idField: "derivation_id", versionField: "derivation_version" },
    { name: "invocations", records: report.invocations, idField: "invocation_id", versionField: "invocation_version" },
    { name: "environments", records: report.environments, idField: "environment_id", versionField: "environment_version" },
    { name: "random_states", records: report.random_states, idField: "random_state_id", versionField: "random_state_version" },
    { name: "analysis_runs", records: report.analysis_runs, idField: "analysis_run_id", versionField: "analysis_run_version" },
    { name: "results", records: report.results, idField: "result_id", versionField: "result_version" },
    { name: "failures", records: report.failures, idField: "failure_event_id", versionField: "failure_event_version" },
    { name: "evidence_items", records: report.evidence_items, idField: "evidence_item_id", versionField: "evidence_item_version" },
    { name: "evidence_edges", records: report.evidence_edges, idField: "evidence_edge_id" },
    { name: "evidence_dependency_groups", records: report.evidence_dependency_groups, idField: "dependency_group_id" },
    { name: "claims", records: report.claims, idField: "claim_id", versionField: "object_version" },
    { name: "argument_steps", records: report.argument_steps, idField: "argument_step_id", versionField: "object_version" },
    { name: "argument_edges", records: report.argument_edges, idField: "argument_edge_id" },
    { name: "claim_dependencies", records: report.claim_dependencies, idField: "claim_dependency_id", versionField: "dependency_version" },
    { name: "cross_domain_bridges", records: report.cross_domain_bridges, idField: "bridge_id", versionField: "object_version" },
    { name: "conflict_sets", records: report.conflict_sets, idField: "conflict_set_id", versionField: "object_version" },
    { name: "conflict_member_edges", records: report.conflict_member_edges, idField: "conflict_member_edge_id" },
    { name: "artifacts", records: report.artifacts, idField: "artifact_id", versionField: "artifact_version" },
    { name: "reproducibility_units", records: report.reproducibility_units, idField: "reproducibility_unit_id", versionField: "object_version" },
    { name: "limitations", records: report.limitations, idField: "limitation_id" },
    { name: "revision_events", records: report.revision_events, idField: "revision_event_id", versionField: "revision_event_version" },
    { name: "review_tasks", records: report.review_tasks, idField: "review_task_id" },
  ];
}

function collectExtensionIds(value: unknown, ids: Set<string>, seen: Set<object>): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectExtensionIds(item, ids, seen);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if ((key.endsWith("_id") || key === "id") && typeof item === "string" && item.length > 0) ids.add(item);
    collectExtensionIds(item, ids, seen);
  }
}

export function buildSemanticContext(
  report: ScientificReport,
  ruleSet: SemanticContext["ruleSet"],
  projectionVerification: SemanticContext["projectionVerification"] = null,
): SemanticContext {
  const objectById = new Map<string, ObjectRecord>();
  const objectCollectionById = new Map<string, string>();
  const duplicateIds = new Map<string, string[]>();
  const knownIds = new Set<string>([report.report_id, report.project_id, report.source_coverage.universe_id]);

  for (const descriptor of coreCollections(report)) {
    for (const record of descriptor.records) {
      const object = record as unknown as ObjectRecord;
      const id = object[descriptor.idField];
      if (typeof id !== "string") continue;
      knownIds.add(id);
      const existingCollection = objectCollectionById.get(id);
      if (existingCollection !== undefined) {
        const collections = duplicateIds.get(id) ?? [existingCollection];
        collections.push(String(descriptor.name));
        duplicateIds.set(id, collections);
      } else {
        objectById.set(id, object);
        objectCollectionById.set(id, String(descriptor.name));
      }
    }
  }
  const addNestedRecord = (id: string, record: unknown, collection: string): void => {
    knownIds.add(id);
    const existingCollection = objectCollectionById.get(id);
    if (existingCollection !== undefined) {
      const collections = duplicateIds.get(id) ?? [existingCollection];
      collections.push(collection);
      duplicateIds.set(id, collections);
      return;
    }
    objectById.set(id, record as ObjectRecord);
    objectCollectionById.set(id, collection);
  };
  for (const population of report.analysis_populations) {
    for (const member of population.members) addNestedRecord(member.member_id, member, "population_members");
  }
  for (const randomState of report.random_states) {
    for (const assignment of randomState.seed_assignments) {
      addNestedRecord(assignment.seed_assignment_id, assignment, "seed_assignments");
    }
  }
  addNestedRecord(report.source_coverage.universe_id, report.source_coverage, "source_universes");
  for (const module of report.module_manifest) addNestedRecord(module.module_id, module, "modules");
  for (const section of report.section_coverage) addNestedRecord(section.section_id, section, "sections");
  collectExtensionIds(report.extensions, knownIds, new Set<object>());

  return { report, objectById, objectCollectionById, knownIds, duplicateIds, ruleSet, projectionVerification };
}

export function knownValue<T>(field: ScientificField<T>): T | undefined {
  return field.state === "known" ? field.value : undefined;
}

export function fieldIsKnown<T>(field: ScientificField<T>): field is Extract<ScientificField<T>, { state: "known" }> {
  return field.state === "known";
}

export function objectVersion(record: ObjectRecord): string | undefined {
  const preferredKeys = [
    "object_version",
    "claim_version",
    "evidence_item_version",
    "result_version",
    "derivation_version",
    "analysis_run_version",
    "artifact_version",
    "bridge_version",
    "dependency_version",
  ];
  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  for (const [key, value] of Object.entries(record)) {
    if (key.endsWith("_version") && typeof value === "string") return value;
  }
  return undefined;
}

export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function escapePointer(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function pointer(...tokens: Array<string | number>): string {
  return `/${tokens.map((token) => escapePointer(String(token))).join("/")}`;
}

export function categoryForRule(rule: RuleDefinition): ValidationCategory {
  const phases = new Set(rule.scope.phases);
  if (phases.has("coverage") || phases.has("section_coverage")) return "source_coverage";
  if (phases.has("work_execution")) return "execution_state";
  if (phases.has("decision_timing")) return "decision_timing";
  if (phases.has("lineage")) return "material_lineage";
  if (phases.has("derivation")) return "quantitative_derivation";
  if (phases.has("argument_graph") || phases.has("conflict") || phases.has("results")) return "claims_and_argument";
  if (phases.has("revision")) return "revision_propagation";
  if (phases.has("reproducibility")) return "access_and_reproducibility";
  if (phases.has("disclosure") || phases.has("security") || phases.has("packaging")) return "disclosure_and_security";
  if (phases.has("accessibility") || phases.has("rendering")) return "offline_and_accessibility";
  if (phases.has("package_identity")) return "package_and_identity";
  if (phases.has("applicability") || phases.has("domain_semantics")) return "domain_overlay";
  if (phases.has("epistemic")) return "schema_and_missingness";
  return "other";
}

export interface FindingInput {
  rule: RuleDefinition;
  effectiveSeverity: RuleSeverity;
  category?: ValidationCategory;
  pointer?: string;
  message?: string;
  remediation?: string;
  affectedObjectIds?: string[];
  sourceBindings?: SourceBinding[];
  details?: JsonValue;
}

export function finding(input: FindingInput): ValidationFinding {
  const result: ValidationFinding = {
    ruleId: input.rule.id,
    title: input.rule.title,
    category: input.category ?? categoryForRule(input.rule),
    severity: input.rule.severity,
    effectiveSeverity: input.effectiveSeverity,
    instancePointer: input.pointer ?? input.rule.pointer_hint.replaceAll("*", "0"),
    message: input.message ?? input.rule.message,
    remediation: input.remediation ?? input.rule.remediation,
    affectedObjectIds: uniqueStrings(input.affectedObjectIds ?? []),
    sourceBindings: input.sourceBindings ?? [],
  };
  if (input.details !== undefined) result.details = input.details;
  return result;
}

export function makeInternalRule(
  id: string,
  title: string,
  severity: RuleSeverity,
  pointerHint: string,
  message: string,
  remediation: string,
  phase: string,
): RuleDefinition {
  return {
    id,
    title,
    scope: { artifacts: ["scientific_report"], domains: ["core"], phases: [phase] },
    severity,
    condition: message,
    pointer_hint: pointerHint,
    message,
    remediation,
    waiver_policy: { allowed: false, rationale: "Validator integrity checks are not waivable." },
  };
}

export interface CycleResult {
  cycle: string[];
}

export function findDirectedCycle(nodes: Iterable<string>, edges: ReadonlyMap<string, readonly string[]>): CycleResult | null {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const stackIndex = new Map<string, number>();

  function visit(node: string): CycleResult | null {
    state.set(node, 1);
    stackIndex.set(node, stack.length);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if ((state.get(next) ?? 0) === 0) {
        const nested = visit(next);
        if (nested !== null) return nested;
      } else if (state.get(next) === 1) {
        const start = stackIndex.get(next) ?? 0;
        return { cycle: [...stack.slice(start), next] };
      }
    }
    stack.pop();
    stackIndex.delete(node);
    state.set(node, 2);
    return null;
  }

  for (const node of nodes) {
    if ((state.get(node) ?? 0) === 0) {
      const cycle = visit(node);
      if (cycle !== null) return cycle;
    }
  }
  return null;
}

export interface LocatedIdentifier {
  id: string;
  instancePointer: string;
}

export function locatedDerivationBindings(value: unknown): LocatedIdentifier[] {
  const bindings: LocatedIdentifier[] = [];
  const seen = new Set<object>();
  function walk(item: unknown, path: string): void {
    if (item === null || typeof item !== "object" || seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) {
      item.forEach((child, index) => walk(child, `${path}/${index}`));
      return;
    }
    for (const [key, child] of Object.entries(item)) {
      const childPath = `${path}/${escapePointer(key)}`;
      if (key === "derivation_bindings" && Array.isArray(child)) {
        child.forEach((candidate, index) => {
          if (typeof candidate === "string") {
            bindings.push({ id: candidate, instancePointer: `${childPath}/${index}` });
          }
        });
      } else walk(child, childPath);
    }
  }
  walk(value, "");
  return bindings;
}

export interface LocatedSourceBinding {
  binding: SourceBinding;
  instancePointer: string;
}

export function locatedSourceBindings(value: unknown): LocatedSourceBinding[] {
  const bindings: LocatedSourceBinding[] = [];
  const seen = new Set<object>();
  function walk(item: unknown, path: string): void {
    if (item === null || typeof item !== "object" || seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) {
      item.forEach((child, index) => walk(child, `${path}/${index}`));
      return;
    }
    for (const [key, child] of Object.entries(item)) {
      const childPath = `${path}/${escapePointer(key)}`;
      if ((key === "source_bindings" || key === "evidence_bindings") && Array.isArray(child)) {
        child.forEach((candidate, index) => {
          if (candidate !== null && typeof candidate === "object" && !Array.isArray(candidate)) {
            bindings.push({
              binding: candidate as SourceBinding,
              instancePointer: `${childPath}/${index}`,
            });
          }
        });
      } else walk(child, childPath);
    }
  }
  walk(value, "");
  return bindings;
}

export function allSourceBindings(value: unknown): SourceBinding[] {
  return locatedSourceBindings(value).map((item) => item.binding);
}

export function asJsonObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}
