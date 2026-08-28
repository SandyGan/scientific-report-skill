# Security policy

## Supported versions

Security fixes target the latest 0.2.x release and the current default branch. Every v0.1.x release and tag has been revoked and is unsupported.

| Version | Supported |
|---|---|
| latest 0.2.x | yes |
| any 0.1.x artifact | revoked; unsupported |
| older snapshots | no guaranteed support |

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability, credential exposure, disclosure bypass, or report-bundle integrity bypass.

After the GitHub repository is created, use GitHub's private vulnerability reporting or a private security advisory for the repository. Until that channel is enabled, contact the repository owner privately and include only the minimum information needed to reproduce the issue.

Please include:

- affected version or commit;
- affected command, API, schema, or bundle member;
- minimal reproduction steps using synthetic data;
- expected and observed behavior;
- potential disclosure, integrity, provenance, or release-gating impact;
- any known workaround.

Never include real restricted scientific data, credentials, personal data, unpublished source material, or exploitable public proof-of-concept details in the initial report.

## Scope

Security-relevant areas include path containment, symlink handling, active or remote content, source and prompt injection boundaries, disclosure projection, withheld-value leakage, provenance binding, attestation binding, package inventory and hashes, and release-gate bypasses.

The toolchain cannot establish real-world source honesty, experimental occurrence, scientific truth, publisher identity, or institutional authorization. Those limitations are not security vulnerabilities unless the implementation claims or exposes a stronger guarantee than its documented contract.
