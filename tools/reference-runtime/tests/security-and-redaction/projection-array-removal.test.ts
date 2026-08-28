import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "../../src/lib/hash.js";
import type { ScientificReport } from "../../src/lib/types.js";
import {
  projectDisclosure,
  verifyDisclosureProjection,
} from "../../src/projection/index.js";
import { runProjectionDisclosureChecks } from "../../src/projection/project.js";
import { validateReport } from "../../src/validator/index.js";
import { known } from "../fixtures/base-report.js";
import { makeArtifact } from "../fixtures/record-builders.js";

const NOW = "2026-08-26T00:00:00.000Z";

async function canonicalExample(): Promise<ScientificReport> {
  const examplePath = path.resolve(fileURLToPath(new URL("../../../../examples/cross-domain/scientific-report.canonical.json", import.meta.url)));
  return JSON.parse(await readFile(examplePath, "utf8")) as ScientificReport;
}

describe("projection array-removal regressions", () => {
  it("[projection-array-removal-order] removes original sibling identities at indices 2 and 10 without shifting an adjacent identity", async () => {
    const source = await canonicalExample();
    const bridge = source.cross_domain_bridges[0]!;
    const identityIds = Array.from({ length: 12 }, (_, index) => `e${String(index).padStart(2, "0")}`);
    const identities = identityIds.map((objectId) => ({
      object_type: "entity" as const,
      object_id: objectId,
      object_version: "1.0.0",
    }));
    bridge.source_entity_version_ids = [...identities];

    const projected = projectDisclosure(source, {
      projectionId: "projection.array-order",
      createdAt: NOW,
      policy: {
        policy_id: "policy.array-order",
        policy_version: "1.0.0",
        rules: { protected_entity_versions: "omit" },
      },
      instructions: [
        {
          sourcePointer: "/cross_domain_bridges/0/source_entity_version_ids/2",
          action: "omitted_object",
          reason: "The protected entity identity at original index 2 is not public.",
          policyRuleId: "policy.array-order.entity",
        },
        {
          sourcePointer: "/cross_domain_bridges/0/source_entity_version_ids/10",
          action: "omitted_object",
          reason: "The protected entity identity at original index 10 is not public.",
          policyRuleId: "policy.array-order.entity",
        },
      ],
    });

    const outputIds = projected.report.cross_domain_bridges[0]!.source_entity_version_ids.map((identity) => identity.object_id);
    expect(outputIds).not.toContain("e02");
    expect(outputIds).not.toContain("e10");
    expect(outputIds).toContain("e09");
    expect(outputIds).toContain("e11");
    expect(outputIds).toEqual(identityIds.filter((identity) => identity !== "e02" && identity !== "e10"));
    expect(projected.projection.disclosure_checks.find((check) => check.check_kind === "withheld_value_leak_scan")).toMatchObject({
      status: "pass",
      finding_count: 0,
    });
    expect(verifyDisclosureProjection(source, projected.report, projected.projection)).toMatchObject({
      valid: true,
      schemaValid: true,
      issues: [],
    });

    // Reproduce the prior shifted-index result: ascending removal retains e10
    // and removes the adjacent unrequested e11.
    const shifted = structuredClone(projected.report);
    const shiftedIdentities = structuredClone(identities);
    shiftedIdentities.splice(2, 1);
    shiftedIdentities.splice(10, 1);
    shifted.cross_domain_bridges[0]!.source_entity_version_ids = shiftedIdentities;
    const shiftedIds = shiftedIdentities.map((identity) => identity.object_id);
    const shiftedProjection = structuredClone(projected.projection);
    shiftedProjection.projected_payload_hash = sha256CanonicalJson(shifted);

    expect(shiftedIds).toContain("e10");
    expect(shiftedIds).not.toContain("e11");
    const verification = verifyDisclosureProjection(source, shifted, shiftedProjection);
    expect(verification.valid).toBe(false);
    expect(verification.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "UNRECORDED_CHANGE",
      "DISCLOSURE_CHECK",
    ]));

    const releaseValidation = validateReport(shifted, {
      now: NOW,
      selectedRuleIds: ["RED004", "ATT001"],
      disclosureProjection: { sourceReport: source, projection: shiftedProjection },
    });
    expect(releaseValidation.evaluations.find((evaluation) => evaluation.rule.id === "RED004")?.status).toBe("fail");
    expect(releaseValidation.releaseEligible).toBe(false);
  });

  it("[projection-array-removal-order protected values] detects retained short-string and numeric values by action and canonical hash semantics", async () => {
    const source = await canonicalExample();
    source.artifacts.push(makeArtifact("artifact.numeric-protected", "other", {
      media_type: known("x"),
      byte_size: known(7),
    }));
    const projected = projectDisclosure(source, {
      projectionId: "projection.numeric-protection",
      createdAt: NOW,
      policy: {
        policy_id: "policy.numeric-protection",
        policy_version: "1.0.0",
        rules: {
          protected_media_type: "withhold",
          protected_byte_size: "withhold",
        },
      },
      instructions: [
        {
          sourcePointer: "/artifacts/0/media_type",
          action: "withheld_envelope",
          reason: "The exact one-character protected media label is restricted.",
          policyRuleId: "policy.numeric-protection.media-type",
          withholdingReasonCode: "source_confidentiality",
          disclosureDecisionId: "decision.numeric-protection",
        },
        {
          sourcePointer: "/artifacts/0/byte_size",
          action: "withheld_envelope",
          reason: "The exact small protected numeric value is restricted.",
          policyRuleId: "policy.numeric-protection.byte-size",
          withholdingReasonCode: "source_confidentiality",
          disclosureDecisionId: "decision.numeric-protection",
        },
      ],
    });
    const attacked = structuredClone(projected.report) as unknown as Record<string, unknown>;
    const artifacts = attacked.artifacts as Array<Record<string, unknown>>;
    const mediaType = artifacts[0]!.media_type as Record<string, unknown>;
    const byteSize = artifacts[0]!.byte_size as Record<string, unknown>;
    mediaType.value = "x";
    byteSize.value = 7;

    const checks = runProjectionDisclosureChecks(
      source,
      attacked as unknown as ScientificReport,
      projected.projection.field_actions,
      NOW,
    );
    expect(checks.find((check) => check.check_kind === "withheld_value_leak_scan")).toMatchObject({
      status: "fail",
      finding_count: 2,
    });
  });
});
