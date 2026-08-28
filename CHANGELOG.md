# Changelog

All notable changes to Scientific Report Console are documented in this file. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-08-28

### Fixed

- Made clean-package and end-to-end CLI tests cross-platform by starting the TypeScript and tsx JavaScript entry points through Node.js instead of invoking POSIX-only `.bin` paths.

## [0.1.0] - 2026-08-28

### Changed

- Established `scientific-report-console` as the canonical repository, source-directory, npm-package, and CLI name.
- Retained `report-prompt` as a 0.1.x CLI compatibility alias and preserved the versioned `report_prompt.*` and `report-prompt.org` machine-contract namespaces.

### Added

- Provider-neutral scientific-report protocol, schemas, semantic rules, domain overlays, and prompt contracts.
- Canonical normalization, disclosure projection, validation, deterministic offline rendering, bundling, and verification APIs.
- CLI workflow covering `init`, `normalize`, `todo`, `project`, `validate`, `render`, `bundle`, `verify`, `explain`, and `demo`.
- Wet-lab, AI/ML, molecular-dynamics, and cross-domain contract support.
- Hash-bound validation and disclosure attestations, offline manifest verification, and working-copy versus release gating.
- English and Chinese user guides.
- 316 automated tests across schema, scientific semantics, provenance, reproducibility, rendering, packaging, and security boundaries.

### Security

- Model and source content are treated as untrusted data.
- Public disclosure projection precedes rendering and bundling.
- Unsafe paths, active/remote dependencies, withheld-value leakage, contradictory HTML, package tampering, and invalid human-review release decisions fail closed within their implemented scopes.
