# Report workflow reference

Use this reference when the report spans multiple source classes or domains.

## Inputs

- supplied project files, notes, logs, artifacts, publications, and attestations;
- scope, cutoff, audience, and disclosure level;
- known authoritative inventories, when any;
- domain and scientific-review context supplied by the user.

## Evidence ledger

The structured JSON is a portable evidence ledger for one report, not a database service. It records identities, source bindings, missingness, execution history, results, failures, claims, conflicts, artifacts, and reproducibility. Use stable identifiers and append-only history where revisions or retries matter.

## Rendering boundary

Render only from the public scientific payload. Presentation code may organize and escape facts but must not calculate new scientific results, add citations, or strengthen conclusions.

## Completion boundary

A report may be useful while incomplete. Mark it as a working copy and expose blockers. Publication eligibility requires the applicable structural, semantic, disclosure, reproducibility, and human-review gates; even then, the result is not proof that the underlying science is true.
