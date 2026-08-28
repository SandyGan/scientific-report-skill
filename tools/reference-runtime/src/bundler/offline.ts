import path from "node:path";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { findAbsoluteFilesystemReferences } from "../lib/absolute-path.js";
import { assertNormalizedRelativePosixPath } from "./path-safety.js";

export interface OfflineContentFile {
  path: string;
  content: string;
}

export interface OfflineFinding {
  code: string;
  path: string;
  message: string;
  reference: string | null;
}

export interface LocalReference {
  fromPath: string;
  targetPath: string;
  reference: string;
}

export interface OfflineInspectionResult {
  findings: OfflineFinding[];
  localReferences: LocalReference[];
}

const EXTERNAL_SCHEME = /^(?:https?|ftp|ftps|ws|wss):/iu;
const DANGEROUS_SCHEME = /^(?:javascript|vbscript):/iu;
const FILE_SCHEME = /^file:/iu;
const DATA_SCHEME = /^data:/iu;

const RESOURCE_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  audio: ["src"],
  embed: ["src"],
  iframe: ["src"],
  image: ["href", "xlink:href"],
  img: ["src", "srcset"],
  input: ["src"],
  object: ["data"],
  script: ["src"],
  source: ["src", "srcset"],
  track: ["src"],
  use: ["href", "xlink:href"],
  video: ["src", "poster"],
};

function srcsetReferences(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim().split(/\s+/u)[0] ?? "")
    .filter((part) => part.length > 0);
}

function diagnosticReference(rawReference: string): string {
  const reference = rawReference.trim();
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/u.exec(reference)?.[1]?.toLowerCase();
  if (scheme === "javascript" || scheme === "vbscript" || scheme === "data" || scheme === "file") {
    return JSON.stringify(`${scheme}:<redacted>`);
  }
  if (scheme === "http" || scheme === "https" || scheme === "ftp" || scheme === "ftps" || scheme === "ws" || scheme === "wss") {
    try {
      const url = new URL(reference);
      return JSON.stringify(`${url.protocol}//${url.host}${url.pathname}`.slice(0, 200));
    } catch {
      return JSON.stringify(`${scheme}:<malformed>`);
    }
  }
  const withoutQueryOrFragment = reference.split(/[?#]/u, 1)[0] ?? "";
  return JSON.stringify(withoutQueryOrFragment.length > 200 ? `${withoutQueryOrFragment.slice(0, 197)}...` : withoutQueryOrFragment);
}

function classifyReference(
  fromPath: string,
  rawReference: string,
  context: "resource" | "navigation",
  findings: OfflineFinding[],
  localReferences: LocalReference[],
): void {
  const reference = rawReference.trim();
  if (reference.length === 0 || reference.startsWith("#")) return;

  if (DANGEROUS_SCHEME.test(reference)) {
    findings.push({
      code: "DANGEROUS_URL_SCHEME",
      path: fromPath,
      message: `Dangerous URL scheme is prohibited in offline package content: ${diagnosticReference(reference)}.`,
      reference,
    });
    return;
  }
  if (FILE_SCHEME.test(reference)) {
    findings.push({
      code: "FILE_URL_REFERENCE",
      path: fromPath,
      message: `A file: URL can escape the movable bundle: ${diagnosticReference(reference)}.`,
      reference,
    });
    return;
  }
  if (EXTERNAL_SCHEME.test(reference) || reference.startsWith("//")) {
    if (context === "resource") {
      findings.push({
        code: "REMOTE_RESOURCE",
        path: fromPath,
        message: `Remote resource dependency is prohibited: ${diagnosticReference(reference)}.`,
        reference,
      });
    }
    // Ordinary navigational links are not dependencies. They may be unusable
    // offline, but they do not alter the locally rendered scientific content.
    return;
  }
  if (DATA_SCHEME.test(reference)) {
    if (context !== "resource" || !/^data:image\/(?:png|gif|jpeg|webp);/iu.test(reference)) {
      findings.push({
        code: "UNSAFE_DATA_URL",
        path: fromPath,
        message: `Only explicitly typed image data URLs are allowed: ${diagnosticReference(reference)}.`,
        reference,
      });
    }
    return;
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(reference)) {
    // mailto:, tel:, and other external navigation schemes do not load package
    // dependencies, but resource contexts must remain wholly local.
    if (context === "resource") {
      findings.push({
        code: "NON_LOCAL_RESOURCE",
        path: fromPath,
        message: `Non-local resource scheme is prohibited: ${diagnosticReference(reference)}.`,
        reference,
      });
    }
    return;
  }

  const withoutFragment = reference.split("#", 1)[0] ?? "";
  const withoutQuery = withoutFragment.split("?", 1)[0] ?? "";
  if (withoutQuery.length === 0) return;

  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    findings.push({
      code: "MALFORMED_LOCAL_REFERENCE",
      path: fromPath,
      message: `Local reference has malformed percent encoding: ${diagnosticReference(reference)}.`,
      reference,
    });
    return;
  }
  if (decoded.includes("\\") || decoded.startsWith("/")) {
    findings.push({
      code: "ABSOLUTE_OR_NON_POSIX_REFERENCE",
      path: fromPath,
      message: `Local references must use relative POSIX paths: ${diagnosticReference(reference)}.`,
      reference,
    });
    return;
  }

  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), decoded));
  if (resolved === ".." || resolved.startsWith("../") || path.posix.isAbsolute(resolved)) {
    findings.push({
      code: "REFERENCE_TRAVERSAL",
      path: fromPath,
      message: `Local reference escapes the bundle root: ${diagnosticReference(reference)}.`,
      reference,
    });
    return;
  }

  try {
    assertNormalizedRelativePosixPath(resolved);
  } catch (error) {
    findings.push({
      code: "UNSAFE_LOCAL_REFERENCE",
      path: fromPath,
      message: error instanceof Error ? error.message : `Unsafe local reference: ${diagnosticReference(reference)}.`,
      reference,
    });
    return;
  }
  localReferences.push({ fromPath, targetPath: resolved, reference });
}

type ParseNode = DefaultTreeAdapterMap["node"];
type ParseElement = DefaultTreeAdapterMap["element"];

function isElement(node: ParseNode): node is ParseElement {
  return "tagName" in node && "attrs" in node;
}

function childNodes(node: ParseNode): ParseNode[] {
  return "childNodes" in node ? node.childNodes as ParseNode[] : [];
}

function elementText(node: ParseNode): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  return childNodes(node).map(elementText).join("");
}

function parsedAttributes(element: ParseElement): Map<string, string> {
  return new Map(element.attrs.map((attribute) => [
    attribute.prefix === undefined || attribute.prefix === null
      ? attribute.name.toLowerCase()
      : `${attribute.prefix.toLowerCase()}:${attribute.name.toLowerCase()}`,
    attribute.value.trim(),
  ]));
}

function hasRequiredOfflineCsp(content: string): boolean {
  const directives = new Map<string, string[]>();
  for (const source of content.split(";")) {
    const tokens = source.trim().toLowerCase().split(/\s+/u).filter(Boolean);
    const name = tokens.shift();
    if (name !== undefined) directives.set(name, tokens);
  }
  const exact = (name: string, values: readonly string[]): boolean => {
    const actual = directives.get(name);
    return actual !== undefined && actual.length === values.length && values.every((value) => actual.includes(value));
  };
  return exact("default-src", ["'self'", "data:"])
    && exact("script-src", ["'self'"])
    && exact("style-src", ["'self'"])
    && exact("img-src", ["'self'", "data:"])
    && exact("object-src", ["'none'"])
    && exact("base-uri", ["'none'"])
    && exact("form-action", ["'none'"])
    && exact("connect-src", ["'none'"]);
}

function inspectMarkup(
  file: OfflineContentFile,
  findings: OfflineFinding[],
  localReferences: LocalReference[],
): void {
  const document = parse(file.content) as ParseNode;
  const isHtml = [".html", ".htm"].includes(path.posix.extname(file.path).toLowerCase());
  let restrictiveCspFound = false;

  const visit = (node: ParseNode): void => {
    if (isElement(node)) {
      const tag = node.tagName.toLowerCase();
      const attributes = parsedAttributes(node);

      if (path.posix.extname(file.path).toLowerCase() === ".svg" && (tag === "script" || tag === "foreignobject")) {
        findings.push({
          code: "ACTIVE_SVG_CONTENT",
          path: file.path,
          message: `Active SVG element '${tag}' is prohibited in an offline report asset.`,
          reference: null,
        });
      }

      for (const [name, value] of attributes) {
        if (name.startsWith("on") && value.length > 0) {
          findings.push({
            code: "INLINE_EVENT_HANDLER",
            path: file.path,
            message: `Inline event handler '${name}' is prohibited; use a local static script with inert data attributes.`,
            reference: null,
          });
        }
        if (["href", "src", "action", "formaction", "poster", "data", "xlink:href"].includes(name)) {
          classifyReference(file.path, value, "navigation", findings, localReferences);
        }
      }

      const resourceNames = RESOURCE_ATTRIBUTES[tag] ?? [];
      for (const attributeName of resourceNames) {
        const value = attributes.get(attributeName);
        if (value === undefined) continue;
        const references = attributeName === "srcset" ? srcsetReferences(value) : [value];
        references.forEach((reference) => classifyReference(file.path, reference, "resource", findings, localReferences));
      }

      if (tag === "link") {
        const rel = new Set((attributes.get("rel") ?? "").toLowerCase().split(/\s+/u));
        const href = attributes.get("href");
        if (href !== undefined && ["stylesheet", "icon", "preload", "modulepreload", "manifest"].some((token) => rel.has(token))) {
          classifyReference(file.path, href, "resource", findings, localReferences);
        }
      }
      if (tag === "meta") {
        const httpEquiv = (attributes.get("http-equiv") ?? "").toLowerCase();
        if (httpEquiv === "refresh") {
          findings.push({
            code: "META_REFRESH",
            path: file.path,
            message: "Meta refresh is prohibited in an offline scientific report bundle.",
            reference: attributes.get("content") ?? null,
          });
        }
        if (httpEquiv === "content-security-policy" && hasRequiredOfflineCsp(attributes.get("content") ?? "")) {
          restrictiveCspFound = true;
        }
      }
      if (tag === "base") {
        findings.push({
          code: "BASE_ELEMENT",
          path: file.path,
          message: "A base element can rewrite relative-path containment and is prohibited.",
          reference: attributes.get("href") ?? null,
        });
      }
      if (tag === "script" && !attributes.has("src")) {
        const script = elementText(node);
        if (script.trim().length > 0) inspectJavaScript({ path: file.path, content: script }, findings, localReferences);
      }
      if (tag === "style") {
        const style = elementText(node);
        if (style.trim().length > 0) inspectCss({ path: file.path, content: style }, findings, localReferences);
      }
    }
    childNodes(node).forEach(visit);
  };
  visit(document);

  if (isHtml && !restrictiveCspFound) {
    findings.push({
      code: "MISSING_OR_UNSAFE_CSP",
      path: file.path,
      message: "Offline HTML requires the package CSP (self-only scripts/styles, local/data images, and no objects, base URI, forms, or connections).",
      reference: null,
    });
  }
}

function inspectCss(
  file: OfflineContentFile,
  findings: OfflineFinding[],
  localReferences: LocalReference[],
): void {
  const withoutComments = file.content.replace(/\/\*[\s\S]*?\*\//gu, "");
  const importPattern = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?/giu;
  for (const match of withoutComments.matchAll(importPattern)) {
    const reference = match[1];
    if (reference !== undefined) {
      classifyReference(file.path, reference, "resource", findings, localReferences);
    }
  }
  const urlPattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/giu;
  for (const match of withoutComments.matchAll(urlPattern)) {
    const reference = match[1] ?? match[2] ?? match[3];
    if (reference !== undefined) {
      classifyReference(file.path, reference, "resource", findings, localReferences);
    }
  }
  if (/\bexpression\s*\(/iu.test(withoutComments)) {
    findings.push({
      code: "ACTIVE_CSS_EXPRESSION",
      path: file.path,
      message: "Executable CSS expression syntax is prohibited in offline report assets.",
      reference: null,
    });
  }
}

function inspectJavaScript(
  file: OfflineContentFile,
  findings: OfflineFinding[],
  localReferences: LocalReference[],
): void {
  const networkPatterns: readonly [RegExp, string][] = [
    [/\bfetch\s*\(/u, "fetch"],
    [/\bXMLHttpRequest\b/u, "XMLHttpRequest"],
    [/\bWebSocket\s*\(/u, "WebSocket"],
    [/\bEventSource\s*\(/u, "EventSource"],
    [/\bsendBeacon\s*\(/u, "sendBeacon"],
    [/\bimportScripts\s*\(/u, "importScripts"],
    [/\bserviceWorker\s*\.\s*register\s*\(/u, "serviceWorker.register"],
  ];
  for (const [pattern, api] of networkPatterns) {
    if (pattern.test(file.content)) {
      findings.push({
        code: "NETWORK_API",
        path: file.path,
        message: `Network-capable API '${api}' is prohibited in an offline report asset.`,
        reference: api,
      });
    }
  }
  for (const match of file.content.matchAll(/(?:https?|ftp|wss?):\/\/[^\s"'`)>]+/giu)) {
    findings.push({
      code: "REMOTE_URL_IN_SCRIPT",
      path: file.path,
      message: `Remote URL is embedded in executable script content: ${diagnosticReference(match[0])}.`,
      reference: match[0],
    });
  }

  const moduleReferencePattern = /\b(?:import|export)\s+(?:[^"'`;\n]*?\s+from\s*)?["']([^"']+)["']/gu;
  for (const match of file.content.matchAll(moduleReferencePattern)) {
    const reference = match[1];
    if (reference !== undefined) classifyReference(file.path, reference, "resource", findings, localReferences);
  }
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
  for (const match of file.content.matchAll(dynamicImportPattern)) {
    const reference = match[1];
    if (reference !== undefined) classifyReference(file.path, reference, "resource", findings, localReferences);
  }
  const workerReferencePattern = /\bnew\s+(?:Shared)?Worker\s*\(\s*["']([^"']+)["']/gu;
  for (const match of file.content.matchAll(workerReferencePattern)) {
    const reference = match[1];
    if (reference !== undefined) classifyReference(file.path, reference, "resource", findings, localReferences);
  }
}

export function inspectOfflineContent(files: readonly OfflineContentFile[]): OfflineInspectionResult {
  const findings: OfflineFinding[] = [];
  const localReferences: LocalReference[] = [];

  for (const file of files) {
    assertNormalizedRelativePosixPath(file.path);
    const extension = path.posix.extname(file.path).toLowerCase();
    if (extension === ".html" || extension === ".htm" || extension === ".svg") {
      inspectMarkup(file, findings, localReferences);
      if (extension === ".svg") inspectCss(file, findings, localReferences);
    } else if (extension === ".css") {
      inspectCss(file, findings, localReferences);
    } else if ([".js", ".mjs", ".cjs"].includes(extension)) {
      inspectJavaScript(file, findings, localReferences);
    }
  }

  const uniqueReferences = new Map<string, LocalReference>();
  for (const reference of localReferences) {
    uniqueReferences.set(`${reference.fromPath}\0${reference.targetPath}\0${reference.reference}`, reference);
  }
  return {
    findings,
    localReferences: [...uniqueReferences.values()].sort((left, right) =>
      `${left.fromPath}\0${left.targetPath}`.localeCompare(`${right.fromPath}\0${right.targetPath}`, "en"),
    ),
  };
}

export interface DisclosureScanFinding {
  code: string;
  path: string;
  message: string;
}

function absolutePathFindings(file: OfflineContentFile): DisclosureScanFinding[] {
  if (path.posix.extname(file.path).toLowerCase() !== ".json") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.content) as unknown;
  } catch {
    return [];
  }
  const findings: DisclosureScanFinding[] = [];
  const visit = (value: unknown, pointer: string, fieldName?: string, locatorType?: string): void => {
    if (typeof value === "string") {
      const matches = findAbsoluteFilesystemReferences(value, {
        ...(fieldName === undefined ? {} : { fieldName }),
        instancePointer: pointer,
        ...(locatorType === undefined ? {} : { locatorType }),
      });
      for (const match of matches) {
        findings.push({
          code: `${match.kind.toUpperCase()}_ABSOLUTE_PATH`,
          path: file.path,
          message: `Detected a ${match.kind.replaceAll("_", " ")} filesystem reference at JSON pointer ${pointer || "/"}; remove or disclosure-project it before bundling.`,
        });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${pointer}/${index}`, fieldName, locatorType));
      return;
    }
    if (value === null || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(object)) {
      const childPointer = `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      visit(
        child,
        childPointer,
        key,
        key === "value" && typeof object.locator_type === "string" ? object.locator_type : undefined,
      );
    }
  };
  visit(parsed, "");
  return findings;
}

/**
 * Conservative byte scan for high-confidence secrets and host-specific paths.
 * It does not claim full redaction coverage; the package attestation remains the
 * authority for disclosure-policy checks.
 */
export function scanForHighConfidenceLeaks(files: readonly OfflineContentFile[]): DisclosureScanFinding[] {
  const findings: DisclosureScanFinding[] = [];
  const patterns: readonly [string, RegExp, string][] = [
    ["PRIVATE_KEY", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u, "private key material"],
    ["AWS_ACCESS_KEY", /\bAKIA[0-9A-Z]{16}\b/u, "access-key-shaped credential"],
    ["GITHUB_TOKEN", /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/u, "token-shaped credential"],
  ];

  for (const file of files) {
    findings.push(...absolutePathFindings(file));
    for (const [code, pattern, label] of patterns) {
      if (pattern.test(file.content)) {
        findings.push({
          code,
          path: file.path,
          message: `Detected ${label}; remove or disclosure-project it before bundling.`,
        });
      }
    }
  }
  return findings;
}
