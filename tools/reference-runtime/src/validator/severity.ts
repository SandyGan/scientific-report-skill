import type { SeverityProfile, RuleSeverity } from "../lib/rules.js";
import { severityRank } from "../lib/rules.js";
import type { ValidationFinding } from "./types.js";

export function highestFindingSeverity(
  findings: readonly ValidationFinding[],
): RuleSeverity | null {
  let highest: RuleSeverity | null = null;
  for (const finding of findings) {
    if (highest === null || severityRank(finding.effectiveSeverity) > severityRank(highest)) {
      highest = finding.effectiveSeverity;
    }
  }
  return highest;
}

export function isReleaseBlockingFinding(
  finding: ValidationFinding,
  profile: SeverityProfile,
): boolean {
  return profile.release_gate.fail_on.includes(finding.effectiveSeverity);
}

/** Stable severity-first ordering for CLI, attestation, and review output. */
export function sortValidationFindings(
  findings: readonly ValidationFinding[],
): ValidationFinding[] {
  return [...findings].sort((left, right) => {
    const severity = severityRank(right.effectiveSeverity) - severityRank(left.effectiveSeverity);
    if (severity !== 0) return severity;
    const rule = left.ruleId.localeCompare(right.ruleId, "en");
    if (rule !== 0) return rule;
    const location = left.instancePointer.localeCompare(right.instancePointer, "en");
    if (location !== 0) return location;
    return left.message.localeCompare(right.message, "en");
  });
}
