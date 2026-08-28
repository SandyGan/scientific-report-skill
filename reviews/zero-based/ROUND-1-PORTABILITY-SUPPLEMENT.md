# Round 1 portability supplement

**Scope:** independent zero-context, read-only clean-room audit of package installation, CLI, rendering, bundling, verification, consumer workflow, and console filtering.

**Status:** nine reproduced first-pass findings. These are supplement candidates until independently reverified.

## Findings

### PT-01 — Bundle can certify HTML that contradicts scientific payload — Critical

A valid release bundle was copied, its manifest removed, and only `report.html` changed to a false causal conclusion absent from public JSON. Rebundling and verification passed. HTML/annex bytes are not bound to a trusted renderer/template version or checked as deterministic projections of the scientific payload.

Anchors: `src/cli/index.ts:979-1000`, `src/bundler/index.ts:542-610`, `src/verifier/index.ts:555-608`.

### PT-02 — Current working directory silently overrides packaged templates — High

Renderer searches `process.cwd()/templates/scientific-console` before package-owned templates. An unrelated consumer directory supplied foreign CSS and the release-only demo remained release-eligible and verified.

Anchors: `src/renderer/index.ts:127-154`, `src/renderer/templates.ts:26-48`.

### PT-03 — Common absolute POSIX paths pass release — High

A `/opt/...` path remains in HTML and public JSON while validation, rendering, and verification pass and the manifest claims no absolute paths.

Anchors: `src/renderer/safety.ts:89-98`, `src/bundler/offline.ts:418-425`.

Disposition: overlaps the main absolute-path finding and software-contract SC-08.

### PT-04 — Consumer workflow has no disclosure-projection implementation — High

Normalizer produces `canonical_authoritative/not_projected`; renderer requires `public_projection/projected`; CLI has no project command or implementation. `init → normalize → render --working-copy` cannot complete.

Anchors: `src/normalizer/normalize.ts:2186`, `src/normalizer/normalize.ts:2272`, `src/renderer/safety.ts:26-51`, `src/cli/index.ts:873-1060`.

### PT-05 — Generation prompt contract is internally unimplementable — High

Prompt identity, continuation vocabulary, serialized stage mapping, prompt versions, and one prompt hash disagree across documentation, schemas, fragments, and examples.

Anchors: `prompts/README.md:26-40`, `schemas/generation-response.schema.json:258-371`, `schemas/generation-request.schema.json:306-316`.

Disposition: overlaps main F2/F3/F4/F9 and SC-01.

### PT-06 — `verify --allow-extra-files` emits release-style PASS — High

Adding an unhashed file fails default verification but passes with `--allow-extra-files`; the file is not integrity-checked and the result is not marked non-release or integrity-only.

Anchors: `src/cli/index.ts:1004-1015`, `src/verifier/index.ts:526-538`, `src/verifier/index.ts:924-927`.

### PT-07 — Packaging has no lifecycle release gate — Medium

`npm pack` succeeds after TypeScript source is broken while stale `dist` remains. No `prepack`/`prepare`/`prepublishOnly` gate or release `files` allowlist exists; tarball includes source, tests, and generated demos.

Anchor: `package.json:1-39`.

### PT-08 — README install command fails in packed release — Medium

Packed releases omit `package-lock.json` and have no shrinkwrap, but included README instructs `npm ci`; following it after extraction fails.

Anchors: `README.md:45-53`, `package.json:1-39`.

### PT-09 — Console filter choices omit mixed-domain and safety records — Medium

Rendered records contain wet-lab/MD domains and argument/evidence/question/bridge kinds, but filter option generation uses only a subset of collections. The demo cannot select its own mixed-domain records or several unresolved states.

Anchors: `src/renderer/view-model.ts:104-114`, `src/renderer/view-model.ts:940-956`, `templates/scientific-console/report.html:68-90`.

## Review limits

Clean-room checks covered Node 22, npm 10, macOS, installed tarball CLI, and partial headless Chrome `file://` loading. Cross-browser, Windows/Linux native hosts, dependency-vulnerability, supply-chain, and human scientific-truth review were not performed.
