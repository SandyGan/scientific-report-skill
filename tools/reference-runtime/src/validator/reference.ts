import type { JsonValue } from "../lib/json.js";
import type { HashField, ScientificReport } from "../lib/types.js";
import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import { finding, locatedDerivationBindings, locatedSourceBindings, makeInternalRule, objectVersion, pointer } from "./context.js";
import type { SemanticContext, ValidationFinding } from "./types.js";

export const REFERENCE_RULE = makeInternalRule(
  "REF001",
  "Dangling, duplicate, or version-mismatched object reference",
  "blocker",
  "/",
  "A report identifier or cross-object reference is unresolved, ambiguous, or version-inconsistent.",
  "Make object identifiers globally unique and bind every reference to an existing object and exact version.",
  "references",
);

export const MISSINGNESS_RULE = makeInternalRule(
  "MIS001",
  "Scientific missingness envelope is semantically inconsistent",
  "blocker",
  "/",
  "A known, unknown, not-applicable, or withheld field violates its explicit missingness or provenance semantics.",
  "Keep known values source- or derivation-bound; retain null values and reasons for unknown, not_applicable, and withheld states; remove sentinel strings.",
  "missingness",
);

interface ReferenceExpectation {
  id: string | null | undefined;
  pointer: string;
  ownerIds: string[];
  expectedCollections?: string[] | undefined;
  version?: string | undefined;
  allowExternal?: boolean | undefined;
}

interface NestedDomainRecord {
  collection: "control_records" | "qc_events" | "analysis_contexts";
  record: Record<string, unknown>;
}

function nestedDomainRecords(report: ScientificReport): Map<string, NestedDomainRecord> {
  const result = new Map<string, NestedDomainRecord>();
  const payloads = (report.extensions as Record<string, unknown>).domain_payloads;
  if (!Array.isArray(payloads)) return result;
  const definitions = [
    ["control_records", "control_id"],
    ["qc_events", "qc_event_id"],
    ["analysis_contexts", "analysis_context_id"],
  ] as const;
  for (const payload of payloads) {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) continue;
    const domainPayload = payload as Record<string, unknown>;
    if (domainPayload.domain !== "wet_lab") continue;
    for (const [collection, idField] of definitions) {
      const records = domainPayload[collection];
      if (!Array.isArray(records)) continue;
      for (const candidate of records) {
        if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) continue;
        const record = candidate as Record<string, unknown>;
        const id = record[idField];
        if (typeof id === "string") result.set(id, { collection, record });
      }
    }
  }
  return result;
}

function asHash(field: HashField): string | undefined {
  return field.state === "known" ? field.value : undefined;
}

function referenceFindings(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const expect = (input: ReferenceExpectation): void => {
    if (input.id === null || input.id === undefined || input.allowExternal === true) return;
    const record = context.objectById.get(input.id);
    if (record === undefined) {
      if (context.knownIds.has(input.id)) return;
      findings.push(
        finding({
          rule,
          effectiveSeverity: severity,
          category: "references_and_graph",
          pointer: input.pointer,
          affectedObjectIds: input.ownerIds,
          message: `Reference ${input.id} does not resolve to a declared report object.`,
          details: { referenced_id: input.id },
        }),
      );
      return;
    }
    const collection = context.objectCollectionById.get(input.id);
    if (input.expectedCollections !== undefined && (collection === undefined || !input.expectedCollections.includes(collection))) {
      findings.push(
        finding({
          rule,
          effectiveSeverity: severity,
          category: "references_and_graph",
          pointer: input.pointer,
          affectedObjectIds: [...input.ownerIds, input.id],
          message: `Reference ${input.id} resolves to ${collection ?? "an unknown collection"}, not ${input.expectedCollections.join(" or ")}.`,
        }),
      );
    }
    if (input.version !== undefined) {
      const actualVersion = objectVersion(record);
      if (actualVersion !== input.version) {
        findings.push(
          finding({
            rule,
            effectiveSeverity: severity,
            category: "references_and_graph",
            pointer: input.pointer,
            affectedObjectIds: [...input.ownerIds, input.id],
            message: `Reference ${input.id}@${input.version} does not match declared version ${actualVersion ?? "unknown"}.`,
          }),
        );
      }
    }
  };
  const many = (
    ids: readonly string[],
    path: string,
    ownerIds: string[],
    expectedCollections?: string[],
  ): void => ids.forEach((id, index) => expect({ id, pointer: `${path}/${index}`, ownerIds, expectedCollections }));
  const domainRecords = nestedDomainRecords(context.report);
  const manyNestedDomain = (
    ids: readonly string[],
    path: string,
    ownerIds: string[],
    expectedCollection: NestedDomainRecord["collection"],
  ): void => {
    ids.forEach((id, index) => {
      const resolved = domainRecords.get(id);
      if (resolved === undefined || resolved.collection !== expectedCollection) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          category: "references_and_graph",
          pointer: `${path}/${index}`,
          affectedObjectIds: [...ownerIds, id],
          message: resolved === undefined
            ? `Reference ${id} does not resolve to a typed ${expectedCollection} record.`
            : `Reference ${id} resolves to ${resolved.collection}, not ${expectedCollection}.`,
          details: { referenced_id: id },
        }));
      }
    });
  };
  const expectNotApplicableDecisionBindings = (value: unknown, path = "", seen = new Set<object>()): void => {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((child, index) => expectNotApplicableDecisionBindings(child, `${path}/${index}`, seen));
      return;
    }
    const object = value as Record<string, unknown>;
    if (object.state === "not_applicable") {
      expect({
        id: typeof object.applicability_decision_id === "string" ? object.applicability_decision_id : undefined,
        pointer: `${path}/applicability_decision_id`,
        ownerIds: [],
        expectedCollections: ["applicability_decisions"],
      });
    }
    for (const [key, child] of Object.entries(object)) {
      expectNotApplicableDecisionBindings(child, `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`, seen);
    }
  };

  for (const [id, collections] of context.duplicateIds) {
    findings.push(
      finding({
        rule,
        effectiveSeverity: severity,
        category: "references_and_graph",
        pointer: "/",
        affectedObjectIds: [id],
        message: `Identifier ${id} is declared more than once (${collections.join(", ")}).`,
      }),
    );
  }

  const report = context.report;
  expectNotApplicableDecisionBindings(report);
  report.source_coverage.snapshots.forEach((snapshot, index) => {
    for (const [bindingIndex, binding] of snapshot.source_bindings.entries()) {
      expect({ id: binding.source_item_id, pointer: pointer("source_coverage", "snapshots", index, "source_bindings", bindingIndex, "source_item_id"), ownerIds: [snapshot.source_snapshot_id], expectedCollections: ["source_items"] });
    }
  });
  many(report.source_coverage.snapshot_bindings, "/source_coverage/snapshot_bindings", [report.source_coverage.universe_id], ["source_snapshots"]);
  many(report.source_coverage.item_ids, "/source_coverage/item_ids", [report.source_coverage.universe_id], ["source_items"]);
  report.source_coverage.items.forEach((item, index) => {
    expect({ id: item.snapshot_id, pointer: pointer("source_coverage", "items", index, "snapshot_id"), ownerIds: [item.source_item_id], expectedCollections: ["source_snapshots"] });
    expect({ id: item.canonical_source_item_id, pointer: pointer("source_coverage", "items", index, "canonical_source_item_id"), ownerIds: [item.source_item_id], expectedCollections: ["source_items"] });
    many(item.mapped_object_ids, pointer("source_coverage", "items", index, "mapped_object_ids"), [item.source_item_id]);
  });
  report.module_manifest.forEach((module, index) => {
    expect({ id: module.applicability_decision_id, pointer: pointer("module_manifest", index, "applicability_decision_id"), ownerIds: [module.module_id], expectedCollections: ["applicability_decisions"] });
    many(module.section_ids, pointer("module_manifest", index, "section_ids"), [module.module_id], ["sections"]);
  });
  report.section_coverage.forEach((section, index) => {
    expect({ id: section.applicability_decision_id, pointer: pointer("section_coverage", index, "applicability_decision_id"), ownerIds: [section.section_id], expectedCollections: ["applicability_decisions"] });
    many(section.source_universe_ids, pointer("section_coverage", index, "source_universe_ids"), [section.section_id], ["source_universes"]);
    many(section.represented_object_ids, pointer("section_coverage", index, "represented_object_ids"), [section.section_id]);
    section.evidence_bindings.forEach((binding, bindingIndex) => {
      expect({ id: binding.source_item_id, pointer: pointer("section_coverage", index, "evidence_bindings", bindingIndex, "source_item_id"), ownerIds: [section.section_id], expectedCollections: ["source_items"] });
    });
  });

  report.research_questions.forEach((question, index) => {
    many(question.claim_ids, pointer("research_questions", index, "claim_ids"), [question.research_question_id], ["claims"]);
    many(question.limitation_ids, pointer("research_questions", index, "limitation_ids"), [question.research_question_id], ["limitations"]);
  });
  report.campaigns.forEach((campaign, index) => many(campaign.work_unit_ids, pointer("campaigns", index, "work_unit_ids"), [campaign.campaign_id], ["work_units"]));
  report.work_units.forEach((unit, index) => {
    expect({ id: unit.campaign_id, pointer: pointer("work_units", index, "campaign_id"), ownerIds: [unit.work_unit_id], expectedCollections: ["campaigns"] });
    many(unit.attempt_ids, pointer("work_units", index, "attempt_ids"), [unit.work_unit_id], ["attempts"]);
    many(unit.method_ids, pointer("work_units", index, "method_ids"), [unit.work_unit_id], ["methods"]);
    many(unit.decision_event_ids, pointer("work_units", index, "decision_event_ids"), [unit.work_unit_id], ["decision_events"]);
    many(unit.input_entity_ids, pointer("work_units", index, "input_entity_ids"), [unit.work_unit_id], ["entities"]);
    many(unit.output_object_ids, pointer("work_units", index, "output_object_ids"), [unit.work_unit_id]);
  });
  report.attempts.forEach((attempt, index) => {
    const base = pointer("attempts", index);
    expect({ id: attempt.work_unit_id, pointer: `${base}/work_unit_id`, ownerIds: [attempt.attempt_id], expectedCollections: ["work_units"] });
    many(attempt.method_ids, `${base}/method_ids`, [attempt.attempt_id], ["methods"]);
    many(attempt.input_material_ids, `${base}/input_material_ids`, [attempt.attempt_id], ["materials"]);
    many(attempt.input_artifact_ids, `${base}/input_artifact_ids`, [attempt.attempt_id], ["artifacts"]);
    many(attempt.segment_ids, `${base}/segment_ids`, [attempt.attempt_id], ["segments"]);
    many(attempt.result_ids, `${base}/result_ids`, [attempt.attempt_id], ["results"]);
    many(attempt.failure_event_ids, `${base}/failure_event_ids`, [attempt.attempt_id], ["failures"]);
    many(attempt.output_artifact_ids, `${base}/output_artifact_ids`, [attempt.attempt_id], ["artifacts"]);
    expect({ id: attempt.superseded_by_attempt_id, pointer: `${base}/superseded_by_attempt_id`, ownerIds: [attempt.attempt_id], expectedCollections: ["attempts"] });
    (attempt.attempt_relations ?? []).forEach((relation, relationIndex) => {
      expect({ id: relation.prior_attempt_id, pointer: `${base}/attempt_relations/${relationIndex}/prior_attempt_id`, ownerIds: [attempt.attempt_id, relation.relation_id], expectedCollections: ["attempts"] });
    });
  });
  report.segments.forEach((segment, index) => {
    const base = pointer("segments", index);
    expect({ id: segment.attempt_id, pointer: `${base}/attempt_id`, ownerIds: [segment.segment_id], expectedCollections: ["attempts"] });
    expect({ id: segment.predecessor_segment_id, pointer: `${base}/predecessor_segment_id`, ownerIds: [segment.segment_id], expectedCollections: ["segments"] });
    expect({ id: segment.checkpoint_input_artifact_id, pointer: `${base}/checkpoint_input_artifact_id`, ownerIds: [segment.segment_id], expectedCollections: ["artifacts"] });
    expect({ id: segment.checkpoint_output_artifact_id, pointer: `${base}/checkpoint_output_artifact_id`, ownerIds: [segment.segment_id], expectedCollections: ["artifacts"] });
    many(segment.result_ids, `${base}/result_ids`, [segment.segment_id], ["results"]);
    many(segment.failure_event_ids, `${base}/failure_event_ids`, [segment.segment_id], ["failures"]);
    many(segment.output_artifact_ids, `${base}/output_artifact_ids`, [segment.segment_id], ["artifacts"]);
  });
  report.methods.forEach((method, index) => many(method.protocol_artifact_ids, pointer("methods", index, "protocol_artifact_ids"), [method.method_id], ["artifacts"]));
  report.decision_events.forEach((decision, index) => {
    many(decision.triggering_object_ids, pointer("decision_events", index, "triggering_object_ids"), [decision.decision_event_id]);
    many(decision.affected_object_ids, pointer("decision_events", index, "affected_object_ids"), [decision.decision_event_id]);
  });
  report.materials.forEach((material, index) => expect({ id: material.entity_id, pointer: pointer("materials", index, "entity_id"), ownerIds: [material.material_id], expectedCollections: ["entities"] }));
  report.material_relationships.forEach((relationship, index) => {
    const base = pointer("material_relationships", index);
    many(relationship.input_material_ids, `${base}/input_material_ids`, [relationship.relationship_id], ["materials"]);
    many(relationship.output_material_ids, `${base}/output_material_ids`, [relationship.relationship_id], ["materials"]);
    expect({ id: relationship.work_unit_id, pointer: `${base}/work_unit_id`, ownerIds: [relationship.relationship_id], expectedCollections: ["work_units"] });
    expect({ id: relationship.attempt_id, pointer: `${base}/attempt_id`, ownerIds: [relationship.relationship_id], expectedCollections: ["attempts"] });
    expect({ id: relationship.segment_id, pointer: `${base}/segment_id`, ownerIds: [relationship.relationship_id], expectedCollections: ["segments"] });
    expect({ id: relationship.method_id, pointer: `${base}/method_id`, ownerIds: [relationship.relationship_id], expectedCollections: ["methods"] });
    many(relationship.decision_event_ids, `${base}/decision_event_ids`, [relationship.relationship_id], ["decision_events"]);
  });
  report.analysis_populations.forEach((population, index) => {
    const base = pointer("analysis_populations", index);
    many(population.decision_event_ids, `${base}/decision_event_ids`, [population.analysis_population_id], ["decision_events"]);
    population.members.forEach((member, memberIndex) => {
      expect({ id: member.material_id, pointer: `${base}/members/${memberIndex}/material_id`, ownerIds: [population.analysis_population_id], expectedCollections: ["materials"] });
      expect({ id: member.entity_id, pointer: `${base}/members/${memberIndex}/entity_id`, ownerIds: [population.analysis_population_id], expectedCollections: ["entities"] });
      many(member.decision_event_ids, `${base}/members/${memberIndex}/decision_event_ids`, [population.analysis_population_id], ["decision_events"]);
    });
  });
  report.data_slices.forEach((slice, index) => {
    const base = pointer("data_slices", index);
    slice.input_artifacts.forEach((binding, bindingIndex) => {
      expect({ id: binding.artifact_id, version: binding.artifact_version, pointer: `${base}/input_artifacts/${bindingIndex}`, ownerIds: [slice.data_slice_id], expectedCollections: ["artifacts"] });
      const artifact = report.artifacts.find((candidate) => candidate.artifact_id === binding.artifact_id);
      if (artifact !== undefined && asHash(binding.content_hash) !== undefined && asHash(artifact.content_hash) !== undefined && asHash(binding.content_hash) !== asHash(artifact.content_hash)) {
        findings.push(finding({ rule, effectiveSeverity: severity, category: "references_and_graph", pointer: `${base}/input_artifacts/${bindingIndex}/content_hash`, affectedObjectIds: [slice.data_slice_id, binding.artifact_id], message: `Artifact binding hash does not match ${binding.artifact_id}@${binding.artifact_version}.` }));
      }
    });
    expect({ id: slice.analysis_population_id, pointer: `${base}/analysis_population_id`, ownerIds: [slice.data_slice_id], expectedCollections: ["analysis_populations"] });
    many(slice.selection_decision_event_ids, `${base}/selection_decision_event_ids`, [slice.data_slice_id], ["decision_events"]);
    expect({ id: slice.created_by_derivation_id, pointer: `${base}/created_by_derivation_id`, ownerIds: [slice.data_slice_id], expectedCollections: ["derivations"] });
  });
  report.derivations.forEach((derivation, index) => {
    const base = pointer("derivations", index);
    many(derivation.input_data_slice_ids, `${base}/input_data_slice_ids`, [derivation.derivation_id], ["data_slices"]);
    many(derivation.input_derivation_ids, `${base}/input_derivation_ids`, [derivation.derivation_id], ["derivations"]);
    many(derivation.input_artifact_ids, `${base}/input_artifact_ids`, [derivation.derivation_id], ["artifacts"]);
    many(derivation.code_artifact_ids, `${base}/code_artifact_ids`, [derivation.derivation_id], ["artifacts"]);
    expect({ id: derivation.analysis_run_id, pointer: `${base}/analysis_run_id`, ownerIds: [derivation.derivation_id], expectedCollections: ["analysis_runs"] });
    many(derivation.output_data_slice_ids, `${base}/output_data_slice_ids`, [derivation.derivation_id], ["data_slices"]);
    many(derivation.output_artifact_ids, `${base}/output_artifact_ids`, [derivation.derivation_id], ["artifacts"]);
  });
  report.invocations.forEach((invocation, index) => {
    many(invocation.input_artifact_ids, pointer("invocations", index, "input_artifact_ids"), [invocation.invocation_id], ["artifacts"]);
    many(invocation.output_artifact_ids, pointer("invocations", index, "output_artifact_ids"), [invocation.invocation_id], ["artifacts"]);
    many(invocation.log_artifact_ids, pointer("invocations", index, "log_artifact_ids"), [invocation.invocation_id], ["artifacts"]);
  });
  report.environments.forEach((environment, index) => many(environment.lock_artifact_ids, pointer("environments", index, "lock_artifact_ids"), [environment.environment_id], ["artifacts"]));
  report.random_states.forEach((state, index) => {
    const assignments = new Map(state.seed_assignments.map((assignment) => [assignment.seed_assignment_id, assignment]));
    state.seed_assignments.forEach((assignment, assignmentIndex) => {
      if (assignment.parent_seed_assignment_id !== null && !assignments.has(assignment.parent_seed_assignment_id)) {
        findings.push(finding({ rule, effectiveSeverity: severity, category: "references_and_graph", pointer: pointer("random_states", index, "seed_assignments", assignmentIndex, "parent_seed_assignment_id"), affectedObjectIds: [state.random_state_id, assignment.seed_assignment_id], message: `Seed parent ${assignment.parent_seed_assignment_id} is not declared in random state ${state.random_state_id}.` }));
      }
    });
  });
  report.analysis_runs.forEach((run, index) => {
    const base = pointer("analysis_runs", index);
    expect({ id: run.invocation_id, pointer: `${base}/invocation_id`, ownerIds: [run.analysis_run_id], expectedCollections: ["invocations"] });
    run.code_artifacts.forEach((binding, bindingIndex) => expect({ id: binding.artifact_id, version: binding.artifact_version, pointer: `${base}/code_artifacts/${bindingIndex}`, ownerIds: [run.analysis_run_id], expectedCollections: ["artifacts"] }));
    expect({ id: run.environment_id, pointer: `${base}/environment_id`, ownerIds: [run.analysis_run_id], expectedCollections: ["environments"] });
    expect({ id: run.random_state_id, pointer: `${base}/random_state_id`, ownerIds: [run.analysis_run_id], expectedCollections: ["random_states"] });
    many(run.input_data_slice_ids, `${base}/input_data_slice_ids`, [run.analysis_run_id], ["data_slices"]);
    many(run.input_derivation_ids, `${base}/input_derivation_ids`, [run.analysis_run_id], ["derivations"]);
    many(run.output_artifact_ids, `${base}/output_artifact_ids`, [run.analysis_run_id], ["artifacts"]);
    many(run.log_artifact_ids, `${base}/log_artifact_ids`, [run.analysis_run_id], ["artifacts"]);
  });
  report.results.forEach((result, index) => {
    const base = pointer("results", index);
    expect({ id: result.work_unit_id, pointer: `${base}/work_unit_id`, ownerIds: [result.result_id], expectedCollections: ["work_units"] });
    expect({ id: result.attempt_id, pointer: `${base}/attempt_id`, ownerIds: [result.result_id], expectedCollections: ["attempts"] });
    expect({ id: result.segment_id, pointer: `${base}/segment_id`, ownerIds: [result.result_id], expectedCollections: ["segments"] });
    expect({ id: result.analysis_population_id, pointer: `${base}/analysis_population_id`, ownerIds: [result.result_id], expectedCollections: ["analysis_populations"] });
    many(result.data_slice_ids, `${base}/data_slice_ids`, [result.result_id], ["data_slices"]);
    many(result.derivation_ids, `${base}/derivation_ids`, [result.result_id], ["derivations"]);
    many(result.analysis_run_ids, `${base}/analysis_run_ids`, [result.result_id], ["analysis_runs"]);
    many(result.output_artifact_ids, `${base}/output_artifact_ids`, [result.result_id], ["artifacts"]);
    many(result.decision_event_ids, `${base}/decision_event_ids`, [result.result_id], ["decision_events"]);
    many(result.qualification_ids, `${base}/qualification_ids`, [result.result_id]);
    many(result.blocker_ids, `${base}/blocker_ids`, [result.result_id]);
    many(result.conflict_set_ids, `${base}/conflict_set_ids`, [result.result_id], ["conflict_sets"]);
    const negativeAssessment = result.negative_evidence_assessment;
    if (negativeAssessment !== null) {
      manyNestedDomain(negativeAssessment.control_record_ids ?? [], `${base}/negative_evidence_assessment/control_record_ids`, [result.result_id], "control_records");
      manyNestedDomain(negativeAssessment.quality_control_event_ids ?? [], `${base}/negative_evidence_assessment/quality_control_event_ids`, [result.result_id], "qc_events");
      manyNestedDomain(negativeAssessment.analysis_context_ids ?? [], `${base}/negative_evidence_assessment/analysis_context_ids`, [result.result_id], "analysis_contexts");
      expect({
        id: negativeAssessment.analysis_population_id,
        pointer: `${base}/negative_evidence_assessment/analysis_population_id`,
        ownerIds: [result.result_id],
        expectedCollections: ["analysis_populations"],
      });
    }
  });
  report.failures.forEach((failure, index) => {
    const base = pointer("failures", index);
    expect({ id: failure.affected_object_id, pointer: `${base}/affected_object_id`, ownerIds: [failure.failure_event_id] });
    expect({ id: failure.work_unit_id, pointer: `${base}/work_unit_id`, ownerIds: [failure.failure_event_id], expectedCollections: ["work_units"] });
    expect({ id: failure.attempt_id, pointer: `${base}/attempt_id`, ownerIds: [failure.failure_event_id], expectedCollections: ["attempts"] });
    expect({ id: failure.segment_id, pointer: `${base}/segment_id`, ownerIds: [failure.failure_event_id], expectedCollections: ["segments"] });
    many(failure.related_object_ids, `${base}/related_object_ids`, [failure.failure_event_id]);
    many(failure.partial_result_ids, `${base}/partial_result_ids`, [failure.failure_event_id], ["results"]);
    many(failure.recovery_attempt_ids, `${base}/recovery_attempt_ids`, [failure.failure_event_id], ["attempts"]);
  });
  report.evidence_items.forEach((evidence, index) => {
    const base = pointer("evidence_items", index);
    many(evidence.result_ids, `${base}/result_ids`, [evidence.evidence_item_id], ["results"]);
    many(evidence.artifact_ids, `${base}/artifact_ids`, [evidence.evidence_item_id], ["artifacts"]);
    many(evidence.data_slice_ids, `${base}/data_slice_ids`, [evidence.evidence_item_id], ["data_slices"]);
    many(evidence.derivation_ids, `${base}/derivation_ids`, [evidence.evidence_item_id], ["derivations"]);
    many(evidence.analysis_run_ids, `${base}/analysis_run_ids`, [evidence.evidence_item_id], ["analysis_runs"]);
    many(evidence.source_item_ids, `${base}/source_item_ids`, [evidence.evidence_item_id], ["source_items"]);
    many(evidence.dependency_group_ids, `${base}/dependency_group_ids`, [evidence.evidence_item_id], ["evidence_dependency_groups"]);
  });
  report.evidence_edges.forEach((edge, index) => {
    expect({ id: edge.evidence_item_id, pointer: pointer("evidence_edges", index, "evidence_item_id"), ownerIds: [edge.evidence_edge_id], expectedCollections: ["evidence_items"] });
    expect({ id: edge.claim_id, pointer: pointer("evidence_edges", index, "claim_id"), ownerIds: [edge.evidence_edge_id], expectedCollections: ["claims"] });
    expect({ id: edge.dependency_group_id, pointer: pointer("evidence_edges", index, "dependency_group_id"), ownerIds: [edge.evidence_edge_id], expectedCollections: ["evidence_dependency_groups"] });
  });
  report.evidence_dependency_groups.forEach((group, index) => {
    many(group.evidence_item_ids, pointer("evidence_dependency_groups", index, "evidence_item_ids"), [group.dependency_group_id], ["evidence_items"]);
    many(group.shared_ancestor_ids, pointer("evidence_dependency_groups", index, "shared_ancestor_ids"), [group.dependency_group_id]);
  });
  report.claims.forEach((claim, index) => {
    const base = pointer("claims", index);
    claim.subject_bindings.forEach((reference, referenceIndex) => expect({ id: reference.object_id, version: reference.object_version, pointer: `${base}/subject_bindings/${referenceIndex}`, ownerIds: [claim.claim_id] }));
    many(claim.evidence_edge_ids, `${base}/evidence_edge_ids`, [claim.claim_id], ["evidence_edges"]);
    many(claim.counterevidence_edge_ids, `${base}/counterevidence_edge_ids`, [claim.claim_id], ["evidence_edges"]);
    many(claim.argument_step_ids, `${base}/argument_step_ids`, [claim.claim_id], ["argument_steps"]);
    many(claim.dependency_edge_ids, `${base}/dependency_edge_ids`, [claim.claim_id], ["claim_dependencies"]);
    many(claim.cross_domain_bridge_ids, `${base}/cross_domain_bridge_ids`, [claim.claim_id], ["cross_domain_bridges"]);
    many(claim.conflict_set_ids, `${base}/conflict_set_ids`, [claim.claim_id], ["conflict_sets"]);
    many(claim.limitation_ids, `${base}/limitation_ids`, [claim.claim_id], ["limitations"]);
    many(claim.revision_event_ids, `${base}/revision_event_ids`, [claim.claim_id], ["revision_events"]);
  });
  report.argument_steps.forEach((step, index) => {
    many(step.premise_edge_ids, pointer("argument_steps", index, "premise_edge_ids"), [step.argument_step_id], ["argument_edges"]);
    many(step.conclusion_edge_ids, pointer("argument_steps", index, "conclusion_edge_ids"), [step.argument_step_id], ["argument_edges"]);
    many(step.bridge_ids, pointer("argument_steps", index, "bridge_ids"), [step.argument_step_id], ["cross_domain_bridges"]);
  });
  report.argument_edges.forEach((edge, index) => {
    const sourceCollections = edge.source_type === "claim" ? ["claims"] : edge.source_type === "evidence_item" ? ["evidence_items"] : ["argument_steps"];
    const targetCollections = edge.target_type === "claim" ? ["claims"] : ["argument_steps"];
    expect({ id: edge.source_id, pointer: pointer("argument_edges", index, "source_id"), ownerIds: [edge.argument_edge_id], expectedCollections: sourceCollections });
    expect({ id: edge.target_id, pointer: pointer("argument_edges", index, "target_id"), ownerIds: [edge.argument_edge_id], expectedCollections: targetCollections });
  });
  report.claim_dependencies.forEach((dependency, index) => {
    expect({ id: dependency.upstream_claim_id, version: dependency.upstream_claim_version, pointer: pointer("claim_dependencies", index, "upstream_claim_id"), ownerIds: [dependency.claim_dependency_id], expectedCollections: ["claims"] });
    expect({ id: dependency.downstream_claim_id, version: dependency.downstream_claim_version, pointer: pointer("claim_dependencies", index, "downstream_claim_id"), ownerIds: [dependency.claim_dependency_id], expectedCollections: ["claims"] });
  });
  report.cross_domain_bridges.forEach((bridge, index) => {
    bridge.source_entity_version_ids.forEach((reference, referenceIndex) => expect({ id: reference.object_id, version: reference.object_version, pointer: pointer("cross_domain_bridges", index, "source_entity_version_ids", referenceIndex), ownerIds: [bridge.bridge_id], expectedCollections: ["entities"] }));
    bridge.target_entity_version_ids.forEach((reference, referenceIndex) => expect({ id: reference.object_id, version: reference.object_version, pointer: pointer("cross_domain_bridges", index, "target_entity_version_ids", referenceIndex), ownerIds: [bridge.bridge_id], expectedCollections: ["entities"] }));
    many(bridge.enabled_argument_step_ids, pointer("cross_domain_bridges", index, "enabled_argument_step_ids"), [bridge.bridge_id], ["argument_steps"]);
  });
  report.conflict_sets.forEach((conflict, index) => {
    many(conflict.member_edge_ids, pointer("conflict_sets", index, "member_edge_ids"), [conflict.conflict_set_id], ["conflict_member_edges"]);
    expect({ id: conflict.decision_event_id, pointer: pointer("conflict_sets", index, "decision_event_id"), ownerIds: [conflict.conflict_set_id], expectedCollections: ["decision_events"] });
    many(conflict.downstream_claim_ids, pointer("conflict_sets", index, "downstream_claim_ids"), [conflict.conflict_set_id], ["claims"]);
    (conflict.heterogeneity_context_differences ?? []).forEach((difference, differenceIndex) => {
      expect({ id: difference.left_result_id, pointer: pointer("conflict_sets", index, "heterogeneity_context_differences", differenceIndex, "left_result_id"), ownerIds: [conflict.conflict_set_id], expectedCollections: ["results"] });
      expect({ id: difference.right_result_id, pointer: pointer("conflict_sets", index, "heterogeneity_context_differences", differenceIndex, "right_result_id"), ownerIds: [conflict.conflict_set_id], expectedCollections: ["results"] });
    });
  });
  report.conflict_member_edges.forEach((edge, index) => {
    expect({ id: edge.conflict_set_id, pointer: pointer("conflict_member_edges", index, "conflict_set_id"), ownerIds: [edge.conflict_member_edge_id], expectedCollections: ["conflict_sets"] });
    expect({ id: edge.member_id, pointer: pointer("conflict_member_edges", index, "member_id"), ownerIds: [edge.conflict_member_edge_id], expectedCollections: edge.member_type === "claim" ? ["claims"] : ["evidence_items"] });
  });
  report.artifacts.forEach((artifact, index) => {
    const base = pointer("artifacts", index);
    many(artifact.source_item_ids, `${base}/source_item_ids`, [artifact.artifact_id], ["source_items"]);
    many(artifact.derivation_ids, `${base}/derivation_ids`, [artifact.artifact_id], ["derivations"]);
    many(artifact.analysis_run_ids, `${base}/analysis_run_ids`, [artifact.artifact_id], ["analysis_runs"]);
    many(artifact.supersedes_artifact_ids, `${base}/supersedes_artifact_ids`, [artifact.artifact_id], ["artifacts"]);
  });
  report.reproducibility_units.forEach((unit, index) => {
    const base = pointer("reproducibility_units", index);
    many(unit.covered_work_unit_ids, `${base}/covered_work_unit_ids`, [unit.reproducibility_unit_id], ["work_units"]);
    many(unit.covered_analysis_run_ids, `${base}/covered_analysis_run_ids`, [unit.reproducibility_unit_id], ["analysis_runs"]);
    many(unit.covered_claim_ids, `${base}/covered_claim_ids`, [unit.reproducibility_unit_id], ["claims"]);
    many(unit.covered_output_ids, `${base}/covered_output_ids`, [unit.reproducibility_unit_id], ["artifacts"]);
    many(unit.historical_invocation_ids, `${base}/historical_invocation_ids`, [unit.reproducibility_unit_id], ["invocations"]);
    expect({ id: unit.environment_record.record_id, pointer: `${base}/environment_record/record_id`, ownerIds: [unit.reproducibility_unit_id], expectedCollections: ["environments"] });
    expect({ id: unit.random_state_record.record_id, pointer: `${base}/random_state_record/record_id`, ownerIds: [unit.reproducibility_unit_id], expectedCollections: ["random_states"] });
    many(unit.access_assessment.artifact_ids, `${base}/access_assessment/artifact_ids`, [unit.reproducibility_unit_id], ["artifacts"]);
    unit.replay_events.forEach((event, eventIndex) => {
      expect({ id: event.environment_id, pointer: `${base}/replay_events/${eventIndex}/environment_id`, ownerIds: [unit.reproducibility_unit_id, event.replay_event_id], expectedCollections: ["environments"] });
      expect({ id: event.actual_invocation_id, pointer: `${base}/replay_events/${eventIndex}/actual_invocation_id`, ownerIds: [unit.reproducibility_unit_id, event.replay_event_id], expectedCollections: ["invocations"] });
      many(event.input_artifact_ids, `${base}/replay_events/${eventIndex}/input_artifact_ids`, [event.replay_event_id], ["artifacts"]);
      many(event.output_artifact_ids, `${base}/replay_events/${eventIndex}/output_artifact_ids`, [event.replay_event_id], ["artifacts"]);
    });
    unit.independent_reproduction_events.forEach((event, eventIndex) => {
      many(event.shared_dependency_ids, `${base}/independent_reproduction_events/${eventIndex}/shared_dependency_ids`, [event.reproduction_event_id]);
      many(event.output_artifact_ids, `${base}/independent_reproduction_events/${eventIndex}/output_artifact_ids`, [event.reproduction_event_id], ["artifacts"]);
    });
    many(unit.limitation_ids, `${base}/limitation_ids`, [unit.reproducibility_unit_id], ["limitations"]);
  });
  report.limitations.forEach((limitation, index) => many(limitation.affected_object_ids, pointer("limitations", index, "affected_object_ids"), [limitation.limitation_id]));
  report.revision_events.forEach((revision, index) => {
    revision.superseded_object_refs.forEach((reference, referenceIndex) => expect({ id: reference.object_id, version: reference.object_version, pointer: pointer("revision_events", index, "superseded_object_refs", referenceIndex), ownerIds: [revision.revision_event_id] }));
    revision.replacement_object_refs.forEach((reference, referenceIndex) => expect({ id: reference.object_id, version: reference.object_version, pointer: pointer("revision_events", index, "replacement_object_refs", referenceIndex), ownerIds: [revision.revision_event_id] }));
    many(revision.invalidated_object_ids, pointer("revision_events", index, "invalidated_object_ids"), [revision.revision_event_id]);
    many(revision.review_required_object_ids, pointer("revision_events", index, "review_required_object_ids"), [revision.revision_event_id]);
  });
  report.review_tasks.forEach((task, index) => many(task.affected_object_ids, pointer("review_tasks", index, "affected_object_ids"), [task.review_task_id]));

  for (const binding of locatedDerivationBindings(report)) {
    expect({
      id: binding.id,
      pointer: binding.instancePointer,
      ownerIds: [],
      expectedCollections: ["derivations"],
    });
  }
  for (const located of locatedSourceBindings(report)) {
    const { binding } = located;
    expect({ id: binding.source_item_id, pointer: `${located.instancePointer}/source_item_id`, ownerIds: [], expectedCollections: ["source_items"] });
    expect({ id: binding.source_snapshot_id, pointer: `${located.instancePointer}/source_snapshot_id`, ownerIds: [], expectedCollections: ["source_snapshots"] });
    const source = report.source_coverage.items.find((item) => item.source_item_id === binding.source_item_id);
    if (
      source !== undefined &&
      source.content_hash.state === "known" &&
      binding.content_hash !== null &&
      binding.content_hash !== undefined &&
      binding.content_hash !== source.content_hash.value
    ) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        category: "references_and_graph",
        pointer: `${located.instancePointer}/content_hash`,
        affectedObjectIds: [binding.source_item_id],
        sourceBindings: [binding],
        message: `Source binding content hash does not match source item ${binding.source_item_id}.`,
      }));
    }
  }
  return findings;
}

const SENTINELS = new Set(["", "tbd", "n/a", "na", "unknown_string"]);
const WITHHOLDING_REASON_CODES = new Set([
  "privacy",
  "ethics_or_consent",
  "license_or_contract",
  "security",
  "controlled_access",
  "source_confidentiality",
  "other_restricted",
]);

function forbiddenSentinel(value: unknown, seen: Set<object> = new Set()): string | undefined {
  if (typeof value === "string") {
    return SENTINELS.has(value.trim().toLowerCase()) ? value : undefined;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const child of children) {
    const sentinel = forbiddenSentinel(child, seen);
    if (sentinel !== undefined) return sentinel;
  }
  return undefined;
}

function missingnessFindings(report: ScientificReport, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const seen = new Set<object>();
  function walk(value: unknown, path: string): void {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}/${index}`));
      return;
    }
    const record = value as Record<string, unknown>;
    const isEnvelope =
      "state" in record &&
      "value" in record &&
      "source_bindings" in record &&
      "derivation_bindings" in record &&
      "missing_reason" in record &&
      "provenance_status" in record;
    if (isEnvelope) {
      const state = record.state;
      const fieldValue = record.value;
      const sources = Array.isArray(record.source_bindings) ? record.source_bindings : [];
      const derivations = Array.isArray(record.derivation_bindings) ? record.derivation_bindings : [];
      let message: string | null = null;
      if (state === "known") {
        const sentinel = forbiddenSentinel(fieldValue);
        if (fieldValue === null) message = "Known field has a null value.";
        else if (sources.length === 0 && derivations.length === 0) message = "Known field has no source or derivation binding.";
        else if (record.missing_reason !== null) message = "Known field carries a missing_reason.";
        else if (record.provenance_status !== "complete" && record.provenance_status !== "partial") message = "Known field has absent provenance.";
        else if (sentinel !== undefined) message = `Known field uses forbidden sentinel string ${JSON.stringify(sentinel)}.`;
      } else if (state === "unknown" || state === "not_applicable" || state === "withheld") {
        if (fieldValue !== null) message = `${state} field exposes a non-null value.`;
        else if (typeof record.missing_reason !== "string" || record.missing_reason.trim() === "") message = `${state} field lacks an explicit reason.`;
        else if (state === "withheld") {
          const reasonCode = record.withholding_reason_code;
          const decisionId = record.disclosure_decision_id;
          if (typeof reasonCode !== "string" || !WITHHOLDING_REASON_CODES.has(reasonCode)) {
            message = "Withheld field lacks an allowed non-sensitive withholding_reason_code.";
          } else if (typeof decisionId !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{0,159}$/u.test(decisionId)) {
            message = "Withheld field lacks a valid disclosure_decision_id.";
          } else {
            const publicProjection = report.payload_role === "public_projection" || report.disclosure_state.level === "public";
            if (publicProjection && (record.provenance_status !== "absent" || sources.length > 0 || derivations.length > 0)) {
              message = "Public withheld field must have absent public provenance and no protected source or derivation bindings.";
            } else if (!publicProjection && record.provenance_status === "absent") {
              message = "Non-public withheld field is a known protected state and cannot have absent provenance.";
            }
          }
        }
      } else message = `Unrecognized missingness state ${String(state)}.`;
      if (message !== null) findings.push(finding({ rule, effectiveSeverity: severity, category: "schema_and_missingness", pointer: path, message }));
      return;
    }
    for (const [key, child] of Object.entries(record)) walk(child, `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
  }
  walk(report, "");
  return findings;
}

export function runReferenceValidation(context: SemanticContext, severity: RuleSeverity = "blocker"): ValidationFinding[] {
  return referenceFindings(context, REFERENCE_RULE, severity);
}

export function runMissingnessValidation(report: ScientificReport, severity: RuleSeverity = "blocker"): ValidationFinding[] {
  return missingnessFindings(report, MISSINGNESS_RULE, severity);
}

export function detailsAsJson(value: Record<string, JsonValue>): JsonValue {
  return value;
}
