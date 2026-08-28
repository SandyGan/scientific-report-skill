export type AbsolutePathKind = "posix" | "windows_drive" | "windows_unc" | "file_url";

export interface AbsolutePathContext {
  /** Property name containing the text, when known. */
  fieldName?: string;
  /** RFC 6901 pointer to the property, when known. */
  instancePointer?: string;
  /** Locator discriminator for SourceBinding.locator.value. */
  locatorType?: string;
}

export interface AbsolutePathMatch {
  kind: AbsolutePathKind;
  value: string;
  index: number;
}

const JSON_POINTER_FIELD = /(?:^|_)(?:json_)?pointer(?:_|$)|^(?:instance|schema)_pointer$|^intrinsic_metadata_changes$/u;
const JSON_POINTER = /^(?:\/(?:[^~/]|~0|~1)*)*$/u;
const FILE_URL = /\bfile:\/\/(?:localhost\/)?[^\s"'<>]*/giu;
const WINDOWS_DRIVE = /(?:^|[\s"'=(\[,;])([A-Za-z]:[\\/](?:[^\s"'<>|?*\u0000]+[\\/]?)+)/gmu;
const WINDOWS_UNC = /(?:^|[\s"'=(\[,;])((?:\\\\|\/\/)[^\\/\s"'<>|?*\u0000]+[\\/][^\s"'<>|?*\u0000]+(?:[\\/][^\s"'<>|?*\u0000]+)*)/gmu;
const POSIX_PATH = /(?:^|[\s"'=(\[,;])((?:\/(?!\/)(?:[^/\s"'<>\u0000]+\/)+[^/\s"'<>\u0000]*|\/(?!\/)[^/\s"'<>\u0000]+))/gmu;

function isPointerContext(value: string, context: AbsolutePathContext): boolean {
  if (context.locatorType === "json_pointer") return JSON_POINTER.test(value);
  if (context.fieldName !== undefined && JSON_POINTER_FIELD.test(context.fieldName)) return JSON_POINTER.test(value);
  return false;
}

function collect(expression: RegExp, text: string, kind: AbsolutePathKind, capture = 0): AbsolutePathMatch[] {
  const result: AbsolutePathMatch[] = [];
  expression.lastIndex = 0;
  for (let match = expression.exec(text); match !== null; match = expression.exec(text)) {
    const value = match[capture] ?? match[0];
    const offset = match[0].lastIndexOf(value);
    result.push({ kind, value, index: match.index + Math.max(offset, 0) });
    if (match[0].length === 0) expression.lastIndex += 1;
  }
  return result;
}

/**
 * Locate host-local absolute filesystem references without assuming a fixed set
 * of POSIX roots. URI data and RFC 6901 pointer fields are handled explicitly;
 * file URLs are always filesystem references.
 */
export function findAbsoluteFilesystemReferences(
  text: string,
  context: AbsolutePathContext = {},
): AbsolutePathMatch[] {
  if (isPointerContext(text, context)) return [];

  const matches = [
    ...collect(FILE_URL, text, "file_url"),
    ...collect(WINDOWS_DRIVE, text, "windows_drive", 1),
    ...collect(WINDOWS_UNC, text, "windows_unc", 1),
    ...collect(POSIX_PATH, text, "posix", 1),
  ];

  // A URL's authority/path is not a host-local path. file: URLs were already
  // classified above and deliberately remain findings.
  const remoteRanges = [...text.matchAll(/\b(?:https?|ftp):\/\/[^\s"'<>]*/giu)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  const deduplicated = new Map<string, AbsolutePathMatch>();
  for (const match of matches) {
    if (match.kind !== "file_url" && remoteRanges.some((range) => match.index >= range.start && match.index < range.end)) {
      continue;
    }
    deduplicated.set(`${match.kind}\u0000${match.index}\u0000${match.value}`, match);
  }
  return [...deduplicated.values()].sort((left, right) => left.index - right.index || left.kind.localeCompare(right.kind));
}

export function containsAbsoluteFilesystemReference(
  text: string,
  context: AbsolutePathContext = {},
): boolean {
  return findAbsoluteFilesystemReferences(text, context).length > 0;
}
