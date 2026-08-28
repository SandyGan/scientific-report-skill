# Contributing to Scientific Report Skill

Thank you for helping improve evidence-led scientific reporting. Contributions may affect serialized scientific records and release decisions, so contract changes require more care than ordinary presentation changes.

## Skill development

The user-facing product has no Node.js requirement. Edit `SKILL.md`, references, contracts, prompts, and templates directly, then validate the skill structure.

The optional reference runtime requires:

- Node.js 22 or later;
- npm 10 or later.

To work on that runtime, enter its directory before installing dependencies:

```bash
cd tools/reference-runtime
npm install
npm run check
```

Use `npm run cli -- <command>` while developing the CLI. Do not edit generated files under `dist/` as source.

## Before opening a pull request

1. Keep the change narrowly scoped and explain the user or contract problem it solves.
2. Add positive and adversarial tests in proportion to the risk.
3. Run `npm run check` and preserve any relevant focused-test output.
4. Update both `README.md` and `README_Chinese.md` when user-facing behavior changes.
5. Update `CHANGELOG.md` for externally visible behavior or contract changes.
6. Confirm that no credentials, private source data, local absolute paths, generated demonstrations, or `node_modules` files are included.

## Contract changes

The following are versioned machine contracts rather than branding strings:

- JSON Schema identifiers under `https://schemas.report-prompt.org/`;
- prompt and extension identifiers under `report_prompt.*`;
- rule IDs, profile IDs, hashes, field names, enums, and serialized status values;
- attestation, projection, manifest, and reproducibility semantics.

Changing one of these requires an explicit migration covering the normative protocol, schemas, TypeScript types, compiled support bindings, validators, examples, prompts, renderers, documentation, and regression tests. Do not introduce silent aliases or update a contract hash without the corresponding implementation and acceptance evidence.

## Scientific and disclosure integrity

- Preserve unknown, not-applicable, and withheld states without guessing.
- Preserve failures, negative findings, exclusions, retractions, conflicts, and incomplete work.
- Do not convert external or planned work into this-project completion.
- Do not weaken disclosure, provenance, reproducibility, or human-review release gates for convenience.
- Prompt output remains untrusted candidate data and must not directly create trusted HTML or release decisions.

## Pull request expectations

A pull request should state:

- the affected contract or implementation surfaces;
- the risk of false acceptance and false rejection;
- the tests added or updated;
- whether serialized output or published APIs change;
- whether a versioned migration or release note is required.

By submitting a contribution, you agree that it is provided under the project's Apache-2.0 license.
