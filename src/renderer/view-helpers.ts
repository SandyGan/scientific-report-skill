import { isJsonObject, stableStringify } from "./canonical-json.js";
import type { JsonObject, JsonValue } from "./types.js";

export const NOT_RECORDED = "Not recorded";

export function asObject(value: JsonValue | undefined): JsonObject | undefined {
  return value !== undefined && isJsonObject(value) ? value : undefined;
}

export function objectAt(record: JsonObject | undefined, key: string): JsonObject | undefined {
  return record === undefined ? undefined : asObject(record[key]);
}

export function arrayAt(record: JsonObject | undefined, key: string): JsonValue[] {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

export function objectArrayAt(record: JsonObject | undefined, key: string): JsonObject[] {
  return arrayAt(record, key).filter(isJsonObject);
}

export function stringAt(record: JsonObject | undefined, key: string, fallback = NOT_RECORDED): string {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function optionalStringAt(record: JsonObject | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function numberAt(record: JsonObject | undefined, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function identifierList(record: JsonObject | undefined, key: string): string[] {
  return arrayAt(record, key).filter((value): value is string => typeof value === "string");
}

export function joinIdentifiers(values: readonly string[]): string {
  return values.length === 0 ? NOT_RECORDED : values.join(", ");
}

export interface FieldProjection {
  state: string;
  display: string;
  missingReason: string | null;
  provenanceStatus: string;
  value: JsonValue | undefined;
}

/** Present an explicit missingness envelope without collapsing its state. */
export function projectField(value: JsonValue | undefined): FieldProjection {
  const envelope = asObject(value);
  if (envelope !== undefined && typeof envelope.state === "string" && Object.prototype.hasOwnProperty.call(envelope, "value")) {
    const state = envelope.state;
    const missingReason = typeof envelope.missing_reason === "string" ? envelope.missing_reason : null;
    const provenanceStatus = typeof envelope.provenance_status === "string" ? envelope.provenance_status : NOT_RECORDED;
    const raw = envelope.value;
    if (state === "known") {
      return {
        state,
        display: displayJson(raw),
        missingReason,
        provenanceStatus,
        value: raw,
      };
    }
    return {
      state,
      display: `${missingStateLabel(state)}${missingReason === null ? "" : ` — ${missingReason}`}`,
      missingReason,
      provenanceStatus,
      value: raw,
    };
  }

  if (value === undefined || value === null) {
    return { state: "not_recorded", display: NOT_RECORDED, missingReason: null, provenanceStatus: NOT_RECORDED, value };
  }
  return { state: "literal", display: displayJson(value), missingReason: null, provenanceStatus: NOT_RECORDED, value };
}

export function displayField(value: JsonValue | undefined): string {
  return projectField(value).display;
}

export function stateOfField(value: JsonValue | undefined): string {
  return projectField(value).state;
}

export function displayJson(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return NOT_RECORDED;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "None recorded";
    if (value.every((entry) => typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean")) {
      return value.map((entry) => String(entry)).join(", ");
    }
  }
  return stableStringify(value, 0);
}

export function displayDateField(value: JsonValue | undefined): string {
  return displayField(value);
}

export function sourceLocator(bindingsValue: JsonValue | undefined): string {
  if (!Array.isArray(bindingsValue) || bindingsValue.length === 0) return NOT_RECORDED;
  const locators = bindingsValue.filter(isJsonObject).map((binding) => {
    const sourceId = stringAt(binding, "source_item_id");
    const locator = objectAt(binding, "locator");
    if (locator === undefined) return sourceId;
    const type = stringAt(locator, "locator_type");
    const locatorValue = stringAt(locator, "value");
    const parserName = optionalStringAt(locator, "parser_name");
    const parserVersion = optionalStringAt(locator, "parser_version");
    const parser = parserName === null ? "" : `; parser ${parserName}${parserVersion === null ? "" : ` ${parserVersion}`}`;
    return `${sourceId} — ${type}: ${locatorValue}${parser}`;
  });
  return locators.length === 0 ? NOT_RECORDED : locators.join(" | ");
}

export function firstSourceId(bindingsValue: JsonValue | undefined): string {
  if (!Array.isArray(bindingsValue)) return NOT_RECORDED;
  for (const binding of bindingsValue) {
    const object = asObject(binding);
    if (object !== undefined && typeof object.source_item_id === "string") return object.source_item_id;
  }
  return NOT_RECORDED;
}

export function explicitDomain(record: JsonObject | undefined): string {
  if (record === undefined) return "general";
  for (const key of ["domain", "domain_id"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
    const projected = projectField(value);
    if (projected.state === "known" && typeof projected.value === "string" && projected.value.length > 0) return projected.value;
  }
  const extensions = objectAt(record, "extensions");
  if (extensions !== undefined) {
    for (const key of ["domain", "domain_id"] as const) {
      const value = extensions[key];
      if (typeof value === "string" && value.length > 0) return value;
      const projected = projectField(value);
      if (projected.state === "known" && typeof projected.value === "string" && projected.value.length > 0) return projected.value;
    }
  }
  if (typeof record.source_domain === "string" && typeof record.target_domain === "string") {
    return `${record.source_domain} ${record.target_domain}`;
  }
  return "general";
}

export function labelize(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("en"));
}

export function firstIdentifier(record: JsonObject | undefined): string {
  if (record === undefined) return NOT_RECORDED;
  const preferredKeys = [
    "report_id",
    "research_question_id",
    "claim_id",
    "evidence_item_id",
    "work_unit_id",
    "attempt_id",
    "segment_id",
    "method_id",
    "result_id",
    "failure_event_id",
    "artifact_id",
    "entity_id",
    "reproducibility_unit_id",
    "limitation_id",
    "revision_event_id",
    "review_task_id",
    "decision_event_id",
    "argument_step_id",
    "claim_dependency_id",
    "evidence_edge_id",
    "argument_edge_id",
    "bridge_id",
    "conflict_member_edge_id",
    "conflict_set_id",
  ];
  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  for (const [key, value] of Object.entries(record)) {
    if (key.endsWith("_id") && typeof value === "string") return value;
  }
  return NOT_RECORDED;
}

export function compareIdentifiers(left: JsonObject, right: JsonObject): number {
  return firstIdentifier(left).localeCompare(firstIdentifier(right), "en");
}

function missingStateLabel(state: string): string {
  switch (state) {
    case "unknown": return "Unknown";
    case "not_applicable": return "Not applicable";
    case "withheld": return "Withheld";
    default: return labelize(state);
  }
}
