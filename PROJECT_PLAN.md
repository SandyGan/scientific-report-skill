# Scientific Report Skill project plan

> Status: Skill-first restructuring in progress; all v0.1.x public releases and tags have been revoked.

## Product boundary

Scientific Report Skill is installed and invoked as a skill. Users supply project materials and receive a self-contained offline scientific report whose entry point is `report.html`.

The structured JSON is a portable evidence ledger for the report, not a database service. Node.js, npm, a local server, and manual CLI orchestration are not user requirements.

## Maintained surfaces

- `SKILL.md` and `agents/` define discovery and behavior.
- `references/` provides progressive scientific and operational guidance.
- `protocol/`, `schemas/`, `rules/`, and `prompts/` define the evidence contract.
- `templates/` produces the directly openable offline report.
- `tools/reference-runtime/` is an optional private strict validator and renderer.

## Before the next release

1. Forward-test the skill on realistic synthetic wet-lab, AI/ML, molecular-dynamics, and cross-domain requests.
2. Verify that ordinary usage produces `report.html` without asking the user to install Node.js or run a CLI.
3. Keep the optional reference runtime green on Windows, macOS, and Linux.
4. Review the skill instructions for unnecessary rigidity and move conditional detail into references.
5. Publish a new Skill-first release only after the new behavior is accepted; do not restore v0.1.x artifacts.
