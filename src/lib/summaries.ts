import type {
  Attempt,
  ExecutionScope,
  ReproducibilityLevel,
  ReproducibilityUnit,
  ScientificReport,
  WorkState,
  WorkUnit,
} from "./types.js";

const REPRODUCIBILITY_LEVELS: ReproducibilityLevel[] = [
  "not_assessed",
  "R0_documented",
  "R1_replay_ready",
  "R2_verified_replay",
  "R3_independent_reproduction",
];

export const reproducibilityLevelOrder = Object.freeze([...REPRODUCIBILITY_LEVELS]);

export interface CoverageFraction {
  covered: number;
  target: number;
  state: "known" | "unknown" | "not_applicable";
  uncoveredIds: string[];
}

export type SummaryValue<T> =
  | { state: "known"; value: T }
  | { state: "unknown"; value: null; reason: string }
  | { state: "not_applicable"; value: null; reason: string };

type ReproAccessStatus = ReproducibilityUnit["access_assessment"]["status"];
type IndependenceOutcome = "computational_met" | "experimental_met" | "failed_or_inconclusive" | "unknown_or_withheld" | "none";

export interface ReproducibilitySummary {
  levelBasis: "declared" | "validator_supported";
  criticalUnitCount: number;
  totalUnitCount: number;
  criticalUnitTargetIds: string[];
  uncoveredCriticalUnitIds: string[];
  criticalLevelDistribution: Record<ReproducibilityLevel, number>;
  allLevelDistribution: Record<ReproducibilityLevel, number>;
  conservativeCriticalLowerBound: SummaryValue<ReproducibilityLevel>;
  criticalClaimCoverage: CoverageFraction;
  criticalOutputCoverage: CoverageFraction;
  accessDistribution: Record<ReproAccessStatus, number>;
  independenceDistribution: Record<IndependenceOutcome, number>;
  unknownOrNotAssessedUnitCount: number;
  incompleteAxisCount: number;
}

function countBy<T extends string>(values: readonly T[], universe: readonly T[]): Record<T, number> {
  const result = Object.fromEntries(universe.map((value) => [value, 0])) as Record<T, number>;
  for (const value of values) result[value] += 1;
  return result;
}

function unknownSummaryValue<T>(reason: string): SummaryValue<T> {
  return { state: "unknown", value: null, reason };
}

function knownSummaryValue<T>(value: T): SummaryValue<T> {
  return { state: "known", value };
}

function coverageFraction(targetIds: Set<string>, coveredIds: Set<string>): CoverageFraction {
  if (targetIds.size === 0) return { covered: 0, target: 0, state: "unknown", uncoveredIds: [] };
  const uncoveredIds = [...targetIds].filter((id) => !coveredIds.has(id)).sort((left, right) => left.localeCompare(right, "en"));
  return {
    covered: targetIds.size - uncoveredIds.length,
    target: targetIds.size,
    state: "known",
    uncoveredIds,
  };
}

interface CoverageDenominatorDecisionRecord {
  critical_unit_membership: "included" | "excluded";
  critical_claim_ids: string[];
  critical_output_ids: string[];
}

function denominatorDecision(unit: ReproducibilityUnit): CoverageDenominatorDecisionRecord | null {
  const candidate = (unit as ReproducibilityUnit & {
    coverage_denominator_decision?: CoverageDenominatorDecisionRecord;
  }).coverage_denominator_decision;
  return candidate ?? null;
}

export interface SummarizeReproducibilityOptions {
  levelOverrides?: ReadonlyMap<string, ReproducibilityLevel>;
  levelBasis?: "declared" | "validator_supported";
  criticalUnitIds?: readonly string[];
  criticalClaimIds?: readonly string[];
  criticalOutputIds?: readonly string[];
}

function independenceOutcome(unit: ReproducibilityUnit): IndependenceOutcome {
  const events = unit.independent_reproduction_events;
  if (events.length === 0) return "none";
  if (events.some((event) => event.reproduction_kind === "computational" && event.independence_assessment === "independent" && event.comparison_result === "met")) {
    return "computational_met";
  }
  if (events.some((event) => event.reproduction_kind === "experimental" && event.independence_assessment === "independent" && event.comparison_result === "met")) {
    return "experimental_met";
  }
  if (events.some((event) => event.comparison_result === "unknown" || event.comparison_result === "withheld" || event.independence_assessment === "unknown" || event.independence_assessment === "withheld")) {
    return "unknown_or_withheld";
  }
  return "failed_or_inconclusive";
}

/**
 * Summarize declared per-unit assessments without averaging them into a score.
 * Validation must independently verify every declared level before the summary
 * may be presented with a validator-supported basis.
 */
export function summarizeReproducibility(
  units: readonly ReproducibilityUnit[],
  options: SummarizeReproducibilityOptions = {},
): ReproducibilitySummary {
  const level = (unit: ReproducibilityUnit): ReproducibilityLevel =>
    options.levelOverrides?.get(unit.reproducibility_unit_id) ?? unit.conservative_level;
  const unitById = new Map(units.map((unit) => [unit.reproducibility_unit_id, unit]));
  const criticalUnitTargetIds = options.criticalUnitIds === undefined
    ? units
        .filter((unit) => denominatorDecision(unit)?.critical_unit_membership !== "excluded")
        .map((unit) => unit.reproducibility_unit_id)
    : [...new Set(options.criticalUnitIds)];
  const uncoveredCriticalUnitIds = criticalUnitTargetIds
    .filter((id) => !unitById.has(id))
    .sort((left, right) => left.localeCompare(right, "en"));
  const critical = criticalUnitTargetIds
    .map((id) => unitById.get(id))
    .filter((unit): unit is ReproducibilityUnit => unit !== undefined);
  const allLevelDistribution = countBy(units.map(level), REPRODUCIBILITY_LEVELS);
  const criticalLevelDistribution = countBy(critical.map(level), REPRODUCIBILITY_LEVELS);

  const conservativeCriticalLowerBound: SummaryValue<ReproducibilityLevel> = uncoveredCriticalUnitIds.length > 0
    ? unknownSummaryValue(`Critical reproducibility units are missing: ${uncoveredCriticalUnitIds.join(", ")}.`)
    : critical.length === 0
      ? unknownSummaryValue("No independent critical-unit denominator is declared; a lower bound cannot be established.")
      : knownSummaryValue(critical.reduce((current, unit) =>
          REPRODUCIBILITY_LEVELS.indexOf(level(unit)) < REPRODUCIBILITY_LEVELS.indexOf(current)
            ? level(unit)
            : current,
        level(critical[0]!)));

  const declaredClaimTargets = units.flatMap((unit) => denominatorDecision(unit)?.critical_claim_ids ?? []);
  const declaredOutputTargets = units.flatMap((unit) => denominatorDecision(unit)?.critical_output_ids ?? []);
  const targetClaims = new Set(options.criticalClaimIds ?? declaredClaimTargets);
  const targetOutputs = new Set(options.criticalOutputIds ?? declaredOutputTargets);
  const coveredClaims = new Set(units.flatMap((unit) => unit.covered_claim_ids));
  const coveredOutputs = new Set(units.flatMap((unit) => unit.covered_output_ids));
  const accessStates: ReproAccessStatus[] = [
    "available_now",
    "verified_procedure",
    "controlled_access",
    "unavailable",
    "unknown",
    "not_applicable",
    "withheld",
  ];
  const independenceStates: IndependenceOutcome[] = [
    "computational_met",
    "experimental_met",
    "failed_or_inconclusive",
    "unknown_or_withheld",
    "none",
  ];
  const incompleteStates = new Set(["partial", "unsatisfied", "unknown", "withheld"]);
  const incompleteAxisCount = units.reduce((total, unit) =>
    total + Object.values(unit.axis_assessments).filter((axis) => incompleteStates.has(axis.state)).length,
  0);

  return {
    levelBasis: options.levelBasis ?? "declared",
    criticalUnitCount: critical.length,
    totalUnitCount: units.length,
    criticalUnitTargetIds: [...criticalUnitTargetIds].sort((left, right) => left.localeCompare(right, "en")),
    uncoveredCriticalUnitIds,
    criticalLevelDistribution,
    allLevelDistribution,
    conservativeCriticalLowerBound,
    criticalClaimCoverage: coverageFraction(targetClaims, coveredClaims),
    criticalOutputCoverage: coverageFraction(targetOutputs, coveredOutputs),
    accessDistribution: countBy(critical.map((unit) => unit.access_assessment.status), accessStates),
    independenceDistribution: countBy(critical.map(independenceOutcome), independenceStates),
    unknownOrNotAssessedUnitCount: critical.filter((unit) =>
      level(unit) === "not_assessed" ||
      Object.values(unit.axis_assessments).some((axis) => axis.state === "unknown" || axis.state === "withheld"),
    ).length,
    incompleteAxisCount,
  };
}

type AttemptOutcome = Attempt["attempt_outcome"];

export interface WorkSummary {
  workUnitsByScope: Record<ExecutionScope, number>;
  completedWorkUnitsByScope: Record<ExecutionScope, number>;
  workUnitsByState: Record<WorkState, number>;
  attemptsByScope: Record<ExecutionScope, number>;
  attemptsByOutcome: Record<AttemptOutcome, number>;
  thisProjectCompleted: { numerator: number; denominator: number; state: "known" | "unknown" };
  reanalysisCompleted: { numerator: number; denominator: number; state: "known" | "unknown" };
  externalCompleted: { numerator: number; denominator: number; state: "known" | "unknown" };
}

const EXECUTION_SCOPES: ExecutionScope[] = [
  "this_project",
  "reanalysis",
  "external_study",
  "upstream_collaborator",
  "synthetic",
];
const WORK_STATES: WorkState[] = ["planned", "attempted", "completed", "not_performed", "unknown"];
const ATTEMPT_OUTCOMES: AttemptOutcome[] = [
  "succeeded",
  "partially_succeeded",
  "failed",
  "aborted",
  "cancelled_after_start",
  "running_at_cutoff",
  "outcome_unknown",
];

function completionFraction(
  workUnits: readonly WorkUnit[],
  scopes: readonly ExecutionScope[],
): { numerator: number; denominator: number; state: "known" | "unknown" } {
  const inScope = workUnits.filter((unit) => scopes.includes(unit.execution_scope));
  return {
    numerator: inScope.filter((unit) => unit.work_state === "completed").length,
    denominator: inScope.length,
    state: inScope.length === 0 ? "unknown" : "known",
  };
}

/** Count only WorkUnit records as work units; attempts and segments remain separate denominators. */
export function summarizeWork(report: Pick<ScientificReport, "work_units" | "attempts">): WorkSummary {
  return {
    workUnitsByScope: countBy(report.work_units.map((unit) => unit.execution_scope), EXECUTION_SCOPES),
    completedWorkUnitsByScope: countBy(
      report.work_units.filter((unit) => unit.work_state === "completed").map((unit) => unit.execution_scope),
      EXECUTION_SCOPES,
    ),
    workUnitsByState: countBy(report.work_units.map((unit) => unit.work_state), WORK_STATES),
    attemptsByScope: countBy(report.attempts.map((attempt) => attempt.execution_scope), EXECUTION_SCOPES),
    attemptsByOutcome: countBy(report.attempts.map((attempt) => attempt.attempt_outcome), ATTEMPT_OUTCOMES),
    thisProjectCompleted: completionFraction(report.work_units, ["this_project"]),
    reanalysisCompleted: completionFraction(report.work_units, ["reanalysis"]),
    externalCompleted: completionFraction(report.work_units, ["external_study", "upstream_collaborator"]),
  };
}
