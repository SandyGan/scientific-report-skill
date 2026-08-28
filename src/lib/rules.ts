import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { parse } from "yaml";

import { sha256 } from "./hash.js";
import { projectPaths } from "./project-paths.js";
import { assertCompiledRuleContracts } from "./rule-support.js";

export type RuleSeverity = "information" | "warning" | "error" | "blocker";

export interface RuleScope {
  artifacts: string[];
  domains: string[];
  phases: string[];
}

export interface RuleWaiverPolicy {
  allowed: boolean;
  rationale?: string;
  maximum_severity_after_waiver?: RuleSeverity;
  requirements?: string[];
}

export interface RuleDefinition {
  id: string;
  title: string;
  scope: RuleScope;
  severity: RuleSeverity;
  condition: string;
  pointer_hint: string;
  message: string;
  remediation: string;
  waiver_policy: RuleWaiverPolicy;
}

export interface RuleRegistry {
  registry_version: string;
  schema_version: string;
  authority: string;
  description: string;
  expression_language: Record<string, unknown>;
  severity_order: RuleSeverity[];
  waiver_contract: Record<string, unknown>;
  epistemic_input_policy: Record<string, unknown>;
  rules: RuleDefinition[];
}

export interface ReleaseGate {
  fail_on: RuleSeverity[];
  publishable?: boolean;
  allow_open_waived_findings: boolean;
  require_waiver_contract: boolean;
  require_zero_non_waivable_failures: boolean;
  [key: string]: unknown;
}

export interface SeverityProfile {
  description: string;
  includes: "*" | string[];
  severity_overrides: Record<string, RuleSeverity>;
  release_gate: ReleaseGate;
  output: Record<string, unknown>;
}

export interface SeverityProfiles {
  profiles_version: string;
  schema_version: string;
  registry: string;
  description: string;
  severity_order: RuleSeverity[];
  invariants: Record<string, unknown>;
  profiles: Record<string, SeverityProfile>;
}

export interface DomainOverlay {
  overlay_version: string;
  schema_version: string;
  overlay_id: string;
  registry: string;
  domain: string;
  payload_schema: string;
  payload_schema_id: string;
  description: string;
  applicability: {
    module_manifest_token: string;
    payload_collection_pointer: string;
    payload_discriminator_pointer: string;
    payload_discriminator_value: string;
    behavior: Record<string, unknown>;
  };
  missingness_contract: Record<string, unknown>;
  required_sections: string[];
  enabled_rule_ids: string[];
  evaluation_bindings: Record<string, unknown>;
  cross_domain_exports: Record<string, unknown>;
}

export interface LoadedRuleSet {
  registry: RuleRegistry;
  profiles: SeverityProfiles;
  profileName: string;
  profile: SeverityProfile;
  overlays: DomainOverlay[];
  registryPath: string;
  profilesPath: string;
  overlayPaths: string[];
  rawRegistryHash: ReturnType<typeof sha256>;
  rawProfilesHash: ReturnType<typeof sha256>;
}

function requireRecord(value: unknown, source: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${source} must contain a YAML mapping at its root`);
  }
  return value as Record<string, unknown>;
}

function readYamlRecord(path: string): { parsed: Record<string, unknown>; raw: string } {
  const raw = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = parse(raw, { prettyErrors: true, strict: true, uniqueKeys: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SyntaxError(`Unable to parse YAML ${path}: ${message}`);
  }
  return { parsed: requireRecord(parsed, path), raw };
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`);
}

function assertStringArray(value: unknown, name: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new TypeError(`${name} must be an array of non-empty strings`);
  }
}

const SEVERITIES = new Set<RuleSeverity>(["information", "warning", "error", "blocker"]);

function isSeverity(value: unknown): value is RuleSeverity {
  return typeof value === "string" && SEVERITIES.has(value as RuleSeverity);
}

function validateRegistry(record: Record<string, unknown>, source: string): RuleRegistry {
  assertString(record.registry_version, `${source}: registry_version`);
  assertString(record.schema_version, `${source}: schema_version`);
  assertString(record.authority, `${source}: authority`);
  if (
    !Array.isArray(record.severity_order) ||
    record.severity_order.length !== SEVERITIES.size ||
    record.severity_order.some((severity) => !isSeverity(severity)) ||
    new Set(record.severity_order).size !== SEVERITIES.size
  ) {
    throw new TypeError(`${source}: severity_order must list each supported severity exactly once`);
  }
  if (!Array.isArray(record.rules)) throw new TypeError(`${source}: rules must be an array`);

  const seen = new Set<string>();
  for (const [index, rawRule] of record.rules.entries()) {
    const rule = requireRecord(rawRule, `${source}: rules[${index}]`);
    assertString(rule.id, `${source}: rules[${index}].id`);
    if (seen.has(rule.id)) throw new TypeError(`${source}: duplicate rule id ${rule.id}`);
    seen.add(rule.id);
    for (const key of ["title", "condition", "pointer_hint", "message", "remediation"] as const) {
      assertString(rule[key], `${source}: rule ${rule.id}.${key}`);
    }
    if (!isSeverity(rule.severity)) throw new TypeError(`${source}: rule ${rule.id} has invalid severity`);
    const scope = requireRecord(rule.scope, `${source}: rule ${rule.id}.scope`);
    assertStringArray(scope.artifacts, `${source}: rule ${rule.id}.scope.artifacts`);
    assertStringArray(scope.domains, `${source}: rule ${rule.id}.scope.domains`);
    assertStringArray(scope.phases, `${source}: rule ${rule.id}.scope.phases`);
    const waiver = requireRecord(rule.waiver_policy, `${source}: rule ${rule.id}.waiver_policy`);
    if (typeof waiver.allowed !== "boolean") {
      throw new TypeError(`${source}: rule ${rule.id}.waiver_policy.allowed must be boolean`);
    }
  }

  return record as unknown as RuleRegistry;
}

function validateProfiles(record: Record<string, unknown>, source: string, registry: RuleRegistry): SeverityProfiles {
  assertString(record.profiles_version, `${source}: profiles_version`);
  if (!Array.isArray(record.severity_order) || record.severity_order.some((severity) => !isSeverity(severity))) {
    throw new TypeError(`${source}: severity_order contains an unsupported severity`);
  }
  const profiles = requireRecord(record.profiles, `${source}: profiles`);
  const registryIds = new Set(registry.rules.map((rule) => rule.id));
  const rank = new Map(registry.severity_order.map((severity, index) => [severity, index]));

  for (const [name, rawProfile] of Object.entries(profiles)) {
    const profile = requireRecord(rawProfile, `${source}: profile ${name}`);
    if (profile.includes !== "*") {
      assertStringArray(profile.includes, `${source}: profile ${name}.includes`);
      for (const ruleId of profile.includes) {
        if (!registryIds.has(ruleId)) throw new TypeError(`${source}: profile ${name} includes unknown rule ${ruleId}`);
      }
    }
    const releaseGate = requireRecord(profile.release_gate, `${source}: profile ${name}.release_gate`);
    if (!Array.isArray(releaseGate.fail_on) || releaseGate.fail_on.some((severity) => !isSeverity(severity))) {
      throw new TypeError(`${source}: profile ${name}.release_gate.fail_on contains an unsupported severity`);
    }
    for (const key of ["allow_open_waived_findings", "require_waiver_contract", "require_zero_non_waivable_failures"] as const) {
      if (typeof releaseGate[key] !== "boolean") {
        throw new TypeError(`${source}: profile ${name}.release_gate.${key} must be boolean`);
      }
    }
    const supportedReleaseGateKeys = new Set([
      "fail_on",
      "publishable",
      "allow_open_waived_findings",
      "require_waiver_contract",
      "require_zero_non_waivable_failures",
      "require_attestation_rule",
      "require_disclosure_rules",
      "require_accessibility_rule",
      "require_external_attestation",
      "require_fresh_rerun_evidence_for_claimed_reruns",
    ]);
    const unknownGateKeys = Object.keys(releaseGate).filter((key) => !supportedReleaseGateKeys.has(key));
    if (unknownGateKeys.length > 0) {
      throw new TypeError(`${source}: profile ${name}.release_gate contains unsupported prerequisite(s): ${unknownGateKeys.join(", ")}`);
    }
    if (releaseGate.publishable !== undefined && typeof releaseGate.publishable !== "boolean") {
      throw new TypeError(`${source}: profile ${name}.release_gate.publishable must be boolean`);
    }
    for (const key of ["require_attestation_rule", "require_accessibility_rule"] as const) {
      if (releaseGate[key] !== undefined) {
        assertString(releaseGate[key], `${source}: profile ${name}.release_gate.${key}`);
        if (!registryIds.has(releaseGate[key])) {
          throw new TypeError(`${source}: profile ${name}.release_gate.${key} references unknown rule ${releaseGate[key]}`);
        }
      }
    }
    if (releaseGate.require_disclosure_rules !== undefined) {
      assertStringArray(releaseGate.require_disclosure_rules, `${source}: profile ${name}.release_gate.require_disclosure_rules`);
      for (const ruleId of releaseGate.require_disclosure_rules) {
        if (!registryIds.has(ruleId)) throw new TypeError(`${source}: profile ${name} requires unknown disclosure rule ${ruleId}`);
      }
    }
    for (const key of ["require_external_attestation", "require_fresh_rerun_evidence_for_claimed_reruns"] as const) {
      if (releaseGate[key] !== undefined && typeof releaseGate[key] !== "boolean") {
        throw new TypeError(`${source}: profile ${name}.release_gate.${key} must be boolean`);
      }
    }
    requireRecord(profile.output, `${source}: profile ${name}.output`);
    const overrides = requireRecord(profile.severity_overrides, `${source}: profile ${name}.severity_overrides`);
    for (const [ruleId, severity] of Object.entries(overrides)) {
      if (!registryIds.has(ruleId)) throw new TypeError(`${source}: profile ${name} references unknown rule ${ruleId}`);
      if (!isSeverity(severity)) throw new TypeError(`${source}: profile ${name} has invalid severity for ${ruleId}`);
      const base = registry.rules.find((rule) => rule.id === ruleId)!.severity;
      if ((rank.get(severity) ?? -1) < (rank.get(base) ?? -1)) {
        throw new TypeError(`${source}: profile ${name} illegally downgrades ${ruleId}`);
      }
    }
  }
  return record as unknown as SeverityProfiles;
}

function validateOverlay(record: Record<string, unknown>, source: string, registry: RuleRegistry): DomainOverlay {
  for (const key of ["overlay_version", "schema_version", "overlay_id", "registry", "domain", "payload_schema", "payload_schema_id", "description"] as const) {
    assertString(record[key], `${source}: ${key}`);
  }
  assertStringArray(record.required_sections, `${source}: required_sections`);
  assertStringArray(record.enabled_rule_ids, `${source}: enabled_rule_ids`);
  const ids = new Set(registry.rules.map((rule) => rule.id));
  for (const id of record.enabled_rule_ids) {
    if (!ids.has(id)) throw new TypeError(`${source}: overlay references unknown rule ${id}`);
  }
  requireRecord(record.applicability, `${source}: applicability`);
  return record as unknown as DomainOverlay;
}

export interface LoadRuleRegistryOptions {
  projectRoot?: string;
  path?: string;
}

export function loadRuleRegistry(options: LoadRuleRegistryOptions = {}): RuleRegistry {
  const paths = projectPaths(options.projectRoot);
  const path = resolve(options.path ?? join(paths.rules, "registry.yaml"));
  const registry = validateRegistry(readYamlRecord(path).parsed, path);
  assertCompiledRuleContracts(registry);
  return registry;
}

export interface LoadSeverityProfilesOptions {
  projectRoot?: string;
  path?: string;
  registry?: RuleRegistry;
}

export function loadSeverityProfiles(options: LoadSeverityProfilesOptions = {}): SeverityProfiles {
  const paths = projectPaths(options.projectRoot);
  const path = resolve(options.path ?? join(paths.rules, "severity-profiles.yaml"));
  const registry = options.registry ?? loadRuleRegistry({ projectRoot: paths.root });
  return validateProfiles(readYamlRecord(path).parsed, path, registry);
}

export interface LoadDomainOverlaysOptions {
  projectRoot?: string;
  paths?: string[];
  registry?: RuleRegistry;
}

export function loadDomainOverlays(options: LoadDomainOverlaysOptions = {}): DomainOverlay[] {
  const project = projectPaths(options.projectRoot);
  const registry = options.registry ?? loadRuleRegistry({ projectRoot: project.root });
  const paths = options.paths ?? ["wet-lab.yaml", "ai-ml.yaml", "molecular-dynamics.yaml"].map((name) =>
    join(project.rules, "domain-overlays", name),
  );
  const overlays = paths.map((path) => {
    const resolvedPath = resolve(path);
    return validateOverlay(readYamlRecord(resolvedPath).parsed, resolvedPath, registry);
  });
  assertCompiledRuleContracts(registry, overlays);
  return overlays;
}

export interface LoadRuleSetOptions {
  projectRoot?: string;
  registryPath?: string;
  severityProfilesPath?: string;
  profile?: string;
  overlayPaths?: string[];
  loadDefaultOverlays?: boolean;
}

export function loadRuleSet(options: LoadRuleSetOptions = {}): LoadedRuleSet {
  const paths = projectPaths(options.projectRoot);
  const registryPath = resolve(options.registryPath ?? join(paths.rules, "registry.yaml"));
  const profilesPath = resolve(options.severityProfilesPath ?? join(paths.rules, "severity-profiles.yaml"));
  const registrySource = readYamlRecord(registryPath);
  const registry = validateRegistry(registrySource.parsed, registryPath);
  const profilesSource = readYamlRecord(profilesPath);
  const profiles = validateProfiles(profilesSource.parsed, profilesPath, registry);
  const profileName = options.profile ?? "standard";
  const profile = profiles.profiles[profileName];
  if (profile === undefined) throw new Error(`Unknown severity profile: ${profileName}`);

  const defaultOverlayPaths = ["wet-lab.yaml", "ai-ml.yaml", "molecular-dynamics.yaml"].map((name) =>
    join(paths.rules, "domain-overlays", name),
  );
  const overlayPaths = (options.overlayPaths ?? (options.loadDefaultOverlays === false ? [] : defaultOverlayPaths)).map((path) => resolve(path));
  const overlays = overlayPaths.map((path) => validateOverlay(readYamlRecord(path).parsed, path, registry));
  assertCompiledRuleContracts(registry, overlays);

  return {
    registry,
    profiles,
    profileName,
    profile,
    overlays,
    registryPath,
    profilesPath,
    overlayPaths,
    rawRegistryHash: sha256(registrySource.raw),
    rawProfilesHash: sha256(profilesSource.raw),
  };
}

export function effectiveSeverity(rule: RuleDefinition, profile: SeverityProfile): RuleSeverity {
  return profile.severity_overrides[rule.id] ?? rule.severity;
}

export function severityRank(severity: RuleSeverity): number {
  return ["information", "warning", "error", "blocker"].indexOf(severity);
}
