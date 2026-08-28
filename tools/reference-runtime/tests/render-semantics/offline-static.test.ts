import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";

import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import { renderReport } from "../../src/renderer/index.js";
import {
  TEMPLATE_ROOT,
  allIdentifierValues,
  makePublicReport,
} from "./fixtures.js";

const temporaryDirectories: string[] = [];

async function renderStaticFixture(): Promise<{
  report: ReturnType<typeof makePublicReport>;
  outputDirectory: string;
  writtenFiles: string[];
}> {
  const outputDirectory = await mkdtemp(join(tmpdir(), "report-prompt-static-render-"));
  temporaryDirectories.push(outputDirectory);
  const report = makePublicReport();
  const rendered = await renderReport(report, {
    outDir: outputDirectory,
    templateDir: TEMPLATE_ROOT,
  });
  return { report, outputDirectory, writtenFiles: rendered.writtenFiles };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function textOf(document: Document): string {
  return (document.body.textContent ?? "").replace(/\s+/gu, " ");
}

function effectivelyHidden(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current !== null) {
    if (current.hidden) return true;
    current = current.parentElement;
  }
  return false;
}

describe("offline static renderer semantics", () => {
  it("keeps every public payload field and identifier available without JavaScript", async () => {
    const { report, outputDirectory } = await renderStaticFixture();
    const reportDocument = new JSDOM(
      await readFile(join(outputDirectory, "report.html"), "utf8"),
    ).window.document;
    const annexDocument = new JSDOM(
      await readFile(join(outputDirectory, "annex/index.html"), "utf8"),
    ).window.document;
    const catalogDocument = new JSDOM(
      await readFile(join(outputDirectory, "annex/records.html"), "utf8"),
    ).window.document;

    reportDocument.querySelectorAll("script").forEach((script) => script.remove());
    annexDocument.querySelectorAll("script").forEach((script) => script.remove());

    expect(reportDocument.querySelectorAll("[data-record]").length).toBeGreaterThan(0);
    expect(annexDocument.querySelectorAll("[data-record]").length).toBeGreaterThan(0);
    expect(reportDocument.querySelectorAll("[data-record][hidden]")).toHaveLength(0);
    expect(annexDocument.querySelectorAll("[data-record][hidden]")).toHaveLength(0);
    expect(reportDocument.querySelector("[data-console-controls]")?.hasAttribute("hidden")).toBe(true);
    expect(reportDocument.querySelector("[data-filter-status]")?.parentElement?.hasAttribute("hidden")).toBe(true);
    const safetyNodes = [...reportDocument.querySelectorAll<HTMLElement>('[data-safety-record="true"]')];
    expect(safetyNodes.length).toBeGreaterThan(0);
    expect(safetyNodes.filter(effectivelyHidden)).toHaveLength(0);
    expect(textOf(reportDocument)).toContain("interval unit: arbitrary unit");
    for (const details of [...reportDocument.querySelectorAll("details"), ...annexDocument.querySelectorAll("details")]) {
      expect(details.querySelector(":scope > summary")).not.toBeNull();
    }

    const catalogByKey = new Map(
      [...catalogDocument.querySelectorAll(".annex-section")].map((section) => [
        section.querySelector("h2 code")?.textContent ?? "",
        section.querySelector("pre code")?.textContent ?? "",
      ]),
    );
    expect([...catalogByKey.keys()].sort()).toEqual(Object.keys(report).sort());
    for (const [key, value] of Object.entries(report)) {
      const serialized = catalogByKey.get(key);
      expect(serialized, key).toBeDefined();
      expect(JSON.parse(serialized ?? "null"), key).toEqual(value);
    }

    const combinedText = [textOf(reportDocument), textOf(annexDocument), textOf(catalogDocument)].join(" ");
    for (const identifier of allIdentifierValues(report)) {
      expect(combinedText, identifier).toContain(identifier);
    }
  });

  it("uses only bundle-contained relative links and local executable resources", async () => {
    const { outputDirectory, writtenFiles } = await renderStaticFixture();
    const generatedHtml = writtenFiles.filter((path) => path.endsWith(".html"));
    const members = new Set(writtenFiles);

    for (const memberPath of generatedHtml) {
      const html = await readFile(join(outputDirectory, ...memberPath.split("/")), "utf8");
      const document = new JSDOM(html).window.document;
      const base = new URL(memberPath, "file:///portable-report/");
      const references = [
        ...[...document.querySelectorAll("[href]")].map((element) => element.getAttribute("href")),
        ...[...document.querySelectorAll("[src]")].map((element) => element.getAttribute("src")),
      ].filter((value): value is string => value !== null && value.length > 0);

      for (const reference of references) {
        expect(reference, `${memberPath}: ${reference}`).not.toMatch(/^(?:https?:)?\/\//iu);
        expect(reference, `${memberPath}: ${reference}`).not.toMatch(/^(?:javascript|vbscript):/iu);
        expect(reference, `${memberPath}: ${reference}`).not.toContain("\\");

        const resolved = new URL(reference, base);
        expect(resolved.protocol, `${memberPath}: ${reference}`).toBe("file:");
        expect(resolved.pathname, `${memberPath}: ${reference}`).toMatch(/^\/portable-report\//u);

        if (!reference.startsWith("#")) {
          const target = posix.relative("/portable-report", resolved.pathname);
          expect(members.has(target), `${memberPath}: ${reference} -> ${target}`).toBe(true);
        }
      }

      for (const script of document.querySelectorAll("script")) {
        expect(script.getAttribute("src"), memberPath).toMatch(/^\.\.\/assets\/report\.js$|^assets\/report\.js$/u);
        expect(script.textContent?.trim() ?? "", memberPath).toBe("");
      }
    }

    for (const memberPath of writtenFiles.filter((path) => /\.(?:css|js|svg)$/u.test(path))) {
      const source = await readFile(join(outputDirectory, ...memberPath.split("/")), "utf8");
      const withoutSvgNamespace = source.replace('xmlns="http://www.w3.org/2000/svg"', "");
      expect(withoutSvgNamespace, memberPath).not.toMatch(/(?:https?:)?\/\//iu);
      expect(withoutSvgNamespace, memberPath).not.toMatch(/@import\s/iu);
    }
  });
});
