import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { sha256 } from "../lib/hash.js";
import { loadSchemas } from "../lib/schema.js";
import { normalizeAuthoringFile, normalizeAuthoringFileToPath, normalizeAuthoringInput } from "./index.js";

const temporaryDirectories: string[] = [];

function unknown(reason: string) {
  return {
    state: "unknown",
    value: null,
    source_bindings: [],
    derivation_bindings: [],
    missing_reason: reason,
    provenance_status: "absent",
  };
}

function sourceBinding() {
  return {
    source_item_id: "source.demo",
    source_snapshot_id: "snapshot.demo",
    snapshot_registry_hash: sha256("normalizer fixture registry"),
    content_hash: sha256("normalizer fixture source"),
    excerpt_hash: sha256("normalizer fixture excerpt"),
    chunk_ids: ["chunk.demo"],
    locator: {
      locator_type: "whole_source",
      value: "whole source",
      parser_name: "fixture-parser",
      parser_version: "1.0.0",
    },
    parser_identity: {
      parser_name: "fixture-parser",
      parser_version: "1.0.0",
      configuration_hash: sha256("normalizer fixture parser configuration"),
      parser_result_id: "parser-result.demo",
    },
    binding_scope: "whole_source",
    binding_role: "direct",
  };
}

function known(value: unknown) {
  return {
    state: "known",
    value,
    source_bindings: [sourceBinding()],
    derivation_bindings: [],
    missing_reason: null,
    provenance_status: "complete",
  };
}

function authoringInput() {
  return {
    authoring_input_id: "authoring.demo",
    authoring_input_version: "1",
    schema_version: "1",
    project_id: "project.demo",
    title: "Normalizer test",
    language: "en",
    report_mode: "full-archive",
    scope: {
      scope_statement: "Normalizer test scope",
      started_at: unknown("Start time was not supplied."),
      ended_at: unknown("End time was not supplied."),
      cutoff_at: unknown("Cutoff was not supplied."),
      included_boundaries: [],
      excluded_boundaries: [],
    },
    enabled_modules: [
      {
        module_id: "core",
        protocol_version: "1",
        status: "enabled",
        applicability_decision_id: "applicability.core.always",
        detected_triggers: [],
        section_ids: [
          "identity_and_scope", "module_and_section_coverage", "source_universe_and_coverage",
          "research_questions_and_resolution", "entities_materials_and_systems", "execution_history",
          "methods_parameters_and_deviations", "results_failures_and_dispositions", "quantitative_derivations",
          "claims_arguments_and_bridges", "conflicts_counterevidence_and_uncertainty",
          "artifacts_and_reproducibility", "revisions_corrections_and_retractions",
          "disclosure_and_limitations", "validation_and_package_status",
        ],
      },
    ],
    source_coverage: {
      universe_id: "universe.demo",
      title: "Normalizer fixture source universe",
      scope_statement: "One registered source is in scope; overall completeness is not proved.",
      inclusion_boundary: "The explicitly registered demo source.",
      exclusion_boundary: "Any material not present in the demo registry.",
      cutoff: unknown("Cutoff was not supplied."),
      cutoff_event_semantics: known("The cutoff is the source-registry snapshot time."),
      authority_basis: "declared_inventory",
      authority_evidence: unknown("No authoritative registry was supplied."),
      enumeration_status: "registered_not_proven_exhaustive",
      snapshot_bindings: ["snapshot.demo"],
      item_ids: ["source.demo"],
      snapshots: [
        {
          source_snapshot_id: "snapshot.demo",
          created_at: known("2026-08-24T00:00:00Z"),
          registry_hash: unknown("No registry hash was supplied."),
          snapshot_method: known("Manual inventory"),
          source_bindings: [sourceBinding()],
        },
      ],
      items: [
        {
          source_item_id: "source.demo",
          universe_id: "universe.demo",
          source_kind: "human_declaration",
          identity: known("demo-source-identity"),
          title: known("Demo source"),
          location: unknown("Location was not supplied."),
          content_hash: unknown("Hash was not supplied."),
          registered_at: known("2026-08-24T00:00:00Z"),
          snapshot_id: "snapshot.demo",
          revision_or_snapshot: known("demo revision 1"),
          disclosure_class: "internal",
          disposition: "included",
          disposition_reason: {
            state: "not_applicable",
            value: null,
            source_bindings: [sourceBinding()],
            derivation_bindings: [],
            missing_reason: "Included sources do not require a non-inclusion reason.",
            provenance_status: "partial",
            applicability_decision_id: "applicability.source.fields",
          },
          content_access: "available",
          canonical_source_item_id: null,
          equivalence_basis: {
            state: "not_applicable",
            value: null,
            source_bindings: [sourceBinding()],
            derivation_bindings: [],
            missing_reason: "The source is not a duplicate.",
            provenance_status: "partial",
            applicability_decision_id: "applicability.source.fields",
          },
          mapped_object_ids: ["rq.local"],
          source_bindings: [sourceBinding()],
          extensions: {},
        },
      ],
      reconciliation: {
        registered: 99,
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
        scientific_incorporation: "complete_within_boundary",
      },
      report_completeness: "registered_sources_accounted_for",
      coverage_limitations: ["The declared inventory is not authoritative."],
    },
    input_chunks: [],
    id_registry: [
      {
        object_type: "research_question",
        local_key: "rq.local",
        canonical_id: "rq.canonical",
        object_version: "1",
        identity_status: "confirmed",
      },
    ],
    existing_objects: [],
    records: [
      {
        record_id: "rq.local",
        record_kind: "research-question",
        execution_assertion: "unknown",
        domain_module_id: "core",
        subject_ids: [],
        payload: {
          question: "What was observed?",
          rationale: "TBD",
        },
        source_bindings: [sourceBinding()],
        missing_fields: [],
        review_status: "review_required",
      },
      {
        record_id: "wu.local",
        record_kind: "work-unit",
        execution_assertion: "performed",
        domain_module_id: "core",
        subject_ids: [],
        payload: {
          campaign_id: "campaign.local",
          title: "Attempted work",
          execution_scope: "this-project",
        },
        source_bindings: [sourceBinding()],
        missing_fields: [],
        review_status: "unreviewed",
      },
    ],
    review_tasks: [],
    disclosure_level: "internal",
    extensions: {},
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("normalizeAuthoringInput", () => {
  it("is deterministic, does not mutate input, and uses registered identities", () => {
    const input = authoringInput();
    const before = structuredClone(input);
    const options = { createdAt: "2026-08-24T04:00:00Z" };

    const first = normalizeAuthoringInput(input, options);
    const second = normalizeAuthoringInput(input, options);

    expect(first).toEqual(second);
    expect(input).toEqual(before);
    expect(first.report.report_mode).toBe("full_archive");
    expect(first.report.research_questions).toHaveLength(1);
    expect((first.report.research_questions as Array<Record<string, unknown>>)[0]?.research_question_id).toBe("rq.canonical");
    expect((first.report.work_units as Array<Record<string, unknown>>)[0]?.work_state).toBe("attempted");
    expect((first.report.source_coverage as Record<string, unknown>).reconciliation).toMatchObject({ registered: 1, included: 1 });
    const sourceItems = (first.report.source_coverage as { items: Array<{ mapped_object_ids: string[] }> }).items;
    expect(sourceItems[0]?.mapped_object_ids).toEqual(["rq.canonical", "wu.local"]);
    expect(first.findings.some((finding) => finding.code === "NORM_PERFORMED_NOT_PROMOTED_TO_COMPLETED")).toBe(true);
    expect(first.todo.length).toBeGreaterThan(0);
    expect(first.contractValidation.input.valid).toBe(false);
    expect(first.contractValidation.input.issues.length).toBeGreaterThan(0);
    expect(first.contractValidation.output.valid).toBe(true);
    expect(loadSchemas().validateScientificReport(first.report).valid).toBe(true);
  });

  it("keeps explicit withheld semantics and removes any exposed value", () => {
    const input = authoringInput();
    const question = input.records[0];
    if (question === undefined) throw new Error("Fixture has no research-question record.");
    (question.payload as Record<string, unknown>).qualified_answer = {
      state: "withheld",
      value: "must not survive",
      source_bindings: [sourceBinding()],
      derivation_bindings: [],
      missing_reason: "Restricted by disclosure policy.",
      provenance_status: "partial",
      withholding_reason_code: "source_confidentiality",
      disclosure_decision_id: "disclosure.normalizer-test",
    };

    const result = normalizeAuthoringInput(input, { createdAt: "2026-08-24T04:00:00Z" });
    const normalizedQuestion = (result.report.research_questions as Array<Record<string, unknown>>)[0];
    expect(normalizedQuestion?.qualified_answer).toMatchObject({
      state: "withheld",
      value: null,
      missing_reason: "Restricted by disclosure policy.",
    });
    expect(result.findings.some((finding) => finding.code === "NORM_WITHHELD_VALUE_REMOVED")).toBe(true);
  });

  it("[SC-09] prevalidates authoring input and accepts every normalizer-supported canonical record kind", () => {
    const input = authoringInput();
    input.report_mode = "full_archive";
    input.records[0]!.record_kind = "research_question";
    input.records[1]!.record_kind = "work_unit";
    input.records.push({
      record_id: "invocation.local",
      record_kind: "invocation",
      execution_assertion: "unknown",
      domain_module_id: "core",
      subject_ids: [],
      payload: {
        invocation_kind: "manual_action",
        record_role: "unknown",
      },
      source_bindings: [sourceBinding()],
      missing_fields: [],
      review_status: "unreviewed",
    } as never);

    const schemaResult = loadSchemas().validate(
      "https://schemas.report-prompt.org/v1/authoring-input.schema.json",
      input,
    );
    expect(schemaResult.valid).toBe(true);
    const result = normalizeAuthoringInput(input, { createdAt: "2026-08-24T04:00:00.000Z" });
    expect(result.contractValidation.input.valid).toBe(true);
    expect(result.report.invocations).toHaveLength(1);
    expect(result.findings.some((finding) =>
      finding.code === "NORM_RECORD_UNMAPPED" && finding.record_id === "invocation.local",
    )).toBe(false);
  });

  it("uses collection-specific enums and postvalidates the normalized output", () => {
    const input = authoringInput();
    input.report_mode = "full_archive";
    input.records[0]!.record_kind = "research_question";
    input.records[1]!.record_kind = "work_unit";
    input.records.push({
      record_id: "failure.enum",
      record_kind: "failure",
      execution_assertion: "unknown",
      domain_module_id: "core",
      subject_ids: [],
      payload: {
        failure_class: "software",
        severity: "warning",
        description: "A collection-specific enum adversarial probe.",
        affected_object_id: "rq.canonical",
        work_unit_id: "wu.local",
        impact: "The run produced no accepted output.",
      },
      source_bindings: [sourceBinding()],
      missing_fields: [],
      review_status: "unreviewed",
    } as never);

    const result = normalizeAuthoringInput(input, { createdAt: "2026-08-24T04:00:00.000Z" });
    const failure = (result.report.failures as Array<Record<string, unknown>>).find(
      (record) => record.failure_event_id === "failure.enum",
    );
    expect(failure?.severity).toBe("unknown");
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "NORM_ENUM_UNSUPPORTED",
        path: "/failures/failure.enum/severity",
      }),
    ]));
    expect(result.contractValidation.output).toBeDefined();
    expect(result.findings.some((finding) => finding.code === "NORM_OUTPUT_SCHEMA")).toBe(
      !result.contractValidation.output.valid,
    );
  });

  it("surfaces a schema-invalid authoring record kind before normalization", () => {
    const input = authoringInput();
    input.records[0]!.record_kind = "totally_unknown";
    const result = normalizeAuthoringInput(input, { createdAt: "2026-08-24T04:00:00.000Z" });

    expect(result.contractValidation.input.valid).toBe(false);
    expect(result.findings.some((finding) =>
      finding.code === "NORM_INPUT_SCHEMA" && finding.path.includes("/records/"),
    )).toBe(true);
    expect(result.findings.some((finding) =>
      finding.code === "NORM_RECORD_UNMAPPED" && finding.record_id === "rq.local",
    )).toBe(true);
  });
});

describe("normalizeAuthoringFile", () => {
  it("reads without writing and provides an explicit atomic write helper", async () => {
    const directory = await mkdtemp(join(tmpdir(), "report-normalizer-"));
    temporaryDirectories.push(directory);
    const inputPath = join(directory, "authoring-input.json");
    const outputPath = join(directory, "scientific-report.json");
    await writeFile(inputPath, `${JSON.stringify(authoringInput())}\n`, "utf8");

    const readOnlyResult = await normalizeAuthoringFile(inputPath, {
      createdAt: "2026-08-24T04:00:00Z",
    });
    await expect(readFile(outputPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    const writtenResult = await normalizeAuthoringFileToPath(inputPath, outputPath, {
      createdAt: "2026-08-24T04:00:00Z",
    });
    const written = JSON.parse(await readFile(outputPath, "utf8")) as unknown;

    expect(readOnlyResult).toEqual(writtenResult);
    expect(written).toEqual(writtenResult.report);
    await expect(normalizeAuthoringFileToPath(inputPath, inputPath)).rejects.toThrow(/Refusing to overwrite/);
    await expect(normalizeAuthoringFile(inputPath, outputPath as never)).rejects.toThrow(/options must be an object/);
  });
});
