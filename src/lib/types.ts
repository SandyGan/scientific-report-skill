import type { JsonObject, JsonValue } from "./json.js";
import type { Sha256Hash } from "./hash.js";

export type Identifier = string;
export type Version = string;
export type DateTime = string;
export type JsonPointer = string;
export type ExtensionMap = Record<string, JsonValue>;

export type MissingState = "known" | "unknown" | "not_applicable" | "withheld";
export type ProvenanceStatus = "complete" | "partial" | "absent";
export type WithholdingReasonCode =
  | "privacy"
  | "ethics_or_consent"
  | "license_or_contract"
  | "security"
  | "controlled_access"
  | "source_confidentiality"
  | "other_restricted";

export interface Locator {
  locator_type:
    | "json_pointer"
    | "line_range"
    | "page_range"
    | "table_cell"
    | "figure_panel"
    | "timestamp_range"
    | "frame_range"
    | "record_key"
    | "query"
    | "uri_fragment"
    | "whole_source"
    | "other";
  value: string;
  parser_name?: string | null;
  parser_version?: Version | null;
}

export type SourceBindingRole =
  | "direct"
  | "derived_input"
  | "context"
  | "counterevidence"
  | "decision_timing"
  | "completion_evidence"
  | "disclosure_evidence";

export interface SourceBinding {
  source_item_id: Identifier;
  source_snapshot_id: Identifier;
  snapshot_registry_hash: Sha256Hash;
  content_hash: Sha256Hash;
  excerpt_hash: Sha256Hash;
  chunk_ids: Identifier[];
  locator: Locator;
  parser_identity: {
    parser_name: string;
    parser_version: Version;
    configuration_hash: Sha256Hash;
    parser_result_id: Identifier;
  };
  binding_scope: "content_excerpt" | "whole_source" | "parser_metadata";
  binding_role: SourceBindingRole;
}

interface ScientificFieldBase {
  source_bindings: SourceBinding[];
  derivation_bindings: Identifier[];
  provenance_status: ProvenanceStatus;
  applicability_decision_id?: Identifier | null;
}

export interface KnownScientificField<T> extends ScientificFieldBase {
  state: "known";
  value: T;
  missing_reason: null;
  provenance_status: "complete" | "partial";
}

export interface UnknownScientificField extends ScientificFieldBase {
  state: "unknown";
  value: null;
  missing_reason: string;
  provenance_status: ProvenanceStatus;
}

export interface NotApplicableScientificField extends ScientificFieldBase {
  state: "not_applicable";
  value: null;
  missing_reason: string;
  provenance_status: "partial" | "absent";
  applicability_decision_id: Identifier;
}

export interface WithheldScientificField extends ScientificFieldBase {
  state: "withheld";
  value: null;
  missing_reason: string;
  provenance_status: "partial" | "absent";
  withholding_reason_code: WithholdingReasonCode;
  disclosure_decision_id: Identifier;
}

export type ScientificField<T> =
  | KnownScientificField<T>
  | UnknownScientificField
  | NotApplicableScientificField
  | WithheldScientificField;

export type StringField = ScientificField<string>;
export type NumberField = ScientificField<number>;
export type IntegerField = ScientificField<number>;
export type BooleanField = ScientificField<boolean>;
export type StringArrayField = ScientificField<string[]>;
export type HashField = ScientificField<Sha256Hash>;
export type DateTimeField = ScientificField<DateTime>;
export type RelativePathField = ScientificField<string>;

export interface Parameter {
  name: Identifier;
  value: ScientificField<JsonValue>;
  unit: StringField;
  value_role: "actual" | "planned" | "default" | "inferred" | "external" | "unknown";
}

export interface ObjectReference {
  object_type: Identifier;
  object_id: Identifier;
  object_version: Version;
}

export interface Scope {
  scope_statement: string;
  started_at: DateTimeField;
  ended_at: DateTimeField;
  cutoff_at: DateTimeField;
  included_boundaries: string[];
  excluded_boundaries: string[];
}

export interface ApplicabilityDecision {
  applicability_decision_id: Identifier;
  object_version: Version;
  target_kind: "field" | "section" | "module";
  target_pointer_or_section_id: string;
  rule_id: Identifier;
  result: "applicable" | "not_applicable" | "undetermined";
  evaluated_context: string;
  evidence_bindings: SourceBinding[];
  decision_time: DateTime;
  extensions: ExtensionMap;
}

export interface SectionCoverage {
  section_id: Identifier;
  applicability: "applicable" | "not_applicable" | "undetermined";
  applicability_decision_id: Identifier;
  coverage_status: "covered" | "partial" | "no_records" | "unknown" | "not_applicable" | "withheld";
  source_universe_ids: Identifier[];
  represented_object_ids: Identifier[];
  omission_or_gap_reasons: StringArrayField;
  evidence_bindings: SourceBinding[];
  last_evaluated_at: DateTimeField;
}

export interface ModuleManifestItem {
  module_id: Identifier;
  protocol_version: Version;
  status: "enabled" | "not_applicable" | "undetermined";
  applicability_decision_id: Identifier;
  detected_triggers: string[];
  section_ids: Identifier[];
}

export type DisclosureClass = "public" | "internal" | "restricted" | "secret" | "unknown";
export type AccessState =
  | "open"
  | "available_with_conditions"
  | "restricted"
  | "unavailable"
  | "unknown"
  | "not_applicable";

export interface Artifact {
  artifact_id: Identifier;
  artifact_version: Version;
  artifact_role:
    | "raw_input"
    | "processed_input"
    | "dataset"
    | "code"
    | "configuration"
    | "environment_lock"
    | "checkpoint"
    | "result_output"
    | "figure"
    | "table"
    | "log"
    | "protocol"
    | "recipe"
    | "report"
    | "other";
  media_type: StringField;
  location: RelativePathField;
  content_hash: HashField;
  byte_size: IntegerField;
  access_state: AccessState;
  disclosure_class: DisclosureClass;
  created_at: DateTimeField;
  source_item_ids: Identifier[];
  derivation_ids: Identifier[];
  analysis_run_ids: Identifier[];
  supersedes_artifact_ids: Identifier[];
  extensions: ExtensionMap;
}

export interface EntityIdentifier {
  scheme: Identifier;
  value: StringField;
}

export interface Entity {
  entity_id: Identifier;
  entity_version: Version;
  entity_kind: Identifier;
  label: StringField;
  identifiers: EntityIdentifier[];
  identity_status: "verified" | "provisional" | "ambiguous" | "withheld" | "unknown";
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface Limitation {
  limitation_id: Identifier;
  category:
    | "scope"
    | "source_coverage"
    | "method"
    | "data"
    | "analysis"
    | "uncertainty"
    | "conflict"
    | "access"
    | "reproducibility"
    | "disclosure"
    | "other";
  statement: string;
  impact: string;
  affected_object_ids: Identifier[];
  resolution_status: "open" | "mitigated" | "resolved" | "accepted" | "unknown";
  source_bindings: SourceBinding[];
}

export interface ReviewTask {
  review_task_id: Identifier;
  category:
    | "entity_identity"
    | "completion_evidence"
    | "decision_timing"
    | "conflict_adjudication"
    | "exclusion"
    | "causal_claim"
    | "cross_domain_bridge"
    | "revision_impact"
    | "ethics_or_disclosure"
    | "other";
  description: string;
  severity: "information" | "warning" | "blocking";
  affected_object_ids: Identifier[];
  required_reviewer_role: string;
  status: "open" | "resolved" | "waived" | "not_applicable";
}

export interface DisclosureState {
  level: "public" | "internal" | "restricted";
  projection_status: "not_projected" | "projected" | "projection_incomplete" | "unknown";
  withheld_field_count: number;
  omitted_object_count: number;
  projection_id: Identifier | null;
}

export interface SourceSnapshot {
  source_snapshot_id: Identifier;
  created_at: DateTimeField;
  registry_hash: HashField;
  snapshot_method: StringField;
  source_bindings: SourceBinding[];
}

export type AuthorityBasis =
  | "authoritative_registry"
  | "reconciled_authoritative_registries"
  | "declared_inventory"
  | "discovery_process"
  | "none";

export type EnumerationStatus =
  | "authoritative_exhaustive"
  | "registered_not_proven_exhaustive"
  | "open_ended"
  | "unknown";

export type SourceDisposition =
  | "included"
  | "excluded_with_reason"
  | "unreadable"
  | "inaccessible"
  | "duplicate"
  | "unmapped"
  | "pending";

export type SourceContentAccess =
  | "available"
  | "available_with_conditions"
  | "partially_accessible"
  | "unreadable"
  | "inaccessible"
  | "unknown"
  | "withheld";

export interface SourceItem {
  source_item_id: Identifier;
  universe_id: Identifier;
  source_kind:
    | "eln_entry"
    | "file"
    | "directory_inventory"
    | "instrument_run"
    | "compute_job"
    | "ml_trial"
    | "trajectory"
    | "checkpoint_or_restart"
    | "database_record"
    | "publication"
    | "correspondence"
    | "human_declaration"
    | "external_record"
    | "other";
  identity: StringField;
  title: StringField;
  location: StringField;
  content_hash: HashField;
  registered_at: DateTimeField;
  snapshot_id: Identifier;
  revision_or_snapshot: StringField;
  disclosure_class: DisclosureClass;
  disposition: SourceDisposition;
  disposition_reason: StringField;
  content_access: SourceContentAccess;
  canonical_source_item_id: Identifier | null;
  equivalence_basis: StringField;
  mapped_object_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface CoverageReconciliation {
  registered: number;
  terminally_disposed: number;
  included: number;
  excluded_with_reason: number;
  unreadable: number;
  inaccessible: number;
  duplicate: number;
  unmapped: number;
  pending: number;
  included_mapped: number;
}

export interface CoverageAxes {
  inventory_accounting: "complete" | "incomplete" | "unknown";
  accessibility: "all_accessible" | "limitations_present" | "unknown";
  scientific_incorporation: "complete_within_boundary" | "partial" | "none" | "unknown";
}

export type ReportCompleteness =
  | "proven_within_declared_universe"
  | "registered_sources_accounted_for"
  | "partial"
  | "cannot_be_established";

export interface SourceCoverage {
  universe_id: Identifier;
  title: string;
  scope_statement: string;
  inclusion_boundary: string;
  exclusion_boundary: string;
  cutoff: DateTimeField;
  cutoff_event_semantics: StringField;
  authority_basis: AuthorityBasis;
  authority_evidence: StringField;
  enumeration_status: EnumerationStatus;
  snapshot_bindings: Identifier[];
  item_ids: Identifier[];
  snapshots: SourceSnapshot[];
  items: SourceItem[];
  reconciliation: CoverageReconciliation;
  coverage_axes: CoverageAxes;
  report_completeness: ReportCompleteness;
  coverage_limitations: string[];
}

export type WorkState = "planned" | "attempted" | "completed" | "not_performed" | "unknown";
export type ExecutionScope =
  | "this_project"
  | "reanalysis"
  | "external_study"
  | "upstream_collaborator"
  | "synthetic";
export type TimingClass = "predefined" | "adaptive" | "post_hoc" | "missing" | "not_applicable";

export interface Campaign {
  campaign_id: Identifier;
  campaign_version: Version;
  title: string;
  objective: StringField;
  work_state: WorkState;
  execution_scope: ExecutionScope;
  work_unit_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface WorkUnit {
  work_unit_id: Identifier;
  work_unit_version: Version;
  campaign_id: Identifier;
  title: string;
  objective: StringField;
  work_state: WorkState;
  execution_scope: ExecutionScope;
  completion_criterion_timing: TimingClass;
  completion_criteria: StringField;
  completion_assessment: StringField;
  completion_evidence: SourceBinding[];
  attempt_ids: Identifier[];
  method_ids: Identifier[];
  decision_event_ids: Identifier[];
  input_entity_ids: Identifier[];
  output_object_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export type AttemptOutcome =
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "aborted"
  | "cancelled_after_start"
  | "running_at_cutoff"
  | "outcome_unknown";

export interface AttemptRelation {
  relation_id: Identifier;
  prior_attempt_id: Identifier;
  relationship: "not_a_retry";
  rationale: StringField;
  source_bindings: SourceBinding[];
}

export interface Attempt {
  attempt_id: Identifier;
  attempt_version: Version;
  work_unit_id: Identifier;
  attempt_ordinal: number;
  execution_scope: ExecutionScope;
  attempt_outcome: AttemptOutcome;
  started_at: DateTimeField;
  ended_at: DateTimeField;
  method_ids: Identifier[];
  parameter_set: Parameter[];
  input_material_ids: Identifier[];
  input_artifact_ids: Identifier[];
  segment_ids: Identifier[];
  result_ids: Identifier[];
  failure_event_ids: Identifier[];
  output_artifact_ids: Identifier[];
  usable_output_status:
    | "usable"
    | "usable_with_qualification"
    | "not_usable"
    | "not_assessed"
    | "unknown";
  superseded_by_attempt_id: Identifier | null;
  attempt_relations?: AttemptRelation[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export type SegmentState =
  | "completed"
  | "stopped"
  | "crashed"
  | "superseded_by_restart"
  | "running_at_cutoff"
  | "unknown";

export interface Segment {
  segment_id: Identifier;
  segment_version: Version;
  attempt_id: Identifier;
  segment_ordinal: number;
  segment_kind: "phase" | "checkpoint_interval" | "restart" | "replicate_interval" | "batch" | "other";
  segment_state: SegmentState;
  predecessor_segment_id: Identifier | null;
  restart_reason: StringField;
  checkpoint_input_artifact_id: Identifier | null;
  checkpoint_output_artifact_id: Identifier | null;
  parameter_diff: StringArrayField;
  started_at: DateTimeField;
  ended_at: DateTimeField;
  parameters: Parameter[];
  result_ids: Identifier[];
  failure_event_ids: Identifier[];
  output_artifact_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface Method {
  method_id: Identifier;
  method_version: Version;
  name: string;
  method_kind: Identifier;
  execution_status: "performed" | "planned" | "inferred" | "external" | "not_performed" | "unknown";
  execution_scope: ExecutionScope;
  description: StringField;
  planned_parameters: Parameter[];
  actual_parameters: Parameter[];
  protocol_artifact_ids: Identifier[];
  deviation_descriptions: string[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface DecisionEvent {
  decision_event_id: Identifier;
  decision_event_version: Version;
  decision_kind:
    | "scope_change"
    | "method_change"
    | "stopping"
    | "restart"
    | "exclusion"
    | "outlier_handling"
    | "population_definition"
    | "metric_or_endpoint_selection"
    | "model_or_trial_selection"
    | "conflict_adjudication"
    | "disclosure"
    | "other";
  description: string;
  timing_class: TimingClass;
  decided_at: DateTimeField;
  decision_maker: StringField;
  triggering_object_ids: Identifier[];
  affected_object_ids: Identifier[];
  rationale: StringField;
  alternatives_considered: StringArrayField;
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface Material {
  material_id: Identifier;
  material_version: Version;
  entity_id: Identifier;
  material_kind:
    | "biological_source"
    | "sample"
    | "aliquot"
    | "pool"
    | "well_or_container"
    | "construct"
    | "reagent"
    | "specimen"
    | "molecular_system"
    | "dataset_record"
    | "synthetic_material"
    | "other";
  label: StringField;
  batch_or_lot: StringField;
  quantity: NumberField;
  unit: StringField;
  material_status: "available" | "consumed" | "discarded" | "lost" | "contaminated" | "restricted" | "unknown";
  disclosure_class: DisclosureClass;
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface MaterialRelationship {
  relationship_id: Identifier;
  relationship_version: Version;
  relationship_kind:
    | "derived_from"
    | "aliquoted_from"
    | "split_from"
    | "pooled_from"
    | "combined_with"
    | "transformed_from"
    | "measured_from"
    | "filtered_from"
    | "mapped_to_dataset_record"
    | "identity_assertion"
    | "other";
  input_material_ids: Identifier[];
  output_material_ids: Identifier[];
  work_unit_id: Identifier | null;
  attempt_id: Identifier | null;
  segment_id: Identifier | null;
  method_id: Identifier | null;
  transformation_description: StringField;
  input_quantity: NumberField;
  output_quantity: NumberField;
  loss_or_gain_explanation: StringField;
  decision_event_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface PopulationMember {
  member_id: Identifier;
  material_id: Identifier | null;
  entity_id: Identifier | null;
  group_key: StringField;
  inclusion_status: "included" | "excluded" | "withdrawn" | "unknown";
  inclusion_reason: StringField;
  decision_event_ids: Identifier[];
  source_bindings: SourceBinding[];
}

export interface ReplicateStructure {
  biological_unit_definition: StringField;
  technical_unit_definition: StringField;
  experimental_unit_definition: StringField;
  observational_unit_definition: StringField;
  analysis_unit_definition: StringField;
  biological_unit_count: IntegerField;
  technical_unit_count: IntegerField;
  independence_basis: StringField;
  pool_counting_policy: StringField;
}

export interface AnalysisPopulation {
  analysis_population_id: Identifier;
  analysis_population_version: Version;
  name: string;
  population_kind:
    | "intention_to_treat"
    | "per_protocol"
    | "complete_case"
    | "quality_control_passed"
    | "training"
    | "validation"
    | "test"
    | "simulation_frames"
    | "other";
  estimand: StringField;
  inclusion_criteria: StringArrayField;
  exclusion_criteria: StringArrayField;
  members: PopulationMember[];
  replicate_structure: ReplicateStructure;
  decision_event_ids: Identifier[];
  lineage_status: "closed" | "partial" | "broken" | "unknown";
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface ArtifactBinding {
  artifact_id: Identifier;
  artifact_version: Version;
  content_hash: HashField;
}

export interface SliceLocator {
  locator_kind: "table_rows" | "records" | "array_slice" | "frames" | "time_window" | "query" | "files" | "other";
  table_or_object: StringField;
  columns_or_fields: StringArrayField;
  row_or_record_selector: StringField;
  frame_or_time_selector: StringField;
  query: StringField;
  filter_expressions: StringArrayField;
  ordering: StringArrayField;
}

export interface DataSlice {
  data_slice_id: Identifier;
  data_slice_version: Version;
  name: string;
  input_artifacts: ArtifactBinding[];
  locator: SliceLocator;
  analysis_population_id: Identifier | null;
  selected_unit_count: IntegerField;
  excluded_unit_count: IntegerField;
  selection_decision_event_ids: Identifier[];
  slice_hash: HashField;
  created_by_derivation_id: Identifier | null;
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface DerivedValue {
  name: Identifier;
  value: ScientificField<JsonValue>;
  unit: StringField;
  value_hash: HashField;
}

export interface DerivationRecord {
  derivation_id: Identifier;
  derivation_version: Version;
  derivation_kind:
    | "filter"
    | "transform"
    | "aggregation"
    | "statistical_estimate"
    | "model_fit"
    | "simulation_analysis"
    | "manual_calculation"
    | "mapping"
    | "other";
  description: string;
  input_data_slice_ids: Identifier[];
  input_derivation_ids: Identifier[];
  input_artifact_ids: Identifier[];
  operation_or_formula: StringField;
  code_artifact_ids: Identifier[];
  parameters: Parameter[];
  analysis_run_id: Identifier | null;
  output_data_slice_ids: Identifier[];
  output_artifact_ids: Identifier[];
  derived_values: DerivedValue[];
  derivation_status: "complete" | "partial" | "failed" | "invalidated" | "unknown";
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface InvocationArgument {
  position: number;
  name: StringField;
  value: StringField;
}

export interface Invocation {
  invocation_id: Identifier;
  invocation_version: Version;
  invocation_kind: "command" | "notebook" | "workflow" | "instrument" | "protocol" | "manual_action" | "service_call" | "other" | "unknown";
  record_role: "historical_actual" | "planned" | "recipe_template" | "verification_run" | "external_record" | "unknown";
  argument_capture_status?: "complete" | "partial" | "unknown" | "not_applicable";
  parameter_capture_status?: "complete" | "partial" | "unknown" | "not_applicable";
  executable: StringField;
  arguments: InvocationArgument[];
  command_line: StringField;
  working_directory: RelativePathField;
  parameters: Parameter[];
  input_artifact_ids: Identifier[];
  input_manifest_hash?: HashField;
  output_artifact_ids: Identifier[];
  output_manifest_hash?: HashField;
  environment_id?: Identifier | null;
  random_state_id?: Identifier | null;
  started_at: DateTimeField;
  ended_at: DateTimeField;
  termination_status: "not_started" | "running" | "completed" | "failed" | "interrupted" | "aborted" | "unknown";
  exit_code: IntegerField;
  log_artifact_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface SoftwareComponent {
  name: StringField;
  version: StringField;
  content_hash: HashField;
  role: "runtime" | "library" | "compiler" | "driver" | "firmware" | "workflow_engine" | "instrument_software" | "other";
  source_bindings: SourceBinding[];
}

export interface HardwareComponent {
  component_kind: "cpu" | "accelerator" | "memory" | "storage" | "instrument" | "sensor" | "network" | "other";
  manufacturer: StringField;
  model: StringField;
  count: IntegerField;
  firmware_or_driver: StringField;
  characteristics: Parameter[];
}

export interface Environment {
  environment_id: Identifier;
  environment_version: Version;
  environment_hash: HashField;
  capture_method: StringField;
  capture_manifest_artifact_id?: Identifier | null;
  captured_invocation_ids?: Identifier[];
  captured_at: DateTimeField;
  operating_system: StringField;
  architecture: StringField;
  container_or_image: StringField;
  software_components: SoftwareComponent[];
  hardware_components: HardwareComponent[];
  locale: StringField;
  timezone: StringField;
  environment_variable_manifest_hash: HashField;
  lock_artifact_ids: Identifier[];
  completeness: "complete" | "partial" | "absent" | "unknown";
  known_nondeterminism: string[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface SeedAssignment {
  seed_assignment_id: Identifier;
  scope: "global" | "run" | "trial" | "replicate" | "worker" | "rank" | "fold" | "sampling_operation" | "other";
  scope_key: StringField;
  seed_value: IntegerField;
  derivation_method: StringField;
  parent_seed_assignment_id: Identifier | null;
  source_bindings: SourceBinding[];
}

export interface NondeterministicOperation {
  operation: string;
  status: "deterministic" | "nondeterministic" | "conditionally_deterministic" | "unknown" | "not_applicable";
  mitigation: StringField;
  impact: StringField;
}

export interface RandomState {
  random_state_id: Identifier;
  random_state_version: Version;
  randomness_used: "yes" | "no" | "unknown" | "not_applicable";
  deterministic_intent: BooleanField;
  generator_or_algorithm: StringField;
  seed_assignments: SeedAssignment[];
  nondeterministic_operations: NondeterministicOperation[];
  capture_status: "complete" | "partial" | "absent" | "unknown" | "not_applicable";
  state_artifact_id?: Identifier | null;
  captured_invocation_ids?: Identifier[];
  not_applicability_justification?: StringField;
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface AnalysisRun {
  analysis_run_id: Identifier;
  analysis_run_version: Version;
  run_role: "historical_primary" | "historical_secondary" | "sensitivity" | "verification_rerun" | "exploratory" | "external" | "unknown";
  invocation_id: Identifier;
  code_artifacts: ArtifactBinding[];
  environment_id: Identifier;
  random_state_id: Identifier;
  input_data_slice_ids: Identifier[];
  input_derivation_ids: Identifier[];
  started_at: DateTimeField;
  ended_at: DateTimeField;
  execution_status: "completed" | "failed" | "interrupted" | "running" | "unknown";
  exit_code: IntegerField;
  output_artifact_ids: Identifier[];
  output_manifest_hash: HashField;
  log_artifact_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface NumericInterval {
  lower: NumberField;
  upper: NumberField;
  level: NumberField;
  interval_kind: "confidence" | "credible" | "prediction" | "range" | "interquartile" | "other" | "not_applicable" | "unknown";
  unit: StringField;
}

export interface EffectEstimate {
  estimate: NumberField;
  unit: StringField;
  scale: StringField;
  interval: NumericInterval | null;
  p_value: NumberField;
  sample_or_analysis_unit_count: IntegerField;
  estimation_method: StringField;
}

export interface NegativeEvidenceAssessment {
  control_status: "valid" | "failed" | "partial" | "not_recorded" | "not_applicable" | "unknown";
  quality_control_status: "passed" | "failed" | "partial" | "not_assessed" | "not_applicable" | "unknown";
  sensitivity_status: "adequate" | "inadequate" | "not_established" | "not_applicable" | "unknown";
  detection_limit: NumberField;
  minimum_detectable_effect: NumberField;
  equivalence_bounds: NumericInterval | null;
  observed_interval: NumericInterval | null;
  eligible_for_biological_counterevidence: boolean;
  eligibility_reason: string;
  control_record_ids?: Identifier[];
  quality_control_event_ids?: Identifier[];
  analysis_context_ids?: Identifier[];
  analysis_population_id?: Identifier | null;
}

export type ScientificEffectClass =
  | "increase"
  | "decrease"
  | "no_detectable_effect"
  | "equivalent"
  | "heterogeneous"
  | "effect_present_direction_uncertain"
  | "not_estimated"
  | "unknown"
  | "not_applicable"
  | "withheld";

export type StatisticalDecision =
  | "reject_null"
  | "do_not_reject_null"
  | "equivalent"
  | "noninferior"
  | "inconclusive"
  | "descriptive_only"
  | "not_performed"
  | "unknown"
  | "not_applicable"
  | "withheld";

export type InterpretabilityStatus =
  | "interpretable"
  | "qualified"
  | "inconclusive"
  | "not_interpretable"
  | "unknown"
  | "not_applicable"
  | "withheld";

export type RecordDisposition =
  | "primary"
  | "sensitivity_only"
  | "contextual"
  | "excluded"
  | "superseded"
  | "retracted"
  | "pending_review"
  | "unknown"
  | "not_applicable"
  | "withheld";

export interface Result {
  result_id: Identifier;
  result_version: Version;
  result_kind: "quantitative" | "qualitative" | "observation" | "classification" | "comparison" | "other";
  statement: string;
  work_unit_id: Identifier;
  attempt_id: Identifier | null;
  segment_id: Identifier | null;
  analysis_population_id: Identifier | null;
  estimand: StringField;
  population_or_system: StringField;
  condition: StringField;
  time_or_frame_scope: StringField;
  intervention?: StringField;
  dose?: StringField;
  endpoint?: StringField;
  system_state?: StringField;
  comparison_definition?: StringField;
  unit: StringField;
  effect_estimate: EffectEstimate | null;
  derivation_closure_status: "complete" | "partial" | "absent" | "not_applicable" | "unknown";
  scientific_effect_class: ScientificEffectClass;
  statistical_decision: StatisticalDecision;
  interpretability_status: InterpretabilityStatus;
  record_disposition: RecordDisposition;
  disposition_reason: StringField;
  qualification_ids: Identifier[];
  blocker_ids: Identifier[];
  negative_evidence_assessment: NegativeEvidenceAssessment | null;
  data_slice_ids: Identifier[];
  derivation_ids: Identifier[];
  analysis_run_ids: Identifier[];
  output_artifact_ids: Identifier[];
  decision_event_ids: Identifier[];
  conflict_set_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export type FailureClass =
  | "instrument"
  | "reagent_or_material"
  | "protocol_deviation"
  | "data_integrity"
  | "software"
  | "hardware"
  | "resource_exhaustion"
  | "convergence_or_stability"
  | "quality_control"
  | "access_or_permission"
  | "operator_or_process"
  | "unknown"
  | "withheld";

export interface FailureEvent {
  failure_event_id: Identifier;
  failure_event_version: Version;
  failure_class: FailureClass;
  severity: "information" | "recoverable" | "major" | "blocking" | "unknown" | "withheld";
  description: string;
  onset_or_detection: DateTimeField;
  affected_object_id: Identifier;
  work_unit_id: Identifier;
  attempt_id: Identifier | null;
  segment_id: Identifier | null;
  related_object_ids: Identifier[];
  partial_result_ids: Identifier[];
  impact: string;
  resolution_status: "unresolved" | "mitigated" | "resolved_for_future_attempts" | "not_applicable" | "unknown" | "withheld";
  recovery_attempt_ids: Identifier[];
  evidence_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface ResearchQuestion {
  research_question_id: Identifier;
  research_question_version: Version;
  question: string;
  rationale: StringField;
  resolution_criterion_timing: TimingClass;
  resolution_criteria: StringField;
  resolution_status: "resolved" | "partially_resolved" | "unresolved" | "not_addressed" | "not_evaluable";
  qualified_answer: StringField;
  claim_ids: Identifier[];
  limitation_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface EvidenceEdge {
  evidence_edge_id: Identifier;
  evidence_item_id: Identifier;
  claim_id: Identifier;
  relationship: "supports" | "contradicts" | "qualifies";
  dependency_group_id: Identifier | null;
  weighting_note: StringField;
  source_bindings: SourceBinding[];
}

export interface ArgumentEdge {
  argument_edge_id: Identifier;
  source_type: "claim" | "evidence_item" | "argument_step";
  source_id: Identifier;
  target_type: "argument_step" | "claim";
  target_id: Identifier;
}

export interface EvidenceDependencyGroup {
  dependency_group_id: Identifier;
  dependency_basis: StringField;
  shared_ancestor_ids: Identifier[];
  assessment_state: "independent" | "partially_dependent" | "dependent" | "unknown" | "not_applicable" | "withheld";
  evidence_item_ids: Identifier[];
  source_bindings: SourceBinding[];
}

export interface EvidenceItem {
  evidence_item_id: Identifier;
  evidence_item_version: Version;
  evidence_kind: "result" | "observation" | "artifact" | "source_statement" | "derived_value" | "method_validation" | "external_evidence" | "counterevidence" | "other";
  summary: string;
  result_ids: Identifier[];
  artifact_ids: Identifier[];
  data_slice_ids: Identifier[];
  derivation_ids: Identifier[];
  analysis_run_ids: Identifier[];
  source_item_ids: Identifier[];
  evidence_status: "active" | "qualified" | "invalidated" | "retracted" | "superseded" | "review_required" | "unknown" | "withheld";
  quality_assessment: "high" | "moderate" | "low" | "not_assessed" | "unknown" | "withheld";
  dependency_group_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export type ClaimType =
  | "background"
  | "descriptive"
  | "quantitative"
  | "comparative"
  | "associational"
  | "predictive"
  | "causal"
  | "mechanistic"
  | "methodological"
  | "negative_or_absence"
  | "resolution";

export type ClaimSupportStatus =
  | "supported"
  | "qualified"
  | "contested"
  | "unsupported"
  | "invalidated"
  | "review_required"
  | "unknown"
  | "withheld";

export interface Claim {
  claim_id: Identifier;
  object_version: Version;
  proposition: string;
  claim_type: ClaimType;
  subject_bindings: ObjectReference[];
  context: StringField;
  scope: StringField;
  decision_timing: TimingClass;
  support_status: ClaimSupportStatus;
  evidence_edge_ids: Identifier[];
  dependency_edge_ids: Identifier[];
  counterevidence_edge_ids: Identifier[];
  argument_step_ids: Identifier[];
  cross_domain_bridge_ids: Identifier[];
  conflict_set_ids: Identifier[];
  limitation_ids: Identifier[];
  revision_event_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface ArgumentStep {
  argument_step_id: Identifier;
  object_version: Version;
  rule_or_rationale: StringField;
  premise_edge_ids: Identifier[];
  conclusion_edge_ids: Identifier[];
  assumption_states: StringArrayField;
  alternative_explanations: StringArrayField;
  validity_status: "valid_for_scope" | "qualified" | "invalid" | "review_required" | "unknown" | "withheld";
  bridge_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface ClaimDependency {
  claim_dependency_id: Identifier;
  dependency_version: Version;
  upstream_claim_id: Identifier;
  upstream_claim_version: Version;
  downstream_claim_id: Identifier;
  downstream_claim_version: Version;
  dependency_kind: "logical_prerequisite" | "shared_data" | "shared_material" | "shared_method" | "shared_checkpoint" | "derived_from" | "cross_domain" | "other";
  propagation_policy: "invalidate_downstream" | "require_review" | "qualify_downstream" | "no_automatic_change";
  dependency_status: "active" | "broken" | "invalidated" | "review_required" | "unknown";
  source_bindings: SourceBinding[];
}

export type AlignmentState =
  | "matched"
  | "partially_matched"
  | "mismatched"
  | "unknown"
  | "not_applicable"
  | "withheld";

export interface ContextAlignment {
  alignment:
    | "matched"
    | "bounded"
    | "transformed"
    | "partially_matched"
    | "mismatched"
    | "unknown"
    | "not_applicable"
    | "withheld";
  source_value: StringField;
  target_value: StringField;
  transformation: StringField;
  mapping_evidence_bindings: SourceBinding[];
}

export interface CrossDomainBridge {
  bridge_id: Identifier;
  object_version: Version;
  source_domain: Identifier;
  target_domain: Identifier;
  source_entity_version_ids: ObjectReference[];
  target_entity_version_ids: ObjectReference[];
  mapping_type:
    | "identity"
    | "sequence_or_structure"
    | "construct"
    | "material_lineage"
    | "condition"
    | "temporal_scale"
    | "spatial_scale"
    | "computational_to_experimental_observable"
    | "model_to_target_population"
    | "other_declared";
  identity_alignment: AlignmentState;
  construct_alignment: AlignmentState;
  condition_alignment: AlignmentState;
  scale_alignment: AlignmentState;
  intervention_alignment?: ContextAlignment;
  dose_alignment?: ContextAlignment;
  endpoint_alignment?: ContextAlignment;
  time_alignment?: ContextAlignment;
  state_alignment?: ContextAlignment;
  transformation_or_mapping_evidence: StringField;
  assumptions: StringArrayField;
  limitations: StringArrayField;
  validity_status: "valid" | "qualified" | "invalid" | "unknown" | "not_applicable" | "withheld";
  reviewer_state: "reviewed" | "review_required" | "unknown" | "withheld";
  enabled_argument_step_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface ConflictMemberEdge {
  conflict_member_edge_id: Identifier;
  conflict_set_id: Identifier;
  member_type: "claim" | "evidence_item";
  member_id: Identifier;
}

export interface HeterogeneityContextDifference {
  dimension:
    | "estimand"
    | "population_or_system"
    | "condition"
    | "time_or_frame_scope"
    | "analysis_population_id"
    | "intervention"
    | "dose"
    | "endpoint"
    | "system_state"
    | "comparison_definition";
  left_result_id: Identifier;
  right_result_id: Identifier;
  left_value: ScientificField<JsonValue>;
  right_value: ScientificField<JsonValue>;
  materiality_assessment: StringField;
  source_bindings: SourceBinding[];
}

export interface ConflictSet {
  conflict_set_id: Identifier;
  object_version: Version;
  matched_context: StringField;
  member_edge_ids: Identifier[];
  incompatibility_statement: string;
  adjudication_status:
    | "unresolved"
    | "resolved_with_rationale"
    | "retained_as_heterogeneity"
    | "review_required"
    | "unknown"
    | "withheld";
  decision_event_id: Identifier | null;
  downstream_claim_ids: Identifier[];
  heterogeneity_context_differences?: HeterogeneityContextDifference[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface RevisionEvent {
  revision_event_id: Identifier;
  revision_event_version: Version;
  event_kind: "correction" | "retraction" | "supersession" | "source_update" | "entity_merge_or_split" | "disclosure_change" | "other";
  occurred_at: DateTimeField;
  reason: string;
  superseded_object_refs: ObjectReference[];
  replacement_object_refs: ObjectReference[];
  invalidated_object_ids: Identifier[];
  review_required_object_ids: Identifier[];
  impact_statement: string;
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export type ReproducibilityAxisState =
  | "satisfied"
  | "partial"
  | "unsatisfied"
  | "unknown"
  | "not_applicable"
  | "withheld";

export interface AxisAssessment {
  state: ReproducibilityAxisState;
  rationale: string;
  evidence_artifact_ids: Identifier[];
  source_bindings: SourceBinding[];
}

export interface AccessAssessment {
  status:
    | "available_now"
    | "verified_procedure"
    | "controlled_access"
    | "unavailable"
    | "unknown"
    | "not_applicable"
    | "withheld";
  conditions: StringField;
  artifact_ids: Identifier[];
  actor_scope?: StringField;
  authority?: StringField;
  license_or_terms?: StringField;
  procedure_attestation_artifact_id?: Identifier | null;
  source_bindings: SourceBinding[];
}

export interface ComparatorDecisionRule {
  metric: StringField;
  operator:
    | "exact_hash"
    | "canonical_hash_equal"
    | "absolute_difference_lte"
    | "relative_difference_lte"
    | "distance_lte"
    | "p_value_gte"
    | "within_bounds";
  threshold: NumberField;
  lower_bound: NumberField;
  upper_bound: NumberField;
  unit: StringField;
  implementation: StringField;
  implementation_artifact_id: Identifier | null;
}

export interface TargetComparison {
  target_id: Identifier;
  reference_artifact_id: Identifier;
  replay_artifact_id: Identifier;
  comparison_evidence_artifact_id: Identifier;
  observed_value: NumberField;
  result: "met" | "did_not_meet" | "inconclusive";
}

export interface ComparisonSpecification {
  comparator_id: Identifier;
  timing_classification: TimingClass;
  comparator_type:
    | "byte_identical"
    | "canonical_record_identical"
    | "numeric_tolerance"
    | "distributional_equivalence"
    | "scientific_acceptance_bounds"
    | "manual_protocol_criteria";
  targets: StringArrayField;
  target_artifact_ids?: Identifier[];
  decision_rule?: ComparatorDecisionRule;
  equivalence_definition: StringField;
  tolerances: StringField;
  allowed_nondeterminism: StringField;
  failure_conditions: StringArrayField;
  source_bindings: SourceBinding[];
}

export interface ReplayEvent {
  replay_event_id: Identifier;
  executor: StringField;
  execution_time: DateTimeField;
  recipe_version: Version;
  recipe_id?: Identifier;
  environment_id: Identifier | null;
  input_artifact_ids: Identifier[];
  actual_invocation_id: Identifier;
  exit_or_completion_status: "completed" | "failed" | "interrupted" | "unknown" | "withheld";
  output_artifact_ids: Identifier[];
  comparator_id: Identifier;
  comparison_result: "met" | "did_not_meet" | "inconclusive" | "not_run" | "unknown" | "withheld";
  comparison_evidence_artifact_ids?: Identifier[];
  target_comparisons?: TargetComparison[];
  deviations: StringArrayField;
  source_bindings: SourceBinding[];
}

export interface IndependentReproductionEvent {
  reproduction_event_id: Identifier;
  reproduction_kind: "computational" | "experimental";
  independence_assessment: "independent" | "partially_independent" | "not_independent" | "unknown" | "withheld";
  shared_dependency_ids: Identifier[];
  independent_actor?: StringField;
  executor?: StringField;
  execution_time?: DateTimeField;
  execution_record_id?: Identifier;
  actual_invocation_id?: Identifier;
  experimental_execution_record_id?: Identifier;
  actual_attempt_id?: Identifier;
  input_artifact_ids?: Identifier[];
  input_material_ids?: Identifier[];
  environment_id?: Identifier | null;
  implementation_boundary?: StringField;
  implementation_or_protocol_boundary?: StringField;
  random_state_id?: Identifier | null;
  random_state_applicability?: "applicable" | "not_applicable";
  random_state_justification?: StringField;
  comparison_result: "met" | "did_not_meet" | "inconclusive" | "not_run" | "unknown" | "withheld";
  comparator_id: Identifier;
  output_artifact_ids: Identifier[];
  output_result_ids?: Identifier[];
  deviations?: StringArrayField;
  failure_event_ids?: Identifier[];
  failure_assessment?: StringField;
  comparison_evidence_artifact_ids?: Identifier[];
  target_comparisons?: TargetComparison[];
  source_bindings: SourceBinding[];
}

export interface DenominatorExclusion {
  target_kind: "claim" | "output";
  target_id: Identifier;
  justification: string;
  source_bindings: SourceBinding[];
}

export interface CoverageDenominatorDecision {
  decision_event_id: Identifier;
  critical_unit_membership: "included" | "excluded";
  critical_claim_ids: Identifier[];
  critical_output_ids: Identifier[];
  exclusions: DenominatorExclusion[];
  rationale: string;
  source_bindings: SourceBinding[];
}

export interface ReproducibilityCoverageDisposition {
  status: "assessed" | "explicit_gap";
  justification: string;
  source_bindings: SourceBinding[];
}

export interface BoundRecordAssessment {
  record_id: Identifier | null;
  assessment: AxisAssessment;
}

export interface ReproducibilityAxisAssessments {
  provenance_closure: AxisAssessment;
  recipe_fidelity: AxisAssessment;
  data_and_artifact_access: AxisAssessment;
  environment_capture: AxisAssessment;
  random_state_capture: AxisAssessment;
  replay_verification: AxisAssessment;
  independent_computational_reproduction: AxisAssessment;
  independent_experimental_replication: AxisAssessment;
  claim_and_output_coverage: AxisAssessment;
}

export type ReproducibilityLevel =
  | "not_assessed"
  | "R0_documented"
  | "R1_replay_ready"
  | "R2_verified_replay"
  | "R3_independent_reproduction";

export interface ReproducibilityUnit {
  reproducibility_unit_id: Identifier;
  object_version: Version;
  title: string;
  unit_kind:
    | "data_acquisition"
    | "material_preparation"
    | "wet_lab_experiment"
    | "data_transformation"
    | "statistical_analysis"
    | "model_training"
    | "model_inference"
    | "simulation"
    | "trajectory_analysis"
    | "figure_or_table_derivation"
    | "integrated_workflow"
    | "other_declared";
  criticality: "critical" | "supporting" | "contextual";
  scope: StringField;
  covered_work_unit_ids: Identifier[];
  covered_analysis_run_ids: Identifier[];
  covered_claim_ids: Identifier[];
  covered_output_ids: Identifier[];
  historical_invocation_ids: Identifier[];
  recipe_id: Identifier | null;
  recipe_artifact_id?: Identifier | null;
  recipe_record?: JsonObject | null;
  recipe_record_hash?: Sha256Hash;
  bundle_dependency_artifact_ids?: Identifier[];
  coverage_denominator_decision?: CoverageDenominatorDecision;
  coverage_disposition?: ReproducibilityCoverageDisposition;
  input_closure: AxisAssessment;
  artifact_closure: AxisAssessment;
  environment_record: BoundRecordAssessment;
  random_state_record: BoundRecordAssessment;
  access_assessment: AccessAssessment;
  comparison_specification: ComparisonSpecification;
  replay_events: ReplayEvent[];
  independent_reproduction_events: IndependentReproductionEvent[];
  axis_assessments: ReproducibilityAxisAssessments;
  conservative_level: ReproducibilityLevel;
  level_reason: string;
  limitation_ids: Identifier[];
  source_bindings: SourceBinding[];
  extensions: ExtensionMap;
}

export interface ScientificReport {
  report_id: Identifier;
  project_id: Identifier;
  report_version: Version;
  schema_version: Version;
  payload_role: "canonical_authoritative" | "public_projection" | "restricted_projection";
  title: string;
  language: string;
  report_mode: "summary" | "full_archive" | "filtered_working_copy";
  created_at: DateTime;
  scope: Scope;
  cutoff: DateTimeField;
  applicability_decisions: ApplicabilityDecision[];
  module_manifest: ModuleManifestItem[];
  section_coverage: SectionCoverage[];
  source_coverage: SourceCoverage;
  research_questions: ResearchQuestion[];
  entities: Entity[];
  campaigns: Campaign[];
  work_units: WorkUnit[];
  attempts: Attempt[];
  segments: Segment[];
  methods: Method[];
  decision_events: DecisionEvent[];
  materials: Material[];
  material_relationships: MaterialRelationship[];
  analysis_populations: AnalysisPopulation[];
  data_slices: DataSlice[];
  derivations: DerivationRecord[];
  invocations: Invocation[];
  environments: Environment[];
  random_states: RandomState[];
  analysis_runs: AnalysisRun[];
  results: Result[];
  failures: FailureEvent[];
  evidence_items: EvidenceItem[];
  evidence_edges: EvidenceEdge[];
  evidence_dependency_groups: EvidenceDependencyGroup[];
  claims: Claim[];
  argument_steps: ArgumentStep[];
  argument_edges: ArgumentEdge[];
  claim_dependencies: ClaimDependency[];
  cross_domain_bridges: CrossDomainBridge[];
  conflict_sets: ConflictSet[];
  conflict_member_edges: ConflictMemberEdge[];
  artifacts: Artifact[];
  reproducibility_units: ReproducibilityUnit[];
  limitations: Limitation[];
  revision_events: RevisionEvent[];
  review_tasks: ReviewTask[];
  disclosure_state: DisclosureState;
  extensions: ExtensionMap;
}

export type CanonicalScientificReport = ScientificReport;

export interface DomainPackPayload extends Record<string, JsonValue> {
  payload_id: Identifier;
  domain: "wet_lab" | "ai_ml" | "molecular_dynamics" | string;
  pack_version: Version;
}
