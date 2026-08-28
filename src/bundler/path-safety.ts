import path from "node:path";

const WINDOWS_RESERVED_BASENAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "clock$",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

export type BundlePathErrorCode =
  | "EMPTY_PATH"
  | "ABSOLUTE_PATH"
  | "NON_POSIX_SEPARATOR"
  | "TRAVERSAL_PATH"
  | "NON_NORMALIZED_PATH"
  | "INVALID_PATH_CHARACTER"
  | "NON_PORTABLE_PATH"
  | "DUPLICATE_PATH"
  | "CASE_COLLISION";

export class BundlePathError extends Error {
  readonly code: BundlePathErrorCode;
  readonly candidate: string;
  readonly conflictingPath: string | null;

  constructor(
    code: BundlePathErrorCode,
    candidate: string,
    message: string,
    conflictingPath: string | null = null,
  ) {
    super(message);
    this.name = "BundlePathError";
    this.code = code;
    this.candidate = candidate;
    this.conflictingPath = conflictingPath;
  }
}

function assertSafeSegment(segment: string, candidate: string): void {
  if (segment === "." || segment === "..") {
    throw new BundlePathError(
      "TRAVERSAL_PATH",
      candidate,
      `Path must not contain '${segment}' components: ${JSON.stringify(candidate)}`,
    );
  }

  if (segment.length === 0) {
    throw new BundlePathError(
      "NON_NORMALIZED_PATH",
      candidate,
      `Path contains an empty component: ${JSON.stringify(candidate)}`,
    );
  }

  if (/^\s|\s$|\.$/u.test(segment)) {
    throw new BundlePathError(
      "NON_PORTABLE_PATH",
      candidate,
      `Path component must not start or end with whitespace or end with a dot: ${JSON.stringify(segment)}`,
    );
  }

  const basename = segment.split(".", 1)[0]?.toLowerCase();
  if (basename !== undefined && WINDOWS_RESERVED_BASENAMES.has(basename)) {
    throw new BundlePathError(
      "NON_PORTABLE_PATH",
      candidate,
      `Path component is reserved on common filesystems: ${JSON.stringify(segment)}`,
    );
  }

  // Encoded separators, NUL, and dot-components are ambiguous when a path is
  // later interpreted as a URL. Reject them instead of relying on a consumer's
  // decoding order.
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    throw new BundlePathError(
      "NON_PORTABLE_PATH",
      candidate,
      `Path component contains malformed percent encoding: ${JSON.stringify(segment)}`,
    );
  }
  if (
    decoded === "." ||
    decoded === ".." ||
    decoded.includes("/") ||
    decoded.includes("\\") ||
    decoded.includes("\0")
  ) {
    throw new BundlePathError(
      "TRAVERSAL_PATH",
      candidate,
      `Path component becomes unsafe after URL decoding: ${JSON.stringify(segment)}`,
    );
  }
}

/**
 * Return the canonical NFC, relative POSIX representation of a package path.
 * Unsafe paths are rejected rather than repaired. Callers accepting serialized
 * manifest paths should additionally require input === returned value.
 */
export function normalizeRelativePosixPath(candidate: string): string {
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new BundlePathError("EMPTY_PATH", String(candidate), "Package path must be a non-empty string.");
  }
  if (candidate.includes("\\")) {
    throw new BundlePathError(
      "NON_POSIX_SEPARATOR",
      candidate,
      `Package paths must use '/' separators, not backslashes: ${JSON.stringify(candidate)}`,
    );
  }
  if (
    candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /^[A-Za-z]:/u.test(candidate) ||
    candidate.includes(":")
  ) {
    throw new BundlePathError(
      "ABSOLUTE_PATH",
      candidate,
      `Package path must be relative and must not contain a drive or URI scheme: ${JSON.stringify(candidate)}`,
    );
  }
  if (/\p{Cc}|\p{Cf}/u.test(candidate)) {
    throw new BundlePathError(
      "INVALID_PATH_CHARACTER",
      candidate,
      `Package path contains a control or formatting character: ${JSON.stringify(candidate)}`,
    );
  }

  const segments = candidate.split("/");
  for (const segment of segments) {
    assertSafeSegment(segment, candidate);
  }

  const unicodeNormalized = candidate.normalize("NFC");
  const normalized = path.posix.normalize(unicodeNormalized);
  if (normalized === "." || normalized.startsWith("../") || normalized === "..") {
    throw new BundlePathError(
      "TRAVERSAL_PATH",
      candidate,
      `Package path escapes or resolves to the bundle root: ${JSON.stringify(candidate)}`,
    );
  }
  return normalized;
}

export function assertNormalizedRelativePosixPath(candidate: string): string {
  const normalized = normalizeRelativePosixPath(candidate);
  if (candidate !== normalized) {
    throw new BundlePathError(
      "NON_NORMALIZED_PATH",
      candidate,
      `Package path is not in canonical NFC POSIX form; use ${JSON.stringify(normalized)}.`,
    );
  }
  return normalized;
}

/** A portability key used only for collision detection, never as identity. */
export function portablePathKey(candidate: string): string {
  return assertNormalizedRelativePosixPath(candidate).normalize("NFC").toLowerCase();
}

export function assertUniquePortablePaths(paths: Iterable<string>): void {
  const exact = new Map<string, string>();
  const folded = new Map<string, string>();

  for (const candidate of paths) {
    const normalized = assertNormalizedRelativePosixPath(candidate);
    const existingExact = exact.get(normalized);
    if (existingExact !== undefined) {
      throw new BundlePathError(
        "DUPLICATE_PATH",
        candidate,
        `Duplicate normalized package path ${JSON.stringify(normalized)}.`,
        existingExact,
      );
    }
    exact.set(normalized, candidate);

    const key = normalized.normalize("NFC").toLowerCase();
    const existingFolded = folded.get(key);
    if (existingFolded !== undefined && existingFolded !== normalized) {
      throw new BundlePathError(
        "CASE_COLLISION",
        candidate,
        `Package paths collide on case-insensitive filesystems: ${JSON.stringify(existingFolded)} and ${JSON.stringify(normalized)}.`,
        existingFolded,
      );
    }
    folded.set(key, normalized);
  }
}

export function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
