# Threat model

This threat model covers the authoring pipeline, model-assisted candidate generation, validation, disclosure projection, deterministic rendering, offline packaging, and report consumption. It protects scientific integrity and confidentiality as well as conventional software security.

It is a living model. Reassess it when adding a source parser, domain pack, rule, template, browser feature, archive format, signature mechanism, network access, or provider adapter.

## Security objectives

### Scientific integrity

- The public report presents only facts and relationships in the reviewed public scientific payload.
- Planned, inferred, external, not-performed, and unknown work cannot become project-performed work through normalization or prose.
- Failures, null results, exclusions, conflicts, corrections, and retractions remain visible.
- Numeric claims preserve provenance/derivation, units, population/denominator, and uncertainty as applicable.
- Validation and reproducibility states cannot be upgraded by filenames, prose, generated audit, or stale metadata.

### Confidentiality and disclosure

- Restricted and withheld values do not leak through public JSON, HTML, annexes, indexes, scripts, CSS, SVG, comments, manifests, filenames, paths, logs, errors, or metadata.
- Credentials and personal/sensitive data are not embedded in recipes or bundles.
- A public projection preserves `withheld` as a state without revealing or enabling inference of the value.

### Bundle integrity and provenance

- A validation attestation binds to exactly one canonical scientific payload digest and names the canonicalization/check context.
- A package manifest binds the intended release files and rejects unsafe paths.
- Offline movement does not silently switch to remote or outside-bundle resources.
- Historical records and revisions remain append-only and downstream invalidation is propagated.

### Availability and reviewability

- Core scientific content remains available without JavaScript or network access.
- Malformed or large inputs fail explicitly rather than producing partial output labeled complete.
- A reviewer can inspect source coverage, evidence, missingness, and limitations even when enhancements fail.

## Assets

| Asset | Why it matters |
|---|---|
| private authoring material | May contain restricted data, identities, credentials, absolute paths, unpublished results, and withheld values. |
| source-universe inventory and snapshots | Defines the only defensible coverage denominator and cutoff. |
| canonical scientific payload | Authoritative normalized scientific facts for a report revision. |
| source bindings and locators | Permit review and expose provenance gaps; may themselves be sensitive. |
| artifacts, recipes, invocations, environments, random state | Support derivation and replay; may expose infrastructure or secrets. |
| claim/argument/dependency graph | Controls scientific inference and correction propagation. |
| public disclosure projection | Exact fact source allowed for release. |
| validation attestation | Reports implemented check results for one payload digest. |
| package manifest and bundle | Material delivered to readers and archives. |
| templates/rendering code | Must not add facts or execute untrusted content. |
| optional generation audit | May contain prompts, source fragments, provider metadata, or operational identifiers; not scientifically authoritative. |
| reviewer approvals and revision history | Establish accountable scoped decisions; may require separate signature/governance controls. |

## Actors and capabilities

### Expected actors

- authors and source custodians;
- domain, disclosure, security, and reproducibility reviewers;
- release operators;
- readers and independent reproducing teams;
- parsers, validators, renderers, bundlers, and verifiers;
- optional provider-specific adapters and external model services.

### Threat actors and failure sources

- malicious source author who embeds instructions, active content, deceptive identifiers, or exfiltration URLs;
- compromised or careless contributor who omits, relabels, overstates, or exposes material;
- model output that hallucinates, follows source-embedded instructions, truncates silently, or emits malicious markup;
- malicious bundle producer who swaps payload, attestation, manifest, templates, or assets;
- malicious/compromised dependency or build environment;
- reader opening the bundle in a permissive browser or extracting a crafted archive;
- ordinary mistakes: wrong snapshot, stale attestation, ambiguous `null`, copied paths, bad entity merge, lost failed attempt, permissive filter, or post hoc comparator.

The threat model does not assume that all input sources, authors, model outputs, validators, or build hosts are trustworthy.

## Trust boundaries

### B1. Source systems to ingestion

Inputs may contain prompt injection, malformed syntax, formulas/macros, active HTML/SVG, path names, embedded files, misleading metadata, or invalid encodings. Content is evidence data, never pipeline instruction.

### B2. Candidate generation to reviewed authoring state

Parser/model output is untrusted candidate data. It cannot establish known facts, execution, completion, scientific interpretation, validation, or HTML. Only allowed candidate operations with registered source bindings may enter review.

### B3. Private authoring state to public projection

This is the confidentiality boundary. Projection must remove private values and unsafe locators while preserving safe epistemic/disclosure states.

### B4. Canonical payload to validation attestation

Validation reads one exact payload/canonicalization and emits a separate result. The attestation must not become valid for a changed payload through filename reuse or mutable references.

### B5. Public payload to renderer

Rendering is deterministic presentation. Templates and helpers are code; payload strings are untrusted. Rendering must escape text and validate URL/path contexts.

### B6. Rendered tree to package/bundle

The bundler must enforce path containment, manifest scope, local-resource policy, and safe file identities. The verifier operates on final release bytes, not build-workspace assumptions.

### B7. Bundle to reader/browser

Browsers interpret HTML, CSS, JS, SVG, URLs, MIME types, and `file://` privileges. CSP is defense in depth, not the primary sanitizer.

### B8. Core to provider adapter/network

The scientific core is provider-neutral. An adapter may send approved chunks to an external service and receive candidate responses, but provider request/response shapes, credentials, and model metadata stay outside canonical schemas. Adapter policy must define what data may leave the boundary.

## Key threats and mitigations

The controls below are protocol requirements or recommended deployment controls, not claims that the current code implements or has tested them. Determine automated coverage from the active schemas, rule registry, implementation, fixtures, and recorded check output; treat absent or unrun controls as absent or unrun.

### T01. Source omission and completeness inflation

**Scenario:** An author registers only favorable files, or all registered items are dispositioned and the report is labeled comprehensive despite no authoritative inventory.

**Impact:** Selective evidence, missing failures/counterevidence, invalid resolution claims.

**Controls:**

- require a `SourceUniverse` with authority basis, boundary, cutoff, snapshot, and item IDs;
- derive completeness class from authority, accounting, accessibility, and incorporation axes;
- permit absolute completeness wording only for an authoritative exhaustive and reconciled universe;
- retain inaccessible, unreadable, duplicate, excluded, and unmapped items with denominators;
- use independent source-custodian review and bottom-up source sampling.

**Residual risk:** No validator can prove that an asserted authoritative registry is genuinely exhaustive or that undisclosed sources do not exist.

### T02. Prompt injection through source content

**Scenario:** A source says “ignore prior instructions,” requests secret disclosure, supplies a fake schema, or asks the model to mark work complete.

**Impact:** Invented facts, exfiltration, policy bypass, malformed candidate operations.

**Controls:**

- delimit source content and label it untrusted;
- allow only schema-constrained candidate operations;
- pass registered content IDs/locators rather than authority through prose;
- reject unregistered IDs, invented locators, narrative HTML, provider/tool instructions, and forbidden inferences;
- run generation with least data and no unnecessary tools/network access;
- preserve `needs_review`, `cannot_complete`, truncation, and omitted item IDs;
- require human review for material operations.

**Residual risk:** Structured output reduces but does not eliminate semantic manipulation or plausible hallucination.

### T03. Hallucinated or upgraded scientific facts

**Scenario:** A parser/model fills a missing seed, unit, sample count, version, citation, completion state, or conclusion from convention.

**Impact:** False provenance and irreproducible or scientifically misleading claims.

**Controls:**

- explicit missing-value envelopes;
- known values require source/derivation bindings;
- forbidden sentinel/default normalization;
- assertion classes and execution truth classification;
- semantic rules for completion, derivation, claim support, and negative-result interpretation;
- controlled wording that cannot introduce new facts;
- source-locator review.

**Residual risk:** A fabricated source binding may be syntactically valid. Review must inspect high-impact bindings.

### T04. Planned/external/inferred work represented as performed

**Scenario:** Detailed methods, an external paper, a successful artifact filename, or inferred execution is counted as project completion.

**Impact:** False project record and inflated progress/resolution.

**Controls:**

- orthogonal work state and execution scope;
- completion criteria/assessment and qualifying attempt evidence;
- truth classification available to renderer;
- count definitions with scope, unit, numerator, denominator, and cutoff;
- blocker rules for ownership/state inflation.

### T05. History erasure and survivorship bias

**Scenario:** A successful retry overwrites a crashed run; failed trials or excluded results disappear.

**Impact:** Biased evidence, hidden parameter changes, understated risk, false replay history.

**Controls:**

- append-only attempts/segments and revision events;
- separate failure events and result dispositions;
- restart predecessor/checkpoint/parameter-diff records;
- source-inventory reconciliation against runs/jobs/trials;
- UI/search/print requirements for adverse records.

### T06. Entity confusion and false independence

**Scenario:** Similar labels merge different samples/constructs; aliquots, frames, seeds, models, or citations are counted as independent evidence.

**Impact:** Leakage, pseudoreplication, false corroboration, invalid cross-domain mechanisms.

**Controls:**

- versioned entities and material lineage;
- explicit human review of merges/relabeling/correspondence;
- evidence dependency groups and shared ancestors;
- domain rules for donors, pools, trajectories, labels, checkpoints, constructs, and conditions;
- cross-domain bridge alignment and validity.

**Residual risk:** Identity and independence are frequently domain/context judgments and may remain unknown.

### T07. Derivation or notebook state substitution

**Scenario:** A figure/number is generated from a different filter, row set, notebook order, code tree, or checkpoint than the record claims.

**Impact:** Wrong numbers with plausible presentation; stale downstream claims.

**Controls:**

- closed DataSlice/Derivation/AnalysisRun/Artifact/Evidence/Claim chain;
- source/input/output hashes and code/config identity;
- actual invocation and execution order records;
- dependency invalidation on input, code, filter, or artifact change;
- rerun comparator bound to target identities.

**Residual risk:** Hashes show identity, not algorithm correctness or absence of hidden state.

### T08. Null-result and failed-control overinterpretation

**Scenario:** A non-significant or zero signal is called proof of no effect after control failure or with unknown sensitivity.

**Impact:** False counterevidence or equivalence claim.

**Controls:**

- independent scientific-effect, statistical-decision, interpretability, disposition, and failure axes;
- require controls, QC, detection limit/MDE, intervals, population/exclusions, and valid equivalence bounds;
- blocker rule for unsupported biological absence;
- reviewer checklist and qualified wording.

### T09. Dependent evidence and argument laundering

**Scenario:** One source propagates through multiple figures/models/citations and appears as independent support, or an intermediate inference introduces an unbound fact.

**Impact:** Inflated certainty and unsupported mechanistic/causal claims.

**Controls:**

- explicit evidence, argument, dependency, bridge, and conflict graph;
- acyclic claim/argument subgraph;
- dependency-group counting;
- no unbound entities/numbers/conditions in argument steps;
- causal/mechanistic alternative-explanation and bridge requirements;
- support/retraction propagation.

### T10. Conflict suppression and stale correction

**Scenario:** One of two incompatible values is overwritten, or retracted upstream evidence remains active in summaries.

**Impact:** False settlement and invalid downstream conclusions.

**Controls:**

- conflict sets with matched-context evaluation and decision events;
- preserve contextual heterogeneity rather than merge;
- append-only revisions and downstream invalidation;
- recompute claims/question summaries after correction;
- block release when propagation is incomplete.

### T11. Reproducibility inflation

**Scenario:** Available code, a recipe, a container, a smoke test, or one same-team run is labeled fully reproduced.

**Impact:** Readers overestimate replay and independent verification.

**Controls:**

- per-unit axes and exact R0/R1/R2/R3 prerequisites;
- history/recipe normalized comparison;
- predefined comparator;
- integrity-bound replay events;
- explicit independence boundary and category;
- conservative lower bound and coverage denominators;
- no weighted/average reproducibility score.

### T12. Stale or forged validation status

**Scenario:** A producer edits scientific JSON but reuses a prior “passed” attestation, or writes “validated” in prose/filename.

**Impact:** Unchecked content appears approved.

**Controls:**

- separate attestation with canonicalization algorithm and payload digest;
- exact digest comparison at render/verify time;
- mismatch/absence/expiry/unknown becomes `not_verified`, never passed;
- final manifest binds both files;
- display payload and bound hashes together;
- treat unsigned attestations as integrity metadata, not identity proof.

**Residual risk:** If an attacker controls payload, attestation, and unsigned manifest, they can replace all three consistently. Trusted signatures/transparency or distribution-channel controls are needed for publisher authenticity.

### T13. Withheld-value leakage and inference

**Scenario:** A private value is removed from the visible paragraph but remains in JSON, an index, HTML attribute/comment, SVG metadata, filename, absolute path, error, audit file, digest label, ordering, or length.

**Impact:** Confidentiality, privacy, ethics, license, or security breach.

**Controls:**

- project private state to public data before rendering;
- public withheld envelope has null value and non-sensitive policy reason/decision identifier;
- never hash/encode a secret into a public identifier when guessing is feasible;
- scan every emitted file and filename, including optional audit;
- use allowlisted public fields rather than only pattern-based deletion;
- test known canary values and encoded/normalized variants;
- separate access metadata from credentials;
- disclosure reviewer approves exact projected payload hash.

**Residual risk:** Automated scanners cannot detect all semantic or side-channel disclosures. Data minimization and expert review are primary controls.

### T14. HTML/script/style/SVG injection

**Scenario:** A title, claim, locator, artifact, or imported graphic contains markup/script, event handlers, dangerous CSS, an active SVG, or a `javascript:` URL.

**Impact:** Code execution, local data access attempts, deceptive UI, network exfiltration, content spoofing.

**Controls:**

- contextual auto-escaping for text and attributes;
- avoid raw/unescaped template helpers for scientific content;
- URL scheme and path allowlists;
- reject or sanitize imported HTML/SVG; prefer fixed local icon sprite controlled by the project;
- no inline event handlers or source-derived CSS;
- strict CSP (`default-src 'self' data:`, no connections/objects/base/forms as appropriate);
- no remote scripts/styles/fonts/analytics;
- test injection fixtures in every rendering context.

**Residual risk:** CSP support and `file://` behavior vary; escaping/sanitization remain mandatory.

### T15. Path traversal, symlink, and archive extraction attacks

**Scenario:** A source-derived filename uses `../`, absolute paths, drive/UNC paths, percent-encoding, Unicode separators, symlinks, or archive entries to escape the bundle root or overwrite files.

**Impact:** Arbitrary read/write during build/extraction, data exposure, bundle corruption.

**Controls:**

- generate filenames from safe IDs, not raw labels/paths;
- normalize and resolve paths, then enforce containment under an approved root;
- reject absolute, parent, NUL, drive-letter, UNC, reserved-device, and ambiguous encoded paths;
- define a symlink policy (normally reject symlinks in public bundles);
- perform checks after decoding/normalization and before open/write;
- use safe archive extraction with entry count/size limits;
- manifest paths use one canonical separator/representation;
- verify final filesystem tree, not only pre-normalized names.

### T16. Unsafe external references and network exfiltration

**Scenario:** An artifact URL, CSS import, image, link preview, or script causes the browser/build to contact an attacker and leak paths/searches or fetch active content.

**Impact:** Exfiltration, tracking, nondeterministic report, broken offline archive.

**Controls:**

- no required remote dependencies;
- `connect-src 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` CSP as appropriate;
- no automatic URL fetch in renderer/client;
- explicit inert external links with scheme allowlist and no referrer;
- vendor/package required assets locally;
- offline/network-disabled verification.

### T17. Filter, search, and print deception

**Scenario:** Default filters hide failures or a filtered print is shared as the complete report.

**Impact:** Selective presentation despite intact underlying data.

**Controls:**

- default unfiltered view;
- textual active-filter status and visible/total counts;
- clear/reset action;
- full archive remains available without JavaScript;
- filtered print watermark/context and printed filter criteria;
- canonical counts remain visible near filtered counts;
- regression fixtures ensure adverse states are searchable and full-print visible.

### T18. Denial of service and truncation

**Scenario:** Extremely deep graphs, huge strings/files, decompression bombs, recursive references, regex-heavy search, too many DOM nodes, or model context limits cause hangs or partial processing.

**Impact:** Unavailable report or incomplete result mislabeled complete.

**Controls:**

- bounded input/file/archive sizes and counts;
- iterative graph algorithms with cycle/depth limits;
- safe regex/no user-compiled catastrophic patterns;
- large-report annex/index splitting;
- continuation contract with processed/omitted IDs and cursor;
- fail closed: `needs_review`/`cannot_complete`, never silent truncation;
- resource/time limits and explicit diagnostics;
- preserve source accounting after partial failure.

### T19. Supply-chain and build compromise

**Scenario:** A dependency, package script, template, lockfile, compiler, or build host injects content or steals authoring data.

**Impact:** Full confidentiality/integrity compromise.

**Controls:**

- locked dependencies and review of dependency changes;
- least-privilege build environment with no unnecessary secrets/network;
- separate private input processing from public release staging;
- reproducible/controlled build records where feasible;
- scan generated bytes and verify final manifest in a clean environment;
- code review for template helpers, redaction, path, and hashing changes;
- trusted distribution/signing controls for high-assurance releases.

**Residual risk:** Lockfiles do not prove dependency safety. Organizational software-supply-chain controls remain necessary.

### T20. Provider-adapter data exposure and lock-in

**Scenario:** A provider adapter sends restricted source chunks, logs prompts/responses, embeds credentials, or leaks provider-specific shapes/model IDs into the core payload.

**Impact:** Confidentiality breach, irreproducible core contract, vendor coupling, misleading scientific audit.

**Controls:**

- adapters are thin and outside core schemas/protocols;
- explicit allowlist of fields/chunks permitted to leave the boundary;
- data minimization, retention/residency policy, and operator approval;
- credentials from secret mechanisms, never payload/recipe/public audit;
- normalize responses to the provider-neutral generation response contract;
- reject provider metadata from scientific patches;
- optional audit is disclosure-reviewed and removable without scientific effect.

## Canonicalization, hashes, and signatures

### Canonicalization

A payload digest is comparable only when both parties use the same canonicalization algorithm/version and character/number handling. The attestation names that algorithm. Hash the canonical public scientific payload, not an in-memory object with unstable key ordering or a rendered narrative.

### Hash limitations

Hashes provide integrity comparison for named bytes. They do not prove:

- who created the bytes;
- when they existed;
- that sources are complete/authentic;
- that scientific claims are valid;
- that a withheld secret cannot be guessed from a low-entropy public hash.

Do not publish hashes of low-entropy secrets or identifiers as “safe redaction.”

### Signatures

If publisher identity/non-repudiation is required, add a separate trusted signature/transparency mechanism over a precisely defined manifest/root digest. Signature support is not implied by the core manifest/attestation unless implemented and verified. Key management, revocation, timestamping, and trusted distribution are outside a bare hash contract.

## Disclosure projection requirements

The safe order is:

```text
private authoring payload
  -> policy/applicability evaluation
  -> explicit public projection
  -> public-schema and semantic validation
  -> canary/sensitive-data scan
  -> deterministic render
  -> complete output scan
  -> manifest/bundle
  -> final verification and disclosure approval
```

Do not render private data and redact the resulting HTML. That misses indexes, attributes, comments, JSON, SVG, filenames, and derived strings.

For each withheld field, test that:

- public `value` is null;
- state remains `withheld`, not `unknown`;
- public `source_bindings` and `derivation_bindings` contain no protected provenance;
- public `provenance_status` is `absent`, indicating removal from this projection rather than private ignorance;
- the non-sensitive reason code and disclosure-decision identifier are present;
- no count/order/length/digest leaks the value beyond approved policy;
- every renderer/annex/search/print path displays only safe state metadata.

## Secure rendering requirements

- Compile templates from trusted project files only.
- Treat every payload string as untrusted.
- Escape separately for HTML text, attributes, URL, JSON/script data, CSS, and SVG contexts; avoid embedding payload data in script/style.
- Never use triple-brace/raw HTML for source-derived fields.
- Validate link schemes and resolve internal paths through safe IDs.
- Do not insert source markup through `innerHTML`; use text nodes or pre-rendered escaped DOM.
- Keep scripts local, static, and free of dynamic code evaluation.
- Prefer no inline script/style so CSP can remain strict without unsafe directives.
- Ensure error pages and diagnostics are escaped and disclosure-safe.
- Render validation status only from a matching attestation; mismatch becomes `not_verified`.

## Bundle verification requirements

A verifier should check, within its implemented scope:

- required files and allowed optional files;
- manifest schema and unique canonical paths;
- no absolute, parent, ambiguous, or outside-root paths;
- symlink policy;
- file hashes/sizes and unexpected unmanifested release files according to policy;
- scientific payload schema and hash;
- attestation binding/canonicalization/profile identity;
- local link and resource closure;
- no required remote dependencies;
- configured secret/private-path/dangerous-URL patterns;
- optional audit independence;
- static/no-JavaScript scientific-content presence;
- release size/count limits.

A verifier should report exactly which checks ran, were skipped, were not implemented, or were not applicable. “Verified” without check scope is misleading.

## Logging and diagnostics

Logs and errors are a disclosure surface.

- Use stable public IDs instead of raw source text and absolute paths where possible.
- Never log credentials, private values, full prompts/source chunks, or signed URLs by default.
- Separate private build diagnostics from the public bundle.
- If an optional generation audit is released, run the same disclosure projection/review over it and make it removable.
- Preserve error state and affected item IDs without dumping untrusted markup into HTML.
- Do not mark a truncated/failed run complete because a process exited normally.

## Security test cases

Maintain adversarial fixtures for at least:

- source prompt injection and fake schema/tool instructions;
- invented source IDs/locators and guessed missing values;
- stale attestation after a one-byte payload change;
- real withheld canaries in text, JSON, attributes, comments, search index, SVG, filename, manifest, and audit;
- HTML/attribute/URL/CSS/SVG injection strings;
- `../`, absolute, UNC, drive-letter, percent/double-encoded, Unicode separator, NUL, reserved-name, and symlink paths;
- external script/style/font/image/connect/form/object references;
- authoritative inventory with an undisposed item;
- registered-only inventory with absolute completeness wording;
- retry that attempts to overwrite failure history;
- dependent evidence counted as independent;
- failed positive control plus no-effect claim;
- R2 without replay and R3 without independence;
- huge/deep/cyclic records and truncated generation continuation;
- filtered/no-JavaScript/full-print visibility of failures, exclusions, conflicts, and retractions.

Tests demonstrate behavior for fixtures, not absence of every vulnerability or scientific error.

## Release security checklist

- [ ] Release input and source-universe snapshot are frozen and identified.
- [ ] Candidate generation output was treated as untrusted and reviewed.
- [ ] Public projection was created before rendering.
- [ ] Withheld canaries and configured secret/path patterns are absent from all output bytes/names.
- [ ] Payload strings are contextually escaped; URLs and paths are allowlisted/contained.
- [ ] No required network dependencies or active imported content exist.
- [ ] Payload digest/canonicalization matches attestation.
- [ ] Manifest covers the intended final release tree and hashes match.
- [ ] Symlink/archive/path policy was enforced on final bytes.
- [ ] Static `file://` reading and full archive visibility were checked.
- [ ] Filtered print/view is clearly labeled and cannot replace the archive.
- [ ] Optional generation audit is independently disclosure-reviewed or omitted.
- [ ] Validation/verifier output states checks run, skipped, and not implemented.
- [ ] Scientific, disclosure, and release approvals bind the exact payload/bundle identity.
- [ ] No claim is made that tests passed unless the commands were actually run successfully.

## Out of scope and residual responsibilities

The project does not by itself provide:

- an authoritative institutional source registry;
- proof that a human or instrument record is truthful;
- malware scanning for every scientific file format;
- ethics, consent, biosafety, export-control, or regulatory approval;
- durable identity/signature/timestamp infrastructure;
- secret management or controlled-data access approval;
- browser/OS hardening;
- provider contractual, retention, residency, or training-use guarantees;
- proof of scientific validity or independent reproduction.

Deployers must add controls appropriate to data sensitivity and institutional policy. For high-assurance releases, use isolated builds, trusted signatures, independent source reconciliation, domain review, disclosure review, and archival distribution controls in addition to the core toolchain.

## Current MVP boundary

The protocol describes required defenses; the active codebase may implement only some of them. A CSP tag, schema, hash, or scan is not a complete security boundary. Before release, inspect the actual renderer, redactor, bundler, verifier, rule registry, dependency state, and tests. Record absent checks as absent and do not infer security from planned files or passing unrelated tests.
