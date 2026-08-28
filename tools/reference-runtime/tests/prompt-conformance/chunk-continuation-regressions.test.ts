import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { sha256, sha256CanonicalJson } from "../../src/lib/hash.js";
import { loadSchemas } from "../../src/lib/schema.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const REQUEST_SCHEMA_ID = "https://schemas.report-prompt.org/v1/generation-request.schema.json";
const RESPONSE_SCHEMA_ID = "https://schemas.report-prompt.org/v1/generation-response.schema.json";
const HASH_A = `sha256:${"a".repeat(64)}`;
const NOW = "2026-05-13T00:00:00Z";

type JsonRecord = Record<string, any>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function contractExample(name: string): Promise<JsonRecord> {
  return JSON.parse(await readFile(join(PROJECT_ROOT, "prompts", "contracts", name), "utf8")) as JsonRecord;
}

function chunkFixture(options: {
  source: string;
  content: string;
  chunkId: string;
  index: number;
  count: number;
  start: number;
  end: number;
  prefixLength: number;
  suffixLength: number;
  previousChunkId: string | null;
  nextChunkId: string | null;
  boundary: "whole" | "start" | "middle" | "end";
}): JsonRecord {
  const prefix = options.content.slice(0, options.prefixLength);
  const suffix = options.suffixLength === 0 ? "" : options.content.slice(-options.suffixLength);
  return {
    chunk_id: options.chunkId,
    source_item_id: "source:boundary-adversary",
    source_snapshot_id: "snapshot:boundary-adversary",
    snapshot_registry_hash: HASH_A,
    content_hash: sha256(options.source),
    chunk_content_hash: sha256(options.content),
    locator: {
      locator_type: "line_range",
      value: `${options.start}-${options.end}`,
      parser_name: "boundary-text-parser",
      parser_version: "1.0.0",
    },
    source_extent: {
      unit: "unicode_code_points",
      start: options.start,
      end_exclusive: options.end,
      total_state: "known",
      total: options.source.length,
    },
    sequence: {
      index: options.index,
      count_state: "known",
      count: options.count,
      previous_chunk_id: options.previousChunkId,
      next_chunk_id: options.nextChunkId,
    },
    overlap: {
      unit: "unicode_code_points",
      prefix_length: options.prefixLength,
      suffix_length: options.suffixLength,
      prefix_hash: options.prefixLength === 0 ? null : sha256(prefix),
      suffix_hash: options.suffixLength === 0 ? null : sha256(suffix),
    },
    truncation: {
      source_completeness: "complete",
      chunk_boundary: options.boundary,
      reassembly_status: "complete",
      omitted_before: 0,
      omitted_after: 0,
    },
    parser_result: {
      parser_result_id: `parser-result:${options.chunkId}`,
      parser_name: "boundary-text-parser",
      parser_version: "1.0.0",
      configuration_hash: sha256("boundary parser config"),
      status: "success",
      quality: "verified_lossless",
      transformations_applied: [],
      warnings: [],
    },
    stable_sub_item: {
      sub_item_id: `subitem:${options.chunkId}`,
      index: options.index,
      count: options.count,
      locator: {
        locator_type: "line_range",
        value: `${options.start}-${options.end}`,
        parser_name: "boundary-text-parser",
        parser_version: "1.0.0",
      },
    },
    content: options.content,
    content_media_type: "text/plain",
  };
}

function reassembleCompleteChunks(chunks: JsonRecord[]): { complete: boolean; content: string | null; reason: string | null } {
  if (chunks.length === 0) return { complete: false, content: null, reason: "empty" };
  const ordered = [...chunks].sort((left, right) => left.sequence.index - right.sequence.index);
  const first = ordered[0];
  if (first === undefined) return { complete: false, content: null, reason: "empty" };
  const expectedCount = ordered.length;
  const sourceHash = first.content_hash;
  const total = first.source_extent.total;
  let content = "";
  let previous: JsonRecord | null = null;
  for (const [index, chunk] of ordered.entries()) {
    if (chunk.sequence.count_state !== "known" || chunk.sequence.count !== expectedCount || chunk.sequence.index !== index) {
      return { complete: false, content: null, reason: "sequence-unknown-or-inconsistent" };
    }
    if (chunk.source_extent.total_state !== "known" || chunk.source_extent.total !== total) {
      return { complete: false, content: null, reason: "extent-total-unknown-or-inconsistent" };
    }
    if (chunk.truncation.source_completeness !== "complete" || chunk.truncation.reassembly_status !== "complete") {
      return { complete: false, content: null, reason: "truncated-or-unreassembled" };
    }
    if (chunk.parser_result.status !== "success" || !["verified_lossless", "structured_lossless"].includes(chunk.parser_result.quality)) {
      return { complete: false, content: null, reason: "parser-not-complete" };
    }
    if (chunk.chunk_content_hash !== sha256(chunk.content) || chunk.content_hash !== sourceHash) {
      return { complete: false, content: null, reason: "content-hash-mismatch" };
    }
    if (previous === null) {
      if (chunk.source_extent.start !== 0 || chunk.overlap.prefix_length !== 0) return { complete: false, content: null, reason: "invalid-start" };
      content = chunk.content;
    } else {
      const overlap = previous.source_extent.end_exclusive - chunk.source_extent.start;
      if (overlap < 0) return { complete: false, content: null, reason: "gap" };
      if (overlap !== previous.overlap.suffix_length || overlap !== chunk.overlap.prefix_length) {
        return { complete: false, content: null, reason: "overlap-length-mismatch" };
      }
      const previousOverlap = overlap === 0 ? "" : previous.content.slice(-overlap);
      const currentOverlap = chunk.content.slice(0, overlap);
      if (previousOverlap !== currentOverlap) return { complete: false, content: null, reason: "overlap-content-mismatch" };
      if (overlap > 0 && (previous.overlap.suffix_hash !== sha256(previousOverlap) || chunk.overlap.prefix_hash !== sha256(currentOverlap))) {
        return { complete: false, content: null, reason: "overlap-hash-mismatch" };
      }
      content += chunk.content.slice(overlap);
    }
    previous = chunk;
  }
  if (previous?.source_extent.end_exclusive !== total || sha256(content) !== sourceHash) {
    return { complete: false, content: null, reason: "terminal-extent-or-source-hash-mismatch" };
  }
  return { complete: true, content, reason: null };
}

function completeResponseAllowed(request: JsonRecord, response: JsonRecord): boolean {
  if (response.continuation.state !== "complete") return true;
  const reassembly = reassembleCompleteChunks(request.input_chunks);
  return reassembly.complete && response.processed_unit_ids.every((id: string) =>
    request.input_chunks.some((chunk: JsonRecord) => chunk.chunk_id === id || chunk.stable_sub_item.sub_item_id === id),
  );
}

function verifiedResumeRequest(base: JsonRecord): JsonRecord {
  const request = clone(base);
  const token = "opaque.signed.cursor.fixture";
  const acceptedOperationIds = ["operation:prior-page"];
  const cursor = {
    token,
    token_hash: sha256(token),
    lineage_id: "lineage:fixture",
    page_index: 1,
    request_id: request.request_id,
    stage: request.stage,
    accepted_state_hash: request.accepted_state.state_hash,
    source_snapshot_set_hash: sha256CanonicalJson(request.source_universe.snapshot_references),
    prior_response_hash: sha256("prior response bytes"),
    accepted_operation_ids: acceptedOperationIds,
    operation_set_hash: sha256CanonicalJson(acceptedOperationIds),
    next_unit_id: request.input_chunks[0].chunk_id,
    nonce_usage_id: "nonce-use:fixture:1",
  };
  request.continuation = {
    state: "resume",
    cursor,
    prior_response_hash: cursor.prior_response_hash,
    accepted_operation_ids: acceptedOperationIds,
    orchestrator_verification: {
      status: "verified",
      verification_method: "signed_token",
      verifier_id: "orchestrator:example",
      verified_cursor_hash: cursor.token_hash,
      verified_at: NOW,
      expires_at: null,
    },
  };
  return request;
}

function continuationIsVerified(
  request: JsonRecord,
  options: { consumedNonces?: ReadonlySet<string>; currentOperationIds?: readonly string[] } = {},
): boolean {
  const continuation = request.continuation as JsonRecord;
  if (continuation.state === "initial") {
    return continuation.cursor === null
      && continuation.prior_response_hash === null
      && continuation.orchestrator_verification === null
      && continuation.accepted_operation_ids.length === 0;
  }
  const cursor = continuation.cursor as JsonRecord | null;
  const verification = continuation.orchestrator_verification as JsonRecord | null;
  if (cursor === null || verification === null || verification.status !== "verified") return false;
  if (cursor.token_hash !== sha256(cursor.token) || verification.verified_cursor_hash !== cursor.token_hash) return false;
  if (cursor.request_id !== request.request_id || cursor.stage !== request.stage) return false;
  if (cursor.accepted_state_hash !== request.accepted_state.state_hash) return false;
  if (cursor.source_snapshot_set_hash !== sha256CanonicalJson(request.source_universe.snapshot_references)) return false;
  if (cursor.prior_response_hash !== continuation.prior_response_hash) return false;
  if (sha256CanonicalJson(cursor.accepted_operation_ids) !== cursor.operation_set_hash) return false;
  if (sha256CanonicalJson(cursor.accepted_operation_ids) !== sha256CanonicalJson(continuation.accepted_operation_ids)) return false;
  if (!request.input_chunks.some((chunk: JsonRecord) =>
    chunk.chunk_id === cursor.next_unit_id || chunk.stable_sub_item.sub_item_id === cursor.next_unit_id,
  )) return false;
  if (options.consumedNonces?.has(cursor.nonce_usage_id) === true) return false;
  const accepted = new Set<string>(cursor.accepted_operation_ids);
  if ((options.currentOperationIds ?? []).some((id) => accepted.has(id))) return false;
  return true;
}

describe("chunk completeness and continuation lineage regressions", () => {
  it("reassembles a split immediately before a failed-control qualification exactly once and blocks unknown/truncated boundaries (F5)", async () => {
    const schemas = loadSchemas();
    const source = "No reporter signal was detected.\nThe positive control failed; the observation was excluded.";
    const split = source.indexOf("The positive control failed");
    const overlap = 5;
    const firstContent = source.slice(0, split);
    const secondContent = source.slice(split - overlap);
    const first = chunkFixture({
      source,
      content: firstContent,
      chunkId: "chunk:boundary:0",
      index: 0,
      count: 2,
      start: 0,
      end: split,
      prefixLength: 0,
      suffixLength: overlap,
      previousChunkId: null,
      nextChunkId: "chunk:boundary:1",
      boundary: "start",
    });
    const second = chunkFixture({
      source,
      content: secondContent,
      chunkId: "chunk:boundary:1",
      index: 1,
      count: 2,
      start: split - overlap,
      end: source.length,
      prefixLength: overlap,
      suffixLength: 0,
      previousChunkId: "chunk:boundary:0",
      nextChunkId: null,
      boundary: "end",
    });
    const request = await contractExample("request.example.json");
    request.input_chunks = [first, second];
    const validation = schemas.validate(REQUEST_SCHEMA_ID, request);
    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);

    const reassembled = reassembleCompleteChunks(request.input_chunks);
    expect(reassembled).toEqual({ complete: true, content: source, reason: null });
    expect(reassembled.content?.match(/The positive control failed/gu)).toHaveLength(1);
    expect(reassembled.content).toContain("No reporter signal was detected");
    expect(reassembled.content).toContain("the observation was excluded");

    const response = await contractExample("response.example.json");
    response.processed_unit_ids = ["chunk:boundary:0", "chunk:boundary:1"];
    expect(completeResponseAllowed(request, response)).toBe(true);

    const missingMetadata = clone(request);
    delete missingMetadata.input_chunks[1].truncation;
    expect(schemas.validate(REQUEST_SCHEMA_ID, missingMetadata).valid).toBe(false);

    const unknownCompleteness = clone(request);
    for (const chunk of unknownCompleteness.input_chunks as JsonRecord[]) {
      chunk.truncation.source_completeness = "unknown";
      chunk.truncation.reassembly_status = "unknown";
      chunk.truncation.omitted_before = null;
      chunk.truncation.omitted_after = null;
      chunk.source_extent.total_state = "unknown";
      chunk.source_extent.total = null;
    }
    expect(schemas.validate(REQUEST_SCHEMA_ID, unknownCompleteness).valid).toBe(true);
    expect(completeResponseAllowed(unknownCompleteness, response)).toBe(false);

    const upstreamTruncation = clone(request);
    upstreamTruncation.input_chunks[1].truncation.source_completeness = "truncated_end";
    upstreamTruncation.input_chunks[1].truncation.reassembly_status = "gap";
    upstreamTruncation.input_chunks[1].truncation.omitted_after = 12;
    expect(schemas.validate(REQUEST_SCHEMA_ID, upstreamTruncation).valid).toBe(true);
    expect(completeResponseAllowed(upstreamTruncation, response)).toBe(false);
  });

  it("fails closed unless resume lineage has trusted verification and rejects tampering, replay, mismatch, staleness, altered history, and duplicate operations (F6)", async () => {
    const schemas = loadSchemas();
    const initial = await contractExample("request.example.json");
    expect(continuationIsVerified(initial)).toBe(true);
    const resume = verifiedResumeRequest(initial);
    const validation = schemas.validate(REQUEST_SCHEMA_ID, resume);
    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
    expect(continuationIsVerified(resume)).toBe(true);

    const noVerification = clone(resume);
    noVerification.continuation.orchestrator_verification = null;
    expect(schemas.validate(REQUEST_SCHEMA_ID, noVerification).valid).toBe(false);
    expect(continuationIsVerified(noVerification)).toBe(false);

    const tampered = clone(resume);
    tampered.continuation.cursor.token += ".tampered";
    expect(continuationIsVerified(tampered)).toBe(false);

    const wrongRequest = clone(resume);
    wrongRequest.continuation.cursor.request_id = "request:other";
    expect(continuationIsVerified(wrongRequest)).toBe(false);

    const wrongStage = clone(resume);
    wrongStage.continuation.cursor.stage = "S1_source_inventory";
    expect(continuationIsVerified(wrongStage)).toBe(false);

    const staleState = clone(resume);
    staleState.accepted_state.state_hash = HASH_A;
    expect(continuationIsVerified(staleState)).toBe(false);

    const alteredPriorResponse = clone(resume);
    alteredPriorResponse.continuation.prior_response_hash = sha256("altered prior response bytes");
    expect(continuationIsVerified(alteredPriorResponse)).toBe(false);

    expect(continuationIsVerified(resume, { consumedNonces: new Set(["nonce-use:fixture:1"]) })).toBe(false);
    expect(continuationIsVerified(resume, { currentOperationIds: ["operation:prior-page"] })).toBe(false);

    const duplicateInsideCursor = clone(resume);
    duplicateInsideCursor.continuation.cursor.accepted_operation_ids.push("operation:prior-page");
    duplicateInsideCursor.continuation.accepted_operation_ids.push("operation:prior-page");
    expect(schemas.validate(REQUEST_SCHEMA_ID, duplicateInsideCursor).valid).toBe(false);
    expect(continuationIsVerified(duplicateInsideCursor)).toBe(false);
  });

  it("requires matching orchestrator verification on every truncated final response (F6)", async () => {
    const schemas = loadSchemas();
    const request = verifiedResumeRequest(await contractExample("request.example.json"));
    const response = await contractExample("response.example.json");
    response.continuation = {
      state: "truncated",
      omitted_unit_ids: [request.input_chunks[0].chunk_id],
      next_cursor: request.continuation.cursor,
      orchestrator_verification: request.continuation.orchestrator_verification,
    };
    expect(schemas.validate(RESPONSE_SCHEMA_ID, response).valid).toBe(true);

    const unverified = clone(response);
    unverified.continuation.orchestrator_verification = null;
    expect(schemas.validate(RESPONSE_SCHEMA_ID, unverified).valid).toBe(false);
  });
});
