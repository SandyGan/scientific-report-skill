import { findAbsoluteFilesystemReferences } from "../lib/absolute-path.js";
import type { JsonObject, JsonValue } from "../lib/json.js";
import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import { asJsonObject, finding, pointer } from "./context.js";
import type { SemanticContext, ValidationFinding } from "./types.js";

interface LocatedValue {
  path: string;
  key: string;
  value: JsonValue;
  parent: JsonObject;
}

function locatedValues(value: unknown, root = ""): LocatedValue[] {
  const located: LocatedValue[] = [];
  const seen = new Set<object>();
  const walk = (candidate: unknown, path: string): void => {
    if (candidate === null || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((child, index) => walk(child, `${path}/${index}`));
      return;
    }
    const record = candidate as JsonObject;
    for (const [key, child] of Object.entries(record)) {
      const escaped = key.replaceAll("~", "~0").replaceAll("/", "~1");
      const childPath = `${path}/${escaped}`;
      located.push({ path: childPath, key, value: child as JsonValue, parent: record });
      walk(child, childPath);
    }
  };
  walk(value, root);
  return located;
}

function textValues(value: unknown): Array<LocatedValue & { value: string }> {
  return locatedValues(value).filter((item): item is LocatedValue & { value: string } => typeof item.value === "string");
}

function extensionFlag(context: SemanticContext, keys: ReadonlySet<string>): LocatedValue[] {
  return locatedValues(context.report.extensions, "/extensions").filter((item) => keys.has(item.key));
}

function isAffirmative(value: JsonValue): boolean {
  return value === true || (typeof value === "string" && /^(?:yes|true|complete|eligible|published|release[_ -]?eligible|strengthened|changed)$/iu.test(value.trim()));
}

function projectionIntegrityFindings(
  context: SemanticContext,
  rule: RuleDefinition,
  severity: RuleSeverity,
): ValidationFinding[] {
  if (context.report.payload_role !== "public_projection") return [];
  const verification = context.projectionVerification;
  if (verification === null || verification.valid) return [];
  return [finding({
    rule,
    effectiveSeverity: severity,
    pointer: "/disclosure_state/projection_id",
    affectedObjectIds: [context.report.report_id],
    message: `The claimed public projection is not an integrity-preserving transformation of its canonical source (${verification.issues.length} issue(s)).`,
    details: {
      projection_issues: verification.issues.map((issue) => ({
        code: issue.code,
        pointer: issue.pointer,
        message: issue.message,
      })),
    },
  })];
}

const SECRET_PATTERN = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:password|passwd|secret|access[_ -]?token|auth[_ -]?token|api[_ -]?key)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/iu;

export function evaluateRED001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const located of textValues(context.report)) {
    if (SECRET_PATTERN.test(located.value)) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: located.path,
        affectedObjectIds: [context.report.report_id],
        message: "Public scientific payload contains a credential- or secret-shaped value.",
      }));
    }
    const locatorType = located.key === "value" && typeof located.parent.locator_type === "string"
      ? located.parent.locator_type
      : undefined;
    const pathMatches = findAbsoluteFilesystemReferences(located.value, {
      fieldName: located.key,
      instancePointer: located.path,
      ...(locatorType === undefined ? {} : { locatorType }),
    });
    if (pathMatches.length > 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: located.path,
        affectedObjectIds: [context.report.report_id],
        message: `Public scientific payload contains ${pathMatches.length} host-local absolute filesystem reference(s).`,
        details: {
          matches: pathMatches.map((match) => ({ kind: match.kind, value: match.value, index: match.index })),
        },
      }));
    }
  }
  context.report.source_coverage.items.forEach((source, index) => {
    if (source.disclosure_class === "restricted" || source.disclosure_class === "secret") {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("source_coverage", "items", index, "disclosure_class"),
        affectedObjectIds: [source.source_item_id],
        message: `Public payload retains a ${source.disclosure_class} source item rather than an authorized non-revealing projection.`,
      }));
    }
  });
  context.report.artifacts.forEach((artifact, index) => {
    if (artifact.disclosure_class === "restricted" || artifact.disclosure_class === "secret") {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("artifacts", index, "disclosure_class"),
        affectedObjectIds: [artifact.artifact_id],
        message: `Public payload retains a ${artifact.disclosure_class} artifact record whose metadata can disclose protected material.`,
      }));
    }
  });
  context.report.materials.forEach((material, index) => {
    if (material.disclosure_class === "restricted" || material.disclosure_class === "secret") {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("materials", index, "disclosure_class"),
        affectedObjectIds: [material.material_id],
        message: `Public payload retains a ${material.disclosure_class} material record.`,
      }));
    }
  });
  return findings;
}

export function evaluateRED002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = projectionIntegrityFindings(context, rule, severity);
  const decisions = extensionFlag(context, new Set(["protected_required_fields", "withheld_required_fields"]));
  for (const decision of decisions) {
    if (!Array.isArray(decision.value)) continue;
    for (const candidate of decision.value) {
      const record = asJsonObject(candidate);
      if (record === null || typeof record.pointer !== "string") continue;
      if (record.projected_state !== "withheld") {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: decision.path,
          affectedObjectIds: [context.report.report_id],
          message: `Protected required field ${record.pointer} is projected as ${String(record.projected_state)} rather than withheld.`,
        }));
      }
    }
  }
  return findings;
}

export function evaluateRED003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const recoverableKeys = new Set([
    "original_value_hash",
    "protected_value_hash",
    "withheld_value_hash",
    "redaction_token",
    "reversible_redaction_id",
    "private_filename",
    "private_locator",
  ]);
  return extensionFlag(context, recoverableKeys)
    .filter(({ value }) => value !== null && value !== "")
    .map(({ path }) => finding({
      rule,
      effectiveSeverity: severity,
      pointer: path,
      affectedObjectIds: [context.report.report_id],
      message: "Public redaction metadata contains a token, digest, filename, or locator that can reveal or correlate protected content.",
    }));
}

export function evaluateRED004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const semanticChangeKeys = new Set([
    "projection_strengthened_claim",
    "projection_changed_epistemic_state",
    "projection_changed_scientific_meaning",
    "scientific_change_during_projection",
  ]);
  return [
    ...projectionIntegrityFindings(context, rule, severity),
    ...extensionFlag(context, semanticChangeKeys)
      .filter(({ value }) => isAffirmative(value))
      .map(({ path }) => finding({
        rule,
        effectiveSeverity: severity,
        pointer: path,
        affectedObjectIds: [context.report.report_id],
        message: "Disclosure metadata declares that projection strengthened a claim or changed a non-disclosure scientific state.",
      })),
  ];
}

const ACTIVE_MARKUP = /<\s*(?:script|iframe|object|embed|link|style|svg)\b|\bon\w+\s*=|\b(?:javascript|data\s*:\s*text\/html)\s*:/iu;
const REMOTE_ACTIVE_KEYS = new Set(["script_src", "stylesheet_url", "remote_asset_url", "remote_font_url", "analytics_url", "network_endpoint"]);

export function evaluateRED005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const located of textValues(context.report)) {
    if (ACTIVE_MARKUP.test(located.value)) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: located.path,
        affectedObjectIds: [context.report.report_id],
        message: "Public scientific payload contains active markup or a dangerous executable URL scheme.",
      }));
    }
    if (REMOTE_ACTIVE_KEYS.has(located.key) && /^(?:https?:)?\/\//iu.test(located.value.trim())) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: located.path,
        affectedObjectIds: [context.report.report_id],
        message: "Public scientific payload declares an active remote script, style, font, analytics, or network dependency.",
      }));
    }
  }
  return findings;
}

export function evaluateRED006(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const releaseClaims = extensionFlag(context, new Set(["release_eligible", "release_status", "publication_status"]))
    .filter(({ value }) => isAffirmative(value));
  if (releaseClaims.length === 0) return [];
  const unevaluated = extensionFlag(context, new Set(["unevaluated_disclosure_checks", "unknown_disclosure_checks", "failed_disclosure_checks"]))
    .filter(({ value }) =>
      value === true ||
      (Array.isArray(value) && value.length > 0) ||
      (typeof value === "number" && value > 0) ||
      (typeof value === "string" && value.trim() !== "" && value !== "none"),
    );
  return unevaluated.map(({ path, value }) => finding({
    rule,
    effectiveSeverity: severity,
    pointer: path,
    affectedObjectIds: [context.report.report_id],
    message: "Payload metadata asserts release while one or more disclosure checks are failed, unknown, or unevaluated.",
    details: { declared_state: value },
  }));
}
