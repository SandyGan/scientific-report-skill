import { sha256, sha256CanonicalJson } from "../lib/hash.js";
import { canonicalJson } from "../lib/json.js";
import type { Locator, SourceBinding } from "../lib/types.js";
import type { GenerationIssue, TrustedExtractionRecord, TrustedParserIdentity } from "./types.js";

interface ChunkRecord extends Record<string, unknown> {
  chunk_id: string;
  source_item_id: string;
  source_snapshot_id: string;
  snapshot_registry_hash: string;
  content_hash: string;
  chunk_content_hash: string;
  locator: Locator;
  source_extent: Record<string, unknown>;
  sequence: Record<string, unknown>;
  overlap: Record<string, unknown>;
  truncation: Record<string, unknown>;
  parser_result: Record<string, unknown>;
  stable_sub_item: Record<string, unknown>;
  content: string;
}

function issue(code: string, message: string, path?: string): GenerationIssue {
  return path === undefined ? { code, message } : { code, message, path };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isChunk(value: unknown): value is ChunkRecord {
  const item = record(value);
  return item !== null
    && typeof item.chunk_id === "string"
    && typeof item.source_item_id === "string"
    && typeof item.source_snapshot_id === "string"
    && typeof item.snapshot_registry_hash === "string"
    && typeof item.content_hash === "string"
    && typeof item.chunk_content_hash === "string"
    && typeof item.content === "string"
    && record(item.locator) !== null
    && record(item.source_extent) !== null
    && record(item.sequence) !== null
    && record(item.overlap) !== null
    && record(item.truncation) !== null
    && record(item.parser_result) !== null
    && record(item.stable_sub_item) !== null;
}

function parserIdentity(chunk: ChunkRecord): TrustedParserIdentity | null {
  const parser = chunk.parser_result;
  return typeof parser.parser_name === "string"
    && typeof parser.parser_version === "string"
    && typeof parser.configuration_hash === "string"
    && typeof parser.parser_result_id === "string"
    ? {
        parser_name: parser.parser_name,
        parser_version: parser.parser_version,
        configuration_hash: parser.configuration_hash,
        parser_result_id: parser.parser_result_id,
      }
    : null;
}

function locator(value: unknown): Locator | null {
  const item = record(value);
  return item !== null && typeof item.locator_type === "string" && typeof item.value === "string"
    ? item as unknown as Locator
    : null;
}

function extent(chunk: ChunkRecord): TrustedExtractionRecord["source_extent"] | null {
  const value = chunk.source_extent;
  const unit = value.unit;
  return typeof unit === "string"
    && ["utf8_bytes", "unicode_code_points", "records", "frames", "pages"].includes(unit)
    && typeof value.start === "number"
    && typeof value.end_exclusive === "number"
    ? {
        unit: unit as TrustedExtractionRecord["source_extent"]["unit"],
        start: value.start,
        end_exclusive: value.end_exclusive,
      }
    : null;
}

function equalJson(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

function parserIsComplete(chunk: ChunkRecord): boolean {
  return chunk.parser_result.status === "success"
    && ["verified_lossless", "structured_lossless"].includes(String(chunk.parser_result.quality));
}

function fullSingleChunk(chunk: ChunkRecord): boolean {
  return chunk.source_extent.start === 0
    && chunk.source_extent.total_state === "known"
    && chunk.source_extent.end_exclusive === chunk.source_extent.total
    && chunk.sequence.index === 0
    && chunk.sequence.count_state === "known"
    && chunk.sequence.count === 1
    && chunk.truncation.source_completeness === "complete"
    && chunk.truncation.reassembly_status === "complete"
    && parserIsComplete(chunk)
    && chunk.content_hash === sha256(chunk.content);
}

function sliceUnits(value: string, start: number): string {
  return Array.from(value).slice(start).join("");
}

function byteSuffix(value: string, start: number): string | null {
  const bytes = Buffer.from(value, "utf8");
  const suffix = bytes.subarray(start);
  const decoded = suffix.toString("utf8");
  return Buffer.from(decoded, "utf8").equals(suffix) ? decoded : null;
}

function withoutPrefix(value: string, units: number, unit: unknown): string | null {
  if (units === 0) return value;
  if (unit === "unicode_code_points") return sliceUnits(value, units);
  if (unit === "utf8_bytes") return byteSuffix(value, units);
  return null;
}

function unitLength(value: string | Uint8Array, unit: TrustedExtractionRecord["source_extent"]["unit"]): number | null {
  if (unit === "utf8_bytes") return typeof value === "string" ? Buffer.byteLength(value, "utf8") : value.byteLength;
  if (unit === "unicode_code_points") {
    const text = typeof value === "string" ? value : Buffer.from(value).toString("utf8");
    return Array.from(text).length;
  }
  return null;
}

interface ReassembledSource {
  chunks: ChunkRecord[];
  content: string;
}

function reassemble(chunks: ChunkRecord[]): ReassembledSource | null {
  if (chunks.length === 0) return null;
  const ordered = [...chunks].sort((left, right) => Number(left.sequence.index) - Number(right.sequence.index));
  const first = ordered[0];
  if (first === undefined) return null;
  const count = ordered.length;
  const unit = first.source_extent.unit;
  if (first.source_extent.start !== 0 || first.sequence.previous_chunk_id !== null) return null;
  let content = "";
  let previous: ChunkRecord | null = null;
  for (const [index, chunk] of ordered.entries()) {
    if (chunk.sequence.index !== index || chunk.sequence.count_state !== "known" || chunk.sequence.count !== count) return null;
    if (chunk.source_extent.unit !== unit || chunk.source_extent.total_state !== "known") return null;
    if (chunk.source_extent.total !== first.source_extent.total || chunk.content_hash !== first.content_hash) return null;
    if (chunk.truncation.source_completeness !== "complete" || chunk.truncation.reassembly_status !== "complete") return null;
    if (!parserIsComplete(chunk) || chunk.chunk_content_hash !== sha256(chunk.content)) return null;
    if (previous === null) {
      if (chunk.overlap.prefix_length !== 0 || chunk.sequence.previous_chunk_id !== null) return null;
      content = chunk.content;
    } else {
      if (previous.sequence.next_chunk_id !== chunk.chunk_id || chunk.sequence.previous_chunk_id !== previous.chunk_id) return null;
      const overlap = Number(previous.source_extent.end_exclusive) - Number(chunk.source_extent.start);
      if (!Number.isInteger(overlap) || overlap < 0) return null;
      if (previous.overlap.suffix_length !== overlap || chunk.overlap.prefix_length !== overlap) return null;
      const suffix = withoutPrefix(chunk.content, overlap, unit);
      if (suffix === null) return null;
      const overlapText = chunk.content.slice(0, chunk.content.length - suffix.length);
      if (!previous.content.endsWith(overlapText)) return null;
      if (overlap > 0 && (previous.overlap.suffix_hash !== sha256(overlapText) || chunk.overlap.prefix_hash !== sha256(overlapText))) return null;
      content += suffix;
    }
    previous = chunk;
  }
  if (previous === null || previous.sequence.next_chunk_id !== null) return null;
  if (previous.source_extent.end_exclusive !== first.source_extent.total || first.content_hash !== sha256(content)) return null;
  return { chunks: ordered, content };
}

function extractionRecord(
  chunk: ChunkRecord,
  sourceLocator: Locator,
  scope: SourceBinding["binding_scope"],
  excerpt: string | Uint8Array,
): TrustedExtractionRecord | null {
  const parser = parserIdentity(chunk);
  const sourceExtent = extent(chunk);
  if (parser === null || sourceExtent === null) return null;
  return {
    source_item_id: chunk.source_item_id,
    source_snapshot_id: chunk.source_snapshot_id,
    snapshot_registry_hash: chunk.snapshot_registry_hash,
    content_hash: chunk.content_hash,
    chunk_ids: [chunk.chunk_id],
    locator: sourceLocator,
    parser_identity: parser,
    binding_scope: scope,
    excerpt,
    source_extent: sourceExtent,
  };
}

/** Build immutable extraction records from an orchestrator-validated request envelope. */
export function trustedExtractionsFromRequest(request: unknown): TrustedExtractionRecord[] {
  const value = record(request);
  const chunks = Array.isArray(value?.input_chunks) ? value.input_chunks.filter(isChunk) : [];
  const extractions: TrustedExtractionRecord[] = [];
  for (const chunk of chunks) {
    const chunkLocator = locator(chunk.locator);
    const stableLocator = locator(chunk.stable_sub_item.locator);
    if (chunkLocator === null) continue;
    const scope: SourceBinding["binding_scope"] = fullSingleChunk(chunk) ? "whole_source" : "content_excerpt";
    const contentRecord = extractionRecord(chunk, chunkLocator, scope, chunk.content);
    if (contentRecord !== null) extractions.push(contentRecord);
    if (stableLocator !== null && !equalJson(stableLocator, chunkLocator)) {
      const stableRecord = extractionRecord(chunk, stableLocator, scope, chunk.content);
      if (stableRecord !== null) extractions.push(stableRecord);
    }
    const metadataRecord = extractionRecord(chunk, chunkLocator, "parser_metadata", canonicalJson(chunk.parser_result));
    if (metadataRecord !== null) extractions.push(metadataRecord);
  }

  const groups = new Map<string, ChunkRecord[]>();
  for (const chunk of chunks) {
    const key = `${chunk.source_snapshot_id}\u0000${chunk.source_item_id}\u0000${chunk.content_hash}`;
    const group = groups.get(key) ?? [];
    group.push(chunk);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const source = reassemble(group);
    const first = source?.chunks[0];
    if (source === null || first === undefined) continue;
    const parser = parserIdentity(first);
    const firstLocator = locator(first.locator);
    if (parser === null || firstLocator === null || firstLocator.locator_type !== "whole_source") continue;
    extractions.push({
      source_item_id: first.source_item_id,
      source_snapshot_id: first.source_snapshot_id,
      snapshot_registry_hash: first.snapshot_registry_hash,
      content_hash: first.content_hash,
      chunk_ids: source.chunks.map((chunk) => chunk.chunk_id),
      locator: firstLocator,
      parser_identity: parser,
      binding_scope: "whole_source",
      excerpt: source.content,
      source_extent: {
        unit: first.source_extent.unit as TrustedExtractionRecord["source_extent"]["unit"],
        start: 0,
        end_exclusive: Number(first.source_extent.total),
      },
    });
  }
  return extractions;
}

function bindingMatchesExtraction(binding: SourceBinding, extraction: TrustedExtractionRecord): boolean {
  return binding.source_item_id === extraction.source_item_id
    && binding.source_snapshot_id === extraction.source_snapshot_id
    && binding.snapshot_registry_hash === extraction.snapshot_registry_hash
    && binding.content_hash === extraction.content_hash
    && binding.binding_scope === extraction.binding_scope
    && equalJson(binding.chunk_ids, extraction.chunk_ids)
    && equalJson(binding.locator, extraction.locator)
    && equalJson(binding.parser_identity, extraction.parser_identity)
    && binding.excerpt_hash === sha256(extraction.excerpt);
}

function validateTrustedRecord(recordValue: TrustedExtractionRecord, index: number): GenerationIssue[] {
  const issues: GenerationIssue[] = [];
  const path = `/trusted_extractions/${index}`;
  if (recordValue.chunk_ids.length === 0 || new Set(recordValue.chunk_ids).size !== recordValue.chunk_ids.length) {
    issues.push(issue("RP-SOURCE-001.trusted-record", "Trusted extraction chunk_ids must be a non-empty unique ordered list.", `${path}/chunk_ids`));
  }
  const extentLength = recordValue.source_extent.end_exclusive - recordValue.source_extent.start;
  if (!Number.isInteger(extentLength) || extentLength <= 0) {
    issues.push(issue("RP-SOURCE-001.trusted-record", "Trusted extraction extent must be a positive half-open span.", `${path}/source_extent`));
  }
  const measured = recordValue.binding_scope === "parser_metadata"
    ? null
    : unitLength(recordValue.excerpt, recordValue.source_extent.unit);
  if (measured !== null && measured !== extentLength) {
    issues.push(issue(
      "RP-SOURCE-001.trusted-record",
      `Trusted extraction span length ${extentLength} does not match its ${measured}-unit excerpt.`,
      `${path}/source_extent`,
    ));
  }
  return issues;
}

export function reconcileSourceBindings(
  bindingsValue: unknown,
  trustedExtractions: readonly TrustedExtractionRecord[],
  path: string,
): GenerationIssue[] {
  const issues = trustedExtractions.flatMap(validateTrustedRecord);
  const bindings = Array.isArray(bindingsValue) ? bindingsValue : [];
  for (const [index, bindingValue] of bindings.entries()) {
    const binding = record(bindingValue) as unknown as SourceBinding | null;
    if (binding === null) {
      issues.push(issue("RP-SOURCE-001.binding", "Source binding is not an object.", `${path}/${index}`));
      continue;
    }
    if (!trustedExtractions.some((extraction) => bindingMatchesExtraction(binding, extraction))) {
      issues.push(issue(
        "RP-SOURCE-001.reconciliation",
        "Source binding does not match any trusted source/snapshot/registry/content/chunk/locator/parser identity and recomputed excerpt hash tuple.",
        `${path}/${index}`,
      ));
    }
  }
  return issues;
}

export function validateRequestChunkIntegrity(request: unknown): GenerationIssue[] {
  const value = record(request);
  const chunks = Array.isArray(value?.input_chunks) ? value.input_chunks.filter(isChunk) : [];
  const issues: GenerationIssue[] = [];
  const ids = new Set<string>();
  for (const [index, chunk] of chunks.entries()) {
    if (ids.has(chunk.chunk_id)) issues.push(issue("RP-COMPLETE-001.duplicate-unit", `Requested chunk ${chunk.chunk_id} is repeated.`, `/input_chunks/${index}/chunk_id`));
    ids.add(chunk.chunk_id);
    if (chunk.chunk_content_hash !== sha256(chunk.content)) {
      issues.push(issue("RP-SOURCE-001.chunk-hash", "chunk_content_hash does not match the supplied chunk bytes.", `/input_chunks/${index}/chunk_content_hash`));
    }
    const parser = parserIdentity(chunk);
    const chunkLocator = locator(chunk.locator);
    if (parser === null || chunkLocator === null) continue;
    if (chunkLocator.parser_name !== undefined && chunkLocator.parser_name !== null && chunkLocator.parser_name !== parser.parser_name) {
      issues.push(issue("RP-SOURCE-001.parser", "Chunk locator parser_name differs from parser_result identity.", `/input_chunks/${index}/locator/parser_name`));
    }
    if (chunkLocator.parser_version !== undefined && chunkLocator.parser_version !== null && chunkLocator.parser_version !== parser.parser_version) {
      issues.push(issue("RP-SOURCE-001.parser", "Chunk locator parser_version differs from parser_result identity.", `/input_chunks/${index}/locator/parser_version`));
    }
  }
  return issues;
}

export function requestSourcesAreComplete(request: unknown): boolean {
  const value = record(request);
  const chunks = Array.isArray(value?.input_chunks) ? value.input_chunks.filter(isChunk) : [];
  if (chunks.length === 0) return true;
  const groups = new Map<string, ChunkRecord[]>();
  for (const chunk of chunks) {
    const key = `${chunk.source_snapshot_id}\u0000${chunk.source_item_id}\u0000${chunk.content_hash}`;
    const group = groups.get(key) ?? [];
    group.push(chunk);
    groups.set(key, group);
  }
  return [...groups.values()].every((group) => group.length === 1 ? fullSingleChunk(group[0]!) : reassemble(group) !== null);
}

export function sourceBindingKey(binding: unknown): string | null {
  try {
    return canonicalJson(binding);
  } catch {
    return null;
  }
}

export function parserMetadataExcerptHash(parserResult: unknown): string {
  return sha256CanonicalJson(parserResult);
}
