import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import {
  renderReport,
  serializePublicPayload,
  sha256Text,
  type JsonObject,
} from "../../src/renderer/index.js";
import {
  TEMPLATE_ROOT,
  cloneReport,
  makeGenerationAudit,
  makePublicReport,
  makeValidAttestation,
} from "./fixtures.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(label: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `report-prompt-${label}-`));
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

function tokens(value: string | null | undefined): string[] {
  return (value ?? "").trim().split(/[\s,|]+/u).filter(Boolean);
}

function effectivelyHidden(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current !== null) {
    if (current.hidden) return true;
    current = current.parentElement;
  }
  return false;
}

function firstRecord(report: JsonObject, key: string): JsonObject {
  const value = report[key];
  if (!Array.isArray(value) || value.length === 0 || typeof value[0] !== "object" || value[0] === null || Array.isArray(value[0])) {
    throw new Error(`Fixture collection ${key} has no object record.`);
  }
  return value[0];
}

describe("renderer filters and removable generation audit", () => {
  it("[filter-hidden-safety-undercount] reports an exact hidden safety-record count when working-view filters exclude records", async () => {
    const outputDirectory = await temporaryDirectory("filter-warning");
    await renderReport(makePublicReport(), { outDir: outputDirectory, templateDir: TEMPLATE_ROOT });
    const html = await readFile(join(outputDirectory, "report.html"), "utf8");
    const script = await readFile(join(outputDirectory, "assets/report.js"), "utf8");
    const printCss = await readFile(join(outputDirectory, "assets/print.css"), "utf8");
    const dom = new JSDOM(html, {
      runScripts: "outside-only",
      url: "file:///portable-report/report.html",
    });

    dom.window.eval(script);
    const kindFilter = dom.window.document.querySelector('[data-filter="kind"]');
    expect(kindFilter).toBeInstanceOf(dom.window.HTMLSelectElement);
    if (!(kindFilter instanceof dom.window.HTMLSelectElement)) {
      throw new Error("Fixture kind filter was not rendered.");
    }
    kindFilter.value = "work-unit";
    kindFilter.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    const records = [...dom.window.document.querySelectorAll<HTMLElement>("[data-record]")];
    const safetyNodes = [...dom.window.document.querySelectorAll<HTMLElement>('[data-safety-record="true"]')];
    const hiddenSafetyNodes = safetyNodes.filter(effectivelyHidden);
    const visibleCount = records.filter((record) => !effectivelyHidden(record)).length;
    const status = dom.window.document.querySelector("[data-filter-status]")?.textContent ?? "";
    const printWarning = dom.window.document.querySelector("[data-print-filter-warning]")?.textContent ?? "";

    expect(hiddenSafetyNodes).toHaveLength(23);
    expect(hiddenSafetyNodes.some((node) => !node.hasAttribute("data-record"))).toBe(true);
    expect(status).toContain(`Working view: ${visibleCount} of ${records.length} records shown.`);
    expect(status).toContain(`${hiddenSafetyNodes.length} safety-relevant records or disclosures are outside this view.`);
    expect(printWarning).toContain(`${hiddenSafetyNodes.length} safety-relevant records or disclosures are outside this view.`);
    expect(printCss).toMatch(/body\[data-print-mode="filtered"\] \.print-context__filter-warning\s*\{\s*display: inline;/u);
    expect(dom.window.document.body.dataset.filterActive).toBe("true");
    expect(dom.window.document.body.dataset.visibleRecords).toBe(String(visibleCount));
    expect(dom.window.document.body.dataset.totalRecords).toBe(String(records.length));
    expect(dom.window.document.body.dataset.hiddenSafetyRecords).toBe(String(hiddenSafetyNodes.length));

    kindFilter.value = "all";
    kindFilter.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const restoredHiddenSafetyCount = safetyNodes.filter(effectivelyHidden).length;
    const restoredStatus = dom.window.document.querySelector("[data-filter-status]")?.textContent ?? "";
    expect(restoredHiddenSafetyCount).toBe(0);
    expect(restoredStatus).not.toContain("outside this view");
  });

  it("[PT-09] derives every domain, state, and kind choice from every emitted data-record token", async () => {
    const report = cloneReport(makePublicReport());
    const claim = firstRecord(report, "claims");
    claim.argument_step_ids = ["argument:mixed-domain"];
    claim.cross_domain_bridge_ids = ["bridge:mixed-domain"];
    report.argument_steps = [
      {
        argument_step_id: "argument:mixed-domain",
        rule_or_rationale: "A mixed-domain mapping requires explicit review.",
        validity_status: "review_required",
        extensions: { domain: "molecular_dynamics" },
      },
    ];
    report.cross_domain_bridges = [
      {
        bridge_id: "bridge:mixed-domain",
        source_domain: "molecular_dynamics",
        target_domain: "wet_lab",
        transformation_or_mapping_evidence: "Recorded bridge evidence.",
        identity_alignment: "partial",
        construct_alignment: "matched",
        condition_alignment: "unresolved",
        intervention_alignment: { alignment: "matched" },
        dose_alignment: { alignment: "bounded" },
        endpoint_alignment: { alignment: "transformed" },
        time_alignment: { alignment: "partially_matched" },
        state_alignment: { alignment: "matched" },
        scale_alignment: "partial",
        validity_status: "invalid",
        reviewer_state: "review_required",
      },
    ];

    const outputDirectory = await temporaryDirectory("filter-token-coverage");
    await renderReport(report, { outDir: outputDirectory, templateDir: TEMPLATE_ROOT });
    const document = new JSDOM(await readFile(join(outputDirectory, "report.html"), "utf8")).window.document;
    const records = [...document.querySelectorAll<HTMLElement>("[data-record]")];

    for (const dimension of ["domain", "state", "kind"] as const) {
      const emitted = [...new Set(records.flatMap((record) => tokens(record.getAttribute(`data-${dimension}`))))]
        .sort((left, right) => left.localeCompare(right, "en"));
      const options = [...document.querySelectorAll<HTMLOptionElement>(`[data-filter="${dimension}"] option`)]
        .map((option) => option.value)
        .filter((value) => value !== "all")
        .sort((left, right) => left.localeCompare(right, "en"));
      expect(options, dimension).toEqual(emitted);
    }

    const domainOptions = [...document.querySelectorAll<HTMLOptionElement>('[data-filter="domain"] option')]
      .map((option) => option.value);
    const stateOptions = [...document.querySelectorAll<HTMLOptionElement>('[data-filter="state"] option')]
      .map((option) => option.value);
    const kindOptions = [...document.querySelectorAll<HTMLOptionElement>('[data-filter="kind"] option')]
      .map((option) => option.value);
    expect(domainOptions).toEqual(expect.arrayContaining(["wet_lab", "molecular_dynamics"]));
    expect(stateOptions).toEqual(expect.arrayContaining(["invalid", "review_required", "partially_resolved"]));
    expect(kindOptions).toEqual(expect.arrayContaining([
      "research-question",
      "argument-step",
      "evidence",
      "counterevidence",
      "cross-domain-bridge",
    ]));

    const bridgeCard = document.querySelector('[data-kind="cross-domain-bridge"]');
    const alignments = new Map(
      [...(bridgeCard?.querySelectorAll(".key-value-list > div") ?? [])].map((row) => [
        (row.querySelector("dt")?.textContent ?? "").trim(),
        (row.querySelector("dd")?.textContent ?? "").trim(),
      ]),
    );
    expect(Object.fromEntries(alignments)).toMatchObject({
      "Entity alignment": "partial",
      "Construct alignment": "matched",
      "Condition alignment": "unresolved",
      "Intervention alignment": "matched",
      "Dose alignment": "bounded",
      "Endpoint alignment": "transformed",
      "Time alignment": "partially_matched",
      "State alignment": "matched",
      "Scale alignment": "partial",
    });
  });

  it("keeps scientific bytes, validation, annexes, and replay content invariant when the AI audit is removed", async () => {
    const report = makePublicReport();
    const payloadHash = sha256Text(serializePublicPayload(report));
    const attestation = makeValidAttestation(report, payloadHash);
    const withoutAuditDirectory = await temporaryDirectory("without-audit");
    const withAuditDirectory = await temporaryDirectory("with-audit");

    const withoutAudit = await renderReport(report, {
      outDir: withoutAuditDirectory,
      templateDir: TEMPLATE_ROOT,
      attestation: attestation,
    });
    const withAudit = await renderReport(report, {
      outDir: withAuditDirectory,
      templateDir: TEMPLATE_ROOT,
      attestation: attestation,
      generationAudit: makeGenerationAudit(report, payloadHash),
    });

    expect(withAudit.payloadHash).toBe(withoutAudit.payloadHash);
    expect(withAudit.publicPayloadText).toBe(withoutAudit.publicPayloadText);
    expect(withAudit.validationAttestationBound).toBe(true);
    expect(withoutAudit.validationAttestationBound).toBe(true);

    for (const invariantMember of [
      "scientific-report.public.json",
      "validation-attestation.json",
      "annex/index.html",
      "annex/records.html",
    ]) {
      const left = await readFile(join(withoutAuditDirectory, ...invariantMember.split("/")), "utf8");
      const right = await readFile(join(withAuditDirectory, ...invariantMember.split("/")), "utf8");
      expect(right, invariantMember).toBe(left);
    }

    const withoutDocument = new JSDOM(
      await readFile(join(withoutAuditDirectory, "report.html"), "utf8"),
    ).window.document;
    const withDocument = new JSDOM(
      await readFile(join(withAuditDirectory, "report.html"), "utf8"),
    ).window.document;

    expect(withoutDocument.querySelector("[data-ai-audit]")).toBeNull();
    expect(withDocument.querySelector("[data-ai-audit]")?.textContent).toContain("Not scientific evidence.");
    expect(withDocument.querySelector("[data-ai-audit]")?.textContent).toContain("Peripheral · removable");
    expect(withDocument.querySelector("#report-main")?.outerHTML).toBe(
      withoutDocument.querySelector("#report-main")?.outerHTML,
    );
    expect(withDocument.querySelector(".console-header__signals")?.outerHTML).toBe(
      withoutDocument.querySelector(".console-header__signals")?.outerHTML,
    );
    expect(withDocument.querySelector(".report-footer")?.outerHTML).toBe(
      withoutDocument.querySelector(".report-footer")?.outerHTML,
    );
    expect(withDocument.querySelector("[data-kind=\"reproducibility-unit\"]")?.outerHTML).toBe(
      withoutDocument.querySelector("[data-kind=\"reproducibility-unit\"]")?.outerHTML,
    );

    await expect(access(join(withAuditDirectory, "audit/generation-audit.json"))).resolves.toBeUndefined();
    await expect(access(join(withoutAuditDirectory, "audit/generation-audit.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
