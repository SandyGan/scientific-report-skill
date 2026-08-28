import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { normalizeAuthoringInput } from "./normalize.js";
import type {
  JsonValue,
  NormalizeAuthoringFileOptions,
  NormalizeAuthoringFileToPathOptions,
  NormalizationResult,
} from "./types.js";

function parseJson(text: string, inputPath: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SyntaxError(`Cannot parse authoring input ${inputPath}: ${detail}`);
  }
}

function serialized(value: JsonValue | NormalizationResult, indent: number): string {
  return `${JSON.stringify(value, null, indent)}\n`;
}

/**
 * Read and normalize an authoring JSON file without writing output.
 *
 * The second positional parameter is always an options object. This keeps the
 * public operation unambiguous and prevents a path string from being mistaken
 * for normalization options.
 */
export async function normalizeAuthoringFile(
  inputPath: string,
  options: NormalizeAuthoringFileOptions = {},
): Promise<NormalizationResult> {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("normalizeAuthoringFile options must be an object; use normalizeAuthoringFileToPath to write output.");
  }
  const absoluteInput = resolve(inputPath);
  const text = await readFile(absoluteInput, "utf8");
  return normalizeAuthoringInput(parseJson(text, absoluteInput), options);
}

/**
 * Normalize an authoring file and atomically write only the canonical report.
 * The input path is never accepted as the output target.
 */
export async function normalizeAuthoringFileToPath(
  inputPath: string,
  outputPath: string,
  options: NormalizeAuthoringFileToPathOptions = {},
): Promise<NormalizationResult> {
  const absoluteInput = resolve(inputPath);
  const absoluteOutput = resolve(outputPath);
  if (absoluteOutput === absoluteInput) {
    throw new Error("Refusing to overwrite the authoring input with a normalized report.");
  }

  const { indent = 2, ...normalizationOptions } = options;
  if (!Number.isInteger(indent) || indent < 0 || indent > 10) {
    throw new RangeError("indent must be an integer from 0 through 10.");
  }
  const result = await normalizeAuthoringFile(absoluteInput, normalizationOptions);

  await mkdir(dirname(absoluteOutput), { recursive: true });
  const temporaryPath = `${absoluteOutput}.${process.pid}.${randomUUID()}.normalizer-tmp`;
  try {
    await writeFile(temporaryPath, serialized(result.report, indent), { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, absoluteOutput);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return result;
}
