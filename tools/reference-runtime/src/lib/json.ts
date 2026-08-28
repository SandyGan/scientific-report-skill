export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export class CanonicalJsonError extends TypeError {
  public readonly pointer: string;

  public constructor(message: string, pointer = "") {
    super(`${message}${pointer === "" ? "" : ` at ${pointer}`}`);
    this.name = "CanonicalJsonError";
    this.pointer = pointer;
  }
}

function escapePointerToken(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

function assertJsonValue(
  value: unknown,
  pointer: string,
  ancestors: Set<object>,
): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalJsonError("Non-finite numbers are not JSON values", pointer);
    }
    return;
  }

  if (typeof value !== "object") {
    throw new CanonicalJsonError(`Unsupported ${typeof value} value`, pointer);
  }

  if (ancestors.has(value)) {
    throw new CanonicalJsonError("Cyclic values cannot be canonicalized", pointer);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const key of Reflect.ownKeys(value)) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)) {
          throw new CanonicalJsonError("Arrays may contain only indexed JSON elements", pointer);
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
          throw new CanonicalJsonError("Array elements must be enumerable data properties", `${pointer}/${key}`);
        }
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new CanonicalJsonError("Sparse arrays are not canonical JSON", `${pointer}/${index}`);
        }
        assertJsonValue(value[index], `${pointer}/${index}`, ancestors);
      }
      return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalJsonError("Only plain objects can be canonicalized", pointer);
    }

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        throw new CanonicalJsonError("Symbol-keyed properties are not JSON", pointer);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new CanonicalJsonError("Accessor properties are not canonical JSON", `${pointer}/${escapePointerToken(key)}`);
      }
      if (!descriptor.enumerable) {
        throw new CanonicalJsonError("Non-enumerable properties are not canonical JSON", `${pointer}/${escapePointerToken(key)}`);
      }
      assertJsonValue(
        descriptor.value,
        `${pointer}/${escapePointerToken(key)}`,
        ancestors,
      );
    }
  } finally {
    ancestors.delete(value);
  }
}

function serializeCanonical(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Object.is(value, -0) ? "0" : JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serializeCanonical).join(",")}]`;

  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serializeCanonical(value[key]!)}`);
  return `{${entries.join(",")}}`;
}

/**
 * Serialize JSON with recursively sorted object keys and no insignificant
 * whitespace. Arrays retain their declared order. Values outside the JSON data
 * model, cycles, sparse arrays, and non-finite numbers are rejected rather
 * than silently coerced.
 */
export function canonicalJson(value: unknown): string {
  assertJsonValue(value, "", new Set<object>());
  return serializeCanonical(value);
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return Buffer.from(canonicalJson(value), "utf8");
}

export const canonicalizeJson = canonicalJson;
export const stableStringify = canonicalJson;

/** A deterministic pretty-printer for human-facing JSON files. */
export function deterministicJson(value: unknown, indent = 2): string {
  if (!Number.isInteger(indent) || indent < 0 || indent > 10) {
    throw new RangeError("indent must be an integer from 0 through 10");
  }
  assertJsonValue(value, "", new Set<object>());

  function sortRecursively(item: JsonValue): JsonValue {
    if (Array.isArray(item)) return item.map(sortRecursively);
    if (item === null || typeof item !== "object") return item;
    const sorted: JsonObject = {};
    for (const key of Object.keys(item).sort()) sorted[key] = sortRecursively(item[key]!);
    return sorted;
  }

  return `${JSON.stringify(sortRecursively(value), null, indent)}\n`;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseJson(text: string, source = "JSON input"): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SyntaxError(`Unable to parse ${source}: ${detail}`);
  }
  assertJsonValue(parsed, "", new Set<object>());
  return parsed;
}
