import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PROMPT_ROOT = fileURLToPath(new URL("../../prompts", import.meta.url));

interface PromptText {
  path: string;
  source: string;
  sections: Map<string, string>;
}

async function walkMarkdown(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map(async (entry): Promise<string[]> => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkMarkdown(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  }));
  return children.flat();
}

function sectionsOf(source: string): Map<string, string> {
  const headings = [...source.matchAll(/^##\s+(.+?)\s*$/gmu)];
  const result = new Map<string, string>();
  headings.forEach((heading, index) => {
    if (heading.index === undefined || heading[1] === undefined) return;
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? source.length;
    result.set(heading[1], source.slice(start, end).trim());
  });
  return result;
}

async function promptTexts(): Promise<PromptText[]> {
  const files = (await walkMarkdown(PROMPT_ROOT)).sort();
  return Promise.all(files.map(async (path) => {
    const source = await readFile(path, "utf8");
    return {
      path: relative(PROMPT_ROOT, path).split(sep).join("/"),
      source,
      sections: sectionsOf(source),
    };
  }));
}

interface Finding {
  detector: string;
  excerpt: string;
}

const VENDOR_PATTERNS: ReadonlyArray<{ detector: string; expression: RegExp }> = [
  {
    detector: "provider-name",
    expression: /\b(?:anthropic|claude|openai|chatgpt|gemini|vertex\s+ai|bedrock|azure\s+openai|mistral|cohere|ollama)\b/giu,
  },
  {
    detector: "provider-model-id",
    expression: /\b(?:gpt|claude|gemini|llama|mixtral)[-_ ]?\d[\w.-]*/giu,
  },
  {
    detector: "provider-package",
    expression: /(?:@anthropic-ai\/|langchain_openai|google\.generativeai|from\s+["']openai["']|require\(["']openai["']\))/giu,
  },
  {
    detector: "provider-sdk-shape",
    expression: /(?:client\.chat\.completions(?:\.create)?|client\.messages\.(?:create|stream)|generateContent\s*\(|new\s+OpenAI\s*\(|new\s+Anthropic\s*\()/giu,
  },
];

function vendorCouplingFindings(source: string): Finding[] {
  return VENDOR_PATTERNS.flatMap(({ detector, expression }) =>
    [...source.matchAll(expression)].map((match) => ({ detector, excerpt: match[0] })),
  );
}

const UNSUPPORTED_CLAIM_PATTERNS: readonly RegExp[] = [
  /\b(?:the\s+)?(?:report|response|output|inventory|source universe|coverage|analysis|validation)\s+(?:is|are|was|were|will be|has been|have been)\s+(?:fully\s+)?(?:complete|comprehensive|exhaustive|validated|verified)\b/iu,
  /\b(?:all|every)\s+(?:sources?|records?|items?|tests?|checks?)\s+(?:were|are|have been|will be)\s+(?:processed|covered|included|passed|complete)\b/iu,
  /\b(?:all\s+)?(?:tests?|checks?)\s+(?:have\s+)?passed\b/iu,
  /\bguaranteed\s+(?:complete|correct|validated|verified)\b/iu,
  /\bready\s+(?:to|for)\s+(?:publish|publishing|publication)\b/iu,
];

const DIRECT_NEGATION_PATTERN = /\b(?:do not|does not|did not|never|cannot|can't|must not|may not|without|not\s+that)\b[^.!?;:]{0,160}$/iu;
const BOUNDED_SUFFIX_PATTERN = /^\s*(?:only\b|within\b|for\s+(?:the\s+)?(?:accepted|bounded|declared|provided|registered|requested|supplied)\b|if\b|unless\b|when\b)/iu;
const OPENING_QUOTE_CHARACTERS = new Set(["\"", "'", "“", "‘", "`"]);

function isQuotedGuardTerm(line: string, start: number, end: number): boolean {
  const precedingCharacter = line[start - 1];
  if (precedingCharacter === undefined || !OPENING_QUOTE_CHARACTERS.has(precedingCharacter)) return false;
  const suffix = line.slice(end);
  return /^(?:[,;:]?[”’'"`]\s*(?:(?:and\s+similar\s+)?wording\s+)?(?:requires?|must|may|is\s+allowed\s+only)|[,;:]?[”’'"`]\s*(?:is|are)\s+(?:allowed|forbidden))/iu.test(suffix);
}

function unsupportedClaimIsQualified(line: string, start: number, end: number): boolean {
  const precedingClause = line.slice(0, start);
  const followingClause = line.slice(end);
  return DIRECT_NEGATION_PATTERN.test(precedingClause)
    || BOUNDED_SUFFIX_PATTERN.test(followingClause)
    || isQuotedGuardTerm(line, start, end);
}

function unsupportedClaims(source: string): Finding[] {
  const findings: Finding[] = [];
  source.split(/\r?\n/u).forEach((line, lineIndex) => {
    for (const expression of UNSUPPORTED_CLAIM_PATTERNS) {
      const match = expression.exec(line);
      if (match !== null && !unsupportedClaimIsQualified(line, match.index, match.index + match[0].length)) {
        findings.push({
          detector: `unsupported-completeness-or-validation-claim:${lineIndex + 1}`,
          excerpt: match[0],
        });
      }
    }
  });
  return findings;
}

function hasSourceBindingInstructions(source: string): boolean {
  const binding = /\b(?:source[-_ ]bindings?|provenance[- ]bound|evidence[- ]bound|precise bindings?)\b/iu.test(source);
  const precision = /\b(?:locator|span|premises?|derivation|accepted object IDs?\/versions?|source item)\b/iu.test(source);
  const sourceRestriction = /\b(?:supplied|accepted|provided)\b/iu.test(source);
  const obligation = /\b(?:bind|bound|required|must|only|every|each|do not|never)\b/iu.test(source);
  return binding && precision && sourceRestriction && obligation;
}

describe("provider-neutral and evidence-bound prompt safety", () => {
  it("detects provider names, model IDs, packages, and SDK request shapes", () => {
    const coupled = [
      "Use the named provider for this report.".replace("named provider", "Cl" + "aude"),
      "Use a provider-model-9 response.".replace("provider-model-9", "gpt" + "-9"),
      "Import the package with from \"provider-package\".".replace("provider-package", "op" + "enai"),
      "Call client.chat." + "completions.create and return the answer.",
    ].join("\n");
    expect(new Set(vendorCouplingFindings(coupled).map((finding) => finding.detector))).toEqual(
      new Set(["provider-name", "provider-model-id", "provider-package", "provider-sdk-shape"]),
    );
  });

  it("keeps every checked-in prompt free of vendor coupling", async () => {
    const findings = (await promptTexts()).flatMap((prompt) =>
      vendorCouplingFindings(prompt.source).map((finding) => ({ path: prompt.path, ...finding })),
    );
    expect(findings).toEqual([]);
  });

  it("detects unsupported completeness, validation, publication, and test-pass claims", () => {
    const unsafe = [
      "The report is fully complete.",
      "All tests passed.",
      "The output is ready for publication.",
      "Inspect only supplied evidence; all checks passed.",
      "The process is not optional and all tests passed.",
    ].join("\n");
    expect(unsupportedClaims(unsafe)).toHaveLength(5);
    expect(unsupportedClaims("The response is complete only for the bounded input subset; tests were not run.")).toEqual([]);
    expect(unsupportedClaims("Continuation complete means this unit is handled, not that the report is complete.")).toEqual([]);
    expect(unsupportedClaims("“Tests passed” wording requires an exact payload-bound attestation.")).toEqual([]);
    expect(unsupportedClaims("Do not claim that all tests passed.")).toEqual([]);
  });

  it("contains no unsupported affirmative completeness or validation claim", async () => {
    const findings = (await promptTexts()).flatMap((prompt) =>
      unsupportedClaims(prompt.source).map((finding) => ({ path: prompt.path, ...finding })),
    );
    expect(findings).toEqual([]);
  });

  it("requires exact source binding in the effective composed prompt", async () => {
    const prompts = await promptTexts();
    const byPath = new Map(prompts.map((prompt) => [prompt.path, prompt]));
    const core = [
      byPath.get("README.md")?.source ?? "",
      ...prompts.filter((prompt) => prompt.path.startsWith("core/")).map((prompt) => prompt.source),
    ].join("\n\n");

    expect(hasSourceBindingInstructions(core)).toBe(true);
    for (const prompt of prompts) {
      const effective = prompt.path === "README.md" || prompt.path.startsWith("core/")
        ? core
        : `${core}\n\n${prompt.source}`;
      expect(hasSourceBindingInstructions(effective), prompt.path).toBe(true);
    }
    expect(hasSourceBindingInstructions("Generate a fluent and comprehensive report from the context.")).toBe(false);
    expect(hasSourceBindingInstructions("A supplied source binding can contain a locator.")).toBe(false);
    expect(hasSourceBindingInstructions("Preserve source bindings from provided data.")).toBe(false);
  });

  it("requires explicit failure statuses and transactional continuation behavior", async () => {
    for (const prompt of await promptTexts()) {
      const failure = prompt.sections.get("Failure behavior") ?? "";
      const continuation = prompt.sections.get("Continuation behavior") ?? "";
      expect(failure, prompt.path).toMatch(/`cannot_complete`/u);
      expect(failure, prompt.path).toMatch(/`needs_review`/u);
      expect(continuation, prompt.path).toMatch(/\b(?:truncat\w*|cursor|omitted_item_ids|resume)\b/iu);
      expect(continuation, prompt.path).toMatch(/\b(?:unit|item|object|component|set|claim|target|lineage|transaction)\b/iu);
    }
  });

  it("forbids prompt responses from claiming downstream checks passed", async () => {
    const prompts = await promptTexts();
    const sharedPrompts = prompts.filter(
      (prompt) => prompt.path === "README.md" || prompt.path.startsWith("core/"),
    );
    const sharedGuard = sharedPrompts
      .flatMap((prompt) => [
        prompt.sections.get("Invariants") ?? "",
        prompt.sections.get("Forbidden inferences") ?? "",
        prompt.sections.get("Failure behavior") ?? "",
      ])
      .join("\n");
    const sharedOutputContract = sharedPrompts
      .map((prompt) => prompt.sections.get("Structured outputs") ?? "")
      .join("\n");
    for (const prompt of prompts) {
      const effectiveGuard = [
        sharedGuard,
        prompt.sections.get("Invariants") ?? "",
        prompt.sections.get("Forbidden inferences") ?? "",
        prompt.sections.get("Failure behavior") ?? "",
      ].join("\n");
      const effectiveOutput = `${sharedOutputContract}\n${prompt.sections.get("Structured outputs") ?? ""}`;
      expect(effectiveGuard, prompt.path).toMatch(/\b(?:validation|validated|checks? passed|publication readiness|ready to publish|trusted payload)\b/iu);
      expect(effectiveOutput, prompt.path).toMatch(/\b(?:candidate|patch)\b/iu);
    }
  });
});
