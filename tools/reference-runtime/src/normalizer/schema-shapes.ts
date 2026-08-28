export type DefaultMarker =
  | { readonly kind: "array" }
  | { readonly kind: "null" }
  | { readonly kind: "unknown-envelope" }
  | { readonly kind: "extensions" }
  | { readonly kind: "literal"; readonly value: string | number | boolean }
  | { readonly kind: "object"; readonly fields: Readonly<Record<string, DefaultMarker>> };

const array = (): DefaultMarker => ({ kind: "array" });
const nullable = (): DefaultMarker => ({ kind: "null" });
const unknown = (): DefaultMarker => ({ kind: "unknown-envelope" });
const extensions = (): DefaultMarker => ({ kind: "extensions" });
const literal = (value: string | number | boolean): DefaultMarker => ({ kind: "literal", value });
const object = (fields: Readonly<Record<string, DefaultMarker>>): DefaultMarker => ({ kind: "object", fields });

export interface ObjectShape {
  readonly collection: string;
  readonly idKey: string;
  readonly versionKey?: string;
  readonly allowedKeys: readonly string[];
  readonly defaults: Readonly<Record<string, DefaultMarker>>;
  readonly plainRequired: readonly string[];
}

const source_bindings = array();

export const OBJECT_SHAPES: Readonly<Record<string, ObjectShape>> = {
  applicability_decisions: {
    collection: "applicability_decisions",
    idKey: "applicability_decision_id",
    versionKey: "object_version",
    allowedKeys: [
      "applicability_decision_id", "object_version", "target_kind", "target_pointer_or_section_id",
      "rule_id", "result", "evaluated_context", "evidence_bindings", "decision_time", "extensions",
    ],
    defaults: {
      evidence_bindings: array(), extensions: extensions(),
    },
    plainRequired: ["target_kind", "target_pointer_or_section_id", "rule_id", "result", "evaluated_context", "decision_time"],
  },
  research_questions: {
    collection: "research_questions",
    idKey: "research_question_id",
    versionKey: "research_question_version",
    allowedKeys: [
      "research_question_id", "research_question_version", "question", "rationale",
      "resolution_criterion_timing", "resolution_criteria", "resolution_status",
      "qualified_answer", "claim_ids", "limitation_ids", "source_bindings", "extensions",
    ],
    defaults: {
      rationale: unknown(),
      resolution_criterion_timing: literal("missing"),
      resolution_criteria: unknown(),
      resolution_status: literal("not_evaluable"),
      qualified_answer: unknown(),
      claim_ids: array(), limitation_ids: array(), source_bindings, extensions: extensions(),
    },
    plainRequired: ["question"],
  },
  entities: {
    collection: "entities",
    idKey: "entity_id",
    versionKey: "entity_version",
    allowedKeys: [
      "entity_id", "entity_version", "entity_kind", "label", "identifiers",
      "identity_status", "source_bindings", "extensions",
    ],
    defaults: {
      label: unknown(), identifiers: array(), identity_status: literal("unknown"),
      source_bindings, extensions: extensions(),
    },
    plainRequired: ["entity_kind"],
  },
  campaigns: {
    collection: "campaigns",
    idKey: "campaign_id",
    versionKey: "campaign_version",
    allowedKeys: [
      "campaign_id", "campaign_version", "title", "objective", "work_state",
      "execution_scope", "work_unit_ids", "source_bindings", "extensions",
    ],
    defaults: {
      objective: unknown(), work_state: literal("unknown"), work_unit_ids: array(),
      source_bindings, extensions: extensions(),
    },
    plainRequired: ["title", "execution_scope"],
  },
  work_units: {
    collection: "work_units",
    idKey: "work_unit_id",
    versionKey: "work_unit_version",
    allowedKeys: [
      "work_unit_id", "work_unit_version", "campaign_id", "title", "objective", "work_state",
      "execution_scope", "completion_criterion_timing", "completion_criteria", "completion_assessment",
      "completion_evidence", "attempt_ids", "method_ids", "decision_event_ids",
      "input_entity_ids", "output_object_ids", "source_bindings", "extensions",
    ],
    defaults: {
      objective: unknown(), work_state: literal("unknown"),
      completion_criterion_timing: literal("missing"), completion_criteria: unknown(),
      completion_assessment: unknown(), completion_evidence: array(), attempt_ids: array(), method_ids: array(),
      decision_event_ids: array(), input_entity_ids: array(), output_object_ids: array(),
      source_bindings, extensions: extensions(),
    },
    plainRequired: ["campaign_id", "title", "execution_scope"],
  },
  attempts: {
    collection: "attempts",
    idKey: "attempt_id",
    versionKey: "attempt_version",
    allowedKeys: [
      "attempt_id", "attempt_version", "work_unit_id", "attempt_ordinal", "execution_scope",
      "attempt_outcome", "started_at", "ended_at", "method_ids", "parameter_set",
      "input_material_ids", "input_artifact_ids", "segment_ids", "result_ids",
      "failure_event_ids", "output_artifact_ids", "usable_output_status",
      "superseded_by_attempt_id", "attempt_relations", "source_bindings", "extensions",
    ],
    defaults: {
      attempt_outcome: literal("outcome_unknown"), started_at: unknown(), ended_at: unknown(),
      method_ids: array(), parameter_set: array(), input_material_ids: array(),
      input_artifact_ids: array(), segment_ids: array(), result_ids: array(),
      failure_event_ids: array(), output_artifact_ids: array(),
      usable_output_status: literal("unknown"), superseded_by_attempt_id: nullable(),
      source_bindings, extensions: extensions(),
    },
    plainRequired: ["work_unit_id", "attempt_ordinal", "execution_scope"],
  },
  segments: {
    collection: "segments",
    idKey: "segment_id",
    versionKey: "segment_version",
    allowedKeys: [
      "segment_id", "segment_version", "attempt_id", "segment_ordinal", "segment_kind",
      "segment_state", "predecessor_segment_id", "restart_reason",
      "checkpoint_input_artifact_id", "checkpoint_output_artifact_id", "parameter_diff", "started_at", "ended_at",
      "parameters", "result_ids", "failure_event_ids", "output_artifact_ids",
      "source_bindings", "extensions",
    ],
    defaults: {
      segment_state: literal("unknown"), predecessor_segment_id: nullable(), restart_reason: unknown(),
      checkpoint_input_artifact_id: nullable(), checkpoint_output_artifact_id: nullable(), parameter_diff: unknown(),
      started_at: unknown(), ended_at: unknown(), parameters: array(), result_ids: array(),
      failure_event_ids: array(), output_artifact_ids: array(), source_bindings,
      extensions: extensions(),
    },
    plainRequired: ["attempt_id", "segment_ordinal", "segment_kind"],
  },
  methods: {
    collection: "methods",
    idKey: "method_id",
    versionKey: "method_version",
    allowedKeys: [
      "method_id", "method_version", "name", "method_kind", "execution_status",
      "execution_scope", "description", "planned_parameters", "actual_parameters",
      "protocol_artifact_ids", "deviation_descriptions", "source_bindings", "extensions",
    ],
    defaults: {
      execution_status: literal("unknown"), description: unknown(), planned_parameters: array(),
      actual_parameters: array(), protocol_artifact_ids: array(), deviation_descriptions: array(),
      source_bindings, extensions: extensions(),
    },
    plainRequired: ["name", "method_kind", "execution_scope"],
  },
  decision_events: {
    collection: "decision_events",
    idKey: "decision_event_id",
    versionKey: "decision_event_version",
    allowedKeys: [
      "decision_event_id", "decision_event_version", "decision_kind", "description", "timing_class",
      "decided_at", "decision_maker", "triggering_object_ids", "affected_object_ids", "rationale",
      "alternatives_considered", "source_bindings", "extensions",
    ],
    defaults: {
      timing_class: literal("missing"), decided_at: unknown(), decision_maker: unknown(),
      triggering_object_ids: array(), affected_object_ids: array(), rationale: unknown(),
      alternatives_considered: unknown(), source_bindings, extensions: extensions(),
    },
    plainRequired: ["decision_kind", "description"],
  },
  materials: {
    collection: "materials",
    idKey: "material_id",
    versionKey: "material_version",
    allowedKeys: [
      "material_id", "material_version", "entity_id", "material_kind", "label", "batch_or_lot",
      "quantity", "unit", "material_status", "disclosure_class", "source_bindings", "extensions",
    ],
    defaults: {
      label: unknown(), batch_or_lot: unknown(), quantity: unknown(), unit: unknown(),
      material_status: literal("unknown"), disclosure_class: literal("unknown"),
      source_bindings, extensions: extensions(),
    },
    plainRequired: ["entity_id", "material_kind"],
  },
  material_relationships: {
    collection: "material_relationships",
    idKey: "relationship_id",
    versionKey: "relationship_version",
    allowedKeys: [
      "relationship_id", "relationship_version", "relationship_kind", "input_material_ids",
      "output_material_ids", "work_unit_id", "attempt_id", "segment_id", "method_id",
      "transformation_description", "input_quantity", "output_quantity", "loss_or_gain_explanation",
      "decision_event_ids", "source_bindings", "extensions",
    ],
    defaults: {
      input_material_ids: array(), output_material_ids: array(), work_unit_id: nullable(),
      attempt_id: nullable(), segment_id: nullable(), method_id: nullable(),
      transformation_description: unknown(), input_quantity: unknown(), output_quantity: unknown(),
      loss_or_gain_explanation: unknown(), decision_event_ids: array(), source_bindings: source_bindings,
      extensions: extensions(),
    },
    plainRequired: ["relationship_kind"],
  },
  analysis_populations: {
    collection: "analysis_populations",
    idKey: "analysis_population_id",
    versionKey: "analysis_population_version",
    allowedKeys: [
      "analysis_population_id", "analysis_population_version", "name", "population_kind", "estimand",
      "inclusion_criteria", "exclusion_criteria", "members", "replicate_structure",
      "decision_event_ids", "lineage_status", "source_bindings", "extensions",
    ],
    defaults: {
      estimand: unknown(), inclusion_criteria: unknown(), exclusion_criteria: unknown(), members: array(),
      replicate_structure: object({
        biological_unit_definition: unknown(), technical_unit_definition: unknown(),
        experimental_unit_definition: unknown(), observational_unit_definition: unknown(),
        analysis_unit_definition: unknown(), biological_unit_count: unknown(),
        technical_unit_count: unknown(), independence_basis: unknown(), pool_counting_policy: unknown(),
      }),
      decision_event_ids: array(), lineage_status: literal("unknown"), source_bindings,
      extensions: extensions(),
    },
    plainRequired: ["name", "population_kind"],
  },
  data_slices: {
    collection: "data_slices",
    idKey: "data_slice_id",
    versionKey: "data_slice_version",
    allowedKeys: [
      "data_slice_id", "data_slice_version", "name", "input_artifacts", "locator",
      "analysis_population_id", "selected_unit_count", "excluded_unit_count",
      "selection_decision_event_ids", "slice_hash", "created_by_derivation_id",
      "source_bindings", "extensions",
    ],
    defaults: {
      input_artifacts: array(),
      locator: object({
        table_or_object: unknown(), columns_or_fields: unknown(),
        row_or_record_selector: unknown(), frame_or_time_selector: unknown(), query: unknown(),
        filter_expressions: unknown(), ordering: unknown(),
      }),
      analysis_population_id: nullable(), selected_unit_count: unknown(), excluded_unit_count: unknown(),
      selection_decision_event_ids: array(), slice_hash: unknown(), created_by_derivation_id: nullable(),
      source_bindings, extensions: extensions(),
    },
    plainRequired: ["name"],
  },
  derivations: {
    collection: "derivations",
    idKey: "derivation_id",
    versionKey: "derivation_version",
    allowedKeys: [
      "derivation_id", "derivation_version", "derivation_kind", "description", "input_data_slice_ids",
      "input_derivation_ids", "input_artifact_ids", "operation_or_formula", "code_artifact_ids",
      "parameters", "analysis_run_id", "output_data_slice_ids", "output_artifact_ids",
      "derived_values", "derivation_status", "source_bindings", "extensions",
    ],
    defaults: {
      input_data_slice_ids: array(), input_derivation_ids: array(), input_artifact_ids: array(),
      operation_or_formula: unknown(), code_artifact_ids: array(), parameters: array(),
      analysis_run_id: nullable(), output_data_slice_ids: array(), output_artifact_ids: array(),
      derived_values: array(), derivation_status: literal("unknown"), source_bindings,
      extensions: extensions(),
    },
    plainRequired: ["derivation_kind", "description"],
  },
  analysis_runs: {
    collection: "analysis_runs",
    idKey: "analysis_run_id",
    versionKey: "analysis_run_version",
    allowedKeys: [
      "analysis_run_id", "analysis_run_version", "run_role", "invocation_id", "code_artifacts",
      "environment_id", "random_state_id", "input_data_slice_ids", "input_derivation_ids",
      "started_at", "ended_at", "execution_status", "exit_code", "output_artifact_ids",
      "output_manifest_hash", "log_artifact_ids", "source_bindings", "extensions",
    ],
    defaults: {
      run_role: literal("unknown"), code_artifacts: array(), input_data_slice_ids: array(),
      input_derivation_ids: array(), started_at: unknown(), ended_at: unknown(),
      execution_status: literal("unknown"), exit_code: unknown(), output_artifact_ids: array(),
      output_manifest_hash: unknown(), log_artifact_ids: array(), source_bindings,
      extensions: extensions(),
    },
    plainRequired: ["invocation_id", "environment_id", "random_state_id"],
  },
  results: {
    collection: "results",
    idKey: "result_id",
    versionKey: "result_version",
    allowedKeys: [
      "result_id", "result_version", "result_kind", "statement", "work_unit_id", "attempt_id",
      "segment_id", "analysis_population_id", "estimand", "population_or_system", "condition",
      "time_or_frame_scope", "intervention", "dose", "endpoint", "system_state", "comparison_definition",
      "unit", "effect_estimate", "derivation_closure_status",
      "scientific_effect_class", "statistical_decision", "interpretability_status", "record_disposition",
      "disposition_reason", "qualification_ids", "blocker_ids", "negative_evidence_assessment",
      "data_slice_ids", "derivation_ids", "analysis_run_ids", "output_artifact_ids",
      "decision_event_ids", "conflict_set_ids", "source_bindings", "extensions",
    ],
    defaults: {
      attempt_id: nullable(), segment_id: nullable(), analysis_population_id: nullable(), estimand: unknown(),
      population_or_system: unknown(), condition: unknown(), time_or_frame_scope: unknown(), unit: unknown(),
      effect_estimate: nullable(), derivation_closure_status: literal("unknown"),
      scientific_effect_class: literal("unknown"), statistical_decision: literal("unknown"),
      interpretability_status: literal("unknown"), record_disposition: literal("unknown"),
      disposition_reason: unknown(), qualification_ids: array(), blocker_ids: array(),
      negative_evidence_assessment: nullable(), data_slice_ids: array(), derivation_ids: array(),
      analysis_run_ids: array(), output_artifact_ids: array(), decision_event_ids: array(),
      conflict_set_ids: array(), source_bindings, extensions: extensions(),
    },
    plainRequired: ["result_kind", "statement", "work_unit_id"],
  },
  failures: {
    collection: "failures",
    idKey: "failure_event_id",
    versionKey: "failure_event_version",
    allowedKeys: [
      "failure_event_id", "failure_event_version", "failure_class", "severity", "description",
      "onset_or_detection", "affected_object_id", "work_unit_id", "attempt_id", "segment_id",
      "related_object_ids", "partial_result_ids", "impact", "resolution_status", "recovery_attempt_ids",
      "evidence_bindings", "extensions",
    ],
    defaults: {
      failure_class: literal("unknown"), severity: literal("unknown"), onset_or_detection: unknown(),
      attempt_id: nullable(), segment_id: nullable(), related_object_ids: array(), partial_result_ids: array(),
      resolution_status: literal("unknown"), recovery_attempt_ids: array(), evidence_bindings: source_bindings,
      extensions: extensions(),
    },
    plainRequired: ["description", "affected_object_id", "work_unit_id", "impact"],
  },
  evidence_items: {
    collection: "evidence_items",
    idKey: "evidence_item_id",
    versionKey: "evidence_item_version",
    allowedKeys: [
      "evidence_item_id", "evidence_item_version", "evidence_kind", "summary", "result_ids",
      "artifact_ids", "data_slice_ids", "derivation_ids", "analysis_run_ids", "source_item_ids",
      "evidence_status", "quality_assessment", "dependency_group_ids", "source_bindings", "extensions",
    ],
    defaults: {
      result_ids: array(), artifact_ids: array(), data_slice_ids: array(), derivation_ids: array(),
      analysis_run_ids: array(), source_item_ids: array(), evidence_status: literal("unknown"),
      quality_assessment: literal("unknown"), dependency_group_ids: array(), source_bindings,
      extensions: extensions(),
    },
    plainRequired: ["evidence_kind", "summary"],
  },
  evidence_edges: {
    collection: "evidence_edges",
    idKey: "evidence_edge_id",
    allowedKeys: [
      "evidence_edge_id", "evidence_item_id", "claim_id", "relationship", "dependency_group_id",
      "weighting_note", "source_bindings",
    ],
    defaults: { dependency_group_id: nullable(), weighting_note: unknown(), source_bindings },
    plainRequired: ["evidence_item_id", "claim_id", "relationship"],
  },
  evidence_dependency_groups: {
    collection: "evidence_dependency_groups",
    idKey: "dependency_group_id",
    allowedKeys: [
      "dependency_group_id", "dependency_basis", "shared_ancestor_ids", "assessment_state",
      "evidence_item_ids", "source_bindings",
    ],
    defaults: {
      dependency_basis: unknown(), shared_ancestor_ids: array(), assessment_state: literal("unknown"),
      evidence_item_ids: array(), source_bindings,
    },
    plainRequired: [],
  },
  claims: {
    collection: "claims",
    idKey: "claim_id",
    versionKey: "object_version",
    allowedKeys: [
      "claim_id", "object_version", "proposition", "claim_type", "subject_bindings", "context", "scope",
      "decision_timing", "support_status", "evidence_edge_ids", "dependency_edge_ids",
      "counterevidence_edge_ids", "argument_step_ids", "cross_domain_bridge_ids", "conflict_set_ids",
      "limitation_ids", "revision_event_ids", "source_bindings", "extensions",
    ],
    defaults: {
      subject_bindings: array(), context: unknown(), scope: unknown(), decision_timing: literal("missing"),
      support_status: literal("unknown"), evidence_edge_ids: array(), dependency_edge_ids: array(),
      counterevidence_edge_ids: array(), argument_step_ids: array(), cross_domain_bridge_ids: array(),
      conflict_set_ids: array(), limitation_ids: array(), revision_event_ids: array(), source_bindings,
      extensions: extensions(),
    },
    plainRequired: ["proposition", "claim_type"],
  },
  argument_steps: {
    collection: "argument_steps",
    idKey: "argument_step_id",
    versionKey: "object_version",
    allowedKeys: [
      "argument_step_id", "object_version", "rule_or_rationale", "premise_edge_ids", "conclusion_edge_ids",
      "assumption_states", "alternative_explanations", "validity_status", "bridge_ids",
      "source_bindings", "extensions",
    ],
    defaults: {
      rule_or_rationale: unknown(), premise_edge_ids: array(), conclusion_edge_ids: array(),
      assumption_states: unknown(), alternative_explanations: unknown(), validity_status: literal("unknown"),
      bridge_ids: array(), source_bindings, extensions: extensions(),
    },
    plainRequired: [],
  },
  argument_edges: {
    collection: "argument_edges",
    idKey: "argument_edge_id",
    allowedKeys: ["argument_edge_id", "source_type", "source_id", "target_type", "target_id"],
    defaults: {},
    plainRequired: ["source_type", "source_id", "target_type", "target_id"],
  },
  claim_dependencies: {
    collection: "claim_dependencies",
    idKey: "claim_dependency_id",
    versionKey: "dependency_version",
    allowedKeys: [
      "claim_dependency_id", "dependency_version", "upstream_claim_id", "upstream_claim_version",
      "downstream_claim_id", "downstream_claim_version", "dependency_kind", "propagation_policy",
      "dependency_status", "source_bindings",
    ],
    defaults: { dependency_status: literal("unknown"), source_bindings },
    plainRequired: [
      "upstream_claim_id", "upstream_claim_version", "downstream_claim_id",
      "downstream_claim_version", "dependency_kind", "propagation_policy",
    ],
  },
  cross_domain_bridges: {
    collection: "cross_domain_bridges",
    idKey: "bridge_id",
    versionKey: "object_version",
    allowedKeys: [
      "bridge_id", "object_version", "source_domain", "target_domain", "source_entity_version_ids",
      "target_entity_version_ids", "mapping_type", "identity_alignment", "construct_alignment",
      "condition_alignment", "scale_alignment", "transformation_or_mapping_evidence", "assumptions",
      "limitations", "validity_status", "reviewer_state", "enabled_argument_step_ids",
      "source_bindings", "extensions",
    ],
    defaults: {
      source_entity_version_ids: array(), target_entity_version_ids: array(), identity_alignment: literal("unknown"),
      construct_alignment: literal("unknown"), condition_alignment: literal("unknown"),
      scale_alignment: literal("unknown"), transformation_or_mapping_evidence: unknown(), assumptions: unknown(),
      limitations: unknown(), validity_status: literal("unknown"), reviewer_state: literal("unknown"),
      enabled_argument_step_ids: array(), source_bindings, extensions: extensions(),
    },
    plainRequired: ["source_domain", "target_domain", "mapping_type"],
  },
  conflict_sets: {
    collection: "conflict_sets",
    idKey: "conflict_set_id",
    versionKey: "object_version",
    allowedKeys: [
      "conflict_set_id", "object_version", "matched_context", "member_edge_ids",
      "incompatibility_statement", "adjudication_status", "decision_event_id", "downstream_claim_ids",
      "heterogeneity_context_differences", "source_bindings", "extensions",
    ],
    defaults: {
      matched_context: unknown(), member_edge_ids: array(), adjudication_status: literal("unknown"),
      decision_event_id: nullable(), downstream_claim_ids: array(), source_bindings, extensions: extensions(),
    },
    plainRequired: ["incompatibility_statement"],
  },
  conflict_member_edges: {
    collection: "conflict_member_edges",
    idKey: "conflict_member_edge_id",
    allowedKeys: ["conflict_member_edge_id", "conflict_set_id", "member_type", "member_id"],
    defaults: {},
    plainRequired: ["conflict_set_id", "member_type", "member_id"],
  },
  artifacts: {
    collection: "artifacts",
    idKey: "artifact_id",
    versionKey: "artifact_version",
    allowedKeys: [
      "artifact_id", "artifact_version", "artifact_role", "media_type", "location", "content_hash",
      "byte_size", "access_state", "disclosure_class", "created_at", "source_item_ids",
      "derivation_ids", "analysis_run_ids", "supersedes_artifact_ids", "extensions",
    ],
    defaults: {
      media_type: unknown(), location: unknown(), content_hash: unknown(), byte_size: unknown(),
      access_state: literal("unknown"), disclosure_class: literal("unknown"), created_at: unknown(),
      source_item_ids: array(), derivation_ids: array(), analysis_run_ids: array(),
      supersedes_artifact_ids: array(), extensions: extensions(),
    },
    plainRequired: ["artifact_role"],
  },
  reproducibility_units: {
    collection: "reproducibility_units",
    idKey: "reproducibility_unit_id",
    versionKey: "object_version",
    allowedKeys: [
      "reproducibility_unit_id", "object_version", "title", "unit_kind", "criticality", "scope",
      "covered_work_unit_ids", "covered_analysis_run_ids", "covered_claim_ids", "covered_output_ids",
      "historical_invocation_ids", "recipe_id", "input_closure", "artifact_closure",
      "environment_record", "random_state_record", "access_assessment", "comparison_specification",
      "replay_events", "independent_reproduction_events", "axis_assessments", "conservative_level",
      "level_reason", "limitation_ids", "source_bindings", "extensions",
    ],
    defaults: {
      scope: unknown(), covered_work_unit_ids: array(), covered_analysis_run_ids: array(),
      covered_claim_ids: array(), covered_output_ids: array(), historical_invocation_ids: array(),
      recipe_id: nullable(),
      input_closure: object({
        state: literal("unknown"), rationale: literal("Input closure was not supplied in the authoring input."),
        evidence_artifact_ids: array(), source_bindings: array(),
      }),
      artifact_closure: object({
        state: literal("unknown"), rationale: literal("Artifact closure was not supplied in the authoring input."),
        evidence_artifact_ids: array(), source_bindings: array(),
      }),
      environment_record: object({
        record_id: nullable(),
        assessment: object({
          state: literal("unknown"), rationale: literal("Environment capture was not supplied in the authoring input."),
          evidence_artifact_ids: array(), source_bindings: array(),
        }),
      }),
      random_state_record: object({
        record_id: nullable(),
        assessment: object({
          state: literal("unknown"), rationale: literal("Random-state capture was not supplied in the authoring input."),
          evidence_artifact_ids: array(), source_bindings: array(),
        }),
      }),
      access_assessment: object({
        status: literal("unknown"), conditions: unknown(), artifact_ids: array(), source_bindings: array(),
      }),
      comparison_specification: object({
        timing_classification: literal("missing"), targets: unknown(), equivalence_definition: unknown(),
        tolerances: unknown(), allowed_nondeterminism: unknown(), failure_conditions: unknown(),
        source_bindings: array(),
      }),
      replay_events: array(), independent_reproduction_events: array(),
      axis_assessments: object({
        provenance_closure: object({ state: literal("unknown"), rationale: literal("Not assessed."), evidence_artifact_ids: array(), source_bindings: array() }),
        recipe_fidelity: object({ state: literal("unknown"), rationale: literal("Not assessed."), evidence_artifact_ids: array(), source_bindings: array() }),
        data_and_artifact_access: object({ state: literal("unknown"), rationale: literal("Not assessed."), evidence_artifact_ids: array(), source_bindings: array() }),
        environment_capture: object({ state: literal("unknown"), rationale: literal("Not assessed."), evidence_artifact_ids: array(), source_bindings: array() }),
        random_state_capture: object({ state: literal("unknown"), rationale: literal("Not assessed."), evidence_artifact_ids: array(), source_bindings: array() }),
        replay_verification: object({ state: literal("unknown"), rationale: literal("Not assessed."), evidence_artifact_ids: array(), source_bindings: array() }),
        independent_computational_reproduction: object({ state: literal("unknown"), rationale: literal("Not assessed."), evidence_artifact_ids: array(), source_bindings: array() }),
        independent_experimental_replication: object({ state: literal("unknown"), rationale: literal("Not assessed."), evidence_artifact_ids: array(), source_bindings: array() }),
        claim_and_output_coverage: object({ state: literal("unknown"), rationale: literal("Not assessed."), evidence_artifact_ids: array(), source_bindings: array() }),
      }),
      conservative_level: literal("not_assessed"),
      level_reason: literal("The authoring input does not establish a reproducibility level."),
      limitation_ids: array(), source_bindings, extensions: extensions(),
    },
    plainRequired: ["title", "unit_kind", "criticality"],
  },
  limitations: {
    collection: "limitations",
    idKey: "limitation_id",
    allowedKeys: [
      "limitation_id", "category", "statement", "impact", "affected_object_ids",
      "resolution_status", "source_bindings",
    ],
    defaults: {
      affected_object_ids: array(), resolution_status: literal("unknown"), source_bindings,
    },
    plainRequired: ["category", "statement", "impact"],
  },
  revision_events: {
    collection: "revision_events",
    idKey: "revision_event_id",
    versionKey: "revision_event_version",
    allowedKeys: [
      "revision_event_id", "revision_event_version", "event_kind", "occurred_at", "reason",
      "superseded_object_refs", "replacement_object_refs", "invalidated_object_ids",
      "review_required_object_ids", "impact_statement", "source_bindings", "extensions",
    ],
    defaults: {
      occurred_at: unknown(), superseded_object_refs: array(), replacement_object_refs: array(),
      invalidated_object_ids: array(), review_required_object_ids: array(), source_bindings,
      extensions: extensions(),
    },
    plainRequired: ["event_kind", "reason", "impact_statement"],
  },
  invocations: {
    collection: "invocations",
    idKey: "invocation_id",
    versionKey: "invocation_version",
    allowedKeys: [
      "invocation_id", "invocation_version", "invocation_kind", "record_role", "executable",
      "arguments", "command_line", "working_directory", "parameters", "input_artifact_ids",
      "output_artifact_ids", "started_at", "ended_at", "termination_status", "exit_code",
      "log_artifact_ids", "source_bindings", "extensions",
    ],
    defaults: {
      invocation_kind: literal("unknown"), record_role: literal("unknown"), executable: unknown(),
      arguments: array(), command_line: unknown(), working_directory: unknown(), parameters: array(),
      input_artifact_ids: array(), output_artifact_ids: array(), started_at: unknown(), ended_at: unknown(),
      termination_status: literal("unknown"), exit_code: unknown(), log_artifact_ids: array(),
      source_bindings, extensions: extensions(),
    },
    plainRequired: [],
  },
  environments: {
    collection: "environments",
    idKey: "environment_id",
    versionKey: "environment_version",
    allowedKeys: [
      "environment_id", "environment_version", "environment_hash", "capture_method", "captured_at",
      "operating_system", "architecture", "container_or_image", "software_components",
      "hardware_components", "locale", "timezone", "environment_variable_manifest_hash",
      "lock_artifact_ids", "completeness", "known_nondeterminism", "source_bindings", "extensions",
    ],
    defaults: {
      environment_hash: unknown(), capture_method: unknown(), captured_at: unknown(),
      operating_system: unknown(), architecture: unknown(), container_or_image: unknown(),
      software_components: array(), hardware_components: array(), locale: unknown(), timezone: unknown(),
      environment_variable_manifest_hash: unknown(), lock_artifact_ids: array(),
      completeness: literal("unknown"), known_nondeterminism: array(), source_bindings,
      extensions: extensions(),
    },
    plainRequired: [],
  },
  random_states: {
    collection: "random_states",
    idKey: "random_state_id",
    versionKey: "random_state_version",
    allowedKeys: [
      "random_state_id", "random_state_version", "randomness_used", "deterministic_intent",
      "generator_or_algorithm", "seed_assignments", "nondeterministic_operations", "capture_status",
      "source_bindings", "extensions",
    ],
    defaults: {
      randomness_used: literal("unknown"), deterministic_intent: unknown(), generator_or_algorithm: unknown(),
      seed_assignments: array(), nondeterministic_operations: array(), capture_status: literal("unknown"),
      source_bindings, extensions: extensions(),
    },
    plainRequired: [],
  },
};

export const REPORT_COLLECTIONS = [
  "applicability_decisions", "research_questions", "entities", "campaigns", "work_units", "attempts", "segments", "methods",
  "decision_events", "materials", "material_relationships", "analysis_populations", "data_slices",
  "derivations", "invocations", "environments", "random_states", "analysis_runs", "results", "failures",
  "evidence_items", "evidence_edges", "evidence_dependency_groups", "claims", "argument_steps",
  "argument_edges", "claim_dependencies", "cross_domain_bridges", "conflict_sets",
  "conflict_member_edges", "artifacts", "reproducibility_units", "limitations", "revision_events",
] as const;

export const RECORD_KIND_TO_COLLECTION: Readonly<Record<string, string>> = {
  applicability_decision: "applicability_decisions",
  research_question: "research_questions",
  entity: "entities",
  campaign: "campaigns",
  work_unit: "work_units",
  attempt: "attempts",
  segment: "segments",
  method: "methods",
  decision: "decision_events",
  material: "materials",
  material_relationship: "material_relationships",
  analysis_population: "analysis_populations",
  data_slice: "data_slices",
  derivation: "derivations",
  analysis_run: "analysis_runs",
  result: "results",
  failure: "failures",
  evidence: "evidence_items",
  claim: "claims",
  argument: "argument_steps",
  bridge: "cross_domain_bridges",
  conflict: "conflict_sets",
  artifact: "artifacts",
  reproducibility: "reproducibility_units",
  limitation: "limitations",
  revision: "revision_events",
  invocation: "invocations",
  environment: "environments",
  random_state: "random_states",
  claim_dependency: "claim_dependencies",
};

export const OBJECT_TYPE_ALIASES: Readonly<Record<string, string>> = {
  applicability_decision: "applicability_decisions", applicability_decisions: "applicability_decisions",
  research_question: "research_questions", research_questions: "research_questions",
  entity: "entities", entities: "entities",
  campaign: "campaigns", campaigns: "campaigns",
  work_unit: "work_units", work_units: "work_units",
  attempt: "attempts", attempts: "attempts",
  segment: "segments", segments: "segments",
  method: "methods", methods: "methods",
  decision: "decision_events", decision_event: "decision_events", decision_events: "decision_events",
  material: "materials", materials: "materials",
  material_relationship: "material_relationships", material_relationships: "material_relationships",
  analysis_population: "analysis_populations", analysis_populations: "analysis_populations",
  data_slice: "data_slices", data_slices: "data_slices",
  derivation: "derivations", derivation_record: "derivations", derivations: "derivations",
  invocation: "invocations", invocations: "invocations",
  environment: "environments", environments: "environments",
  random_state: "random_states", random_states: "random_states",
  analysis_run: "analysis_runs", analysis_runs: "analysis_runs",
  result: "results", results: "results",
  failure: "failures", failure_event: "failures", failures: "failures",
  evidence: "evidence_items", evidence_item: "evidence_items", evidence_items: "evidence_items",
  evidence_edge: "evidence_edges", evidence_edges: "evidence_edges",
  evidence_dependency_group: "evidence_dependency_groups", evidence_dependency_groups: "evidence_dependency_groups",
  claim: "claims", claims: "claims",
  argument: "argument_steps", argument_step: "argument_steps", argument_steps: "argument_steps",
  argument_edge: "argument_edges", argument_edges: "argument_edges",
  claim_dependency: "claim_dependencies", claim_dependencies: "claim_dependencies",
  bridge: "cross_domain_bridges", cross_domain_bridge: "cross_domain_bridges",
  cross_domain_bridges: "cross_domain_bridges",
  conflict: "conflict_sets", conflict_set: "conflict_sets", conflict_sets: "conflict_sets",
  conflict_member_edge: "conflict_member_edges", conflict_member_edges: "conflict_member_edges",
  artifact: "artifacts", artifacts: "artifacts",
  reproducibility: "reproducibility_units", reproducibility_unit: "reproducibility_units",
  reproducibility_units: "reproducibility_units",
  limitation: "limitations", limitations: "limitations",
  revision: "revision_events", revision_event: "revision_events", revision_events: "revision_events",
};

export const CORE_SECTIONS = [
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
] as const;

export const DOMAIN_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  wet_lab: [
    "wet_lab_material_identity", "wet_lab_design_and_controls", "wet_lab_protocol_and_measurement",
  ],
  ai_ml: [
    "ai_ml_data_and_labels", "ai_ml_training_and_selection", "ai_ml_evaluation_and_inference",
  ],
  molecular_dynamics: [
    "md_system_construction", "md_execution_and_restarts", "md_analysis_and_convergence",
  ],
  cross_domain: ["cross_domain_alignment", "cross_domain_argument"],
};

export const BUILT_IN_MODULE_ORDER = ["core", "wet_lab", "ai_ml", "molecular_dynamics", "cross_domain"] as const;

export const SECTION_RECORD_KINDS: Readonly<Record<string, readonly string[]>> = {
  module_and_section_coverage: ["applicability_decision"],
  research_questions_and_resolution: ["research_question"],
  entities_materials_and_systems: ["entity", "material", "material_relationship", "analysis_population"],
  execution_history: ["campaign", "work_unit", "attempt", "segment", "decision"],
  methods_parameters_and_deviations: ["method"],
  results_failures_and_dispositions: ["result", "failure"],
  quantitative_derivations: ["data_slice", "derivation", "analysis_run", "artifact"],
  claims_arguments_and_bridges: ["evidence", "claim", "argument", "bridge"],
  conflicts_counterevidence_and_uncertainty: ["conflict", "limitation"],
  artifacts_and_reproducibility: ["artifact", "reproducibility", "analysis_run"],
  revisions_corrections_and_retractions: ["revision"],
  disclosure_and_limitations: ["limitation"],
};
