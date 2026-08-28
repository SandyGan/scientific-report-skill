import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { bundleDirectory, sha256File } from "../bundler/index.js";
import type { ScientificReport } from "../lib/types.js";
import type { DisclosureProjectionRecord } from "../projection/index.js";
import { renderReport } from "../renderer/index.js";
import { validateReport } from "../validator/index.js";
import { verifyBundle } from "../verifier/index.js";
import { known } from "../../tests/fixtures/base-report.js";
import { assertRenderEligibility, isDirectCliInvocation, runCli, workingCopyBanner } from "./index.js";

const FIXED_TIME = "2026-08-26T00:00:00.000Z";

async function createExactlyBoundBlockedReview(root: string): Promise<{ renderedDirectory: string; bundleDirectory: string }> {
  const exampleRoot = resolve(fileURLToPath(new URL("../../../../examples/cross-domain/", import.meta.url)));
  const [source, report, projection] = await Promise.all([
    readFile(join(exampleRoot, "scientific-report.canonical.json"), "utf8").then((value) => JSON.parse(value) as ScientificReport),
    readFile(join(exampleRoot, "scientific-report.json"), "utf8").then((value) => JSON.parse(value) as ScientificReport),
    readFile(join(exampleRoot, "disclosure-projection.json"), "utf8").then((value) => JSON.parse(value) as DisclosureProjectionRecord),
  ]);
  const validation = validateReport(report, {
    now: FIXED_TIME,
    disclosureProjection: { sourceReport: source, projection },
  });
  if (!validation.releaseEligible) throw new Error("Release fixture unexpectedly failed validation.");

  const renderedDirectory = join(root, "rendered");
  await renderReport(report, { outDir: renderedDirectory, attestation: validation.attestation });
  await writeFile(join(renderedDirectory, "disclosure-projection.json"), `${JSON.stringify(projection, null, 2)}\n`, "utf8");
  const [payloadDigest, validationDigest] = await Promise.all([
    sha256File(join(renderedDirectory, "scientific-report.public.json")),
    sha256File(join(renderedDirectory, "validation-attestation.json")),
  ]);
  const humanReview = {
    human_review_attestation_id: "human-review.blocked-release",
    attestation_version: "1",
    schema_version: "1",
    report_id: report.report_id,
    report_version: report.report_version,
    scientific_payload_hash: payloadDigest.contentHash,
    validation_attestation_id: validation.attestation.attestation_id,
    validation_attestation_hash: validationDigest.contentHash,
    validation_status_observed: validation.attestation.overall_status,
    review_scope: "full_scientific_payload",
    reviewers: [{
      reviewer_id: "reviewer.release-block",
      display_name: known("Release-block fixture reviewer"),
      role: "scientific_lead",
      affiliation: known("Independent fixture review group"),
      expertise: known(["scientific release review"]),
      conflict_of_interest: known("No conflict declared."),
      identity_verification_status: "verified",
    }],
    review_checks: [{
      review_check_id: "review-check.scientific-concern",
      category: "claims_and_argument",
      decision: "concern",
      reviewer_ids: ["reviewer.release-block"],
      affected_object_ids: [report.report_id],
      comment: "A scientific concern remains unresolved and blocks release.",
      completed_at: FIXED_TIME,
    }],
    review_started_at: FIXED_TIME,
    review_completed_at: FIXED_TIME,
    overall_decision: "block_release",
    conditions: [],
    unresolved_review_task_ids: ["review-task.resolve-scientific-concern"],
    signatures: [{
      reviewer_id: "reviewer.release-block",
      signature_method: "fixture-signature",
      signature_value: "fixture-signature-value",
      signed_at: FIXED_TIME,
    }],
    extensions: {},
  };
  await writeFile(join(renderedDirectory, "human-review-attestation.json"), `${JSON.stringify(humanReview, null, 2)}\n`, "utf8");

  const output = join(root, "api-bundle");
  await bundleDirectory(renderedDirectory, output, { createdAt: FIXED_TIME });
  return { renderedDirectory, bundleDirectory: output };
}

const incompleteValidation = {
  valid: false,
  complete: false,
  releaseEligible: false,
};

describe("CLI render eligibility", () => {
  it("rejects an incomplete validation result in strict release mode", () => {
    expect(() => assertRenderEligibility(incompleteValidation, false)).toThrow(/not release-eligible/i);
  });

  it("accepts the same incomplete validation result only in explicit working-copy mode", () => {
    expect(() => assertRenderEligibility(incompleteValidation, true)).not.toThrow();
  });

  it("requires valid, complete, and release-eligible together for strict rendering", () => {
    expect(() =>
      assertRenderEligibility({ valid: true, complete: true, releaseEligible: true }, false),
    ).not.toThrow();
    expect(() =>
      assertRenderEligibility({ valid: true, complete: false, releaseEligible: true }, false),
    ).toThrow(/not release-eligible/i);
  });

  it("renders a prominent, inert working-copy notice without interpolating markup", () => {
    const banner = workingCopyBanner('incomplete<script>alert("x")</script>');
    expect(banner).toContain("NOT RELEASE-ELIGIBLE — WORKING COPY");
    expect(banner).toContain("including failed and not_run when present");
    expect(banner).toContain('data-release-status="not-release-eligible"');
    expect(banner).not.toContain("<script>");
  });

  it("recognizes an installed package-bin symlink as direct execution", async () => {
    const directory = await mkdtemp(join(tmpdir(), "scientific-report-reference-cli-"));
    const link = join(directory, "scientific-report-reference");
    try {
      await symlink(fileURLToPath(new URL("./index.ts", import.meta.url)), link);
      await expect(isDirectCliInvocation(link)).resolves.toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("[RR-HR-001] fails API and default CLI release verification for an exactly bound human block", async () => {
    const root = await mkdtemp(join(tmpdir(), "scientific-report-reference-human-block-"));
    let restoreStdout: (() => void) | undefined;
    try {
      const fixture = await createExactlyBoundBlockedReview(root);
      const verification = await verifyBundle(fixture.bundleDirectory);
      expect(verification.ok).toBe(false);
      expect(verification.verificationMode).toBe("release");
      expect(verification.releaseEligible).toBe(false);
      expect(verification.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "HUMAN_REVIEW_BLOCK_RELEASE", severity: "error" }),
        expect.objectContaining({ code: "HUMAN_REVIEW_SCIENTIFIC_CONCERN", severity: "error" }),
        expect.objectContaining({ code: "HUMAN_REVIEW_UNRESOLVED_TASKS", severity: "error" }),
      ]));

      const integrityOnly = await verifyBundle(fixture.bundleDirectory, { requireValidAttestation: false });
      expect(integrityOnly.ok).toBe(true);
      expect(integrityOnly.verificationMode).toBe("integrity_only");
      expect(integrityOnly.releaseEligible).toBe(false);
      expect(integrityOnly.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "INTEGRITY_ONLY_MODE", severity: "information" }),
        expect.objectContaining({ code: "HUMAN_REVIEW_BLOCK_RELEASE", severity: "information" }),
      ]));

      const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      restoreStdout = () => stdout.mockRestore();
      const cliCode = await runCli([
        "node",
        "scientific-report-reference",
        "bundle",
        fixture.renderedDirectory,
        "--out",
        join(root, "cli-bundle"),
        "--json",
      ]);
      expect(cliCode).not.toBe(0);
    } finally {
      restoreStdout?.();
      process.exitCode = 0;
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});
