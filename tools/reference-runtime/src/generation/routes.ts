import type { RootRoute } from "./types.js";

const REPORT_SCHEMA = "https://schemas.report-prompt.org/v1/scientific-report.schema.json";

function singleton(root: string, objectType: string): RootRoute {
  return { root, objectType, collection: false, targetSchemaPointer: `${REPORT_SCHEMA}#/properties${root}`, objectIdField: null };
}

function collection(root: string, objectType: string, objectIdField: string): RootRoute {
  return { root, objectType, collection: true, targetSchemaPointer: `${REPORT_SCHEMA}#/properties${root}/items`, objectIdField };
}

const routes = [
  singleton("/scope", "scope"),
  singleton("/cutoff", "cutoff"),
  collection("/applicability_decisions", "applicability_decision", "applicability_decision_id"),
  collection("/module_manifest", "module_manifest_item", "module_id"),
  collection("/section_coverage", "section_coverage", "section_id"),
  singleton("/source_coverage", "source_coverage"),
  collection("/research_questions", "research_question", "research_question_id"),
  collection("/entities", "entity", "entity_id"),
  collection("/campaigns", "campaign", "campaign_id"),
  collection("/work_units", "work_unit", "work_unit_id"),
  collection("/attempts", "attempt", "attempt_id"),
  collection("/segments", "segment", "segment_id"),
  collection("/methods", "method", "method_id"),
  collection("/decision_events", "decision_event", "decision_event_id"),
  collection("/materials", "material", "material_id"),
  collection("/material_relationships", "material_relationship", "relationship_id"),
  collection("/analysis_populations", "analysis_population", "analysis_population_id"),
  collection("/data_slices", "data_slice", "data_slice_id"),
  collection("/derivations", "derivation", "derivation_id"),
  collection("/invocations", "invocation", "invocation_id"),
  collection("/environments", "environment", "environment_id"),
  collection("/random_states", "random_state", "random_state_id"),
  collection("/analysis_runs", "analysis_run", "analysis_run_id"),
  collection("/results", "result", "result_id"),
  collection("/failures", "failure", "failure_event_id"),
  collection("/evidence_items", "evidence_item", "evidence_item_id"),
  collection("/evidence_edges", "evidence_edge", "evidence_edge_id"),
  collection("/evidence_dependency_groups", "evidence_dependency_group", "dependency_group_id"),
  collection("/claims", "claim", "claim_id"),
  collection("/argument_steps", "argument_step", "argument_step_id"),
  collection("/argument_edges", "argument_edge", "argument_edge_id"),
  collection("/claim_dependencies", "claim_dependency", "claim_dependency_id"),
  collection("/cross_domain_bridges", "cross_domain_bridge", "bridge_id"),
  collection("/conflict_sets", "conflict_set", "conflict_set_id"),
  collection("/conflict_member_edges", "conflict_member_edge", "conflict_member_edge_id"),
  collection("/artifacts", "artifact", "artifact_id"),
  collection("/reproducibility_units", "reproducibility_unit", "reproducibility_unit_id"),
  collection("/limitations", "limitation", "limitation_id"),
  collection("/revision_events", "revision_event", "revision_event_id"),
  collection("/review_tasks", "review_task", "review_task_id"),
  singleton("/disclosure_state", "disclosure_state"),
  // Reserved nested route. It intentionally does not authorize /extensions or
  // any sibling extension key.
  {
    root: "/extensions/domain_payloads",
    objectType: "domain_payload",
    collection: true,
    targetSchemaPointer: null,
    objectIdField: "payload_id",
  },
] as const satisfies readonly RootRoute[];

export const GENERATION_ROOT_ROUTES: readonly RootRoute[] = routes;
export const GENERATION_ROOT_ROUTE_MAP: ReadonlyMap<string, RootRoute> = new Map(
  routes.map((route) => [route.root, route]),
);

export function generationRootRoute(root: string): RootRoute | undefined {
  return GENERATION_ROOT_ROUTE_MAP.get(root);
}
