import { describe, expect, it } from "vitest";

import { loadSchemas } from "../../src/lib/schema.js";
import { known, notApplicable } from "../fixtures/base-report.js";
import { makeResult } from "../fixtures/record-builders.js";

const HASH = `sha256:${"a".repeat(64)}`;
const FULL_BINDING = {
  source_item_id: "source.axis-contract",
  source_snapshot_id: "snapshot.axis-contract",
  snapshot_registry_hash: HASH,
  content_hash: HASH,
  excerpt_hash: HASH,
  chunk_ids: ["chunk.axis-contract"],
  locator: { locator_type: "whole_source", value: "axis contract source" },
  parser_identity: {
    parser_name: "axis-contract-parser",
    parser_version: "1.0.0",
    configuration_hash: HASH,
    parser_result_id: "parser-result.axis-contract",
  },
  binding_scope: "whole_source",
  binding_role: "direct",
};

const canonicalAxes = {
  scientific_effect_class: [
    "increase",
    "decrease",
    "no_detectable_effect",
    "equivalent",
    "heterogeneous",
    "effect_present_direction_uncertain",
    "not_estimated",
    "unknown",
    "not_applicable",
    "withheld",
  ],
  statistical_decision: [
    "reject_null",
    "do_not_reject_null",
    "equivalent",
    "noninferior",
    "inconclusive",
    "descriptive_only",
    "not_performed",
    "unknown",
    "not_applicable",
    "withheld",
  ],
  interpretability_status: [
    "interpretable",
    "qualified",
    "inconclusive",
    "not_interpretable",
    "unknown",
    "not_applicable",
    "withheld",
  ],
  record_disposition: [
    "primary",
    "sensitivity_only",
    "contextual",
    "excluded",
    "superseded",
    "retracted",
    "pending_review",
    "unknown",
    "not_applicable",
    "withheld",
  ],
} as const;

const retiredAxes = {
  scientific_effect_class: ["association_positive", "association_negative", "descriptive_only"],
  statistical_decision: ["non_inferior", "superior", "not_tested"],
  record_disposition: ["secondary", "exploratory", "not_assigned"],
} as const;

type AxisName = keyof typeof canonicalAxes;

function resultWithAxis(axis: AxisName, value: string): ReturnType<typeof makeResult> {
  const result = makeResult("result.axis-contract", "work.axis-contract");
  const mutable = result as unknown as Record<string, unknown>;
  mutable[axis] = value;
  if (
    axis === "scientific_effect_class" &&
    ["no_detectable_effect", "equivalent"].includes(value)
  ) {
    mutable.negative_evidence_assessment = {
      control_status: "unknown",
      quality_control_status: "unknown",
      sensitivity_status: "unknown",
      detection_limit: notApplicable<number>("No limit is required for this enum-shape fixture."),
      minimum_detectable_effect: notApplicable<number>("No MDE is required for this enum-shape fixture."),
      equivalence_bounds: null,
      observed_interval: null,
      eligible_for_biological_counterevidence: false,
      eligibility_reason: "This fixture tests serialized vocabulary only.",
    };
  }
  if (
    axis === "record_disposition" &&
    ["excluded", "superseded", "retracted"].includes(value)
  ) {
    mutable.disposition_reason = known("The enum-shape fixture records the required disposition reason.");
    mutable.decision_event_ids = ["decision.axis-contract"];
  }
  const repairBindings = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach(repairBindings);
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      if (key === "source_bindings" || key === "evidence_bindings") {
        (candidate as Record<string, unknown>)[key] = [structuredClone(FULL_BINDING)];
      } else repairBindings(child);
    }
  };
  repairBindings(result);
  return result;
}

function validateResult(value: unknown) {
  const validator = loadSchemas().get(
    "https://schemas.report-prompt.org/v1/defs/result-and-disposition.schema.json#/$defs/Result",
  );
  const valid = validator(value) as boolean;
  return { valid, errors: validator.errors ?? [] };
}

describe("result-axis vocabulary", () => {
  for (const [axis, values] of Object.entries(canonicalAxes) as Array<
    [AxisName, readonly string[]]
  >) {
    it.each(values)(`accepts canonical ${axis} value %s`, (value) => {
      const validation = validateResult(resultWithAxis(axis, value));

      expect(validation.errors, `${axis}=${value}`).toEqual([]);
      expect(validation.valid).toBe(true);
    });
  }

  for (const [axis, values] of Object.entries(retiredAxes) as Array<
    [keyof typeof retiredAxes, readonly string[]]
  >) {
    it.each(values)(`rejects retired ${axis} value %s without aliasing`, (value) => {
      const validation = validateResult(resultWithAxis(axis, value));

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          instancePath: `/${axis}`,
          keyword: "enum",
        }),
      );
    });
  }
});
