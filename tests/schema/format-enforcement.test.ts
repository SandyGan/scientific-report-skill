import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { loadSchemas } from "../../src/lib/schema.js";
import { baseReport } from "../fixtures/base-report.js";

const GENERATION_REQUEST_SCHEMA_ID =
  "https://schemas.report-prompt.org/v1/generation-request.schema.json";
const REQUEST_EXAMPLE_PATH = new URL(
  "../../prompts/contracts/request.example.json",
  import.meta.url,
);

function requestExample(): Record<string, unknown> {
  return JSON.parse(readFileSync(REQUEST_EXAMPLE_PATH, "utf8")) as Record<string, unknown>;
}

describe("schema format enforcement", () => {
  it("rejects a malformed report date-time through the shared Ajv formats binding", () => {
    const report = baseReport();
    (report as unknown as Record<string, unknown>).created_at = "not-a-date-time";

    const result = loadSchemas().validateScientificReport(report);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        instancePointer: "/created_at",
        keyword: "format",
      }),
    );
  });

  it("rejects a malformed generation target URI", () => {
    const request = requestExample();
    request.target_schema_id = "not a URI";

    const result = loadSchemas().validate(GENERATION_REQUEST_SCHEMA_ID, request);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        instancePointer: "/target_schema_id",
        keyword: "format",
      }),
    );
  });

  it("rejects a malformed SHA-256 contract value", () => {
    const request = requestExample();
    request.rule_registry_hash = `sha256:${"z".repeat(64)}`;

    const result = loadSchemas().validate(GENERATION_REQUEST_SCHEMA_ID, request);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        instancePointer: "/rule_registry_hash",
        keyword: "pattern",
      }),
    );
  });
});
