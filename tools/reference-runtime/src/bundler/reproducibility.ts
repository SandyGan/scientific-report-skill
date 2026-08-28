import { assertNormalizedRelativePosixPath } from "./path-safety.js";

const R1_OR_HIGHER = new Set([
  "R1_replay_ready",
  "R2_verified_replay",
  "R3_independent_reproduction",
]);
const AVAILABLE_ACCESS_STATES = new Set(["open", "available_with_conditions"]);
const RESERVED_PACKAGE_PATHS = new Set([
  "package-manifest.json",
  "report.html",
  "annex/index.html",
  "annex/records.html",
  "assets/icons.svg",
  "assets/print.css",
  "assets/report.css",
  "assets/report.js",
  "scientific-report.public.json",
  "validation-attestation.json",
  "human-review-attestation.json",
  "disclosure-projection.json",
  "audit/generation-audit.json",
  "README.txt",
]);

export interface ReplayArtifactRequirement {
  artifactId: string;
  unitIds: string[];
  path: string;
  contentHash: string;
  byteSize: number;
}

export interface ReplayArtifactContractIssue {
  code:
    | "R1_ARTIFACT_REFERENCE_UNRESOLVED"
    | "R1_ARTIFACT_METADATA_INCOMPLETE"
    | "R1_ARTIFACT_PATH_UNSAFE"
    | "R1_ARTIFACT_PATH_RESERVED"
    | "R1_ARTIFACT_PATH_COLLISION";
  artifactId: string | null;
  unitId: string | null;
  message: string;
}

export interface ReplayArtifactCollection {
  requirements: ReplayArtifactRequirement[];
  issues: ReplayArtifactContractIssue[];
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function knownValue(value: unknown): unknown {
  if (!plainObject(value) || value.state !== "known") return undefined;
  return value.value;
}

function collectArtifactReferences(value: unknown, result: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectArtifactReferences(item, result));
    return;
  }
  if (!plainObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (/(?:^|_)artifact_id$/u.test(key) && typeof item === "string" && item.length > 0) {
      result.add(item);
    } else if (/(?:^|_)artifact_ids$/u.test(key) && Array.isArray(item)) {
      for (const id of item) if (typeof id === "string" && id.length > 0) result.add(id);
    } else {
      collectArtifactReferences(item, result);
    }
  }
}

/**
 * Derive the package dependency set independently from every declared R1+
 * reproducibility unit. Only public artifacts declared available in the report
 * may cross the disclosure boundary; each must have exact portable bytes.
 */
export function collectReplayArtifactRequirements(report: unknown): ReplayArtifactCollection {
  if (!plainObject(report)) return { requirements: [], issues: [] };
  const units = Array.isArray(report.reproducibility_units) ? report.reproducibility_units : [];
  const artifacts = Array.isArray(report.artifacts) ? report.artifacts : [];
  const artifactById = new Map<string, Record<string, unknown>>();
  for (const candidate of artifacts) {
    if (!plainObject(candidate) || typeof candidate.artifact_id !== "string") continue;
    artifactById.set(candidate.artifact_id, candidate);
  }

  const unitsByArtifact = new Map<string, Set<string>>();
  const explicitlyBundled = new Set<string>();
  for (const candidate of units) {
    if (!plainObject(candidate) || !R1_OR_HIGHER.has(String(candidate.conservative_level))) continue;
    const unitId = typeof candidate.reproducibility_unit_id === "string"
      ? candidate.reproducibility_unit_id
      : "<unknown-r1-unit>";
    const references = new Set<string>();
    collectArtifactReferences(candidate, references);
    const explicit = Array.isArray(candidate.bundle_dependency_artifact_ids)
      ? candidate.bundle_dependency_artifact_ids.filter((item): item is string => typeof item === "string")
      : [];
    explicit.forEach((id) => {
      references.add(id);
      explicitlyBundled.add(id);
    });
    for (const artifactId of references) {
      const owners = unitsByArtifact.get(artifactId) ?? new Set<string>();
      owners.add(unitId);
      unitsByArtifact.set(artifactId, owners);
    }
  }

  const issues: ReplayArtifactContractIssue[] = [];
  const requirements: ReplayArtifactRequirement[] = [];
  const pathOwners = new Map<string, string>();
  for (const [artifactId, unitIds] of [...unitsByArtifact].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    const artifact = artifactById.get(artifactId);
    if (artifact === undefined) {
      issues.push({
        code: "R1_ARTIFACT_REFERENCE_UNRESOLVED",
        artifactId,
        unitId: [...unitIds][0] ?? null,
        message: `R1+ reproducibility unit references unresolved artifact ${artifactId}.`,
      });
      continue;
    }

    const publicAndAvailable = artifact.disclosure_class === "public" && AVAILABLE_ACCESS_STATES.has(String(artifact.access_state));
    if (!publicAndAvailable && !explicitlyBundled.has(artifactId)) continue;
    if (!publicAndAvailable) {
      issues.push({
        code: "R1_ARTIFACT_METADATA_INCOMPLETE",
        artifactId,
        unitId: [...unitIds][0] ?? null,
        message: `Explicit bundle dependency ${artifactId} must be public and available before it can enter a public R1+ package.`,
      });
      continue;
    }

    const artifactPath = knownValue(artifact.location);
    const contentHash = knownValue(artifact.content_hash);
    const byteSize = knownValue(artifact.byte_size);
    if (
      typeof artifactPath !== "string" ||
      typeof contentHash !== "string" ||
      !/^sha256:[0-9a-f]{64}$/u.test(contentHash) ||
      !Number.isSafeInteger(byteSize) ||
      (byteSize as number) < 0
    ) {
      issues.push({
        code: "R1_ARTIFACT_METADATA_INCOMPLETE",
        artifactId,
        unitId: [...unitIds][0] ?? null,
        message: `Available public R1+ artifact ${artifactId} requires known location, SHA-256 content hash, and non-negative byte size.`,
      });
      continue;
    }
    try {
      assertNormalizedRelativePosixPath(artifactPath);
    } catch (error) {
      issues.push({
        code: "R1_ARTIFACT_PATH_UNSAFE",
        artifactId,
        unitId: [...unitIds][0] ?? null,
        message: `R1+ artifact ${artifactId} has an unsafe package location: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    if (RESERVED_PACKAGE_PATHS.has(artifactPath)) {
      issues.push({
        code: "R1_ARTIFACT_PATH_RESERVED",
        artifactId,
        unitId: [...unitIds][0] ?? null,
        message: `R1+ artifact ${artifactId} collides with reserved package member ${artifactPath}.`,
      });
      continue;
    }
    const priorOwner = pathOwners.get(artifactPath);
    if (priorOwner !== undefined && priorOwner !== artifactId) {
      issues.push({
        code: "R1_ARTIFACT_PATH_COLLISION",
        artifactId,
        unitId: [...unitIds][0] ?? null,
        message: `R1+ artifacts ${priorOwner} and ${artifactId} claim the same package path ${artifactPath}.`,
      });
      continue;
    }
    pathOwners.set(artifactPath, artifactId);
    requirements.push({
      artifactId,
      unitIds: [...unitIds].sort(),
      path: artifactPath,
      contentHash,
      byteSize: byteSize as number,
    });
  }
  requirements.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return { requirements, issues };
}
