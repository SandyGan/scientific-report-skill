# Release checklist

Use this checklist for every public Scientific Report Console release. A checked item records an action; it is not a scientific approval of reports produced by the tool.

## Identity and versioning

- [ ] `package.json` and `VERSION` contain the intended version.
- [ ] `CHANGELOG.md` documents externally visible changes and migrations.
- [ ] Repository, npm package, and primary CLI use the canonical `scientific-report-console` name.
- [ ] Any change to a stable `report_prompt.*`, `report-prompt-*`, or `report-prompt.org` machine identifier is handled as an explicit versioned contract migration.

## Contract alignment

- [ ] Protocol, schemas, TypeScript types, rules, compiled support bindings, prompts, examples, rendering, and documentation agree.
- [ ] Rule registry and domain-overlay hashes match compiled support.
- [ ] Positive and adversarial fixtures cover every repaired or changed invariant.
- [ ] No unresolved critical, high, or medium release finding remains.

## Quality and security

- [ ] A clean source checkout runs `npm ci` successfully.
- [ ] `npm run check` passes without skipped suites.
- [ ] Dependency audit and applicable security review are recorded.
- [ ] Public trees contain no credentials, restricted data, personal data, unsafe local paths, or unreviewed disclosure material.
- [ ] Browser, file-URL, accessibility, printing, and platform checks performed for the claimed support scope are recorded explicitly.

## Packaging

- [ ] `npm pack` runs the `prepack` lifecycle successfully.
- [ ] The packed tarball contains only declared runtime and contract assets.
- [ ] Both CLI names resolve to the same installed entry point: `scientific-report-console` and the 0.1.x compatibility alias `report-prompt`.
- [ ] All documented ESM subpaths import from a clean consumer installation.
- [ ] The release-only demonstration renders and `verify` reports release mode with `releaseEligible: true`.
- [ ] Source and runtime archives have recorded SHA-256 checksums.

## Publication

- [ ] Git tag, GitHub release title, npm version, and archive names agree.
- [ ] GitHub release notes link to the changelog and describe contract migrations.
- [ ] GitHub private vulnerability reporting is enabled.
- [ ] Branch protection requires the CI workflow.
- [ ] Repository owner-specific `repository`, `homepage`, and `bugs` package metadata are filled after the repository URL exists.

## Scientific boundary

- [ ] Release notes state that implementation acceptance is not scientific peer review, source authentication, proof of experimental occurrence, or institutional publication approval.
