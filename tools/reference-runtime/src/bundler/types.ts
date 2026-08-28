export type PackageFileRole =
  | "report_html"
  | "annex_html"
  | "style"
  | "script"
  | "icon"
  | "scientific_report_public"
  | "validation_attestation"
  | "human_review_attestation"
  | "disclosure_projection"
  | "generation_audit"
  | "search_index"
  | "package_readme"
  | "data_artifact"
  | "other";

export type DisclosureClass = "public" | "internal" | "restricted";
export type PackageCheckStatus = "pass" | "fail" | "not_run" | "error" | "not_applicable";
export type PackageCheckKind =
  | "hash_integrity"
  | "relative_paths"
  | "offline_dependencies"
  | "file_url_open"
  | "disclosure"
  | "other";

export interface PackageFile {
  path: string;
  role: PackageFileRole;
  media_type: string;
  content_hash: string;
  byte_size: number;
  required: boolean;
  disclosure_class: DisclosureClass;
  source_artifact_id: string | null;
}

export interface PackageEntrypoint {
  name: string;
  path: string;
  purpose: string;
}

export interface PackageCheck {
  check_id: string;
  check_kind: PackageCheckKind;
  status: PackageCheckStatus;
  checked_at: string | null;
  finding_count: number;
  details: string;
}

export interface PackageManifest {
  package_id: string;
  package_version: string;
  schema_version: string;
  manifest_file_name: "package-manifest.json";
  report_id: string;
  report_version: string;
  scientific_payload_hash: string;
  validation_attestation_hash: string;
  human_review_attestation_hash: string | null;
  disclosure_projection_hash: string;
  created_at: string;
  bundle_format: "portable_offline_directory";
  files: PackageFile[];
  entrypoints: PackageEntrypoint[];
  remote_dependencies: [];
  absolute_paths_present: false;
  active_external_content_present: false;
  package_checks: PackageCheck[];
  extensions: Record<string, unknown>;
}

export interface BundleMemberOverride {
  role?: PackageFileRole;
  mediaType?: string;
  required?: boolean;
  disclosureClass?: DisclosureClass;
  sourceArtifactId?: string | null;
}

export interface ManifestOptions {
  packageId?: string;
  packageVersion?: string;
  schemaVersion?: string;
  createdAt?: string;
  roleOverrides?: Readonly<Record<string, BundleMemberOverride>>;
  extensions?: Readonly<Record<string, unknown>>;
}

export interface BundleOptions extends ManifestOptions {
  force?: boolean;
  createReadme?: boolean;
}

export interface BundleResult {
  outDir: string;
  manifestPath: string;
  manifest: PackageManifest;
  files: string[];
}

export type VerificationFindingSeverity = "error" | "warning" | "information";

export interface VerificationFinding {
  code: string;
  severity: VerificationFindingSeverity;
  message: string;
  path: string | null;
  expected: string | number | boolean | null;
  actual: string | number | boolean | null;
  remediation: string;
}

export interface VerificationCheck {
  check: string;
  status: "pass" | "fail" | "error" | "not_run" | "not_applicable";
  findingCount: number;
  details: string;
}

export interface BundleVerificationResult {
  ok: boolean;
  verificationMode: "release" | "integrity_only";
  releaseEligible: boolean;
  unverifiedPaths: string[];
  bundleRoot: string;
  manifestPath: string;
  verifiedAt: string;
  filesChecked: number;
  checks: VerificationCheck[];
  findings: VerificationFinding[];
  manifest: PackageManifest | null;
}

export interface VerifyBundleOptions {
  requireValidAttestation?: boolean;
  requireFullValidationScope?: boolean;
  rejectExtraFiles?: boolean;
  maxManifestBytes?: number;
}
