import { describe, expect, it } from "vitest";

import { loadSchemas } from "../../src/lib/schema.js";

const PACKAGE_MANIFEST_SCHEMA_ID = "https://schemas.report-prompt.org/v1/package-manifest.schema.json";
const HASH = `sha256:${"b".repeat(64)}`;
const NOW = "2026-08-25T00:00:00.000Z";

function packageManifest(): Record<string, unknown> {
  const file = (path: string, role: string) => ({
    path,
    role,
    media_type: path.endsWith(".json") ? "application/json" : "text/html",
    content_hash: HASH,
    byte_size: 1,
    required: true,
    disclosure_class: "public",
    source_artifact_id: null,
  });
  return {
    package_id: "package.projection-contract",
    package_version: "1.0.0",
    schema_version: "1.0.0",
    manifest_file_name: "package-manifest.json",
    report_id: "report.projection-contract",
    report_version: "1.0.0",
    scientific_payload_hash: HASH,
    validation_attestation_hash: HASH,
    human_review_attestation_hash: null,
    disclosure_projection_hash: HASH,
    created_at: NOW,
    bundle_format: "portable_offline_directory",
    files: [
      file("report.html", "report_html"),
      file("scientific-report.public.json", "scientific_report_public"),
      file("validation-attestation.json", "validation_attestation"),
      file("disclosure-projection.json", "disclosure_projection"),
      { ...file("README.txt", "package_readme"), media_type: "text/plain" },
    ],
    entrypoints: [
      { name: "report", path: "report.html", purpose: "Open the offline scientific report." },
    ],
    remote_dependencies: [],
    absolute_paths_present: false,
    active_external_content_present: false,
    package_checks: [],
    extensions: {},
  };
}

describe("package disclosure-projection binding", () => {
  it("requires a hashed, required disclosure-projection package member", () => {
    const repository = loadSchemas();
    const valid = packageManifest();
    expect(repository.validate(PACKAGE_MANIFEST_SCHEMA_ID, valid).valid).toBe(true);

    const missingHash = structuredClone(valid);
    missingHash.disclosure_projection_hash = null;
    expect(repository.validate(PACKAGE_MANIFEST_SCHEMA_ID, missingHash).valid).toBe(false);

    const missingMember = structuredClone(valid);
    missingMember.files = (missingMember.files as Array<Record<string, unknown>>).filter(
      (file) => file.role !== "disclosure_projection",
    );
    expect(repository.validate(PACKAGE_MANIFEST_SCHEMA_ID, missingMember).valid).toBe(false);
  });
});
