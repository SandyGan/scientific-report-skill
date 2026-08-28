import { access, cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import {
  RendererError,
  computeRendererTemplateHash,
  renderReport,
  serializePublicPayload,
  sha256Text,
  type JsonObject,
} from "../../src/renderer/index.js";
import {
  TEMPLATE_ROOT,
  cloneReport,
  known,
  makePublicReport,
  makeValidAttestation,
} from "../render-semantics/fixtures.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(label: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `report-prompt-security-${label}-`));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function objectAt(record: JsonObject, key: string): JsonObject {
  const value = record[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Fixture field ${key} is not an object.`);
  }
  return value;
}

function firstObjectAt(record: JsonObject, key: string): JsonObject {
  const value = record[key];
  const first = Array.isArray(value) ? value[0] : undefined;
  if (first === null || typeof first !== "object" || Array.isArray(first)) {
    throw new Error(`Fixture collection ${key} has no object at index zero.`);
  }
  return first;
}

async function rendererFailure(action: () => Promise<unknown>): Promise<RendererError> {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(RendererError);
  return caught as RendererError;
}

describe("renderer escaping and inert-content boundaries", () => {
  it("escapes payload text and attribute injection in every generated HTML view", async () => {
    const report = cloneReport(makePublicReport());
    const scriptMarker = '<script id="payload-xss">globalThis.compromised=true</script>';
    const imageMarker = '<img src=x onerror="globalThis.compromised=true">';
    const attributeMarker = 'wet_lab" onmouseover="globalThis.compromised=true';
    report.title = `${scriptMarker} renderer title`;
    const firstResult = firstObjectAt(report, "results");
    firstResult.statement = imageMarker;
    firstResult.domain = attributeMarker;

    const outputDirectory = await temporaryDirectory("escaping");
    await renderReport(report, { outDir: outputDirectory, templateDir: TEMPLATE_ROOT });

    for (const memberPath of ["report.html", "annex/index.html", "annex/records.html"]) {
      const html = await readFile(join(outputDirectory, ...memberPath.split("/")), "utf8");
      const document = new JSDOM(html).window.document;
      expect(document.querySelector("#payload-xss"), memberPath).toBeNull();
      expect(document.querySelector('img[src="x"]'), memberPath).toBeNull();
      expect(document.querySelector("[onerror]"), memberPath).toBeNull();
      expect(document.querySelector("[onmouseover]"), memberPath).toBeNull();
      expect(document.documentElement.textContent, memberPath).toContain(scriptMarker);
      if (memberPath === "report.html") {
        expect(document.body.textContent, memberPath).toContain(imageMarker);
        expect(document.querySelector('[data-kind~="result"]')?.getAttribute("data-domain"), memberPath).toBe(attributeMarker);
      }
      if (memberPath === "annex/records.html") {
        const escapedImageMarker = JSON.stringify(imageMarker).slice(1, -1);
        const escapedAttributeMarker = JSON.stringify(attributeMarker).slice(1, -1);
        expect(document.body.textContent, memberPath).toContain(escapedImageMarker);
        expect(document.body.textContent, memberPath).toContain(escapedAttributeMarker);
      }
      for (const script of document.querySelectorAll("script")) {
        expect(script.getAttribute("src"), memberPath).toMatch(/^(?:\.\.\/)?assets\/report\.js$/u);
        expect(script.textContent?.trim() ?? "", memberPath).toBe("");
      }
    }
  });

  it("keeps dangerous-looking artifact references as escaped inert text rather than active links", async () => {
    const report = cloneReport(makePublicReport());
    const artifact = firstObjectAt(report, "artifacts");
    artifact.location = known('javascript:globalThis.compromised=true"><svg onload=globalThis.compromised=true>');
    const outputDirectory = await temporaryDirectory("inert-reference");
    await renderReport(report, { outDir: outputDirectory, templateDir: TEMPLATE_ROOT });

    const html = await readFile(join(outputDirectory, "annex/index.html"), "utf8");
    const document = new JSDOM(html).window.document;
    const artifactRow = [...document.querySelectorAll('[data-kind="artifact"]')]
      .find((row) => row.textContent?.includes("artifact:partial"));
    expect(artifactRow?.textContent).toContain("javascript:globalThis.compromised=true");
    expect(artifactRow?.querySelector("a")).toBeNull();
    expect(document.querySelector("[onload]")).toBeNull();
    expect(document.querySelector('svg:not(.icon)')).toBeNull();
  });
});

describe("renderer template trust boundary", () => {
  it("[PT-02] ignores a foreign scientific-console tree in the current working directory", async () => {
    const workingDirectory = await temporaryDirectory("foreign-cwd");
    const foreignTemplateRoot = join(workingDirectory, "templates/scientific-console");
    await cp(TEMPLATE_ROOT, foreignTemplateRoot, { recursive: true });
    const marker = "FOREIGN_CWD_TEMPLATE_MUST_NOT_RENDER";
    await writeFile(join(foreignTemplateRoot, "assets/report.css"), `/* ${marker} */\n`, { flag: "a" });
    const outputDirectory = await temporaryDirectory("foreign-cwd-output");
    const previousWorkingDirectory = process.cwd();

    try {
      process.chdir(workingDirectory);
      await renderReport(makePublicReport(), { outDir: outputDirectory });
    } finally {
      process.chdir(previousWorkingDirectory);
    }

    expect(await readFile(join(outputDirectory, "assets/report.css"), "utf8")).not.toContain(marker);
  });

  it("requires and verifies an explicit trusted identity for a custom release template", async () => {
    const customParent = await temporaryDirectory("custom-template");
    const customTemplateRoot = join(customParent, "scientific-console");
    await cp(TEMPLATE_ROOT, customTemplateRoot, { recursive: true });
    const marker = "EXPLICITLY_TRUSTED_CUSTOM_TEMPLATE";
    await writeFile(join(customTemplateRoot, "assets/report.css"), `/* ${marker} */\n`, { flag: "a" });

    const missingIdentityOutput = join(customParent, "missing-identity-output");
    const missingIdentityError = await rendererFailure(() => renderReport(makePublicReport(), {
      outDir: missingIdentityOutput,
      templateDir: customTemplateRoot,
    }));
    expect(missingIdentityError.code).toBe("CUSTOM_TEMPLATE_IDENTITY_REQUIRED");
    await expect(access(missingIdentityOutput)).rejects.toMatchObject({ code: "ENOENT" });

    const wrongHashOutput = join(customParent, "wrong-hash-output");
    const wrongHashError = await rendererFailure(() => renderReport(makePublicReport(), {
      outDir: wrongHashOutput,
      templateDir: customTemplateRoot,
      trustedTemplateIdentity: {
        id: "fixture:custom-console",
        version: "1",
        hash: `sha256:${"0".repeat(64)}`,
      },
    }));
    expect(wrongHashError.code).toBe("TEMPLATE_IDENTITY_HASH_MISMATCH");
    await expect(access(wrongHashOutput)).rejects.toMatchObject({ code: "ENOENT" });

    const outputDirectory = join(customParent, "trusted-output");
    const templateHash = await computeRendererTemplateHash(customTemplateRoot);
    const report = makePublicReport();
    const expectedScientificBytes = serializePublicPayload(report);
    await renderReport(report, {
      outDir: outputDirectory,
      templateDir: customTemplateRoot,
      trustedTemplateIdentity: {
        id: "fixture:custom-console",
        version: "1",
        hash: templateHash,
      },
    });
    expect(await readFile(join(outputDirectory, "assets/report.css"), "utf8")).toContain(marker);
    expect(await readFile(join(outputDirectory, "scientific-report.public.json"), "utf8")).toBe(expectedScientificBytes);
  });
});

describe("public projection and redaction fail-closed behavior", () => {
  it("rejects a non-null withheld value without exposing it in diagnostics or output", async () => {
    const protectedMarker = "DO_NOT_LEAK_WITHHELD_FIXTURE_VALUE";
    const report = cloneReport(makePublicReport());
    const entity = firstObjectAt(report, "entities");
    const label = objectAt(entity, "label");
    label.value = protectedMarker;
    const parent = await temporaryDirectory("withheld-parent");
    const outputDirectory = join(parent, "rendered");

    const error = await rendererFailure(() =>
      renderReport(report, { outDir: outputDirectory, templateDir: TEMPLATE_ROOT }),
    );
    expect(error.code).toBe("NON_KNOWN_VALUE_PRESENT");
    expect(String(error)).not.toContain(protectedMarker);
    await expect(access(outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(parent)).join("\n")).not.toContain(protectedMarker);
  });

  it("rejects public withheld provenance bindings before they can expose protected locators", async () => {
    const protectedLocator = "restricted-ledger:row:classified";
    const report = cloneReport(makePublicReport());
    const entity = firstObjectAt(report, "entities");
    const label = objectAt(entity, "label");
    label.provenance_status = "partial";
    label.source_bindings = [
      {
        source_item_id: "source:restricted",
        locator: { locator_type: "record_key", value: protectedLocator },
        binding_role: "direct",
      },
    ];
    const parent = await temporaryDirectory("withheld-provenance-parent");
    const outputDirectory = join(parent, "rendered");

    const error = await rendererFailure(() =>
      renderReport(report, { outDir: outputDirectory, templateDir: TEMPLATE_ROOT }),
    );
    expect(error.code).toBe("PUBLIC_WITHHELD_PROVENANCE");
    expect(String(error)).not.toContain(protectedLocator);
    await expect(access(outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["withholding_reason_code", "PUBLIC_WITHHELD_REASON_CODE"],
    ["disclosure_decision_id", "PUBLIC_WITHHELD_DECISION"],
  ] as const)("rejects a public withheld envelope without %s", async (field, expectedCode) => {
    const report = cloneReport(makePublicReport());
    const entity = firstObjectAt(report, "entities");
    const label = objectAt(entity, "label");
    delete label[field];
    const parent = await temporaryDirectory(`withheld-${field}-parent`);
    const outputDirectory = join(parent, "rendered");

    const error = await rendererFailure(() =>
      renderReport(report, { outDir: outputDirectory, templateDir: TEMPLATE_ROOT }),
    );
    expect(error.code).toBe(expectedCode);
    await expect(access(outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["canonical_private", "internal", "not_projected", "NOT_PUBLIC_PROJECTION"],
    ["public_projection", "restricted", "projected", "NON_PUBLIC_DISCLOSURE_LEVEL"],
    ["public_projection", "public", "projection_incomplete", "INCOMPLETE_DISCLOSURE_PROJECTION"],
  ])(
    "refuses payload role=%s level=%s projection=%s before writing",
    async (payloadRole, level, projectionStatus, expectedCode) => {
      const report = cloneReport(makePublicReport());
      report.payload_role = payloadRole;
      const disclosure = objectAt(report, "disclosure_state");
      disclosure.level = level;
      disclosure.projection_status = projectionStatus;
      const parent = await temporaryDirectory("projection-parent");
      const outputDirectory = join(parent, "rendered");

      const error = await rendererFailure(() =>
        renderReport(report, { outDir: outputDirectory, templateDir: TEMPLATE_ROOT }),
      );
      expect(error.code).toBe(expectedCode);
      await expect(access(outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("[renderer-absolute-path-root-bypass] rejects generic /opt host-local references before duplicating them into public files", async () => {
    const report = cloneReport(makePublicReport());
    firstObjectAt(report, "artifacts").location = known("/opt/acme/private/restricted-result.csv");
    const parent = await temporaryDirectory("absolute-path-parent");
    const outputDirectory = join(parent, "rendered");

    const error = await rendererFailure(() =>
      renderReport(report, { outDir: outputDirectory, templateDir: TEMPLATE_ROOT }),
    );
    expect(error.code).toBe("ABSOLUTE_PATH_IN_PUBLIC_PAYLOAD");
    await expect(access(outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("[renderer-partial-attestation-validation] rejects the malformed partial-attestation probe before rendering a valid badge", async () => {
    const report = makePublicReport();
    const payloadHash = sha256Text(serializePublicPayload(report));
    const attestation = makeValidAttestation(report, payloadHash);
    attestation.attestation_id = "";
    delete attestation.signature;
    attestation.payload_byte_size = 0;
    attestation.checks = [];
    attestation.summary = {
      total: 0,
      passed: 0,
      failed: 0,
      not_run: 0,
      errors: 0,
      not_applicable: 0,
      warnings: 0,
      blocking_findings: 0,
      waived_findings: 0,
    };
    const parent = await temporaryDirectory("malformed-attestation-parent");
    const outputDirectory = join(parent, "rendered");

    const error = await rendererFailure(() => renderReport(report, {
      outDir: outputDirectory,
      templateDir: TEMPLATE_ROOT,
      attestation,
    }));
    expect(error.code).toBe("ATTESTATION_SCHEMA_INVALID");
    await expect(access(outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a schema-valid attestation whose payload byte size is not exact", async () => {
    const report = makePublicReport();
    const payloadHash = sha256Text(serializePublicPayload(report));
    const attestation = makeValidAttestation(report, payloadHash);
    attestation.payload_byte_size = 0;
    const parent = await temporaryDirectory("attestation-size-parent");
    const outputDirectory = join(parent, "rendered");

    const error = await rendererFailure(() => renderReport(report, {
      outDir: outputDirectory,
      templateDir: TEMPLATE_ROOT,
      attestation,
    }));
    expect(error.code).toBe("ATTESTATION_PAYLOAD_SIZE_MISMATCH");
    await expect(access(outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["summary cardinality", "ATTESTATION_CHECK_SUMMARY_MISMATCH", (attestation: JsonObject) => {
      objectAt(attestation, "summary").total = 2;
    }],
    ["blocking-check binding", "ATTESTATION_CHECK_BINDING_MISMATCH", (attestation: JsonObject) => {
      const check = (attestation.checks as JsonObject[])[0] as JsonObject;
      check.status = "fail";
      const summary = objectAt(attestation, "summary");
      summary.passed = 0;
      summary.failed = 1;
      summary.blocking_findings = 1;
      attestation.overall_status = "invalid";
      attestation.unresolved_blocking_check_ids = ["fixture:unbound-blocker"];
    }],
  ] as const)("rejects inconsistent attestation %s", async (_label, expectedCode, mutate) => {
    const report = makePublicReport();
    const payloadHash = sha256Text(serializePublicPayload(report));
    const attestation = makeValidAttestation(report, payloadHash);
    mutate(attestation);
    const parent = await temporaryDirectory("attestation-consistency-parent");
    const outputDirectory = join(parent, "rendered");

    const error = await rendererFailure(() => renderReport(report, {
      outDir: outputDirectory,
      templateDir: TEMPLATE_ROOT,
      attestation,
    }));
    expect(error.code).toBe(expectedCode);
    await expect(access(outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["report_id", "report:different"],
    ["report_version", "2"],
  ] as const)("rejects an attestation with a mismatched %s before writing", async (field, value) => {
    const report = makePublicReport();
    const payloadHash = sha256Text(serializePublicPayload(report));
    const attestation = makeValidAttestation(report, payloadHash);
    attestation[field] = value;
    const parent = await temporaryDirectory(`attestation-${field}-parent`);
    const outputDirectory = join(parent, "rendered");

    const error = await rendererFailure(() =>
      renderReport(report, {
        outDir: outputDirectory,
        templateDir: TEMPLATE_ROOT,
        attestation,
      }),
    );
    expect(error.code).toBe("ATTESTATION_IDENTITY_MISMATCH");
    await expect(access(outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a stale validation hash and never displays a valid status", async () => {
    const report = makePublicReport();
    const payloadHash = sha256Text(serializePublicPayload(report));
    const attestation = makeValidAttestation(report, payloadHash);
    attestation.scientific_payload_hash = `sha256:${"0".repeat(64)}`;
    const parent = await temporaryDirectory("attestation-parent");
    const outputDirectory = join(parent, "rendered");

    const error = await rendererFailure(() =>
      renderReport(report, {
        outDir: outputDirectory,
        templateDir: TEMPLATE_ROOT,
        attestation: attestation,
      }),
    );
    expect(error.code).toBe("ATTESTATION_HASH_MISMATCH");
    await expect(access(outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
