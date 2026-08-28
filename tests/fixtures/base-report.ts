import { sha256, type Sha256Hash } from "../../src/lib/hash.js";
import type {
  ScientificField,
  ScientificReport,
  SourceBinding,
  SourceBindingRole,
  SourceDisposition,
  SourceItem,
} from "../../src/lib/types.js";

export const FIXTURE_NOW = "2026-08-24T00:00:00.000Z";
export const BASE_SOURCE_ID = "source.base";
export const BASE_SNAPSHOT_ID = "snapshot.base";
export const BASE_UNIVERSE_ID = "universe.fixture";
export const BASE_FIELD_APPLICABILITY_ID = "applicability.fixture.field";

export function sourceHash(sourceItemId: string): Sha256Hash {
  return sha256(`fixture source ${sourceItemId}`);
}

export function sourceBinding(
  sourceItemId = BASE_SOURCE_ID,
  bindingRole: SourceBindingRole = "direct",
  sourceSnapshotId = BASE_SNAPSHOT_ID,
): SourceBinding {
  const contentHash = sourceHash(sourceItemId);
  return {
    source_item_id: sourceItemId,
    source_snapshot_id: sourceSnapshotId,
    snapshot_registry_hash: sha256("fixture source registry"),
    content_hash: contentHash,
    excerpt_hash: sha256(`fixture excerpt ${sourceItemId}`),
    chunk_ids: [`chunk.${sourceItemId}`],
    locator: { locator_type: "whole_source", value: "entire fixture source" },
    parser_identity: {
      parser_name: "fixture-parser",
      parser_version: "1.0.0",
      configuration_hash: sha256("fixture parser configuration"),
      parser_result_id: `parser-result.${sourceItemId}`,
    },
    binding_scope: "whole_source",
    binding_role: bindingRole,
  };
}

export function known<T>(
  value: T,
  binding: SourceBinding = sourceBinding(),
): ScientificField<T> {
  return {
    state: "known",
    value,
    source_bindings: [binding],
    derivation_bindings: [],
    missing_reason: null,
    provenance_status: "complete",
  };
}

export function unknown<T>(reason = "The source record does not state this value."): ScientificField<T> {
  return {
    state: "unknown",
    value: null,
    source_bindings: [],
    derivation_bindings: [],
    missing_reason: reason,
    provenance_status: "absent",
  };
}

export function notApplicable<T>(
  reason: string,
  applicabilityDecisionId = BASE_FIELD_APPLICABILITY_ID,
): ScientificField<T> {
  return {
    state: "not_applicable",
    value: null,
    source_bindings: [],
    derivation_bindings: [],
    missing_reason: reason,
    provenance_status: "absent",
    applicability_decision_id: applicabilityDecisionId,
  };
}

export function withheld<T>(reason: string): ScientificField<T> {
  return {
    state: "withheld",
    value: null,
    source_bindings: [],
    derivation_bindings: [],
    missing_reason: reason,
    provenance_status: "partial",
    withholding_reason_code: "source_confidentiality",
    disclosure_decision_id: "disclosure.fixture",
  };
}

export interface SourceItemOptions {
  disposition?: SourceDisposition;
  dispositionReason?: ScientificField<string>;
  mappedObjectIds?: string[];
  title?: string;
  extensions?: SourceItem["extensions"];
  contentAccess?: SourceItem["content_access"];
  canonicalSourceItemId?: string | null;
}

export function makeSourceItem(
  sourceItemId: string,
  options: SourceItemOptions = {},
): SourceItem {
  const binding = sourceBinding(sourceItemId);
  const disposition = options.disposition ?? "included";
  const reason = disposition === "included"
    ? notApplicable<string>("Included sources do not require an exclusion reason.")
    : known(
        disposition === "duplicate"
          ? "This record duplicates a separately registered canonical source."
          : "The source was explicitly dispositioned for this bounded report.",
        binding,
      );
  return {
    source_item_id: sourceItemId,
    universe_id: BASE_UNIVERSE_ID,
    source_kind: "file",
    identity: known(`identity:${sourceItemId}`, binding),
    title: known(options.title ?? `Fixture source ${sourceItemId}`, binding),
    location: known(`sources/${sourceItemId}.json`, binding),
    content_hash: known(sourceHash(sourceItemId), binding),
    registered_at: known("2026-08-23T12:00:00.000Z", binding),
    snapshot_id: BASE_SNAPSHOT_ID,
    revision_or_snapshot: known("fixture revision 1", binding),
    disclosure_class: "internal",
    disposition,
    disposition_reason: options.dispositionReason ?? reason,
    content_access: options.contentAccess ?? (disposition === "unreadable" ? "unreadable" : disposition === "inaccessible" ? "inaccessible" : "available"),
    canonical_source_item_id: options.canonicalSourceItemId ?? null,
    equivalence_basis: disposition === "duplicate"
      ? known("Byte-identical registered content", binding)
      : notApplicable<string>("The source is not declared as a duplicate."),
    mapped_object_ids: options.mappedObjectIds ?? ["question.fixture"],
    source_bindings: [binding],
    extensions: options.extensions ?? {},
  };
}

export function reconcileCoverageCounts(report: ScientificReport): void {
  const counts = (disposition: SourceDisposition): number =>
    report.source_coverage.items.filter((item) => item.disposition === disposition).length;
  const pending = counts("pending");
  report.source_coverage.item_ids = report.source_coverage.items.map((item) => item.source_item_id);
  report.source_coverage.reconciliation = {
    registered: report.source_coverage.items.length,
    terminally_disposed: report.source_coverage.items.length - pending,
    included: counts("included"),
    excluded_with_reason: counts("excluded_with_reason"),
    unreadable: counts("unreadable"),
    inaccessible: counts("inaccessible"),
    duplicate: counts("duplicate"),
    unmapped: counts("unmapped"),
    pending,
    included_mapped: report.source_coverage.items.filter(
      (item) => item.disposition === "included" && item.mapped_object_ids.length > 0,
    ).length,
  };
}

export function baseReport(): ScientificReport {
  const report: ScientificReport = {
    report_id: "report.fixture",
    project_id: "project.fixture",
    report_version: "1.0.0",
    schema_version: "1.0.0",
    payload_role: "canonical_authoritative",
    title: "Source-bounded scientific fixture",
    language: "en",
    report_mode: "full_archive",
    created_at: FIXTURE_NOW,
    scope: {
      scope_statement: "This report covers only the explicitly registered fixture sources.",
      started_at: unknown<string>("The project start was not recorded."),
      ended_at: notApplicable<string>("The bounded review is not an execution interval."),
      cutoff_at: withheld<string>("The exact internal cutoff is protected in this projection."),
      included_boundaries: ["Registered fixture source records"],
      excluded_boundaries: ["Unregistered project materials"],
    },
    cutoff: unknown<string>("No public cutoff timestamp is available."),
    applicability_decisions: [
      {
        applicability_decision_id: "applicability.core.always",
        object_version: "1.0.0",
        target_kind: "module",
        target_pointer_or_section_id: "core",
        rule_id: "FA004",
        result: "applicable",
        evaluated_context: "The core module is mandatory for every scientific report.",
        evidence_bindings: [sourceBinding()],
        decision_time: FIXTURE_NOW,
        extensions: {},
      },
      {
        applicability_decision_id: "applicability.core.empty-ledger",
        object_version: "1.0.0",
        target_kind: "section",
        target_pointer_or_section_id: "core.empty-ledger",
        rule_id: "FA003",
        result: "not_applicable",
        evaluated_context: "The base fixture intentionally contains no scientific work ledger.",
        evidence_bindings: [sourceBinding()],
        decision_time: FIXTURE_NOW,
        extensions: {},
      },
      {
        applicability_decision_id: BASE_FIELD_APPLICABILITY_ID,
        object_version: "1.0.0",
        target_kind: "field",
        target_pointer_or_section_id: "/**",
        rule_id: "FA001",
        result: "not_applicable",
        evaluated_context: "The fixture explicitly marks fields whose governing condition is absent.",
        evidence_bindings: [sourceBinding()],
        decision_time: FIXTURE_NOW,
        extensions: { fixture_scope: "wildcard field decision for isolated validator fixtures" },
      },
    ],
    module_manifest: [
      {
        module_id: "core",
        protocol_version: "1.0.0",
        status: "enabled",
        applicability_decision_id: "applicability.core.always",
        detected_triggers: [],
        section_ids: ["core.empty-ledger"],
      },
    ],
    section_coverage: [
      {
        section_id: "core.empty-ledger",
        applicability: "not_applicable",
        applicability_decision_id: "applicability.core.empty-ledger",
        coverage_status: "not_applicable",
        source_universe_ids: [BASE_UNIVERSE_ID],
        represented_object_ids: [],
        omission_or_gap_reasons: known(["This base fixture declares no scientific work."]),
        evidence_bindings: [sourceBinding()],
        last_evaluated_at: known(FIXTURE_NOW),
      },
    ],
    source_coverage: {
      universe_id: BASE_UNIVERSE_ID,
      title: "Bounded fixture source universe",
      scope_statement: "Every registered fixture source is dispositioned; overall project completeness is unproved.",
      inclusion_boundary: "Sources explicitly registered in this deterministic fixture.",
      exclusion_boundary: "Any project material not present in the fixture registry.",
      cutoff: unknown<string>("The registry cutoff is not publicly recorded."),
      cutoff_event_semantics: known("The cutoff is the fixture source-registry snapshot time."),
      authority_basis: "declared_inventory",
      authority_evidence: unknown<string>("No authoritative source universe was supplied."),
      enumeration_status: "registered_not_proven_exhaustive",
      snapshot_bindings: [BASE_SNAPSHOT_ID],
      item_ids: [BASE_SOURCE_ID],
      snapshots: [
        {
          source_snapshot_id: BASE_SNAPSHOT_ID,
          created_at: known("2026-08-24T00:00:00.000Z"),
          registry_hash: known(sha256("fixture source registry")),
          snapshot_method: known("Deterministic fixture registry construction"),
          source_bindings: [],
        },
      ],
      items: [makeSourceItem(BASE_SOURCE_ID)],
      reconciliation: {
        registered: 1,
        terminally_disposed: 1,
        included: 1,
        excluded_with_reason: 0,
        unreadable: 0,
        inaccessible: 0,
        duplicate: 0,
        unmapped: 0,
        pending: 0,
        included_mapped: 1,
      },
      coverage_axes: {
        inventory_accounting: "complete",
        accessibility: "all_accessible",
        scientific_incorporation: "complete_within_boundary",
      },
      report_completeness: "registered_sources_accounted_for",
      coverage_limitations: ["No authoritative universe exists, so overall completeness cannot be proved."],
    },
    research_questions: [
      {
        research_question_id: "question.fixture",
        research_question_version: "1.0.0",
        question: "What follows from the bounded fixture evidence?",
        rationale: unknown<string>("No project rationale was supplied."),
        resolution_criterion_timing: "missing",
        resolution_criteria: unknown<string>("No resolution criterion was recorded."),
        resolution_status: "not_evaluable",
        qualified_answer: unknown<string>("The empty base fixture supports no scientific answer."),
        claim_ids: [],
        limitation_ids: [],
        source_bindings: [],
        extensions: {},
      },
    ],
    entities: [],
    campaigns: [],
    work_units: [],
    attempts: [],
    segments: [],
    methods: [],
    decision_events: [],
    materials: [],
    material_relationships: [],
    analysis_populations: [],
    data_slices: [],
    derivations: [],
    invocations: [],
    environments: [],
    random_states: [],
    analysis_runs: [],
    results: [],
    failures: [],
    evidence_items: [],
    evidence_edges: [],
    evidence_dependency_groups: [],
    claims: [],
    argument_steps: [],
    argument_edges: [],
    claim_dependencies: [],
    cross_domain_bridges: [],
    conflict_sets: [],
    conflict_member_edges: [],
    artifacts: [],
    reproducibility_units: [],
    limitations: [],
    revision_events: [],
    review_tasks: [],
    disclosure_state: {
      level: "internal",
      projection_status: "not_projected",
      withheld_field_count: 1,
      omitted_object_count: 0,
      projection_id: null,
    },
    extensions: {},
  };
  return report;
}

export function cloneReport(report: ScientificReport): ScientificReport {
  return structuredClone(report);
}
