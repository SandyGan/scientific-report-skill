import type { SchemaRepository, SchemaIssue } from "../lib/schema.js";
import type { JsonValue } from "../lib/json.js";
import type { RuleSeverity } from "../lib/rules.js";
import { asJsonObject, finding, makeInternalRule, pointer } from "./context.js";
import type { SemanticContext, ValidationFinding } from "./types.js";

export const DOMAIN_PACK_RULE = makeInternalRule(
  "PACK001",
  "Domain-pack payload or activation is inconsistent",
  "blocker",
  "/extensions/domain_payloads",
  "An applied domain module lacks a schema-valid payload, or a payload lacks its applied manifest entry.",
  "Bind exactly identified domain payloads to applied module-manifest entries and validate each payload against its declared pack schema.",
  "domain_overlay",
);

export interface DomainValidationResult {
  payloads: unknown[];
  activeDomains: Set<string>;
  findings: ValidationFinding[];
}

function reportDomainPayloads(context: SemanticContext): unknown[] {
  const value = context.report.extensions.domain_payloads;
  return Array.isArray(value) ? value : [];
}

function schemaIssueDetails(issues: SchemaIssue[]): JsonValue {
  return issues.map((issue) => ({
    instance_pointer: issue.instancePointer,
    schema_pointer: issue.schemaPointer,
    keyword: issue.keyword,
    message: issue.message,
  }));
}

export function validateDomainPacks(
  context: SemanticContext,
  repository: SchemaRepository,
  additionalPayloads: readonly unknown[] = [],
  severity: RuleSeverity = "blocker",
): DomainValidationResult {
  const extensionPayloadValue = context.report.extensions.domain_payloads;
  const payloads = [...reportDomainPayloads(context), ...additionalPayloads];
  const activeDomains = new Set<string>();
  const findings: ValidationFinding[] = [];
  if (extensionPayloadValue !== undefined && !Array.isArray(extensionPayloadValue)) {
    findings.push(finding({
      rule: DOMAIN_PACK_RULE,
      effectiveSeverity: severity,
      category: "domain_overlay",
      pointer: "/extensions/domain_payloads",
      message: "Reserved domain_payloads extension must be an array when present.",
    }));
  }
  const payloadIds = new Map<string, number[]>();
  const payloadDomains = new Map<string, number[]>();

  payloads.forEach((payload, index) => {
    const record = asJsonObject(payload);
    if (record === null) {
      findings.push(finding({ rule: DOMAIN_PACK_RULE, effectiveSeverity: severity, category: "domain_overlay", pointer: pointer("extensions", "domain_payloads", index), message: "Domain payload is not a JSON object." }));
      return;
    }
    const payloadId = record.payload_id;
    const domain = record.domain;
    if (typeof payloadId === "string") {
      const positions = payloadIds.get(payloadId) ?? [];
      positions.push(index);
      payloadIds.set(payloadId, positions);
    }
    if (typeof domain !== "string") {
      findings.push(finding({ rule: DOMAIN_PACK_RULE, effectiveSeverity: severity, category: "domain_overlay", pointer: pointer("extensions", "domain_payloads", index, "domain"), message: "Domain payload has no string domain discriminator." }));
      return;
    }
    const positions = payloadDomains.get(domain) ?? [];
    positions.push(index);
    payloadDomains.set(domain, positions);
    const overlay = context.ruleSet.overlays.find(
      (candidate) => candidate.applicability.payload_discriminator_value === domain,
    );
    const schemaId = overlay?.payload_schema_id;
    if (schemaId === undefined || !repository.has(schemaId)) {
      findings.push(finding({ rule: DOMAIN_PACK_RULE, effectiveSeverity: severity, category: "domain_overlay", pointer: pointer("extensions", "domain_payloads", index, "domain"), affectedObjectIds: typeof payloadId === "string" ? [payloadId] : [], message: `No compiled domain overlay and canonical payload schema are registered for ${domain}.` }));
      return;
    }
    const validation = repository.validate(schemaId, payload);
    if (!validation.valid) {
      findings.push(finding({ rule: DOMAIN_PACK_RULE, effectiveSeverity: severity, category: "domain_overlay", pointer: pointer("extensions", "domain_payloads", index), affectedObjectIds: typeof payloadId === "string" ? [payloadId] : [], message: `Domain payload ${String(payloadId)} fails ${domain} pack schema validation (${validation.issues.length} issue(s)).`, details: schemaIssueDetails(validation.issues) }));
    }
  });

  for (const [payloadId, indexes] of payloadIds) {
    if (indexes.length > 1) findings.push(finding({ rule: DOMAIN_PACK_RULE, effectiveSeverity: severity, category: "domain_overlay", pointer: "/extensions/domain_payloads", affectedObjectIds: [payloadId], message: `Domain payload_id ${payloadId} is repeated at indexes ${indexes.join(", ")}.` }));
  }

  for (const overlay of context.ruleSet.overlays) {
    const token = overlay.applicability.module_manifest_token;
    const applied = context.report.module_manifest.some(
      (module) => module.module_id === token && module.status === "enabled",
    );
    const payloadIndexes = payloadDomains.get(overlay.applicability.payload_discriminator_value) ?? [];
    if (applied) activeDomains.add(overlay.domain);
    if (applied && payloadIndexes.length === 0) {
      findings.push(finding({ rule: DOMAIN_PACK_RULE, effectiveSeverity: severity, category: "domain_overlay", pointer: "/module_manifest", affectedObjectIds: [token], message: `Applied domain module ${token} has no ${overlay.domain} payload.` }));
    }
    if (!applied && payloadIndexes.length > 0) {
      const ids = payloadIndexes
        .map((index) => asJsonObject(payloads[index])?.payload_id)
        .filter((id): id is string => typeof id === "string");
      findings.push(finding({ rule: DOMAIN_PACK_RULE, effectiveSeverity: severity, category: "domain_overlay", pointer: "/extensions/domain_payloads", affectedObjectIds: ids, message: `${overlay.domain} payload exists without an applied ${token} module-manifest entry.` }));
    }
  }

  return { payloads, activeDomains, findings };
}
