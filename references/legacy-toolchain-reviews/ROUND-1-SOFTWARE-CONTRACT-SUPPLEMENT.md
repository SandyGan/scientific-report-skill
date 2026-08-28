# Round 1 software-contract supplement

**Scope:** independent zero-context, read-only audit of protocol, schemas, types, normalizer, validator, rule registry, examples, CLI, renderer, bundler, verifier, and operational documentation.

**Status:** nine reproduced first-pass findings. These are supplement candidates until deduplicated against the main round and independently reverified.

## Findings

### SC-01 — Safe patch contract cannot be represented — High

The prompt requires request-scoped `permitted_patch_roots` and response `prompt_id`/`prompt_version`, but the closed request/response schemas reject those fields. The documented candidate-operation shape also disagrees with `CandidateOperation`.

Anchors: `prompts/README.md:18`, `prompts/README.md:26-28`, `schemas/generation-request.schema.json:257-258`, `schemas/generation-response.schema.json:9-21`.

Disposition: overlaps main findings F2 and F4.

### SC-02 — Scoped or skipped validation is release-eligible — High

Selected-rule validation reports `complete` and `releaseEligible`; disabling domain-pack validation omits `PACK001` yet remains release-eligible; publication-profile required security/accessibility rules may be `not_applicable`; release-profile external-attestation and rerun requirements are not enforced.

Anchors: `src/validator/semantic.ts:187-200`, `src/validator/index.ts:212-214`, `src/validator/index.ts:259-274`, `src/validator/attestation.ts:235`, `rules/severity-profiles.yaml:77-79`.

### SC-03 — Loaded rule and overlay contracts are hashed but not executed — High

Changing a loaded rule condition to an always-violated predicate does not alter evaluation; changing overlay schema ID and enabled rule IDs does not alter pack behavior. Hard-coded dispatch reports automated passes while loaded executable-looking contracts are ignored.

Anchors: `rules/registry.yaml:3-10`, `src/lib/rules.ts:223-233`, `src/validator/semantic.ts:26-127`, `src/validator/domain.ts:80-85`.

### SC-04 — Disclosure-state laundering passes automated rules — High

A claimed public projection can change a known scientific value to unknown, remove provenance, and still pass automated disclosure/projection rules because no bound source payload or projection record is compared.

Anchors: `src/validator/disclosure-rules.ts:107-125`, `src/validator/disclosure-rules.ts:150-164`, `src/validator/disclosure-rules.ts:196-213`.

### SC-05 — Omitted failures in registered source content are attested as passes — High

A hash-matched source file explicitly stating that a run failed can be represented with a neutral title and no failure record; `NEG001` and `EPI004` pass because validators inspect titles/extensions rather than integrity-bound extraction coverage.

Anchors: `rules/registry.yaml:338-356`, `src/validator/negative-rules.ts:85-92`, `src/validator/negative-rules.ts:117-133`.

### SC-06 — Quantitative claim can pass without derivation or exact locator — High

A quantitative claim with no result/derivation records and evidence linked only to a source-item ID and whole-source locator passes claim and derivation gates.

Anchors: `protocol/argument-and-bridge.yaml:88-89`, `src/validator/claim-rules.ts:6-31`, `src/validator/derivation-rules.ts:182-197`.

### SC-07 — R1 accepts artifact access as not applicable — High

An R1 unit naming a hashed artifact can mark access `not_applicable` and pass, despite the protocol requiring `available_now` or `verified_procedure` for satisfied access.

Anchors: `protocol/reproducibility-policy.yaml:71-76`, `src/validator/reproducibility-rules.ts:66-76`.

Disposition: overlaps main finding REPRO-006 but adds an explicit `not_applicable` contradiction.

### SC-08 — Non-allowlisted POSIX absolute paths pass the release stack — High

A public `/opt/...` path passes validation, rendering, bundling, and verification because path detection enumerates familiar roots instead of detecting generic absolute paths.

Anchors: `src/validator/disclosure-rules.ts:47`, `src/renderer/safety.ts:91-99`, `src/bundler/offline.ts:423`.

Disposition: overlaps main finding `renderer-absolute-path-root-bypass`.

### SC-09 — Normalizer is not bound to authoring or output schemas — Medium

The normalizer accepts record kinds rejected by the authoring schema and can emit collection-invalid enum values because it validates neither the input nor the normalized report and uses field-name-global enum handling.

Anchors: `schemas/authoring-input.schema.json:58-86`, `src/normalizer/schema-shapes.ts:682-685`, `src/normalizer/normalize.ts:267-299`, `src/normalizer/normalize.ts:2139-2143`.

## Review limits

No browser-level `file://`, keyboard, screen-reader, cross-browser, dependency-vulnerability, supply-chain, or human scientific-truth review was performed. Temporary builds and adversarial fixtures were used; project files were not edited by the reviewer.
