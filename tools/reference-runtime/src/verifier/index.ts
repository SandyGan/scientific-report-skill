import path from "node:path";
import { fileURLToPath } from "node:url";
import { lstat, readFile } from "node:fs/promises";
import Ajv2020Module, { type ErrorObject, type Options, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { sha256CanonicalJson } from "../lib/hash.js";
import {
  DEFAULT_SCIENTIFIC_REPORT_FILE,
  DEFAULT_VALIDATION_ATTESTATION_FILE,
  PACKAGE_MANIFEST_FILE,
  BundleBuildError,
  assertNormalizedRelativePosixPath,
  assertUniquePortablePaths,
  collectReplayArtifactRequirements,
  detectMediaType,
  inspectOfflineContent,
  inspectTrustedRendererProjection,
  isWorkingCopyExtensions,
  scanBundleTree,
  scanForHighConfidenceLeaks,
  sha256File,
  type BundleVerificationResult,
  type OfflineContentFile,
  type PackageFile,
  type PackageFileRole,
  type PackageManifest,
  type VerificationCheck,
  type VerificationFinding,
  type VerifyBundleOptions,
} from "../bundler/index.js";

interface Ajv2020Instance {
  addSchema(schema: object): unknown;
  compile(schema: object): ValidateFunction;
}

const Ajv2020 = Ajv2020Module as unknown as new (options?: Options) => Ajv2020Instance;
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020Instance) => unknown;

export type {
  BundleVerificationResult,
  VerificationCheck,
  VerificationFinding,
  VerifyBundleOptions,
} from "../bundler/index.js";

const DEFAULT_MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
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

const validatorPromises = new Map<string, Promise<ValidateFunction>>();
const SUPPORTING_SCHEMA_PATHS = [
  "recipe.schema.json",
  "defs/common.schema.json",
  "defs/claim-argument.schema.json",
  "defs/environment.schema.json",
  "defs/invocation.schema.json",
  "defs/material-lineage.schema.json",
  "defs/quantitative-derivation.schema.json",
  "defs/random-state.schema.json",
  "defs/reproducibility-unit.schema.json",
  "defs/result-and-disposition.schema.json",
  "defs/source-coverage.schema.json",
  "defs/work-execution.schema.json",
] as const;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function valueForFinding(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value === undefined) return null;
  return Array.isArray(value) ? `[array length=${value.length}]` : `[${typeof value}]`;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(length=${value.length})`;
  if (typeof value === "string") return `string(length=${value.length})`;
  return typeof value;
}

function finding(
  code: string,
  message: string,
  remediation: string,
  options: {
    severity?: VerificationFinding["severity"];
    path?: string | null;
    expected?: unknown;
    actual?: unknown;
  } = {},
): VerificationFinding {
  return {
    code,
    severity: options.severity ?? "error",
    message,
    path: options.path ?? null,
    expected: valueForFinding(options.expected),
    actual: valueForFinding(options.actual),
    remediation,
  };
}

async function exists(candidate: string): Promise<boolean> {
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

async function schemaPath(relativePath: string): Promise<string> {
  const candidates = [
    fileURLToPath(new URL(`../../schemas/${relativePath}`, import.meta.url)),
    fileURLToPath(new URL(`../../../schemas/${relativePath}`, import.meta.url)),
    fileURLToPath(new URL(`../../../../schemas/${relativePath}`, import.meta.url)),
    path.resolve(process.cwd(), "schemas", relativePath),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error(
    `Cannot locate schemas/${relativePath}. Install the schemas with the CLI or run from the project root. Tried: ${candidates.join(", ")}`,
  );
}

async function getContractValidator(relativePath: string): Promise<ValidateFunction> {
  const existing = validatorPromises.get(relativePath);
  if (existing !== undefined) return existing;

  const promise = (async () => {
    const [targetSource, ...supportingSources] = await Promise.all([
      readFile(await schemaPath(relativePath), "utf8"),
      ...SUPPORTING_SCHEMA_PATHS.map(async (supportingPath) =>
        readFile(await schemaPath(supportingPath), "utf8"),
      ),
    ]);
    const targetSchema = JSON.parse(targetSource) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
    addFormats(ajv);
    for (const source of supportingSources) {
      ajv.addSchema(JSON.parse(source) as object);
    }
    return ajv.compile(targetSchema);
  })();
  validatorPromises.set(relativePath, promise);
  return promise;
}

async function getManifestValidator(): Promise<ValidateFunction> {
  return getContractValidator("package-manifest.schema.json");
}

function ajvMessage(error: ErrorObject): string {
  const pointer = error.instancePath.length > 0 ? error.instancePath : "/";
  const detail = error.message ?? "does not satisfy the schema";
  return `${pointer} ${detail}`;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readUtf8Strict(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await readUtf8Strict(filePath)) as unknown;
  if (!plainObject(parsed)) throw new Error("JSON root is not an object.");
  return parsed;
}

function memberByRole(
  manifest: PackageManifest,
  role: PackageFileRole,
  findings: VerificationFinding[],
): PackageFile | null {
  const matches = manifest.files.filter((member) => member.role === role);
  if (matches.length !== 1) {
    findings.push(
      finding(
        "ROLE_CARDINALITY",
        `Manifest must contain exactly one '${role}' member; found ${matches.length}.`,
        `Add or correct the manifest member with role '${role}', then rebuild the manifest.`,
        { expected: 1, actual: matches.length },
      ),
    );
    return null;
  }
  return matches[0] ?? null;
}

function checkIdentityValue(
  findings: VerificationFinding[],
  label: string,
  expected: unknown,
  actual: unknown,
  pathValue: string,
): void {
  if (expected !== actual) {
    findings.push(
      finding(
        "IDENTITY_MISMATCH",
        `${label} does not match the package manifest.`,
        "Rebuild the bundle from one report revision and its matching validation attestation.",
        { path: pathValue, expected, actual },
      ),
    );
  }
}

function inspectMissingness(
  value: unknown,
  pointer: string,
  reportPath: string,
  findings: VerificationFinding[],
  seen: WeakSet<object>,
): void {
  if (typeof value !== "object" || value === null) return;
  if (seen.has(value)) return;
  seen.add(value);

  if (!Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const state = object.state;
    if (
      Object.hasOwn(object, "value") &&
      ["unknown", "not_applicable", "withheld"].includes(String(state)) &&
      object.value !== null
    ) {
      findings.push(
        finding(
          "MISSINGNESS_VALUE_LEAK",
          `${pointer || "/"} has state '${String(state)}' but a non-null value.`,
          "Preserve the state and set value to null. For withheld data, regenerate the public disclosure projection; do not mask only the rendered HTML.",
          { path: reportPath, expected: null, actual: "<redacted non-null value>" },
        ),
      );
    }
  }

  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value as Record<string, unknown>);
  for (const [key, child] of entries) {
    const escaped = key.replaceAll("~", "~0").replaceAll("/", "~1");
    inspectMissingness(child, `${pointer}/${escaped}`, reportPath, findings, seen);
  }
}

function checkLocalReferences(
  manifestPaths: ReadonlySet<string>,
  inspection: ReturnType<typeof inspectOfflineContent>,
  findings: VerificationFinding[],
): void {
  for (const reference of inspection.localReferences) {
    if (manifestPaths.has(reference.targetPath)) continue;
    const indexTarget = reference.targetPath.endsWith("/")
      ? `${reference.targetPath}index.html`
      : `${reference.targetPath}/index.html`;
    if (manifestPaths.has(indexTarget)) continue;
    findings.push(
      finding(
        "MISSING_LOCAL_REFERENCE",
        `${reference.fromPath} references absent package member ${reference.targetPath}.`,
        `Add and manifest ${reference.targetPath}, or correct the contained local reference in ${reference.fromPath}.`,
        { path: reference.fromPath, expected: reference.targetPath, actual: null },
      ),
    );
  }
}

interface MutableVerification {
  root: string;
  manifestPath: string;
  verifiedAt: string;
  verificationMode: "release" | "integrity_only";
  unverifiedPaths: string[];
  filesChecked: number;
  checks: VerificationCheck[];
  findings: VerificationFinding[];
  manifest: PackageManifest | null;
}

async function runCheck(
  state: MutableVerification,
  name: string,
  action: () => Promise<void> | void,
): Promise<boolean> {
  const firstFinding = state.findings.length;
  try {
    await action();
  } catch (error) {
    state.findings.push(
      finding(
        "CHECK_ERROR",
        `${name} could not complete: ${error instanceof Error ? error.message : String(error)}`,
        "Resolve the reported filesystem or parsing error, then run verification again.",
      ),
    );
    state.checks.push({
      check: name,
      status: "error",
      findingCount: state.findings.length - firstFinding,
      details: `${name} ended with an operational error.`,
    });
    return false;
  }
  const newFindings = state.findings.slice(firstFinding);
  const failed = newFindings.some((item) => item.severity === "error");
  state.checks.push({
    check: name,
    status: failed ? "fail" : "pass",
    findingCount: newFindings.length,
    details: failed
      ? `${name} found ${newFindings.filter((item) => item.severity === "error").length} blocking issue(s).`
      : newFindings.length > 0
        ? `${name} completed with ${newFindings.length} non-blocking finding(s).`
        : `${name} completed without findings.`,
  });
  return !failed;
}

function notRun(state: MutableVerification, names: readonly string[], reason: string): void {
  for (const name of names) {
    state.checks.push({ check: name, status: "not_run", findingCount: 0, details: reason });
  }
}

/** Verify final package bytes without trusting build-workspace state. */
export async function verifyBundle(
  bundleDirectory: string,
  options: VerifyBundleOptions = {},
): Promise<BundleVerificationResult> {
  const root = path.resolve(bundleDirectory);
  const releaseMode =
    options.requireValidAttestation !== false &&
    options.requireFullValidationScope !== false &&
    options.rejectExtraFiles !== false;
  const state: MutableVerification = {
    root,
    manifestPath: path.join(root, PACKAGE_MANIFEST_FILE),
    verifiedAt: new Date().toISOString(),
    verificationMode: releaseMode ? "release" : "integrity_only",
    unverifiedPaths: [],
    filesChecked: 0,
    checks: [],
    findings: [],
    manifest: null,
  };
  let actualFiles: Awaited<ReturnType<typeof scanBundleTree>> = [];
  const filesystemOk = await runCheck(state, "filesystem_safety", async () => {
    actualFiles = await scanBundleTree(root, { excludeManifest: false });
    if (!actualFiles.some((member) => member.relativePath === PACKAGE_MANIFEST_FILE)) {
      state.findings.push(
        finding(
          "MANIFEST_MISSING",
          `${PACKAGE_MANIFEST_FILE} is absent from the bundle root.`,
          "Run the bundle command to create a manifest for the final release bytes.",
          { path: PACKAGE_MANIFEST_FILE },
        ),
      );
    }
  });
  if (!filesystemOk) {
    notRun(
      state,
      ["manifest_schema", "manifest_inventory", "file_integrity", "attestation_binding", "offline_dependencies", "disclosure_preflight"],
      "Not run because filesystem-safety verification failed.",
    );
    return finish(state);
  }

  let parsedManifest: unknown = null;
  const schemaOk = await runCheck(state, "manifest_schema", async () => {
    const manifestStat = await lstat(state.manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
      state.findings.push(
        finding(
          "MANIFEST_NOT_REGULAR",
          "Package manifest must be a non-symlink regular file.",
          "Replace it with a regular package-manifest.json created by the bundler.",
          { path: PACKAGE_MANIFEST_FILE },
        ),
      );
      return;
    }
    const maximum = options.maxManifestBytes ?? DEFAULT_MAX_MANIFEST_BYTES;
    if (!Number.isSafeInteger(maximum) || maximum <= 0) {
      throw new Error(`maxManifestBytes must be a positive safe integer; received ${String(maximum)}.`);
    }
    if (manifestStat.size > maximum) {
      state.findings.push(
        finding(
          "MANIFEST_TOO_LARGE",
          `Manifest is ${manifestStat.size} bytes, exceeding the verification limit of ${maximum} bytes.`,
          "Remove embedded content from the manifest; it should contain metadata only.",
          { path: PACKAGE_MANIFEST_FILE, expected: maximum, actual: manifestStat.size },
        ),
      );
      return;
    }
    try {
      parsedManifest = JSON.parse(await readUtf8Strict(state.manifestPath)) as unknown;
    } catch (error) {
      state.findings.push(
        finding(
          "MANIFEST_JSON",
          `Manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
          "Regenerate package-manifest.json with the bundle command.",
          { path: PACKAGE_MANIFEST_FILE },
        ),
      );
      return;
    }
    const validate = await getManifestValidator();
    if (!validate(parsedManifest)) {
      for (const error of validate.errors ?? []) {
        state.findings.push(
          finding(
            "MANIFEST_SCHEMA",
            ajvMessage(error),
            "Correct the manifest field to match schemas/package-manifest.schema.json, then rebuild and verify.",
            { path: error.instancePath || "/", actual: describeValue(error.data) },
          ),
        );
      }
      return;
    }
    state.manifest = parsedManifest as PackageManifest;
  });
  if (!schemaOk || state.manifest === null) {
    notRun(
      state,
      ["manifest_inventory", "file_integrity", "attestation_binding", "offline_dependencies", "disclosure_preflight"],
      "Not run because the manifest could not be parsed and validated.",
    );
    return finish(state);
  }

  const manifest = state.manifest;
  const actualByPath = new Map(
    actualFiles
      .filter((file) => file.relativePath !== PACKAGE_MANIFEST_FILE)
      .map((file) => [file.relativePath, file] as const),
  );
  let declaredByPath = new Map<string, PackageFile>();

  const inventoryOk = await runCheck(state, "manifest_inventory", () => {
    const workingCopyMarked =
      manifest.extensions.artifact_mode === "working_copy" ||
      manifest.extensions.release_status === "not_release_eligible";
    if (workingCopyMarked) {
      state.findings.push(
        finding(
          options.requireValidAttestation === false ? "WORKING_COPY_MODE" : "WORKING_COPY_NOT_RELEASE_ELIGIBLE",
          options.requireValidAttestation === false
            ? "Manifest explicitly identifies a NOT RELEASE-ELIGIBLE working copy; only integrity and portability are being verified."
            : "Manifest explicitly identifies a NOT RELEASE-ELIGIBLE working copy, which cannot pass default release verification.",
          options.requireValidAttestation === false
            ? "Review any failed or not_run checks that are present, rebuild without working-copy markers, and run default verification before release."
            : "Use working-copy verification only for review, or produce a fresh release-eligible bundle and run default verification.",
          { severity: options.requireValidAttestation === false ? "information" : "error", path: PACKAGE_MANIFEST_FILE },
        ),
      );
    }
    try {
      assertUniquePortablePaths(manifest.files.map((member) => member.path));
    } catch (error) {
      state.findings.push(
        finding(
          "MANIFEST_PATH_COLLISION",
          error instanceof Error ? error.message : String(error),
          "Give every member one canonical relative POSIX path and rebuild the manifest.",
        ),
      );
    }
    declaredByPath = new Map();
    for (const member of manifest.files) {
      try {
        assertNormalizedRelativePosixPath(member.path);
      } catch (error) {
        state.findings.push(
          finding(
            "MANIFEST_UNSAFE_PATH",
            error instanceof Error ? error.message : String(error),
            "Replace the path with a normalized, contained POSIX path and rebuild.",
            { path: member.path },
          ),
        );
        continue;
      }
      if (member.path === PACKAGE_MANIFEST_FILE) {
        state.findings.push(
          finding(
            "SELF_REFERENTIAL_MANIFEST",
            "package-manifest.json must not list or hash itself.",
            "Remove the self-entry and regenerate the manifest after all other bytes are final.",
            { path: member.path },
          ),
        );
      }
      declaredByPath.set(member.path, member);
    }

    for (const [declaredPath] of declaredByPath) {
      if (!actualByPath.has(declaredPath)) {
        state.findings.push(
          finding(
            "DECLARED_FILE_MISSING",
            `Manifested member is absent: ${declaredPath}.`,
            "Restore the exact file or rebuild the manifest from the final directory.",
            { path: declaredPath },
          ),
        );
      }
    }
    const extraPaths = [...actualByPath.keys()]
      .filter((actualPath) => !declaredByPath.has(actualPath))
      .sort(compareStrings);
    if (options.rejectExtraFiles !== false) {
      for (const actualPath of extraPaths) {
        state.findings.push(
          finding(
            "UNDECLARED_FILE",
            `Bundle contains a file not listed in the manifest: ${actualPath}.`,
            "Remove the file or regenerate the manifest so every package member is integrity-listed.",
            { path: actualPath },
          ),
        );
      }
    } else {
      state.unverifiedPaths = extraPaths;
      state.findings.push(
        finding(
          "EXTRA_FILES_NOT_VERIFIED",
          extraPaths.length === 0
            ? "Extra-file rejection was disabled; this run is integrity-only even though no extra files were observed."
            : `${extraPaths.length} unmanifested file(s) were excluded from integrity verification.`,
          "Run default verification with every file manifested or removed before release.",
          { severity: "information", actual: extraPaths.length },
        ),
      );
    }

    for (const entrypoint of manifest.entrypoints) {
      if (!declaredByPath.has(entrypoint.path)) {
        state.findings.push(
          finding(
            "ENTRYPOINT_UNDECLARED",
            `Entrypoint '${entrypoint.name}' targets an undeclared member: ${entrypoint.path}.`,
            "Point the entrypoint at a manifested local HTML member.",
            { path: entrypoint.path },
          ),
        );
      }
    }
  });

  const measured = new Map<string, { contentHash: string; byteSize: number }>();
  await runCheck(state, "file_integrity", async () => {
    if (!inventoryOk) {
      state.findings.push(
        finding(
          "INVENTORY_INVALID",
          "File integrity is incomplete because the manifest inventory is invalid.",
          "Fix manifest path and inventory findings, rebuild, and verify again.",
        ),
      );
    }
    for (const [declaredPath, member] of [...declaredByPath].sort(([left], [right]) => compareStrings(left, right))) {
      const actual = actualByPath.get(declaredPath);
      if (actual === undefined) continue;
      const digest = await sha256File(actual.absolutePath);
      measured.set(declaredPath, digest);
      state.filesChecked += 1;
      if (digest.byteSize !== member.byte_size) {
        state.findings.push(
          finding(
            "BYTE_SIZE_MISMATCH",
            `Byte size mismatch for ${declaredPath}.`,
            "Restore the released bytes or rebuild the manifest after the final change.",
            { path: declaredPath, expected: member.byte_size, actual: digest.byteSize },
          ),
        );
      }
      if (digest.contentHash !== member.content_hash) {
        state.findings.push(
          finding(
            "CONTENT_HASH_MISMATCH",
            `SHA-256 mismatch for ${declaredPath}.`,
            "Treat the member as modified or corrupt; restore it or re-run validation, rendering, and bundling for the changed payload.",
            { path: declaredPath, expected: member.content_hash, actual: digest.contentHash },
          ),
        );
      }
      const detected = detectMediaType(declaredPath);
      if (detected !== "application/octet-stream" && detected !== member.media_type) {
        state.findings.push(
          finding(
            "MEDIA_TYPE_MISMATCH",
            `Declared media type for ${declaredPath} differs from its file extension.`,
            "Correct the media_type or use a filename whose extension matches the content.",
            {
              severity: "warning",
              path: declaredPath,
              expected: detected,
              actual: member.media_type,
            },
          ),
        );
      }
    }
  });

  await runCheck(state, "attestation_binding", async () => {
    const reportMember = memberByRole(manifest, "scientific_report_public", state.findings);
    const attestationMember = memberByRole(manifest, "validation_attestation", state.findings);
    const projectionMember = memberByRole(manifest, "disclosure_projection", state.findings);
    memberByRole(manifest, "report_html", state.findings);
    memberByRole(manifest, "package_readme", state.findings);
    if (reportMember === null || attestationMember === null || projectionMember === null) return;

    const reportDigest = measured.get(reportMember.path);
    const attestationDigest = measured.get(attestationMember.path);
    const projectionDigest = measured.get(projectionMember.path);
    if (reportDigest !== undefined) {
      checkIdentityValue(
        state.findings,
        "manifest.scientific_payload_hash",
        reportDigest.contentHash,
        manifest.scientific_payload_hash,
        reportMember.path,
      );
    }
    if (attestationDigest !== undefined) {
      checkIdentityValue(
        state.findings,
        "manifest.validation_attestation_hash",
        attestationDigest.contentHash,
        manifest.validation_attestation_hash,
        attestationMember.path,
      );
    }
    if (projectionDigest !== undefined) {
      checkIdentityValue(
        state.findings,
        "manifest.disclosure_projection_hash",
        projectionDigest.contentHash,
        manifest.disclosure_projection_hash,
        projectionMember.path,
      );
    }

    const optionalBindings = [
      ["human_review_attestation", "human_review_attestation_hash"],
    ] as const;
    for (const [role, hashField] of optionalBindings) {
      const members = manifest.files.filter((member) => member.role === role);
      const declaredHash = manifest[hashField];
      if (members.length === 0 && declaredHash !== null) {
        state.findings.push(
          finding(
            "OPTIONAL_HASH_WITHOUT_MEMBER",
            `${hashField} is set although no '${role}' member exists.`,
            "Set the optional hash to null or include exactly one matching integrity-listed member.",
            { expected: null, actual: declaredHash },
          ),
        );
      } else if (members.length > 1) {
        state.findings.push(
          finding(
            "OPTIONAL_ROLE_CARDINALITY",
            `Manifest contains ${members.length} members with optional role '${role}'.`,
            "Keep at most one member for each optional attestation/projection role and rebuild the manifest.",
            { expected: 1, actual: members.length },
          ),
        );
      } else if (members.length === 1) {
        const member = members[0];
        if (member !== undefined) {
          const digest = measured.get(member.path);
          if (declaredHash === null) {
            state.findings.push(
              finding(
                "OPTIONAL_MEMBER_HASH_MISSING",
                `${hashField} is null although ${member.path} is present.`,
                "Rebuild the manifest so the optional top-level binding matches the member hash.",
                { path: member.path, expected: member.content_hash, actual: null },
              ),
            );
          } else if (digest !== undefined) {
            checkIdentityValue(state.findings, `manifest.${hashField}`, digest.contentHash, declaredHash, member.path);
          }
        }
      }
    }

    const validOptionalContracts = new Map<string, Record<string, unknown>>();
    const optionalContracts = [
      ["human_review_attestation", "human-review-attestation.schema.json", "human-review attestation"],
      ["disclosure_projection", "disclosure-projection.schema.json", "disclosure projection"],
      ["generation_audit", "generation-audit.schema.json", "generation audit"],
    ] as const;
    for (const [role, schemaFile, label] of optionalContracts) {
      const members = manifest.files.filter((member) => member.role === role);
      if (members.length !== 1) continue;
      const member = members[0];
      if (member === undefined || !actualByPath.has(member.path)) continue;
      try {
        const value = await readJsonObject(path.join(root, ...member.path.split("/")));
        const validate = await getContractValidator(schemaFile);
        if (!validate(value)) {
          for (const error of validate.errors ?? []) {
            state.findings.push(
              finding(
                "OPTIONAL_MEMBER_SCHEMA",
                `${label} ${ajvMessage(error)}`,
                `Regenerate ${member.path} so it satisfies schemas/${schemaFile}, then rebuild the bundle.`,
                { path: member.path, actual: describeValue(error.data) },
              ),
            );
          }
        } else {
          validOptionalContracts.set(role, value);
        }
      } catch (error) {
        state.findings.push(
          finding(
            "OPTIONAL_MEMBER_JSON",
            `${label} is not a valid JSON object: ${error instanceof Error ? error.message : String(error)}`,
            `Regenerate ${member.path} as valid UTF-8 JSON satisfying schemas/${schemaFile}.`,
            { path: member.path },
          ),
        );
      }
    }

    const reportPath = path.join(root, ...reportMember.path.split("/"));
    const attestationPath = path.join(root, ...attestationMember.path.split("/"));
    const projectionPath = path.join(root, ...projectionMember.path.split("/"));
    let report: Record<string, unknown>;
    let attestation: Record<string, unknown>;
    let projection: Record<string, unknown>;
    try {
      report = await readJsonObject(reportPath);
    } catch (error) {
      state.findings.push(
        finding(
          "REPORT_JSON",
          `Public scientific report is not a JSON object: ${error instanceof Error ? error.message : String(error)}`,
          "Regenerate the public scientific payload and re-run validation before rendering.",
          { path: reportMember.path },
        ),
      );
      return;
    }
    try {
      attestation = await readJsonObject(attestationPath);
    } catch (error) {
      state.findings.push(
        finding(
          "ATTESTATION_JSON",
          `Validation attestation is not a JSON object: ${error instanceof Error ? error.message : String(error)}`,
          "Re-run validation and include its complete attestation JSON.",
          { path: attestationMember.path },
        ),
      );
      return;
    }
    try {
      projection = await readJsonObject(projectionPath);
    } catch (error) {
      state.findings.push(
        finding(
          "DISCLOSURE_PROJECTION_JSON",
          `Disclosure projection is not a JSON object: ${error instanceof Error ? error.message : String(error)}`,
          "Re-run disclosure projection and include its complete projection record.",
          { path: projectionMember.path },
        ),
      );
      return;
    }

    const [validateReportSchema, validateAttestationSchema] = await Promise.all([
      getContractValidator("scientific-report.schema.json"),
      getContractValidator("validation-attestation.schema.json"),
    ]);
    if (!validateReportSchema(report)) {
      for (const error of validateReportSchema.errors ?? []) {
        state.findings.push(
          finding(
            "REPORT_SCHEMA",
            ajvMessage(error),
            "Regenerate the public payload from a report that satisfies schemas/scientific-report.schema.json, then validate and render again.",
            { path: reportMember.path, actual: describeValue(error.data) },
          ),
        );
      }
    }
    if (!validateAttestationSchema(attestation)) {
      for (const error of validateAttestationSchema.errors ?? []) {
        state.findings.push(
          finding(
            "ATTESTATION_SCHEMA",
            ajvMessage(error),
            "Re-run the validator and include a complete attestation satisfying schemas/validation-attestation.schema.json.",
            { path: attestationMember.path, actual: describeValue(error.data) },
          ),
        );
      }
    }

    if (report.payload_role !== "public_projection") {
      state.findings.push(
        finding(
          "PAYLOAD_ROLE_INVALID",
          `Public scientific report declares payload_role ${JSON.stringify(report.payload_role)}, not 'public_projection'.`,
          "Run the authorized disclosure projection before rendering and rebuilding the public bundle.",
          { path: reportMember.path, expected: "public_projection", actual: report.payload_role },
        ),
      );
    }
    checkIdentityValue(state.findings, "report_id", manifest.report_id, report.report_id, reportMember.path);
    checkIdentityValue(
      state.findings,
      "report_version",
      manifest.report_version,
      report.report_version,
      reportMember.path,
    );
    checkIdentityValue(
      state.findings,
      "attestation.report_id",
      manifest.report_id,
      attestation.report_id,
      attestationMember.path,
    );
    checkIdentityValue(
      state.findings,
      "attestation.report_version",
      manifest.report_version,
      attestation.report_version,
      attestationMember.path,
    );
    checkIdentityValue(
      state.findings,
      "attestation.scientific_payload_hash",
      manifest.scientific_payload_hash,
      attestation.scientific_payload_hash,
      attestationMember.path,
    );

    const canonicalProjectedHash = sha256CanonicalJson(report);
    const disclosureState = plainObject(report.disclosure_state) ? report.disclosure_state : {};
    checkIdentityValue(
      state.findings,
      "projection.projection_id",
      disclosureState.projection_id,
      projection.projection_id,
      projectionMember.path,
    );
    checkIdentityValue(
      state.findings,
      "projection.projected_report_id",
      manifest.report_id,
      projection.projected_report_id,
      projectionMember.path,
    );
    checkIdentityValue(
      state.findings,
      "projection.projected_report_version",
      manifest.report_version,
      projection.projected_report_version,
      projectionMember.path,
    );
    checkIdentityValue(
      state.findings,
      "projection.projected_payload_hash",
      canonicalProjectedHash,
      projection.projected_payload_hash,
      projectionMember.path,
    );
    if (projection.projection_status !== "complete") {
      state.findings.push(
        finding(
          "DISCLOSURE_PROJECTION_INCOMPLETE",
          `Disclosure projection status is ${JSON.stringify(projection.projection_status)}, not 'complete'.`,
          "Complete every disclosure check/review action and regenerate the projected report, validation, and bundle.",
          { path: projectionMember.path, expected: "complete", actual: projection.projection_status },
        ),
      );
    }
    const projectionBinding = plainObject(attestation.disclosure_projection_binding)
      ? attestation.disclosure_projection_binding
      : null;
    const canonicalProjectionHash = sha256CanonicalJson(projection);
    if (projectionBinding === null) {
      state.findings.push(
        finding(
          "ATTESTATION_PROJECTION_BINDING_MISSING",
          "Validation attestation has no verified disclosure-projection binding.",
          "Validate the public report together with its canonical source report and disclosure-projection record.",
          { path: attestationMember.path },
        ),
      );
    } else {
      checkIdentityValue(state.findings, "projection binding projection_id", projection.projection_id, projectionBinding.projection_id, attestationMember.path);
      checkIdentityValue(state.findings, "projection binding projection_hash", canonicalProjectionHash, projectionBinding.projection_hash, attestationMember.path);
      checkIdentityValue(state.findings, "projection binding source_payload_hash", projection.source_payload_hash, projectionBinding.source_payload_hash, attestationMember.path);
      checkIdentityValue(state.findings, "projection binding projected_payload_hash", canonicalProjectedHash, projectionBinding.projected_payload_hash, attestationMember.path);
      checkIdentityValue(state.findings, "projection binding verification_status", "pass", projectionBinding.verification_status, attestationMember.path);
    }

    const replayContract = collectReplayArtifactRequirements(report);
    for (const issue of replayContract.issues) {
      state.findings.push(
        finding(
          issue.code,
          issue.message,
          "Correct the R1+ artifact metadata and rebuild the public bundle with every available replay dependency.",
          { path: reportMember.path },
        ),
      );
    }
    for (const requirement of replayContract.requirements) {
      const member = manifest.files.find((candidate) => candidate.path === requirement.path);
      if (member === undefined) {
        state.findings.push(
          finding(
            "R1_ARTIFACT_MISSING",
            `Declared available R1+ artifact ${requirement.artifactId} is absent from ${requirement.path}.`,
            "Include and integrity-manifest the exact declared replay artifact before release.",
            { path: requirement.path },
          ),
        );
        continue;
      }
      checkIdentityValue(state.findings, "R1 artifact source_artifact_id", requirement.artifactId, member.source_artifact_id, member.path);
      checkIdentityValue(state.findings, "R1 artifact content hash", requirement.contentHash, member.content_hash, member.path);
      checkIdentityValue(state.findings, "R1 artifact byte size", requirement.byteSize, member.byte_size, member.path);
      if (!member.required) {
        state.findings.push(
          finding(
            "R1_ARTIFACT_NOT_REQUIRED",
            `Replay artifact ${requirement.artifactId} is not marked as a required package member.`,
            "Regenerate the manifest with required=true for every available R1+ dependency.",
            { path: member.path, expected: true, actual: false },
          ),
        );
      }
    }

    const humanReviewMember = manifest.files.find((member) => member.role === "human_review_attestation");
    const humanReview = validOptionalContracts.get("human_review_attestation");
    if (humanReviewMember !== undefined && humanReview !== undefined) {
      const bindings = [
        ["report_id", manifest.report_id, humanReview.report_id],
        ["report_version", manifest.report_version, humanReview.report_version],
        ["scientific_payload_hash", manifest.scientific_payload_hash, humanReview.scientific_payload_hash],
        ["validation_attestation_id", attestation.attestation_id, humanReview.validation_attestation_id],
        ["validation_attestation_hash", manifest.validation_attestation_hash, humanReview.validation_attestation_hash],
        ["validation_status_observed", attestation.overall_status, humanReview.validation_status_observed],
      ] as const;
      for (const [label, expected, actual] of bindings) {
        checkIdentityValue(state.findings, `human review ${label}`, expected, actual, humanReviewMember.path);
      }

      if (bindings.every(([, expected, actual]) => expected === actual)) {
        const reviewFindingSeverity: VerificationFinding["severity"] = releaseMode ? "error" : "information";
        const decision = humanReview.overall_decision;
        if (decision === "block_release") {
          state.findings.push(finding(
            "HUMAN_REVIEW_BLOCK_RELEASE",
            "The exactly bound human-review attestation explicitly blocks release.",
            "Resolve the scientific concerns and unresolved review work, then obtain a new exactly bound approval attestation before release.",
            { severity: reviewFindingSeverity, path: humanReviewMember.path, expected: "approve", actual: decision },
          ));
        } else if (decision !== "approve") {
          state.findings.push(finding(
            "HUMAN_REVIEW_NOT_APPROVED",
            `The exactly bound human-review decision is ${JSON.stringify(decision)}, not an unconditional approval.`,
            "Complete the required revision, evaluation, or conditions and obtain a new exactly bound approval attestation before release.",
            { severity: reviewFindingSeverity, path: humanReviewMember.path, expected: "approve", actual: decision },
          ));
        }

        const concernCount = Array.isArray(humanReview.review_checks)
          ? humanReview.review_checks.filter((check) => plainObject(check) && check.decision === "concern").length
          : 0;
        if (concernCount > 0) {
          state.findings.push(finding(
            "HUMAN_REVIEW_SCIENTIFIC_CONCERN",
            `The exactly bound human-review attestation records ${concernCount} unresolved scientific concern check(s).`,
            "Resolve each concern and obtain a replacement attestation whose review checks support release approval.",
            { severity: reviewFindingSeverity, path: humanReviewMember.path, expected: 0, actual: concernCount },
          ));
        }

        const unresolvedTaskCount = Array.isArray(humanReview.unresolved_review_task_ids)
          ? humanReview.unresolved_review_task_ids.length
          : 0;
        if (unresolvedTaskCount > 0) {
          state.findings.push(finding(
            "HUMAN_REVIEW_UNRESOLVED_TASKS",
            `The exactly bound human-review attestation retains ${unresolvedTaskCount} unresolved review task(s).`,
            "Close every blocking review task and obtain a replacement exactly bound human-review attestation before release.",
            { severity: reviewFindingSeverity, path: humanReviewMember.path, expected: 0, actual: unresolvedTaskCount },
          ));
        }
      }
    }

    const generationAuditMember = manifest.files.find((member) => member.role === "generation_audit");
    const generationAudit = generationAuditMember === undefined
      ? null
      : await readJsonObject(path.join(root, ...generationAuditMember.path.split("/")));
    try {
      const trustedIssues = await inspectTrustedRendererProjection(
        root,
        report,
        attestation,
        generationAudit,
        isWorkingCopyExtensions(manifest.extensions),
        manifest.files,
      );
      for (const issue of trustedIssues) {
        state.findings.push(
          finding(
            issue.code,
            issue.message,
            "Regenerate every presentation member with the package-owned renderer from the exact public scientific payload and attestation.",
            { path: issue.path, expected: issue.expectedHash, actual: issue.actualHash },
          ),
        );
      }
    } catch (error) {
      state.findings.push(
        finding(
          "TRUSTED_RENDER_REPRODUCTION_ERROR",
          `Package-owned deterministic rendering could not be reproduced: ${error instanceof Error ? error.message : String(error)}`,
          "Correct the public payload and attestation, then regenerate every presentation member with the package-owned renderer.",
          { path: reportMember.path },
        ),
      );
    }

    if ((options.requireValidAttestation ?? true) && attestation.overall_status !== "valid") {
      state.findings.push(
        finding(
          "ATTESTATION_NOT_VALID",
          `Validation attestation overall_status is ${JSON.stringify(attestation.overall_status)}, not 'valid'.`,
          "Resolve failed, incomplete, or error checks and generate a new attestation for the exact payload bytes before release.",
          { path: attestationMember.path, expected: "valid", actual: attestation.overall_status },
        ),
      );
    }
    const requireFullScope =
      options.requireFullValidationScope ?? (options.requireValidAttestation ?? true);
    if (requireFullScope && attestation.validation_scope !== "full") {
      state.findings.push(
        finding(
          "ATTESTATION_SCOPE_NOT_FULL",
          `Validation attestation scope is ${JSON.stringify(attestation.validation_scope)}, not 'full'.`,
          "Run the full applicable ruleset for the exact payload before treating this package as release-verifiable; selected or incremental validation is not a full release gate.",
          { path: attestationMember.path, expected: "full", actual: attestation.validation_scope },
        ),
      );
    }
    if (options.requireValidAttestation === false) {
      state.findings.push(
        finding(
          "INTEGRITY_ONLY_MODE",
          "Attestation validity was not required; a PASS result covers package integrity and portability checks only, not release eligibility.",
          "Run verification without the integrity-only override after obtaining a full, valid attestation before release.",
          { severity: "information", path: attestationMember.path },
        ),
      );
    }

    inspectMissingness(report, "", reportMember.path, state.findings, new WeakSet<object>());
  });

  await runCheck(state, "offline_dependencies", async () => {
    const textFiles: OfflineContentFile[] = [];
    for (const [memberPath, actual] of [...actualByPath].sort(([left], [right]) => compareStrings(left, right))) {
      if (!TEXT_EXTENSIONS.has(path.posix.extname(memberPath).toLowerCase())) continue;
      const content = await readUtf8Strict(actual.absolutePath);
      textFiles.push({ path: memberPath, content });
    }
    const inspection = inspectOfflineContent(textFiles);
    for (const issue of inspection.findings) {
      state.findings.push(
        finding(
          issue.code,
          issue.message,
          "Replace the dependency with a listed local asset or remove the active/escaping reference, then rebuild.",
          { path: issue.path },
        ),
      );
    }
    checkLocalReferences(new Set(declaredByPath.keys()), inspection, state.findings);
    state.findings.push(
      finding(
        "FILE_URL_CHECK_NOT_RUN",
        "No browser-level file:// launch was performed by the directory verifier.",
        "Run the separate browser release check before claiming file-URL behavior was tested.",
        { severity: "information", path: manifest.entrypoints[0]?.path ?? null },
      ),
    );
  });

  await runCheck(state, "disclosure_preflight", async () => {
    const textFiles: OfflineContentFile[] = [];
    for (const [memberPath, actual] of actualByPath) {
      if (!TEXT_EXTENSIONS.has(path.posix.extname(memberPath).toLowerCase())) continue;
      textFiles.push({ path: memberPath, content: await readUtf8Strict(actual.absolutePath) });
    }
    for (const leak of scanForHighConfidenceLeaks(textFiles)) {
      state.findings.push(
        finding(
          `DISCLOSURE_${leak.code}`,
          leak.message,
          "Remove the value from every public derivative and regenerate the disclosure projection, report, attestation, and manifest.",
          { path: leak.path },
        ),
      );
    }
    state.findings.push(
      finding(
        "DISCLOSURE_SCOPE_LIMIT",
        "Verifier disclosure scanning is a high-confidence preflight, not proof that every restricted or withheld value was removed.",
        "Rely on a matching disclosure-policy validation attestation and qualified human review for release approval.",
        { severity: "information" },
      ),
    );
  });

  return finish(state);
}

function finish(state: MutableVerification): BundleVerificationResult {
  state.findings.sort((left, right) => {
    const severityRank = { error: 0, warning: 1, information: 2 } as const;
    const severity = severityRank[left.severity] - severityRank[right.severity];
    if (severity !== 0) return severity;
    const pathComparison = compareStrings(left.path ?? "", right.path ?? "");
    if (pathComparison !== 0) return pathComparison;
    return compareStrings(left.code, right.code);
  });
  const ok =
    state.findings.every((item) => item.severity !== "error") &&
    state.checks.every((check) => !["fail", "error", "not_run"].includes(check.status));
  return {
    ok,
    verificationMode: state.verificationMode,
    releaseEligible: ok && state.verificationMode === "release",
    unverifiedPaths: [...state.unverifiedPaths],
    bundleRoot: state.root,
    manifestPath: state.manifestPath,
    verifiedAt: state.verifiedAt,
    filesChecked: state.filesChecked,
    checks: state.checks,
    findings: state.findings,
    manifest: state.manifest,
  };
}

export function formatVerificationResult(result: BundleVerificationResult): string {
  const headline = result.releaseEligible
    ? "Release bundle verification: PASS"
    : result.ok
      ? "Integrity-only verification: PASS — NOT RELEASE-ELIGIBLE"
      : "Bundle verification: FAIL";
  const lines = [
    headline,
    `Mode: ${result.verificationMode}`,
    `Release eligible: ${result.releaseEligible ? "yes" : "no"}`,
    `Bundle: ${result.bundleRoot}`,
    `Files checked: ${result.filesChecked}`,
    ...(result.unverifiedPaths.length > 0
      ? [`Unverified paths (${result.unverifiedPaths.length}): ${result.unverifiedPaths.join(", ")}`]
      : []),
    "",
    "Checks:",
  ];
  for (const check of result.checks) {
    lines.push(`  ${check.status.toUpperCase().padEnd(14)} ${check.check} — ${check.details}`);
  }
  if (result.findings.length > 0) {
    lines.push("", "Findings:");
    for (const item of result.findings) {
      const location = item.path === null ? "" : ` [${item.path}]`;
      lines.push(`  ${item.severity.toUpperCase()} ${item.code}${location}: ${item.message}`);
      lines.push(`    Action: ${item.remediation}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

// Backward-compatible explicit aliases for consumers that prefer noun-first API
// names. They preserve the exact same verification semantics.
export const verifyPackage = verifyBundle;

// These constants document the conventional paths while role-based manifests
// remain the actual authority.
export const CONVENTIONAL_PAYLOAD_PATH = DEFAULT_SCIENTIFIC_REPORT_FILE;
export const CONVENTIONAL_ATTESTATION_PATH = DEFAULT_VALIDATION_ATTESTATION_FILE;

export { BundleBuildError };
