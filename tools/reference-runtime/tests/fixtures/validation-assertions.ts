import type { ScientificReport } from "../../src/lib/types.js";
import { validateReport } from "../../src/validator/index.js";
import type { RuleEvaluation, ValidationFinding, ValidationResult } from "../../src/validator/types.js";
import { FIXTURE_NOW } from "./base-report.js";

export function validateSelected(
  report: ScientificReport,
  selectedRuleIds: string[],
): ValidationResult {
  return validateReport(report, {
    now: FIXTURE_NOW,
    selectedRuleIds,
    validateDomainPacks: false,
  });
}

export function evaluationFor(result: ValidationResult, ruleId: string): RuleEvaluation {
  const evaluation = result.evaluations.find((candidate) => candidate.rule.id === ruleId);
  if (evaluation === undefined) throw new Error(`Validation result omitted expected rule ${ruleId}`);
  return evaluation;
}

export function findingsFor(result: ValidationResult, ruleId: string): ValidationFinding[] {
  return result.findings.filter((finding) => finding.ruleId === ruleId);
}
