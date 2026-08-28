import { describe, expect, it } from "vitest";

import { findAbsoluteFilesystemReferences } from "./absolute-path.js";

describe("generic absolute filesystem path detection", () => {
  it.each([
    ["/opt/acme/private/source.txt", "posix"],
    ["/mnt/research/run-01/output.bin", "posix"],
    ["/srv-uncommon/tenant/data.csv", "posix"],
    ["C:\\Users\\alice\\private.txt", "windows_drive"],
    ["D:/lab/results/run.json", "windows_drive"],
    ["\\\\server\\restricted-share\\run.log", "windows_unc"],
    ["file:///var/private/source.txt", "file_url"],
  ] as const)("detects %s as %s", (value, kind) => {
    expect(findAbsoluteFilesystemReferences(value)).toEqual([
      expect.objectContaining({ kind }),
    ]);
  });

  it("does not misclassify RFC 6901 pointers, remote URIs, or relative paths", () => {
    expect(findAbsoluteFilesystemReferences("/claims/0/evidence_edge_ids", {
      fieldName: "instance_pointer",
    })).toEqual([]);
    expect(findAbsoluteFilesystemReferences("/claims/0", {
      fieldName: "value",
      locatorType: "json_pointer",
    })).toEqual([]);
    expect(findAbsoluteFilesystemReferences("https://example.org/data/report.json")).toEqual([]);
    expect(findAbsoluteFilesystemReferences("sources/report.json")).toEqual([]);
  });
});
