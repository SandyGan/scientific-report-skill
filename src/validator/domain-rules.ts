import type { JsonObject, JsonValue } from "../lib/json.js";
import type { RuleDefinition, RuleSeverity } from "../lib/rules.js";
import { asJsonObject, finding, pointer } from "./context.js";
import type { SemanticContext, ValidationFinding } from "./types.js";

interface LocatedPayload {
  payload: JsonObject;
  index: number;
}

interface LocatedRecord {
  record: JsonObject;
  payloadIndex: number;
  recordIndex: number;
  collection: string;
}

function domainPayloads(context: SemanticContext, domain: string): LocatedPayload[] {
  const value = context.report.extensions.domain_payloads;
  if (!Array.isArray(value)) return [];
  const payloads: LocatedPayload[] = [];
  value.forEach((candidate, index) => {
    const payload = asJsonObject(candidate);
    if (payload?.domain === domain) payloads.push({ payload, index });
  });
  return payloads;
}

function records(payloads: readonly LocatedPayload[], collection: string): LocatedRecord[] {
  const result: LocatedRecord[] = [];
  for (const { payload, index: payloadIndex } of payloads) {
    const value = payload[collection];
    if (!Array.isArray(value)) continue;
    value.forEach((candidate, recordIndex) => {
      const record = asJsonObject(candidate);
      if (record !== null) result.push({ record, payloadIndex, recordIndex, collection });
    });
  }
  return result;
}

function recordPointer(located: LocatedRecord, ...tokens: Array<string | number>): string {
  return pointer("extensions", "domain_payloads", located.payloadIndex, located.collection, located.recordIndex, ...tokens);
}

function stringId(record: JsonObject, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return undefined;
}

function stringArray(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function field(value: JsonValue | undefined): JsonObject | null {
  const candidate = asJsonObject(value);
  return candidate !== null && typeof candidate.state === "string" && "value" in candidate ? candidate : null;
}

function fieldState(record: JsonObject, key: string): string | undefined {
  const envelope = field(record[key]);
  return typeof envelope?.state === "string" ? envelope.state : undefined;
}

function fieldValue(record: JsonObject, key: string): JsonValue | undefined {
  const envelope = field(record[key]);
  return envelope?.state === "known" ? envelope.value : undefined;
}

function knownNonempty(record: JsonObject, key: string): boolean {
  const value = fieldValue(record, key);
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value !== null && typeof value === "object") return Object.keys(value).length > 0;
  return typeof value === "number" || typeof value === "boolean";
}

function scientificStateExplicit(record: JsonObject, key: string): boolean {
  return ["known", "unknown", "not_applicable", "withheld"].includes(fieldState(record, key) ?? "");
}

function affectedId(located: LocatedRecord, ...keys: string[]): string[] {
  const id = stringId(located.record, ...keys);
  return id === undefined ? [] : [id];
}

function valueText(value: JsonValue | undefined): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

function sourceBindings(record: JsonObject): never[] | any[] {
  return Array.isArray(record.source_bindings) ? record.source_bindings as any[] : [];
}

interface SpecimenLineage {
  ancestorKeys: Set<string>;
  complete: boolean;
  traversedIds: Set<string>;
}

function collectReferencedSpecimens(value: JsonValue | undefined, specimenIds: ReadonlySet<string>, output: Set<string>): void {
  if (typeof value === "string") {
    if (specimenIds.has(value)) output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectReferencedSpecimens(item, specimenIds, output));
    return;
  }
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach((item) => collectReferencedSpecimens(item, specimenIds, output));
  }
}

function lineageForSpecimen(
  specimenId: string,
  specimenById: ReadonlyMap<string, LocatedRecord>,
  visiting: Set<string>,
  memo: Map<string, SpecimenLineage>,
): SpecimenLineage {
  const cached = memo.get(specimenId);
  if (cached !== undefined) return cached;
  if (visiting.has(specimenId)) return { ancestorKeys: new Set(), complete: false, traversedIds: new Set([specimenId]) };
  const located = specimenById.get(specimenId);
  if (located === undefined) return { ancestorKeys: new Set(), complete: false, traversedIds: new Set([specimenId]) };
  const nextVisiting = new Set(visiting).add(specimenId);
  const traversedIds = new Set<string>([specimenId]);
  const ancestorKeys = new Set<string>();
  const donor = fieldValue(located.record, "donor");
  if (donor !== undefined && donor !== null && valueText(donor).trim().length > 0) {
    ancestorKeys.add(`donor:${valueText(donor).trim()}`);
  }
  if (located.record.kind === "donor") ancestorKeys.add(`donor-record:${specimenId}`);

  const dependencies = new Set(stringArray(located.record.parent_specimen_ids));
  collectReferencedSpecimens(fieldValue(located.record, "pool_members"), new Set(specimenById.keys()), dependencies);
  let complete = true;
  for (const dependencyId of dependencies) {
    const lineage = lineageForSpecimen(dependencyId, specimenById, nextVisiting, memo);
    lineage.ancestorKeys.forEach((key) => ancestorKeys.add(key));
    lineage.traversedIds.forEach((id) => traversedIds.add(id));
    if (!lineage.complete) complete = false;
  }
  if (dependencies.size === 0 && ancestorKeys.size === 0) complete = false;
  if (dependencies.size > 0 && ancestorKeys.size === 0) complete = false;
  const result = { ancestorKeys, complete, traversedIds };
  memo.set(specimenId, result);
  return result;
}

function independentPoolGroupCount(lineages: readonly SpecimenLineage[]): number {
  const parent = lineages.map((_, index) => index);
  const root = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) cursor = parent[cursor]!;
    return cursor;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = root(left);
    const rightRoot = root(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  for (let left = 0; left < lineages.length; left += 1) {
    for (let right = left + 1; right < lineages.length; right += 1) {
      const leftKeys = lineages[left]!.ancestorKeys;
      if ([...lineages[right]!.ancestorKeys].some((key) => leftKeys.has(key))) union(left, right);
    }
  }
  return new Set(lineages.map((_, index) => root(index))).size;
}

function sourceBoundIndependenceBasis(context: SemanticContext, recordValue: JsonValue | undefined): boolean {
  const envelope = field(recordValue);
  if (envelope?.state !== "known" || typeof envelope.value !== "string") return false;
  if (!/(?:independent|distinct|nonoverlap).*(?:donor|biological|ancestor|lineage)|(?:donor|biological|ancestor|lineage).*(?:independent|distinct|nonoverlap)/iu.test(envelope.value)) return false;
  if (!Array.isArray(envelope.source_bindings) || envelope.source_bindings.length === 0) return false;
  return envelope.source_bindings.every((value) => {
    const binding = asJsonObject(value);
    if (binding === null || typeof binding.source_item_id !== "string" || typeof binding.source_snapshot_id !== "string") return false;
    const source = context.report.source_coverage.items.find((item) => item.source_item_id === binding.source_item_id);
    const snapshotKnown = context.report.source_coverage.snapshots.some((item) => item.source_snapshot_id === binding.source_snapshot_id);
    return source?.disposition === "included" && snapshotKnown &&
      (typeof binding.content_hash === "string" || typeof binding.excerpt_hash === "string" || source.content_hash.state === "known");
  });
}

export function evaluateWET001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "wet_lab");
  const specimens = records(payloads, "specimen_records");
  if (specimens.length === 0) return [];
  const specimenById = new Map<string, LocatedRecord>();
  for (const specimen of specimens) {
    const id = stringId(specimen.record, "specimen_id");
    if (id !== undefined) specimenById.set(id, specimen);
  }
  const memo = new Map<string, SpecimenLineage>();
  const findings: ValidationFinding[] = [];
  for (const design of records(payloads, "replicate_designs")) {
    const memberIds = stringArray(design.record.specimen_ids);
    const membershipGaps: string[] = [];
    if (memberIds.length === 0) membershipGaps.push("replicate design has no explicit specimen_ids denominator");
    if (new Set(memberIds).size !== memberIds.length) membershipGaps.push("replicate design specimen_ids denominator contains duplicate members");
    const countedSpecimens = memberIds.flatMap((id) => {
      const specimen = specimenById.get(id);
      if (specimen === undefined) {
        membershipGaps.push(`specimen member ${id} is unresolved`);
        return [];
      }
      if (specimen.payloadIndex !== design.payloadIndex) {
        membershipGaps.push(`specimen member ${id} belongs to another domain payload`);
        return [];
      }
      if (specimen.record.kind === "donor") membershipGaps.push(`donor record ${id} cannot be counted as a terminal analysis specimen`);
      return [specimen];
    });
    const specimenLineages = countedSpecimens.map((specimen) => {
      const id = stringId(specimen.record, "specimen_id");
      return id === undefined
        ? { ancestorKeys: new Set<string>(), complete: false, traversedIds: new Set<string>() }
        : lineageForSpecimen(id, specimenById, new Set(), memo);
    });
    for (let memberIndex = 0; memberIndex < countedSpecimens.length; memberIndex += 1) {
      const id = stringId(countedSpecimens[memberIndex]!.record, "specimen_id");
      if (id === undefined) continue;
      if (specimenLineages.some((lineage, lineageIndex) => lineageIndex !== memberIndex && lineage.traversedIds.has(id))) {
        membershipGaps.push(`specimen member ${id} is an ancestor of another counted member`);
      }
    }
    const independentGroups = independentPoolGroupCount(specimenLineages);
    const lineageComplete = specimenLineages.length > 0 &&
      specimenLineages.every((lineage) => lineage.complete && lineage.ancestorKeys.size > 0);
    const lineageIds = [...new Set(specimenLineages.flatMap((lineage) => [...lineage.traversedIds]))];
    const biologicalN = fieldValue(design.record, "biological_n");
    const technicalN = fieldValue(design.record, "technical_n");
    const gaps: string[] = [...membershipGaps];
    if (typeof biologicalN !== "number") gaps.push("biological N is not known");
    else {
      if (!lineageComplete) gaps.push("specimen lineage does not resolve every counted pool to a biological ancestor group");
      if (biologicalN !== independentGroups) gaps.push(`biological N=${biologicalN} does not equal ${independentGroups} independent ancestor group(s) in the explicit design denominator`);
      if (biologicalN > 1 && !sourceBoundIndependenceBasis(context, design.record.pool_counting_policy)) {
        gaps.push("pool-counting policy lacks a source-bound independence basis tied to donor/ancestor lineage");
      }
    }
    if (typeof technicalN !== "number") gaps.push("technical N is not known separately from biological N");
    else {
      if (typeof biologicalN === "number" && technicalN < biologicalN) gaps.push(`technical N=${technicalN} is smaller than biological N=${biologicalN}`);
      if (technicalN !== countedSpecimens.length) gaps.push(`technical N=${technicalN} does not equal ${countedSpecimens.length} explicitly registered analysis specimens`);
    }
    for (const key of ["biological_unit", "technical_unit", "analysis_unit"]) {
      if (!knownNonempty(design.record, key)) gaps.push(`${key} is not explicitly known`);
    }
    const biologicalUnit = valueText(fieldValue(design.record, "biological_unit")).trim();
    const technicalUnit = valueText(fieldValue(design.record, "technical_unit")).trim();
    if (biologicalUnit.length > 0 && biologicalUnit === technicalUnit && biologicalN !== technicalN) {
      gaps.push("biological and technical unit definitions are conflated despite different counts");
    }
    if (gaps.length > 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: recordPointer(design, "biological_n"),
        affectedObjectIds: [...affectedId(design, "design_id", "work_unit_id"), ...lineageIds],
        sourceBindings: sourceBindings(design.record),
        message: `Replicate design does not reconcile independent biological N, technical N, and analysis units: ${[...new Set(gaps)].join("; ")}.`,
        details: {
          independent_ancestor_groups: independentGroups,
          lineage_complete: lineageComplete,
          pool_count: countedSpecimens.filter((specimen) => specimen.record.kind === "pool").length,
          specimen_count: countedSpecimens.length,
          gaps: [...new Set(gaps)],
        },
      }));
    }
  }
  return findings;
}

export function evaluateWET002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "wet_lab");
  const findings: ValidationFinding[] = [];
  const requiredByKind: Readonly<Record<string, readonly string[]>> = {
    construct: ["name", "sequence_version", "sequence_hash"],
    primer: ["name", "supplier", "catalog_number", "lot_number", "sequence_version"],
    antibody: ["name", "supplier", "catalog_number", "lot_number", "rrid"],
    reagent: ["name", "supplier", "catalog_number", "lot_number"],
    cell_line: ["name", "authentication", "mycoplasma_status", "passage"],
    equipment: ["name", "equipment_calibration"],
  };
  for (const material of records(payloads, "material_records")) {
    const kind = typeof material.record.kind === "string" ? material.record.kind : "unknown";
    const missing = (requiredByKind[kind] ?? ["name"]).filter((key) => !scientificStateExplicit(material.record, key));
    if (missing.length > 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: recordPointer(material),
        affectedObjectIds: affectedId(material, "material_id"),
        sourceBindings: sourceBindings(material.record),
        message: `Wet-lab ${kind} record lacks explicit identity/QC state for: ${missing.join(", ")}.`,
      }));
    }
  }
  return findings;
}

export function evaluateWET003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "wet_lab");
  const processFields = ["randomization", "batch_balance", "blinding", "unblinding", "dropout_policy"];
  return records(payloads, "replicate_designs").flatMap((design) => {
    const missing = processFields.filter((key) => !scientificStateExplicit(design.record, key));
    return missing.length === 0 ? [] : [finding({
      rule,
      effectiveSeverity: severity,
      pointer: recordPointer(design),
      affectedObjectIds: affectedId(design, "design_id", "work_unit_id"),
      sourceBindings: sourceBindings(design.record),
      message: `Wet-lab design lacks explicit allocation/blinding/dropout state for: ${missing.join(", ")}.`,
    })];
  });
}

export function evaluateWET004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "wet_lab");
  const findings: ValidationFinding[] = [];
  for (const protocol of records(payloads, "protocol_records")) {
    const deviations = Array.isArray(protocol.record.deviations) ? protocol.record.deviations : [];
    deviations.forEach((candidate, deviationIndex) => {
      const deviation = asJsonObject(candidate);
      if (deviation === null) return;
      const affected = stringId(protocol.record, "work_unit_id");
      if (!knownNonempty(deviation, "impact_assessment") || !knownNonempty(deviation, "disposition")) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: `${recordPointer(protocol, "deviations")}/${deviationIndex}`,
          affectedObjectIds: [stringId(deviation, "deviation_id"), affected].filter((value): value is string => value !== undefined),
          sourceBindings: sourceBindings(deviation),
          message: "Protocol deviation lacks a known impact assessment or disposition linked to the affected work.",
        }));
      }
    });
  }
  for (const event of records(payloads, "qc_events")) {
    if (event.record.outcome !== "fail") continue;
    const affected = stringArray(event.record.affected_ids);
    if (affected.length === 0 || !knownNonempty(event.record, "action_taken")) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: recordPointer(event),
        affectedObjectIds: [...affectedId(event, "qc_event_id", "work_unit_id", "attempt_id"), ...affected],
        sourceBindings: sourceBindings(event.record),
        message: "Failed wet-lab QC event lacks affected-object links or a known action/impact disposition.",
      }));
    }
  }
  return findings;
}

export function evaluateWFA001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const biologicalKinds = new Set(["organism", "donor", "primary_sample", "cell_line", "culture", "aliquot", "well", "pool", "batch"]);
  return records(domainPayloads(context, "wet_lab"), "specimen_records")
    .filter(({ record }) => biologicalKinds.has(String(record.kind)) && fieldState(record, "organism") === "not_applicable")
    .map((located) => finding({ rule, effectiveSeverity: severity, pointer: recordPointer(located, "organism"), affectedObjectIds: affectedId(located, "specimen_id"), sourceBindings: sourceBindings(located.record) }));
}

export function evaluateWFA002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const donorKinds = new Set(["donor", "primary_sample", "organism", "aliquot", "well", "pool"]);
  return records(domainPayloads(context, "wet_lab"), "specimen_records")
    .filter(({ record }) => donorKinds.has(String(record.kind)) && fieldState(record, "donor") === "not_applicable")
    .map((located) => finding({ rule, effectiveSeverity: severity, pointer: recordPointer(located, "donor"), affectedObjectIds: affectedId(located, "specimen_id"), sourceBindings: sourceBindings(located.record) }));
}

export function evaluateWFA003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  return records(domainPayloads(context, "wet_lab"), "material_records")
    .filter(({ record }) => record.kind === "cell_line" && fieldState(record, "passage") === "not_applicable")
    .map((located) => finding({ rule, effectiveSeverity: severity, pointer: recordPointer(located, "passage"), affectedObjectIds: affectedId(located, "material_id"), sourceBindings: sourceBindings(located.record) }));
}

function comparativeWork(context: SemanticContext, workUnitId: string | undefined): boolean {
  if (workUnitId === undefined) return false;
  return context.report.results.some((result) => result.work_unit_id === workUnitId && ["comparison", "quantitative", "classification"].includes(result.result_kind));
}

export function evaluateWFA004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  return records(domainPayloads(context, "wet_lab"), "replicate_designs")
    .filter(({ record }) => comparativeWork(context, stringId(record, "work_unit_id")) && fieldState(record, "randomization") === "not_applicable")
    .map((located) => finding({ rule, effectiveSeverity: severity, pointer: recordPointer(located, "randomization"), affectedObjectIds: affectedId(located, "design_id", "work_unit_id"), sourceBindings: sourceBindings(located.record) }));
}

export function evaluateWFA005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  return records(domainPayloads(context, "wet_lab"), "replicate_designs")
    .filter(({ record }) => comparativeWork(context, stringId(record, "work_unit_id")) && fieldState(record, "blinding") === "not_applicable")
    .map((located) => finding({ rule, effectiveSeverity: severity, pointer: recordPointer(located, "blinding"), affectedObjectIds: affectedId(located, "design_id", "work_unit_id"), sourceBindings: sourceBindings(located.record) }));
}

export function evaluateWFA006(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "wet_lab");
  const controls = records(payloads, "control_records");
  const findings: ValidationFinding[] = [];
  for (const result of context.report.results) {
    const negative = result.scientific_effect_class === "no_detectable_effect" ||
      result.statistical_decision === "do_not_reject_null" ||
      result.statistical_decision === "equivalent" ||
      result.statistical_decision === "noninferior";
    if (!negative) continue;
    const matching = controls.filter(({ record }) => record.work_unit_id === result.work_unit_id);
    if (matching.length === 0 || matching.every(({ record }) => fieldState(record, "assay_sensitivity") === "not_applicable")) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: `/results/${context.report.results.indexOf(result)}/negative_evidence_assessment`,
        affectedObjectIds: [result.result_id, result.work_unit_id],
        message: "A negative/equivalence interpretation lacks an applicable wet-lab assay-sensitivity record.",
      }));
    }
  }
  return findings;
}

export function evaluateAIM001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  return records(domainPayloads(context, "ai_ml"), "leakage_assessments")
    .filter(({ record }) => record.result === "detected" && record.leakage_kind !== "trajectory")
    .map((located) => finding({
      rule,
      effectiveSeverity: severity,
      pointer: recordPointer(located, "result"),
      affectedObjectIds: affectedId(located, "assessment_id", "split_id"),
      sourceBindings: sourceBindings(located.record),
      message: `Leakage assessment detected ${String(located.record.leakage_kind)} group leakage across model-development partitions.`,
    }));
}

export function evaluateAIM002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "ai_ml");
  const findings = records(payloads, "leakage_assessments")
    .filter(({ record }) => record.result === "detected" && record.leakage_kind === "trajectory")
    .map((located) => finding({
      rule,
      effectiveSeverity: severity,
      pointer: recordPointer(located, "result"),
      affectedObjectIds: affectedId(located, "assessment_id", "split_id"),
      sourceBindings: sourceBindings(located.record),
      message: "Leakage assessment detected correlated trajectory frames across evaluation partitions.",
    }));
  for (const split of records(payloads, "split_records")) {
    const strategy = valueText(fieldValue(split.record, "strategy"));
    const boundary = valueText(fieldValue(split.record, "trajectory_boundary"));
    if (/(?:random|row|frame)/iu.test(strategy) && !/(?:trajectory|replica|independent block|group)/iu.test(boundary)) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: recordPointer(split, "trajectory_boundary"),
        affectedObjectIds: affectedId(split, "split_id", "dataset_id"),
        sourceBindings: sourceBindings(split.record),
        message: "Random/frame-level splitting lacks a trajectory, replica, or independence-justified block boundary.",
      }));
    }
  }
  return findings;
}

function trainOnly(value: JsonValue | undefined): boolean {
  if (typeof value === "string") return /^(?:train|training)(?:[_ -]only)?$/iu.test(value.trim());
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === "string");
    return strings.length > 0 && strings.every((item) => /^(?:train|training)$/iu.test(item.trim()));
  }
  return false;
}

export function evaluateAIM003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  return records(domainPayloads(context, "ai_ml"), "preprocessing_records").flatMap((located) => {
    const stateful = fieldValue(located.record, "stateful");
    if (stateful !== true) return [];
    const gaps: string[] = [];
    if (!trainOnly(fieldValue(located.record, "fit_partition"))) gaps.push("fit partition is not training-only");
    if (!knownNonempty(located.record, "fit_row_selector")) gaps.push("fit-row selector is not known");
    if (!knownNonempty(located.record, "fit_artifact_hash")) gaps.push("fitted-state hash is not known");
    if (stringArray(located.record.code_artifact_ids).length === 0) gaps.push("preprocessing code artifact is absent");
    return gaps.length === 0 ? [] : [finding({
      rule,
      effectiveSeverity: severity,
      pointer: recordPointer(located),
      affectedObjectIds: affectedId(located, "preprocessing_id", "split_id"),
      sourceBindings: sourceBindings(located.record),
      message: `Stateful preprocessing cannot establish train-only fitting: ${gaps.join("; ")}.`,
    })];
  });
}

export function evaluateAIM004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "ai_ml");
  const trials = records(payloads, "trial_records");
  const models = records(payloads, "model_records");
  const findings: ValidationFinding[] = [];
  const outputModelsByPayload = new Map<number, Set<string>>();
  for (const search of records(payloads, "search_records")) {
    const searchId = stringId(search.record, "search_id");
    const declared = new Set(stringArray(search.record.trial_ids));
    const actual = trials.filter(({ record, payloadIndex }) => payloadIndex === search.payloadIndex && record.search_id === searchId);
    const actualIds = new Set(actual.flatMap((trial) => affectedId(trial, "trial_id")));
    const failed = new Set(stringArray(search.record.failed_trial_ids));
    const selected = new Set(stringArray(search.record.selected_trial_ids));
    const selectedTrials = actual.filter(({ record }) => selected.has(String(record.trial_id)));
    const selectedTrialModelIds = new Set(selectedTrials.flatMap((trial) => affectedId(trial, "model_record_id")));
    const derivation = asJsonObject(search.record.selection_derivation);
    const derivationMode = derivation?.mode;
    const derivationInputTrials = new Set(stringArray(derivation?.input_selected_trial_ids));
    const derivationInputModels = new Set(stringArray(derivation?.input_model_record_ids));
    const derivationOutputs = new Set(stringArray(derivation?.output_model_record_ids));
    const gaps: string[] = [];
    if (declared.size !== actualIds.size || [...declared].some((id) => !actualIds.has(id))) gaps.push("declared trial ledger does not match reachable trials");
    if (actual.filter(({ record }) => record.status === "failed").some((trial) => !failed.has(stringId(trial.record, "trial_id") ?? ""))) gaps.push("failed trials are missing from failed_trial_ids");
    if (["search_space", "search_strategy", "budget", "selection_metric", "selection_rule", "selection_partition"].some((key) => !knownNonempty(search.record, key))) gaps.push("search or selection definition is not fully known");
    if ([...selected].some((id) => !actualIds.has(id))) gaps.push("selected trial does not resolve in the search ledger");
    if (selectedTrials.some(({ record }) => record.status !== "completed")) gaps.push("selected trial is not completed");
    if (derivation === null) gaps.push("typed selection_derivation is absent");
    else {
      if (!["direct_trial_model", "ensemble", "post_search_rule"].includes(String(derivationMode))) gaps.push("selection derivation mode is invalid");
      if (derivationInputTrials.size !== selected.size || [...selected].some((id) => !derivationInputTrials.has(id))) {
        gaps.push("selection derivation inputs do not equal selected_trial_ids");
      }
      if (derivationInputModels.size !== selectedTrialModelIds.size || [...selectedTrialModelIds].some((id) => !derivationInputModels.has(id))) {
        gaps.push("selection derivation model inputs do not equal the models derived from selected trials");
      }
      if (derivationOutputs.size === 0) gaps.push("selection derivation has no output model");
      if (derivationMode === "direct_trial_model" &&
        (derivationOutputs.size !== selectedTrialModelIds.size || [...selectedTrialModelIds].some((id) => !derivationOutputs.has(id)))) {
        gaps.push("direct selection outputs do not equal the models derived from selected trials");
      }
      if (!knownNonempty(derivation, "rule_or_rationale") || sourceBindings(derivation).length === 0) {
        gaps.push("selection derivation lacks a known source-bound rule or rationale");
      }
      const payloadModelIds = new Set(models.filter((model) => model.payloadIndex === search.payloadIndex).flatMap((model) => affectedId(model, "model_record_id")));
      if ([...derivationOutputs].some((id) => !payloadModelIds.has(id))) gaps.push("selection derivation output model is unresolved");
      const outputSet = outputModelsByPayload.get(search.payloadIndex) ?? new Set<string>();
      derivationOutputs.forEach((id) => outputSet.add(id));
      outputModelsByPayload.set(search.payloadIndex, outputSet);
    }
    if (gaps.length > 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: recordPointer(search),
        affectedObjectIds: [searchId, ...declared, ...selected, ...selectedTrialModelIds, ...derivationOutputs].filter((value): value is string => value !== undefined),
        sourceBindings: sourceBindings(search.record),
        message: `Model-search history is incomplete or selection provenance is contradictory: ${gaps.join("; ")}.`,
        details: { gaps },
      }));
    }
  }
  for (const { payload, index: payloadIndex } of payloads) {
    const selectedRoleModels = new Set(models
      .filter((model) => model.payloadIndex === payloadIndex && model.record.role === "selected")
      .flatMap((model) => affectedId(model, "model_record_id")));
    const derivedOutputs = outputModelsByPayload.get(payloadIndex) ?? new Set<string>();
    if (selectedRoleModels.size !== derivedOutputs.size || [...selectedRoleModels].some((id) => !derivedOutputs.has(id))) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("extensions", "domain_payloads", payloadIndex, "model_records"),
        affectedObjectIds: [...selectedRoleModels, ...derivedOutputs],
        sourceBindings: sourceBindings(payload),
        message: "Selected-role models do not exactly match the source-bound outputs derived from selected trials.",
        details: {
          selected_role_model_ids: [...selectedRoleModels].sort(),
          selection_output_model_ids: [...derivedOutputs].sort(),
        },
      }));
    }
  }
  return findings;
}

function knownDate(record: JsonObject, key: string): number | undefined {
  const value = fieldValue(record, key);
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function evaluateAIM005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const event of records(domainPayloads(context, "ai_ml"), "test_access_events")) {
    const eventTime = knownDate(event.record, "timestamp");
    for (const decisionId of stringArray(event.record.affected_decision_ids)) {
      const decision = context.report.decision_events.find((candidate) => candidate.decision_event_id === decisionId);
      if (decision === undefined) continue;
      const decisionTime = decision.decided_at.state === "known" ? Date.parse(decision.decided_at.value) : Number.NaN;
      if (decision.timing_class === "predefined" && (eventTime === undefined || !Number.isFinite(decisionTime) || eventTime <= decisionTime)) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: recordPointer(event),
          affectedObjectIds: [...affectedId(event, "event_id", "split_id"), decisionId],
          sourceBindings: sourceBindings(event.record),
          message: "Test-data access precedes or cannot be shown to follow a decision still labelled predefined/untouched.",
        }));
      }
    }
  }
  return findings;
}

export function evaluateAFA001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "ai_ml");
  const hasPartitionedWork = records(payloads, "trial_records").length > 0 || records(payloads, "evaluation_records").length > 0 || records(payloads, "model_records").length > 0;
  if (!hasPartitionedWork || records(payloads, "split_records").length > 0) return [];
  return [finding({ rule, effectiveSeverity: severity, pointer: "/extensions/domain_payloads", message: "AI/ML model-development or evaluation records exist without a split-manifest record." })];
}

export function evaluateAFA002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "ai_ml");
  const groupedDatasets = new Set(records(payloads, "dataset_records")
    .filter(({ record }) => knownNonempty(record, "group_keys"))
    .flatMap((located) => affectedId(located, "dataset_id")));
  return records(payloads, "split_records")
    .filter(({ record }) => groupedDatasets.has(String(record.dataset_id)) && fieldState(record, "group_key") === "not_applicable")
    .map((located) => finding({ rule, effectiveSeverity: severity, pointer: recordPointer(located, "group_key"), affectedObjectIds: affectedId(located, "split_id", "dataset_id"), sourceBindings: sourceBindings(located.record) }));
}

export function evaluateAFA003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "ai_ml");
  const findings: ValidationFinding[] = [];
  for (const { payload, index } of payloads) {
    const splits = records([{ payload, index }], "split_records");
    const hasTest = splits.some(({ record }) => /\btest\b/iu.test(valueText(fieldValue(record, "partition_counts"))));
    if (!hasTest) continue;
    const sections = Array.isArray(payload.section_coverage) ? payload.section_coverage.map(asJsonObject).filter((item): item is JsonObject => item !== null) : [];
    const testSection = sections.find((section) => section.section_id === "test_access");
    if (testSection === undefined || !["covered", "no_records"].includes(String(testSection.coverage_status)) || !Array.isArray(testSection.evidence_bindings) || testSection.evidence_bindings.length === 0) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: pointer("extensions", "domain_payloads", index, "section_coverage"),
        affectedObjectIds: splits.flatMap((split) => affectedId(split, "split_id")),
        message: "A held-out test partition exists without a source-accounted test-access ledger, including an explicit evidenced no-access state when applicable.",
      }));
    }
  }
  return findings;
}

export function evaluateAFA004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "ai_ml");
  const randomness = new Set(records(payloads, "randomness_records").flatMap((record) => affectedId(record, "randomness_record_id")));
  return records(payloads, "trial_records")
    .filter(({ record }) => ["running", "completed", "failed", "cancelled"].includes(String(record.status)) && (stringArray(record.randomness_record_ids).length === 0 || stringArray(record.randomness_record_ids).some((id) => !randomness.has(id))))
    .map((located) => finding({
      rule,
      effectiveSeverity: severity,
      pointer: recordPointer(located, "randomness_record_ids"),
      affectedObjectIds: [...affectedId(located, "trial_id"), ...stringArray(located.record.randomness_record_ids)],
      sourceBindings: sourceBindings(located.record),
      message: "Executed AI/ML trial lacks a complete, resolvable random-state record.",
    }));
}

export function evaluateAFA005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const probabilistic = /(?:probab|risk|confidence|calibr|brier|log.?loss|cross.?entropy|auc)/iu;
  return records(domainPayloads(context, "ai_ml"), "evaluation_records")
    .filter(({ record }) => probabilistic.test(valueText(fieldValue(record, "metric"))) && fieldState(record, "calibration_assessment") === "not_applicable")
    .map((located) => finding({ rule, effectiveSeverity: severity, pointer: recordPointer(located, "calibration_assessment"), affectedObjectIds: affectedId(located, "evaluation_id", "result_id"), sourceBindings: sourceBindings(located.record) }));
}

export function evaluateMDS001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "molecular_dynamics");
  const segments = records(payloads, "segment_records");
  const segmentIds = new Set(segments.flatMap((segment) => affectedId(segment, "segment_record_id")));
  return records(payloads, "restart_records").flatMap((restart) => {
    const prior = stringId(restart.record, "prior_segment_record_id");
    const next = stringId(restart.record, "new_segment_record_id");
    const gaps: string[] = [];
    if (prior === undefined || !segmentIds.has(prior)) gaps.push("prior segment is absent");
    if (next === undefined || !segmentIds.has(next)) gaps.push("new segment is absent");
    if (!knownNonempty(restart.record, "trigger")) gaps.push("restart trigger is not known");
    if (!knownNonempty(restart.record, "checkpoint_artifact_id")) gaps.push("checkpoint identity is not known");
    if (!knownNonempty(restart.record, "changed_parameters")) gaps.push("changed parameters are not known");
    if (!knownNonempty(restart.record, "scientific_impact_assessment")) gaps.push("scientific impact is not known");
    if (fieldValue(restart.record, "history_preserved") !== true) gaps.push("history_preserved is not true");
    return gaps.length === 0 ? [] : [finding({
      rule,
      effectiveSeverity: severity,
      pointer: recordPointer(restart),
      affectedObjectIds: [...affectedId(restart, "restart_record_id", "replica_id"), prior, next].filter((value): value is string => value !== undefined),
      sourceBindings: sourceBindings(restart.record),
      message: `Molecular-dynamics restart chain is incomplete: ${gaps.join("; ")}.`,
    })];
  });
}

const AFFIRMATIVE_SAMPLING_STATUSES = new Set(["qualified_adequacy", "adequate", "converged"]);

export function evaluateMDS002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "molecular_dynamics");
  const replicas = records(payloads, "replica_records");
  return records(payloads, "trajectory_analysis_records").flatMap((analysis) => {
    const assessment = asJsonObject(analysis.record.sampling_adequacy_assessment);
    const status = assessment?.conclusion_status;
    const allowedStatuses = ["no_conclusion", "insufficient_sampling", "qualified_adequacy", "adequate", "converged", "unknown", "withheld"];
    if (assessment === null || !allowedStatuses.includes(String(status))) {
      return [finding({
        rule,
        effectiveSeverity: severity,
        pointer: recordPointer(analysis, "sampling_adequacy_assessment"),
        affectedObjectIds: [...affectedId(analysis, "trajectory_analysis_id", "analysis_run_id"), ...stringArray(analysis.record.result_ids)],
        sourceBindings: sourceBindings(analysis.record),
        message: "Trajectory analysis lacks a typed sampling-adequacy conclusion status.",
      })];
    }
    if (["no_conclusion", "unknown", "withheld"].includes(String(status)) && knownNonempty(analysis.record, "convergence_conclusion")) {
      return [finding({
        rule,
        effectiveSeverity: severity,
        pointer: recordPointer(analysis, "sampling_adequacy_assessment", "conclusion_status"),
        affectedObjectIds: [...affectedId(analysis, "trajectory_analysis_id", "analysis_run_id"), ...stringArray(analysis.record.result_ids)],
        sourceBindings: sourceBindings(analysis.record),
        message: "Known sampling conclusion text contradicts the structured no-conclusion, unknown, or withheld status.",
      })];
    }
    if (!AFFIRMATIVE_SAMPLING_STATUSES.has(String(status))) return [];
    const required = [
      "burn_in_definition",
      "burn_in_decision_timing",
      "autocorrelation_method",
      "correlation_time_estimates",
      "effective_sample_sizes",
      "convergence_criteria",
      "convergence_diagnostics",
      "replica_level_results",
      "replica_heterogeneity",
    ];
    const missing = required.filter((key) => !knownNonempty(analysis.record, key));
    const replicaIds = stringArray(analysis.record.replica_ids);
    if (replicaIds.length < 2) missing.push("at least two replica identities");
    const registeredReplicaIds = new Set(replicas
      .filter((replica) => replica.payloadIndex === analysis.payloadIndex)
      .flatMap((replica) => affectedId(replica, "replica_id")));
    if (replicaIds.some((id) => !registeredReplicaIds.has(id))) missing.push("every assessed replica identity must resolve in the same payload");
    if (!knownNonempty(analysis.record, "convergence_conclusion")) missing.push("known affirmative conclusion text");
    if (assessment === null || !knownNonempty(assessment, "assessed_observables") || !knownNonempty(assessment, "rationale")) {
      missing.push("structured observable scope and adequacy rationale");
    }
    for (const [key, description] of [
      ["criteria_met", "affirmative criteria assessment"],
      ["diagnostics_support_conclusion", "affirmative diagnostics assessment"],
      ["effective_sample_sizes_support_conclusion", "affirmative effective-sample-size assessment"],
      ["replica_assessment_supports_conclusion", "affirmative replica/heterogeneity assessment"],
    ] as const) {
      if (assessment === null || fieldValue(assessment, key) !== true) missing.push(description);
    }
    if (assessment === null || sourceBindings(assessment).length === 0) missing.push("source-bound structured adequacy assessment");
    return missing.length === 0 ? [] : [finding({
      rule,
      effectiveSeverity: severity,
      pointer: recordPointer(analysis, "sampling_adequacy_assessment"),
      affectedObjectIds: [...affectedId(analysis, "trajectory_analysis_id", "analysis_run_id"), ...stringArray(analysis.record.result_ids)],
      sourceBindings: sourceBindings(analysis.record),
      message: `Affirmative sampling-adequacy status exceeds the registered diagnostics; missing ${[...new Set(missing)].join(", ")}.`,
      details: { conclusion_status: status as JsonValue, missing: [...new Set(missing)] },
    })];
  });
}

export function evaluateMDS003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const required = [
    "periodic_boundary_processing",
    "fit_selection",
    "measurement_selection",
    "frame_range",
    "stride",
    "data_slice_id",
    "burn_in_definition",
  ];
  return records(domainPayloads(context, "molecular_dynamics"), "trajectory_analysis_records").flatMap((analysis) => {
    const missing = required.filter((key) => !knownNonempty(analysis.record, key));
    const runId = stringId(analysis.record, "analysis_run_id");
    const sliceId = fieldValue(analysis.record, "data_slice_id");
    if (runId === undefined || !context.report.analysis_runs.some((run) => run.analysis_run_id === runId)) missing.push("resolvable analysis run");
    if (typeof sliceId !== "string" || !context.report.data_slices.some((slice) => slice.data_slice_id === sliceId)) missing.push("resolvable DataSlice");
    if (stringArray(analysis.record.trajectory_artifact_ids).length === 0 || stringArray(analysis.record.segment_record_ids).length === 0) missing.push("trajectory/segment identities");
    return missing.length === 0 ? [] : [finding({
      rule,
      effectiveSeverity: severity,
      pointer: recordPointer(analysis),
      affectedObjectIds: [...affectedId(analysis, "trajectory_analysis_id", "analysis_run_id"), ...stringArray(analysis.record.result_ids)],
      sourceBindings: sourceBindings(analysis.record),
      message: `Trajectory analysis slice is not reproducibly identified: ${missing.join(", ")}.`,
    })];
  });
}

export function evaluateMDS004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "molecular_dynamics");
  const structures = records(payloads, "structure_records");
  const forceFields = records(payloads, "force_field_records");
  const solvation = records(payloads, "solvation_records");
  const phases = records(payloads, "phase_records");
  return records(payloads, "system_records").flatMap((system) => {
    const systemId = stringId(system.record, "system_id");
    const used = phases.some(({ record }) => record.system_id === systemId) || records(payloads, "trajectory_analysis_records").length > 0;
    if (!used) return [];
    const gaps: string[] = [];
    if (stringArray(system.record.structure_record_ids).length === 0 || stringArray(system.record.structure_record_ids).some((id) => !structures.some(({ record }) => record.structure_record_id === id))) gaps.push("source structure/mapping");
    if (!forceFields.some(({ record }) => record.system_id === systemId)) gaps.push("force-field parameters");
    if (!solvation.some(({ record }) => record.system_id === systemId)) gaps.push("solvation/ions/boundary");
    if (phases.filter(({ record }) => record.system_id === systemId).some(({ record }) => ["integrator", "time_step", "constraints", "nonbonded_cutoff", "long_range_electrostatics"].some((key) => !scientificStateExplicit(record, key)))) gaps.push("simulation protocol fields");
    return gaps.length === 0 ? [] : [finding({
      rule,
      effectiveSeverity: severity,
      pointer: recordPointer(system),
      affectedObjectIds: affectedId(system, "system_id"),
      sourceBindings: sourceBindings(system.record),
      message: `Used simulated system lacks explicit identity/protocol record classes: ${gaps.join(", ")}.`,
    })];
  });
}

export function evaluateMDS005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const replicas = records(domainPayloads(context, "molecular_dynamics"), "replica_records");
  const findings: ValidationFinding[] = [];
  for (let left = 0; left < replicas.length; left += 1) {
    for (let right = left + 1; right < replicas.length; right += 1) {
      const a = replicas[left]!;
      const b = replicas[right]!;
      const sameSeed = fieldValue(a.record, "root_seed") !== undefined && JSON.stringify(fieldValue(a.record, "root_seed")) === JSON.stringify(fieldValue(b.record, "root_seed"));
      const aInitial = new Set(stringArray(a.record.initial_condition_artifact_ids));
      const sharedInitial = stringArray(b.record.initial_condition_artifact_ids).some((id) => aInitial.has(id));
      const claimsIndependent = /\bindependent\b/iu.test(valueText(fieldValue(a.record, "independence_basis"))) || /\bindependent\b/iu.test(valueText(fieldValue(b.record, "independence_basis")));
      if ((sameSeed || sharedInitial) && claimsIndependent) {
        findings.push(finding({
          rule,
          effectiveSeverity: severity,
          pointer: recordPointer(b, "independence_basis"),
          affectedObjectIds: [...affectedId(a, "replica_id"), ...affectedId(b, "replica_id")],
          sourceBindings: [...sourceBindings(a.record), ...sourceBindings(b.record)],
          message: `Replicas share ${sameSeed ? "a root seed" : "an initial-condition artifact"} while being described as independent.`,
        }));
      }
    }
  }
  for (const replica of replicas) {
    if (fieldState(replica.record, "independence_basis") === "unknown" || fieldState(replica.record, "root_seed") === "unknown") {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: recordPointer(replica, "independence_basis"),
        affectedObjectIds: affectedId(replica, "replica_id"),
        sourceBindings: sourceBindings(replica.record),
        message: "Replica independence or seed lineage is unknown and cannot support an independent-replica count.",
      }));
    }
  }
  return findings;
}

export function evaluateMFA001(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "molecular_dynamics");
  const protonationSystemIds = new Set(records(payloads, "protonation_records").flatMap((record) => affectedId(record, "system_id")));
  return records(payloads, "system_records").flatMap((system) => {
    const ionizable = Array.isArray(system.record.components) && system.record.components.some((component) => {
      const record = asJsonObject(component);
      return record !== null && ["protein", "nucleic_acid", "ligand", "cofactor"].includes(String(record.kind));
    });
    const systemId = stringId(system.record, "system_id");
    return ionizable && (systemId === undefined || !protonationSystemIds.has(systemId))
      ? [finding({ rule, effectiveSeverity: severity, pointer: recordPointer(system), affectedObjectIds: affectedId(system, "system_id"), sourceBindings: sourceBindings(system.record), message: "Ionizable simulated system lacks an explicit protonation/chemistry applicability record." })]
      : [];
  });
}

export function evaluateMFA002(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  return records(domainPayloads(context, "molecular_dynamics"), "solvation_records")
    .filter(({ record }) => fieldState(record, "periodic_boundary_conditions") === "not_applicable" && !/\bnonperiodic\b/iu.test(valueText(fieldValue(record, "box_shape"))))
    .map((located) => finding({ rule, effectiveSeverity: severity, pointer: recordPointer(located, "periodic_boundary_conditions"), affectedObjectIds: affectedId(located, "solvation_record_id", "system_id"), sourceBindings: sourceBindings(located.record) }));
}

export function evaluateMFA003(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  return records(domainPayloads(context, "molecular_dynamics"), "replica_records")
    .filter(({ record }) => fieldState(record, "root_seed") === "not_applicable" || fieldState(record, "seed_derivation") === "not_applicable")
    .map((located) => finding({ rule, effectiveSeverity: severity, pointer: recordPointer(located, "root_seed"), affectedObjectIds: affectedId(located, "replica_id"), sourceBindings: sourceBindings(located.record) }));
}

export function evaluateMFA004(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const correlationFields = ["autocorrelation_method", "correlation_time_estimates", "effective_sample_sizes"];
  return records(domainPayloads(context, "molecular_dynamics"), "trajectory_analysis_records").flatMap((analysis) => {
    const assessment = asJsonObject(analysis.record.sampling_adequacy_assessment);
    const affirmative = AFFIRMATIVE_SAMPLING_STATUSES.has(String(assessment?.conclusion_status));
    const inferential = stringArray(analysis.record.result_ids).length > 0 || affirmative;
    if (!inferential) return [];
    const invalid = correlationFields.filter((key) => affirmative
      ? fieldState(analysis.record, key) !== "known"
      : fieldState(analysis.record, key) === "not_applicable");
    return invalid.length === 0 ? [] : [finding({
      rule,
      effectiveSeverity: severity,
      pointer: recordPointer(analysis),
      affectedObjectIds: [...affectedId(analysis, "trajectory_analysis_id"), ...stringArray(analysis.record.result_ids)],
      sourceBindings: sourceBindings(analysis.record),
      message: `Time-correlated analysis lacks known applicable correlation/effective-sample fields required by its structured conclusion: ${invalid.join(", ")}.`,
    })];
  });
}

export function evaluateMFA005(context: SemanticContext, rule: RuleDefinition, severity: RuleSeverity): ValidationFinding[] {
  const payloads = domainPayloads(context, "molecular_dynamics");
  const restartPairs = new Set(records(payloads, "restart_records").flatMap((restart) => [stringId(restart.record, "prior_segment_record_id"), stringId(restart.record, "new_segment_record_id")].filter((value): value is string => value !== undefined)));
  const findings: ValidationFinding[] = [];
  for (const attempt of context.report.attempts) {
    if (attempt.segment_ids.length <= 1) continue;
    const represented = attempt.segment_ids.some((id) => restartPairs.has(id));
    if (!represented) {
      findings.push(finding({
        rule,
        effectiveSeverity: severity,
        pointer: `/attempts/${context.report.attempts.indexOf(attempt)}/segment_ids`,
        affectedObjectIds: [attempt.attempt_id, ...attempt.segment_ids],
        sourceBindings: attempt.source_bindings,
        message: "Multi-segment molecular-dynamics attempt lacks an explicit restart-lineage record or a proven uninterrupted single-segment rationale.",
      }));
    }
  }
  return findings;
}
