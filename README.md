# Scientific Report Skill

[中文说明](README_Chinese.md)

An evidence-led skill that turns supplied scientific project materials into a self-contained offline report. The primary product is the skill—not an npm package, database, web service, or Node.js application.

## What users get

Invoke `$scientific-report`, provide the project materials and reporting scope, and receive a portable report directory whose main entry point is `report.html`.

```text
project materials
  -> bounded source inventory
  -> evidence ledger
  -> scientific and disclosure review
  -> self-contained offline HTML report
```

The structured JSON files are an evidence ledger for the report. They are not a local database and do not require a server.

## Install as a skill

Copy this repository into a Codex skills location, or install it through a compatible skill installer. The folder containing `SKILL.md` is the skill root.

Example invocation:

```text
Use $scientific-report to turn these project materials into an evidence-led offline scientific report.
```

The skill automatically routes through source coverage, scientific records, missingness, conflicts, provenance, disclosure, reproducibility, and rendering. Users should not need to run an npm command or a six-stage CLI pipeline.

## Output

The preferred result is:

```text
report.html
annex/
assets/
scientific-report.public.json
disclosure-projection.json
validation-attestation.json
package-manifest.json
README.txt
```

Open `report.html` directly in a browser. JavaScript may enhance navigation, but the scientific content remains readable without it.

## Scientific boundary

The skill preserves unknown values, failures, negative findings, exclusions, retries, conflicts, external work, disclosure restrictions, and scoped reproducibility. It does not prove that experiments occurred, sources are honest, causal claims are valid, or a report has institutional approval.

Start with [SKILL.md](SKILL.md). Detailed authoring, field, review, reproducibility, interaction, threat, and extension guidance lives under [references/](references/).

## Optional reference runtime

Node.js is optional. Maintainers and high-assurance workflows may use [tools/reference-runtime](tools/reference-runtime) for deterministic schema validation, semantic checks, rendering, bundling, and verification. Ordinary users do not need Node.js, npm, a local server, or a database.

## Repository layout

| Path | Purpose |
|---|---|
| `SKILL.md` | Skill entry point and essential behavior |
| `agents/` | Skill UI metadata |
| `references/` | Detailed authoring and scientific-review guidance |
| `protocol/`, `schemas/`, `rules/` | Versioned scientific contracts |
| `prompts/` | Core, stage, and domain instructions |
| `templates/` | Self-contained offline report template |
| `examples/` | Synthetic report examples |
| `tools/reference-runtime/` | Optional private Node.js reference implementation |

Licensed under [Apache-2.0](LICENSE).
