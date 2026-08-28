import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ProjectPaths {
  root: string;
  schemas: string;
  rules: string;
  protocol: string;
}

function isProjectRoot(path: string): boolean {
  return (
    existsSync(join(path, "schemas", "scientific-report.schema.json")) &&
    existsSync(join(path, "rules", "registry.yaml"))
  );
}

export function findProjectRoot(startDirectory: string): string {
  let current = resolve(startDirectory);
  for (;;) {
    if (isProjectRoot(current)) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Unable to locate Scientific Report Skill project root from ${startDirectory}`);
}

export function defaultProjectRoot(): string {
  return findProjectRoot(dirname(fileURLToPath(import.meta.url)));
}

export function projectPaths(root = defaultProjectRoot()): ProjectPaths {
  const resolvedRoot = resolve(root);
  if (!isProjectRoot(resolvedRoot)) {
    throw new Error(`Invalid Scientific Report Skill project root: ${resolvedRoot}`);
  }
  return {
    root: resolvedRoot,
    schemas: join(resolvedRoot, "schemas"),
    rules: join(resolvedRoot, "rules"),
    protocol: join(resolvedRoot, "protocol"),
  };
}
