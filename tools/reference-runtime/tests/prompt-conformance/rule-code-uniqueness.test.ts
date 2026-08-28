import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { loadRuleRegistry } from "../../src/lib/rules.js";

const SECTION_MANIFEST_PATH = new URL("../../../../protocol/section-manifests.yaml", import.meta.url);

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a YAML mapping.");
  }
  return value as Record<string, unknown>;
}

describe("rule-code namespace integrity", () => {
  it("keeps every authoritative registry rule ID unique", () => {
    const registry = loadRuleRegistry();
    const ids = registry.rules.map((rule) => rule.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reserves SEC001 for package security and uses MNF codes for section manifests", () => {
    const registry = loadRuleRegistry();
    const registryById = new Map(registry.rules.map((rule) => [rule.id, rule]));
    const sectionManifest = record(
      parseYaml(readFileSync(SECTION_MANIFEST_PATH, "utf8"), {
        prettyErrors: true,
        strict: true,
        uniqueKeys: true,
      }),
    );
    const manifestCodes = Object.keys(record(sectionManifest.conformance_rules));

    expect(manifestCodes).toEqual(["MNF001", "MNF002", "MNF003", "MNF004", "MNF005"]);
    expect(manifestCodes).not.toContain("SEC001");
    expect(manifestCodes.every((code) => registryById.has(code))).toBe(true);
    expect(registryById.get("SEC001")?.title).toMatch(/unsafe active content, URL, or archive path/iu);
  });
});
