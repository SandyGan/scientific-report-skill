import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { sha256, sha256CanonicalJson } from "../lib/hash.js";
import { projectDisclosure, verifyDisclosureProjection } from "../projection/index.js";
import { loadRuleSet } from "../lib/rules.js";
import { loadSchemas } from "../lib/schema.js";
import { createExtractionCoverageAttestation } from "../lib/source-extraction.js";
import type { AxisAssessment, ScientificField, ScientificReport, SourceBinding } from "../lib/types.js";
import { validateReport, validateReportFile } from "./index.js";

const NOW = "2026-08-24T00:00:00.000Z";

function missing<T>(state: "unknown" | "withheld" = "unknown"): ScientificField<T> {
  if (state === "withheld") {
    return {
      state,
      value: null,
      source_bindings: [],
      derivation_bindings: [],
      missing_reason: "Protected coverage basis is unavailable in this projection.",
      provenance_status: "partial",
      withholding_reason_code: "source_confidentiality",
      disclosure_decision_id: "disclosure.test",
    };
  }
  return {
    state,
    value: null,
    source_bindings: [],
    derivation_bindings: [],
    missing_reason: "Not recorded.",
    provenance_status: "absent",
  };
}

function known<T>(value: T): ScientificField<T> {
  return {
    state: "known",
    value,
    source_bindings: [],
    derivation_bindings: ["derivation.test-only"],
    missing_reason: null,
    provenance_status: "complete",
  };
}

function minimalReport(): ScientificReport {
  return {
    report_id: "report.minimal",
    project_id: "project.minimal",
    report_version: "1.0.0",
    schema_version: "1.0.0",
    payload_role: "canonical_authoritative",
    title: "Minimal bounded report",
    language: "en",
    report_mode: "full_archive",
    created_at: NOW,
    scope: {
      scope_statement: "Bounded demonstration with no registered scientific work.",
      started_at: missing<string>(),
      ended_at: missing<string>(),
      cutoff_at: missing<string>(),
      included_boundaries: [],
      excluded_boundaries: [],
    },
    cutoff: missing<string>(),
    applicability_decisions: [
      {
        applicability_decision_id: "applicability.core.always",
        object_version: "1.0.0",
        target_kind: "module",
        target_pointer_or_section_id: "core",
        rule_id: "FA004",
        result: "applicable",
        evaluated_context: "The core module is mandatory.",
        evidence_bindings: [],
        decision_time: NOW,
        extensions: {},
      },
      {
        applicability_decision_id: "applicability.section.core-overview",
        object_version: "1.0.0",
        target_kind: "section",
        target_pointer_or_section_id: "core.overview",
        rule_id: "FA003",
        result: "undetermined",
        evaluated_context: "Required context is not available in the minimal fixture.",
        evidence_bindings: [],
        decision_time: NOW,
        extensions: {},
      },
    ],
    module_manifest: [
      {
        module_id: "core",
        protocol_version: "1.0.0",
        status: "enabled",
        applicability_decision_id: "applicability.core.always",
        detected_triggers: [],
        section_ids: ["core.overview"],
      },
    ],
    section_coverage: [
      {
        section_id: "core.overview",
        applicability: "undetermined",
        applicability_decision_id: "applicability.section.core-overview",
        coverage_status: "unknown",
        source_universe_ids: ["universe.minimal"],
        represented_object_ids: [],
        omission_or_gap_reasons: missing<string[]>("withheld"),
        evidence_bindings: [],
        last_evaluated_at: missing<string>(),
      },
    ],
    source_coverage: {
      universe_id: "universe.minimal",
      title: "Minimal declared source inventory",
      scope_statement: "Only explicitly registered sources are in scope.",
      inclusion_boundary: "Explicitly registered fixture sources.",
      exclusion_boundary: "All unregistered material.",
      cutoff: missing<string>(),
      cutoff_event_semantics: missing<string>(),
      authority_basis: "declared_inventory",
      authority_evidence: missing<string>(),
      enumeration_status: "registered_not_proven_exhaustive",
      snapshot_bindings: ["snapshot.minimal"],
      item_ids: [],
      snapshots: [
        {
          source_snapshot_id: "snapshot.minimal",
          created_at: missing<string>(),
          registry_hash: missing<`sha256:${string}`>(),
          snapshot_method: missing<string>(),
          source_bindings: [],
        },
      ],
      items: [],
      reconciliation: {
        registered: 0,
        terminally_disposed: 0,
        included: 0,
        excluded_with_reason: 0,
        unreadable: 0,
        inaccessible: 0,
        duplicate: 0,
        unmapped: 0,
        pending: 0,
        included_mapped: 0,
      },
      coverage_axes: {
        inventory_accounting: "complete",
        accessibility: "all_accessible",
        scientific_incorporation: "none",
      },
      report_completeness: "registered_sources_accounted_for",
      coverage_limitations: ["No authoritative source universe is available."],
    },
    research_questions: [
      {
        research_question_id: "question.minimal",
        research_question_version: "1.0.0",
        question: "What can be concluded from the registered evidence?",
        rationale: missing<string>(),
        resolution_criterion_timing: "missing",
        resolution_criteria: missing<string>(),
        resolution_status: "not_evaluable",
        qualified_answer: missing<string>(),
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
}

function executionBinding(): SourceBinding {
  return {
    source_item_id: "source.execution",
    source_snapshot_id: "snapshot.minimal",
    snapshot_registry_hash: sha256("minimal registry"),
    content_hash: sha256("execution source"),
    excerpt_hash: sha256("execution source"),
    chunk_ids: ["chunk.execution"],
    locator: { locator_type: "whole_source", value: "whole source" },
    parser_identity: {
      parser_name: "fixture-parser",
      parser_version: "1.0.0",
      configuration_hash: sha256("fixture parser configuration"),
      parser_result_id: "parser-result.execution",
    },
    binding_scope: "whole_source",
    binding_role: "direct",
  } as unknown as SourceBinding;
}

function installExecutionSource(report: ScientificReport, mappedObjectIds: string[]): void {
  const withheld = <T>(): ScientificField<T> => missing<T>("withheld");
  report.applicability_decisions.push({
    applicability_decision_id: "applicability.source.fields",
    object_version: "1.0.0",
    target_kind: "field",
    target_pointer_or_section_id: "/source_coverage/items/0/*",
    rule_id: "FA001",
    result: "not_applicable",
    evaluated_context: "The included non-duplicate source does not require exclusion or equivalence metadata.",
    evidence_bindings: [executionBinding()],
    decision_time: NOW,
    extensions: {},
  });
  report.source_coverage.items = [
    {
      source_item_id: "source.execution",
      universe_id: "universe.minimal",
      source_kind: "compute_job",
      identity: withheld<string>(),
      title: withheld<string>(),
      location: withheld<string>(),
      content_hash: withheld<`sha256:${string}`>(),
      registered_at: withheld<string>(),
      snapshot_id: "snapshot.minimal",
      revision_or_snapshot: withheld<string>(),
      disclosure_class: "internal",
      disposition: "included",
      disposition_reason: {
        state: "not_applicable",
        value: null,
        source_bindings: [],
        derivation_bindings: [],
        missing_reason: "Included sources do not need an exclusion reason.",
        provenance_status: "absent",
        applicability_decision_id: "applicability.source.fields",
      },
      content_access: "withheld",
      canonical_source_item_id: null,
      equivalence_basis: {
        state: "not_applicable",
        value: null,
        source_bindings: [],
        derivation_bindings: [],
        missing_reason: "The source is not a duplicate.",
        provenance_status: "absent",
        applicability_decision_id: "applicability.source.fields",
      },
      mapped_object_ids: mappedObjectIds,
      source_bindings: [executionBinding()],
      extensions: {},
    },
  ];
  report.source_coverage.item_ids = ["source.execution"];
  report.source_coverage.reconciliation = {
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
  };
  report.source_coverage.coverage_axes = {
    inventory_accounting: "complete",
    accessibility: "unknown",
    scientific_incorporation: "complete_within_boundary",
  };
  report.source_coverage.report_completeness = "registered_sources_accounted_for";
}

function axis(state: AxisAssessment["state"], rationale: string): AxisAssessment {
  return { state, rationale, evidence_artifact_ids: [], source_bindings: [] };
}

function validationMetadata(result: ReturnType<typeof validateReport>): Record<string, unknown> {
  const value = result.attestation.extensions["report_prompt.validation"];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Missing validation metadata");
  }
  return value;
}

describe("core report validator", () => {
  it("loads all canonical schemas, catalog rules, and default overlays", () => {
    const schemas = loadSchemas();
    const rules = loadRuleSet();

    expect(schemas.schemas.length).toBeGreaterThanOrEqual(20);
    expect(rules.registry.rules).toHaveLength(101);
    expect(rules.overlays.map((overlay) => overlay.domain)).toEqual([
      "wet_lab",
      "ai_ml",
      "molecular_dynamics",
    ]);
  });

  it("[SC-02] marks selected-rule validation incomplete and never release-eligible", () => {
    const result = validateReport(minimalReport(), {
      now: NOW,
      selectedRuleIds: ["COV001", "COV002", "ATT001"],
    });

    expect(result.schemaValid).toBe(true);
    expect(result.semanticValid).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.releaseEligible).toBe(false);
    expect(result.attestation.overall_status).toBe("incomplete");
    expect(result.attestation.scientific_payload_hash).toBe(result.payloadHash);
    expect(result.attestation.payload_hash_basis).toBe("canonical-json-v1");
    expect(result.attestation.canonicalization).toBe("sorted-keys-utf8-v1");
    expect(result.attestation.payload_byte_size).toBeGreaterThan(0);
    expect(result.attestation.schema_set_hash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(result.attestation.severity_profile).toBe("standard");
    expect(result.attestation.coverage.full_registry_coverage).toBe(false);
    expect(result.attestation.coverage.skipped_registry_rule_ids).toContain("NEG001");
    expect(result.evaluations.find((evaluation) => evaluation.rule.id === "ATT001")?.status).toBe("pass");
  });

  it("[SC-03] fails closed when a loaded rule condition differs from compiled support", () => {
    const ruleSet = structuredClone(loadRuleSet());
    ruleSet.registry.rules[0]!.condition = "always violated";

    expect(() => validateReport(minimalReport(), { now: NOW, ruleSet })).toThrow(/compiled support/iu);
  });

  it("fails closed when an overlay schema id or executable binding differs", () => {
    const ruleSet = structuredClone(loadRuleSet());
    ruleSet.overlays[0]!.payload_schema_id = "https://schemas.example.invalid/other.json";

    expect(() => validateReport(minimalReport(), { now: NOW, ruleSet })).toThrow(/compiled support binding/iu);
  });

  it("marks an explicitly skipped domain-pack check not_run and blocks release", () => {
    const result = validateReport(minimalReport(), {
      now: NOW,
      validateDomainPacks: false,
    });

    expect(result.evaluations.find((evaluation) => evaluation.rule.id === "PACK001")?.status).toBe("not_run");
    expect(result.attestation.overall_status).toBe("incomplete");
    expect(result.attestation.coverage.full_domain_coverage).toBe(false);
    expect(result.complete).toBe(false);
    expect(result.releaseEligible).toBe(false);
  });

  it("requires publication profile disclosure and accessibility prerequisites to pass", () => {
    const result = validateReport(minimalReport(), {
      now: NOW,
      severityProfile: "publication",
    });

    const profile = result.evaluations.find((evaluation) => evaluation.rule.id === "PROFILE001");
    expect(profile?.status).toBe("not_run");
    expect(profile?.message).toContain("SEC001=not_applicable");
    expect(profile?.message).toContain("A11Y001=not_applicable");
    expect(result.attestation.overall_status).toBe("incomplete");
    expect(result.releaseEligible).toBe(false);
  });

  it("requires high-assurance external attestation prerequisites", () => {
    const result = validateReport(minimalReport(), {
      now: NOW,
      severityProfile: "high_assurance",
    });

    const profile = result.evaluations.find((evaluation) => evaluation.rule.id === "PROFILE001");
    expect(profile?.status).toBe("not_run");
    expect(profile?.message).toContain("external_attestation=not_run");
    expect(result.attestation.coverage.profile_prerequisites_complete).toBe(false);
    expect(result.releaseEligible).toBe(false);
  });

  it("projects canonical known content only through explicit hash-bound field actions", () => {
    const source = minimalReport();
    source.scope.started_at = known("2025-01-02T03:04:05.000Z");
    const projected = projectDisclosure(source, {
      projectionId: "projection.round1",
      createdAt: NOW,
      policy: {
        policy_id: "policy.round1",
        policy_version: "1.0.0",
        rules: { protected_start_time: "withheld" },
      },
      instructions: [
        {
          sourcePointer: "/scope/started_at",
          action: "withheld_envelope",
          reason: "The exact internal start time is restricted.",
          policyRuleId: "policy.rule.start-time",
          withholdingReasonCode: "source_confidentiality",
          disclosureDecisionId: "disclosure.start-time",
        },
      ],
    });

    expect(projected.report.scope.started_at.state).toBe("withheld");
    expect(projected.projection.field_actions).toHaveLength(1);
    expect(projected.projection.source_payload_hash).toBe(sha256CanonicalJson(source));
    expect(projected.projection.projected_payload_hash).toBe(sha256CanonicalJson(projected.report));
    expect(verifyDisclosureProjection(source, projected.report, projected.projection)).toMatchObject({
      valid: true,
      schemaValid: true,
      issues: [],
    });
  });

  it("[SC-04] rejects a hash-consistent known-to-unknown disclosure laundering attack", () => {
    const source = minimalReport();
    source.scope.started_at = known("2025-01-02T03:04:05.000Z");
    const projected = projectDisclosure(source, {
      projectionId: "projection.laundering",
      createdAt: NOW,
      policy: {
        policy_id: "policy.round1",
        policy_version: "1.0.0",
        rules: { protected_start_time: "withheld" },
      },
      instructions: [
        {
          sourcePointer: "/scope/started_at",
          action: "withheld_envelope",
          reason: "The exact internal start time is restricted.",
          policyRuleId: "policy.rule.start-time",
          withholdingReasonCode: "source_confidentiality",
          disclosureDecisionId: "disclosure.start-time",
        },
      ],
    });
    const attackedReport = structuredClone(projected.report);
    attackedReport.scope.started_at = missing<string>();
    const attackedProjection = structuredClone(projected.projection);
    const action = attackedProjection.field_actions[0]!;
    action.action = "generalized";
    action.projected_epistemic_state = "unknown";
    action.projected_value_hash = sha256CanonicalJson(attackedReport.scope.started_at);
    attackedProjection.projected_payload_hash = sha256CanonicalJson(attackedReport);

    const verification = verifyDisclosureProjection(source, attackedReport, attackedProjection);
    expect(verification.valid).toBe(false);
    expect(verification.issues.some((issue) => issue.code === "EPISTEMIC_LAUNDERING")).toBe(true);

    const validation = validateReport(attackedReport, {
      now: NOW,
      selectedRuleIds: ["RED002", "RED004", "ATT001"],
      disclosureProjection: { sourceReport: source, projection: attackedProjection },
    });
    expect(validation.evaluations.find((evaluation) => evaluation.rule.id === "RED004")?.status).toBe("fail");
    expect(validation.releaseEligible).toBe(false);
  });

  it("marks public disclosure rules not_run without the canonical projection binding", () => {
    const source = minimalReport();
    const projected = projectDisclosure(source, {
      projectionId: "projection.binding",
      createdAt: NOW,
      policy: { policy_id: "policy.round1", policy_version: "1.0.0", rules: {} },
    });
    const unbound = validateReport(projected.report, {
      now: NOW,
      selectedRuleIds: ["RED002", "RED004", "ATT001"],
    });
    expect(unbound.evaluations.find((evaluation) => evaluation.rule.id === "RED002")?.status).toBe("not_run");
    expect(unbound.evaluations.find((evaluation) => evaluation.rule.id === "RED004")?.status).toBe("not_run");
    expect(unbound.releaseEligible).toBe(false);

    const bound = validateReport(projected.report, {
      now: NOW,
      selectedRuleIds: ["RED002", "RED004", "ATT001"],
      disclosureProjection: { sourceReport: source, projection: projected.projection },
    });
    expect(bound.evaluations.find((evaluation) => evaluation.rule.id === "RED002")?.status).toBe("pass");
    expect(bound.evaluations.find((evaluation) => evaluation.rule.id === "RED004")?.status).toBe("pass");
    expect(bound.attestation.disclosure_projection_binding).toMatchObject({
      projection_id: projected.projection.projection_id,
      source_payload_hash: projected.projection.source_payload_hash,
      projected_payload_hash: projected.projection.projected_payload_hash,
      verification_status: "pass",
    });
  });

  it("does not pass adverse-content completeness without byte-bound extraction coverage", () => {
    const report = minimalReport();
    installExecutionSource(report, ["question.minimal"]);
    report.source_coverage.items[0]!.title = known("Neutral run record");
    report.source_coverage.items[0]!.content_access = "available";
    report.source_coverage.items[0]!.content_hash = known(sha256("neutral source bytes"));

    const result = validateReport(report, {
      now: NOW,
      selectedRuleIds: ["NEG001", "EPI004", "ATT001"],
    });

    expect(result.evaluations.find((evaluation) => evaluation.rule.id === "NEG001")?.status).toBe("not_run");
    expect(result.evaluations.find((evaluation) => evaluation.rule.id === "EPI004")?.status).toBe("not_run");
    expect(result.attestation.overall_status).toBe("invalid");
    expect(result.releaseEligible).toBe(false);
  });

  it("[SC-05] finds a failed run in neutral-titled source bytes and requires a failure record", () => {
    const report = minimalReport();
    const bytes = Buffer.from("Routine execution note. The run failed after the control check.\n", "utf8");
    installExecutionSource(report, ["question.minimal"]);
    const source = report.source_coverage.items[0]!;
    source.title = known("Routine execution note");
    source.content_access = "available";
    source.content_hash = known(sha256(bytes));
    (source as unknown as Record<string, unknown>).extraction_coverage_attestation = createExtractionCoverageAttestation(
      source.source_item_id,
      source.snapshot_id,
      bytes,
      { createdAt: NOW },
    );

    const result = validateReport(report, {
      now: NOW,
      selectedRuleIds: ["NEG001", "ATT001"],
    });

    expect(result.schemaValid).toBe(true);
    expect(result.evaluations.find((evaluation) => evaluation.rule.id === "NEG001")?.status).toBe("fail");
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: "NEG001",
        affectedObjectIds: ["source.execution"],
      }),
    ]));
    expect(result.findings.some((finding) => finding.message.includes("failed_attempt") && finding.message.includes("bytes"))).toBe(true);
  });

  it("[renderer-absolute-path-root-bypass] blocks uncommon POSIX roots in a public scientific payload", () => {
    const source = minimalReport();
    const projected = projectDisclosure(source, {
      projectionId: "projection.absolute-path",
      createdAt: NOW,
      policy: { policy_id: "policy.round1", policy_version: "1.0.0", rules: {} },
    });
    projected.report.title = "Internal export at /opt/acme/private/source.txt";

    const result = validateReport(projected.report, {
      now: NOW,
      selectedRuleIds: ["RED001", "ATT001"],
    });
    expect(result.schemaValid).toBe(true);
    expect(result.evaluations.find((evaluation) => evaluation.rule.id === "RED001")?.status).toBe("fail");
    expect(result.findings.some((finding) =>
      finding.ruleId === "RED001" && finding.message.includes("host-local absolute filesystem"),
    )).toBe(true);
  });

  it("automates every applicable catalog rule instead of asserting unrun checks as passes", () => {
    const result = validateReport(minimalReport(), { now: NOW });
    const metadata = validationMetadata(result);
    const notYetAutomated = metadata.not_yet_automated_rule_ids;

    expect(result.schemaValid).toBe(true);
    expect(result.attestation.overall_status).toBe("valid");
    expect(result.attestation.summary.not_run).toBe(0);
    expect(result.attestation.coverage).toMatchObject({
      registry_rule_count: 101,
      full_registry_coverage: true,
      full_domain_coverage: true,
      profile_prerequisites_complete: true,
      release_coverage_complete: true,
    });
    expect(notYetAutomated).toEqual([]);
    expect(result.evaluations.filter((evaluation) => evaluation.applicable && !evaluation.automated)).toEqual([]);
  });

  it("reconciles source counts instead of trusting declared totals", () => {
    const report = minimalReport();
    report.source_coverage.reconciliation.registered = 1;
    const result = validateReport(report, {
      now: NOW,
      selectedRuleIds: ["COV001", "ATT001"],
    });

    expect(result.schemaValid).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.findings.some((finding) => finding.ruleId === "COV001")).toBe(true);
    expect(result.attestation.overall_status).toBe("invalid");
  });

  it("detects a successful later attempt with no retained retry chain", () => {
    const report = minimalReport();
    report.campaigns = [
      {
        campaign_id: "campaign.retry",
        campaign_version: "1.0.0",
        title: "Retry history",
        objective: missing<string>(),
        work_state: "attempted",
        execution_scope: "this_project",
        work_unit_ids: ["work.retry"],
        source_bindings: [],
        extensions: {},
      },
    ];
    report.work_units = [
      {
        work_unit_id: "work.retry",
        work_unit_version: "1.0.0",
        campaign_id: "campaign.retry",
        title: "Preserve retry history",
        objective: missing<string>(),
        work_state: "attempted",
        execution_scope: "this_project",
        completion_criterion_timing: "missing",
        completion_criteria: missing<string>(),
        completion_assessment: missing<string>(),
        completion_evidence: [],
        attempt_ids: ["attempt.failed", "attempt.success"],
        method_ids: [],
        decision_event_ids: [],
        input_entity_ids: [],
        output_object_ids: [],
        source_bindings: [],
        extensions: {},
      },
    ];
    report.attempts = [
      {
        attempt_id: "attempt.failed",
        attempt_version: "1.0.0",
        work_unit_id: "work.retry",
        attempt_ordinal: 1,
        execution_scope: "this_project",
        attempt_outcome: "failed",
        started_at: missing<string>("withheld"),
        ended_at: missing<string>("withheld"),
        method_ids: [],
        parameter_set: [],
        input_material_ids: [],
        input_artifact_ids: [],
        segment_ids: [],
        result_ids: [],
        failure_event_ids: ["failure.first"],
        output_artifact_ids: [],
        usable_output_status: "not_usable",
        superseded_by_attempt_id: null,
        source_bindings: [executionBinding()],
        extensions: {},
      },
      {
        attempt_id: "attempt.success",
        attempt_version: "1.0.0",
        work_unit_id: "work.retry",
        attempt_ordinal: 2,
        execution_scope: "this_project",
        attempt_outcome: "succeeded",
        started_at: missing<string>("withheld"),
        ended_at: missing<string>("withheld"),
        method_ids: [],
        parameter_set: [],
        input_material_ids: [],
        input_artifact_ids: [],
        segment_ids: [],
        result_ids: [],
        failure_event_ids: [],
        output_artifact_ids: [],
        usable_output_status: "usable",
        superseded_by_attempt_id: null,
        source_bindings: [executionBinding()],
        extensions: {},
      },
    ];
    report.failures = [
      {
        failure_event_id: "failure.first",
        failure_event_version: "1.0.0",
        failure_class: "software",
        severity: "recoverable",
        description: "The first attempt failed.",
        onset_or_detection: missing<string>("withheld"),
        affected_object_id: "attempt.failed",
        work_unit_id: "work.retry",
        attempt_id: "attempt.failed",
        segment_id: null,
        related_object_ids: ["attempt.failed"],
        partial_result_ids: [],
        impact: "No usable output was produced.",
        resolution_status: "resolved_for_future_attempts",
        recovery_attempt_ids: [],
        evidence_bindings: [executionBinding()],
        extensions: {},
      },
    ];
    installExecutionSource(report, [
      "campaign.retry",
      "work.retry",
      "attempt.failed",
      "attempt.success",
      "failure.first",
    ]);

    const result = validateReport(report, {
      now: NOW,
      selectedRuleIds: ["WRK003", "ATT001"],
    });

    expect(result.schemaValid).toBe(true);
    expect(result.findings.some((finding) => finding.ruleId === "WRK003")).toBe(true);
  });

  it("detects cycles in the combined claim and argument dependency graph", () => {
    const report = minimalReport();
    const claim = (id: string, dependencyId: string): ScientificReport["claims"][number] => ({
      claim_id: id,
      object_version: "1.0.0",
      proposition: `Background proposition ${id}.`,
      claim_type: "background",
      subject_bindings: [
        { object_type: "research_question", object_id: "question.minimal", object_version: "1.0.0" },
      ],
      context: missing<string>(),
      scope: missing<string>(),
      decision_timing: "missing",
      support_status: "unknown",
      evidence_edge_ids: [],
      dependency_edge_ids: [dependencyId],
      counterevidence_edge_ids: [],
      argument_step_ids: [],
      cross_domain_bridge_ids: [],
      conflict_set_ids: [],
      limitation_ids: [],
      revision_event_ids: [],
      source_bindings: [],
      extensions: {},
    });
    report.claims = [claim("claim.a", "dependency.ba"), claim("claim.b", "dependency.ab")];
    report.claim_dependencies = [
      {
        claim_dependency_id: "dependency.ab",
        dependency_version: "1.0.0",
        upstream_claim_id: "claim.a",
        upstream_claim_version: "1.0.0",
        downstream_claim_id: "claim.b",
        downstream_claim_version: "1.0.0",
        dependency_kind: "logical_prerequisite",
        propagation_policy: "require_review",
        dependency_status: "active",
        source_bindings: [],
      },
      {
        claim_dependency_id: "dependency.ba",
        dependency_version: "1.0.0",
        upstream_claim_id: "claim.b",
        upstream_claim_version: "1.0.0",
        downstream_claim_id: "claim.a",
        downstream_claim_version: "1.0.0",
        dependency_kind: "logical_prerequisite",
        propagation_policy: "require_review",
        dependency_status: "active",
        source_bindings: [],
      },
    ];

    const result = validateReport(report, {
      now: NOW,
      selectedRuleIds: ["CLM002", "ATT001"],
    });

    expect(result.schemaValid).toBe(true);
    expect(result.findings.some((finding) => finding.ruleId === "CLM002")).toBe(true);
  });

  it("[SC-06] rejects a quantitative claim supported only by a whole-source locator", () => {
    const report = minimalReport();
    installExecutionSource(report, ["evidence.quantitative", "claim.quantitative"]);
    report.evidence_items = [
      {
        evidence_item_id: "evidence.quantitative",
        evidence_item_version: "1.0.0",
        evidence_kind: "source_statement",
        summary: "The source states a quantitative estimate without a derivation record.",
        result_ids: [],
        artifact_ids: [],
        data_slice_ids: [],
        derivation_ids: [],
        analysis_run_ids: [],
        source_item_ids: ["source.execution"],
        evidence_status: "active",
        quality_assessment: "moderate",
        dependency_group_ids: [],
        source_bindings: [executionBinding()],
        extensions: {},
      },
    ];
    report.evidence_edges = [
      {
        evidence_edge_id: "edge.quantitative",
        evidence_item_id: "evidence.quantitative",
        claim_id: "claim.quantitative",
        relationship: "supports",
        dependency_group_id: null,
        weighting_note: missing<string>(),
        source_bindings: [executionBinding()],
      },
    ];
    report.claims = [
      {
        claim_id: "claim.quantitative",
        object_version: "1.0.0",
        proposition: "The measured effect was 42 percent.",
        claim_type: "quantitative",
        subject_bindings: [
          { object_type: "research_question", object_id: "question.minimal", object_version: "1.0.0" },
        ],
        context: missing<string>(),
        scope: missing<string>(),
        decision_timing: "missing",
        support_status: "supported",
        evidence_edge_ids: ["edge.quantitative"],
        dependency_edge_ids: [],
        counterevidence_edge_ids: [],
        argument_step_ids: [],
        cross_domain_bridge_ids: [],
        conflict_set_ids: [],
        limitation_ids: [],
        revision_event_ids: [],
        source_bindings: [executionBinding()],
        extensions: {},
      },
    ];

    const result = validateReport(report, {
      now: NOW,
      selectedRuleIds: ["DER001", "ATT001"],
    });

    expect(result.schemaValid).toBe(true);
    expect(result.evaluations.find((evaluation) => evaluation.rule.id === "DER001")?.status).toBe("fail");
    expect(result.findings.some((finding) =>
      finding.ruleId === "DER001" && finding.message.includes("neither closed quantitative result/derivation evidence nor an exact immutable external locator"),
    )).toBe(true);
  });

  it("blocks computational provenance with no reproducibility unit or explicit gap", () => {
    const report = minimalReport();
    report.invocations = [
      {
        invocation_id: "invocation.key-computation",
        invocation_version: "1.0.0",
        invocation_kind: "manual_action",
        record_role: "historical_actual",
        executable: missing<string>(),
        arguments: [],
        command_line: missing<string>(),
        working_directory: missing<string>(),
        parameters: [],
        input_artifact_ids: [],
        output_artifact_ids: ["artifact.key-computation"],
        started_at: missing<string>(),
        ended_at: missing<string>(),
        termination_status: "unknown",
        exit_code: missing<number>(),
        log_artifact_ids: [],
        source_bindings: [],
        extensions: {},
      },
    ];
    report.artifacts = [
      {
        artifact_id: "artifact.key-computation",
        artifact_version: "1.0.0",
        artifact_role: "result_output",
        media_type: known("application/json"),
        location: known("artifacts/key-computation.json"),
        content_hash: known(sha256("key computation output")),
        byte_size: known(128),
        access_state: "open",
        disclosure_class: "internal",
        created_at: known(NOW),
        source_item_ids: ["source.execution"],
        derivation_ids: [],
        analysis_run_ids: [],
        supersedes_artifact_ids: [],
        extensions: {},
      },
    ];
    installExecutionSource(report, [
      "question.minimal",
      "invocation.key-computation",
      "artifact.key-computation",
    ]);

    const uncovered = validateReport(report, {
      now: NOW,
      selectedRuleIds: ["REP006", "ATT001"],
    });
    expect(uncovered.schemaValid).toBe(true);
    expect(uncovered.findings.some((finding) =>
      finding.ruleId === "REP006" && finding.affectedObjectIds.includes("invocation.key-computation"),
    )).toBe(true);

    const gapUnit = {
      reproducibility_unit_id: "repro.key-computation-gap",
      object_version: "1.0.0",
      title: "Explicit gap for key computation",
      unit_kind: "integrated_workflow" as const,
      criticality: "critical" as const,
      scope: missing<string>(),
      covered_work_unit_ids: [],
      covered_analysis_run_ids: [],
      covered_claim_ids: [],
      covered_output_ids: ["artifact.key-computation"],
      historical_invocation_ids: ["invocation.key-computation"],
      recipe_id: null,
      input_closure: axis("unknown", "Input closure is not established."),
      artifact_closure: axis("unknown", "Artifact closure is not established."),
      environment_record: { record_id: null, assessment: axis("unknown", "Environment is not established.") },
      random_state_record: { record_id: null, assessment: axis("unknown", "Random state is not established.") },
      access_assessment: { status: "unknown" as const, conditions: missing<string>(), artifact_ids: [], source_bindings: [] },
      comparison_specification: {
        comparator_id: "comparator.not-run",
        timing_classification: "missing" as const,
        comparator_type: "manual_protocol_criteria" as const,
        targets: missing<string[]>(),
        equivalence_definition: missing<string>(),
        tolerances: missing<string>(),
        allowed_nondeterminism: missing<string>(),
        failure_conditions: missing<string[]>(),
        source_bindings: [],
      },
      replay_events: [],
      independent_reproduction_events: [],
      axis_assessments: {
        provenance_closure: axis("unknown", "Not established."),
        recipe_fidelity: axis("unknown", "Not established."),
        data_and_artifact_access: axis("unknown", "Not established."),
        environment_capture: axis("unknown", "Not established."),
        random_state_capture: axis("unknown", "Not established."),
        replay_verification: axis("unknown", "Not established."),
        independent_computational_reproduction: axis("unknown", "Not established."),
        independent_experimental_replication: axis("not_applicable", "This is computational work."),
        claim_and_output_coverage: axis("partial", "The explicit gap is denominator-accounted."),
      },
      conservative_level: "not_assessed" as const,
      level_reason: "A source-bound gap is recorded instead of a reproducibility claim.",
      limitation_ids: [],
      source_bindings: [executionBinding()],
      extensions: {},
      coverage_disposition: {
        status: "explicit_gap",
        justification: "The historical invocation record is incomplete; this key computation remains an explicit gap.",
        source_bindings: [executionBinding()],
      },
    };
    report.reproducibility_units = [gapUnit as unknown as ScientificReport["reproducibility_units"][number]];
    const accounted = validateReport(report, {
      now: NOW,
      selectedRuleIds: ["REP006", "ATT001"],
    });
    expect(accounted.schemaValid).toBe(true);
    expect(accounted.evaluations.find((evaluation) => evaluation.rule.id === "REP006")?.status).toBe("pass");
  });

  it("caps an unsupported reproducibility level instead of echoing it", () => {
    const report = minimalReport();
    report.reproducibility_units = [
      {
        reproducibility_unit_id: "repro.overstated",
        object_version: "1.0.0",
        title: "Overstated unit",
        unit_kind: "integrated_workflow",
        criticality: "critical",
        scope: missing<string>(),
        covered_work_unit_ids: [],
        covered_analysis_run_ids: [],
        covered_claim_ids: ["claim.not-declared"],
        covered_output_ids: [],
        historical_invocation_ids: [],
        recipe_id: "recipe.missing",
        input_closure: axis("satisfied", "Declared complete."),
        artifact_closure: axis("satisfied", "Declared complete."),
        environment_record: { record_id: null, assessment: axis("satisfied", "Declared complete.") },
        random_state_record: { record_id: null, assessment: axis("satisfied", "Declared complete.") },
        access_assessment: { status: "available_now", conditions: missing<string>(), artifact_ids: [], source_bindings: [] },
        comparison_specification: {
          comparator_id: "comparator.missing",
          timing_classification: "predefined",
          comparator_type: "canonical_record_identical",
          targets: known(["claim.not-declared"]),
          equivalence_definition: known("Exact match"),
          tolerances: missing<string>(),
          allowed_nondeterminism: known("None"),
          failure_conditions: known(["Any difference"]),
          source_bindings: [],
        },
        replay_events: [],
        independent_reproduction_events: [],
        axis_assessments: {
          provenance_closure: axis("satisfied", "Declared complete."),
          recipe_fidelity: axis("satisfied", "Declared complete."),
          data_and_artifact_access: axis("satisfied", "Declared complete."),
          environment_capture: axis("satisfied", "Declared complete."),
          random_state_capture: axis("satisfied", "Declared complete."),
          replay_verification: axis("satisfied", "Declared complete."),
          independent_computational_reproduction: axis("satisfied", "Declared complete."),
          independent_experimental_replication: axis("not_applicable", "Not applicable."),
          claim_and_output_coverage: axis("satisfied", "Declared complete."),
        },
        conservative_level: "R3_independent_reproduction",
        level_reason: "Declared R3 without supporting records.",
        limitation_ids: [],
        source_bindings: [],
        extensions: {},
      },
    ];

    const result = validateReport(report, {
      now: NOW,
      selectedRuleIds: ["REP001", "ATT001"],
    });

    expect(result.schemaValid).toBe(true);
    expect(result.findings.some((finding) => finding.ruleId === "REP001")).toBe(true);
    expect(result.reproducibilitySummary?.levelBasis).toBe("validator_supported");
    expect(result.reproducibilitySummary?.conservativeCriticalLowerBound).toEqual({
      state: "known",
      value: "not_assessed",
    });
  });

  it("binds validateReportFile attestations to exact file bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "report-prompt-validator-"));
    try {
      const path = join(directory, "scientific-report.json");
      const bytes = Buffer.from(`${JSON.stringify(minimalReport(), null, 2)}\n`, "utf8");
      await writeFile(path, bytes);
      const result = await validateReportFile(path, {
        now: NOW,
        selectedRuleIds: ["ATT001"],
      });

      expect(result.payloadHashBasis).toBe("exact-file-bytes");
      expect(result.payloadHash).toBe(sha256(bytes));
      expect(result.attestation.scientific_payload_hash).toBe(sha256(bytes));
      expect(validationMetadata(result).payload_byte_size).toBe(bytes.byteLength);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
