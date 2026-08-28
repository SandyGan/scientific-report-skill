import { describe, expect, it } from "vitest";

import { canonicalJson, CanonicalJsonError, deterministicJson } from "./json.js";
import { sha256CanonicalJson } from "./hash.js";

describe("canonical JSON helpers", () => {
  it("sorts object keys recursively while preserving array order", () => {
    const left = { z: [3, { b: true, a: null }], a: "value" };
    const right = { a: "value", z: [3, { a: null, b: true }] };

    expect(canonicalJson(left)).toBe('{"a":"value","z":[3,{"a":null,"b":true}]}');
    expect(canonicalJson(right)).toBe(canonicalJson(left));
    expect(sha256CanonicalJson(right)).toBe(sha256CanonicalJson(left));
  });

  it("retains array order in the digest", () => {
    expect(sha256CanonicalJson({ values: [1, 2] })).not.toBe(
      sha256CanonicalJson({ values: [2, 1] }),
    );
  });

  it("rejects values JSON would otherwise coerce or ignore", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(CanonicalJsonError);
    expect(() => canonicalJson({ value: undefined })).toThrow(CanonicalJsonError);
    expect(() => canonicalJson(new Date())).toThrow(CanonicalJsonError);

    const sparse = new Array(1);
    expect(() => canonicalJson(sparse)).toThrow(CanonicalJsonError);
  });

  it("pretty-prints deterministically with one terminal newline", () => {
    expect(deterministicJson({ b: 2, a: 1 }, 2)).toBe('{\n  "a": 1,\n  "b": 2\n}\n');
  });
});
