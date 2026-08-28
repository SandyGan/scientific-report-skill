import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TSC = join(PROJECT_ROOT, "node_modules", "typescript", "bin", "tsc");
const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(PROJECT_ROOT, "node_modules", ".generation-installed-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("installed generation package subpath", () => {
  it("exports callable exchange, apply, and deterministic S3 profile APIs from a clean packed layout", async () => {
    const root = await temporaryRoot();
    const packageRoot = join(root, "package-source");
    await mkdir(packageRoot, { recursive: true });
    await exec(process.execPath, [TSC,
      "-p", join(PROJECT_ROOT, "tsconfig.json"),
      "--outDir", join(packageRoot, "dist"),
      "--rootDir", join(PROJECT_ROOT, "src"),
      "--sourceMap", "false",
    ], { cwd: PROJECT_ROOT });
    for (const path of ["schemas", "rules", "protocol", "prompts", "examples"]) {
      await cp(join(PROJECT_ROOT, path), join(packageRoot, path), { recursive: true });
    }
    for (const path of ["package.json", "VERSION"]) await cp(join(PROJECT_ROOT, path), join(packageRoot, path));

    await exec("npm", ["pack", "--ignore-scripts", "--pack-destination", root], { cwd: packageRoot });
    const tarball = join(root, "scientific-report-console-0.1.1.tgz");
    const consumer = join(root, "consumer");
    const modules = join(consumer, "node_modules");
    await mkdir(modules, { recursive: true });
    await exec("tar", ["-xzf", tarball, "-C", modules]);
    await rename(join(modules, "package"), join(modules, "scientific-report-console"));

    const script = join(consumer, "call-generation.mjs");
    await writeFile(script, `
      import { createHash } from "node:crypto";
      import { readFileSync } from "node:fs";
      import {
        applyGenerationResponse,
        resolveGenerationProfile,
        S3_PROFILE_HASH,
        S3_PROFILE_ID,
        S3_PROFILE_VERSION,
        validateGenerationExchange,
        validatePromptComposition
      } from "scientific-report-console/generation";
      const canonical = (value) => {
        if (value === null || typeof value !== "object") return Object.is(value, -0) ? "0" : JSON.stringify(value);
        if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
        return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
      };
      const hash = (value) => "sha256:" + createHash("sha256").update(canonical(value), "utf8").digest("hex");
      const profile = resolveGenerationProfile(S3_PROFILE_ID, S3_PROFILE_VERSION, S3_PROFILE_HASH);
      const packageRoot = new URL("./node_modules/scientific-report-console/", import.meta.url);
      const contracts = new URL("prompts/contracts/", packageRoot);
      const request = JSON.parse(readFileSync(new URL("request.example.json", contracts), "utf8"));
      const published = JSON.parse(readFileSync(new URL("response.example.json", contracts), "utf8"));
      const target = JSON.parse(readFileSync(new URL("examples/cross-domain/scientific-report.canonical.json", packageRoot), "utf8"));
      request.report_id = target.report_id;
      request.project_id = target.project_id;
      request.base_report_version = null;
      request.base_payload_hash = null;
      const positive = structuredClone(published);
      const task = structuredClone(positive.review_tasks[0]);
      positive.status = "needs_review";
      positive.cannot_complete_reason = null;
      positive.candidate_operations = [{
        operation_id: "operation:installed:review",
        op: "add",
        object_type: "review_task",
        object_id: task.review_task_id,
        base_object_version: null,
        authorized_root: "/review_tasks",
        path: "/review_tasks/-",
        value: task,
        proposed_object_version: "1.0.0",
        provenance_kind: "source_derived",
        source_bindings: structuredClone(positive.source_bindings),
        premise_bindings: [],
        rationale: "Preserve the bounded authorization gap as a review task.",
        requires_human_confirmation: true
      }];
      positive.forbidden_inferences_detected[0].affected_operation_ids = ["operation:installed:review"];
      positive.forbidden_inferences_detected[0].disposition = "converted_to_review_task";
      positive.request_contract_hash = hash(request);
      const injected = structuredClone(positive);
      injected.authorized_patch_roots.push("/claims");
      injected.candidate_operations[0].authorized_root = "/claims";
      injected.candidate_operations[0].path = "/claims/-";
      injected.candidate_operations[0].object_type = "claim";
      const positiveExchange = validateGenerationExchange(request, positive);
      const positiveApply = applyGenerationResponse(request, positive, target);
      const injectedExchange = validateGenerationExchange(request, injected);
      const injectedApply = applyGenerationResponse(request, injected, target);
      process.stdout.write(JSON.stringify({
        profile: profile?.profile_id,
        exchangeCallable: typeof validateGenerationExchange === "function",
        applyCallable: typeof applyGenerationResponse === "function",
        promptCompositionValid: validatePromptComposition(request).valid,
        failedControlExampleValid: validateGenerationExchange(
          JSON.parse(readFileSync(new URL("request.example.json", contracts), "utf8")),
          published
        ).valid,
        failedControlStatus: published.status,
        positiveExchangeValid: positiveExchange.valid,
        positiveApplyValid: positiveApply.valid,
        addedReviewTask: positiveApply.report?.review_tasks.some((entry) => entry.review_task_id === task.review_task_id),
        injectedExchangeValid: injectedExchange.valid,
        injectedApplyValid: injectedApply.valid
      }));
    `);
    const result = await exec(process.execPath, [script], { cwd: consumer });
    expect(JSON.parse(result.stdout)).toEqual({
      profile: "normalization-profile:s2-preserving-v1",
      exchangeCallable: true,
      applyCallable: true,
      promptCompositionValid: true,
      failedControlExampleValid: true,
      failedControlStatus: "cannot_complete",
      positiveExchangeValid: true,
      positiveApplyValid: true,
      addedReviewTask: true,
      injectedExchangeValid: false,
      injectedApplyValid: false,
    });

    const installedPackage = JSON.parse(await readFile(join(modules, "scientific-report-console", "package.json"), "utf8")) as Record<string, any>;
    expect(installedPackage.exports["./generation"].import).toBe("./dist/generation/index.js");
    expect(installedPackage.bin).toEqual({
      "scientific-report-console": "dist/cli/index.js",
      "report-prompt": "dist/cli/index.js",
    });
  }, 120_000);
});
