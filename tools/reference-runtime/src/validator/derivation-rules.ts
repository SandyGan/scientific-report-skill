import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import type { DerivationRecord, EvidenceItem, Result } from "../lib/types.js";
import { findDirectedCycle, finding, pointer, uniqueStrings } from "./context.js";
import type { SemanticContext, ValidationFinding } from "./types.js";

function externalQuantitativeSourceClosed(context: SemanticContext, result: Result): boolean {
  if (result.derivation_closure_status !== "not_applicable") return false;
  const work = context.report.work_units.find((unit) => unit.work_unit_id === result.work_unit_id);
  if (work === undefined || (work.execution_scope !== "external_study" && work.execution_scope !== "upstream_collaborator")) return false;
  return context.report.evidence_items.some(
    (evidence) =>
      evidence.result_ids.includes(result.result_id) &&
      exactImmutableExternalBinding(context, evidence),
  );
}

interface DerivationAssessment {
  gaps: string[];
  involvedIds: string[];
}

function quantitativeEvidenceForResult(context: SemanticContext, resultId: string): EvidenceItem[] {
  return context.report.evidence_items.filter((evidence) => evidence.result_ids.includes(resultId));
}

function assessQuantitativeResult(context: SemanticContext, result: Result): DerivationAssessment {
  const report = context.report;
  const gaps: string[] = [];
  const involved = new Set<string>([result.result_id]);
  const slices = new Map(report.data_slices.map((slice) => [slice.data_slice_id, slice]));
  const derivations = new Map(report.derivations.map((derivation) => [derivation.derivation_id, derivation]));
  const runs = new Map(report.analysis_runs.map((run) => [run.analysis_run_id, run]));
  const artifacts = new Map(report.artifacts.map((artifact) => [artifact.artifact_id, artifact]));
  const invocations = new Map(report.invocations.map((invocation) => [invocation.invocation_id, invocation]));
  const environments = new Map(report.environments.map((environment) => [environment.environment_id, environment]));
  const randomStates = new Map(report.random_states.map((state) => [state.random_state_id, state]));

  if (result.derivation_closure_status !== "complete") gaps.push(`result declares derivation_closure_status=${result.derivation_closure_status}`);
  if (result.data_slice_ids.length === 0) gaps.push("no DataSlice is linked");
  if (result.derivation_ids.length === 0) gaps.push("no DerivationRecord is linked");
  if (result.analysis_run_ids.length === 0) gaps.push("no AnalysisRun is linked");
  if (result.output_artifact_ids.length === 0) gaps.push("no output artifact is linked");

  for (const sliceId of result.data_slice_ids) {
    involved.add(sliceId);
    const slice = slices.get(sliceId);
    if (slice === undefined) {
      gaps.push(`DataSlice ${sliceId} is unresolved`);
      continue;
    }
    if (slice.slice_hash.state !== "known") gaps.push(`DataSlice ${sliceId} has no known slice hash`);
    if (slice.input_artifacts.length === 0) gaps.push(`DataSlice ${sliceId} has no versioned input artifact`);
    for (const binding of slice.input_artifacts) {
      involved.add(binding.artifact_id);
      const artifact = artifacts.get(binding.artifact_id);
      if (binding.content_hash.state !== "known") gaps.push(`DataSlice ${sliceId} input ${binding.artifact_id} has no known binding hash`);
      if (artifact === undefined || artifact.content_hash.state !== "known") gaps.push(`DataSlice ${sliceId} input artifact ${binding.artifact_id} lacks a known report hash`);
      else if (binding.content_hash.state === "known" && binding.content_hash.value !== artifact.content_hash.value) gaps.push(`DataSlice ${sliceId} input artifact ${binding.artifact_id} hash differs from the artifact record`);
    }
    const locatorValues = [
      slice.locator.table_or_object,
      slice.locator.row_or_record_selector,
      slice.locator.frame_or_time_selector,
      slice.locator.query,
      slice.locator.filter_expressions,
    ];
    if (!locatorValues.some((field) => field.state === "known")) gaps.push(`DataSlice ${sliceId} has no known selector, query, frame/time range, or filter`);
  }

  const visited = new Set<string>();
  const reachableSlices = new Set<string>();
  const reachableArtifacts = new Set<string>();
  function visitDerivation(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    involved.add(id);
    const derivation = derivations.get(id);
    if (derivation === undefined) {
      gaps.push(`DerivationRecord ${id} is unresolved`);
      return;
    }
    if (derivation.derivation_status !== "complete") gaps.push(`DerivationRecord ${id} status is ${derivation.derivation_status}`);
    if (derivation.operation_or_formula.state !== "known" && derivation.code_artifact_ids.length === 0) gaps.push(`DerivationRecord ${id} has neither a known operation/formula nor code artifact`);
    derivation.input_data_slice_ids.forEach((sliceId) => reachableSlices.add(sliceId));
    derivation.input_artifact_ids.forEach((artifactId) => reachableArtifacts.add(artifactId));
    derivation.input_derivation_ids.forEach(visitDerivation);
    if (derivation.analysis_run_id === null) gaps.push(`DerivationRecord ${id} has no analysis run`);
    else {
      involved.add(derivation.analysis_run_id);
      const run = runs.get(derivation.analysis_run_id);
      if (run === undefined) gaps.push(`DerivationRecord ${id} analysis run ${derivation.analysis_run_id} is unresolved`);
      else assessRun(run.analysis_run_id);
    }
    if (derivation.output_artifact_ids.length === 0 && derivation.derived_values.length === 0 && derivation.output_data_slice_ids.length === 0) gaps.push(`DerivationRecord ${id} has no identified output`);
    for (const outputId of derivation.output_artifact_ids) {
      involved.add(outputId);
      const artifact = artifacts.get(outputId);
      if (artifact === undefined || artifact.content_hash.state !== "known") gaps.push(`DerivationRecord ${id} output artifact ${outputId} lacks a known hash`);
    }
  }

  const assessedRuns = new Set<string>();
  function assessRun(id: string): void {
    if (assessedRuns.has(id)) return;
    assessedRuns.add(id);
    involved.add(id);
    const run = runs.get(id);
    if (run === undefined) {
      gaps.push(`AnalysisRun ${id} is unresolved`);
      return;
    }
    if (run.execution_status !== "completed") gaps.push(`AnalysisRun ${id} status is ${run.execution_status}`);
    if (run.output_manifest_hash.state !== "known") gaps.push(`AnalysisRun ${id} has no known output manifest hash`);
    const invocation = invocations.get(run.invocation_id);
    involved.add(run.invocation_id);
    if (invocation === undefined) gaps.push(`AnalysisRun ${id} invocation ${run.invocation_id} is unresolved`);
    else {
      if (invocation.record_role !== "historical_actual" && invocation.record_role !== "verification_run") gaps.push(`AnalysisRun ${id} invocation is not an actual execution record`);
      if (invocation.termination_status !== "completed") gaps.push(`AnalysisRun ${id} invocation did not complete`);
    }
    const environment = environments.get(run.environment_id);
    involved.add(run.environment_id);
    if (environment === undefined || environment.completeness === "absent" || environment.completeness === "unknown") gaps.push(`AnalysisRun ${id} environment is absent or unknown`);
    const randomState = randomStates.get(run.random_state_id);
    involved.add(run.random_state_id);
    if (randomState === undefined) gaps.push(`AnalysisRun ${id} random state is unresolved`);
    else if (randomState.randomness_used === "yes" && randomState.capture_status !== "complete") gaps.push(`AnalysisRun ${id} random state is not completely captured`);
    else if (randomState.randomness_used === "unknown" || randomState.capture_status === "unknown" || randomState.capture_status === "absent") gaps.push(`AnalysisRun ${id} random-state applicability/capture is unresolved`);
    if (run.output_artifact_ids.length === 0) gaps.push(`AnalysisRun ${id} has no output artifact`);
    for (const artifactId of run.output_artifact_ids) {
      involved.add(artifactId);
      const artifact = artifacts.get(artifactId);
      if (artifact === undefined || artifact.content_hash.state !== "known") gaps.push(`AnalysisRun ${id} output artifact ${artifactId} lacks a known hash`);
    }
  }

  result.derivation_ids.forEach(visitDerivation);
  result.analysis_run_ids.forEach(assessRun);
  if (result.data_slice_ids.length > 0 && !result.data_slice_ids.some((id) => reachableSlices.has(id))) {
    gaps.push("linked derivation graph does not consume any result-linked DataSlice");
  }
  for (const artifactId of result.output_artifact_ids) {
    involved.add(artifactId);
    const artifact = artifacts.get(artifactId);
    if (artifact === undefined || artifact.content_hash.state !== "known") gaps.push(`result output artifact ${artifactId} lacks a known hash`);
    const producedByRun = result.analysis_run_ids.some((runId) => runs.get(runId)?.output_artifact_ids.includes(artifactId));
    const producedByDerivation = result.derivation_ids.some((derivationId) => derivations.get(derivationId)?.output_artifact_ids.includes(artifactId));
    if (!producedByRun && !producedByDerivation) gaps.push(`result output artifact ${artifactId} is not produced by a linked run or derivation`);
  }

  const evidence = quantitativeEvidenceForResult(context, result.result_id);
  if (evidence.length === 0) gaps.push("no EvidenceItem links the quantitative result");
  for (const item of evidence) involved.add(item.evidence_item_id);
  const evidenceIds = new Set(evidence.map((item) => item.evidence_item_id));
  const linkedByClaim = context.report.evidence_edges.some((edge) => evidenceIds.has(edge.evidence_item_id));
  if (!linkedByClaim && result.record_disposition !== "excluded" && result.record_disposition !== "superseded" && result.record_disposition !== "retracted") gaps.push("no Claim links the result EvidenceItem");

  void reachableArtifacts;
  return { gaps: uniqueStrings(gaps), involvedIds: [...involved] };
}

function locatorIsExact(locatorType: string, value: string): boolean {
  if (locatorType === "json_pointer") return value.startsWith("/") && value.length > 1;
  if (locatorType === "line_range" || locatorType === "page_range" || locatorType === "timestamp_range" || locatorType === "frame_range") {
    return /(?:\d|\bstart\b).*(?:-|–|to|\.\.).*(?:\d|\bend\b)/iu.test(value);
  }
  if (locatorType === "table_cell") return /(?:\brow\b.*\bcolumn\b|\bcell\b|\b[A-Z]+\d+\b)/iu.test(value);
  if (locatorType === "figure_panel") return /\b(?:panel|subplot)\b\s*[A-Za-z0-9]+/iu.test(value);
  if (locatorType === "record_key") return /(?:=|:|\bkey\b)/u.test(value);
  if (locatorType === "query") return /(?:select|where|match|filter|\?|=)/iu.test(value);
  if (locatorType === "uri_fragment") return value.includes("#") && value.slice(value.indexOf("#") + 1).trim().length > 0;
  return false;
}

function exactImmutableExternalBinding(context: SemanticContext, evidence: EvidenceItem): boolean {
  if (evidence.evidence_kind !== "external_evidence" && evidence.evidence_kind !== "source_statement") return false;
  if (evidence.evidence_status !== "active" && evidence.evidence_status !== "qualified") return false;
  const exactLocatorKinds = new Set([
    "json_pointer",
    "line_range",
    "page_range",
    "table_cell",
    "figure_panel",
    "timestamp_range",
    "frame_range",
    "record_key",
    "query",
    "uri_fragment",
  ]);
  return evidence.source_bindings.some((binding) => {
    if (binding.binding_role !== "direct" || !exactLocatorKinds.has(binding.locator.locator_type)) return false;
    if (!locatorIsExact(binding.locator.locator_type, binding.locator.value)) return false;
    const bindingRecord = binding as unknown as Record<string, unknown>;
    if (bindingRecord.binding_scope !== undefined && bindingRecord.binding_scope !== "content_excerpt") return false;
    if (binding.source_snapshot_id === undefined || binding.source_snapshot_id === null) return false;
    if (!context.report.source_coverage.snapshots.some((snapshot) => snapshot.source_snapshot_id === binding.source_snapshot_id)) return false;
    const source = context.report.source_coverage.items.find((item) => item.source_item_id === binding.source_item_id);
    if (source?.disposition !== "included" || source.snapshot_id !== binding.source_snapshot_id) return false;
    const bindingHash = binding.content_hash ?? binding.excerpt_hash;
    if (bindingHash === undefined || bindingHash === null) return false;
    if (binding.content_hash !== undefined && binding.content_hash !== null && source.content_hash.state === "known" && binding.content_hash !== source.content_hash.value) return false;
    return true;
  });
}

function evidenceForQuantitativeClaim(
  context: SemanticContext,
  claimId: string,
  visitedClaims: Set<string>,
): EvidenceItem[] {
  if (visitedClaims.has(claimId)) return [];
  visitedClaims.add(claimId);
  const claim = context.report.claims.find((item) => item.claim_id === claimId);
  if (claim === undefined) return [];
  const declaredEvidenceEdges = new Set([...claim.evidence_edge_ids, ...claim.counterevidence_edge_ids]);
  const evidenceIds = new Set(
    context.report.evidence_edges
      .filter((edge) => declaredEvidenceEdges.has(edge.evidence_edge_id) && edge.claim_id === claimId && (edge.relationship === "supports" || edge.relationship === "qualifies"))
      .map((edge) => edge.evidence_item_id),
  );
  for (const stepId of claim.argument_step_ids) {
    const step = context.report.argument_steps.find((item) => item.argument_step_id === stepId);
    if (step === undefined || (step.validity_status !== "valid_for_scope" && step.validity_status !== "qualified")) continue;
    const premiseIds = new Set(step.premise_edge_ids);
    for (const edge of context.report.argument_edges) {
      if (!premiseIds.has(edge.argument_edge_id) || edge.target_type !== "argument_step" || edge.target_id !== stepId) continue;
      if (edge.source_type === "evidence_item") evidenceIds.add(edge.source_id);
      if (edge.source_type === "claim") {
        evidenceForQuantitativeClaim(context, edge.source_id, visitedClaims).forEach((evidence) => evidenceIds.add(evidence.evidence_item_id));
      }
    }
  }
  return [...evidenceIds]
    .map((id) => context.report.evidence_items.find((item) => item.evidence_item_id === id))
    .filter((item): item is EvidenceItem => item !== undefined);
}

export function evaluateDER001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const derivationEdges = new Map<string, string[]>();
  for (const derivation of context.report.derivations) derivationEdges.set(derivation.derivation_id, [...derivation.input_derivation_ids]);
  const cycle = findDirectedCycle(derivationEdges.keys(), derivationEdges);
  if (cycle !== null) {
    findings.push(finding({ rule, effectiveSeverity: severity, pointer: "/derivations", affectedObjectIds: cycle.cycle, message: `Derivation dependency graph contains a cycle: ${cycle.cycle.join(" -> ")}.` }));
  }

  context.report.results.forEach((result, index) => {
    if (result.result_kind !== "quantitative") return;
    if (externalQuantitativeSourceClosed(context, result)) return;
    const evidence = quantitativeEvidenceForResult(context, result.result_id);
    const evidenceIds = new Set(evidence.map((item) => item.evidence_item_id));
    const usedByActiveClaim = context.report.evidence_edges.some((edge) => {
      if (!evidenceIds.has(edge.evidence_item_id) || (edge.relationship !== "supports" && edge.relationship !== "qualifies")) return false;
      const claim = context.report.claims.find((candidate) => candidate.claim_id === edge.claim_id);
      return claim?.support_status === "supported" || claim?.support_status === "qualified";
    });
    const reportable = !["excluded", "superseded", "retracted"].includes(result.record_disposition);
    if (!usedByActiveClaim && !reportable && result.derivation_closure_status !== "complete") return;
    const assessment = assessQuantitativeResult(context, result);
    if (assessment.gaps.length > 0) {
      findings.push(finding({ rule, effectiveSeverity: severity, pointer: pointer("results", index, "derivation_closure_status"), affectedObjectIds: assessment.involvedIds, sourceBindings: result.source_bindings, message: `Quantitative result ${result.result_id} lacks a closed derivation path: ${assessment.gaps.join("; ")}.`, details: { gaps: assessment.gaps } }));
    }
  });

  context.report.claims.forEach((claim, claimIndex) => {
    if (claim.claim_type !== "quantitative") return;
    if (claim.support_status !== "supported" && claim.support_status !== "qualified") return;
    const evidence = evidenceForQuantitativeClaim(context, claim.claim_id, new Set())
      .filter((item) => item.evidence_status === "active" || item.evidence_status === "qualified");
    const exactExternalEvidence = evidence.find((item) => exactImmutableExternalBinding(context, item));
    if (exactExternalEvidence !== undefined) return;
    const quantitativeResults = evidence.flatMap((item) =>
      item.result_ids
        .map((id) => context.report.results.find((result) => result.result_id === id))
        .filter((result): result is Result => result?.result_kind === "quantitative"),
    );
    if (quantitativeResults.some((result) => externalQuantitativeSourceClosed(context, result) || assessQuantitativeResult(context, result).gaps.length === 0)) return;
    if (quantitativeResults.length > 0) return;
    const involvedIds = uniqueStrings([
      claim.claim_id,
      ...claim.evidence_edge_ids,
      ...claim.argument_step_ids,
      ...evidence.map((item) => item.evidence_item_id),
      ...evidence.flatMap((item) => item.result_ids),
    ]);
    findings.push(finding({
      rule,
      effectiveSeverity: severity,
      pointer: pointer("claims", claimIndex, "evidence_edge_ids"),
      affectedObjectIds: involvedIds,
      sourceBindings: claim.source_bindings,
      message: `Quantitative claim ${claim.claim_id} has neither closed quantitative result/derivation evidence nor an exact immutable external locator.`,
      details: {
        gaps: [
          evidence.length === 0 ? "no admissible supporting evidence is linked" : "supporting evidence links no quantitative Result",
          "no exact immutable external source locator is linked",
        ],
      },
    }));
  });
  return findings;
}
