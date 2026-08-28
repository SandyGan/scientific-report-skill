import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadSchemas } from "../../src/lib/schema.js";

const PROMPT_ROOT = fileURLToPath(new URL("../../prompts", import.meta.url));

const EXPECTED_PROMPTS = [
  "README.md",
  "core/missingness-and-status.md",
  "core/output-patch-contract.md",
  "core/scientific-integrity.md",
  "core/untrusted-input-boundary.md",
  "packs/ai-ml.md",
  "packs/molecular-dynamics.md",
  "packs/wet-lab.md",
  "stages/00-source-universe-snapshot.md",
  "stages/01-inventory-snapshot.md",
  "stages/02-extract-atomic-records.md",
  "stages/03-model-work-and-decisions.md",
  "stages/03-normalization-route.md",
  "stages/04-model-material-and-derivation.md",
  "stages/05-build-argument-graph.md",
  "stages/06-assess-conflict-and-uncertainty.md",
  "stages/07-challenge-and-resolve.md",
  "stages/08-controlled-wording.md",
  "stages/09-author-reproducibility.md",
] as const;

const REQUIRED_SECTIONS = [
  "Prompt declaration",
  "Required inputs",
  "Structured outputs",
  "Invariants",
  "Forbidden inferences",
  "Failure behavior",
  "Continuation behavior",
] as const;

interface PromptDocument {
  path: string;
  source: string;
  sections: Map<string, string>;
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry): Promise<string[]> => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  }));
  return nested.flat();
}

function portablePath(path: string): string {
  return relative(PROMPT_ROOT, path).split(sep).join("/");
}

function parseLevelTwoSections(source: string): Map<string, string> {
  const headings = [...source.matchAll(/^##\s+(.+?)\s*$/gmu)];
  const sections = new Map<string, string>();
  headings.forEach((heading, index) => {
    const name = heading[1];
    if (name === undefined || heading.index === undefined) return;
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? source.length;
    sections.set(name, source.slice(start, end).trim());
  });
  return sections;
}

async function loadPrompts(): Promise<PromptDocument[]> {
  const files = await markdownFiles(PROMPT_ROOT);
  return Promise.all(files.sort().map(async (path) => {
    const source = await readFile(path, "utf8");
    return { path: portablePath(path), source, sections: parseLevelTwoSections(source) };
  }));
}

function declarationValue(section: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`^-\\s+\\*\\*${escaped}:\\*\\*\\s+\\x60([^\\x60]+)\\x60\\s*$`, "mu").exec(section);
  return match?.[1] ?? null;
}

describe("prompt inventory and declaration contract", () => {
  it("inventories the complete checked-in prompt bundle", async () => {
    const prompts = await loadPrompts();
    expect(prompts.map((prompt) => prompt.path)).toEqual([...EXPECTED_PROMPTS].sort());
  });

  it("requires every prompt and composable fragment to expose each conformance section exactly once", async () => {
    const prompts = await loadPrompts();
    const violations: string[] = [];
    for (const prompt of prompts) {
      const headings = [...prompt.source.matchAll(/^##\s+(.+?)\s*$/gmu)]
        .map((match) => match[1]);
      for (const section of REQUIRED_SECTIONS) {
        const count = headings.filter((heading) => heading === section).length;
        const body = prompt.sections.get(section);
        if (count !== 1) violations.push(`${prompt.path}: ${section} occurs ${count} times`);
        if (body === undefined || body.length === 0) violations.push(`${prompt.path}: ${section} is empty`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("requires unique provider-neutral IDs and explicit semantic versions", async () => {
    const prompts = await loadPrompts();
    const identities = prompts.map((prompt) => {
      const declaration = prompt.sections.get("Prompt declaration") ?? "";
      return {
        path: prompt.path,
        id: declarationValue(declaration, "Prompt ID"),
        version: declarationValue(declaration, "Version"),
      };
    });

    expect(identities.every(({ id }) => id !== null && /^report_prompt\.[a-z0-9_.]+$/u.test(id))).toBe(true);
    expect(identities.every(({ version }) => version !== null && /^\d+\.\d+\.\d+$/u.test(version))).toBe(true);
    expect(new Set(identities.map(({ id }) => id)).size).toBe(identities.length);
  });

  it("keeps stage and pack fragments explicitly dependent on the core contract", async () => {
    const prompts = await loadPrompts();
    const composable = prompts.filter((prompt) => prompt.path.startsWith("stages/") || prompt.path.startsWith("packs/"));
    for (const prompt of composable) {
      expect(prompt.sections.get("Required inputs"), prompt.path).toMatch(/\bcore\b/iu);
      expect(prompt.sections.get("Structured outputs"), prompt.path).toMatch(/\bshared\b/iu);
    }
  });

  it("validates every published generation contract example against its declared schema", async () => {
    const schemas = loadSchemas();
    const examples = [
      ["request.example.json", "https://schemas.report-prompt.org/v1/generation-request.schema.json"],
      ["response.example.json", "https://schemas.report-prompt.org/v1/generation-response.schema.json"],
      ["cannot-complete.example.json", "https://schemas.report-prompt.org/v1/generation-response.schema.json"],
    ] as const;
    for (const [filename, schemaId] of examples) {
      const source = await readFile(join(PROMPT_ROOT, "contracts", filename), "utf8");
      const result = schemas.validate(schemaId, JSON.parse(source));
      expect(result.issues, filename).toEqual([]);
      expect(result.valid, filename).toBe(true);
    }
  });
});
