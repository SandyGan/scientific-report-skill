import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";

import { sha256CanonicalJson, type Sha256Hash } from "./hash.js";
import { isJsonObject, type JsonObject, type JsonValue } from "./json.js";
import { projectPaths } from "./project-paths.js";
import type { ScientificReport } from "./types.js";

export const SCIENTIFIC_REPORT_SCHEMA_ID =
  "https://schemas.report-prompt.org/v1/scientific-report.schema.json";
export const VALIDATION_ATTESTATION_SCHEMA_ID =
  "https://schemas.report-prompt.org/v1/validation-attestation.schema.json";

export const DOMAIN_PACK_SCHEMA_IDS = {
  wet_lab: "https://schemas.report-prompt.org/v1/packs/wet-lab.schema.json",
  ai_ml: "https://schemas.report-prompt.org/v1/packs/ai-ml.schema.json",
  molecular_dynamics: "https://schemas.report-prompt.org/v1/packs/molecular-dynamics.schema.json",
} as const;

export interface LoadedSchema {
  id: string;
  path: string;
  schema: JsonObject;
}

export interface SchemaIssue {
  instancePointer: string;
  schemaPointer: string;
  keyword: string;
  message: string;
  params: Record<string, unknown>;
}

export interface SchemaValidationResult<T = unknown> {
  valid: boolean;
  value: unknown;
  issues: SchemaIssue[];
  schemaId: string;
  /** Populated only when valid; validation never mutates the input. */
  typedValue?: T;
}

function listJsonFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listJsonFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
  }
  return files;
}

function parseSchema(path: string): LoadedSchema {
  const metadata = statSync(path);
  if (!metadata.isFile()) throw new Error(`Schema path is not a regular file: ${path}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SyntaxError(`Unable to parse schema ${path}: ${message}`);
  }
  if (!isJsonObject(parsed) || typeof parsed.$id !== "string" || parsed.$id.length === 0) {
    throw new TypeError(`Schema ${path} must be an object with a non-empty $id`);
  }
  return { id: parsed.$id, path, schema: parsed };
}

function normalizeAjvIssues(errors: ErrorObject[] | null | undefined): SchemaIssue[] {
  return (errors ?? []).map((error) => ({
    instancePointer: error.instancePath,
    schemaPointer: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? "Schema validation failed",
    params: error.params,
  }));
}

export interface SchemaRepositoryOptions {
  projectRoot?: string;
  schemasDirectory?: string;
}

export class SchemaRepository {
  public readonly schemas: readonly LoadedSchema[];
  public readonly schemaSetHash: Sha256Hash;
  private readonly ajv: Ajv2020;

  public constructor(options: SchemaRepositoryOptions = {}) {
    const paths = projectPaths(options.projectRoot);
    const schemasDirectory = resolve(options.schemasDirectory ?? paths.schemas);
    this.schemas = listJsonFiles(schemasDirectory).map(parseSchema);
    const duplicateIds = this.schemas
      .map((schema) => schema.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index);
    if (duplicateIds.length > 0) throw new Error(`Duplicate schema $id values: ${[...new Set(duplicateIds)].join(", ")}`);

    this.schemaSetHash = sha256CanonicalJson(
      this.schemas.map(({ id, schema }) => ({ id, schema })).sort((left, right) => left.id.localeCompare(right.id, "en")),
    );
    this.ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      // Canonical schemas intentionally refine referenced object types with
      // properties-only subschemas; Ajv's strictTypes lint rejects that valid
      // draft-2020-12 pattern even though evaluation is well-defined.
      strictTypes: false,
      allowUnionTypes: true,
      validateFormats: true,
      messages: true,
    });
    const addFormats = addFormatsImport as unknown as (ajv: Ajv2020) => Ajv2020;
    addFormats(this.ajv);
    for (const loaded of this.schemas) this.ajv.addSchema(loaded.schema, loaded.id);
  }

  public has(schemaId: string): boolean {
    return this.ajv.getSchema(schemaId) !== undefined;
  }

  public get(schemaId: string): ValidateFunction {
    const validator = this.ajv.getSchema(schemaId);
    if (validator === undefined) throw new Error(`Schema is not loaded: ${schemaId}`);
    return validator;
  }

  public validate<T = unknown>(schemaId: string, value: unknown): SchemaValidationResult<T> {
    const validator = this.get(schemaId);
    const valid = validator(value) as boolean;
    const result: SchemaValidationResult<T> = {
      valid,
      value,
      issues: normalizeAjvIssues(validator.errors),
      schemaId,
    };
    if (valid) result.typedValue = value as T;
    return result;
  }

  public validateScientificReport(value: unknown): SchemaValidationResult<ScientificReport> {
    return this.validate<ScientificReport>(SCIENTIFIC_REPORT_SCHEMA_ID, value);
  }

  public validateDomainPack(domain: keyof typeof DOMAIN_PACK_SCHEMA_IDS, value: unknown): SchemaValidationResult<JsonValue> {
    return this.validate<JsonValue>(DOMAIN_PACK_SCHEMA_IDS[domain], value);
  }
}

const repositories = new Map<string, SchemaRepository>();

export function loadSchemas(options: SchemaRepositoryOptions = {}): SchemaRepository {
  const paths = projectPaths(options.projectRoot);
  const key = resolve(options.schemasDirectory ?? paths.schemas);
  const existing = repositories.get(key);
  if (existing !== undefined) return existing;
  const repository = new SchemaRepository({ ...options, schemasDirectory: key });
  repositories.set(key, repository);
  return repository;
}

export function clearSchemaCache(): void {
  repositories.clear();
}

export function validateScientificReportSchema(
  value: unknown,
  options: SchemaRepositoryOptions = {},
): SchemaValidationResult<ScientificReport> {
  return loadSchemas(options).validateScientificReport(value);
}

export const loadJsonSchemas = loadSchemas;
