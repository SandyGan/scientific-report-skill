import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  known,
  makePublicReport,
  makeValidAttestation,
  missing,
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

function normalizedText(element: Element | null): string {
  return (element?.textContent ?? "").replace(/\s+/gu, " ").trim();
}

function firstRecord(report: JsonObject, key: string): JsonObject {
  const value = report[key];
  if (!Array.isArray(value) || value.length === 0 || typeof value[0] !== "object" || value[0] === null || Array.isArray(value[0])) {
    throw new Error(`Fixture collection ${key} has no object record.`);
  }
  return value[0];
}

function objectField(record: JsonObject, key: string): JsonObject {
  const value = record[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Fixture field ${key} is not an object.`);
  }
  return value;
}

async function renderBoundFixture(): Promise<{
  outputDirectory: string;
  payloadHash: string;
  validationAttestationBound: boolean;
}> {
  const report = makePublicReport();
  const payloadHash = sha256Text(serializePublicPayload(report));
  const outputDirectory = await temporaryDirectory("renderer-semantics");
  const result = await renderReport(report, {
    outDir: outputDirectory,
    templateDir: TEMPLATE_ROOT,
    attestation: makeValidAttestation(report, payloadHash),
  });
  return {
    outputDirectory,
    payloadHash,
    validationAttestationBound: result.validationAttestationBound,
  };
}

describe("renderer epistemic and record semantics", () => {
  it("keeps planned, external, failed, negative, excluded, and retracted records explicit", async () => {
    const rendered = await renderBoundFixture();
    const reportHtml = await readFile(join(rendered.outputDirectory, "report.html"), "utf8");
    const annexHtml = await readFile(join(rendered.outputDirectory, "annex/index.html"), "utf8");
    const reportDocument = new JSDOM(reportHtml).window.document;
    const annexDocument = new JSDOM(annexHtml).window.document;

    expect(normalizedText(reportDocument.querySelector('[data-kind="work-unit"][data-state="planned"]'))).toContain(
      "work:planned",
    );

    const external = [...reportDocument.querySelectorAll('[data-kind="work-unit"][data-state="completed"]')]
      .find((record) => normalizedText(record).includes("work:external-completed"));
    expect(normalizedText(external ?? null)).toContain("external_study");

    expect(normalizedText(reportDocument.querySelector('[data-kind="attempt"][data-state="failed"]'))).toContain(
      "attempt:failed",
    );
    expect(normalizedText(reportDocument.querySelector('[data-kind="failure"]'))).toContain(
      "failure:instrument",
    );

    const negative = reportDocument.querySelector('[data-kind~="no_detectable_effect"]');
    expect(normalizedText(negative)).toContain("result:negative");
    expect(normalizedText(negative)).toContain("Negative-result qualification");
    expect(normalizedText(negative)).toContain("Not eligible for biological counterevidence");

    expect(normalizedText(reportDocument.querySelector('[data-kind~="excluded"]'))).toContain(
      "result:excluded",
    );
    expect(normalizedText(reportDocument.querySelector('[data-kind~="retracted"]'))).toContain(
      "result:retracted",
    );
    expect(normalizedText(annexDocument.querySelector('[data-kind~="retraction"]'))).toContain(
      "revision:retraction",
    );

    const projectCount = [...reportDocument.querySelectorAll(".instrument-cell")]
      .find((cell) => normalizedText(cell).includes("This-project work units"));
    expect(normalizedText(projectCount?.querySelector(".instrument-cell__reading") ?? null)).toBe("1 / 3");
  });

  it("preserves unknown, not_applicable, and withheld instead of coercing them", async () => {
    const rendered = await renderBoundFixture();
    const reportHtml = await readFile(join(rendered.outputDirectory, "report.html"), "utf8");
    const annexHtml = await readFile(join(rendered.outputDirectory, "annex/index.html"), "utf8");
    const combinedText = normalizedText(
      new JSDOM(`<main>${reportHtml}${annexHtml}</main>`).window.document.querySelector("main"),
    );

    expect(combinedText).toContain("Unknown — Temperature was not recorded.");
    expect(combinedText).toContain("Not applicable — No optional note applies.");
    expect(combinedText).toContain("Withheld — The sample label is restricted.");
    expect(combinedText).toContain("Withheld — The public projection withholds the sample label.");
  });

  it("[reproducibility-axis-substitution] uses canonical axis_assessments for prominent replay tiles and keeps record diagnostics separate", async () => {
    const report = cloneReport(makePublicReport());
    const unit = firstRecord(report, "reproducibility_units");
    const assessments = objectField(unit, "axis_assessments");
    const provenance = objectField(assessments, "provenance_closure");
    const artifactAccess = objectField(assessments, "data_and_artifact_access");
    const environmentAxis = objectField(assessments, "environment_capture");
    const randomAxis = objectField(assessments, "random_state_capture");
    provenance.state = "unsatisfied";
    provenance.rationale = "Canonical provenance axis is unsatisfied despite closure records.";
    artifactAccess.state = "unsatisfied";
    artifactAccess.rationale = "Canonical access axis is unsatisfied despite an available record.";
    environmentAxis.state = "unsatisfied";
    environmentAxis.rationale = "Canonical environment axis is unsatisfied.";
    randomAxis.state = "unsatisfied";
    randomAxis.rationale = "Canonical random-state axis is unsatisfied.";

    const inputClosure = objectField(unit, "input_closure");
    inputClosure.state = "satisfied";
    inputClosure.rationale = "Bound input-closure record reports satisfied.";
    const artifactClosure = objectField(unit, "artifact_closure");
    artifactClosure.state = "satisfied";
    artifactClosure.rationale = "Bound artifact-closure record reports satisfied.";
    const environmentRecord = objectField(objectField(unit, "environment_record"), "assessment");
    environmentRecord.state = "satisfied";
    environmentRecord.rationale = "Bound environment record reports satisfied.";
    const randomRecord = objectField(objectField(unit, "random_state_record"), "assessment");
    randomRecord.state = "satisfied";
    randomRecord.rationale = "Bound random-state record reports satisfied.";

    const outputDirectory = await temporaryDirectory("canonical-repro-axes");
    const expectedScientificBytes = serializePublicPayload(report);
    await renderReport(report, { outDir: outputDirectory, templateDir: TEMPLATE_ROOT });
    const document = new JSDOM(await readFile(join(outputDirectory, "report.html"), "utf8")).window.document;

    for (const axisName of [
      "provenance_closure",
      "data_and_artifact_access",
      "environment_and_random_state_capture",
    ]) {
      const tile = document.querySelector(`[data-axis="${axisName}"]`);
      expect(tile?.getAttribute("data-status"), axisName).toBe("unsatisfied");
      expect(normalizedText(tile), axisName).toContain("unsatisfied");
    }
    expect(normalizedText(document.querySelector('[data-axis="provenance_closure"]'))).toContain(
      "Canonical provenance axis is unsatisfied despite closure records.",
    );
    expect(normalizedText(document.querySelector('[data-axis="data_and_artifact_access"]'))).toContain(
      "Canonical access axis is unsatisfied despite an available record.",
    );
    const detail = normalizedText(document.querySelector(".replay-detail-grid"));
    expect(detail).toContain("Bound input-closure record reports satisfied.");
    expect(detail).toContain("Bound artifact-closure record reports satisfied.");
    expect(detail).toContain("Bound environment record reports satisfied.");
    expect(detail).toContain("Bound random-state record reports satisfied.");
    expect(await readFile(join(outputDirectory, "scientific-report.public.json"), "utf8")).toBe(expectedScientificBytes);
  });

  it("[interval-unit-omitted] renders each interval's distinct unit and preserves unknown interval-unit missingness", async () => {
    const report = cloneReport(makePublicReport());
    const knownUnitResult = firstRecord(report, "results");
    const knownEstimate = objectField(knownUnitResult, "effect_estimate");
    objectField(knownEstimate, "interval").unit = known("log arbitrary unit");

    const unknownUnitResult = cloneReport(knownUnitResult);
    unknownUnitResult.result_id = "result:unknown-interval-unit";
    unknownUnitResult.statement = "The interval unit was not recorded independently.";
    const unknownEstimate = objectField(unknownUnitResult, "effect_estimate");
    objectField(unknownEstimate, "interval").unit = missing(
      "unknown",
      "The interval scale unit was not recorded.",
    );
    (report.results as JsonObject[]).push(unknownUnitResult);

    const outputDirectory = await temporaryDirectory("interval-unit");
    const expectedScientificBytes = serializePublicPayload(report);
    await renderReport(report, { outDir: outputDirectory, templateDir: TEMPLATE_ROOT });
    const document = new JSDOM(await readFile(join(outputDirectory, "report.html"), "utf8")).window.document;
    const resultCards = [...document.querySelectorAll(".result-card")];
    const knownCard = resultCards.find((card) => normalizedText(card).includes("result:negative"));
    const unknownCard = resultCards.find((card) => normalizedText(card).includes("result:unknown-interval-unit"));

    expect(normalizedText(knownCard?.querySelector('[data-label="Interval"]') ?? null)).toContain(
      "interval unit: log arbitrary unit",
    );
    expect(normalizedText(knownCard?.querySelector('[data-label="Unit"]') ?? null)).toBe("arbitrary unit");
    expect(normalizedText(unknownCard?.querySelector('[data-label="Interval"]') ?? null)).toContain(
      "interval unit: Unknown — The interval scale unit was not recorded.",
    );
    expect(normalizedText(unknownCard?.querySelector('[data-label="Unit"]') ?? null)).toBe("arbitrary unit");
    expect(await readFile(join(outputDirectory, "scientific-report.public.json"), "utf8")).toBe(expectedScientificBytes);
  });

  it("[unsupported-overview-superlatives] uses neutral ordered-overview labels when later records have stronger declared support", async () => {
    const report = cloneReport(makePublicReport());
    const firstClaim = firstRecord(report, "claims");
    firstClaim.support_status = "qualified";
    firstClaim.proposition = "FIRST QUALIFIED CLAIM FACT";
    const supportedClaim = cloneReport(firstClaim);
    supportedClaim.claim_id = "claim:later-supported";
    supportedClaim.proposition = "LATER SUPPORTED CLAIM FACT";
    supportedClaim.support_status = "supported";
    (report.claims as JsonObject[]).push(supportedClaim);
    const question = firstRecord(report, "research_questions");
    question.claim_ids = ["claim:key", "claim:later-supported"];

    const secondCounterevidence = cloneReport((report.evidence_items as JsonObject[])[1] as JsonObject);
    secondCounterevidence.evidence_item_id = "evidence:later-counter";
    secondCounterevidence.summary = "LATER COUNTEREVIDENCE FACT";
    (report.evidence_items as JsonObject[]).push(secondCounterevidence);
    const secondCounterEdge = cloneReport((report.evidence_edges as JsonObject[])[1] as JsonObject);
    secondCounterEdge.evidence_edge_id = "edge:later-counter";
    secondCounterEdge.evidence_item_id = "evidence:later-counter";
    (report.evidence_edges as JsonObject[]).push(secondCounterEdge);
    firstClaim.counterevidence_edge_ids = ["edge:counter", "edge:later-counter"];

    const outputDirectory = await temporaryDirectory("neutral-overview");
    const expectedScientificBytes = serializePublicPayload(report);
    await renderReport(report, { outDir: outputDirectory, templateDir: TEMPLATE_ROOT });
    const document = new JSDOM(await readFile(join(outputDirectory, "report.html"), "utf8")).window.document;
    const overviewText = normalizedText(document.querySelector("#overview"));
    const allText = normalizedText(document.body);

    expect(overviewText).not.toMatch(/best-supported|strongest counterevidence|primary blocker|primary research question/iu);
    expect(overviewText).toContain("First question-linked claim");
    expect(overviewText).toContain("no ranking is implied");
    expect(overviewText).toContain("FIRST QUALIFIED CLAIM FACT");
    expect(allText).toContain("LATER SUPPORTED CLAIM FACT");
    expect(allText).toContain("LATER COUNTEREVIDENCE FACT");
    expect(await readFile(join(outputDirectory, "scientific-report.public.json"), "utf8")).toBe(expectedScientificBytes);
  });

  it("renders a valid status only for an exact matching attestation", async () => {
    const rendered = await renderBoundFixture();
    expect(rendered.validationAttestationBound).toBe(true);

    const reportHtml = await readFile(join(rendered.outputDirectory, "report.html"), "utf8");
    const attestationText = await readFile(
      join(rendered.outputDirectory, "validation-attestation.json"),
      "utf8",
    );
    const document = new JSDOM(reportHtml).window.document;
    const attestationSignal = [...document.querySelectorAll(".console-header__signals .status-chip")]
      .find((element) => normalizedText(element).startsWith("Attestation:"));

    expect(attestationSignal?.getAttribute("data-status")).toBe("valid");
    expect(normalizedText(attestationSignal ?? null)).toBe("Attestation: valid");
    expect(normalizedText(document.querySelector(".report-footer"))).toContain(rendered.payloadHash);
    expect(JSON.parse(attestationText)).toMatchObject({
      overall_status: "valid",
      scientific_payload_hash: rendered.payloadHash,
    });
  });
});
