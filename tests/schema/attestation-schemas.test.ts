import { describe, expect, it } from "vitest";

import { loadSchemas } from "../../src/lib/schema.js";

const HUMAN_REVIEW_SCHEMA_ID = "https://schemas.report-prompt.org/v1/human-review-attestation.schema.json";
const HASH = `sha256:${"a".repeat(64)}`;
const NOW = "2026-08-25T00:00:00.000Z";

function known(value: string | string[]): Record<string, unknown> {
  return {
    state: "known",
    value,
    source_bindings: [
      {
        source_item_id: "source.review",
        source_snapshot_id: "snapshot.review",
        snapshot_registry_hash: HASH,
        content_hash: HASH,
        excerpt_hash: HASH,
        chunk_ids: ["chunk.review"],
        locator: { locator_type: "whole_source", value: "review record" },
        parser_identity: {
          parser_name: "review-fixture-parser",
          parser_version: "1.0.0",
          configuration_hash: HASH,
          parser_result_id: "parser-result.review",
        },
        binding_scope: "whole_source",
        binding_role: "direct",
      },
    ],
    derivation_bindings: [],
    missing_reason: null,
    provenance_status: "complete",
  };
}

function humanReview(
  overallDecision: "approve" | "approve_with_conditions" | "revise_and_resubmit" | "block_release" | "not_evaluable",
): Record<string, unknown> {
  const unreviewed = overallDecision === "not_evaluable";
  const concern = overallDecision === "revise_and_resubmit" || overallDecision === "block_release";
  const conditional = overallDecision === "approve_with_conditions" || unreviewed;
  const unresolved = concern ? ["review-task.blocking"] : [];
  return {
    human_review_attestation_id: `human-review.${overallDecision}`,
    attestation_version: "1.0.0",
    schema_version: "1.0.0",
    report_id: "report.review-fixture",
    report_version: "1.0.0",
    scientific_payload_hash: HASH,
    validation_attestation_id: "attestation.review-fixture",
    validation_attestation_hash: HASH,
    validation_status_observed:
      overallDecision === "approve" || overallDecision === "approve_with_conditions" ? "valid" : "invalid",
    review_scope: "full_scientific_payload",
    reviewers: [
      {
        reviewer_id: "reviewer.fixture",
        display_name: known("Fixture reviewer"),
        role: "scientific_lead",
        affiliation: known("Fixture review group"),
        expertise: known(["scientific review"]),
        conflict_of_interest: known("No conflict declared for this fixture."),
        identity_verification_status: "self_declared",
      },
    ],
    review_checks: [
      {
        review_check_id: "review-check.fixture",
        category: "scope_and_source_coverage",
        decision: unreviewed ? "unreviewed" : concern ? "concern" : "confirmed",
        reviewer_ids: unreviewed ? [] : ["reviewer.fixture"],
        affected_object_ids: ["report.review-fixture"],
        comment: unreviewed
          ? "Essential review material was unavailable."
          : concern
            ? "A release-blocking review concern remains."
            : "The declared review scope was checked.",
        completed_at: unreviewed ? null : NOW,
      },
    ],
    review_started_at: NOW,
    review_completed_at: NOW,
    overall_decision: overallDecision,
    conditions: conditional ? ["Resolve or disclose the named review condition."] : [],
    unresolved_review_task_ids: unresolved,
    signatures: [
      {
        reviewer_id: "reviewer.fixture",
        signature_method: "fixture-signature",
        signature_value: "fixture-signature-value",
        signed_at: NOW,
      },
    ],
    extensions: {},
  };
}

describe("attestation schema contracts", () => {
  it.each([
    "approve",
    "approve_with_conditions",
    "revise_and_resubmit",
    "block_release",
    "not_evaluable",
  ] as const)("accepts the canonical human-review outcome %s", (outcome) => {
    const result = loadSchemas().validate(HUMAN_REVIEW_SCHEMA_ID, humanReview(outcome));
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it.each(["approved", "approved_with_conditions", "changes_requested", "not_completed"])(
    "rejects the retired ambiguous human-review outcome %s",
    (outcome) => {
      const record = humanReview("approve");
      record.overall_decision = outcome;
      expect(loadSchemas().validate(HUMAN_REVIEW_SCHEMA_ID, record).valid).toBe(false);
    },
  );
});
