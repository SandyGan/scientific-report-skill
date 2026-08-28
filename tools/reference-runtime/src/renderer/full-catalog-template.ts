export const FULL_CATALOG_TEMPLATE = `<!doctype html>
<html lang="{{#if language}}{{language}}{{else}}en{{/if}}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'">
  <meta name="referrer" content="no-referrer">
  <title>{{title}} · Full public record catalog</title>
  <link rel="stylesheet" href="../assets/report.css">
  <link rel="stylesheet" href="../assets/print.css" media="print">
</head>
<body class="annex-page" data-report-view="full-record-catalog" data-print-mode="full">
  <a class="skip-link" href="#catalog-main">Skip to full record catalog</a>
  <header class="annex-header">
    <div>
      <p class="console-kicker">Scientific record / static annex</p>
      <h1>Full public record catalog</h1>
      <p class="annex-subtitle">Exact disclosure-safe public payload fields, shown as inert escaped text without interpretation or JavaScript</p>
    </div>
    <dl class="annex-identity">
      <div><dt>Report</dt><dd><code>{{report_id}}</code></dd></div>
      <div><dt>Version</dt><dd><code>{{report_version}}</code></dd></div>
      <div><dt>Payload</dt><dd><code class="hash">{{payload_hash}}</code></dd></div>
    </dl>
    <div class="annex-actions">
      <a class="button button--quiet" href="index.html">Return to static annex</a>
      <a class="button button--quiet" href="../report.html">Return to command console</a>
    </div>
  </header>
  <div class="noscript-note" role="note"><strong>Literal catalog.</strong> Values below are deterministic projections of scientific-report.public.json. Missingness envelopes retain known, unknown, not_applicable, and withheld states. No empty collection is interpreted as proof that no records exist.</div>
  <nav class="annex-index" aria-label="Catalog keys">
    {{#each catalog_sections}}<a href="#catalog-{{@index}}">{{key}}</a>{{/each}}
  </nav>
  <main id="catalog-main" class="annex-main" tabindex="-1">
    {{#each catalog_sections}}
    <section id="catalog-{{@index}}" class="annex-section" aria-labelledby="catalog-title-{{@index}}">
      <header class="section-heading">
        <div><p class="section-code">Public payload key / {{value_kind}}</p><h2 id="catalog-title-{{@index}}"><code>{{key}}</code></h2></div>
        {{#if record_count}}<p class="section-purpose">{{record_count}} ordered record(s); order is preserved from the public payload.</p>{{/if}}
      </header>
      <pre tabindex="0"><code>{{json}}</code></pre>
    </section>
    {{/each}}
  </main>
  <footer class="report-footer">
    <div><span class="meta-label">Scientific payload</span><code class="hash">{{payload_hash}}</code></div>
    <p class="footer-note">This page contains no independent scientific facts. scientific-report.public.json remains the sole public scientific fact source.</p>
  </footer>
</body>
</html>
`;
