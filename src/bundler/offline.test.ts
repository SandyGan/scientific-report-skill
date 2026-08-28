import { describe, expect, it } from "vitest";

import { inspectOfflineContent } from "./offline.js";

const CSP = "default-src 'self' data:; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'";

function html(body: string, includeCsp = true): string {
  return `<!doctype html><html><head>${includeCsp ? `<meta http-equiv="Content-Security-Policy" content="${CSP}">` : ""}</head><body>${body}</body></html>`;
}

describe("offline browser-semantics verification", () => {
  it("[offline-html-entity-url-bypass] rejects decimal, hexadecimal, named-entity, mixed-case, malformed, protocol-relative, and CSP-less remote resources", () => {
    const encodedResources = [
      '<img src="https&#58;&#47;&#47;example.com/decimal.png">',
      '<img src="https&#x3a;&#x2f;&#x2f;example.com/hex.png">',
      '<img src="https&colon;&sol;&sol;example.com/named.png">',
      '<img src="HtTpS://example.com/mixed.png">',
      '<img src=https&#58;&#47;&#47;example.com/malformed.png><p',
      '<img src="//example.com/protocol-relative.png">',
    ];

    for (const [index, body] of encodedResources.entries()) {
      const result = inspectOfflineContent([{ path: `probe-${index}.html`, content: html(body) }]);
      expect(result.findings, body).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "REMOTE_RESOURCE", path: `probe-${index}.html` }),
      ]));
    }

    const missingCsp = inspectOfflineContent([{
      path: "missing-csp.html",
      content: html('<img src="assets/local.png">', false),
    }]);
    expect(missingCsp.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_OR_UNSAFE_CSP", path: "missing-csp.html" }),
    ]));
  });
});
