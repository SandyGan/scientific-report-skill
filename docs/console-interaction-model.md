# Console interaction model

The scientific console is an offline-first reading and inspection surface for the public scientific payload. Its visual metaphor is a laboratory command console and technical archive, not a marketing dashboard. The console must help a reader answer the report's key scientific and provenance questions quickly without hiding failures, missingness, or uncertainty.

This document defines intended behavior. A behavior is automated only when the corresponding template, script, style, renderer, and test are present in the version being used.

## Conformance language

| Phrase in this document | What it establishes |
|---|---|
| “must” / “should” | An interaction or presentation requirement for a conforming implementation; not evidence that the current snapshot implements it. |
| “implemented” / “available” | The relevant template, asset, renderer path, and fallback exist in the inspected revision; this still does not imply they were exercised. |
| “automatically checked” | A specific test or verifier check exists and covers the named behavior for its declared fixtures/scope. |
| “checked” / “passed” | The named check was actually run successfully against the identified build and payload; preserve the command, version, scope, and result. |
| “scientifically complete” / “scientifically valid” | Never inferred from the console UI alone; these require source-bound scientific review within an explicit scope. |

A placeholder control, status chip, template branch, or written requirement is not an implemented interaction. When evidence is absent, label the capability `not_implemented`, `not_run`, `unknown`, or another exact contract state rather than presenting a favorable default.

## Interaction goals

### 30-second overview

Without opening an inspector, a reader should be able to identify:

- the research question and declared boundary;
- the qualified answer and resolution status;
- one or two key claims;
- the strongest counterevidence, conflict, or blocker;
- project work completed versus planned/attempted/unknown;
- failed-attempt and source-disposition counts with denominators;
- source-universe authority/completeness limitation;
- conservative reproducibility status and largest replay gap;
- payload/attestation relationship.

### Three-interaction drill-down

From a key claim, a reader should be able to reach, in no more than three purposeful interactions:

- actual method parameters;
- a failed or superseded attempt/segment;
- the underlying data slice or output artifact;
- a source locator;
- a replay recipe, access condition, or comparison record.

“Interaction” means a deliberate activation such as following a link, opening a disclosure, or selecting a related object—not scrolling within the resulting detail.

## Authoritative content model

### Contract-alignment dependency

A deterministic renderer requires a versioned, lossless mapping from the public scientific schema to its view model. The active renderer maps the reconciled source-coverage, execution-history, result-axis, claim-graph, public-withholding, applicability, and reproducibility contracts; the full static catalog preserves every public payload field and identifier as a no-JavaScript inspection path.

That alignment is a versioned invariant, not a permanent assumption. If a future protocol/schema/view-model disagreement is discovered, rendering must fail with an unsupported-contract diagnostic rather than substitute a similar status or plausible fallback. No accessibility, offline, bundle, or release claim may bypass an affected contract mismatch.

`scientific-report.public.json` is the only scientific fact source for public rendering. The page may also display a separate validation attestation and bundle metadata, but those are not scientific facts.

The DOM produced by deterministic rendering is the complete archival reading path. Client-side JavaScript may:

- search already-rendered records;
- filter a working view;
- expand/collapse native details;
- synchronize focus and related-record navigation;
- select a print mode;
- announce result counts.

It must not:

- fetch or derive scientific content;
- create a number, citation, status, relationship, or conclusion;
- turn an empty value into an inferred value;
- remove records from the archive or payload;
- present a filtered view as the full report;
- change validation or reproducibility state.

If JavaScript is disabled or fails, all scientific records and source/replay links must remain available in linear document order. Search and filters may be unavailable; scientific meaning may not be.

## Information levels

The console uses progressive disclosure. These levels describe information depth, not separate truth sources.

| Level | Purpose | Typical contents |
|---|---|---|
| L0: global situation | rapid orientation | question, scope, qualified answer, resolution, key claim, counterevidence, completion/failure/source/reproducibility summaries |
| L1: ledger/domain overview | scan related records | resolution ledger, claims/evidence, execution, results/failures, methods, provenance/replay, enabled domain views |
| L2: object detail | inspect one record | claim, attempt, sample, dataset, model, simulation, result, failure, conflict, artifact |
| L3: method and reproduction | evaluate procedure | actual/planned parameters, invocations, environment, random state, recipe/history differences, comparison, replay events |
| L4: source location | inspect evidence origin | page/figure/table/line/timestamp/frame/JSON Pointer/content ID/parser/revision locator |

Every jump deeper should preserve a route back to the originating record and a stable object ID.

## Page regions

### Header

The header presents:

- title;
- report, project, and report-version IDs;
- top-level resolution, source-coverage, and attestation states;
- cutoff, report mode, language, and schema version;
- enhanced search/filter/print controls when JavaScript is available;
- a live description of active filters.

Top-level chips are status summaries, not approval badges. Text and machine-readable `data-status` values accompany any visual treatment.

### Scope ribbon

The scope ribbon stays visible near identity controls and states the cutoff/boundary context. A reader should not need to infer whether evidence after the cutoff was considered.

### Section rail

The persistent section navigation links to:

1. global overview;
2. resolution ledger;
3. claims and evidence;
4. execution history;
5. results and failures;
6. methods and parameters;
7. provenance and replay;
8. static annex.

On narrow screens the rail becomes an in-flow navigation region rather than compressing content into unreadable columns.

### Main ledger

Records use stable anchors based on safe IDs. Each record exposes:

- object type and ID;
- scientific status and missingness state in text;
- concise statement/summary;
- scope/context;
- relationships to evidence, failures, dependencies, artifacts, or reproduction units;
- native expandable detail where appropriate;
- source locator and revision state.

### Footer

The footer presents the scientific payload hash, the attestation's bound payload hash, and the disclosure projection state. A mismatch must appear as `not_verified` or equivalent, never as passed.

### Optional generation audit

Generation audit content is peripheral, default-collapsed, omitted from scientific summary printing, and removable as a whole. Its presence or absence cannot change scientific content, payload hash, validation status, or reproducibility assessment.

## Global overview

The overview prioritizes decision-relevant context rather than decorative metrics.

### Required semantic blocks

- research question and boundary;
- qualified answer;
- resolution status with criteria timing;
- key claim(s) and direct navigation;
- strongest counterevidence/conflict/blocker;
- work-unit counts by state and execution scope;
- attempt/failure counts;
- source coverage numerator, denominator, universe ID, cutoff, and completeness class;
- critical reproducibility-unit level distribution, lower bound, coverage denominators, and access limitations.

Counts always show unit, numerator, denominator, scope, and cutoff. A number such as “5/8” is not displayed without what was counted.

Do not use trend arrows or red/green success framing for scientific increases/decreases. A decrease can be desired, harmful, neutral, or contextual; encode scientific direction separately from quality or blocker state.

## Search

Search is an enhancement over rendered records.

### Searchable material

Search should include visible and expanded-detail text for:

- IDs and titles;
- claim propositions;
- failures and retry reasons;
- null/negative results;
- exclusions, supersessions, and retractions;
- conflict statements;
- methods/parameters and artifact labels;
- safe paths and locators;
- missing reasons and limitations.

Do not index private values, hidden authoring fields, credentials, or original withheld values. Search-index generation must consume only the public projection.

### Behavior

- The search input has an explicit label and uses native `type="search"` behavior.
- `/` may focus search when focus is not in an editable control; this is an enhancement, not the only access path.
- Matching is deterministic and explained sufficiently for the user to understand why records appear.
- The result count is announced in an `aria-live` status region without moving focus on each keystroke.
- Clearing search restores the prior unfiltered working view.
- No-results state explains that the archive is unchanged and offers a clear reset.
- Search terms are not sent over the network, stored in analytics, or inserted as unsafe HTML.

## Filters

The current control model supports domain, state, and record-kind filters. Future filters must follow the same invariants.

### Filter invariants

- Filters combine predictably; the interface states whether combination is intersection or another rule. The default should be intersection.
- `All` means no restriction on that dimension, not “all favorable states.”
- Active filters and visible/total record counts are announced in text.
- A single clear action restores the complete working view.
- Filter state does not alter canonical data, payload hash, attestation, counts in the underlying archive, or permanent URLs.
- A hidden record remains reachable after filters are cleared and in full archive print/static annex.
- Missing, failed, excluded, superseded, retracted, contested, unknown, and withheld records use first-class filter values where applicable.
- The UI must not silently exclude adverse records when a domain or positive-result filter is selected; it must state the scope of the working view.

### Filtered summary handling

Aggregates derived for a filtered working view are presentation-only. Label them “visible records” and retain the canonical total/denominator nearby. Never replace the report's validated canonical count with a filtered count.

## Record disclosure and evidence inspection

Use native links and `<details>/<summary>` where possible so disclosure remains keyboard-operable without custom scripting.

### Opening a record

- Activating a stable link moves focus to the target heading/record, not to an arbitrary container.
- The target remains visible and receives a temporary non-color-only focus/target treatment.
- Opening detail does not collapse unrelated content unless the user chose a global collapse action.
- Back navigation returns to the initiating link where browser behavior permits.

### Argument inspector

A claim view distinguishes:

- proposition, type, support status, scope, and decision timing;
- supporting, contradicting, and qualifying evidence;
- argument steps and assumptions;
- alternative explanations;
- dependency groups and independence state;
- cross-domain bridges and their alignment/validity;
- conflict memberships;
- revision/invalidation state;
- covered reproducibility units.

Graph visualization may supplement but never replace an ordered textual edge list. A graph must not imply independent support through layout or repeated nodes.

### Execution history

History is chronological/causal and append-only. It shows work-unit state and execution scope separately, then attempts and segments including failures, partial output, restarts, parameter differences, and completion evidence. Successful retry styling must not visually erase or subordinate the original failure.

### Results and failures

Each result presents the four orthogonal axes separately:

- scientific effect class;
- statistical decision;
- interpretability status;
- record disposition.

Failure events are separate linked records. A negative or null result view shows controls, sensitivity/detection boundary, uncertainty, population/exclusions, and qualification state needed for interpretation.

### Methods and parameters

The console labels actual, planned, historical-default, unknown, and recipe values. A compact diff may compare historical invocation with recipe, but the original records remain available.

### Provenance and replay

Per-unit views show all reproducibility axes, conservative level, access conditions, comparator, replay/reproduction events, failed events, and claim/output denominator. R2 is labeled verified replay, not independent reproduction. R3 states computational reproduction, experimental replication, or both.

## Missingness presentation

Each envelope state has explicit text and machine-readable status:

- **Known**: display the value and provenance link.
- **Unknown**: display “Unknown” plus the safe missing reason; never show blank space as if omitted.
- **Not applicable**: display “Not applicable” plus the applicability basis.
- **Withheld**: display “Withheld” plus a non-sensitive policy reason; never expose a value, fragment, path, digest, ordering clue, or metadata that enables inference.

`provenance_status` is presented independently from state. A known value with partial provenance must not look equivalent to one with complete provenance.

Empty template fallbacks are diagnostic only; canonical rendering should receive explicit states rather than converting empty output into `unknown`.

## Status language and visual encoding

State must be communicated with at least:

- visible text;
- semantic structure or accessible name;
- non-color visual treatment such as icon, border, or pattern where useful;
- stable DOM attribute/class for testing.

Color roles:

- neutral/cool gray for structure and unassessed context;
- one blue-green accent for navigation/selection;
- amber for warnings/qualified/review states;
- red only for blockers/security/integrity failure, not scientific decrease or negative effect;
- no rainbow palettes or red-green-only distinctions.

Icons are decorative when adjacent text already names the state and should use `aria-hidden="true"`. Icon-only controls require an accessible name and visible focus.

## No-JavaScript and offline behavior

### Static contract

With JavaScript disabled:

- every scientific record is in the document or linked static annex;
- native links and disclosures work;
- report identity, scope, statuses, and hashes are visible;
- full archive printing remains possible through browser controls;
- a note explains that search and working-view filters require JavaScript;
- no scientific statement depends on a generated canvas, network request, client template, or closed shadow tree.

### Offline contract

- Paths are relative and remain inside the bundle.
- Required fonts, styles, scripts, icons, data, and annex pages are local.
- No analytics, beacons, remote imports, or service workers are required.
- The Content Security Policy blocks network connections and active object/embed content as appropriate to the packaged design.
- Moving the directory does not break links when its internal structure is preserved.
- `file://` behavior is the baseline; enhancements must not require a local server.

A Content Security Policy is defense in depth. It does not replace escaping, sanitization, safe URL validation, or path containment.

## Keyboard model

Use native browser conventions first.

| Action | Expected input |
|---|---|
| move through controls/links | `Tab` / `Shift+Tab` |
| activate link/button/summary | `Enter`; `Space` where native control supports it |
| operate select | platform-native arrow keys and typing |
| focus search enhancement | `/` outside editable fields |
| clear search | `Escape` while the search has text, the native browser convention, or the explicit Clear control |
| close a modal-like inspector, if one is ever added | `Escape`, returning focus to invoker |
| print | explicit Print button or browser command |

Avoid custom arrow-key grids unless the component implements the complete accessible grid pattern and adds real value. The baseline console uses document navigation, links, selects, buttons, and disclosures.

Focus rules:

- focus order follows DOM/reading order;
- focus is never trapped except in a true modal dialog;
- hidden filtered records contain no focusable descendants in the active view;
- after clearing filters, focus moves to the search input so the restored view can be queried immediately; it never jumps to an arbitrary record;
- global expand/collapse does not move focus;
- focus indicators remain visible in forced-colors mode and at 400% zoom.

## Screen-reader and semantic model

- One page-level `<h1>` identifies the report; section headings follow a logical hierarchy.
- Landmarks include header, navigation, main, and footer with useful labels.
- A skip link targets the main scientific report and becomes visible on focus.
- Lists of records are semantic lists or articles, not layout-only divs.
- Tables use captions and header associations; avoid using tables only for layout.
- Definition lists are appropriate for field/value metadata.
- Hashes, IDs, paths, and parameters use text/code that remains selectable and pronounceable; provide a short accessible label before long hashes.
- Live regions announce filter/search changes sparingly; they do not repeat entire result sets.
- Visually collapsed content remains correctly removed from the accessibility tree only when intentionally closed, while the static content remains reachable through native disclosure.
- SVG charts have a concise accessible name and nearby full table/text alternative.

## Responsive and zoom behavior

- Desktop may use a navigation rail plus main ledger.
- Mobile and 400% reflow use a single meaningful column.
- No essential horizontal two-dimensional relationship is conveyed only by side-by-side placement.
- Long IDs, paths, hashes, and parameter values wrap or scroll within their own container without forcing page-wide horizontal scrolling.
- Sticky regions must not consume most of a small viewport or cover focused content.
- Pointer targets are large enough for touch, but hover is never required.
- Hover/focus tooltips duplicate information available by focus/activation and do not contain the only source locator.

Target manual widths include 375, 768, 1280, and 1440 CSS pixels, with 200% and 400% zoom/reflow checks.

## Motion and forced colors

- Respect `prefers-reduced-motion: reduce`; avoid animated scrolling and nonessential transitions.
- No scientific meaning depends on motion.
- In forced-colors mode, use system colors and borders; do not force decorative colors that erase focus/status differences.
- Do not use transparency alone for disabled/withheld/inactive state.

## Charts and data views

Only add a chart when it serves a scientific task. Use:

- directed flow/lineage views for dependency and provenance;
- single-axis time series or small multiples for time change;
- points and intervals for estimates;
- calibration and subgroup small multiples for model performance;
- per-replica time series/distributions/running estimates for MD;
- flow/batch matrices for sample and QC state;
- tables/status matrices for reproducibility axes.

Prohibited or strongly discouraged:

- dual y-axes;
- rainbow palettes;
- a composite reproducibility gauge;
- a chart that omits failed/excluded/unknown data without an explicit view annotation;
- chart-only access to exact values;
- visual aggregation that counts dependent evidence as independent.

Every chart has a table or structured text alternative using the same public payload records. Series colors remain stable across views and are not the only identifier.

## Print model

The enhanced control offers three modes:

### Summary

Contains report identity, boundary/cutoff, qualified answers and resolution, key claims/counterevidence, completion/failure/source/reproducibility summaries, material limitations, and payload/attestation identifiers. It must not imply that omitted details are absent from the archive.

### Full archive

Contains every scientific record and static detail required for review, including failures, exclusions, superseded/retracted records, conflicts, missingness, source coverage, and reproduction events. This is the canonical print mode.

### Filtered working copy

Contains only records visible under active filters and prominently prints:

- “Filtered working copy — not the full archive”;
- active filter/search criteria;
- visible/total record count;
- report ID/version and payload hash;
- generation/print time if available without misrepresenting scientific event time.

A filtered print must never be labeled simply “report” or “complete.”

Print behavior is implemented through deterministic CSS/DOM attributes. Printing does not modify the scientific payload. If script is unavailable, browser printing defaults to the full archival document.

## URLs, anchors, and external links

- Stable internal anchors use safe object IDs.
- User-controlled IDs and labels are escaped and validated before use in HTML attributes.
- Annex links are relative and contained within the bundle.
- External URLs, when allowed by disclosure policy, are rendered as inert, explicit links with scheme allowlisting and no automatic fetch. The visible hostname/target should be clear.
- Never emit `javascript:`, `data:text/html`, `file:` to private locations, UNC paths, or path-traversal targets from scientific fields.
- Opening external links must not send a referrer; offline use may make them unavailable and that limitation is explicit.

## Interaction states and auditability

Client-side search/filter/expanded state is transient presentation state. It is not written into scientific JSON, validation attestation, or reproducibility records. If a working-view URL/state export is later added, it must:

- contain only public, non-sensitive filter identifiers;
- state the bound report ID/version/payload hash;
- fail safely when loaded against a different payload;
- not claim validation;
- not replace the full archive.

## Human usability checks

Test with a stable payload and record observations rather than assuming compliance.

### Orientation task

Ask a domain-appropriate reader to identify within 30 seconds:

1. the question and boundary;
2. what was actually completed versus planned/external;
3. the key claim and strongest challenge;
4. source completeness limitation;
5. largest reproducibility gap.

Record completion, errors, time, and misunderstood labels.

### Drill-down task

Starting from a key claim, ask the reader to reach an actual parameter, failed attempt, source locator, and relevant artifact/replay unit. Record interactions, wrong turns, and whether the evidence context remained clear.

### Accessibility task

Using keyboard only and, separately, a supported screen reader:

- reach each section;
- search/filter and clear the view;
- open/close detail;
- inspect a claim and its counterevidence;
- reach a source locator;
- select and understand print mode;
- verify focus return and announcements.

### Static/offline task

Disable JavaScript and networking, open through `file://`, move the bundle directory, and confirm the complete scientific reading path, annex links, assets, and full printing.

## Current MVP boundary

The template establishes the intended header, navigation, search/filter controls, print modes, static note, status chips, CSP, footer hash display, and report partial structure. A given development snapshot may not yet include every referenced partial, asset, client-side behavior, annex page, responsive rule, or automated browser/accessibility check. Missing implementation must be reported as missing; do not claim that keyboard, browser, offline, print, or 30-second/three-interaction tests passed unless they were actually executed against the built bundle.
