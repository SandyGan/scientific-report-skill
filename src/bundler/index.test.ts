import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { createAuthoringScaffold } from "../cli/index.js";
import { normalizeAuthoringInput } from "../normalizer/index.js";
import { projectDisclosure, type DisclosureProjectionRecord } from "../projection/index.js";
import { renderReport } from "../renderer/index.js";
import type { ScientificReport } from "../lib/types.js";
import { replayReadyReport } from "../../tests/reproducibility/fixtures.js";
import { validateReport } from "../validator/index.js";
import { verifyBundle } from "../verifier/index.js";
import {
  assertNormalizedRelativePosixPath,
  assertUniquePortablePaths,
  bundleDirectory,
  normalizeRelativePosixPath,
  sha256File,
} from "./index.js";

const temporaryRoots: string[] = [];
const FIXED_TIME = "2026-08-24T00:00:00.000Z";

async function temporaryDirectory(label: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), `report-prompt-${label}-`));
  temporaryRoots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function renderedNonvalidReport(): Promise<{
  renderedDirectory: string;
  validationStatus: string;
}> {
  const scaffold = createAuthoringScaffold({ title: "Bundle integration fixture", language: "en" });
  const normalized = normalizeAuthoringInput(scaffold, {
    createdAt: FIXED_TIME,
    reportId: "report_bundle_fixture",
    reportVersion: "1",
  });
  const canonicalReport = normalized.report as unknown as ScientificReport;
  const report = canonicalReport as unknown as Record<string, unknown>;
  report.research_questions = [
    {
      research_question_id: "rq_bundle_fixture",
      research_question_version: "1",
      question: "What can be concluded from the currently registered evidence?",
      rationale: {
        state: "unknown",
        value: null,
        source_bindings: [],
        derivation_bindings: [],
        missing_reason: "No rationale has been source-bound.",
        provenance_status: "absent",
      },
      resolution_criterion_timing: "missing",
      resolution_criteria: {
        state: "unknown",
        value: null,
        source_bindings: [],
        derivation_bindings: [],
        missing_reason: "No resolution criteria have been supplied.",
        provenance_status: "absent",
      },
      resolution_status: "not_evaluable",
      qualified_answer: {
        state: "unknown",
        value: null,
        source_bindings: [],
        derivation_bindings: [],
        missing_reason: "The question is not evaluable without registered evidence.",
        provenance_status: "absent",
      },
      claim_ids: [],
      limitation_ids: [],
      source_bindings: [],
      extensions: {},
    },
  ];
  report.extensions = { history_rewritten: true };
  const projected = projectDisclosure(canonicalReport, {
    projectionId: "projection_bundle_fixture",
    createdAt: FIXED_TIME,
    policy: {
      policy_id: "policy_bundle_fixture",
      policy_version: "1",
      rules: { default_action: "retain_public_scientific_fields" },
    },
  });

  const validation = validateReport(projected.report, {
    now: FIXED_TIME,
    disclosureProjection: {
      sourceReport: canonicalReport,
      projection: projected.projection,
    },
  });
  expect(validation.schemaValid).toBe(true);
  expect(validation.complete).toBe(true);
  expect(validation.valid).toBe(false);
  expect(validation.findings).toEqual(
    expect.arrayContaining([expect.objectContaining({ ruleId: "MOD005" })]),
  );
  const renderedDirectory = await temporaryDirectory("rendered");
  const rendered = await renderReport(projected.report, {
    outDir: renderedDirectory,
    attestation: validation.attestation,
  });
  await writeFile(
    path.join(renderedDirectory, "disclosure-projection.json"),
    `${JSON.stringify(projected.projection, null, 2)}\n`,
    "utf8",
  );
  expect(rendered.validationAttestationBound).toBe(true);
  return {
    renderedDirectory,
    validationStatus: validation.attestation.overall_status,
  };
}

async function renderedReleaseExample(): Promise<{
  renderedDirectory: string;
  report: Record<string, unknown>;
  attestation: Record<string, unknown>;
}> {
  const exampleRoot = path.resolve(fileURLToPath(new URL("../../examples/cross-domain/", import.meta.url)));
  const [source, report, projection] = await Promise.all([
    readFile(path.join(exampleRoot, "scientific-report.canonical.json"), "utf8").then((value) => JSON.parse(value) as ScientificReport),
    readFile(path.join(exampleRoot, "scientific-report.json"), "utf8").then((value) => JSON.parse(value) as Record<string, unknown>),
    readFile(path.join(exampleRoot, "disclosure-projection.json"), "utf8").then((value) => JSON.parse(value) as Record<string, unknown>),
  ]);
  const validation = validateReport(report, {
    now: FIXED_TIME,
    disclosureProjection: {
      sourceReport: source,
      projection: projection as unknown as DisclosureProjectionRecord,
    },
  });
  expect(validation.releaseEligible).toBe(true);
  const renderedDirectory = await temporaryDirectory("release-rendered");
  await renderReport(report, { outDir: renderedDirectory, attestation: validation.attestation });
  await writeFile(
    path.join(renderedDirectory, "disclosure-projection.json"),
    `${JSON.stringify(projection, null, 2)}\n`,
    "utf8",
  );
  return {
    renderedDirectory,
    report,
    attestation: validation.attestation as unknown as Record<string, unknown>,
  };
}

function reviewKnown(value: string | string[]): Record<string, unknown> {
  const hash = `sha256:${"a".repeat(64)}`;
  return {
    state: "known",
    value,
    source_bindings: [{
      source_item_id: "source.review",
      source_snapshot_id: "snapshot.review",
      snapshot_registry_hash: hash,
      content_hash: hash,
      excerpt_hash: hash,
      chunk_ids: ["chunk.review"],
      locator: { locator_type: "whole_source", value: "review record" },
      parser_identity: {
        parser_name: "review-parser",
        parser_version: "1",
        configuration_hash: hash,
        parser_result_id: "parser-result.review",
      },
      binding_scope: "whole_source",
      binding_role: "direct",
    }],
    derivation_bindings: [],
    missing_reason: null,
    provenance_status: "complete",
  };
}

describe("portable package paths", () => {
  it("accepts canonical relative POSIX paths and rejects unsafe representations", () => {
    expect(normalizeRelativePosixPath("annex/records.html")).toBe("annex/records.html");
    expect(() => assertNormalizedRelativePosixPath("../escape.json")).toThrow();
    expect(() => assertNormalizedRelativePosixPath("assets\\report.js")).toThrow();
    expect(() => assertNormalizedRelativePosixPath("/absolute/report.html")).toThrow();
    expect(() => assertNormalizedRelativePosixPath("annex//records.html")).toThrow();
  });

  it("rejects duplicate and case-colliding manifest paths", () => {
    expect(() => assertUniquePortablePaths(["report.html", "report.html"])).toThrow(/Duplicate/u);
    expect(() => assertUniquePortablePaths(["assets/report.css", "ASSETS/REPORT.CSS"])).toThrow(
      /case-insensitive/u,
    );
  });
});

describe("bundle construction and verification", () => {
  it("hashes final bytes and verifies an honestly nonvalid working package in integrity mode", async () => {
    const rendered = await renderedNonvalidReport();
    const output = path.join(await temporaryDirectory("output-parent"), "bundle");
    const bundled = await bundleDirectory(rendered.renderedDirectory, output, {
      packageId: "pkg_bundle_fixture",
      createdAt: FIXED_TIME,
      extensions: {
        artifact_mode: "working_copy",
        release_notice: "NOT RELEASE-ELIGIBLE — NONVALID WORKING COPY",
        release_status: "not_release_eligible",
      },
    });

    expect(bundled.manifest.files.map((member) => member.path)).toEqual(
      [...bundled.manifest.files.map((member) => member.path)].sort(),
    );
    expect(bundled.manifest.files.some((member) => member.path === "package-manifest.json")).toBe(false);
    expect(bundled.manifest.scientific_payload_hash).toMatch(/^sha256:[0-9a-f]{64}$/u);

    const integrity = await verifyBundle(output, { requireValidAttestation: false });
    expect(integrity.ok).toBe(true);
    expect(integrity.findings.some((finding) => finding.severity === "error")).toBe(false);
    expect(integrity.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "WORKING_COPY_MODE" })]),
    );

    const releaseVerification = await verifyBundle(output);
    expect(releaseVerification.ok).toBe(false);
    expect(releaseVerification.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ATTESTATION_NOT_VALID" }),
        expect.objectContaining({ code: "WORKING_COPY_NOT_RELEASE_ELIGIBLE" }),
      ]),
    );
    expect(rendered.validationStatus).not.toBe("valid");
  }, 10_000);

  it("detects byte tampering after the manifest is written", async () => {
    const rendered = await renderedNonvalidReport();
    const output = path.join(await temporaryDirectory("tamper-parent"), "bundle");
    await bundleDirectory(rendered.renderedDirectory, output, { createdAt: FIXED_TIME });
    await writeFile(path.join(output, "report.html"), "tampered\n", "utf8");

    const result = await verifyBundle(output, { requireValidAttestation: false });
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "CONTENT_HASH_MISMATCH", path: "report.html" })]),
    );
  });

  it("redacts a malformed withheld value from verifier diagnostics", async () => {
    const rendered = await renderedNonvalidReport();
    const output = path.join(await temporaryDirectory("withheld-parent"), "bundle");
    await bundleDirectory(rendered.renderedDirectory, output, { createdAt: FIXED_TIME });

    const payloadPath = path.join(output, "scientific-report.public.json");
    const payload = JSON.parse(await readFile(payloadPath, "utf8")) as {
      research_questions: Array<{ rationale: { state: string; value: unknown } }>;
    };
    const protectedMarker = "DO_NOT_LEAK_WITHHELD_VALUE";
    const rationale = payload.research_questions[0]?.rationale;
    if (rationale === undefined) throw new Error("Fixture rationale is missing.");
    rationale.state = "withheld";
    rationale.value = protectedMarker;
    await writeFile(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    const result = await verifyBundle(output, { requireValidAttestation: false });
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MISSINGNESS_VALUE_LEAK" })]),
    );
    expect(JSON.stringify(result)).not.toContain(protectedMarker);
  });

  it("rejects symbolic links and remote executable dependencies", async () => {
    const rendered = await renderedNonvalidReport();
    const symlinkTarget = path.join(rendered.renderedDirectory, "host-link");
    await symlink("/etc/hosts", symlinkTarget);
    const symlinkOutput = path.join(await temporaryDirectory("symlink-parent"), "bundle");
    await expect(bundleDirectory(rendered.renderedDirectory, symlinkOutput)).rejects.toMatchObject({
      code: "SYMLINK",
    });
    await rm(symlinkTarget);

    const reportPath = path.join(rendered.renderedDirectory, "report.html");
    const reportHtml = await readFile(reportPath, "utf8");
    const protectedQuery = "DO_NOT_LEAK_URL_QUERY";
    await writeFile(
      reportPath,
      reportHtml.replace(
        "</body>",
        `<script src="https://example.invalid/active.js?token=${protectedQuery}"></script></body>`,
      ),
      "utf8",
    );
    const remoteOutput = path.join(await temporaryDirectory("remote-parent"), "bundle");
    let remoteError: unknown;
    try {
      await bundleDirectory(rendered.renderedDirectory, remoteOutput);
    } catch (error) {
      remoteError = error;
    }
    expect(remoteError).toMatchObject({ code: "UNSAFE_CONTENT" });
    expect(String(remoteError)).not.toContain(protectedQuery);
  });

  it("[PT-01] rejects a benign-manifest rebundle when HTML contradicts the scientific payload", async () => {
    const rendered = await renderedReleaseExample();
    const honestBundle = path.join(await temporaryDirectory("honest-release-parent"), "bundle");
    await bundleDirectory(rendered.renderedDirectory, honestBundle, { createdAt: FIXED_TIME });
    await rm(path.join(honestBundle, "package-manifest.json"));
    const reportPath = path.join(honestBundle, "report.html");
    const original = await readFile(reportPath, "utf8");
    await writeFile(
      reportPath,
      original.replace("</body>", "<p>A false causal conclusion absent from the public payload.</p></body>"),
      "utf8",
    );
    const output = path.join(await temporaryDirectory("contradictory-html-parent"), "bundle");

    await expect(bundleDirectory(honestBundle, output, { createdAt: FIXED_TIME }))
      .rejects.toMatchObject({ code: "UNSAFE_CONTENT", memberPath: "report.html" });
  });

  it("[PT-06] qualifies allow-extra-files as integrity-only and lists every unverified path", async () => {
    const rendered = await renderedNonvalidReport();
    const output = path.join(await temporaryDirectory("allow-extra-parent"), "bundle");
    await bundleDirectory(rendered.renderedDirectory, output, {
      createdAt: FIXED_TIME,
      extensions: { artifact_mode: "working_copy", release_status: "not_release_eligible" },
    });
    await writeFile(path.join(output, "unmanifested-note.txt"), "not integrity listed\n", "utf8");

    const result = await verifyBundle(output, {
      requireValidAttestation: false,
      rejectExtraFiles: false,
    });
    expect(result.ok).toBe(true);
    expect(result.verificationMode).toBe("integrity_only");
    expect(result.releaseEligible).toBe(false);
    expect(result.unverifiedPaths).toEqual(["unmanifested-note.txt"]);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "EXTRA_FILES_NOT_VERIFIED", severity: "information" }),
    ]));
  });

  it("[human-review-cross-file-binding] rejects an approving attestation for unrelated package bytes", async () => {
    const rendered = await renderedReleaseExample();
    const payloadDigest = await sha256File(path.join(rendered.renderedDirectory, "scientific-report.public.json"));
    const validationDigest = await sha256File(path.join(rendered.renderedDirectory, "validation-attestation.json"));
    const humanReview = {
      human_review_attestation_id: "human-review.unrelated",
      attestation_version: "1",
      schema_version: "1",
      report_id: "report.unrelated",
      report_version: "9",
      scientific_payload_hash: `sha256:${"0".repeat(64)}`,
      validation_attestation_id: "attestation.unrelated",
      validation_attestation_hash: `sha256:${"1".repeat(64)}`,
      validation_status_observed: "valid",
      review_scope: "full_scientific_payload",
      reviewers: [{
        reviewer_id: "reviewer.fixture",
        display_name: reviewKnown("Fixture reviewer"),
        role: "scientific_lead",
        affiliation: reviewKnown("Fixture group"),
        expertise: reviewKnown(["scientific review"]),
        conflict_of_interest: reviewKnown("No conflict declared."),
        identity_verification_status: "self_declared",
      }],
      review_checks: [{
        review_check_id: "review-check.fixture",
        category: "scope_and_source_coverage",
        decision: "confirmed",
        reviewer_ids: ["reviewer.fixture"],
        affected_object_ids: ["report.unrelated"],
        comment: "An unrelated report was reviewed.",
        completed_at: FIXED_TIME,
      }],
      review_started_at: FIXED_TIME,
      review_completed_at: FIXED_TIME,
      overall_decision: "approve",
      conditions: [],
      unresolved_review_task_ids: [],
      signatures: [{
        reviewer_id: "reviewer.fixture",
        signature_method: "fixture-signature",
        signature_value: "fixture-signature-value",
        signed_at: FIXED_TIME,
      }],
      extensions: {
        actual_payload_hash_for_probe: payloadDigest.contentHash,
        actual_validation_hash_for_probe: validationDigest.contentHash,
      },
    };
    await writeFile(
      path.join(rendered.renderedDirectory, "human-review-attestation.json"),
      `${JSON.stringify(humanReview, null, 2)}\n`,
      "utf8",
    );
    const output = path.join(await temporaryDirectory("human-mismatch-parent"), "bundle");
    await bundleDirectory(rendered.renderedDirectory, output, { createdAt: FIXED_TIME });

    const verification = await verifyBundle(output);
    expect(verification.ok).toBe(false);
    expect(verification.findings.filter((finding) =>
      finding.code === "IDENTITY_MISMATCH" && finding.message.includes("human review"),
    )).toHaveLength(5);
  });

  it("[REPRO-003] refuses a bundle that omits a declared public available R1 dependency", async () => {
    const canonical = replayReadyReport();
    const makeWithheldPublicSafe = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(makeWithheldPublicSafe);
        return;
      }
      if (value === null || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      if (record.state === "withheld" && Object.hasOwn(record, "value")) {
        record.source_bindings = [];
        record.derivation_bindings = [];
        record.provenance_status = "absent";
      }
      Object.values(record).forEach(makeWithheldPublicSafe);
    };
    makeWithheldPublicSafe(canonical);
    const projected = projectDisclosure(canonical, {
      projectionId: "projection.r1-omission",
      createdAt: FIXED_TIME,
      policy: { policy_id: "policy.r1-omission", policy_version: "1", rules: { default_action: "retain" } },
    });
    const validation = validateReport(projected.report, {
      now: FIXED_TIME,
      disclosureProjection: { sourceReport: canonical, projection: projected.projection },
    });
    const renderedDirectory = await temporaryDirectory("r1-omission-rendered");
    await renderReport(projected.report, { outDir: renderedDirectory, attestation: validation.attestation });
    await writeFile(
      path.join(renderedDirectory, "disclosure-projection.json"),
      `${JSON.stringify(projected.projection, null, 2)}\n`,
      "utf8",
    );
    const output = path.join(await temporaryDirectory("r1-omission-parent"), "bundle");

    await expect(bundleDirectory(renderedDirectory, output, { createdAt: FIXED_TIME }))
      .rejects.toMatchObject({ code: "REQUIRED_MEMBER_MISSING" });
  });
});
