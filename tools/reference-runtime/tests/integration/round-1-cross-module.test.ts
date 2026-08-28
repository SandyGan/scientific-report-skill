import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const PROJECT_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const RUNTIME_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLI = path.join(RUNTIME_ROOT, "src/cli/index.ts");
const TSX_CLI = path.join(RUNTIME_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const temporaryRoots: string[] = [];

async function temporaryDirectory(label: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `scientific-report-console-${label}-`));
  temporaryRoots.push(root);
  return root;
}

async function runCli(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [TSX_CLI, CLI, ...args], { cwd, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error === null
        ? 0
        : typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === "number"
          ? (error as unknown as { code: number }).code
          : 1;
      resolve({ code, stdout, stderr });
    });
  });
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("round-1 cross-module command and packaging contracts", () => {
  it("[PT-04] completes init-to-normalize-to-project-to-validate-to-render-to-verify as an honest working copy", async () => {
    const cwd = await temporaryDirectory("cli-flow");
    const work = path.join(cwd, "work");
    const bundle = path.join(cwd, "bundle");
    const policy = path.join(cwd, "policy.json");
    await writeFile(policy, `${JSON.stringify({
      policy_id: "policy.cli-regression",
      policy_version: "1",
      rules: { default_action: "retain" },
    }, null, 2)}\n`);

    // An unrelated current-working-directory template must not alter output.
    await mkdir(path.join(cwd, "templates/scientific-console/assets"), { recursive: true });
    await writeFile(path.join(cwd, "templates/scientific-console/assets/report.css"), "body{display:none!important}\n");

    expect((await runCli(["init", work, "--title", "CLI regression", "--project-id", "project.cli-regression"], cwd)).code).toBe(0);
    const normalized = await runCli([
      "normalize", path.join(work, "authoring-input.json"),
      "--out", path.join(work, "scientific-report.canonical.json"),
      "--created-at", "2026-08-24T00:00:00.000Z",
      "--report-id", "report.cli-regression",
      "--report-version", "1",
    ], cwd);
    expect(normalized.code).toBe(1);
    expect(normalized.stdout).toContain("Normalized report written");

    const projected = await runCli([
      "project", path.join(work, "scientific-report.canonical.json"),
      "--out", path.join(work, "scientific-report.public.json"),
      "--projection-out", path.join(work, "disclosure-projection.json"),
      "--projection-id", "projection.cli-regression.public-v1",
      "--created-at", "2026-08-24T00:00:00.000Z",
      "--policy", policy,
    ], cwd);
    expect(projected.code, projected.stderr).toBe(0);
    expect(projected.stdout).toContain("Projection status: complete");

    const validated = await runCli([
      "validate", path.join(work, "scientific-report.public.json"),
      "--source-report", path.join(work, "scientific-report.canonical.json"),
      "--projection", path.join(work, "disclosure-projection.json"),
      "--attestation-out", path.join(work, "validation-attestation.json"),
    ], cwd);
    expect(validated.code).toBe(1);
    expect(validated.stdout).toContain("Release gate: not eligible");

    const rendered = await runCli([
      "render", path.join(work, "scientific-report.public.json"),
      "--source-report", path.join(work, "scientific-report.canonical.json"),
      "--projection", path.join(work, "disclosure-projection.json"),
      "--artifact-root", work,
      "--out", bundle,
      "--working-copy",
    ], cwd);
    expect(rendered.code, rendered.stderr).toBe(0);
    expect(rendered.stdout).toContain("Integrity-only verification: PASS — NOT RELEASE-ELIGIBLE");
    expect(await readFile(path.join(bundle, "assets/report.css"), "utf8")).not.toContain("display:none!important");

    const verified = await runCli(["verify", bundle, "--working-copy"], cwd);
    expect(verified.code, verified.stderr).toBe(0);
    expect(verified.stdout).toContain("Integrity-only verification: PASS — NOT RELEASE-ELIGIBLE");
    const manifest = JSON.parse(await readFile(path.join(bundle, "package-manifest.json"), "utf8")) as Record<string, unknown>;
    expect(manifest.disclosure_projection_hash).toMatch(/^sha256:[0-9a-f]{64}$/u);
  }, 180_000);

  it("[PT-07] gates npm packing and allowlists only runtime/contract assets", async () => {
    const packageJson = JSON.parse(await readFile(path.join(RUNTIME_ROOT, "package.json"), "utf8")) as {
      private?: boolean;
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
      files?: string[];
    };
    expect(packageJson.private).toBe(true);
  });

  it("[PT-08] documents the runtime as optional rather than a user installation requirement", async () => {
    const readme = await readFile(path.join(PROJECT_ROOT, "README.md"), "utf8");
    expect(readme).toContain("Node.js is optional");
    expect(readme).not.toContain("npm install ../scientific-report-console");
  });
});
