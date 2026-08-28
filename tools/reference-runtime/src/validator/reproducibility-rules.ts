import { sha256CanonicalJson } from "../lib/hash.js";
import { canonicalJsonBytes } from "../lib/json.js";
import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import type {
  Artifact,
  Environment,
  Invocation,
  RandomState,
  ReproducibilityLevel,
  ReproducibilityUnit,
} from "../lib/types.js";
import { finding, pointer } from "./context.js";
import type { SemanticContext, SupportedLevelAssessment, ValidationFinding } from "./types.js";

const LEVELS: ReproducibilityLevel[] = [
  "not_assessed",
  "R0_documented",
  "R1_replay_ready",
  "R2_verified_replay",
  "R3_independent_reproduction",
];

interface AccessExtension {
  actor_scope?: unknown;
  authority?: unknown;
  license_or_terms?: unknown;
  procedure_attestation_artifact_id?: string | null;
}

interface InvocationExtension {
  environment_id?: string | null;
  random_state_id?: string | null;
  input_manifest_hash?: unknown;
  output_manifest_hash?: unknown;
  argument_capture_status?: string;
  parameter_capture_status?: string;
}

interface EnvironmentExtension {
  capture_manifest_artifact_id?: string | null;
  captured_invocation_ids?: string[];
}

interface RandomStateExtension {
  state_artifact_id?: string | null;
  captured_invocation_ids?: string[];
  not_applicability_justification?: unknown;
}

interface DenominatorExclusionRecord {
  target_kind: "claim" | "output";
  target_id: string;
  justification: string;
  source_bindings: unknown[];
}

interface CoverageDenominatorDecisionRecord {
  decision_event_id: string;
  critical_unit_membership: "included" | "excluded";
  critical_claim_ids: string[];
  critical_output_ids: string[];
  exclusions: DenominatorExclusionRecord[];
  rationale: string;
  source_bindings: unknown[];
}

interface CoverageDispositionRecord {
  status: "assessed" | "explicit_gap";
  justification: string;
  source_bindings: unknown[];
}

interface UnitExtension {
  recipe_artifact_id?: string | null;
  recipe_record?: unknown | null;
  recipe_record_hash?: string;
  bundle_dependency_artifact_ids?: string[];
  coverage_denominator_decision?: CoverageDenominatorDecisionRecord;
  coverage_disposition?: CoverageDispositionRecord;
}

interface ComparisonSpecificationExtension {
  target_artifact_ids?: string[];
  decision_rule?: unknown;
}

interface ReplayEventExtension {
  recipe_id?: string;
  comparison_evidence_artifact_ids?: string[];
  target_comparisons?: unknown[];
}

interface IndependentReproductionEventExtension {
  independent_actor?: unknown;
  executor?: unknown;
  execution_time?: unknown;
  execution_record_id?: string;
  actual_invocation_id?: string;
  experimental_execution_record_id?: string;
  actual_attempt_id?: string;
  input_artifact_ids?: string[];
  input_material_ids?: string[];
  environment_id?: string | null;
  implementation_boundary?: unknown;
  implementation_or_protocol_boundary?: unknown;
  random_state_id?: string | null;
  random_state_applicability?: "applicable" | "not_applicable";
  random_state_justification?: unknown;
  output_result_ids?: string[];
  deviations?: unknown;
  failure_event_ids?: string[];
  failure_assessment?: unknown;
  comparison_evidence_artifact_ids?: string[];
  target_comparisons?: unknown[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.map(record).filter((item): item is UnknownRecord => item !== null)
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function fieldState(value: unknown): string | null {
  const object = record(value);
  return typeof object?.state === "string" ? object.state : null;
}

function knownValue<T>(value: unknown): T | undefined {
  const object = record(value);
  return object?.state === "known" ? object.value as T : undefined;
}

function knownString(value: unknown): string | undefined {
  const candidate = knownValue<unknown>(value);
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : undefined;
}

function knownNumber(value: unknown): number | undefined {
  const candidate = knownValue<unknown>(value);
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
}

function knownStringArray(value: unknown): string[] | undefined {
  const candidate = knownValue<unknown>(value);
  if (!Array.isArray(candidate) || !candidate.every((item) => typeof item === "string" && item.trim().length > 0)) return undefined;
  return candidate;
}

function knownBoolean(value: unknown): boolean | undefined {
  const candidate = knownValue<unknown>(value);
  return typeof candidate === "boolean" ? candidate : undefined;
}

function knownAndEvidenceBound(value: unknown): boolean {
  const object = record(value);
  return object?.state === "known" &&
    object.value !== null &&
    object.value !== undefined &&
    (strings(object.source_bindings).length > 0 || strings(object.derivation_bindings).length > 0 || records(object.source_bindings).length > 0);
}

function justifiedNotApplicable(value: unknown): boolean {
  const object = record(value);
  return object?.state === "not_applicable" && typeof object.missing_reason === "string" && object.missing_reason.trim().length > 0;
}

function definedOrJustifiedNotApplicable(value: unknown): boolean {
  return knownValue(value) !== undefined || justifiedNotApplicable(value);
}

function sourceBound(value: { source_bindings?: unknown[] }): boolean {
  return Array.isArray(value.source_bindings) && value.source_bindings.length > 0;
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function sameSet(left: Iterable<string>, right: Iterable<string>): boolean {
  const leftValues = sorted(left);
  const rightValues = sorted(right);
  return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
}

function missingFrom(required: Iterable<string>, actual: Iterable<string>): string[] {
  const actualSet = new Set(actual);
  return sorted(required).filter((id) => !actualSet.has(id));
}

function unitExtension(unit: ReproducibilityUnit): UnitExtension {
  return unit as ReproducibilityUnit & UnitExtension;
}

function artifact(context: SemanticContext, id: string): Artifact | undefined {
  return context.report.artifacts.find((candidate) => candidate.artifact_id === id);
}

function artifactReplayReady(context: SemanticContext, artifactId: string): boolean {
  const candidate = artifact(context, artifactId);
  return candidate !== undefined &&
    knownString(candidate.content_hash) !== undefined &&
    knownString(candidate.location) !== undefined &&
    knownNumber(candidate.byte_size) !== undefined &&
    !["unknown", "unavailable", "not_applicable"].includes(candidate.access_state);
}

function artifactHash(context: SemanticContext, artifactId: string): string | undefined {
  return knownString(artifact(context, artifactId)?.content_hash);
}

function verificationInvocation(context: SemanticContext, id: string): boolean {
  return context.report.invocations.some((invocation) =>
    invocation.invocation_id === id &&
    invocation.record_role === "verification_run" &&
    invocation.termination_status === "completed",
  );
}

function boundEnvironment(context: SemanticContext, unit: ReproducibilityUnit): Environment | undefined {
  return unit.environment_record.record_id === null
    ? undefined
    : context.report.environments.find((candidate) => candidate.environment_id === unit.environment_record.record_id);
}

function boundRandomState(context: SemanticContext, unit: ReproducibilityUnit): RandomState | undefined {
  return unit.random_state_record.record_id === null
    ? undefined
    : context.report.random_states.find((candidate) => candidate.random_state_id === unit.random_state_record.record_id);
}

function recipe(unit: ReproducibilityUnit): UnknownRecord | null {
  return record(unitExtension(unit).recipe_record);
}

function recipeRequiredInputArtifactIds(unit: ReproducibilityUnit): string[] {
  return records(recipe(unit)?.inputs)
    .filter((input) => input.required === true)
    .flatMap((input) => typeof input.artifact_id === "string" ? [input.artifact_id] : []);
}

function completeInvocationGaps(
  context: SemanticContext,
  invocationId: string,
  role: "historical_actual" | "verification_run",
  environmentId: string | null,
  randomStateId: string | null,
): string[] {
  const gaps: string[] = [];
  const invocation = context.report.invocations.find((candidate) => candidate.invocation_id === invocationId);
  if (invocation === undefined) return [`invocation ${invocationId} is unresolved`];
  if (invocation.record_role !== role) gaps.push(`invocation ${invocationId} is not a ${role.replace("_", "-")} record`);
  if (invocation.termination_status !== "completed") gaps.push(`invocation ${invocationId} is not completed`);
  if (knownString(invocation.executable) === undefined) gaps.push(`invocation ${invocationId} executable is not known`);
  if (knownString(invocation.command_line) === undefined) gaps.push(`invocation ${invocationId} command line is not known`);
  if (knownString(invocation.working_directory) === undefined) gaps.push(`invocation ${invocationId} working directory is not known`);
  if (knownString(invocation.started_at) === undefined || knownString(invocation.ended_at) === undefined) gaps.push(`invocation ${invocationId} start/end time is not completely known`);
  if (knownNumber(invocation.exit_code) === undefined) gaps.push(`invocation ${invocationId} exit code is not known`);
  if (invocation.input_artifact_ids.length === 0) gaps.push(`invocation ${invocationId} has no enumerated input artifacts`);
  if (invocation.output_artifact_ids.length === 0) gaps.push(`invocation ${invocationId} has no enumerated output artifacts`);
  const unresolvedArtifacts = [...invocation.input_artifact_ids, ...invocation.output_artifact_ids]
    .filter((id) => !artifactReplayReady(context, id));
  if (unresolvedArtifacts.length > 0) gaps.push(`invocation ${invocationId} artifacts lack resolvable version/hash/location metadata: ${sorted(unresolvedArtifacts).join(", ")}`);
  if (!sourceBound(invocation)) gaps.push(`invocation ${invocationId} has no source binding`);

  const extension = invocation as Invocation & InvocationExtension;
  if (extension.argument_capture_status !== "complete") gaps.push(`invocation ${invocationId} argument capture is not complete`);
  if (extension.parameter_capture_status !== "complete") gaps.push(`invocation ${invocationId} parameter capture is not complete`);
  if (knownString(extension.input_manifest_hash) === undefined) gaps.push(`invocation ${invocationId} input manifest hash is not known`);
  if (knownString(extension.output_manifest_hash) === undefined) gaps.push(`invocation ${invocationId} output manifest hash is not known`);
  if (environmentId === null || extension.environment_id !== environmentId) gaps.push(`invocation ${invocationId} is not bound to environment ${environmentId ?? "<absent>"}`);
  if (randomStateId === null || extension.random_state_id !== randomStateId) gaps.push(`invocation ${invocationId} is not bound to random state ${randomStateId ?? "<absent>"}`);
  return gaps;
}

function environmentGaps(context: SemanticContext, unit: ReproducibilityUnit, invocationIds: readonly string[]): string[] {
  const gaps: string[] = [];
  const environment = boundEnvironment(context, unit);
  if (environment === undefined) return ["bound environment record is absent or unresolved"];
  if (environment.completeness !== "complete") gaps.push(`environment ${environment.environment_id} completeness is ${environment.completeness}`);
  if (knownString(environment.environment_hash) === undefined) gaps.push(`environment ${environment.environment_id} hash is not known`);
  const requiredKnownFields: Array<[string, unknown]> = [
    ["capture method", environment.capture_method],
    ["capture time", environment.captured_at],
    ["operating system", environment.operating_system],
    ["architecture", environment.architecture],
    ["locale", environment.locale],
    ["timezone", environment.timezone],
    ["environment-variable manifest hash", environment.environment_variable_manifest_hash],
  ];
  for (const [label, value] of requiredKnownFields) {
    if (knownValue(value) === undefined) gaps.push(`environment ${environment.environment_id} ${label} is not known`);
  }
  if (environment.software_components.length === 0 && environment.lock_artifact_ids.length === 0) {
    gaps.push(`environment ${environment.environment_id} has neither software components nor lock artifacts`);
  }
  for (const component of environment.software_components) {
    if (knownString(component.name) === undefined || knownString(component.version) === undefined || knownString(component.content_hash) === undefined || !sourceBound(component)) {
      gaps.push(`environment ${environment.environment_id} has an incompletely versioned or unbound software component`);
    }
  }
  const extension = environment as Environment & EnvironmentExtension;
  if (extension.capture_manifest_artifact_id === null || extension.capture_manifest_artifact_id === undefined || !artifactReplayReady(context, extension.capture_manifest_artifact_id)) {
    gaps.push(`environment ${environment.environment_id} capture manifest artifact is absent or not integrity-bound`);
  }
  const missingInvocations = missingFrom(invocationIds, extension.captured_invocation_ids ?? []);
  if (missingInvocations.length > 0) gaps.push(`environment ${environment.environment_id} is not bound to invocations: ${missingInvocations.join(", ")}`);
  const unresolvedLocks = environment.lock_artifact_ids.filter((id) => !artifactReplayReady(context, id));
  if (unresolvedLocks.length > 0) gaps.push(`environment ${environment.environment_id} lock artifacts are unresolved: ${sorted(unresolvedLocks).join(", ")}`);
  if (!sourceBound(environment)) gaps.push(`environment ${environment.environment_id} has no source binding`);
  return gaps;
}

function randomStateGaps(context: SemanticContext, unit: ReproducibilityUnit, invocationIds: readonly string[]): string[] {
  const gaps: string[] = [];
  const randomState = boundRandomState(context, unit);
  if (randomState === undefined) return ["bound random-state record is absent or unresolved"];
  const extension = randomState as RandomState & RandomStateExtension;
  const missingInvocations = missingFrom(invocationIds, extension.captured_invocation_ids ?? []);
  if (missingInvocations.length > 0) gaps.push(`random state ${randomState.random_state_id} is not bound to invocations: ${missingInvocations.join(", ")}`);
  if (!sourceBound(randomState)) gaps.push(`random state ${randomState.random_state_id} has no source binding`);

  if (randomState.randomness_used === "yes") {
    if (randomState.capture_status !== "complete") gaps.push(`random state ${randomState.random_state_id} capture is ${randomState.capture_status}`);
    if (knownString(randomState.generator_or_algorithm) === undefined) gaps.push(`random state ${randomState.random_state_id} generator/algorithm is not known`);
    if (randomState.seed_assignments.length === 0) gaps.push(`random state ${randomState.random_state_id} has no seed assignments`);
    for (const seed of randomState.seed_assignments) {
      if (knownNumber(seed.seed_value) === undefined || knownString(seed.scope_key) === undefined || knownString(seed.derivation_method) === undefined || !sourceBound(seed)) {
        gaps.push(`random state ${randomState.random_state_id} has an incomplete or unbound seed assignment ${seed.seed_assignment_id}`);
      }
    }
    if (extension.state_artifact_id === null || extension.state_artifact_id === undefined || !artifactReplayReady(context, extension.state_artifact_id)) {
      gaps.push(`random state ${randomState.random_state_id} state artifact is absent or not integrity-bound`);
    }
  } else if (randomState.randomness_used === "no") {
    if (randomState.capture_status !== "not_applicable") gaps.push(`nonrandom record ${randomState.random_state_id} must use not_applicable capture status`);
    if (knownBoolean(randomState.deterministic_intent) !== true) gaps.push(`nonrandom record ${randomState.random_state_id} lacks known deterministic intent`);
    if (!justifiedNotApplicable(randomState.generator_or_algorithm)) gaps.push(`nonrandom record ${randomState.random_state_id} lacks a justified generator non-applicability decision`);
    if (!definedOrJustifiedNotApplicable(extension.not_applicability_justification)) gaps.push(`nonrandom record ${randomState.random_state_id} lacks a bound non-applicability justification`);
    if (randomState.seed_assignments.length > 0) gaps.push(`nonrandom record ${randomState.random_state_id} unexpectedly declares seed assignments`);
  } else {
    gaps.push(`randomness use for ${randomState.random_state_id} is ${randomState.randomness_used}, which cannot support replay readiness`);
  }
  if (randomState.nondeterministic_operations.some((operation) => ["unknown", "not_applicable"].includes(operation.status))) {
    gaps.push(`random state ${randomState.random_state_id} has unresolved nondeterministic operations`);
  }
  return gaps;
}

function recipeGaps(context: SemanticContext, unit: ReproducibilityUnit): string[] {
  const gaps: string[] = [];
  const recipeRecord = recipe(unit);
  const extension = unitExtension(unit);
  if (unit.recipe_id === null) gaps.push("recipe identity is absent");
  if (recipeRecord === null) return [...gaps, "versioned recipe content is absent or unresolved"];
  const recipeId = typeof recipeRecord.recipe_id === "string" ? recipeRecord.recipe_id : null;
  const recipeVersion = typeof recipeRecord.recipe_version === "string" ? recipeRecord.recipe_version : null;
  const computedRecipeHash = sha256CanonicalJson(recipeRecord);
  const computedRecipeByteSize = canonicalJsonBytes(recipeRecord).byteLength;
  if (extension.recipe_record_hash !== computedRecipeHash) gaps.push("inline recipe record hash is absent or does not match canonical recipe content");
  if (recipeId === null || recipeId !== unit.recipe_id) gaps.push("recipe record identity does not match the reproducibility unit");
  if (recipeVersion === null) gaps.push("recipe record version is absent");
  if (recipeRecord.report_id !== context.report.report_id || recipeRecord.report_version !== context.report.report_version) gaps.push("recipe record is not bound to this report identity/version");
  if (!strings(recipeRecord.target_reproducibility_unit_ids).includes(unit.reproducibility_unit_id)) gaps.push("recipe record does not target this reproducibility unit");
  const missingClaims = missingFrom(unit.covered_claim_ids, strings(recipeRecord.target_claim_ids));
  if (missingClaims.length > 0) gaps.push(`recipe target claims omit: ${missingClaims.join(", ")}`);
  const missingOutputs = missingFrom(unit.covered_output_ids, strings(recipeRecord.target_output_artifact_ids));
  if (missingOutputs.length > 0) gaps.push(`recipe target outputs omit: ${missingOutputs.join(", ")}`);
  if (!sameSet(strings(recipeRecord.historical_invocation_ids), unit.historical_invocation_ids)) gaps.push("recipe historical invocation set does not match the unit");
  if (!sourceBound(recipeRecord as { source_bindings?: unknown[] })) gaps.push("recipe record has no source binding");

  const recipeArtifactId = extension.recipe_artifact_id;
  if (recipeArtifactId === null || recipeArtifactId === undefined || recipeRecord.recipe_artifact_id !== recipeArtifactId) {
    gaps.push("recipe artifact identity is absent or disagrees with the recipe record");
  } else {
    const recipeArtifact = artifact(context, recipeArtifactId);
    if (recipeArtifact === undefined || recipeArtifact.artifact_role !== "recipe" || !artifactReplayReady(context, recipeArtifactId)) {
      gaps.push(`recipe artifact ${recipeArtifactId} is not a resolvable, integrity-bound recipe artifact`);
    } else {
      if (recipeVersion !== null && recipeArtifact.artifact_version !== recipeVersion) {
        gaps.push(`recipe artifact ${recipeArtifactId} version does not match recipe version ${recipeVersion}`);
      }
      if (knownString(recipeArtifact.content_hash) !== computedRecipeHash) gaps.push(`recipe artifact ${recipeArtifactId} hash does not bind the canonical inline recipe record`);
      if (knownNumber(recipeArtifact.byte_size) !== computedRecipeByteSize) gaps.push(`recipe artifact ${recipeArtifactId} byte size does not bind the canonical inline recipe record`);
    }
  }

  const inputs = records(recipeRecord.inputs);
  const requiredInputs = inputs.filter((input) => input.required === true);
  if (requiredInputs.length === 0) gaps.push("recipe has no enumerated required inputs");
  for (const input of requiredInputs) {
    const id = typeof input.artifact_id === "string" ? input.artifact_id : "<missing>";
    const candidate = artifact(context, id);
    if (candidate === undefined || !artifactReplayReady(context, id)) {
      gaps.push(`recipe input ${id} is unresolved or not integrity-bound`);
      continue;
    }
    if (input.artifact_version !== candidate.artifact_version) gaps.push(`recipe input ${id} version does not match artifact record`);
    if (knownString(input.content_hash) !== knownString(candidate.content_hash)) gaps.push(`recipe input ${id} hash does not match artifact record`);
    if (knownString(input.target_relative_path) === undefined) gaps.push(`recipe input ${id} target path is not known`);
  }

  const expectedOutputs = records(recipeRecord.expected_outputs).filter((output) => output.required === true);
  if (expectedOutputs.length === 0) gaps.push("recipe has no required expected outputs");
  for (const output of expectedOutputs) {
    const id = typeof output.artifact_id === "string" ? output.artifact_id : "<missing>";
    const candidate = artifact(context, id);
    if (candidate === undefined || !artifactReplayReady(context, id)) {
      gaps.push(`recipe expected output ${id} is unresolved or not integrity-bound`);
      continue;
    }
    if (knownString(output.reference_hash) !== knownString(candidate.content_hash)) gaps.push(`recipe expected output ${id} reference hash does not match artifact record`);
    if (knownString(output.relative_path) === undefined) gaps.push(`recipe expected output ${id} relative path is not known`);
    if (output.comparison_method === "unknown" || output.comparison_method === "existence_only") gaps.push(`recipe expected output ${id} has no reproducible comparison method`);
    if (!definedOrJustifiedNotApplicable(output.acceptance_criteria)) gaps.push(`recipe expected output ${id} acceptance criteria are undefined`);
  }

  const steps = records(recipeRecord.steps);
  if (steps.length === 0) gaps.push("recipe contains no executable steps");
  for (const step of steps) {
    const stepId = typeof step.step_id === "string" ? step.step_id : "<missing>";
    if (knownString(step.executable_or_action) === undefined) gaps.push(`recipe step ${stepId} executable/action is not known`);
    if (knownStringArray(step.arguments) === undefined) gaps.push(`recipe step ${stepId} arguments are not completely captured`);
    if (["command", "notebook", "workflow"].includes(String(step.action_kind)) && knownString(step.working_directory) === undefined) {
      gaps.push(`recipe step ${stepId} working directory is not known`);
    }
  }

  const environment = boundEnvironment(context, unit);
  if (environment === undefined || recipeRecord.environment_id !== environment.environment_id || knownString(recipeRecord.environment_hash) !== knownString(environment.environment_hash)) {
    gaps.push("recipe environment identity/hash does not match the bound environment record");
  }
  const environmentExtension = environment as (Environment & EnvironmentExtension) | undefined;
  if (environmentExtension === undefined || recipeRecord.environment_manifest_artifact_id !== environmentExtension.capture_manifest_artifact_id) {
    gaps.push("recipe environment manifest does not match the bound environment capture");
  }
  const randomState = boundRandomState(context, unit);
  if (randomState === undefined || recipeRecord.random_state_id !== randomState.random_state_id) gaps.push("recipe random-state identity does not match the bound random-state record");
  const randomExtension = randomState as (RandomState & RandomStateExtension) | undefined;
  if (recipeRecord.random_state_artifact_id !== (randomExtension?.state_artifact_id ?? null)) gaps.push("recipe random-state artifact does not match the bound random-state record");
  if (!definedOrJustifiedNotApplicable(recipeRecord.random_state_policy)) gaps.push("recipe random-state policy is undefined");

  const alignment = recipeRecord.historical_alignment;
  if (!["exact", "semantically_equivalent", "differs"].includes(String(alignment))) {
    gaps.push(`recipe historical alignment is ${String(alignment)}`);
  } else if (alignment === "differs") {
    const differences = records(recipeRecord.differences_from_historical);
    if (differences.length === 0) gaps.push("recipe differs from historical execution without enumerated differences");
    if (differences.some((difference) => difference.materiality !== "non_material" || difference.review_status !== "accepted" || !sourceBound(difference as { source_bindings?: unknown[] }))) {
      gaps.push("recipe has a material, unaccepted, or unbound difference from historical execution");
    }
  }
  return gaps;
}

function comparatorGaps(context: SemanticContext, unit: ReproducibilityUnit): string[] {
  const gaps: string[] = [];
  const specification = unit.comparison_specification;
  const extension = specification as typeof specification & ComparisonSpecificationExtension;
  if (!["predefined", "adaptive"].includes(specification.timing_classification)) gaps.push(`comparison timing is ${specification.timing_classification}`);
  const targets = knownStringArray(specification.targets);
  if (targets === undefined || targets.length === 0) gaps.push("comparison targets are not known and nonempty");
  const targetArtifactIds = extension.target_artifact_ids ?? [];
  if (targetArtifactIds.length === 0) gaps.push("comparison target artifact set is empty");
  else {
    if (targets !== undefined && !sameSet(targets, targetArtifactIds)) gaps.push("comparison target labels do not exactly match target artifact identities");
    const unresolved = targetArtifactIds.filter((id) => !artifactReplayReady(context, id));
    if (unresolved.length > 0) gaps.push(`comparison targets are unresolved or not integrity-bound: ${sorted(unresolved).join(", ")}`);
  }
  if (knownString(specification.equivalence_definition) === undefined) gaps.push("comparison equivalence definition is not known");
  if (knownString(specification.allowed_nondeterminism) === undefined) gaps.push("allowed nondeterminism is not known");
  const failureConditions = knownStringArray(specification.failure_conditions);
  if (failureConditions === undefined || failureConditions.length === 0) gaps.push("comparison failure conditions are not known and nonempty");
  if (!sourceBound(specification)) gaps.push("comparison specification has no source binding");

  const decisionRule = record(extension.decision_rule);
  if (decisionRule === null) return [...gaps, "typed comparator decision rule is absent"];
  if (knownString(decisionRule.metric) === undefined) gaps.push("comparator metric is not known");
  if (knownString(decisionRule.implementation) === undefined) gaps.push("comparator implementation is not known");
  const operator = typeof decisionRule.operator === "string" ? decisionRule.operator : "";
  const expectedOperators: Record<string, string[]> = {
    byte_identical: ["exact_hash"],
    canonical_record_identical: ["canonical_hash_equal"],
    numeric_tolerance: ["absolute_difference_lte", "relative_difference_lte"],
    distributional_equivalence: ["distance_lte", "p_value_gte"],
    scientific_acceptance_bounds: ["within_bounds"],
    manual_protocol_criteria: [],
  };
  if (!(expectedOperators[specification.comparator_type] ?? []).includes(operator)) {
    gaps.push(`operator ${operator || "<absent>"} is not defined for comparator type ${specification.comparator_type}`);
  }
  if (["numeric_tolerance", "distributional_equivalence"].includes(specification.comparator_type)) {
    const threshold = knownNumber(decisionRule.threshold);
    if (threshold === undefined || threshold < 0) gaps.push("numeric/distributional comparator threshold is not a known nonnegative number");
    if (knownString(specification.tolerances) === undefined) gaps.push("numeric/distributional comparator tolerances are not known");
  } else if (specification.comparator_type === "scientific_acceptance_bounds") {
    const lower = knownNumber(decisionRule.lower_bound);
    const upper = knownNumber(decisionRule.upper_bound);
    if (lower === undefined || upper === undefined || lower > upper) gaps.push("scientific acceptance bounds are not a known ordered interval");
    if (knownString(specification.tolerances) === undefined) gaps.push("scientific acceptance tolerances are not known");
  } else if (!["byte_identical", "canonical_record_identical"].includes(specification.comparator_type)) {
    gaps.push(`${specification.comparator_type} cannot provide machine-checked R2 evidence`);
  }
  const implementationArtifactId = typeof decisionRule.implementation_artifact_id === "string" ? decisionRule.implementation_artifact_id : null;
  if (!["byte_identical", "canonical_record_identical"].includes(specification.comparator_type) && (implementationArtifactId === null || !artifactReplayReady(context, implementationArtifactId))) {
    gaps.push("custom comparator implementation artifact is absent or not integrity-bound");
  }
  return gaps;
}

function dependencyArtifactIds(context: SemanticContext, unit: ReproducibilityUnit, includeReplay: boolean): string[] {
  const dependencies = new Set<string>([
    ...unit.input_closure.evidence_artifact_ids,
    ...unit.artifact_closure.evidence_artifact_ids,
  ]);
  const extension = unitExtension(unit);
  if (extension.recipe_artifact_id !== null && extension.recipe_artifact_id !== undefined) dependencies.add(extension.recipe_artifact_id);
  const recipeRecord = recipe(unit);
  for (const input of records(recipeRecord?.inputs)) if (typeof input.artifact_id === "string") dependencies.add(input.artifact_id);
  for (const output of records(recipeRecord?.expected_outputs)) if (typeof output.artifact_id === "string") dependencies.add(output.artifact_id);
  for (const id of strings(recipeRecord?.target_output_artifact_ids)) dependencies.add(id);
  if (typeof recipeRecord?.environment_manifest_artifact_id === "string") dependencies.add(recipeRecord.environment_manifest_artifact_id);
  if (typeof recipeRecord?.random_state_artifact_id === "string") dependencies.add(recipeRecord.random_state_artifact_id);

  for (const invocationId of unit.historical_invocation_ids) {
    const invocation = context.report.invocations.find((candidate) => candidate.invocation_id === invocationId);
    if (invocation !== undefined) {
      for (const id of [...invocation.input_artifact_ids, ...invocation.output_artifact_ids, ...invocation.log_artifact_ids]) dependencies.add(id);
    }
  }
  for (const runId of unit.covered_analysis_run_ids) {
    const run = context.report.analysis_runs.find((candidate) => candidate.analysis_run_id === runId);
    if (run !== undefined) {
      for (const code of run.code_artifacts) dependencies.add(code.artifact_id);
      for (const id of [...run.output_artifact_ids, ...run.log_artifact_ids]) dependencies.add(id);
    }
  }
  const environment = boundEnvironment(context, unit);
  if (environment !== undefined) {
    for (const id of environment.lock_artifact_ids) dependencies.add(id);
    const manifestId = (environment as Environment & EnvironmentExtension).capture_manifest_artifact_id;
    if (manifestId !== null && manifestId !== undefined) dependencies.add(manifestId);
  }
  const randomState = boundRandomState(context, unit);
  const randomArtifactId = (randomState as (RandomState & RandomStateExtension) | undefined)?.state_artifact_id;
  if (randomArtifactId !== null && randomArtifactId !== undefined) dependencies.add(randomArtifactId);
  const access = unit.access_assessment as typeof unit.access_assessment & AccessExtension;
  if (access.procedure_attestation_artifact_id !== null && access.procedure_attestation_artifact_id !== undefined) dependencies.add(access.procedure_attestation_artifact_id);
  const comparison = unit.comparison_specification as typeof unit.comparison_specification & ComparisonSpecificationExtension;
  const decisionRule = record(comparison.decision_rule);
  if (typeof decisionRule?.implementation_artifact_id === "string") dependencies.add(decisionRule.implementation_artifact_id);

  if (includeReplay) {
    for (const event of unit.replay_events) {
      const eventExtension = event as typeof event & ReplayEventExtension;
      for (const id of [...event.input_artifact_ids, ...event.output_artifact_ids, ...(eventExtension.comparison_evidence_artifact_ids ?? [])]) dependencies.add(id);
    }
  }
  return sorted(dependencies);
}

function accessGaps(context: SemanticContext, unit: ReproducibilityUnit, includeReplay: boolean): string[] {
  const gaps: string[] = [];
  const assessment = unit.access_assessment as typeof unit.access_assessment & AccessExtension;
  if (!["available_now", "verified_procedure"].includes(assessment.status)) {
    gaps.push(`data/artifact access is ${assessment.status}; R1+ requires available_now or verified_procedure`);
  }
  if (knownString(assessment.actor_scope) === undefined) gaps.push("access actor scope is not known");
  if (!definedOrJustifiedNotApplicable(assessment.authority)) gaps.push("access authority is neither known nor justifiably not applicable");
  if (!definedOrJustifiedNotApplicable(assessment.license_or_terms)) gaps.push("access license/terms are neither known nor justifiably not applicable");
  if (!sourceBound(assessment)) gaps.push("access assessment has no source binding");

  const attestationId = assessment.procedure_attestation_artifact_id;
  const attestationArtifact = typeof attestationId === "string" ? artifact(context, attestationId) : undefined;
  const attestationReady = typeof attestationId === "string" &&
    artifactReplayReady(context, attestationId) &&
    attestationArtifact !== undefined &&
    ["protocol", "report"].includes(attestationArtifact.artifact_role);
  if (assessment.status === "verified_procedure") {
    const actionableConditions = knownString(assessment.conditions) !== undefined;
    if (!actionableConditions && !attestationReady) gaps.push("verified access procedure has neither actionable conditions nor an integrity-bound private attestation");
  } else if (assessment.status === "available_now" && !definedOrJustifiedNotApplicable(assessment.conditions)) {
    gaps.push("available-now access conditions are neither known nor justifiably not applicable");
  }

  const dependencies = dependencyArtifactIds(context, unit, includeReplay);
  if (dependencies.length === 0) gaps.push("replay dependency set is empty");
  if (assessment.artifact_ids.length === 0) gaps.push("access assessment artifact set is empty");
  const missingAccess = missingFrom(dependencies, assessment.artifact_ids);
  if (missingAccess.length > 0) gaps.push(`access assessment omits replay dependencies: ${missingAccess.join(", ")}`);
  const missingEvidence = missingFrom(dependencies, unit.axis_assessments.data_and_artifact_access.evidence_artifact_ids);
  if (missingEvidence.length > 0) gaps.push(`access-axis evidence omits replay dependencies: ${missingEvidence.join(", ")}`);
  const unresolved = assessment.artifact_ids.filter((id) => !artifactReplayReady(context, id));
  if (unresolved.length > 0) gaps.push(`accessed artifacts are unresolved or not integrity-bound: ${sorted(unresolved).join(", ")}`);
  if (assessment.status === "available_now") {
    const unavailableNow = assessment.artifact_ids.filter((id) => {
      const accessState = artifact(context, id)?.access_state;
      return accessState !== "open" && accessState !== "available_with_conditions";
    });
    if (unavailableNow.length > 0) gaps.push(`available-now assessment includes artifacts not currently available: ${sorted(unavailableNow).join(", ")}`);
  }

  const bundleDependencies = unitExtension(unit).bundle_dependency_artifact_ids ?? [];
  if (bundleDependencies.length === 0) gaps.push("required bundle dependency set is empty");
  const missingBundleDependencies = missingFrom(dependencies, bundleDependencies);
  if (missingBundleDependencies.length > 0) gaps.push(`required bundle dependency set omits: ${missingBundleDependencies.join(", ")}`);
  const unknownBundleDependencies = bundleDependencies.filter((id) => !artifactReplayReady(context, id));
  if (unknownBundleDependencies.length > 0) gaps.push(`required bundle dependencies are unresolved: ${sorted(unknownBundleDependencies).join(", ")}`);
  return gaps;
}

function exactDataSliceGaps(value: unknown): string[] {
  const slice = record(value);
  if (slice === null) return ["data slice is not an object"];
  const gaps: string[] = [];
  const locator = record(slice.locator);
  if (locator === null) return ["slice locator is absent"];
  const kind = typeof locator.locator_kind === "string" ? locator.locator_kind : "unknown";
  const allRecords = knownBoolean(locator.all_records) === true;
  const rowSelector = knownString(locator.row_or_record_selector) !== undefined;
  const frameSelector = knownString(locator.frame_or_time_selector) !== undefined;
  const query = knownString(locator.query) !== undefined;
  const filters = (knownStringArray(locator.filter_expressions)?.length ?? 0) > 0;
  const fileSelectors = (knownStringArray(locator.file_selectors)?.length ?? 0) > 0;
  const otherSemantics = knownString(locator.selection_semantics) !== undefined;
  const tableOrObject = knownString(locator.table_or_object) !== undefined;

  if (!["files", "other"].includes(kind) && !tableOrObject) gaps.push(`${kind} locator has no known table/object identity`);
  if (["table_rows", "records"].includes(kind) && !(allRecords || rowSelector || query || filters)) {
    gaps.push(`${kind} locator has no deterministic row/record selector, query, filters, or all-records declaration`);
  } else if (kind === "array_slice" && !(allRecords || rowSelector)) {
    gaps.push("array_slice locator has no deterministic index/slice selector or all-records declaration");
  } else if (["frames", "time_window"].includes(kind) && !(allRecords || frameSelector)) {
    gaps.push(`${kind} locator has no deterministic frame/time selector or all-records declaration`);
  } else if (kind === "query" && !query) {
    gaps.push("query locator has no known query");
  } else if (kind === "files" && !(allRecords || fileSelectors)) {
    gaps.push("files locator has no deterministic file selectors or all-records declaration");
  } else if (kind === "other" && !(allRecords || otherSemantics)) {
    gaps.push("other locator has no known selection semantics or all-records declaration");
  }
  if (allRecords && knownNumber(slice.excluded_unit_count) !== 0) gaps.push("all-records declaration does not have a known zero excluded-unit count");
  if (knownNumber(slice.selected_unit_count) === undefined) gaps.push("selected-unit count is not known");
  if (knownString(slice.slice_hash) === undefined) gaps.push("selected slice hash is not known");
  const inputs = records(slice.input_artifacts);
  if (inputs.length === 0) gaps.push("data slice has no versioned input artifact binding");
  for (const input of inputs) {
    if (typeof input.artifact_id !== "string" || typeof input.artifact_version !== "string" || knownString(input.content_hash) === undefined) {
      gaps.push("data slice has an incomplete input artifact identity/version/hash binding");
    }
  }
  return gaps;
}

function targetRunCaptureGaps(context: SemanticContext, unit: ReproducibilityUnit): string[] {
  const gaps: string[] = [];
  for (const runId of unit.covered_analysis_run_ids) {
    const run = context.report.analysis_runs.find((candidate) => candidate.analysis_run_id === runId);
    if (run === undefined) {
      gaps.push(`covered run ${runId} is unresolved`);
      continue;
    }
    if (run.execution_status !== "completed") gaps.push(`covered run ${runId} is not completed`);
    if (!unit.historical_invocation_ids.includes(run.invocation_id)) gaps.push(`covered run ${runId} invocation is absent from historical invocation bindings`);
    if (run.environment_id !== unit.environment_record.record_id) gaps.push(`covered run ${runId} environment does not match the unit environment record`);
    if (run.random_state_id !== unit.random_state_record.record_id) gaps.push(`covered run ${runId} random state does not match the unit random-state record`);
    const unresolvedOutputs = run.output_artifact_ids.filter((id) => !artifactReplayReady(context, id));
    if (run.output_artifact_ids.length === 0 || unresolvedOutputs.length > 0) gaps.push(`covered run ${runId} outputs are empty or not integrity-bound`);
    for (const sliceId of run.input_data_slice_ids) {
      const slice = context.report.data_slices.find((candidate) => candidate.data_slice_id === sliceId);
      const sliceGaps = exactDataSliceGaps(slice);
      if (sliceGaps.length > 0) gaps.push(`covered run ${runId} input slice ${sliceId} is not exactly reconstructable: ${sliceGaps.join("; ")}`);
    }
  }
  return gaps;
}

function coverageContractGaps(context: SemanticContext, unit: ReproducibilityUnit): string[] {
  const gaps: string[] = [];
  const extension = unitExtension(unit);
  const decision = extension.coverage_denominator_decision;
  if (decision === undefined) {
    gaps.push("independent decision-bound critical-unit/claim/output denominator is absent");
  } else {
    const event = context.report.decision_events.find((candidate) => candidate.decision_event_id === decision.decision_event_id);
    const affectedIds = [
      unit.reproducibility_unit_id,
      ...decision.critical_claim_ids,
      ...decision.critical_output_ids,
      ...decision.exclusions.map((exclusion) => exclusion.target_id),
    ];
    if (event === undefined) gaps.push(`denominator decision ${decision.decision_event_id} is unresolved`);
    else {
      const missingAffected = missingFrom(affectedIds, event.affected_object_ids);
      if (missingAffected.length > 0) gaps.push(`denominator decision ${decision.decision_event_id} does not bind affected targets: ${missingAffected.join(", ")}`);
      if (!["scope_change", "other"].includes(event.decision_kind)) gaps.push(`denominator decision ${decision.decision_event_id} is not classified as a scope/criticality decision`);
      if (decision.critical_unit_membership === "excluded" && !["predefined", "adaptive"].includes(event.timing_class)) gaps.push(`denominator exclusion ${decision.decision_event_id} is not predefined or validly adaptive`);
      if (knownString(event.rationale) === undefined) gaps.push(`denominator decision ${decision.decision_event_id} rationale is not known`);
      if (!sourceBound(event)) gaps.push(`denominator decision ${decision.decision_event_id} has no source binding`);
    }
    if (decision.source_bindings.length === 0) gaps.push("denominator decision has no source binding");
    const unknownClaimTargets = decision.critical_claim_ids.filter((id) => !context.report.claims.some((claim) => claim.claim_id === id));
    if (unknownClaimTargets.length > 0) gaps.push(`denominator decision has unresolved claim targets: ${sorted(unknownClaimTargets).join(", ")}`);
    const unknownOutputTargets = decision.critical_output_ids.filter((id) => !context.knownIds.has(id));
    if (unknownOutputTargets.length > 0) gaps.push(`denominator decision has unresolved output targets: ${sorted(unknownOutputTargets).join(", ")}`);
    if (decision.critical_unit_membership === "included" && unit.criticality !== "critical") gaps.push("unit was relabelled noncritical without an exclusion decision");
    if (decision.critical_unit_membership === "excluded" && unit.criticality === "critical") gaps.push("unit criticality conflicts with its denominator exclusion decision");
    for (const exclusion of decision.exclusions) {
      const resolved = exclusion.target_kind === "claim"
        ? context.report.claims.some((claim) => claim.claim_id === exclusion.target_id)
        : context.knownIds.has(exclusion.target_id);
      if (!resolved) gaps.push(`denominator exclusion target ${exclusion.target_id} is unresolved`);
      if (exclusion.justification.trim().length === 0 || exclusion.source_bindings.length === 0) gaps.push(`denominator exclusion ${exclusion.target_id} lacks a source-bound justification`);
    }
    const duplicateExclusions = decision.exclusions.filter((exclusion, index, all) =>
      all.findIndex((candidate) => candidate.target_kind === exclusion.target_kind && candidate.target_id === exclusion.target_id) !== index,
    );
    if (duplicateExclusions.length > 0) gaps.push("denominator decision contains duplicate exclusions");
  }
  const disposition = extension.coverage_disposition;
  if (disposition === undefined) gaps.push("reproducibility coverage disposition is absent");
  else if (disposition.status === "explicit_gap") {
    if (LEVELS.indexOf(unit.conservative_level) > LEVELS.indexOf("R0_documented")) gaps.push("an explicit reproducibility gap is labelled above R0");
    if (disposition.justification.trim().length === 0 || disposition.source_bindings.length === 0) gaps.push("explicit reproducibility gap lacks a source-bound justification");
  }
  return gaps;
}

function r1Gaps(context: SemanticContext, unit: ReproducibilityUnit): string[] {
  const gaps: string[] = [];
  const axes = unit.axis_assessments;
  if (unit.input_closure.state !== "satisfied") gaps.push(`input closure is ${unit.input_closure.state}`);
  if (unit.artifact_closure.state !== "satisfied") gaps.push(`artifact closure is ${unit.artifact_closure.state}`);
  if (axes.provenance_closure.state !== "satisfied") gaps.push(`provenance closure is ${axes.provenance_closure.state}`);
  if (axes.recipe_fidelity.state !== "satisfied") gaps.push(`recipe fidelity is ${axes.recipe_fidelity.state}`);
  if (unit.historical_invocation_ids.length === 0) gaps.push("no historical invocation was compared with the recipe");
  const environmentId = unit.environment_record.record_id;
  const randomStateId = unit.random_state_record.record_id;
  for (const id of unit.historical_invocation_ids) gaps.push(...completeInvocationGaps(context, id, "historical_actual", environmentId, randomStateId));
  gaps.push(...recipeGaps(context, unit));
  gaps.push(...environmentGaps(context, unit, unit.historical_invocation_ids));
  gaps.push(...randomStateGaps(context, unit, unit.historical_invocation_ids));
  if (axes.data_and_artifact_access.state !== "satisfied") gaps.push(`data/artifact access axis is ${axes.data_and_artifact_access.state}`);
  gaps.push(...accessGaps(context, unit, false));
  if (unit.environment_record.assessment.state !== "satisfied" || axes.environment_capture.state !== "satisfied") gaps.push("environment capture is not satisfied");
  const randomState = boundRandomState(context, unit);
  const randomAxisExpected = randomState?.randomness_used === "no" ? "not_applicable" : "satisfied";
  if (unit.random_state_record.assessment.state !== randomAxisExpected || axes.random_state_capture.state !== randomAxisExpected) {
    gaps.push(`random-state capture does not match the bound record (expected ${randomAxisExpected})`);
  }
  gaps.push(...comparatorGaps(context, unit));
  gaps.push(...targetRunCaptureGaps(context, unit));
  gaps.push(...coverageContractGaps(context, unit));
  return sorted(gaps);
}

function comparatorDecisionMet(context: SemanticContext, unit: ReproducibilityUnit, comparison: UnknownRecord): boolean {
  const specification = unit.comparison_specification as typeof unit.comparison_specification & ComparisonSpecificationExtension;
  const decisionRule = record(specification.decision_rule);
  if (decisionRule === null || comparison.result !== "met") return false;
  const referenceId = typeof comparison.reference_artifact_id === "string" ? comparison.reference_artifact_id : "";
  const replayId = typeof comparison.replay_artifact_id === "string" ? comparison.replay_artifact_id : "";
  const operator = decisionRule.operator;
  if (operator === "exact_hash" || operator === "canonical_hash_equal") {
    const referenceHash = artifactHash(context, referenceId);
    return referenceHash !== undefined && referenceHash === artifactHash(context, replayId);
  }
  const observed = knownNumber(comparison.observed_value);
  if (observed === undefined) return false;
  if (["absolute_difference_lte", "relative_difference_lte", "distance_lte"].includes(String(operator))) {
    const threshold = knownNumber(decisionRule.threshold);
    return threshold !== undefined && threshold >= 0 && observed >= 0 && observed <= threshold;
  }
  if (operator === "p_value_gte") {
    const threshold = knownNumber(decisionRule.threshold);
    return threshold !== undefined && threshold >= 0 && threshold <= 1 && observed >= 0 && observed <= 1 && observed >= threshold;
  }
  if (operator === "within_bounds") {
    const lower = knownNumber(decisionRule.lower_bound);
    const upper = knownNumber(decisionRule.upper_bound);
    return lower !== undefined && upper !== undefined && observed >= lower && observed <= upper;
  }
  return false;
}

function replayEventGaps(context: SemanticContext, unit: ReproducibilityUnit, event: ReproducibilityUnit["replay_events"][number]): string[] {
  const gaps: string[] = [];
  const extension = event as typeof event & ReplayEventExtension;
  const recipeRecord = recipe(unit);
  if (event.exit_or_completion_status !== "completed") gaps.push(`replay ${event.replay_event_id} is not completed`);
  if (event.comparison_result !== "met") gaps.push(`replay ${event.replay_event_id} aggregate comparison result is ${event.comparison_result}`);
  if (event.comparator_id !== unit.comparison_specification.comparator_id) gaps.push(`replay ${event.replay_event_id} comparator identity does not match the specification`);
  if (extension.recipe_id !== unit.recipe_id || event.recipe_version !== recipeRecord?.recipe_version) gaps.push(`replay ${event.replay_event_id} recipe identity/version does not match the recipe record`);
  if (event.environment_id === null || event.environment_id !== unit.environment_record.record_id) gaps.push(`replay ${event.replay_event_id} environment is absent or does not match the unit`);
  if (!verificationInvocation(context, event.actual_invocation_id)) gaps.push(`replay ${event.replay_event_id} invocation is not a completed verification run`);
  gaps.push(...completeInvocationGaps(context, event.actual_invocation_id, "verification_run", event.environment_id, unit.random_state_record.record_id));

  const requiredInputs = recipeRequiredInputArtifactIds(unit);
  if (requiredInputs.length === 0 || !sameSet(requiredInputs, event.input_artifact_ids)) gaps.push(`replay ${event.replay_event_id} input artifacts do not exactly match required recipe inputs`);
  const unresolvedInputs = event.input_artifact_ids.filter((id) => !artifactReplayReady(context, id));
  if (unresolvedInputs.length > 0) gaps.push(`replay ${event.replay_event_id} inputs are not integrity-bound: ${sorted(unresolvedInputs).join(", ")}`);
  if (event.output_artifact_ids.length === 0 || event.output_artifact_ids.some((id) => !artifactReplayReady(context, id))) gaps.push(`replay ${event.replay_event_id} outputs are empty or not integrity-bound`);

  const evidenceIds = extension.comparison_evidence_artifact_ids ?? [];
  if (evidenceIds.length === 0 || evidenceIds.some((id) => !artifactReplayReady(context, id))) gaps.push(`replay ${event.replay_event_id} comparison evidence is empty or not integrity-bound`);
  const missingAxisEvidence = missingFrom(evidenceIds, unit.axis_assessments.replay_verification.evidence_artifact_ids);
  if (missingAxisEvidence.length > 0) gaps.push(`replay-verification axis omits comparison evidence: ${missingAxisEvidence.join(", ")}`);

  const specification = unit.comparison_specification as typeof unit.comparison_specification & ComparisonSpecificationExtension;
  const targetIds = specification.target_artifact_ids ?? [];
  const targetComparisons = records(extension.target_comparisons);
  if (targetComparisons.length !== targetIds.length) gaps.push(`replay ${event.replay_event_id} does not provide exactly one comparison per target`);
  for (const targetId of targetIds) {
    const matches = targetComparisons.filter((comparison) => comparison.target_id === targetId);
    if (matches.length !== 1) {
      gaps.push(`replay ${event.replay_event_id} target ${targetId} does not have exactly one comparison record`);
      continue;
    }
    const comparison = matches[0]!;
    if (comparison.reference_artifact_id !== targetId) gaps.push(`target ${targetId} comparison is not bound to its reference artifact`);
    if (typeof comparison.replay_artifact_id !== "string" || !event.output_artifact_ids.includes(comparison.replay_artifact_id)) gaps.push(`target ${targetId} comparison is not bound to a replay output`);
    if (typeof comparison.comparison_evidence_artifact_id !== "string" || !evidenceIds.includes(comparison.comparison_evidence_artifact_id)) gaps.push(`target ${targetId} comparison is not bound to comparison evidence`);
    if (!comparatorDecisionMet(context, unit, comparison)) gaps.push(`target ${targetId} comparison does not satisfy the machine-checkable decision rule`);
  }
  if (!sourceBound(event)) gaps.push(`replay ${event.replay_event_id} has no source binding`);
  return sorted(gaps);
}

function r2Gaps(context: SemanticContext, unit: ReproducibilityUnit): string[] {
  const gaps: string[] = [];
  if (unit.axis_assessments.replay_verification.state !== "satisfied") gaps.push(`replay verification is ${unit.axis_assessments.replay_verification.state}`);
  gaps.push(...comparatorGaps(context, unit));
  const eventAssessments = unit.replay_events.map((event) => ({ event, gaps: replayEventGaps(context, unit, event) }));
  const passing = eventAssessments.find((assessment) => assessment.gaps.length === 0);
  if (passing === undefined) {
    gaps.push("no completed replay has complete context and hash-bound target-level machine-checked agreement");
    for (const assessment of eventAssessments) gaps.push(...assessment.gaps);
  }
  if (passing !== undefined) {
    gaps.push(...environmentGaps(context, unit, [...unit.historical_invocation_ids, passing.event.actual_invocation_id]));
    gaps.push(...randomStateGaps(context, unit, [...unit.historical_invocation_ids, passing.event.actual_invocation_id]));
  }
  gaps.push(...accessGaps(context, unit, true));
  const recipeVerification = record(recipe(unit)?.verification);
  if (recipeVerification?.status !== "completed_matching") gaps.push("recipe verification status is not completed_matching");
  if (passing !== undefined && !strings(recipeVerification?.verification_run_ids).includes(passing.event.actual_invocation_id)) gaps.push("recipe verification does not bind the passing verification invocation");
  const evidenceIds = unit.replay_events.flatMap((event) => (event as typeof event & ReplayEventExtension).comparison_evidence_artifact_ids ?? []);
  if (missingFrom(evidenceIds, strings(recipeVerification?.comparison_artifact_ids)).length > 0) gaps.push("recipe verification omits replay comparison evidence artifacts");
  return sorted(gaps);
}

function independentEnvironmentGaps(
  context: SemanticContext,
  environmentId: string,
  executionRecordId: string,
): string[] {
  const environment = context.report.environments.find((candidate) => candidate.environment_id === environmentId);
  if (environment === undefined) return [`independent environment ${environmentId} is unresolved`];
  const gaps: string[] = [];
  if (environment.completeness !== "complete") gaps.push(`independent environment ${environmentId} is not complete`);
  if (knownString(environment.environment_hash) === undefined) gaps.push(`independent environment ${environmentId} hash is not known`);
  if (!sourceBound(environment)) gaps.push(`independent environment ${environmentId} has no source binding`);
  const extension = environment as Environment & EnvironmentExtension;
  if (!(extension.captured_invocation_ids ?? []).includes(executionRecordId)) {
    gaps.push(`independent environment ${environmentId} is not bound to execution ${executionRecordId}`);
  }
  if (extension.capture_manifest_artifact_id === null || extension.capture_manifest_artifact_id === undefined || !artifactReplayReady(context, extension.capture_manifest_artifact_id)) {
    gaps.push(`independent environment ${environmentId} capture manifest is absent or not integrity-bound`);
  }
  return gaps;
}

function independentRandomStateGaps(
  context: SemanticContext,
  randomStateId: string | null | undefined,
  applicability: IndependentReproductionEventExtension["random_state_applicability"],
  executionRecordId: string,
): string[] {
  if (applicability !== "applicable" && applicability !== "not_applicable") {
    return ["independent random-state applicability is not explicitly classified"];
  }
  if (randomStateId === null || randomStateId === undefined) return ["independent random-state record is absent or unresolved"];
  const randomState = context.report.random_states.find((candidate) => candidate.random_state_id === randomStateId);
  if (randomState === undefined) return [`independent random-state record ${randomStateId} is unresolved`];
  const gaps: string[] = [];
  const extension = randomState as RandomState & RandomStateExtension;
  if (!sourceBound(randomState)) gaps.push(`independent random state ${randomStateId} has no source binding`);
  if (!(extension.captured_invocation_ids ?? []).includes(executionRecordId)) {
    gaps.push(`independent random state ${randomStateId} is not bound to execution ${executionRecordId}`);
  }
  if (applicability === "applicable") {
    if (randomState.randomness_used !== "yes" || randomState.capture_status !== "complete") {
      gaps.push(`independent random state ${randomStateId} does not provide a complete applicable capture`);
    }
    if (knownString(randomState.generator_or_algorithm) === undefined || randomState.seed_assignments.length === 0) {
      gaps.push(`independent random state ${randomStateId} lacks a known generator or seed assignment`);
    }
    if (extension.state_artifact_id === null || extension.state_artifact_id === undefined || !artifactReplayReady(context, extension.state_artifact_id)) {
      gaps.push(`independent random state ${randomStateId} state artifact is absent or not integrity-bound`);
    }
  } else {
    if (randomState.randomness_used !== "no" || randomState.capture_status !== "not_applicable" || knownBoolean(randomState.deterministic_intent) !== true) {
      gaps.push(`independent random state ${randomStateId} does not substantiate non-applicability`);
    }
    if (!justifiedNotApplicable(randomState.generator_or_algorithm) || !definedOrJustifiedNotApplicable(extension.not_applicability_justification)) {
      gaps.push(`independent random state ${randomStateId} lacks a justified non-applicability record`);
    }
  }
  return gaps;
}

function independentExecutionIdentity(
  event: ReproducibilityUnit["independent_reproduction_events"][number],
  extension: IndependentReproductionEventExtension,
): { id: string | undefined; conflictingIds: string[] } {
  const candidates = event.reproduction_kind === "computational"
    ? [extension.execution_record_id, extension.actual_invocation_id]
    : [extension.execution_record_id, extension.experimental_execution_record_id, extension.actual_attempt_id];
  const ids = sorted(candidates.filter((candidate): candidate is string => candidate !== undefined));
  return { id: ids.length === 1 ? ids[0] : undefined, conflictingIds: ids.length > 1 ? ids : [] };
}

function independentExecutionGaps(
  context: SemanticContext,
  unit: ReproducibilityUnit,
  event: ReproducibilityUnit["independent_reproduction_events"][number],
  extension: IndependentReproductionEventExtension,
): string[] {
  const gaps: string[] = [];
  const executionIdentity = independentExecutionIdentity(event, extension);
  const executionId = executionIdentity.id;
  if (executionIdentity.conflictingIds.length > 0) gaps.push(`independent event declares conflicting execution identities: ${executionIdentity.conflictingIds.join(", ")}`);
  const inputArtifactIds = extension.input_artifact_ids ?? [];
  const inputMaterialIds = extension.input_material_ids ?? [];
  const outputResultIds = extension.output_result_ids ?? [];
  if (executionId === undefined) return [...gaps, "independent execution record identity is absent"];
  if (inputArtifactIds.length + inputMaterialIds.length === 0) gaps.push(`independent execution ${executionId} has no enumerated inputs`);
  const unresolvedInputs = inputArtifactIds.filter((id) => !artifactReplayReady(context, id));
  if (unresolvedInputs.length > 0) gaps.push(`independent execution inputs are unresolved or not integrity-bound: ${sorted(unresolvedInputs).join(", ")}`);
  if (event.output_artifact_ids.length === 0) gaps.push(`independent execution ${executionId} has no independently identified output artifacts`);
  const unresolvedOutputs = event.output_artifact_ids.filter((id) => !artifactReplayReady(context, id));
  if (unresolvedOutputs.length > 0) gaps.push(`independent outputs are unresolved or not integrity-bound: ${sorted(unresolvedOutputs).join(", ")}`);
  const originalTargetIds = (unit.comparison_specification as typeof unit.comparison_specification & ComparisonSpecificationExtension).target_artifact_ids ?? [];
  const reusedTargets = event.output_artifact_ids.filter((id) => originalTargetIds.includes(id));
  if (reusedTargets.length > 0) gaps.push(`independent event reuses reference artifacts as outputs: ${sorted(reusedTargets).join(", ")}`);

  if (event.reproduction_kind === "computational") {
    const invocation = context.report.invocations.find((candidate) => candidate.invocation_id === executionId);
    if (invocation === undefined) return [...gaps, `independent computational invocation ${executionId} is unresolved`];
    const replayInvocationIds = unit.replay_events.map((candidate) => candidate.actual_invocation_id);
    if (unit.historical_invocation_ids.includes(executionId) || replayInvocationIds.includes(executionId)) {
      gaps.push(`independent computational event reuses historical or replay invocation ${executionId}`);
    }
    if (!['verification_run', 'external_record'].includes(invocation.record_role)) gaps.push(`independent invocation ${executionId} has non-independent role ${invocation.record_role}`);
    if (invocation.termination_status !== "completed") gaps.push(`independent invocation ${executionId} is not completed`);
    if (!sourceBound(invocation)) gaps.push(`independent invocation ${executionId} has no source binding`);
    if (knownString(invocation.executable) === undefined || knownString(invocation.command_line) === undefined || knownString(invocation.working_directory) === undefined) {
      gaps.push(`independent invocation ${executionId} lacks a known executable, command line, or working directory`);
    }
    if (!sameSet(invocation.input_artifact_ids, inputArtifactIds)) gaps.push(`independent invocation ${executionId} inputs do not match the event`);
    if (missingFrom(event.output_artifact_ids, invocation.output_artifact_ids).length > 0) gaps.push(`independent invocation ${executionId} does not derive every declared event output`);
    const eventTime = knownString(extension.execution_time);
    const invocationTimes = [knownString(invocation.started_at), knownString(invocation.ended_at)].filter((value): value is string => value !== undefined);
    if (eventTime === undefined || !invocationTimes.includes(eventTime)) gaps.push(`independent event time is not bound to invocation ${executionId}`);
    const invocationExtension = invocation as Invocation & InvocationExtension;
    if (extension.environment_id !== null && extension.environment_id !== undefined && invocationExtension.environment_id !== extension.environment_id) {
      gaps.push(`independent invocation ${executionId} is not bound to environment ${extension.environment_id}`);
    }
    if (extension.random_state_id !== null && extension.random_state_id !== undefined && invocationExtension.random_state_id !== extension.random_state_id) {
      gaps.push(`independent invocation ${executionId} is not bound to random state ${extension.random_state_id}`);
    }
  } else {
    const attempt = context.report.attempts.find((candidate) => candidate.attempt_id === executionId);
    if (attempt === undefined) return [...gaps, `independent experimental attempt ${executionId} is unresolved`];
    if (!['succeeded', 'partially_succeeded'].includes(attempt.attempt_outcome)) gaps.push(`independent experimental attempt ${executionId} did not produce a usable completed outcome`);
    if (!sourceBound(attempt)) gaps.push(`independent experimental attempt ${executionId} has no source binding`);
    if (!sameSet(attempt.input_artifact_ids, inputArtifactIds) || !sameSet(attempt.input_material_ids, inputMaterialIds)) {
      gaps.push(`independent experimental attempt ${executionId} inputs do not match the event`);
    }
    if (missingFrom(event.output_artifact_ids, attempt.output_artifact_ids).length > 0 || missingFrom(outputResultIds, attempt.result_ids).length > 0) {
      gaps.push(`independent experimental attempt ${executionId} does not derive every declared event output`);
    }
    if (!sameSet(attempt.failure_event_ids, extension.failure_event_ids ?? [])) gaps.push(`independent experimental attempt ${executionId} failure ledger does not match the event`);
    if (knownString(extension.execution_time) !== knownString(attempt.ended_at)) gaps.push(`independent event time is not bound to experimental attempt ${executionId}`);
  }
  return gaps;
}

function independentEventGaps(
  context: SemanticContext,
  unit: ReproducibilityUnit,
  event: ReproducibilityUnit["independent_reproduction_events"][number],
): string[] {
  const gaps: string[] = [];
  const extension = event as typeof event & IndependentReproductionEventExtension;
  if (event.independence_assessment !== "independent") gaps.push(`event ${event.reproduction_event_id} independence assessment is ${event.independence_assessment}`);
  if (event.comparison_result !== "met") gaps.push(`event ${event.reproduction_event_id} aggregate comparison result is ${event.comparison_result}`);
  if (event.comparator_id !== unit.comparison_specification.comparator_id) gaps.push(`event ${event.reproduction_event_id} comparator identity does not match the specification`);
  const actorField = extension.independent_actor ?? extension.executor;
  if (knownString(actorField) === undefined || !knownAndEvidenceBound(actorField)) gaps.push(`event ${event.reproduction_event_id} has no evidence-bound independent actor`);
  const priorExecutor = knownString(actorField);
  if (priorExecutor !== undefined && unit.replay_events.some((candidate) => knownString(candidate.executor) === priorExecutor)) {
    gaps.push(`event ${event.reproduction_event_id} reuses the replay executor rather than identifying an independent actor`);
  }
  if (knownString(extension.execution_time) === undefined || !knownAndEvidenceBound(extension.execution_time)) gaps.push(`event ${event.reproduction_event_id} has no evidence-bound execution time`);
  if (!sourceBound(event)) gaps.push(`event ${event.reproduction_event_id} has no source binding`);
  const unresolvedSharedDependencies = event.shared_dependency_ids.filter((id) => !context.knownIds.has(id));
  if (unresolvedSharedDependencies.length > 0) gaps.push(`event ${event.reproduction_event_id} has unresolved shared dependencies: ${sorted(unresolvedSharedDependencies).join(", ")}`);
  const sharedOutputs = event.output_artifact_ids.filter((id) => event.shared_dependency_ids.includes(id));
  if (sharedOutputs.length > 0) gaps.push(`event ${event.reproduction_event_id} labels independently derived outputs as shared dependencies: ${sorted(sharedOutputs).join(", ")}`);
  gaps.push(...independentExecutionGaps(context, unit, event, extension));

  const executionId = independentExecutionIdentity(event, extension).id ?? "<absent>";
  const boundaryField = extension.implementation_boundary ?? extension.implementation_or_protocol_boundary;
  const hasBoundImplementationBoundary = knownString(boundaryField) !== undefined && knownAndEvidenceBound(boundaryField);
  if (extension.environment_id === null || extension.environment_id === undefined) {
    if (!hasBoundImplementationBoundary) gaps.push(`event ${event.reproduction_event_id} has neither an independent environment nor an evidence-bound implementation/protocol boundary`);
  } else {
    gaps.push(...independentEnvironmentGaps(context, extension.environment_id, executionId));
    if (extension.environment_id === unit.environment_record.record_id && !hasBoundImplementationBoundary) {
      gaps.push(`event ${event.reproduction_event_id} reuses the historical environment without an independent implementation/protocol boundary`);
    }
  }

  if (!knownAndEvidenceBound(extension.random_state_justification)) gaps.push(`event ${event.reproduction_event_id} random-state applicability lacks an evidence-bound justification`);
  gaps.push(...independentRandomStateGaps(
    context,
    extension.random_state_id,
    extension.random_state_applicability,
    executionId,
  ));

  if (knownStringArray(extension.deviations) === undefined) gaps.push(`event ${event.reproduction_event_id} deviations are not explicitly enumerated`);
  if (!Array.isArray(extension.failure_event_ids)) gaps.push(`event ${event.reproduction_event_id} failure-event ledger is absent`);
  else {
    const unresolvedFailures = extension.failure_event_ids.filter((id) => !context.report.failures.some((candidate) => candidate.failure_event_id === id));
    if (unresolvedFailures.length > 0) gaps.push(`event ${event.reproduction_event_id} has unresolved failures: ${sorted(unresolvedFailures).join(", ")}`);
  }
  if (knownString(extension.failure_assessment) === undefined || !knownAndEvidenceBound(extension.failure_assessment)) gaps.push(`event ${event.reproduction_event_id} has no evidence-bound failure assessment`);

  const evidenceIds = extension.comparison_evidence_artifact_ids ?? [];
  if (evidenceIds.length === 0 || evidenceIds.some((id) => !artifactReplayReady(context, id))) {
    gaps.push(`event ${event.reproduction_event_id} comparison evidence is empty or not integrity-bound`);
  }
  const targetIds = (unit.comparison_specification as typeof unit.comparison_specification & ComparisonSpecificationExtension).target_artifact_ids ?? [];
  const targetComparisons = records(extension.target_comparisons);
  if (targetIds.length === 0 || targetComparisons.length !== targetIds.length) gaps.push(`event ${event.reproduction_event_id} does not provide exactly one comparison per target`);
  for (const targetId of targetIds) {
    const matches = targetComparisons.filter((comparison) => comparison.target_id === targetId);
    if (matches.length !== 1) {
      gaps.push(`independent target ${targetId} does not have exactly one comparison record`);
      continue;
    }
    const comparison = matches[0]!;
    if (comparison.reference_artifact_id !== targetId) gaps.push(`independent target ${targetId} comparison is not bound to its reference artifact`);
    if (typeof comparison.replay_artifact_id !== "string" || !event.output_artifact_ids.includes(comparison.replay_artifact_id)) gaps.push(`independent target ${targetId} comparison is not bound to an independently derived output`);
    if (typeof comparison.comparison_evidence_artifact_id !== "string" || !evidenceIds.includes(comparison.comparison_evidence_artifact_id)) gaps.push(`independent target ${targetId} comparison is not bound to comparison evidence`);
    if (!comparatorDecisionMet(context, unit, comparison)) gaps.push(`independent target ${targetId} comparison does not satisfy the machine-checkable decision rule`);
  }

  const axis = event.reproduction_kind === "computational"
    ? unit.axis_assessments.independent_computational_reproduction
    : unit.axis_assessments.independent_experimental_replication;
  if (axis.state !== "satisfied") gaps.push(`${event.reproduction_kind} independence axis is ${axis.state}`);
  const omittedAxisEvidence = missingFrom(evidenceIds, axis.evidence_artifact_ids);
  if (omittedAxisEvidence.length > 0) gaps.push(`${event.reproduction_kind} independence axis omits comparison evidence: ${omittedAxisEvidence.join(", ")}`);
  if (!sourceBound(axis)) gaps.push(`${event.reproduction_kind} independence axis has no source binding`);
  return sorted(gaps);
}

export function assessSupportedReproducibilityLevel(
  context: SemanticContext,
  unit: ReproducibilityUnit,
): SupportedLevelAssessment {
  const targets = [
    ...unit.covered_work_unit_ids,
    ...unit.covered_analysis_run_ids,
    ...unit.covered_claim_ids,
    ...unit.covered_output_ids,
  ];
  const r0: string[] = [];
  if (targets.length === 0) r0.push("unit has no declared covered target");
  if (unit.source_bindings.length === 0 && unit.input_closure.evidence_artifact_ids.length === 0 && unit.artifact_closure.evidence_artifact_ids.length === 0) {
    r0.push("unit documentation has no source or evidence-artifact binding");
  }
  if (unit.input_closure.state === "unknown" && unit.artifact_closure.state === "unknown") r0.push("both input and artifact closure are unknown");
  if (r0.length > 0) return { declaredLevel: unit.conservative_level, highestSupportedLevel: "not_assessed", failedPrerequisites: sorted(r0) };

  const r1 = r1Gaps(context, unit);
  if (r1.length > 0) return { declaredLevel: unit.conservative_level, highestSupportedLevel: "R0_documented", failedPrerequisites: r1 };

  const r2 = r2Gaps(context, unit);
  if (r2.length > 0) return { declaredLevel: unit.conservative_level, highestSupportedLevel: "R1_replay_ready", failedPrerequisites: r2 };

  const r3: string[] = [];
  const independentAssessments = unit.independent_reproduction_events.map((event) => ({
    event,
    gaps: independentEventGaps(context, unit, event),
  }));
  const passingIndependent = independentAssessments.find((assessment) => assessment.gaps.length === 0);
  if (passingIndependent === undefined) {
    r3.push("no explicit independent computational or experimental event has complete execution context and target-level comparison evidence");
    for (const assessment of independentAssessments) r3.push(...assessment.gaps);
  }
  const computationalSatisfied = unit.axis_assessments.independent_computational_reproduction.state === "satisfied";
  const experimentalSatisfied = unit.axis_assessments.independent_experimental_replication.state === "satisfied";
  if (!computationalSatisfied && !experimentalSatisfied) r3.push("neither independent computational reproduction nor independent experimental replication axis is satisfied");
  if (unit.axis_assessments.claim_and_output_coverage.state !== "satisfied") r3.push(`claim/output coverage is ${unit.axis_assessments.claim_and_output_coverage.state}`);
  const denominator = unitExtension(unit).coverage_denominator_decision;
  if ((denominator?.critical_claim_ids.length ?? 0) === 0 && (denominator?.critical_output_ids.length ?? 0) === 0) r3.push("independent claim/output coverage denominator is empty");
  if (r3.length > 0) return { declaredLevel: unit.conservative_level, highestSupportedLevel: "R2_verified_replay", failedPrerequisites: sorted(r3) };

  return { declaredLevel: unit.conservative_level, highestSupportedLevel: "R3_independent_reproduction", failedPrerequisites: [] };
}

interface ComputationalTargets {
  workUnitIds: string[];
  runIds: string[];
  claimIds: string[];
  outputIds: string[];
}

function computationalTargets(context: SemanticContext): ComputationalTargets {
  const runIds = new Set(context.report.analysis_runs.map((run) => run.analysis_run_id));
  const computationalDerivationIds = new Set(context.report.derivations
    .filter((derivation) => derivation.analysis_run_id !== null && runIds.has(derivation.analysis_run_id))
    .map((derivation) => derivation.derivation_id));
  const resultIds = new Set(context.report.results
    .filter((result) =>
      result.analysis_run_ids.some((id) => runIds.has(id)) ||
      result.derivation_ids.some((id) => computationalDerivationIds.has(id)))
    .map((result) => result.result_id));
  const workUnitIds = new Set(context.report.results
    .filter((result) => resultIds.has(result.result_id))
    .map((result) => result.work_unit_id));
  const outputIds = new Set<string>();
  for (const workUnit of context.report.work_units) {
    if (workUnitIds.has(workUnit.work_unit_id)) {
      for (const id of workUnit.output_object_ids) outputIds.add(id);
    }
  }
  for (const attempt of context.report.attempts) {
    if (workUnitIds.has(attempt.work_unit_id)) {
      for (const id of attempt.output_artifact_ids) outputIds.add(id);
    }
  }
  for (const run of context.report.analysis_runs) for (const id of run.output_artifact_ids) outputIds.add(id);
  for (const derivation of context.report.derivations) {
    if (computationalDerivationIds.has(derivation.derivation_id)) {
      for (const id of [...derivation.output_artifact_ids, ...derivation.output_data_slice_ids]) outputIds.add(id);
    }
  }
  for (const result of context.report.results) {
    if (resultIds.has(result.result_id)) for (const id of result.output_artifact_ids) outputIds.add(id);
  }
  const computationalEvidenceIds = new Set(context.report.evidence_items
    .filter((evidence) =>
      evidence.analysis_run_ids.some((id) => runIds.has(id)) ||
      evidence.result_ids.some((id) => resultIds.has(id)) ||
      evidence.derivation_ids.some((id) => computationalDerivationIds.has(id)))
    .map((evidence) => evidence.evidence_item_id));
  const claimIds = new Set(context.report.evidence_edges
    .filter((edge) => computationalEvidenceIds.has(edge.evidence_item_id))
    .map((edge) => edge.claim_id));
  return {
    workUnitIds: sorted(workUnitIds),
    runIds: sorted(runIds),
    claimIds: sorted(claimIds),
    outputIds: sorted(outputIds),
  };
}

function evaluateComputationalCoverage(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const targets = computationalTargets(context);
  if (targets.runIds.length === 0 && targets.workUnitIds.length === 0 && targets.claimIds.length === 0 && targets.outputIds.length === 0) return [];
  const coveredWork = new Set(context.report.reproducibility_units.flatMap((unit) => unit.covered_work_unit_ids));
  const coveredRuns = new Set(context.report.reproducibility_units.flatMap((unit) => unit.covered_analysis_run_ids));
  const coveredClaims = new Set(context.report.reproducibility_units.flatMap((unit) => unit.covered_claim_ids));
  const coveredOutputs = new Set(context.report.reproducibility_units.flatMap((unit) => unit.covered_output_ids));
  const denominatorClaims = new Set(context.report.reproducibility_units.flatMap((unit) => unitExtension(unit).coverage_denominator_decision?.critical_claim_ids ?? []));
  const denominatorOutputs = new Set(context.report.reproducibility_units.flatMap((unit) => unitExtension(unit).coverage_denominator_decision?.critical_output_ids ?? []));
  const excludedClaims = new Set(context.report.reproducibility_units.flatMap((unit) =>
    unitExtension(unit).coverage_denominator_decision?.exclusions.filter((item) => item.target_kind === "claim").map((item) => item.target_id) ?? [],
  ));
  const excludedOutputs = new Set(context.report.reproducibility_units.flatMap((unit) =>
    unitExtension(unit).coverage_denominator_decision?.exclusions.filter((item) => item.target_kind === "output").map((item) => item.target_id) ?? [],
  ));

  const uncoveredWorkUnitIds = targets.workUnitIds.filter((id) => !coveredWork.has(id));
  const uncoveredRunIds = targets.runIds.filter((id) => !coveredRuns.has(id));
  const unclassifiedClaimIds = targets.claimIds.filter((id) => !denominatorClaims.has(id) && !excludedClaims.has(id));
  const unclassifiedOutputIds = targets.outputIds.filter((id) => !denominatorOutputs.has(id) && !excludedOutputs.has(id));
  const uncoveredClaimIds = targets.claimIds.filter((id) => denominatorClaims.has(id) && !coveredClaims.has(id));
  const uncoveredOutputIds = targets.outputIds.filter((id) => denominatorOutputs.has(id) && !coveredOutputs.has(id));
  if ([uncoveredWorkUnitIds, uncoveredRunIds, unclassifiedClaimIds, unclassifiedOutputIds, uncoveredClaimIds, uncoveredOutputIds].every((ids) => ids.length === 0)) return [];
  return [finding({
    rule,
    effectiveSeverity: severity,
    pointer: pointer("reproducibility_units"),
    affectedObjectIds: sorted([
      ...uncoveredWorkUnitIds,
      ...uncoveredRunIds,
      ...unclassifiedClaimIds,
      ...unclassifiedOutputIds,
      ...uncoveredClaimIds,
      ...uncoveredOutputIds,
    ]),
    message: "Key computational work lacks a reproducibility unit or explicit source-bound gap, or the independent report-facing claim/output denominator is incomplete.",
    details: {
      uncovered_work_unit_ids: uncoveredWorkUnitIds,
      uncovered_analysis_run_ids: uncoveredRunIds,
      unclassified_claim_ids: unclassifiedClaimIds,
      unclassified_output_ids: unclassifiedOutputIds,
      uncovered_claim_ids: uncoveredClaimIds,
      uncovered_output_ids: uncoveredOutputIds,
    },
  })];
}

export function evaluateREP001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  findings.push(...evaluateComputationalCoverage(context, rule, severity));
  context.report.data_slices.forEach((slice, index) => {
    const gaps = exactDataSliceGaps(slice);
    if (gaps.length === 0) return;
    findings.push(finding({
      rule,
      effectiveSeverity: severity,
      pointer: pointer("data_slices", index, "locator"),
      affectedObjectIds: [slice.data_slice_id],
      sourceBindings: slice.source_bindings,
      message: `DataSlice selection is not exactly reconstructable and can support at most partial derivation closure: ${gaps.join("; ")}.`,
      details: { locator_kind: slice.locator.locator_kind, failed_prerequisites: gaps },
    }));
  });
  context.report.reproducibility_units.forEach((unit, index) => {
    const coverageGaps = coverageContractGaps(context, unit);
    if (coverageGaps.length > 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("reproducibility_units", index, "coverage_denominator_decision"),
        affectedObjectIds: [unit.reproducibility_unit_id, ...unit.covered_claim_ids, ...unit.covered_output_ids],
        sourceBindings: unit.source_bindings,
        message: `Reproducibility denominator/coverage contract is incomplete: ${coverageGaps.join("; ")}.`,
        details: { failed_prerequisites: coverageGaps },
      }));
    }
    const assessment = assessSupportedReproducibilityLevel(context, unit);
    if (LEVELS.indexOf(unit.conservative_level) > LEVELS.indexOf(assessment.highestSupportedLevel)) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("reproducibility_units", index, "conservative_level"),
        affectedObjectIds: [unit.reproducibility_unit_id, ...unit.covered_analysis_run_ids, ...unit.covered_claim_ids, ...unit.covered_output_ids],
        sourceBindings: unit.source_bindings,
        message: `Declared ${unit.conservative_level} exceeds supported ${assessment.highestSupportedLevel}: ${assessment.failedPrerequisites.join("; ")}.`,
        details: { declared_level: unit.conservative_level, highest_supported_level: assessment.highestSupportedLevel, failed_prerequisites: assessment.failedPrerequisites },
      }));
    }
  });
  return findings;
}

export function evaluateREP002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.reproducibility_units.forEach((unit, index) => {
    if (unit.axis_assessments.recipe_fidelity.state !== "satisfied") return;
    const gaps = [
      ...recipeGaps(context, unit),
      ...unit.historical_invocation_ids.flatMap((id) => completeInvocationGaps(context, id, "historical_actual", unit.environment_record.record_id, unit.random_state_record.record_id)),
    ];
    if (unit.historical_invocation_ids.length === 0) gaps.push("historical invocation set is empty");
    if (gaps.length > 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("reproducibility_units", index, "axis_assessments", "recipe_fidelity"),
        affectedObjectIds: [unit.reproducibility_unit_id, ...unit.historical_invocation_ids],
        sourceBindings: unit.source_bindings,
        message: `Recipe fidelity is satisfied without a resolvable versioned recipe and complete historical invocation comparison: ${sorted(gaps).join("; ")}.`,
        details: { failed_prerequisites: sorted(gaps) },
      }));
    }
  });
  return findings;
}

export function evaluateREP003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.reproducibility_units.forEach((unit, index) => {
    if (LEVELS.indexOf(unit.conservative_level) < LEVELS.indexOf("R2_verified_replay")) return;
    const gaps = r2Gaps(context, unit);
    if (gaps.length > 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("reproducibility_units", index, "replay_events"),
        affectedObjectIds: [unit.reproducibility_unit_id, ...unit.replay_events.map((event) => event.replay_event_id)],
        sourceBindings: unit.source_bindings,
        message: `R2 replay evidence is incomplete or not machine-verifiable: ${gaps.join("; ")}.`,
        details: { failed_prerequisites: gaps },
      }));
    }
  });
  return findings;
}

export function evaluateREP004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.reproducibility_units.forEach((unit, index) => {
    if (unit.conservative_level !== "R3_independent_reproduction") return;
    const assessments = unit.independent_reproduction_events.map((event) => ({
      event,
      gaps: independentEventGaps(context, unit, event),
    }));
    const valid = assessments.some((assessment) => assessment.gaps.length === 0);
    if (!valid) {
      const gaps = sorted([
        "no independent event has complete traceable evidence",
        ...assessments.flatMap((assessment) => assessment.gaps),
      ]);
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("reproducibility_units", index, "independent_reproduction_events"),
        affectedObjectIds: [unit.reproducibility_unit_id, ...unit.independent_reproduction_events.map((event) => event.reproduction_event_id)],
        sourceBindings: unit.source_bindings,
        message: `R3 independent reproduction evidence is incomplete or not independently traceable: ${gaps.join("; ")}.`,
        details: { failed_prerequisites: gaps },
      }));
    }
  });
  return findings;
}

export function evaluateREP005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  context.report.reproducibility_units.forEach((unit, index) => {
    const computationalEvents = unit.independent_reproduction_events.filter((event) =>
      event.reproduction_kind === "computational" && independentEventGaps(context, unit, event).length === 0);
    const experimentalEvents = unit.independent_reproduction_events.filter((event) =>
      event.reproduction_kind === "experimental" && independentEventGaps(context, unit, event).length === 0);
    const computationalAxis = unit.axis_assessments.independent_computational_reproduction.state;
    const experimentalAxis = unit.axis_assessments.independent_experimental_replication.state;
    if ((computationalAxis === "satisfied" && computationalEvents.length === 0) || (experimentalAxis === "satisfied" && experimentalEvents.length === 0)) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("reproducibility_units", index, "axis_assessments"),
        affectedObjectIds: [unit.reproducibility_unit_id],
        sourceBindings: unit.source_bindings,
        message: "Computational reproduction and experimental replication axes are not backed by complete, evidence-bound events of the matching kind.",
      }));
    }
  });
  return findings;
}
