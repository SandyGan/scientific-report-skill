export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface TrustedTemplateIdentity {
  /** Stable identity assigned by the release owner to the custom template set. */
  id: string;
  /** Version assigned to this exact trusted template release. */
  version: string;
  /** SHA-256 over the renderer's complete, path-framed template member set. */
  hash: `sha256:${string}`;
}

export interface RenderOptions {
  /** Directory that receives the portable renderer output. */
  outDir: string;
  /** Override the package-owned scientific-console template directory. */
  templateDir?: string;
  /** Required, and hash-checked, whenever templateDir is not package-owned. */
  trustedTemplateIdentity?: TrustedTemplateIdentity;
  /** Independent validation record for the exact bytes written as the public payload. */
  attestation?: unknown;
  /** Optional, removable, provider-neutral generation-process audit. */
  generationAudit?: unknown;
  /** Permit replacing known regular renderer members in an existing output directory. */
  force?: boolean;
}

export interface WrittenFile {
  /** Portable POSIX path relative to outDir. */
  path: string;
  /** Absolute path on the local filesystem. */
  absolutePath: string;
  byteLength: number;
}

export interface RenderResult {
  outDir: string;
  /** Sorted portable paths, stable across output locations. */
  writtenFiles: string[];
  files: WrittenFile[];
  /** Plain JSON clone whose canonical bytes were written to scientific-report.public.json. */
  publicPayload: JsonObject;
  /** Exact UTF-8 text written to scientific-report.public.json. */
  publicPayloadText: string;
  /** SHA-256 of the exact canonical publicPayloadText bytes. */
  payloadHash: `sha256:${string}`;
  /** True only when a structurally consistent, exact-hash attestation was supplied. */
  validationAttestationBound: boolean;
}

export class RendererError extends Error {
  readonly code: string;
  readonly path?: string;

  constructor(code: string, message: string, path?: string) {
    super(message);
    this.name = "RendererError";
    this.code = code;
    if (path !== undefined) this.path = path;
  }
}
