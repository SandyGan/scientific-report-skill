# Agent-native rendering and safety

Use this path when Node.js is unavailable. It produces a working-copy report unless all required checks can be truthfully performed with available tools.

1. Project restricted material out before writing any public file.
2. Copy `assets/report-shell.html` to `report.html` and replace every `data-report-slot` section with escaped public content.
3. Encode untrusted text as text, never raw HTML. Reject active HTML, event attributes, remote scripts, remote styles, dangerous URLs, and imported SVG unless independently sanitized.
4. Use relative paths contained by the report directory. Copy only reviewed public artifacts.
5. Keep failures, negative findings, exclusions, conflicts, missingness, limitations, and unresolved tasks visible in the static document order.
6. Do not calculate new results, statistics, citations, or conclusions during rendering.
7. If hashing tools are available, record hashes only for bytes actually checked. Otherwise state that integrity hashing was not run.
8. Scan public files for withheld values, credentials, private absolute paths, and required remote dependencies when tools permit. Record any unperformed scan as `not_run`.
9. Do not create `validation-attestation.json` or claim `releaseEligible: true` unless the required contract fields and checks were actually produced.
10. Write `README.txt` describing the bundle as a working copy, the checks performed, the checks not run, and how to open `report.html`.

The report shell deliberately shows an incomplete warning until replaced. Never deliver it with unfilled slots.
