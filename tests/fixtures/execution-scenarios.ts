import type { ScientificReport } from "../../src/lib/types.js";
import {
  BASE_SOURCE_ID,
  baseReport,
  known,
  makeSourceItem,
  notApplicable,
  reconcileCoverageCounts,
  sourceBinding,
  unknown,
} from "./base-report.js";
import {
  makeAttempt,
  makeCampaign,
  makeDecision,
  makeEntity,
  makeFailure,
  makeMaterial,
  makeResult,
  makeWorkUnit,
} from "./record-builders.js";

export function authoritativeCoverageReport(
  expectedItemCount: number,
  terminallyDisposedItemCount: number,
): ScientificReport {
  if (expectedItemCount < 1) throw new RangeError("Coverage fixtures retain source.base so expectedItemCount must be positive.");
  if (terminallyDisposedItemCount < 0 || terminallyDisposedItemCount > expectedItemCount) {
    throw new RangeError("terminallyDisposedItemCount must be between zero and expectedItemCount.");
  }
  const report = baseReport();
  report.source_coverage.authority_basis = "authoritative_registry";
  report.source_coverage.authority_evidence = known("Frozen laboratory registry exported for this report.");
  report.source_coverage.enumeration_status = "authoritative_exhaustive";
  report.source_coverage.cutoff = known("2026-08-24T00:00:00.000Z");
  report.source_coverage.items = Array.from({ length: expectedItemCount }, (_, index) => {
    const id = index === 0 ? BASE_SOURCE_ID : `source.authoritative.${String(index + 1).padStart(2, "0")}`;
    const disposition = index < terminallyDisposedItemCount ? "included" : "pending";
    return makeSourceItem(id, {
      disposition,
      ...(disposition === "pending"
        ? { dispositionReason: known("This authoritative source has not yet received a terminal disposition.") }
        : {}),
    });
  });
  report.source_coverage.coverage_limitations = terminallyDisposedItemCount === expectedItemCount
    ? []
    : ["One or more authoritative registry members remain pending disposition."];
  report.source_coverage.scope_statement = "The frozen authoritative registry is the bounded completeness denominator.";
  reconcileCoverageCounts(report);
  const complete = terminallyDisposedItemCount === expectedItemCount;
  report.source_coverage.coverage_axes = {
    inventory_accounting: complete ? "complete" : "incomplete",
    accessibility: "all_accessible",
    scientific_incorporation: complete ? "complete_within_boundary" : "partial",
  };
  report.source_coverage.report_completeness = complete ? "proven_within_declared_universe" : "partial";
  return report;
}

export function mixedExecutionScopeReport(
  aggregateExternalIntoProjectCampaign: boolean,
): ScientificReport {
  const report = baseReport();
  const scopeRows = [
    { suffix: "project", scope: "this_project" as const },
    { suffix: "reanalysis", scope: "reanalysis" as const },
    { suffix: "external", scope: "external_study" as const },
  ];

  if (aggregateExternalIntoProjectCampaign) {
    const campaign = makeCampaign("campaign.mixed", "this_project", "completed");
    campaign.work_unit_ids = scopeRows.map(({ suffix }) => `work.${suffix}`);
    report.campaigns = [campaign];
    report.work_units = scopeRows.map(({ suffix, scope }) => {
      const attemptId = `attempt.${suffix}`;
      return makeWorkUnit(`work.${suffix}`, campaign.campaign_id, scope, "completed", {
        attempt_ids: [attemptId],
      });
    });
  } else {
    report.campaigns = scopeRows.map(({ suffix, scope }) =>
      makeCampaign(`campaign.${suffix}`, scope, "completed", { work_unit_ids: [`work.${suffix}`] })
    );
    report.work_units = scopeRows.map(({ suffix, scope }) =>
      makeWorkUnit(`work.${suffix}`, `campaign.${suffix}`, scope, "completed", {
        attempt_ids: [`attempt.${suffix}`],
      })
    );
  }

  report.attempts = scopeRows.map(({ suffix, scope }) =>
    makeAttempt(`attempt.${suffix}`, `work.${suffix}`, 1, "succeeded", scope)
  );
  return report;
}

export function failedRetryReport(preserveRecoveryChain: boolean): ScientificReport {
  const report = baseReport();
  const campaign = makeCampaign("campaign.retry", "this_project", "attempted", {
    work_unit_ids: ["work.retry"],
  });
  const unit = makeWorkUnit("work.retry", campaign.campaign_id, "this_project", "attempted", {
    attempt_ids: ["attempt.failed", "attempt.recovery"],
    output_object_ids: ["result.partial"],
  });
  const failed = makeAttempt("attempt.failed", unit.work_unit_id, 1, "failed", "this_project", {
    result_ids: ["result.partial"],
    failure_event_ids: ["failure.compute"],
    usable_output_status: "usable_with_qualification",
    superseded_by_attempt_id: preserveRecoveryChain ? "attempt.recovery" : null,
  });
  const recovery = makeAttempt("attempt.recovery", unit.work_unit_id, 2, "succeeded");
  const failure = makeFailure("failure.compute", unit.work_unit_id, failed.attempt_id, {
    partial_result_ids: ["result.partial"],
    recovery_attempt_ids: preserveRecoveryChain ? [recovery.attempt_id] : [],
  });
  const partialResult = makeResult("result.partial", unit.work_unit_id, {
    attempt_id: failed.attempt_id,
    statement: "The first attempt produced an interpretable early interval before its later compute failure.",
    interpretability_status: "qualified",
    record_disposition: "sensitivity_only",
    disposition_reason: known("Only the pre-failure interval is retained for sensitivity analysis."),
  });

  report.campaigns = [campaign];
  report.work_units = [unit];
  report.attempts = [failed, recovery];
  report.results = [partialResult];
  report.failures = [failure];
  return report;
}

export interface DecisionTimingFixtureOptions {
  decidedAt: string;
  trustworthyTimingSource: boolean;
}

export function decisionTimingReport(options: DecisionTimingFixtureOptions): ScientificReport {
  const report = baseReport();
  if (!options.trustworthyTimingSource) {
    const untrustedSource = makeSourceItem("source.unbound-timing", {
      mappedObjectIds: ["decision.endpoint"],
      title: "Timing note without an integrity digest",
    });
    untrustedSource.content_hash = unknown<`sha256:${string}`>(
      "No content digest was retained for the timing note.",
    );
    report.source_coverage.items.push(untrustedSource);
    reconcileCoverageCounts(report);
  }
  const campaign = makeCampaign("campaign.timing", "this_project", "attempted", {
    work_unit_ids: ["work.timing"],
  });
  const unit = makeWorkUnit("work.timing", campaign.campaign_id, "this_project", "attempted", {
    attempt_ids: ["attempt.timing"],
    decision_event_ids: ["decision.endpoint"],
  });
  const attempt = makeAttempt("attempt.timing", unit.work_unit_id, 1, "running_at_cutoff", "this_project", {
    started_at: known("2026-08-10T00:00:00.000Z"),
  });
  const decision = makeDecision("decision.endpoint", [attempt.attempt_id], {
    decided_at: known(options.decidedAt),
    source_bindings: options.trustworthyTimingSource
      ? [sourceBinding(undefined, "decision_timing")]
      : [sourceBinding("source.unbound-timing", "decision_timing")],
  });

  report.campaigns = [campaign];
  report.work_units = [unit];
  report.attempts = [attempt];
  report.decision_events = [decision];
  return report;
}

export function pooledBiologicalNReport(declaredBiologicalN: number): ScientificReport {
  const report = baseReport();
  const entity = makeEntity("entity.donor-pool", {
    entity_kind: "donor_pool",
    label: known("Pooled donor material"),
  });
  const pool = makeMaterial("material.pool-A", entity.entity_id, {
    material_kind: "pool",
    label: known("Pool A split across two technical measurements"),
  });

  report.entities = [entity];
  report.materials = [pool];
  report.analysis_populations = [
    {
      analysis_population_id: "population.pool-A",
      analysis_population_version: "1.0.0",
      name: "Two measurements from one biological pool",
      population_kind: "quality_control_passed",
      estimand: known("Mean response for Pool A"),
      inclusion_criteria: known(["Measurement passed technical QC"]),
      exclusion_criteria: notApplicable<string[]>("No measurement was excluded."),
      members: [1, 2].map((technicalReplicate) => ({
        member_id: `member.pool-A.tech-${technicalReplicate}`,
        material_id: pool.material_id,
        entity_id: entity.entity_id,
        group_key: known("biological-unit.pool-A"),
        inclusion_status: "included" as const,
        inclusion_reason: known("Technical measurement passed QC."),
        decision_event_ids: [],
        source_bindings: [sourceBinding()],
      })),
      replicate_structure: {
        biological_unit_definition: known("A unique source pool is one biological unit."),
        technical_unit_definition: known("Each repeat measurement of the pool is one technical unit."),
        experimental_unit_definition: known("The pooled sample receiving the assay treatment."),
        observational_unit_definition: known("A recorded technical measurement."),
        analysis_unit_definition: known("The biological pool, not each technical measurement."),
        biological_unit_count: known(declaredBiologicalN),
        technical_unit_count: known(2),
        independence_basis: known("Both measurements share the same pool and are not biologically independent."),
        pool_counting_policy: known("Count each unique pool group key once regardless of technical repeats."),
      },
      decision_event_ids: [],
      lineage_status: "closed",
      source_bindings: [sourceBinding()],
      extensions: {},
    },
  ];
  return report;
}

export function registeredOnlyCompletenessReport(useAbsoluteLanguage: boolean): ScientificReport {
  const report = baseReport();
  report.title = useAbsoluteLanguage
    ? "Fully complete and exhaustive scientific report"
    : "Disposition of registered sources within a bounded report";
  report.source_coverage.authority_basis = "declared_inventory";
  report.source_coverage.enumeration_status = "registered_not_proven_exhaustive";
  report.source_coverage.report_completeness = "registered_sources_accounted_for";
  report.source_coverage.coverage_limitations = [
    "All registered items are dispositioned, but overall project completeness cannot be proved.",
  ];
  return report;
}
