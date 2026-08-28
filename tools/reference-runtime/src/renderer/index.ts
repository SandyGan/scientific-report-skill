import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { findProjectRoot } from "../lib/project-paths.js";

import { normalizeJsonObject, serializePublicPayload, sha256Text, stableStringify } from "./canonical-json.js";
import {
  assertGenerationAuditBinding,
  assertPublicScientificPayload,
  bindValidationAttestation,
} from "./safety.js";
import {
  computeRendererTemplateHash,
  loadRendererTemplates,
  rendererTemplatePaths,
} from "./templates.js";
import {
  RendererError,
  type RenderOptions,
  type RenderResult,
  type TrustedTemplateIdentity,
  type WrittenFile,
} from "./types.js";
import { buildCatalogViewModel, buildReportViewModel } from "./view-model.js";

const ASSET_PATHS = [
  "assets/icons.svg",
  "assets/print.css",
  "assets/report.css",
  "assets/report.js",
] as const;

const REQUIRED_RENDER_PATHS = [
  "annex/index.html",
  "annex/records.html",
  ...ASSET_PATHS,
  "report.html",
  "scientific-report.public.json",
] as const;

/**
 * Deterministically render one already-disclosed public scientific report.
 *
 * The function deliberately does not perform disclosure projection or semantic
 * validation. It refuses non-public/incomplete projections, preserves explicit
 * missingness, binds any displayed validation status to the exact payload bytes,
 * and writes only local offline assets.
 */
export async function renderReport(report: unknown, options: RenderOptions): Promise<RenderResult> {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new RendererError("OPTIONS_REQUIRED", "renderReport requires an options object with outDir.");
  }
  const outputOption = options.outDir;
  if (typeof outputOption !== "string" || outputOption.trim() === "") {
    throw new RendererError("OUTPUT_DIRECTORY_REQUIRED", "renderReport requires options.outDir.");
  }
  const outputDirectory = resolve(outputOption);
  const templateOption = options.templateDir;

  const publicPayload = normalizeJsonObject(report);
  assertPublicScientificPayload(publicPayload);
  const publicPayloadText = serializePublicPayload(publicPayload);
  const payloadHash = sha256Text(publicPayloadText);

  const validation = bindValidationAttestation(options.attestation, publicPayload, payloadHash);
  if (validation.attestation !== null && !validation.bound) {
    throw new RendererError(
      "ATTESTATION_INCONSISTENT",
      `Supplied validation attestation cannot be rendered as a consistent bound record (status: ${validation.status}).`,
      "$attestation",
    );
  }
  const generationAudit = assertGenerationAuditBinding(options.generationAudit, publicPayload, payloadHash);

  const templateRoot = await findTemplateRoot(templateOption, options.trustedTemplateIdentity);
  const templates = await loadRendererTemplates(templateRoot);
  const assets = new Map<string, Buffer>();
  for (const assetPath of ASSET_PATHS) {
    assets.set(assetPath, await readRegularFileNoFollow(join(templateRoot, assetPath), assetPath));
  }

  const viewModel = buildReportViewModel(publicPayload, payloadHash, validation, generationAudit);
  const catalogViewModel = buildCatalogViewModel(publicPayload, viewModel);
  const reportHtml = addReportCatalogLink(templates.renderReport(viewModel));
  const annexHtml = addAnnexCatalogLink(templates.renderAnnex(viewModel));
  const catalogHtml = templates.renderCatalog(catalogViewModel);

  const output = new Map<string, Buffer>();
  output.set("report.html", Buffer.from(reportHtml, "utf8"));
  output.set("annex/index.html", Buffer.from(annexHtml, "utf8"));
  output.set("annex/records.html", Buffer.from(catalogHtml, "utf8"));
  output.set("scientific-report.public.json", Buffer.from(publicPayloadText, "utf8"));
  for (const [assetPath, bytes] of assets) output.set(assetPath, bytes);
  if (validation.attestation !== null) {
    output.set("validation-attestation.json", Buffer.from(`${stableStringify(validation.attestation, 2)}\n`, "utf8"));
  }
  if (generationAudit !== null) {
    output.set("audit/generation-audit.json", Buffer.from(`${stableStringify(generationAudit, 2)}\n`, "utf8"));
  }

  await ensureOutputRoot(outputDirectory);
  if (validation.attestation === null) await removeKnownOptionalFile(outputDirectory, "validation-attestation.json", options.force === true);
  if (generationAudit === null) await removeKnownOptionalFile(outputDirectory, "audit/generation-audit.json", options.force === true);

  const paths = [...output.keys()].sort((left, right) => left.localeCompare(right, "en"));
  const files: WrittenFile[] = [];
  for (const path of paths) {
    const bytes = output.get(path);
    if (bytes === undefined) throw new RendererError("INTERNAL_MISSING_OUTPUT", `Missing buffered output for ${path}.`, path);
    const absolutePath = await writeContainedFile(outputDirectory, path, bytes, options.force === true);
    files.push({ path, absolutePath, byteLength: bytes.byteLength });
  }

  return {
    outDir: outputDirectory,
    writtenFiles: paths,
    files,
    publicPayload,
    publicPayloadText,
    payloadHash,
    validationAttestationBound: validation.bound,
  };
}

export { buildCatalogViewModel, buildReportViewModel } from "./view-model.js";
export { normalizeJson, normalizeJsonObject, serializePublicPayload, sha256Text, stableStringify } from "./canonical-json.js";
export { assertMissingnessSemantics, assertNoAbsoluteFilesystemReferences, assertPublicScientificPayload, assertPublicWithheldSemantics, bindValidationAttestation } from "./safety.js";
export { computeRendererTemplateHash } from "./templates.js";
export { RendererError } from "./types.js";
export type {
  JsonObject,
  JsonPrimitive,
  JsonValue,
  RenderOptions,
  RenderResult,
  TrustedTemplateIdentity,
  WrittenFile,
} from "./types.js";

async function findTemplateRoot(
  explicit: string | undefined,
  trustedIdentity: TrustedTemplateIdentity | undefined,
): Promise<string> {
  const packageRoot = packageTemplateRoot();
  if (explicit === undefined) {
    if (trustedIdentity !== undefined) {
      throw new RendererError(
        "UNEXPECTED_TEMPLATE_IDENTITY",
        "trustedTemplateIdentity is only accepted with an explicit custom templateDir.",
        "$options/trustedTemplateIdentity",
      );
    }
    await assertTemplateRoot(packageRoot);
    return packageRoot;
  }

  const root = resolve(explicit);
  await assertTemplateRoot(root);
  if (await sameTemplateRoot(root, packageRoot)) {
    if (trustedIdentity !== undefined) await assertTrustedTemplateIdentity(root, trustedIdentity);
    return root;
  }
  if (trustedIdentity === undefined) {
    throw new RendererError(
      "CUSTOM_TEMPLATE_IDENTITY_REQUIRED",
      "A custom templateDir requires trustedTemplateIdentity with an expected id, version, and complete template-set hash.",
      "$options/trustedTemplateIdentity",
    );
  }
  await assertTrustedTemplateIdentity(root, trustedIdentity);
  return root;
}

function packageTemplateRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(findProjectRoot(moduleDirectory), "templates/scientific-console");
}

async function sameTemplateRoot(left: string, right: string): Promise<boolean> {
  if (left === right) return true;
  const [canonicalLeft, canonicalRight] = await Promise.all([
    realpath(left).catch(() => null),
    realpath(right).catch(() => null),
  ]);
  return canonicalLeft !== null && canonicalRight !== null && canonicalLeft === canonicalRight;
}

async function assertTrustedTemplateIdentity(
  root: string,
  identity: TrustedTemplateIdentity,
): Promise<void> {
  if (
    typeof identity !== "object"
    || identity === null
    || typeof identity.id !== "string"
    || identity.id.trim() === ""
    || typeof identity.version !== "string"
    || identity.version.trim() === ""
    || typeof identity.hash !== "string"
    || !/^sha256:[0-9a-f]{64}$/u.test(identity.hash)
  ) {
    throw new RendererError(
      "INVALID_TEMPLATE_IDENTITY",
      "trustedTemplateIdentity must contain non-empty id/version strings and a lowercase sha256 hash.",
      "$options/trustedTemplateIdentity",
    );
  }
  const actualHash = await computeRendererTemplateHash(root);
  if (identity.hash !== actualHash) {
    throw new RendererError(
      "TEMPLATE_IDENTITY_HASH_MISMATCH",
      `Custom template identity ${identity.id}@${identity.version} does not match the supplied template directory bytes.`,
      "$options/trustedTemplateIdentity/hash",
    );
  }
}

async function assertTemplateRoot(root: string): Promise<void> {
  for (const relativePath of rendererTemplatePaths) {
    const path = join(root, ...relativePath.split("/"));
    const info = await lstat(path).catch(() => undefined);
    if (info === undefined || !info.isFile() || info.isSymbolicLink()) {
      throw new RendererError("TEMPLATE_ROOT_UNAVAILABLE", `Template root is missing regular file ${relativePath}: ${root}`, root);
    }
  }
}

async function ensureOutputRoot(outputDirectory: string): Promise<void> {
  await mkdir(outputDirectory, { recursive: true, mode: 0o755 });
  const info = await lstat(outputDirectory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new RendererError("UNSAFE_OUTPUT_ROOT", `Output root must be a regular directory, not a symbolic link: ${outputDirectory}`, outputDirectory);
  }
}

async function writeContainedFile(outputDirectory: string, memberPath: string, bytes: Buffer, force: boolean): Promise<string> {
  const segments = memberPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..") || memberPath.includes("\\") || memberPath.includes(":")) {
    throw new RendererError("INVALID_OUTPUT_PATH", `Renderer member path is not a normalized relative POSIX path: ${memberPath}`, memberPath);
  }
  const absolutePath = resolve(outputDirectory, ...segments);
  assertContained(outputDirectory, absolutePath, memberPath);
  await ensureContainedDirectory(outputDirectory, dirname(absolutePath));

  const existing = await lstat(absolutePath).catch((error: unknown) => {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  });
  if (existing !== undefined && (existing.isSymbolicLink() || !existing.isFile())) {
    throw new RendererError("UNSAFE_OUTPUT_MEMBER", `Refusing to replace a non-regular or symbolic-link member: ${memberPath}`, memberPath);
  }
  if (existing !== undefined && !force) {
    throw new RendererError("OUTPUT_EXISTS", `Refusing to replace an existing renderer member without force: ${memberPath}`, memberPath);
  }

  const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;
  const handle = await open(absolutePath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | noFollow, 0o644).catch((error: unknown) => {
    throw new RendererError("OUTPUT_WRITE_FAILED", `Cannot safely open output member ${memberPath}: ${errorMessage(error)}`, memberPath);
  });
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new RendererError("UNSAFE_OUTPUT_MEMBER", `Output member is not a regular file: ${memberPath}`, memberPath);
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
  return absolutePath;
}

async function ensureContainedDirectory(root: string, directory: string): Promise<void> {
  assertContained(root, directory, directory);
  const relation = relative(root, directory);
  let current = root;
  for (const segment of relation.split(sep).filter(Boolean)) {
    current = join(current, segment);
    const info = await lstat(current).catch((error: unknown) => {
      if (errorCode(error) === "ENOENT") return undefined;
      throw error;
    });
    if (info === undefined) {
      await mkdir(current, { mode: 0o755 });
      continue;
    }
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new RendererError("UNSAFE_OUTPUT_DIRECTORY", `Output member parent must be a regular directory: ${current}`, current);
    }
  }
}

async function readRegularFileNoFollow(absolutePath: string, memberPath: string): Promise<Buffer> {
  const info = await lstat(absolutePath).catch((error: unknown) => {
    throw new RendererError("ASSET_UNREADABLE", `Cannot inspect local asset ${memberPath}: ${errorMessage(error)}`, memberPath);
  });
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new RendererError("UNSAFE_ASSET", `Local asset must be a regular non-symlink file: ${memberPath}`, memberPath);
  }
  return readFile(absolutePath);
}

async function removeKnownOptionalFile(outputDirectory: string, memberPath: string, force: boolean): Promise<void> {
  const absolutePath = resolve(outputDirectory, ...memberPath.split("/"));
  assertContained(outputDirectory, absolutePath, memberPath);
  const info = await lstat(absolutePath).catch((error: unknown) => {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  });
  if (info === undefined) return;
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new RendererError("STALE_UNSAFE_OPTIONAL_MEMBER", `Refusing to remove non-regular optional member: ${memberPath}`, memberPath);
  }
  if (!force) {
    throw new RendererError("OUTPUT_EXISTS", `Refusing to remove a stale renderer member without force: ${memberPath}`, memberPath);
  }
  await unlink(absolutePath);
}

function assertContained(root: string, candidate: string, memberPath: string): void {
  const relation = relative(root, candidate);
  if (relation === "" && candidate !== root) return;
  if (relation === ".." || relation.startsWith(`..${sep}`) || relation.startsWith("/") || relation.includes(`..${sep}`)) {
    throw new RendererError("OUTPUT_PATH_ESCAPE", `Renderer member escapes output root: ${memberPath}`, memberPath);
  }
}

function addReportCatalogLink(html: string): string {
  const marker = "    </aside>";
  const addition = "      <a class=\"annex-link\" href=\"annex/records.html\">Open full public record catalog</a>\n";
  const index = html.indexOf(marker);
  if (index < 0) throw new RendererError("REPORT_TEMPLATE_MARKER_MISSING", "Could not add the static full-catalog navigation link to report.html.");
  return `${html.slice(0, index)}${addition}${html.slice(index)}`;
}

function addAnnexCatalogLink(html: string): string {
  const marker = "  </nav>";
  const addition = "    <a href=\"records.html\">Full public record catalog</a>\n";
  const index = html.indexOf(marker);
  if (index < 0) throw new RendererError("ANNEX_TEMPLATE_MARKER_MISSING", "Could not add the full-catalog navigation link to annex/index.html.");
  return `${html.slice(0, index)}${addition}${html.slice(index)}`;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const rendererOutputPaths = REQUIRED_RENDER_PATHS;
