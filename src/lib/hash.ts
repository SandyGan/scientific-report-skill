import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import { canonicalJsonBytes } from "./json.js";

export type Sha256Hash = `sha256:${string}`;
export const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export function sha256(data: string | Uint8Array): Sha256Hash {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

export function sha256CanonicalJson(value: unknown): Sha256Hash {
  return sha256(canonicalJsonBytes(value));
}

export const hashJson = sha256CanonicalJson;
export const hashBytes = sha256;

export function isSha256Hash(value: unknown): value is Sha256Hash {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

export interface FileHash {
  hash: Sha256Hash;
  byteSize: number;
}

/** Hash the exact bytes of a regular file. */
export async function sha256File(filePath: string): Promise<FileHash> {
  const metadata = await stat(filePath);
  if (!metadata.isFile()) throw new Error(`Cannot hash non-file path: ${filePath}`);
  const bytes = await readFile(filePath);
  return { hash: sha256(bytes), byteSize: bytes.byteLength };
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await listFiles(path)));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

/**
 * Hash a directory tree with path boundaries included. File order is lexical;
 * content and relative names both affect the result.
 */
export async function sha256Directory(
  directory: string,
  include: (relativePath: string) => boolean = () => true,
): Promise<Sha256Hash> {
  const hash = createHash("sha256");
  for (const path of await listFiles(directory)) {
    const relativePath = relative(directory, path).replaceAll("\\", "/");
    if (!include(relativePath)) continue;
    const bytes = await readFile(path);
    const pathBytes = Buffer.from(relativePath, "utf8");
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(pathBytes.byteLength));
    hash.update(length);
    hash.update(pathBytes);
    length.writeBigUInt64BE(BigInt(bytes.byteLength));
    hash.update(length);
    hash.update(bytes);
  }
  return `sha256:${hash.digest("hex")}`;
}
