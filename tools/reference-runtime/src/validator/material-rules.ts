import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import { findDirectedCycle, finding, pointer } from "./context.js";
import type { SemanticContext, ValidationFinding } from "./types.js";

export function evaluateMAT001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const report = context.report;
  const findings: ValidationFinding[] = [];
  const materials = new Map(report.materials.map((material) => [material.material_id, material]));
  const edges = new Map<string, string[]>();
  for (const id of materials.keys()) edges.set(id, []);

  report.material_relationships.forEach((relationship, index) => {
    for (const input of relationship.input_material_ids) {
      const targets = edges.get(input) ?? [];
      targets.push(...relationship.output_material_ids);
      edges.set(input, targets);
    }
    const overlaps = relationship.input_material_ids.filter((id) => relationship.output_material_ids.includes(id));
    if (overlaps.length > 0) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("material_relationships", index), affectedObjectIds: [relationship.relationship_id, ...overlaps], message: "A material relationship uses the same material version as both input and output." }));
    }

    if (relationship.input_quantity.state === "known" && relationship.output_quantity.state === "known") {
      const changed = relationship.input_quantity.value !== relationship.output_quantity.value;
      if (changed && relationship.loss_or_gain_explanation.state !== "known" && relationship.loss_or_gain_explanation.state !== "withheld") {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("material_relationships", index, "loss_or_gain_explanation"), affectedObjectIds: [relationship.relationship_id, ...relationship.input_material_ids, ...relationship.output_material_ids], message: "Known material quantity changes without a loss/gain explanation." }));
      }
    }
  });

  const cycle = findDirectedCycle(materials.keys(), edges);
  if (cycle !== null) {
    findings.push(finding({ rule, effectiveSeverity: severity, pointer: "/material_relationships", affectedObjectIds: cycle.cycle, message: `Material derivation graph contains a cycle: ${cycle.cycle.join(" -> ")}.` }));
  }

  report.analysis_populations.forEach((population, index) => {
    const included = population.members.filter((member) => member.inclusion_status === "included");
    const excluded = population.members.filter((member) => member.inclusion_status === "excluded" || member.inclusion_status === "withdrawn");
    if (population.lineage_status === "closed") {
      const unresolved = population.members.filter(
        (member) =>
          member.inclusion_status === "unknown" ||
          (member.material_id === null && member.entity_id === null) ||
          (member.material_id !== null && !materials.has(member.material_id)),
      );
      if (unresolved.length > 0) {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("analysis_populations", index, "lineage_status"), affectedObjectIds: [population.analysis_population_id, ...unresolved.map((member) => member.member_id)], message: "Analysis population is marked closed despite unresolved membership or material lineage." }));
      }
      const unjustifiedExclusions = excluded.filter(
        (member) =>
          (member.inclusion_reason.state !== "known" && member.inclusion_reason.state !== "withheld") ||
          member.decision_event_ids.length === 0,
      );
      if (unjustifiedExclusions.length > 0) {
        findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("analysis_populations", index, "members"), affectedObjectIds: [population.analysis_population_id, ...unjustifiedExclusions.map((member) => member.member_id)], message: "Closed analysis population contains exclusions without a reason and decision event." }));
      }
    }

    const knownGroups = included
      .map((member) => member.group_key.state === "known" ? member.group_key.value : undefined)
      .filter((value): value is string => value !== undefined);
    if (
      population.replicate_structure.biological_unit_count.state === "known" &&
      knownGroups.length === included.length &&
      new Set(knownGroups).size !== population.replicate_structure.biological_unit_count.value
    ) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("analysis_populations", index, "replicate_structure", "biological_unit_count"), affectedObjectIds: [population.analysis_population_id], message: `Biological-unit count ${population.replicate_structure.biological_unit_count.value} does not reconcile with ${new Set(knownGroups).size} unique included group keys.`, details: { included_members: included.length, unique_group_keys: new Set(knownGroups).size } }));
    }
  });

  report.data_slices.forEach((slice, index) => {
    if (slice.analysis_population_id === null) return;
    const population = report.analysis_populations.find((candidate) => candidate.analysis_population_id === slice.analysis_population_id);
    if (population === undefined) return;
    const included = population.members.filter((member) => member.inclusion_status === "included").length;
    const excluded = population.members.filter((member) => member.inclusion_status === "excluded" || member.inclusion_status === "withdrawn").length;
    if (slice.selected_unit_count.state === "known" && population.lineage_status === "closed" && slice.selected_unit_count.value !== included) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("data_slices", index, "selected_unit_count"), affectedObjectIds: [slice.data_slice_id, population.analysis_population_id], message: `Data-slice selected count ${slice.selected_unit_count.value} does not reconcile with ${included} included population members.` }));
    }
    if (slice.excluded_unit_count.state === "known" && population.lineage_status === "closed" && slice.excluded_unit_count.value !== excluded) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("data_slices", index, "excluded_unit_count"), affectedObjectIds: [slice.data_slice_id, population.analysis_population_id], message: `Data-slice excluded count ${slice.excluded_unit_count.value} does not reconcile with ${excluded} excluded/withdrawn population members.` }));
    }
  });

  report.results.forEach((result, index) => {
    if (result.analysis_population_id === null || result.record_disposition !== "primary") return;
    const population = report.analysis_populations.find((candidate) => candidate.analysis_population_id === result.analysis_population_id);
    if (population !== undefined && population.lineage_status !== "closed" && result.interpretability_status === "interpretable") {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("results", index, "interpretability_status"), affectedObjectIds: [result.result_id, population.analysis_population_id], message: "Primary result is unqualified although its analysis-population lineage is not closed." }));
    }
  });
  return findings;
}
