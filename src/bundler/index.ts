import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import {
  assertNormalizedRelativePosixPath,
  assertUniquePortablePaths,
  isPathInside,
  portablePathKey,
} from "./path-safety.js";
import { sha256CanonicalJson } from "../lib/hash.js";
import {
  collectReplayArtifactRequirements,
} from "./reproducibility.js";
import {
  applyTrustedWorkingCopyMarking,
  inspectTrustedRendererProjection,
  isWorkingCopyExtensions,
} from "./trusted-render.js";
import { sha256File } from "./hash.js";
import {
  inspectOfflineContent,
  scanForHighConfidenceLeaks,
  type OfflineContentFile,
} from "./offline.js";
import type {
  BundleMemberOverride,
  BundleOptions,
  BundleResult,
  DisclosureClass,
  ManifestOptions,
  PackageCheck,
  PackageFile,
  PackageFileRole,
  PackageManifest,
} from "./types.js";

export * from "./hash.js";
export * from "./offline.js";
export * from "./path-safety.js";
export * from "./reproducibility.js";
export * from "./trusted-render.js";
export * from "./types.js";

export const PACKAGE_MANIFEST_FILE = "package-manifest.json";
export const DEFAULT_REPORT_FILE = "report.html";
export const DEFAULT_SCIENTIFIC_REPORT_FILE = "scientific-report.public.json";
export const DEFAULT_VALIDATION_ATTESTATION_FILE = "validation-attestation.json";
export const DEFAULT_README_FILE = "README.txt";

const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,159}$/u;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,79}$/u;
const PACKAGE_FILE_ROLES = new Set<PackageFileRole>([
  "report_html",
  "annex_html",
  "style",
  "script",
  "icon",
  "scientific_report_public",
  "validation_attestation",
  "human_review_attestation",
  "disclosure_projection",
  "generation_audit",
  "search_index",
  "package_readme",
  "data_artifact",
  "other",
]);
const DISCLOSURE_CLASSES = new Set<DisclosureClass>(["public", "internal", "restricted"]);

const REQUIRED_ROLES = new Set<PackageFileRole>([
  "report_html",
  "scientific_report_public",
  "validation_attestation",
  "disclosure_projection",
  "package_readme",
]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".cjs",
  ".csv",
  ".htm",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".tsv",
  ".txt",
  ".xml",
]);

export type BundleBuildErrorCode =
  | "INVALID_ROOT"
  | "SYMLINK"
  | "UNSUPPORTED_MEMBER"
  | "REQUIRED_MEMBER_MISSING"
  | "IDENTITY_MISMATCH"
  | "ATTESTATION_HASH_MISMATCH"
  | "UNSAFE_CONTENT"
  | "OUTPUT_EXISTS"
  | "OVERLAPPING_DIRECTORIES"
  | "INVALID_JSON"
  | "INVALID_OPTION";

export class BundleBuildError extends Error {
  readonly code: BundleBuildErrorCode;
  readonly memberPath: string | null;

  constructor(code: BundleBuildErrorCode, message: string, memberPath: string | null = null) {
    super(message);
    this.name = "BundleBuildError";
    this.code = code;
    this.memberPath = memberPath;
  }
}

export interface ScannedBundleFile {
  absolutePath: string;
  relativePath: string;
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function ensurePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BundleBuildError("INVALID_JSON", `${label} must contain a JSON object.`);
  }
  return value as Record<string, unknown>;
}

async function readJsonObject(filePath: string, label: string): Promise<Record<string, unknown>> {
  let source: string;
  try {
    const bytes = await readFile(filePath);
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new BundleBuildError(
      "INVALID_JSON",
      `Cannot read ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return ensurePlainObject(JSON.parse(source) as unknown, label);
  } catch (error) {
    if (error instanceof BundleBuildError) throw error;
    throw new BundleBuildError(
      "INVALID_JSON",
      `Cannot parse ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function requireString(object: Record<string, unknown>, key: string, label: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new BundleBuildError("INVALID_JSON", `${label}.${key} must be a non-empty string.`);
  }
  return value;
}

function inferRole(relativePath: string): PackageFileRole {
  const lower = relativePath.toLowerCase();
  const extension = path.posix.extname(lower);
  if (lower === DEFAULT_REPORT_FILE) return "report_html";
  if (lower.startsWith("annex/") && [".htm", ".html"].includes(extension)) return "annex_html";
  if (lower === DEFAULT_SCIENTIFIC_REPORT_FILE) return "scientific_report_public";
  if (lower === DEFAULT_VALIDATION_ATTESTATION_FILE) return "validation_attestation";
  if (lower === "human-review-attestation.json") return "human_review_attestation";
  if (lower === "disclosure-projection.json") return "disclosure_projection";
  if (lower === "audit/generation-audit.json") return "generation_audit";
  if (lower === DEFAULT_README_FILE.toLowerCase()) return "package_readme";
  if (lower.includes("search") && extension === ".json") return "search_index";
  if (extension === ".css") return "style";
  if ([".js", ".mjs", ".cjs"].includes(extension)) return "script";
  if (extension === ".svg") return "icon";
  if ([".json", ".csv", ".tsv", ".parquet", ".arrow"].includes(extension)) return "data_artifact";
  return "other";
}

export function detectMediaType(relativePath: string): string {
  const extension = path.posix.extname(relativePath).toLowerCase();
  const mediaTypes: Readonly<Record<string, string>> = {
    ".avif": "image/avif",
    ".bin": "application/octet-stream",
    ".css": "text/css; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".gif": "image/gif",
    ".htm": "text/html; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".cjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".tsv": "text/tab-separated-values; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".xml": "application/xml",
  };
  return mediaTypes[extension] ?? "application/octet-stream";
}

function assertIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new BundleBuildError("INVALID_OPTION", `${label} is not a valid contract identifier: ${String(value)}`);
  }
}

function assertVersion(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw new BundleBuildError("INVALID_OPTION", `${label} is not a valid contract version: ${String(value)}`);
  }
}

function validateManifestOptions(options: ManifestOptions): void {
  if (options.packageId !== undefined) assertIdentifier(options.packageId, "packageId");
  if (options.packageVersion !== undefined) assertVersion(options.packageVersion, "packageVersion");
  if (options.schemaVersion !== undefined) assertVersion(options.schemaVersion, "schemaVersion");
  if (options.extensions !== undefined) {
    if (typeof options.extensions !== "object" || options.extensions === null || Array.isArray(options.extensions)) {
      throw new BundleBuildError("INVALID_OPTION", "extensions must be an object with contract-identifier keys.");
    }
    for (const key of Object.keys(options.extensions)) {
      if (!IDENTIFIER_PATTERN.test(key)) {
        throw new BundleBuildError("INVALID_OPTION", `Extension key is not a valid contract identifier: ${key}`);
      }
    }
  }

  const overrides = options.roleOverrides;
  if (overrides === undefined) return;
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    throw new BundleBuildError("INVALID_OPTION", "roleOverrides must be an object keyed by normalized member path.");
  }
  assertUniquePortablePaths(Object.keys(overrides));
  for (const [memberPath, override] of Object.entries(overrides)) {
    if (typeof override !== "object" || override === null || Array.isArray(override)) {
      throw new BundleBuildError("INVALID_OPTION", `Role override for ${memberPath} must be an object.`);
    }
    if (override.role !== undefined && !PACKAGE_FILE_ROLES.has(override.role)) {
      throw new BundleBuildError("INVALID_OPTION", `Unknown package role for ${memberPath}: ${String(override.role)}`);
    }
    if (override.mediaType !== undefined && (typeof override.mediaType !== "string" || override.mediaType.trim().length === 0)) {
      throw new BundleBuildError("INVALID_OPTION", `mediaType override for ${memberPath} must be non-empty.`);
    }
    if (override.required !== undefined && typeof override.required !== "boolean") {
      throw new BundleBuildError("INVALID_OPTION", `required override for ${memberPath} must be boolean.`);
    }
    if (override.disclosureClass !== undefined && !DISCLOSURE_CLASSES.has(override.disclosureClass)) {
      throw new BundleBuildError(
        "INVALID_OPTION",
        `Unknown disclosure class for ${memberPath}: ${String(override.disclosureClass)}`,
      );
    }
    if (override.sourceArtifactId !== undefined && override.sourceArtifactId !== null) {
      assertIdentifier(override.sourceArtifactId, `sourceArtifactId for ${memberPath}`);
    }
  }
}

async function assertDirectoryRoot(root: string): Promise<string> {
  let rootStat;
  try {
    rootStat = await lstat(root);
  } catch (error) {
    throw new BundleBuildError(
      "INVALID_ROOT",
      `Bundle directory does not exist or cannot be inspected: ${root} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (rootStat.isSymbolicLink()) {
    throw new BundleBuildError("SYMLINK", `Bundle root must not be a symbolic link: ${root}`);
  }
  if (!rootStat.isDirectory()) {
    throw new BundleBuildError("INVALID_ROOT", `Bundle root is not a directory: ${root}`);
  }
  return realpath(root);
}

/** Enumerate a tree without following symbolic links or accepting special files. */
export async function scanBundleTree(
  bundleRoot: string,
  options: { excludeManifest?: boolean } = {},
): Promise<ScannedBundleFile[]> {
  const root = await assertDirectoryRoot(path.resolve(bundleRoot));
  const files: ScannedBundleFile[] = [];
  const portableEntries = new Map<string, string>();

  const visit = async (absoluteDirectory: string, relativeDirectory: string): Promise<void> => {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => comparePaths(left.name, right.name));

    for (const entry of entries) {
      const relativePath = relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
      const normalized = assertNormalizedRelativePosixPath(relativePath);
      const collisionKey = portablePathKey(normalized);
      const collision = portableEntries.get(collisionKey);
      if (collision !== undefined && collision !== normalized) {
        throw new BundleBuildError(
          "UNSUPPORTED_MEMBER",
          `Bundle entries collide on case-insensitive filesystems: ${collision} and ${normalized}.`,
          normalized,
        );
      }
      portableEntries.set(collisionKey, normalized);

      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (!isPathInside(root, absolutePath)) {
        throw new BundleBuildError("INVALID_ROOT", `Bundle entry escaped its root: ${normalized}`, normalized);
      }
      const entryStat = await lstat(absolutePath);
      if (entryStat.isSymbolicLink()) {
        throw new BundleBuildError(
          "SYMLINK",
          `Symbolic links are prohibited in portable bundles: ${normalized}`,
          normalized,
        );
      }
      if (entryStat.isDirectory()) {
        await visit(absolutePath, normalized);
      } else if (entryStat.isFile()) {
        if (options.excludeManifest === true && normalized === PACKAGE_MANIFEST_FILE) continue;
        files.push({ absolutePath, relativePath: normalized });
      } else {
        throw new BundleBuildError(
          "UNSUPPORTED_MEMBER",
          `Only regular files and directories are allowed; remove special member ${normalized}.`,
          normalized,
        );
      }
    }
  };

  await visit(root, "");
  assertUniquePortablePaths(files.map((file) => file.relativePath));
  files.sort((left, right) => comparePaths(left.relativePath, right.relativePath));
  return files;
}

function applyOverride(
  relativePath: string,
  role: PackageFileRole,
  mediaType: string,
  options: ManifestOptions,
): {
  role: PackageFileRole;
  mediaType: string;
  required: boolean;
  disclosureClass: DisclosureClass;
  sourceArtifactId: string | null;
} {
  const override = options.roleOverrides?.[relativePath];
  const finalRole = override?.role ?? role;
  return {
    role: finalRole,
    mediaType: override?.mediaType ?? mediaType,
    required: override?.required ?? REQUIRED_ROLES.has(finalRole),
    disclosureClass: override?.disclosureClass ?? (finalRole === "generation_audit" ? "internal" : "public"),
    sourceArtifactId: override?.sourceArtifactId ?? null,
  };
}

function oneFileWithRole(files: readonly PackageFile[], role: PackageFileRole): PackageFile {
  const matches = files.filter((file) => file.role === role);
  if (matches.length !== 1) {
    throw new BundleBuildError(
      "REQUIRED_MEMBER_MISSING",
      `Bundle must contain exactly one member with role '${role}', but found ${matches.length}.`,
    );
  }
  const match = matches[0];
  if (match === undefined) {
    throw new BundleBuildError("REQUIRED_MEMBER_MISSING", `Required bundle role is absent: ${role}.`);
  }
  if (!match.required) {
    throw new BundleBuildError(
      "REQUIRED_MEMBER_MISSING",
      `Member with required role '${role}' must have required=true: ${match.path}.`,
      match.path,
    );
  }
  return match;
}

async function readInspectionFiles(scannedFiles: readonly ScannedBundleFile[]): Promise<OfflineContentFile[]> {
  const files: OfflineContentFile[] = [];
  for (const file of scannedFiles) {
    if (!TEXT_EXTENSIONS.has(path.posix.extname(file.relativePath).toLowerCase())) continue;
    let content: string;
    try {
      const bytes = await readFile(file.absolutePath);
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      throw new BundleBuildError(
        "UNSAFE_CONTENT",
        `Text member is not readable UTF-8: ${file.relativePath} (${error instanceof Error ? error.message : String(error)})`,
        file.relativePath,
      );
    }
    files.push({ path: file.relativePath, content });
  }
  return files;
}

function validateLocalReferences(
  allPaths: ReadonlySet<string>,
  references: ReturnType<typeof inspectOfflineContent>["localReferences"],
): string[] {
  const missing: string[] = [];
  for (const reference of references) {
    if (allPaths.has(reference.targetPath)) continue;
    const indexTarget = reference.targetPath.endsWith("/")
      ? `${reference.targetPath}index.html`
      : `${reference.targetPath}/index.html`;
    if (!allPaths.has(indexTarget)) {
      missing.push(`${reference.fromPath}: ${reference.reference} -> ${reference.targetPath}`);
    }
  }
  return missing;
}

function validateIsoDate(value: string | undefined): string {
  if (value === undefined) return new Date().toISOString();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new BundleBuildError(
      "INVALID_OPTION",
      `createdAt must be a canonical ISO 8601 UTC timestamp (for example 2026-08-24T12:00:00.000Z): ${value}`,
    );
  }
  return value;
}

function checks(checkedAt: string): PackageCheck[] {
  return [
    {
      check_id: "pkgchk_hash_integrity",
      check_kind: "hash_integrity",
      status: "pass",
      checked_at: checkedAt,
      finding_count: 0,
      details: "Every listed member was read as a regular file and SHA-256 hashed from its final bundle bytes.",
    },
    {
      check_id: "pkgchk_relative_paths",
      check_kind: "relative_paths",
      status: "pass",
      checked_at: checkedAt,
      finding_count: 0,
      details: "Member paths were checked for POSIX normalization, containment, traversal, symlinks, duplicates, and portable case collisions.",
    },
    {
      check_id: "pkgchk_offline_dependencies",
      check_kind: "offline_dependencies",
      status: "pass",
      checked_at: checkedAt,
      finding_count: 0,
      details: "HTML, SVG, CSS, and JavaScript assets were checked for remote resource loads and escaping local references.",
    },
    {
      check_id: "pkgchk_file_url_open",
      check_kind: "file_url_open",
      status: "not_run",
      checked_at: null,
      finding_count: 0,
      details: "No browser file-URL execution was performed while constructing the manifest.",
    },
    {
      check_id: "pkgchk_disclosure",
      check_kind: "disclosure",
      status: "not_run",
      checked_at: null,
      finding_count: 0,
      details: "A high-confidence leak preflight ran, but complete disclosure-policy validation must be established by the bound validation attestation.",
    },
  ];
}

export async function createPackageManifest(
  bundleRoot: string,
  options: ManifestOptions = {},
): Promise<PackageManifest> {
  validateManifestOptions(options);
  const root = await assertDirectoryRoot(path.resolve(bundleRoot));
  const scanned = await scanBundleTree(root, { excludeManifest: true });

  const unknownOverrides = Object.keys(options.roleOverrides ?? {}).filter(
    (overridePath) => !scanned.some((file) => file.relativePath === overridePath),
  );
  if (unknownOverrides.length > 0) {
    throw new BundleBuildError(
      "INVALID_OPTION",
      `Role overrides refer to absent bundle members: ${unknownOverrides.join(", ")}.`,
    );
  }

  const files: PackageFile[] = [];
  for (const file of scanned) {
    const inferredRole = inferRole(file.relativePath);
    const applied = applyOverride(file.relativePath, inferredRole, detectMediaType(file.relativePath), options);
    const digest = await sha256File(file.absolutePath);
    files.push({
      path: file.relativePath,
      role: applied.role,
      media_type: applied.mediaType,
      content_hash: digest.contentHash,
      byte_size: digest.byteSize,
      required: applied.required,
      disclosure_class: applied.disclosureClass,
      source_artifact_id: applied.sourceArtifactId,
    });
  }

  if (files.length < 5) {
    throw new BundleBuildError(
      "REQUIRED_MEMBER_MISSING",
      `Bundle has ${files.length} members; at least the report, public payload, validation attestation, disclosure projection, and README are required.`,
    );
  }
  const reportHtml = oneFileWithRole(files, "report_html");
  const scientificReport = oneFileWithRole(files, "scientific_report_public");
  const validationAttestation = oneFileWithRole(files, "validation_attestation");
  const disclosureProjection = oneFileWithRole(files, "disclosure_projection");
  oneFileWithRole(files, "package_readme");
  for (const optionalRole of ["human_review_attestation", "generation_audit"] as const) {
    const count = files.filter((file) => file.role === optionalRole).length;
    if (count > 1) {
      throw new BundleBuildError(
        "INVALID_OPTION",
        `Bundle may contain at most one member with role '${optionalRole}', but found ${count}.`,
      );
    }
  }

  const textFiles = await readInspectionFiles(scanned);
  const offlineInspection = inspectOfflineContent(textFiles);
  if (offlineInspection.findings.length > 0) {
    const detail = offlineInspection.findings
      .slice(0, 8)
      .map((finding) => `${finding.path}: ${finding.message}`)
      .join("\n");
    throw new BundleBuildError(
      "UNSAFE_CONTENT",
      `Bundle contains non-offline or active unsafe references. Fix them before packaging.\n${detail}`,
    );
  }
  const allPaths = new Set(scanned.map((file) => file.relativePath));
  const missingReferences = validateLocalReferences(allPaths, offlineInspection.localReferences);
  if (missingReferences.length > 0) {
    throw new BundleBuildError(
      "UNSAFE_CONTENT",
      `Bundle has local references to absent or unlisted files:\n${missingReferences.slice(0, 8).join("\n")}`,
    );
  }
  const leakFindings = scanForHighConfidenceLeaks(textFiles);
  if (leakFindings.length > 0) {
    throw new BundleBuildError(
      "UNSAFE_CONTENT",
      `Bundle contains likely secrets or host-specific absolute paths. Run disclosure projection and remove them before packaging.\n${leakFindings
        .slice(0, 8)
        .map((finding) => `${finding.path}: ${finding.message}`)
        .join("\n")}`,
    );
  }

  const reportObject = await readJsonObject(path.join(root, scientificReport.path), "scientific report");
  const attestationObject = await readJsonObject(
    path.join(root, validationAttestation.path),
    "validation attestation",
  );
  const reportId = requireString(reportObject, "report_id", "scientific report");
  const reportVersion = requireString(reportObject, "report_version", "scientific report");
  assertIdentifier(reportId, "scientific report.report_id");
  assertVersion(reportVersion, "scientific report.report_version");
  const payloadRole = requireString(reportObject, "payload_role", "scientific report");
  if (payloadRole !== "public_projection") {
    throw new BundleBuildError(
      "IDENTITY_MISMATCH",
      `${scientificReport.path} declares payload_role '${payloadRole}'. A public bundle requires an authorized public_projection; do not package canonical or restricted payloads under the public filename.`,
      scientificReport.path,
    );
  }
  const attestationReportId = requireString(attestationObject, "report_id", "validation attestation");
  const attestationReportVersion = requireString(
    attestationObject,
    "report_version",
    "validation attestation",
  );
  if (attestationReportId !== reportId || attestationReportVersion !== reportVersion) {
    throw new BundleBuildError(
      "IDENTITY_MISMATCH",
      `Validation attestation targets ${attestationReportId}@${attestationReportVersion}, but the public payload is ${reportId}@${reportVersion}.`,
    );
  }
  const boundPayloadHash = requireString(
    attestationObject,
    "scientific_payload_hash",
    "validation attestation",
  );
  if (boundPayloadHash !== scientificReport.content_hash) {
    throw new BundleBuildError(
      "ATTESTATION_HASH_MISMATCH",
      `Validation attestation binds ${boundPayloadHash}, but final public payload bytes hash to ${scientificReport.content_hash}. Revalidate the exact serialized payload before bundling.`,
      scientificReport.path,
    );
  }

  const projectionObject = await readJsonObject(
    path.join(root, disclosureProjection.path),
    "disclosure projection",
  );
  const disclosureState = ensurePlainObject(reportObject.disclosure_state, "scientific report.disclosure_state");
  const projectionId = requireString(projectionObject, "projection_id", "disclosure projection");
  const reportProjectionId = requireString(disclosureState, "projection_id", "scientific report.disclosure_state");
  const projectedPayloadHash = sha256CanonicalJson(reportObject);
  if (
    projectionObject.projection_status !== "complete" ||
    projectionId !== reportProjectionId ||
    projectionObject.projected_report_id !== reportId ||
    projectionObject.projected_report_version !== reportVersion ||
    projectionObject.projected_payload_hash !== projectedPayloadHash
  ) {
    throw new BundleBuildError(
      "IDENTITY_MISMATCH",
      "Disclosure projection is not a complete identity- and canonical-hash-bound projection of the bundled public report.",
      disclosureProjection.path,
    );
  }
  const projectionBinding = ensurePlainObject(
    attestationObject.disclosure_projection_binding,
    "validation attestation.disclosure_projection_binding",
  );
  const projectionHash = sha256CanonicalJson(projectionObject);
  if (
    projectionBinding.verification_status !== "pass" ||
    projectionBinding.projection_id !== projectionId ||
    projectionBinding.projection_hash !== projectionHash ||
    projectionBinding.source_payload_hash !== projectionObject.source_payload_hash ||
    projectionBinding.projected_payload_hash !== projectedPayloadHash
  ) {
    throw new BundleBuildError(
      "ATTESTATION_HASH_MISMATCH",
      "Validation attestation is not bound to the exact disclosure-projection record and projected scientific payload.",
      disclosureProjection.path,
    );
  }

  const replayArtifacts = collectReplayArtifactRequirements(reportObject);
  if (replayArtifacts.issues.length > 0) {
    throw new BundleBuildError(
      "REQUIRED_MEMBER_MISSING",
      `R1+ replay dependency contract is incomplete: ${replayArtifacts.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  for (const requirement of replayArtifacts.requirements) {
    const member = files.find((file) => file.path === requirement.path);
    if (member === undefined) {
      throw new BundleBuildError(
        "REQUIRED_MEMBER_MISSING",
        `Declared available R1+ artifact ${requirement.artifactId} is absent from ${requirement.path}.`,
        requirement.path,
      );
    }
    if (member.content_hash !== requirement.contentHash || member.byte_size !== requirement.byteSize) {
      throw new BundleBuildError(
        "ATTESTATION_HASH_MISMATCH",
        `R1+ artifact ${requirement.artifactId} bytes do not match its declared hash and size.`,
        requirement.path,
      );
    }
    if (member.source_artifact_id !== null && member.source_artifact_id !== requirement.artifactId) {
      throw new BundleBuildError(
        "IDENTITY_MISMATCH",
        `Manifest member ${requirement.path} is bound to the wrong source artifact id.`,
        requirement.path,
      );
    }
    member.source_artifact_id = requirement.artifactId;
    member.required = true;
  }

  const generationAuditMember = files.find((file) => file.role === "generation_audit");
  const generationAudit = generationAuditMember === undefined
    ? null
    : await readJsonObject(path.join(root, generationAuditMember.path), "generation audit");
  let trustedProjectionIssues;
  try {
    trustedProjectionIssues = await inspectTrustedRendererProjection(
      root,
      reportObject,
      attestationObject,
      generationAudit,
      isWorkingCopyExtensions(options.extensions ?? {}),
      files,
    );
  } catch (error) {
    throw new BundleBuildError(
      "UNSAFE_CONTENT",
      `Package-owned renderer projection could not be reproduced: ${error instanceof Error ? error.message : String(error)}`,
      reportHtml.path,
    );
  }
  if (trustedProjectionIssues.length > 0) {
    throw new BundleBuildError(
      "UNSAFE_CONTENT",
      `Rendered presentation is not the deterministic package-owned projection of the scientific payload: ${trustedProjectionIssues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`,
      reportHtml.path,
    );
  }

  const humanReview = files.find((file) => file.role === "human_review_attestation");
  const createdAt = validateIsoDate(options.createdAt);
  const packageId = options.packageId ?? `pkg_${randomUUID()}`;
  assertIdentifier(packageId, "packageId");

  files.sort((left, right) => comparePaths(left.path, right.path));
  return {
    package_id: packageId,
    package_version: options.packageVersion ?? "1",
    schema_version: options.schemaVersion ?? "1",
    manifest_file_name: PACKAGE_MANIFEST_FILE,
    report_id: reportId,
    report_version: reportVersion,
    scientific_payload_hash: scientificReport.content_hash,
    validation_attestation_hash: validationAttestation.content_hash,
    human_review_attestation_hash: humanReview?.content_hash ?? null,
    disclosure_projection_hash: disclosureProjection?.content_hash ?? null,
    created_at: createdAt,
    bundle_format: "portable_offline_directory",
    files,
    entrypoints: [
      {
        name: "main_report",
        path: reportHtml.path,
        purpose: "Primary offline scientific report entry point",
      },
    ],
    remote_dependencies: [],
    absolute_paths_present: false,
    active_external_content_present: false,
    package_checks: checks(createdAt),
    extensions: { ...(options.extensions ?? {}) },
  };
}

export async function writePackageManifest(
  bundleRoot: string,
  options: ManifestOptions & { overwrite?: boolean } = {},
): Promise<{ manifest: PackageManifest; manifestPath: string }> {
  const root = await assertDirectoryRoot(path.resolve(bundleRoot));
  const manifestPath = path.join(root, PACKAGE_MANIFEST_FILE);
  const manifest = await createPackageManifest(root, options);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

  if (options.overwrite !== true) {
    try {
      const handle = await open(manifestPath, "wx", 0o644);
      try {
        await handle.writeFile(serialized, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "EEXIST") {
        throw new BundleBuildError(
          "OUTPUT_EXISTS",
          `Manifest already exists at ${manifestPath}. Refusing to overwrite it without an explicit overwrite option.`,
          PACKAGE_MANIFEST_FILE,
        );
      }
      throw error;
    }
    return { manifest, manifestPath };
  }

  if (await pathExists(manifestPath)) {
    const existing = await lstat(manifestPath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new BundleBuildError(
        "UNSUPPORTED_MEMBER",
        `Refusing to replace a non-regular or symbolic-link manifest: ${manifestPath}.`,
        PACKAGE_MANIFEST_FILE,
      );
    }
  }
  const temporaryPath = path.join(root, `.${PACKAGE_MANIFEST_FILE}.tmp-${randomUUID()}`);
  try {
    const handle = await open(temporaryPath, "wx", 0o644);
    try {
      await handle.writeFile(serialized, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, manifestPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
  return { manifest, manifestPath };
}

export function defaultPackageReadme(): string {
  return [
    "Scientific report offline bundle",
    "================================",
    "",
    "Open report.html in a modern browser. The scientific content remains readable",
    "without network access and without JavaScript; JavaScript provides only optional",
    "search, filtering, and navigation enhancements.",
    "",
    "scientific-report.public.json is the sole public scientific fact source.",
    "validation-attestation.json records automated checks for the exact payload hash.",
    "package-manifest.json lists and SHA-256 hashes every other package member.",
    "",
    "Verification confirms declared bytes, paths, and offline packaging properties. It",
    "does not prove that source records are complete, that scientific statements are true,",
    "or that work was independently reproduced. Consult the report limitations and review",
    "records before relying on a conclusion.",
    "",
  ].join("\n");
}

async function canonicalProspectivePath(candidate: string): Promise<string> {
  let cursor = path.resolve(candidate);
  const missingSegments: string[] = [];
  while (true) {
    try {
      const existing = await realpath(cursor);
      return path.join(existing, ...missingSegments.reverse());
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        throw new BundleBuildError("INVALID_ROOT", `Cannot resolve an existing ancestor for output path: ${candidate}`);
      }
      missingSegments.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function copyScannedTree(
  sourceRoot: string,
  stageRoot: string,
  files: readonly ScannedBundleFile[],
): Promise<void> {
  for (const file of files) {
    if (file.relativePath === PACKAGE_MANIFEST_FILE) continue;
    const source = path.join(sourceRoot, ...file.relativePath.split("/"));
    const destination = path.join(stageRoot, ...file.relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
    await copyFile(source, destination);
    await chmod(destination, 0o644);
  }
}

/**
 * Copy a rendered directory into a fresh portable package and write its
 * manifest. Existing output is never touched unless force=true.
 */
export async function bundleDirectory(
  sourceDirectory: string,
  outputDirectory: string,
  options: BundleOptions = {},
): Promise<BundleResult> {
  const sourceRoot = await assertDirectoryRoot(path.resolve(sourceDirectory));
  const outputRoot = path.resolve(outputDirectory);
  const canonicalOutputRoot = await canonicalProspectivePath(outputRoot);
  if (
    sourceRoot === canonicalOutputRoot ||
    isPathInside(sourceRoot, canonicalOutputRoot) ||
    isPathInside(canonicalOutputRoot, sourceRoot)
  ) {
    throw new BundleBuildError(
      "OVERLAPPING_DIRECTORIES",
      `Source and output directories must not overlap after resolving existing parent links. Source: ${sourceRoot}; output: ${canonicalOutputRoot}.`,
    );
  }
  const outputExists = await pathExists(outputRoot);
  if (outputExists && options.force !== true) {
    throw new BundleBuildError(
      "OUTPUT_EXISTS",
      `Output directory already exists: ${outputRoot}. Choose a new --out path or pass --force explicitly.`,
    );
  }
  if (outputExists) {
    const outputStat = await lstat(outputRoot);
    if (outputStat.isSymbolicLink()) {
      throw new BundleBuildError("SYMLINK", `Refusing to replace a symbolic-link output: ${outputRoot}`);
    }
    if (!outputStat.isDirectory()) {
      throw new BundleBuildError(
        "OUTPUT_EXISTS",
        `Output exists but is not a directory: ${outputRoot}. Choose a new directory path; --force does not replace unrelated files.`,
      );
    }
  }

  await mkdir(path.dirname(outputRoot), { recursive: true });
  const stageRoot = `${outputRoot}.stage-${randomUUID()}`;
  const backupRoot = `${outputRoot}.backup-${randomUUID()}`;
  let movedExisting = false;
  try {
    await mkdir(stageRoot, { mode: 0o755 });
    const sourceFiles = await scanBundleTree(sourceRoot, { excludeManifest: true });
    await copyScannedTree(sourceRoot, stageRoot, sourceFiles);
    if (isWorkingCopyExtensions(options.extensions ?? {})) {
      const attestation = await readJsonObject(
        path.join(stageRoot, DEFAULT_VALIDATION_ATTESTATION_FILE),
        "validation attestation",
      );
      await applyTrustedWorkingCopyMarking(stageRoot, attestation.overall_status);
    }

    const readmePath = path.join(stageRoot, DEFAULT_README_FILE);
    if (!(await pathExists(readmePath))) {
      if (options.createReadme === false) {
        throw new BundleBuildError(
          "REQUIRED_MEMBER_MISSING",
          `${DEFAULT_README_FILE} is required. Add it to the rendered tree or allow the bundler to create the standard package README.`,
          DEFAULT_README_FILE,
        );
      }
      const readmeHandle = await open(readmePath, "wx", 0o644);
      try {
        await readmeHandle.writeFile(defaultPackageReadme(), "utf8");
        await readmeHandle.sync();
      } finally {
        await readmeHandle.close();
      }
    }

    const written = await writePackageManifest(stageRoot, options);
    if (outputExists) {
      await rename(outputRoot, backupRoot);
      movedExisting = true;
    }
    try {
      await rename(stageRoot, outputRoot);
    } catch (error) {
      if (movedExisting) {
        await rename(backupRoot, outputRoot);
        movedExisting = false;
      }
      throw error;
    }
    if (movedExisting) {
      await rm(backupRoot, { recursive: true, force: true });
      movedExisting = false;
    }

    return {
      outDir: outputRoot,
      manifestPath: path.join(outputRoot, PACKAGE_MANIFEST_FILE),
      manifest: written.manifest,
      files: written.manifest.files.map((file) => file.path),
    };
  } finally {
    await rm(stageRoot, { recursive: true, force: true }).catch(() => undefined);
    if (movedExisting) {
      if (!(await pathExists(outputRoot))) {
        await rename(backupRoot, outputRoot).catch(() => undefined);
      }
    }
  }
}
