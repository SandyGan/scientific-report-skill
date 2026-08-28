import { constants as fsConstants, createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { createHash } from "node:crypto";

export const SHA256_PREFIX = "sha256:" as const;
export const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export interface FileDigest {
  contentHash: string;
  byteSize: number;
}

export function sha256Bytes(bytes: Uint8Array | string): string {
  return `${SHA256_PREFIX}${createHash("sha256").update(bytes).digest("hex")}`;
}

export function isSha256Hash(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

/**
 * Hash a regular file without following a final-component symbolic link. The
 * before/after metadata check detects replacement or mutation during hashing.
 */
export async function sha256File(filePath: string): Promise<FileDigest> {
  const before = await stat(filePath, { bigint: true });
  if (!before.isFile()) {
    throw new Error(`Cannot hash a non-regular file: ${filePath}`);
  }

  const handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile()) {
      throw new Error(`Cannot hash a non-regular file: ${filePath}`);
    }
    if (opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error(`File changed identity before hashing: ${filePath}`);
    }

    const hash = createHash("sha256");
    const stream = createReadStream(filePath, {
      autoClose: false,
      fd: handle.fd,
      start: 0,
    });
    let byteSize = 0;
    for await (const chunk of stream) {
      const bytes = chunk as Buffer;
      byteSize += bytes.byteLength;
      hash.update(bytes);
    }

    const after = await handle.stat({ bigint: true });
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      after.mtimeNs !== opened.mtimeNs ||
      after.ctimeNs !== opened.ctimeNs
    ) {
      throw new Error(`File changed while being hashed: ${filePath}`);
    }
    if (BigInt(byteSize) !== after.size) {
      throw new Error(`File size changed while being hashed: ${filePath}`);
    }

    return {
      contentHash: `${SHA256_PREFIX}${hash.digest("hex")}`,
      byteSize,
    };
  } finally {
    await handle.close();
  }
}
