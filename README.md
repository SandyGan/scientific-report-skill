# Scientific Report Console

[中文说明](README_Chinese.md)

A provider-neutral protocol and toolchain for building evidence-led scientific report bundles. The project separates scientific facts from generated prose and presentation so that readers can inspect what was done, what was not done, which sources support each claim, where conflicts remain, and what can actually be reproduced.

The intended flow is:

```text
registered sources and run records
  -> source coverage and atomic records
  -> normalized scientific payload
  -> structural and semantic validation
  -> public disclosure projection
  -> deterministic offline rendering
  -> manifest-bound report bundle
```

Version 0.1.0 is a release candidate with automated implementation acceptance. Treat prompt output, rendered pages, schema acceptance, and validation results as review aids—not as proof that a scientific statement is true or that a particular scientific report is ready for publication.

## Project identity

| Surface | Canonical name |
|---|---|
| Product | **Scientific Report Console** |
| GitHub repository and source directory | `scientific-report-console` |
| npm package | `scientific-report-console` |
| Primary CLI command | `scientific-report-console` |
| Compatibility CLI alias | `report-prompt` |

The versioned `report_prompt.*` extension keys and prompt IDs, `report-prompt-*` tool identifiers, and `https://schemas.report-prompt.org/` Schema identifiers are stable 0.1.0 machine contracts. They intentionally retain their original namespace; changing them would be a contract migration, not a branding edit. New human-facing documentation and commands use the canonical project name.

## Core guarantees and non-guarantees

The protocol is designed to preserve these distinctions:

- work performed by this project, reanalysis, upstream or external work, and synthetic work;
- `planned`, `attempted`, `completed`, `not_performed`, and `unknown` work states;
- effects, statistical decisions, interpretability, record disposition, and technical failures as separate axes;
- `known`, `unknown`, `not_applicable`, and `withheld` field states;
- direct evidence, intermediate reasoning, conflicts, counterevidence, and cross-domain bridges;
- historical invocations, replay recipes, verified reruns, and independent reproduction.

The toolchain can check declared structure, references, rule conditions, hashes, and bundle properties to the extent those checks are implemented and invoked. It cannot establish that an omitted source never existed, that an input source is honest, that an experiment was performed as recorded, that a causal interpretation is valid, or that a rerun is scientifically independent. Those require source governance and qualified human review.

## Contract status and safe use of this snapshot

The intended contract has several independently versioned surfaces:

- `protocol/` defines normative scientific and epistemic semantics;
- `schemas/` defines the JSON structures accepted by the current implementation surface;
- `rules/registry.yaml` inventories automated semantic checks;
- prompts and templates consume those contracts but do not redefine them.

Conformance requires these surfaces to agree. Schema acceptance does not override a stricter protocol rule, and a protocol term that the active schema cannot represent does not make a payload structurally valid. When they disagree, the disagreement is a release blocker—do not invent aliases or choose the more convenient vocabulary.

The zero-based alignment blockers found during parallel implementation have been reconciled across the active protocol, schemas, TypeScript types, validator, fixtures, prompts, and renderer. See [`reviews/zero-based/INTEGRATION_BLOCKERS.md`](reviews/zero-based/INTEGRATION_BLOCKERS.md) for the historical discrepancies and closure evidence. The active field dictionary and scientific-review rubric use the same public-withheld provenance and review-outcome vocabularies as their schemas. Any future disagreement between contract surfaces remains a release blocker: do not invent aliases or describe an affected payload as contract-conformant until the protocol, schema, rules, implementation, fixtures, documentation, and rendering are migrated together.

## Requirements

- Node.js 22 or later
- npm

Install a packed release as a consumer (replace the tarball name with the file produced by `npm pack`):

```bash
mkdir scientific-report-console-consumer && cd scientific-report-console-consumer
npm init -y
npm install ../scientific-report-console-0.1.0.tgz
npx scientific-report-console --help
```

For a source checkout, install its declared dependencies with `npm install`. A packed release intentionally contains neither `package-lock.json` nor the development test sources; install the tarball into a consumer project rather than treating its extracted contents as a source checkout.

## How to use the console

Choose the path that matches what you want to do:

| Goal | Recommended starting point | Result |
|---|---|---|
| Evaluate the console with supplied data | Run the release-only demo below | A verified offline report bundle you can open locally. |
| Build a report from your own records | Follow `init -> normalize -> project -> validate -> render -> verify` | A working copy during review, or a release bundle after every gate passes. |
| Integrate the contracts into another application | Use the typed ESM exports described under [Programmatic module exports](#programmatic-module-exports) | Direct access to normalization, projection, validation, rendering, bundling, verification, and generation preflight APIs. |

The installed-package examples use `npx scientific-report-console`. If the executable is already on your `PATH`, `scientific-report-console` is equivalent. The legacy `report-prompt` executable remains an exact compatibility alias for 0.1.x. From a source checkout, use `npm run cli -- <command>`.

### 1. Try the supplied report first

Install the release tarball in a small consumer project, render the checked-in cross-domain example, and verify the result:

```bash
mkdir scientific-report-console-consumer && cd scientific-report-console-consumer
npm init -y
npm install ../scientific-report-console-0.1.0.tgz

npx scientific-report-console demo --release-only --out scientific-report-demo
npx scientific-report-console verify scientific-report-demo
```

Open `scientific-report-demo/report.html` in a browser. The bundle is self-contained: keep the directory together if you copy or archive it. A successful verification prints `Release bundle verification: PASS` and `Release eligible: yes`.

Use `npx scientific-report-console demo --out scientific-report-working-copy` without `--release-only` when you want to inspect the conservative working-copy path. That output is deliberately marked `NOT RELEASE-ELIGIBLE`.

### 2. Build a report from your own records

Before running the pipeline, identify the sources and run records the report is meant to cover, the people responsible for scientific and disclosure review, and the public/available artifacts that must accompany the report. The console does not discover an authoritative source universe or decide what may be disclosed for you.

Create an empty scaffold:

```bash
npx scientific-report-console init work \
  --title "Bounded scientific report" \
  --project-id project.example
```

Edit `work/authoring-input.json` using the [Authoring guide](docs/authoring-guide.md) and [Field dictionary](docs/field-dictionary.md). Register real source identities and locators, preserve unknown values as unknown, and retain failed, negative, excluded, external, and not-performed work. Do not insert plausible defaults merely to satisfy a schema.

Normalize the authoring input and inspect the resulting review work:

```bash
npx scientific-report-console normalize work/authoring-input.json \
  --out work/scientific-report.canonical.json \
  --created-at 2026-08-28T00:00:00.000Z \
  --report-id report.example \
  --report-version 1

npx scientific-report-console todo work/scientific-report.canonical.json
```

Replace the example timestamp and identifiers with registered values for your report. Normalization may write a useful canonical candidate and still exit non-zero when blocking unknowns or review tasks remain. Treat that as an unfinished report, not as a command crash; inspect the printed findings and run `todo` again after corrections.

Create `work/policy.json` to name the disclosure policy used for the public projection. A minimal retain-by-default policy has this shape:

```json
{
  "policy_id": "policy.example.public-v1",
  "policy_version": "1",
  "rules": {
    "default_action": "retain"
  }
}
```

For internal or restricted source reports, also create `work/instructions.json` with an explicit reviewed field action for every scientific change. Instructions use RFC 6901 source pointers and the actions documented by the [disclosure policy](protocol/disclosure-policy.yaml); do not use a retain-by-default policy as a substitute for disclosure review.

Create the public projection, then validate the source/projected pair:

```bash
npx scientific-report-console project work/scientific-report.canonical.json \
  --out work/scientific-report.public.json \
  --projection-out work/disclosure-projection.json \
  --projection-id projection.example.public-v1 \
  --created-at 2026-08-28T00:00:00.000Z \
  --policy work/policy.json

npx scientific-report-console validate work/scientific-report.public.json \
  --source-report work/scientific-report.canonical.json \
  --projection work/disclosure-projection.json \
  --attestation-out work/validation-attestation.json
```

Add `--instructions work/instructions.json` to the `project` command when you created reviewed field actions. Omit it only when no field actions are required and the source disclosure state permits an unchanged projection. Validation is read-only apart from the optional attestation output. A non-zero validation exit means the report is not release-eligible even if an attestation was written.

During authoring and review, render an explicitly marked working copy:

```bash
npx scientific-report-console render work/scientific-report.public.json \
  --source-report work/scientific-report.canonical.json \
  --projection work/disclosure-projection.json \
  --artifact-root work \
  --out work/report-working-copy \
  --working-copy

npx scientific-report-console verify work/report-working-copy --working-copy
```

After every structural, semantic, disclosure, reproducibility, and required human-review gate passes, omit `--working-copy` to build and verify a release bundle:

```bash
npx scientific-report-console render work/scientific-report.public.json \
  --source-report work/scientific-report.canonical.json \
  --projection work/disclosure-projection.json \
  --artifact-root work \
  --out work/report-bundle

npx scientific-report-console verify work/report-bundle
```

Never publish a bundle when the command exits non-zero, verification is integrity-only, or the output says `NOT RELEASE-ELIGIBLE`. `--working-copy`, `--allow-extra-files`, schema acceptance, and successful HTML rendering cannot override the release gate.

### Files produced by the workflow

| Path | Purpose |
|---|---|
| `work/authoring-input.json` | Human-edited compact authoring input. |
| `work/scientific-report.canonical.json` | Authoritative normalized scientific candidate; keep it under the appropriate access controls. |
| `work/scientific-report.public.json` | Disclosure-projected scientific payload used by public rendering. |
| `work/disclosure-projection.json` | Hash-bound record of source-to-public field actions. |
| `work/validation-attestation.json` | Validation result bound to one exact payload; any payload edit makes the old attestation stale. |
| `work/report-bundle/report.html` | Main offline report entry point. |
| `work/report-bundle/package-manifest.json` | Bundle inventory, hashes, identities, entry points, and verification scope. |

Run `npx scientific-report-console <command> --help` for command-specific options and `npx scientific-report-console explain [rule-code]` to inspect validation rules. The generated `README.txt` inside each bundle records how that particular artifact should be opened and interpreted.

## Source-checkout quick start

The commands below match `package.json`.

```bash
# Show CLI help during development
npm run cli -- --help

# Validate the cross-domain example
npm run validate:example

# Render a conservatively marked review demonstration to a separate path
npm run demo -- --out dist/demo-working-copy --force

# Render the release-gated example to dist/demo (safe explicit replacement)
npm run render:example -- --force

# Verify the rendered release-gated bundle
npm run verify:bundle
```

`render` and `demo` refuse to replace an existing output directory unless `--force` is explicit. The quick-start commands therefore use separate demonstration and release-gated paths and opt into replacement deliberately, so the sequence is repeatable. A working-copy verification pass covers its declared integrity/portability scope only; it does not make that artifact release-eligible.

These commands exercise the public scripts declared in `package.json`. Preserve their output and exit status when recording a check. A missing entry point, non-zero exit, skipped suite, incomplete attestation, or scoped working-copy verification is not a release pass.

### End-to-end CLI contract

The first-party command sequence is `init -> normalize -> project -> validate -> render -> verify`:

```bash
scientific-report-console init work --title "Bounded report" --project-id project.example
scientific-report-console normalize work/authoring-input.json \
  --out work/scientific-report.canonical.json \
  --created-at 2026-08-24T00:00:00.000Z \
  --report-id report.example --report-version 1

# policy.json must contain policy_id, policy_version, and rules.
# instructions.json is an optional array of explicit sourcePointer/action records.
scientific-report-console project work/scientific-report.canonical.json \
  --out work/scientific-report.public.json \
  --projection-out work/disclosure-projection.json \
  --projection-id projection.example.public-v1 \
  --created-at 2026-08-24T00:00:00.000Z \
  --policy work/policy.json

scientific-report-console validate work/scientific-report.public.json \
  --source-report work/scientific-report.canonical.json \
  --projection work/disclosure-projection.json \
  --attestation-out work/validation-attestation.json

scientific-report-console render work/scientific-report.public.json \
  --source-report work/scientific-report.canonical.json \
  --projection work/disclosure-projection.json \
  --artifact-root work \
  --out work/report-bundle

scientific-report-console verify work/report-bundle
```

`project` is the only first-party command that changes `payload_role` from `canonical_authoritative` to `public_projection`. Every scientific change must appear as a hash-bound field action. A non-public source report cannot use an empty instruction set. `validate` verifies the source/projected pair and binds the resulting projection record into its attestation. `render` repeats that validation, copies every declared public/available R1+ dependency from `--artifact-root`, uses package-owned templates, bundles the result, and runs release verification.

An unfinished scaffold is expected to retain blocking review tasks. After a complete projection, it can be rendered only with `--working-copy`; the resulting manifest and verifier output say `NOT RELEASE-ELIGIBLE`, and `verify --working-copy` performs integrity-only verification. Neither `--working-copy` nor `--allow-extra-files` can produce a release-eligible result.

### Programmatic module exports

The installed package exposes typed ESM subpaths: `scientific-report-console/normalizer`, `/projection`, `/validator`, `/renderer`, `/bundler`, `/verifier`, and `/generation`. The release pipeline uses these canonical functions:

- `normalizeAuthoringInput` / `normalizeAuthoringFile`;
- `projectDisclosure` and `verifyDisclosureProjection`;
- `validateReport` / `validateReportFile` (pass `disclosureProjection: { sourceReport, projection }` for a public payload);
- `renderReport(report, { outDir, attestation })` for an already projected payload;
- `bundleDirectory` and `verifyBundle`;
- `validatePromptComposition`, `validateGenerationExchange`, and `applyGenerationResponse` for request-owned generation preflight and atomic application;
- `resolveGenerationProfile` and `normalizeS2Response` for the exact version/hash-pinned deterministic S3 route.

Generation responses are untrusted even when both JSON Schemas pass. `validateGenerationExchange` additionally requires the request/response identities and hashes, exact current prompt bundle, exact ordered processed/omitted partition, request-owned authorization roots, root/object/target mappings, and source bindings reconciled to trusted extracted bytes. `applyGenerationResponse` runs that gate before checking base report identity/version/hash, applying operations atomically, and validating the final canonical report. Domain-pack payloads have one reserved append route, `/extensions/domain_payloads/-`, and arbitrary `/extensions` mutation is not authorized. `normalizeS2Response` is the only accepted S3 implementation and resolves only the installed `normalization-profile:s2-preserving-v1` and normalizer tuples; it preserves operations, adverse diagnostics, provenance, and continuation rather than invoking a model.

Run project checks:

```bash
npm run typecheck
npm test
npm run build
```

Or run the combined check:

```bash
npm run check
```

`npm run check` runs type checking, the test suite, and a production build in that order. A successful command only covers the checks implemented in the current repository; it is not a scientific approval or a claim of source completeness.

After `npm run build`, the package exposes the `scientific-report-console` executable from `dist/cli/index.js`. For development, prefer `npm run cli -- <command>` so the TypeScript entry point is used directly.

## Working model

### 1. Register the source universe

Declare the bounded set of ELN entries, files, instrument runs, compute jobs, trials, trajectories, publications, and human attestations the report is meant to cover. Give every registered source a disposition such as `included`, `excluded_with_reason`, `unreadable`, `inaccessible`, `duplicate`, or `unmapped`.

If no authoritative source universe exists, the report may say that all *registered* sources were handled. It must not claim overall completeness.

### 2. Author scientific records

Create or normalize records for questions, entities, work units, attempts, segments, methods, results, failures, evidence, claims, artifacts, and reproducibility units. Bind source-derived values to locators. Keep unknown values unknown; do not infer missing sample counts, seeds, versions, timestamps, paths, units, or citations.

See [Authoring guide](docs/authoring-guide.md) and [Field dictionary](docs/field-dictionary.md).

### 3. Validate declarations

Validation is layered. JSON Schema establishes shape. Semantic rules evaluate cross-object requirements such as source disposition, completion evidence, derivation closure, claim support, conflict handling, reproducibility prerequisites, disclosure safety, and attestation binding.

A validation attestation belongs outside the scientific payload and is valid only for the payload hash and rule/profile versions it names. Editing the payload invalidates the old attestation.

### 4. Produce a public projection

A disclosure projection converts authoring material into public scientific JSON. A `withheld` field records that a value exists but is intentionally unavailable; it does not authorize copying the value into HTML, indexes, manifests, SVG, filenames, locators, or audit text. Public projection and redaction must happen before rendering and bundling.

Multiple omissions from one array are interpreted against original source pointers and applied in descending original-index order, so removing one member cannot shift a later protected identity into the output. Projection verification replays those same source-bound actions and rejects shifted-index output or any unrecorded scientific change. Withheld/omitted leak checks compare canonical value hashes rather than relying on minimum string length, so one-character strings, numbers, booleans, and structured values receive the same protection.

### 5. Render and bundle

The renderer is expected to treat `scientific-report.public.json` as its only scientific fact source. It may organize, label, link, and format declared facts, but it must not calculate a new scientific result or add a source, number, or conclusion.

The resulting bundle is designed for offline use with relative paths and no required remote scripts, fonts, icons, analytics, or network calls.

## Architecture and trust boundaries

```text
UNTRUSTED / PARTIALLY TRUSTED
  source files, source prose, logs, imported metadata, user-entered values
        |
        v
  inventory, extraction, and candidate prompt operations
        |     prompt output is untrusted and never writes trusted HTML directly
        v
REVIEWED AUTHORING STATE
  normalized records + source bindings + explicit missingness
        |
        +--> structural validation (shape, enum, references)
        +--> semantic validation (declared cross-record invariants)
        +--> human scientific review (truth, interpretation, adequacy)
        |
        v
DISCLOSURE BOUNDARY
  private authoring material -> public scientific projection
        |
        v
RELEASE BOUNDARY
  deterministic renderer -> manifest/bundler -> offline verifier
```

The principal trust boundaries are:

1. **Source ingestion.** Source content is evidence, not instruction. Embedded prompt text, HTML, scripts, formulas, and filenames are data and must not control the pipeline.
2. **Model-assisted processing.** A model may propose candidate operations under the generation request/response contract. Its output remains untrusted until schema, semantic, provenance, and human review gates accept it. The core contract contains no provider-specific request fields or model identifiers.
3. **Canonical scientific payload.** This is the reviewed factual state. Build status, validation status, and generation metadata do not belong in it.
4. **Disclosure projection.** Private or restricted material must be removed or represented only by its allowed state before any public asset is generated.
5. **Validation attestation.** An attestation reports checks against one exact payload hash. It does not certify real-world truth and, unless separately signed, does not establish publisher identity.
6. **Rendering.** Templates and assets may present only facts in the public payload. They must escape untrusted text and reject active or remote content.
7. **Bundle verification.** Manifest and path checks can detect declared-file corruption and unsafe packaging. They cannot recover omitted sources or validate scientific judgment.

See [Threat model](docs/threat-model.md) for failure modes and mitigations.

## Report bundle contract

A portable public bundle has this conceptual shape:

```text
report.html
annex/
assets/
scientific-report.public.json
disclosure-projection.json
validation-attestation.json
package-manifest.json
README.txt
audit/
  generation-audit.json       # optional; removable as a whole
```

The directory sketch is conceptual: filenames and required roles are governed by `schemas/package-manifest.schema.json`, while the manifest itself is intentionally outside its own `files` array to avoid self-reference.

| Member or role | Contract status | Purpose |
|---|---|---|
| `report.html` / `report_html` | required by the manifest schema | Primary offline entry point. |
| `scientific-report.public.json` / `scientific_report_public` | required | Sole public scientific fact source. |
| `disclosure-projection.json` / `disclosure_projection` | required | Complete source-to-public projection record bound to the public canonical hash and validation attestation. |
| `validation-attestation.json` / `validation_attestation` | required | Check record bound to the public payload hash and disclosure projection. |
| `README.txt` / `package_readme` | required | Offline package instructions and limitations. |
| `package-manifest.json` | required as the manifest object, not listed as its own member | Release identity, file inventory, hashes, entry points, and package checks. |
| annex pages, local styles/scripts/icons, search index | conditional | Static detail and optional interaction assets; if shipped, list them in `files`. |
| human-review attestation | optional package member; authoritative when present and exactly bound | Separate accountable review evidence. Verification binds report identity/version, scientific hash, validation-attestation identity/hash, and observed validation status. In release mode, any exactly bound decision other than `approve`—especially `block_release`—plus any scientific `concern` or unresolved review task is an error and makes both `ok` and `releaseEligible` false. Integrity-only mode may inspect the bytes but always reports `releaseEligible: false`. |
| `audit/generation-audit.json` | optional and removable | Peripheral generation history; never scientific evidence or a reproducibility upgrade. |

### Required invariants

- `scientific-report.public.json` is the only scientific fact source for public HTML and annex pages.
- `validation-attestation.json` is separate from the scientific payload and binds to its cryptographic hash and exact disclosure-projection record.
- Every HTML, annex, style, script, and icon member is byte-compared with a fresh package-owned deterministic render; rebuilding a manifest around contradictory HTML fails.
- Every public, available dependency declared by an R1-or-higher reproducibility unit is copied, hash/size checked, marked required, and bound by `source_artifact_id` in the manifest.
- `package-manifest.json` enumerates release files and their integrity metadata according to its schema.
- Paths are relative, normalized, contained by the bundle root, and portable across directories.
- Public files contain no original `withheld` values, secrets, credentials, unsafe absolute paths, or required remote resources.
- The report remains scientifically readable without JavaScript. JavaScript may enhance search, filtering, and inspection, but cannot be the sole carrier of facts.
- Search and filters do not silently remove failures, exclusions, counterevidence, retractions, or missingness from the underlying archive.
- The optional generation audit may be deleted without changing scientific content, scientific payload hash, validation state, or reproducibility status.
- A payload modification requires a new projection, attestation, render, manifest, and verification pass. Do not copy a prior attestation into a rebuilt bundle.

The protocols define normative scientific semantics; compatible schemas define exact required serialized fields. A schema/protocol mismatch is a release blocker, not a choice of whichever vocabulary is convenient. Bundle presence and hash checks do not imply that every scientific object is adequately evidenced.

## Directory guide

| Path | Purpose | Trust role |
|---|---|---|
| `.github/` | CI workflow, dependency updates, issue forms, and pull-request template | Repository automation and collaboration policy |
| `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` | License, release history, contribution rules, vulnerability process, and community standards | Public repository governance |
| `PROJECT_PLAN.md` | Roadmap, design rationale, and target repository shape | Planning context; not an executable or serialized contract |
| `package.json`, `package-lock.json`, `tsconfig.json` | Development commands, locked JavaScript dependencies, and TypeScript compiler configuration | Build configuration; command presence is not a successful-run record |
| `adr/` | Accepted architecture decisions for completeness, counting, claim graph, reproducibility, identifiers, bundles, disclosure, and runtime | Rationale and compatibility constraints |
| `protocol/` | Epistemic, applicability, coverage, state, result, argument, disclosure, and gate policies | Human-readable policy source |
| `schemas/` | Authoring, canonical payload, projection, recipe, generation, attestation, and manifest contracts | Structural contract |
| `schemas/defs/` | Reusable source, work, lineage, derivation, argument, invocation, environment, and random-state definitions | Shared structural vocabulary |
| `schemas/packs/` | Additive wet-lab, AI/ML, and molecular-dynamics schema packs | Domain extensions; may not relax core rules |
| `prompts/` | Provider-neutral integrity instructions, stage prompts, domain fragments, and examples | Candidate-operation generation only |
| `rules/` | Semantic rule registry, severity profiles, and domain overlays | Automated declaration checks |
| `reviews/` | Cross-surface findings and release blockers | Review evidence; unresolved blockers prevent conformance claims |
| `src/` and planned `tooling/` modules | CLI and implementation modules for normalization, validation, redaction, rendering, bundling, and verification | Executable enforcement where present |
| `templates/scientific-console/` | Offline report templates, partials, styles, scripts, and icons | Deterministic presentation specification/implementation |
| `examples/` | Minimal, domain, cross-domain, failure, conflict, and restricted-data examples | Demonstration and fixtures, not production evidence |
| `tests/` | Schema, semantic, prompt, render, accessibility, security, and bundle tests | Regression evidence only for tests that exist and were run |
| `docs/` | Authoring, review, reproducibility, interaction, threat, and extension guidance | Operational documentation |
| `dist/` | Generated build or demonstration output when produced | Disposable build artifact; never the authoring source of truth |
| `adapters/` | Optional future provider-specific thin adapters | Outside the provider-neutral core |

Not every planned directory must be present in every development snapshot. Consult the repository tree and versioned schemas rather than assuming a planned component is implemented.

## Scientific review

Automated validation and scientific review are complementary:

- automated checks answer questions such as “is the reference resolvable?”, “is every registered source disposed?”, and “does this attestation hash match?”;
- scientific review asks whether a source is credible, a comparison is meaningful, controls are adequate, assumptions are justified, and the wording is proportional to the evidence.

Use the [Scientific review rubric](docs/scientific-review-rubric.md) before publication. Review outcomes should identify blockers and unresolved tasks; avoid replacing the rubric with a single opaque score.

## Reproducibility

Reproducibility is assessed per `ReproducibilityUnit`, not assigned as a vague report-wide badge. Each unit records its inputs and derivation closure, historical invocation, proposed recipe, environment, random state, access conditions, acceptance criteria, rerun evidence, output comparison, and claim coverage.

A recipe that has not been run is not a verified rerun. A successful same-team computational rerun is not an independent reproduction, and an independent experimental repeat is not interchangeable with deterministic replay. See [Reproducibility contract](docs/reproducibility-contract.md).

## Console behavior

The console supports a 30-second overview and progressive inspection from question to claim, work history, derivation, source locator, and reproduction material. Its static document order is authoritative; client-side interactions are optional views over the same content. See [Console interaction model](docs/console-interaction-model.md).

## Extending the protocol

Domain packs and adapters must be additive. They may introduce stricter applicability, fields, semantic gates, prompt fragments, render views, and tests, but may not redefine missingness, count external work as project completion, hide failed attempts, weaken disclosure rules, or allow presentation code to create scientific facts.

See [Extension guide](docs/extension-guide.md).

## Current MVP limitations

The MVP is intentionally narrow. Contract alignment and an automated release-eligible result do not by themselves make a bundle scientifically approved or institutionally publishable. Unless a repository version and its recorded checks and reviews explicitly demonstrate otherwise, assume the following limitations:

- The zero-based protocol/schema vocabulary blockers are resolved in the active contract set, but this does not prove future versions remain aligned. Any newly discovered mismatch is a release blocker and must be corrected as one versioned migration across protocol, schema, types, validator, examples, renderer, prompts, and documentation; silent compatibility aliases remain prohibited.
- Validation attestations distinguish exact-file bytes from `sorted-keys-utf8-v1` canonical JSON and record the selected hash basis, canonicalization, and exact payload byte size. Implementations must reproduce the declared basis; they may not compare hashes across bases.
- The packed release contains only the compiled runtime and declared protocol/schema/rule/prompt/template/example assets. `prepack` runs the full check before npm creates a tarball; bypassing npm lifecycle scripts is not a recorded release build.
- The system does not discover an authoritative source universe automatically. Authors must register and govern it.
- Source parsing and model-assisted extraction can miss or misclassify records; they require review against source locators.
- Schema validation proves shape, not truth, causality, experimental adequacy, source authenticity, or overall completeness.
- Semantic rules cover enumerated invariants, not every domain-specific scientific failure mode.
- Entity resolution, sample identity, prospective/adaptive/post hoc timing, conflict adjudication, exclusions, causal/mechanistic claims, cross-domain equivalence, and disclosure decisions remain human-controlled.
- Reproducibility grades are declarations unless supported by stored rerun and comparison evidence. The MVP does not make independent reproduction happen.
- Hashes detect byte changes only for the material included in the hash/manifest scope. Unsigned files do not establish author identity or trusted publication time.
- Offline rendering reduces network exposure but does not make arbitrary imported HTML, SVG, URLs, or filenames safe; sanitization and bundle verification remain required.
- Enhanced search, filtering, printing, browser compatibility, accessibility, and very-large-report behavior may have incomplete automated coverage. The no-JavaScript reading path is the fallback contract.
- Provider-specific invocation, billing, token accounting, and SDK behavior are outside the scientific core. Optional generation audit data must not affect scientific conclusions or reproducibility ratings.
- The project does not replace institutional requirements for ethics, consent, biosafety, data protection, licenses, records retention, or regulatory review.

When a capability is described as a protocol requirement, that is an intended semantic guarantee. It becomes an automated guarantee only when the corresponding schema, rule, implementation, and passing regression test exist in the version being used.

## License

Scientific Report Console is licensed under the [Apache License 2.0](LICENSE). Contributions submitted for inclusion are accepted under the same license unless explicitly stated otherwise.

## Documentation

- [Field dictionary](docs/field-dictionary.md)
- [Authoring guide](docs/authoring-guide.md)
- [Scientific review rubric](docs/scientific-review-rubric.md)
- [Reproducibility contract](docs/reproducibility-contract.md)
- [Console interaction model](docs/console-interaction-model.md)
- [Threat model](docs/threat-model.md)
- [Extension guide](docs/extension-guide.md)
- [Release checklist](docs/release-checklist.md)
