import { sha256, sha256CanonicalJson, type Sha256Hash } from "./hash.js";
import type { JsonObject, JsonValue } from "./json.js";

export type AdverseContentCategory =
  | "failed_attempt"
  | "crashed_segment"
  | "adverse_quality_event"
  | "exclusion"
  | "negative_or_null_result"
  | "retraction"
  | "supersession";

export interface ByteRange {
  start_byte: number;
  end_byte_exclusive: number;
}

export interface AdverseContentFinding {
  finding_id: string;
  category: AdverseContentCategory;
  start_byte: number;
  end_byte_exclusive: number;
  excerpt_hash: Sha256Hash;
  disposition: "mapped" | "unmapped";
  mapped_object_ids: string[];
}

export interface ExtractionCoverageAttestation {
  attestation_id: string;
  attestation_version: "1.0.0";
  source_item_id: string;
  source_snapshot_id: string;
  source_content_hash: Sha256Hash;
  source_byte_size: number;
  extraction_status: "complete" | "partial" | "not_run" | "error";
  covered_byte_ranges: ByteRange[];
  extracted_text_hash: Sha256Hash | null;
  parser_identity: {
    name: string;
    version: string;
    configuration_hash: Sha256Hash;
  };
  adverse_scan_status: "complete" | "partial" | "not_run" | "error";
  adverse_pattern_set_id: string;
  adverse_pattern_set_version: string;
  adverse_pattern_set_hash: Sha256Hash;
  adverse_content_findings: AdverseContentFinding[];
  created_at: string;
  extensions: Record<string, JsonValue>;
}

export interface CreateExtractionCoverageOptions {
  createdAt: string;
  parserName?: string;
  parserVersion?: string;
  /** Bind scanner findings to already-authored canonical ledger objects. */
  mappedObjectIds?: Partial<Record<AdverseContentCategory, readonly string[]>>;
}

interface PatternDefinition {
  category: AdverseContentCategory;
  source: string;
  flags: string;
}

const PATTERN_DEFINITIONS: readonly PatternDefinition[] = [
  {
    category: "failed_attempt",
    source: "\\b(?:(?:run|job|attempt|trial)\\s+(?:has\\s+)?failed|failed\\s+(?:run|job|attempt|trial)|execution\\s+failure)\\b",
    flags: "giu",
  },
  {
    category: "crashed_segment",
    source: "\\b(?:(?:segment|process|job|run)\\s+crashed|crash(?:ed)?\\s+(?:segment|process|job|run))\\b",
    flags: "giu",
  },
  {
    category: "adverse_quality_event",
    source: "\\b(?:quality\\s+control|qc|positive\\s+control|negative\\s+control)\\s+(?:failed|failure|invalid|indeterminate)\\b",
    flags: "giu",
  },
  {
    category: "exclusion",
    source: "\\b(?:excluded|exclusion|removed\\s+from\\s+analysis|dropped\\s+from\\s+analysis)\\b",
    flags: "giu",
  },
  {
    category: "negative_or_null_result",
    source: "\\b(?:no\\s+(?:detectable\\s+)?effect|null\\s+result|do(?:es)?\\s+not\\s+reject|negative\\s+finding)\\b",
    flags: "giu",
  },
  {
    category: "retraction",
    source: "\\b(?:retracted|retraction|withdrawn)\\b",
    flags: "giu",
  },
  {
    category: "supersession",
    source: "\\b(?:superseded|obsolete\\s+output|replaced\\s+result)\\b",
    flags: "giu",
  },
] as const;

export const ADVERSE_PATTERN_SET_ID = "report-prompt-adverse-content";
export const ADVERSE_PATTERN_SET_VERSION = "1.0.0";
export const ADVERSE_PATTERN_SET_HASH = sha256CanonicalJson(PATTERN_DEFINITIONS);

function canonicalIso(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new RangeError(`createdAt must be a canonical ISO 8601 timestamp: ${value}`);
  }
  return value;
}

function byteOffset(text: string, codeUnitOffset: number): number {
  return Buffer.byteLength(text.slice(0, codeUnitOffset), "utf8");
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

/**
 * Create a byte-bound, full-range UTF-8 extraction attestation and run the
 * protocol's deterministic adverse-content probe set. The scanner does not
 * invent ledger mappings; unmatched findings remain explicitly unmapped.
 */
export function createExtractionCoverageAttestation(
  sourceItemId: string,
  sourceSnapshotId: string,
  bytes: Uint8Array,
  options: CreateExtractionCoverageOptions,
): ExtractionCoverageAttestation {
  if (sourceItemId.trim() === "" || sourceSnapshotId.trim() === "") {
    throw new TypeError("sourceItemId and sourceSnapshotId must be non-empty");
  }
  const createdAt = canonicalIso(options.createdAt);
  const parserName = options.parserName ?? "utf8-lossless";
  const parserVersion = options.parserVersion ?? "1.0.0";
  const parserConfigurationHash = sha256CanonicalJson({
    parser_name: parserName,
    parser_version: parserVersion,
    fatal_utf8: true,
    byte_offset_basis: "utf8-source-bytes",
  });
  const contentHash = sha256(bytes);

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return {
      attestation_id: `extraction:${sourceItemId}:${contentHash.slice("sha256:".length, "sha256:".length + 16)}`,
      attestation_version: "1.0.0",
      source_item_id: sourceItemId,
      source_snapshot_id: sourceSnapshotId,
      source_content_hash: contentHash,
      source_byte_size: bytes.byteLength,
      extraction_status: "error",
      covered_byte_ranges: [],
      extracted_text_hash: null,
      parser_identity: { name: parserName, version: parserVersion, configuration_hash: parserConfigurationHash },
      adverse_scan_status: "not_run",
      adverse_pattern_set_id: ADVERSE_PATTERN_SET_ID,
      adverse_pattern_set_version: ADVERSE_PATTERN_SET_VERSION,
      adverse_pattern_set_hash: ADVERSE_PATTERN_SET_HASH,
      adverse_content_findings: [],
      created_at: createdAt,
      extensions: { error_code: "invalid_utf8" },
    };
  }

  const findings: AdverseContentFinding[] = [];
  for (const definition of PATTERN_DEFINITIONS) {
    const expression = new RegExp(definition.source, definition.flags);
    for (let match = expression.exec(text); match !== null; match = expression.exec(text)) {
      const start = byteOffset(text, match.index);
      const end = byteOffset(text, match.index + match[0].length);
      const mapped = sortedUnique(options.mappedObjectIds?.[definition.category] ?? []);
      findings.push({
        finding_id: `adverse:${definition.category}:${start}:${end}`,
        category: definition.category,
        start_byte: start,
        end_byte_exclusive: end,
        excerpt_hash: sha256(Buffer.from(match[0], "utf8")),
        disposition: mapped.length > 0 ? "mapped" : "unmapped",
        mapped_object_ids: mapped,
      });
      if (match[0].length === 0) expression.lastIndex += 1;
    }
  }
  findings.sort((left, right) => left.start_byte - right.start_byte || left.category.localeCompare(right.category));

  return {
    attestation_id: `extraction:${sourceItemId}:${contentHash.slice("sha256:".length, "sha256:".length + 16)}`,
    attestation_version: "1.0.0",
    source_item_id: sourceItemId,
    source_snapshot_id: sourceSnapshotId,
    source_content_hash: contentHash,
    source_byte_size: bytes.byteLength,
    extraction_status: "complete",
    covered_byte_ranges: bytes.byteLength === 0 ? [] : [{ start_byte: 0, end_byte_exclusive: bytes.byteLength }],
    extracted_text_hash: sha256(Buffer.from(text, "utf8")),
    parser_identity: { name: parserName, version: parserVersion, configuration_hash: parserConfigurationHash },
    adverse_scan_status: "complete",
    adverse_pattern_set_id: ADVERSE_PATTERN_SET_ID,
    adverse_pattern_set_version: ADVERSE_PATTERN_SET_VERSION,
    adverse_pattern_set_hash: ADVERSE_PATTERN_SET_HASH,
    adverse_content_findings: findings,
    created_at: createdAt,
    extensions: {},
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export interface ExtractionCoverageAssessment {
  complete: boolean;
  problems: string[];
  attestation: ExtractionCoverageAttestation | null;
}

/** Validate cryptographic identity, full byte-range coverage, and scanner scope. */
export function assessExtractionCoverage(sourceItem: unknown): ExtractionCoverageAssessment {
  const source = record(sourceItem);
  const candidate = record(source?.extraction_coverage_attestation);
  if (source === null || candidate === null) {
    return { complete: false, problems: ["extraction coverage attestation is absent"], attestation: null };
  }
  const attestation = candidate as unknown as ExtractionCoverageAttestation;
  const problems: string[] = [];
  if (attestation.source_item_id !== source.source_item_id) problems.push("source_item_id binding differs");
  if (attestation.source_snapshot_id !== source.snapshot_id) problems.push("source_snapshot_id binding differs");
  const contentHashField = record(source.content_hash);
  if (contentHashField?.state !== "known" || typeof contentHashField.value !== "string") {
    problems.push("source content hash is not known");
  } else if (attestation.source_content_hash !== contentHashField.value) {
    problems.push("source content hash binding differs");
  }
  if (attestation.extraction_status !== "complete") problems.push(`extraction_status=${String(attestation.extraction_status)}`);
  if (attestation.adverse_scan_status !== "complete") problems.push(`adverse_scan_status=${String(attestation.adverse_scan_status)}`);
  if (attestation.adverse_pattern_set_id !== ADVERSE_PATTERN_SET_ID ||
      attestation.adverse_pattern_set_version !== ADVERSE_PATTERN_SET_VERSION ||
      attestation.adverse_pattern_set_hash !== ADVERSE_PATTERN_SET_HASH) {
    problems.push("adverse scanner pattern-set binding is unsupported");
  }
  if (!Number.isInteger(attestation.source_byte_size) || attestation.source_byte_size < 0) {
    problems.push("source_byte_size is invalid");
  }
  const ranges = Array.isArray(attestation.covered_byte_ranges)
    ? [...attestation.covered_byte_ranges].sort((left, right) => left.start_byte - right.start_byte)
    : [];
  if (attestation.source_byte_size === 0) {
    if (ranges.length !== 0) problems.push("zero-byte source has nonempty covered ranges");
  } else {
    let cursor = 0;
    for (const range of ranges) {
      if (!Number.isInteger(range.start_byte) || !Number.isInteger(range.end_byte_exclusive) || range.start_byte !== cursor || range.end_byte_exclusive <= range.start_byte) {
        problems.push("covered byte ranges contain a gap, overlap, or invalid bound");
        break;
      }
      cursor = range.end_byte_exclusive;
    }
    if (cursor !== attestation.source_byte_size) problems.push("covered byte ranges do not span the complete source");
  }
  for (const [index, finding] of (attestation.adverse_content_findings ?? []).entries()) {
    if (finding.start_byte < 0 || finding.end_byte_exclusive <= finding.start_byte || finding.end_byte_exclusive > attestation.source_byte_size) {
      problems.push(`adverse finding ${index} has an invalid byte range`);
    }
    if (finding.disposition === "mapped" && finding.mapped_object_ids.length === 0) {
      problems.push(`adverse finding ${index} is marked mapped without object ids`);
    }
    if (finding.disposition === "unmapped" && finding.mapped_object_ids.length > 0) {
      problems.push(`adverse finding ${index} is marked unmapped but has object ids`);
    }
  }
  return {
    complete: problems.length === 0,
    problems,
    attestation: problems.length === 0 ? attestation : null,
  };
}

export function extractionAttestationAsJson(attestation: ExtractionCoverageAttestation): JsonObject {
  return attestation as unknown as JsonObject;
}
