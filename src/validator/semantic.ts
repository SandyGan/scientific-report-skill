import { COMPILED_SEMANTIC_RULE_IDS } from "../lib/rule-support.js";
import { assessExtractionCoverage } from "../lib/source-extraction.js";
import { effectiveSeverity, type RuleDefinition, type RuleSeverity } from "../lib/rules.js";
import type { SchemaRepository } from "../lib/schema.js";
import * as contractRules from "./contract-rules.js";
import { categoryForRule, makeInternalRule } from "./context.js";
import * as domainRules from "./domain-rules.js";
import * as disclosureRules from "./disclosure-rules.js";
import { evaluateBRG001, evaluateCLM001, evaluateCLM002, evaluateCNF001, evaluateDEP001 } from "./claim-rules.js";
import { evaluateDER001 } from "./derivation-rules.js";
import { DOMAIN_PACK_RULE, validateDomainPacks } from "./domain.js";
import { evaluateMAT001 } from "./material-rules.js";
import { evaluateNEG001, evaluateNUL001 } from "./negative-rules.js";
import { MISSINGNESS_RULE, REFERENCE_RULE, runMissingnessValidation, runReferenceValidation } from "./reference.js";
import { evaluateREP001, evaluateREP002, evaluateREP003, evaluateREP004, evaluateREP005 } from "./reproducibility-rules.js";
import { evaluateREV001 } from "./revision-rules.js";
import { evaluateCOV001, evaluateCOV002, evaluateCOV003, evaluateCOV004, evaluateCOV005, evaluateCOV006 } from "./source-rules.js";
import { evaluateTIM001, evaluateTIM002, evaluateTIM003, evaluateTIM004, evaluateTIM005 } from "./timing-rules.js";
import type { RuleEvaluation, SemanticContext, ValidationFinding } from "./types.js";
import { evaluateWRK001, evaluateWRK002, evaluateWRK003, evaluateWRK004 } from "./work-rules.js";

type Evaluator = (
  context: SemanticContext,
  rule: RuleDefinition,
  severity: RuleSeverity,
) => ValidationFinding[];

export const DOMAIN_OVERLAY_COVERAGE_RULE = makeInternalRule(
  "OVERLAY001",
  "Compiled domain-overlay coverage",
  "blocker",
  "/module_manifest",
  "The validator did not load and check every compiled domain overlay.",
  "Load the complete compiled overlay set and validate domain payload activation before asserting release eligibility.",
  "domain_semantics",
);

const REQUIRED_OVERLAY_DOMAINS = new Set(["wet_lab", "ai_ml", "molecular_dynamics"]);

const IMPLEMENTED: Readonly<Record<string, Evaluator>> = {
  COV001: evaluateCOV001,
  COV002: evaluateCOV002,
  COV003: evaluateCOV003,
  COV004: evaluateCOV004,
  COV005: evaluateCOV005,
  COV006: evaluateCOV006,
  WRK001: evaluateWRK001,
  WRK002: evaluateWRK002,
  WRK003: evaluateWRK003,
  WRK004: evaluateWRK004,
  WRK005: contractRules.evaluateWRK005,
  WRK006: contractRules.evaluateWRK006,
  TIM001: evaluateTIM001,
  TIM002: evaluateTIM002,
  TIM003: evaluateTIM003,
  TIM004: evaluateTIM004,
  TIM005: evaluateTIM005,
  MAT001: evaluateMAT001,
  DER001: evaluateDER001,
  CLM001: evaluateCLM001,
  CLM002: evaluateCLM002,
  BRG001: evaluateBRG001,
  DEP001: evaluateDEP001,
  CNF001: evaluateCNF001,
  NUL001: evaluateNUL001,
  NEG001: evaluateNEG001,
  REV001: evaluateREV001,
  RED001: disclosureRules.evaluateRED001,
  RED002: disclosureRules.evaluateRED002,
  RED003: disclosureRules.evaluateRED003,
  RED004: disclosureRules.evaluateRED004,
  RED005: disclosureRules.evaluateRED005,
  RED006: disclosureRules.evaluateRED006,
  REP001: evaluateREP001,
  REP002: evaluateREP002,
  REP003: evaluateREP003,
  REP004: evaluateREP004,
  REP005: evaluateREP005,
  REP006: contractRules.evaluateREP006,
  RES001: contractRules.evaluateRES001,
  RES002: contractRules.evaluateRES002,
  MNF001: contractRules.evaluateMNF001,
  MNF002: contractRules.evaluateMNF002,
  MNF003: contractRules.evaluateMNF003,
  MNF004: contractRules.evaluateMNF004,
  MNF005: contractRules.evaluateMNF005,
  APP001: contractRules.evaluateAPP001,
  APP002: contractRules.evaluateAPP002,
  APP003: contractRules.evaluateAPP003,
  APP004: contractRules.evaluateAPP004,
  APP005: contractRules.evaluateAPP005,
  MOD001: contractRules.evaluateMOD001,
  MOD002: contractRules.evaluateMOD002,
  MOD003: contractRules.evaluateMOD003,
  MOD004: contractRules.evaluateMOD004,
  MOD005: contractRules.evaluateMOD005,
  WET001: domainRules.evaluateWET001,
  WET002: domainRules.evaluateWET002,
  WET003: domainRules.evaluateWET003,
  WET004: domainRules.evaluateWET004,
  AIM001: domainRules.evaluateAIM001,
  AIM002: domainRules.evaluateAIM002,
  AIM003: domainRules.evaluateAIM003,
  AIM004: domainRules.evaluateAIM004,
  AIM005: domainRules.evaluateAIM005,
  MDS001: domainRules.evaluateMDS001,
  MDS002: domainRules.evaluateMDS002,
  MDS003: domainRules.evaluateMDS003,
  MDS004: domainRules.evaluateMDS004,
  MDS005: domainRules.evaluateMDS005,
  WFA001: domainRules.evaluateWFA001,
  WFA002: domainRules.evaluateWFA002,
  WFA003: domainRules.evaluateWFA003,
  WFA004: domainRules.evaluateWFA004,
  WFA005: domainRules.evaluateWFA005,
  WFA006: domainRules.evaluateWFA006,
  AFA001: domainRules.evaluateAFA001,
  AFA002: domainRules.evaluateAFA002,
  AFA003: domainRules.evaluateAFA003,
  AFA004: domainRules.evaluateAFA004,
  AFA005: domainRules.evaluateAFA005,
  MFA001: domainRules.evaluateMFA001,
  MFA002: domainRules.evaluateMFA002,
  MFA003: domainRules.evaluateMFA003,
  MFA004: domainRules.evaluateMFA004,
  MFA005: domainRules.evaluateMFA005,
  EPI001: evaluateCLM001,
  EPI002: evaluateWRK004,
  EPI003: contractRules.evaluateEPI003,
  EPI004: evaluateNEG001,
  EPI005: evaluateWRK003,
  EPI006: evaluateDER001,
  EPI007: (context, rule, severity) => [
    ...evaluateCOV001(context, rule, severity),
    ...evaluateCOV002(context, rule, severity),
  ],
  EPI008: evaluateCNF001,
  EPI009: evaluateREV001,
  EPI010: contractRules.evaluateEPI010,
  EPI011: contractRules.evaluateEPI011,
  EPI012: contractRules.evaluateEPI012,
};

export function assertCompiledEvaluatorCoverage(): void {
  const implemented = Object.keys(IMPLEMENTED).sort();
  const supported = [...COMPILED_SEMANTIC_RULE_IDS].sort();
  const supportedSet = new Set<string>(supported);
  if (implemented.length !== supported.length || implemented.some((id, index) => id !== supported[index])) {
    const missing = supported.filter((id) => !implemented.includes(id));
    const extra = implemented.filter((id) => !supportedSet.has(id));
    throw new Error(`Compiled semantic evaluator support mismatch (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`);
  }
}

function activeDomains(context: SemanticContext): Set<string> {
  const domains = new Set<string>(["core"]);
  for (const overlay of context.ruleSet.overlays) {
    const applied = context.report.module_manifest.some(
      (module) =>
        module.module_id === overlay.applicability.module_manifest_token &&
        module.status === "enabled",
    );
    if (applied) domains.add(overlay.domain);
  }
  if (context.report.cross_domain_bridges.length > 0 || context.report.claims.some((claim) => claim.cross_domain_bridge_ids.length > 0)) domains.add("cross_domain");
  return domains;
}

function artifactApplicable(context: SemanticContext, rule: RuleDefinition): boolean {
  const artifacts = new Set(rule.scope.artifacts);
  if (artifacts.has("scientific_report")) return true;
  if (artifacts.has("public_scientific_report") && context.report.payload_role === "public_projection") return true;
  if (artifacts.has("validation_attestation") && rule.id === "ATT001") return true;
  return false;
}

function ruleApplicable(context: SemanticContext, rule: RuleDefinition, domains: Set<string>): boolean {
  if (!artifactApplicable(context, rule)) return false;
  return rule.scope.domains.some((domain) => {
    if (!domains.has(domain)) return false;
    if (domain === "core" || domain === "cross_domain") return true;
    const overlay = context.ruleSet.overlays.find((candidate) => candidate.domain === domain);
    return overlay !== undefined && overlay.enabled_rule_ids.includes(rule.id);
  });
}

function evaluationForInternal(
  rule: RuleDefinition,
  findings: ValidationFinding[],
): RuleEvaluation {
  return {
    rule,
    category: categoryForRule(rule),
    status: findings.length === 0 ? "pass" : "fail",
    effectiveSeverity: rule.severity,
    findings,
    message: findings.length === 0 ? `${rule.id} automated check passed for the scientific-report scope.` : `${rule.id} produced ${findings.length} finding(s).`,
    automated: true,
    applicable: true,
  };
}

function notRunEvaluation(
  rule: RuleDefinition,
  severity: RuleSeverity,
  message: string,
  automated = IMPLEMENTED[rule.id] !== undefined || rule.id === "ATT001",
): RuleEvaluation {
  return {
    rule,
    category: categoryForRule(rule),
    status: "not_run",
    effectiveSeverity: severity,
    findings: [],
    message,
    automated,
    applicable: true,
  };
}

function extractionPrerequisiteProblems(context: SemanticContext): string[] {
  return context.report.source_coverage.items
    .filter((source) => source.disposition === "included")
    .flatMap((source) => {
      const assessment = assessExtractionCoverage(source);
      return assessment.complete
        ? []
        : [`${source.source_item_id}: ${assessment.problems.join(", ")}`];
    });
}

function prerequisiteNotRun(
  context: SemanticContext,
  rule: RuleDefinition,
  severity: RuleSeverity,
): RuleEvaluation | null {
  if (rule.id === "NEG001" || rule.id === "EPI004") {
    const problems = extractionPrerequisiteProblems(context);
    if (problems.length > 0) {
      return notRunEvaluation(
        rule,
        severity,
        `${rule.id} adverse-content completeness was not run because byte-bound extraction coverage is incomplete (${problems.join("; ")}). No pass is asserted.`,
      );
    }
  }
  if (
    context.report.payload_role === "public_projection" &&
    (rule.id === "RED002" || rule.id === "RED004") &&
    context.projectionVerification === null
  ) {
    return notRunEvaluation(
      rule,
      severity,
      `${rule.id} was not run because the canonical source report and integrity-bound disclosure projection record were not supplied. No pass is asserted.`,
    );
  }
  return null;
}

export interface SemanticValidationOptions {
  repository: SchemaRepository;
  selectedRuleIds?: string[];
  validateDomainPacks?: boolean;
  additionalDomainPackPayloads?: unknown[];
}

export function validateSemantics(
  context: SemanticContext,
  options: SemanticValidationOptions,
): RuleEvaluation[] {
  assertCompiledEvaluatorCoverage();
  const evaluations: RuleEvaluation[] = [];
  evaluations.push(evaluationForInternal(REFERENCE_RULE, runReferenceValidation(context)));
  evaluations.push(evaluationForInternal(MISSINGNESS_RULE, runMissingnessValidation(context.report)));

  const loadedOverlayDomains = new Set(context.ruleSet.overlays.map((overlay) => overlay.domain));
  const missingOverlayDomains = [...REQUIRED_OVERLAY_DOMAINS].filter((domain) => !loadedOverlayDomains.has(domain));
  if (missingOverlayDomains.length === 0) {
    evaluations.push(evaluationForInternal(DOMAIN_OVERLAY_COVERAGE_RULE, []));
  } else {
    evaluations.push(notRunEvaluation(
      DOMAIN_OVERLAY_COVERAGE_RULE,
      "blocker",
      `Compiled domain overlay(s) were not loaded: ${missingOverlayDomains.join(", ")}. No full-domain pass is asserted.`,
      true,
    ));
  }

  if (options.validateDomainPacks !== false) {
    const domain = validateDomainPacks(context, options.repository, options.additionalDomainPackPayloads ?? []);
    evaluations.push(evaluationForInternal(DOMAIN_PACK_RULE, domain.findings));
  } else {
    evaluations.push(notRunEvaluation(
      DOMAIN_PACK_RULE,
      "blocker",
      "PACK001 domain-pack validation was explicitly skipped. No pass is asserted.",
      true,
    ));
  }

  const rules = context.ruleSet.registry.rules;
  const selected = options.selectedRuleIds === undefined ? null : new Set(options.selectedRuleIds);
  if (selected !== null) {
    const known = new Set(rules.map((rule) => rule.id));
    const unknown = [...selected].filter((id) => !known.has(id));
    if (unknown.length > 0) throw new Error(`Unknown selected rule id(s): ${unknown.join(", ")}`);
  }
  const domains = activeDomains(context);
  const profileIncludes = context.ruleSet.profile.includes === "*"
    ? null
    : new Set(context.ruleSet.profile.includes);
  for (const rule of rules) {
    const severity = effectiveSeverity(rule, context.ruleSet.profile);
    if (profileIncludes !== null && !profileIncludes.has(rule.id)) {
      evaluations.push(notRunEvaluation(
        rule,
        severity,
        `${rule.id} is excluded by severity profile ${context.ruleSet.profileName}; no release pass is asserted for the omitted registry rule.`,
      ));
      continue;
    }
    if (selected !== null && !selected.has(rule.id)) {
      evaluations.push(notRunEvaluation(
        rule,
        severity,
        `${rule.id} was skipped by selected-rule validation. No pass is asserted.`,
      ));
      continue;
    }
    const applicable = ruleApplicable(context, rule, domains);
    if (!applicable) {
      evaluations.push({
        rule,
        category: categoryForRule(rule),
        status: "not_applicable",
        effectiveSeverity: severity,
        findings: [],
        message: `${rule.id} does not apply to this scientific-report payload, active domains, or validation artifact scope.`,
        automated: IMPLEMENTED[rule.id] !== undefined,
        applicable: false,
      });
      continue;
    }
    const prerequisite = prerequisiteNotRun(context, rule, severity);
    if (prerequisite !== null) {
      evaluations.push(prerequisite);
      continue;
    }
    const evaluator = IMPLEMENTED[rule.id];
    if (evaluator === undefined) {
      evaluations.push({
        rule,
        category: categoryForRule(rule),
        status: "not_run",
        effectiveSeverity: severity,
        findings: [],
        message: `${rule.id} is applicable but is not yet automated by this validator. No pass is asserted.`,
        automated: false,
        applicable: true,
      });
      continue;
    }
    try {
      const findings = evaluator(context, rule, severity);
      evaluations.push({
        rule,
        category: categoryForRule(rule),
        status: findings.length === 0 ? "pass" : "fail",
        effectiveSeverity: severity,
        findings,
        message: findings.length === 0
          ? `${rule.id} automated check passed for the declared scientific-report scope.`
          : `${rule.id} produced ${findings.length} finding(s).`,
        automated: true,
        applicable: true,
      });
    } catch (error) {
      evaluations.push({
        rule,
        category: categoryForRule(rule),
        status: "error",
        effectiveSeverity: severity,
        findings: [],
        message: `${rule.id} evaluation errored: ${error instanceof Error ? error.message : String(error)}`,
        automated: true,
        applicable: true,
      });
    }
  }
  return evaluations;
}

export function automatedRuleIds(): string[] {
  return Object.keys(IMPLEMENTED).sort();
}
