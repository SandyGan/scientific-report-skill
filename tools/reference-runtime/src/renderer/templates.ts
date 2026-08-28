import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import Handlebars from "handlebars";

import { FULL_CATALOG_TEMPLATE } from "./full-catalog-template.js";
import { RendererError } from "./types.js";
import type { ViewObject } from "./view-model.js";

const PARTIAL_NAMES = [
  "argument-inspector",
  "execution-history",
  "global-overview",
  "methods-and-parameters",
  "provenance-and-reproduction",
  "resolution-ledger",
  "results-and-failures",
  "supplemental-ai-audit",
] as const;

export const rendererTemplatePaths = [
  "annex.html",
  "assets/icons.svg",
  "assets/print.css",
  "assets/report.css",
  "assets/report.js",
  ...PARTIAL_NAMES.map((name) => `partials/${name}.html`),
  "report.html",
].sort((left, right) => left.localeCompare(right, "en"));

export interface RendererTemplates {
  renderReport(viewModel: ViewObject): string;
  renderAnnex(viewModel: ViewObject): string;
  renderCatalog(viewModel: ViewObject): string;
}

/**
 * Hash every file that can change rendered output. Path/length framing prevents
 * concatenation ambiguity and makes the identity independent of its directory.
 */
export async function computeRendererTemplateHash(templateRoot: string): Promise<`sha256:${string}`> {
  const hash = createHash("sha256");
  for (const memberPath of rendererTemplatePaths) {
    const bytes = await readTrustedTemplateBytes(join(templateRoot, ...memberPath.split("/")));
    hash.update(`${memberPath.length}:${memberPath}:${bytes.byteLength}:`, "utf8");
    hash.update(bytes);
  }
  return `sha256:${hash.digest("hex")}`;
}

export async function loadRendererTemplates(templateRoot: string): Promise<RendererTemplates> {
  const handlebars = Handlebars.create();

  for (const partialName of PARTIAL_NAMES) {
    const source = await readTrustedTemplate(join(templateRoot, "partials", `${partialName}.html`));
    assertEscapedExpressions(source, `partials/${partialName}.html`);
    handlebars.registerPartial(partialName, source);
  }

  const reportSource = await readTrustedTemplate(join(templateRoot, "report.html"));
  const annexSource = await readTrustedTemplate(join(templateRoot, "annex.html"));
  assertEscapedExpressions(reportSource, "report.html");
  assertEscapedExpressions(annexSource, "annex.html");
  assertEscapedExpressions(FULL_CATALOG_TEMPLATE, "renderer/full-catalog-template");

  const compileOptions: CompileOptions = {
    noEscape: false,
    strict: false,
    preventIndent: true,
  };
  const report = handlebars.compile(reportSource, compileOptions);
  const annex = handlebars.compile(annexSource, compileOptions);
  const catalog = handlebars.compile(FULL_CATALOG_TEMPLATE, compileOptions);
  const runtimeOptions = {
    allowProtoMethodsByDefault: false,
    allowProtoPropertiesByDefault: false,
  };

  return {
    renderReport(viewModel) {
      return ensureFinalNewline(report(viewModel, runtimeOptions));
    },
    renderAnnex(viewModel) {
      return ensureFinalNewline(annex(viewModel, runtimeOptions));
    },
    renderCatalog(viewModel) {
      return ensureFinalNewline(catalog(viewModel, runtimeOptions));
    },
  };
}

async function readTrustedTemplate(path: string): Promise<string> {
  return (await readTrustedTemplateBytes(path)).toString("utf8");
}

async function readTrustedTemplateBytes(path: string): Promise<Buffer> {
  const info = await lstat(path).catch((error: unknown) => {
    throw new RendererError("TEMPLATE_UNREADABLE", `Cannot inspect renderer template ${path}: ${errorMessage(error)}`, path);
  });
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new RendererError("UNSAFE_TEMPLATE_FILE", `Renderer template must be a regular non-symlink file: ${path}`, path);
  }
  return readFile(path);
}

function assertEscapedExpressions(source: string, path: string): void {
  if (/\{\{\{|\{\{\s*&/u.test(source)) {
    throw new RendererError(
      "UNESCAPED_TEMPLATE_EXPRESSION",
      `Template ${path} contains an unescaped Handlebars expression. All report values must use escaped {{...}} interpolation.`,
      path,
    );
  }
}

function ensureFinalNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
