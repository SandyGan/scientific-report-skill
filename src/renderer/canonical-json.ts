import { createHash } from "node:crypto";

import { RendererError, type JsonObject, type JsonValue } from "./types.js";

/**
 * Convert an arbitrary value to inert, prototype-free JSON data. Accessors,
 * cycles, sparse arrays, non-finite numbers, custom prototypes, and non-JSON
 * values are rejected rather than being silently coerced by JSON.stringify.
 */
export function normalizeJson(value: unknown, path = "$"): JsonValue {
  return normalizeJsonValue(value, path, new Set<object>());
}

function normalizeJsonValue(value: unknown, path: string, ancestors: Set<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RendererError("NON_JSON_NUMBER", `Non-finite number at ${path}.`, path);
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value !== "object") {
    throw new RendererError("NON_JSON_VALUE", `Unsupported ${typeof value} value at ${path}.`, path);
  }
  if (ancestors.has(value)) {
    throw new RendererError("CYCLIC_JSON_VALUE", `Cyclic value at ${path}.`, path);
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value);
      for (const key of ownKeys) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)) {
          throw new RendererError("NON_JSON_ARRAY_PROPERTY", `Non-index array property at ${path}.`, path);
        }
      }

      const normalized: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new RendererError("SPARSE_ARRAY", `Sparse array element at ${path}/${index}.`, `${path}/${index}`);
        }
        normalized.push(normalizeJsonValue(value[index], `${path}/${index}`, ancestors));
      }
      return normalized;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new RendererError("CUSTOM_PROTOTYPE", `Custom object prototype at ${path}.`, path);
    }

    const result: JsonObject = Object.create(null) as JsonObject;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) {
      throw new RendererError("SYMBOL_KEY", `Symbol-keyed property at ${path}.`, path);
    }
    const keys = (ownKeys as string[]).sort(compareCodeUnits);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined) continue;
      if (!("value" in descriptor)) {
        throw new RendererError("ACCESSOR_PROPERTY", `Accessor property at ${path}/${escapePointer(key)}.`, path);
      }
      if (!descriptor.enumerable) {
        throw new RendererError("NON_ENUMERABLE_PROPERTY", `Non-enumerable property at ${path}/${escapePointer(key)}.`, path);
      }
      result[key] = normalizeJsonValue(descriptor.value, `${path}/${escapePointer(key)}`, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

export function normalizeJsonObject(value: unknown, path = "$"): JsonObject {
  const normalized = normalizeJson(value, path);
  if (!isJsonObject(normalized)) {
    throw new RendererError("EXPECTED_JSON_OBJECT", `Expected a JSON object at ${path}.`, path);
  }
  return normalized;
}

/** Deterministic JSON with recursively sorted object keys and preserved array order. */
export function stableStringify(value: JsonValue, indentation = 0): string {
  if (!Number.isInteger(indentation) || indentation < 0 || indentation > 10) {
    throw new RendererError("INVALID_INDENTATION", "JSON indentation must be an integer from 0 through 10.");
  }
  return serialize(value, indentation, 0);
}

/** Exact canonical public-payload representation used for hashing and writing. */
export function serializePublicPayload(payload: JsonObject): string {
  return stableStringify(payload, 0);
}

export function sha256Text(text: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

export function isJsonObject(value: JsonValue | unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serialize(value: JsonValue, indentation: number, depth: number): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }

  const gap = indentation === 0 ? "" : " ".repeat(indentation);
  const currentIndent = gap.repeat(depth);
  const childIndent = gap.repeat(depth + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const members = value.map((entry) => serialize(entry, indentation, depth + 1));
    if (indentation === 0) return `[${members.join(",")}]`;
    return `[\n${childIndent}${members.join(`,\n${childIndent}`)}\n${currentIndent}]`;
  }

  const keys = Object.keys(value).sort(compareCodeUnits);
  if (keys.length === 0) return "{}";
  const members = keys.map((key) => `${JSON.stringify(key)}:${indentation === 0 ? "" : " "}${serialize(value[key] as JsonValue, indentation, depth + 1)}`);
  if (indentation === 0) return `{${members.join(",")}}`;
  return `{\n${childIndent}${members.join(`,\n${childIndent}`)}\n${currentIndent}}`;
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
