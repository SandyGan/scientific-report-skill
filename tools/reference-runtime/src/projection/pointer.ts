import type { JsonObject, JsonValue } from "../lib/json.js";

export function parsePointer(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new TypeError(`Invalid RFC 6901 JSON pointer: ${pointer}`);
  return pointer.slice(1).split("/").map((token) => {
    if (/~(?:[^01]|$)/u.test(token)) throw new TypeError(`Invalid RFC 6901 escape in pointer: ${pointer}`);
    return token.replaceAll("~1", "/").replaceAll("~0", "~");
  });
}

function arrayIndex(token: string, length: number, allowEnd: boolean): number {
  if (allowEnd && token === "-") return length;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) throw new TypeError(`Invalid array index token ${JSON.stringify(token)}`);
  const index = Number(token);
  if (!Number.isSafeInteger(index) || index < 0 || index >= length + (allowEnd ? 1 : 0)) {
    throw new RangeError(`Array index ${token} is outside the target array`);
  }
  return index;
}

export function pointerParentPath(pointer: string): string {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) throw new Error("The report root has no parent pointer");
  return tokens.length === 1
    ? ""
    : `/${tokens.slice(0, -1).map((token) => token.replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

/**
 * Return a removal plan that is safe for RFC 6901 pointers into arrays.
 * At every shared array ancestor, higher original indexes are applied first so
 * an earlier splice cannot move a later requested identity. Deeper removals
 * are applied first only for the otherwise-invalid ancestor-prefix case.
 */
export function sortRemovalsForApplication<T>(
  source: JsonValue,
  removals: readonly T[],
  pointerOf: (removal: T) => string,
): T[] {
  const tokensByRemoval = new Map<T, string[]>();
  const tokens = (removal: T): string[] => {
    const cached = tokensByRemoval.get(removal);
    if (cached !== undefined) return cached;
    const parsed = parsePointer(pointerOf(removal));
    tokensByRemoval.set(removal, parsed);
    return parsed;
  };

  return [...removals].sort((left, right) => {
    const leftTokens = tokens(left);
    const rightTokens = tokens(right);
    const sharedLength = Math.min(leftTokens.length, rightTokens.length);
    let parent: JsonValue = source;
    for (let index = 0; index < sharedLength; index += 1) {
      const leftToken = leftTokens[index]!;
      const rightToken = rightTokens[index]!;
      if (leftToken !== rightToken) {
        if (Array.isArray(parent)) {
          const leftIndex = Number(leftToken);
          const rightIndex = Number(rightToken);
          if (Number.isSafeInteger(leftIndex) && Number.isSafeInteger(rightIndex)) {
            return rightIndex - leftIndex;
          }
        }
        return rightToken.localeCompare(leftToken, "en");
      }
      if (Array.isArray(parent)) {
        const childIndex = Number(leftToken);
        if (!Number.isSafeInteger(childIndex) || childIndex < 0 || childIndex >= parent.length) break;
        parent = parent[childIndex]!;
      } else if (parent !== null && typeof parent === "object" && Object.hasOwn(parent, leftToken)) {
        parent = parent[leftToken]!;
      } else break;
    }
    return rightTokens.length - leftTokens.length;
  });
}

export function pointerGet(root: JsonValue, pointer: string): JsonValue {
  let current: JsonValue = root;
  for (const token of parsePointer(pointer)) {
    if (Array.isArray(current)) {
      current = current[arrayIndex(token, current.length, false)]!;
    } else if (current !== null && typeof current === "object") {
      if (!Object.prototype.hasOwnProperty.call(current, token)) throw new Error(`Pointer does not resolve: ${pointer}`);
      current = current[token]!;
    } else {
      throw new Error(`Pointer traverses a scalar: ${pointer}`);
    }
  }
  return current;
}

export function pointerSet(root: JsonValue, pointer: string, value: JsonValue): JsonValue {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) return value;
  let current: JsonValue = root;
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(current)) current = current[arrayIndex(token, current.length, false)]!;
    else if (current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, token)) current = current[token]!;
    else throw new Error(`Pointer does not resolve: ${pointer}`);
  }
  const last = tokens.at(-1)!;
  if (Array.isArray(current)) current[arrayIndex(last, current.length, false)] = value;
  else if (current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, last)) current[last] = value;
  else throw new Error(`Pointer does not resolve: ${pointer}`);
  return root;
}

export function pointerRemove(root: JsonValue, pointer: string): { root: JsonValue; removed: JsonValue } {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) throw new Error("The report root cannot be omitted by a field action");
  let current: JsonValue = root;
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(current)) current = current[arrayIndex(token, current.length, false)]!;
    else if (current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, token)) current = current[token]!;
    else throw new Error(`Pointer does not resolve: ${pointer}`);
  }
  const last = tokens.at(-1)!;
  if (Array.isArray(current)) {
    const [removed] = current.splice(arrayIndex(last, current.length, false), 1);
    return { root, removed: removed! };
  }
  if (current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, last)) {
    const removed = current[last]!;
    delete current[last];
    return { root, removed };
  }
  throw new Error(`Pointer does not resolve: ${pointer}`);
}

export function pointerParent(root: JsonValue, pointer: string): JsonObject | JsonValue[] | null {
  if (parsePointer(pointer).length === 0) return null;
  const value = pointerGet(root, pointerParentPath(pointer));
  return Array.isArray(value) || (value !== null && typeof value === "object") ? value : null;
}

export function nearestObjectId(root: JsonValue, pointer: string, reportId: string): string {
  const tokens = parsePointer(pointer);
  for (let length = tokens.length; length >= 0; length -= 1) {
    const candidatePointer = length === 0
      ? ""
      : `/${tokens.slice(0, length).map((token) => token.replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
    let candidate: JsonValue;
    try {
      candidate = pointerGet(root, candidatePointer);
    } catch {
      continue;
    }
    if (candidate !== null && typeof candidate === "object" && !Array.isArray(candidate)) {
      const ids = Object.entries(candidate)
        .filter(([key, value]) => (key === "id" || key.endsWith("_id")) && typeof value === "string")
        .sort(([left], [right]) => left.localeCompare(right, "en"));
      if (ids[0] !== undefined) return ids[0][1] as string;
    }
  }
  return reportId;
}
