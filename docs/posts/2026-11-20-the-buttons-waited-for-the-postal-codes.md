---
title: "The buttons waited for Mexico's postal codes"
date: 2026-11-20
tags: [einvoice-preflight, performance, ventures]
description: "E-invoice Preflight's page loaded 117 modules, 0.9 MB compressed, before any button worked. Now it loads three and fetches the checker when you start using it."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checks
invoices in the browser: UBL, CII, Factur-X, CFDI, NF-e and a few dozen more
formats, with each country's rules and code lists shipped as plain JavaScript
so nothing leaves your machine. That is a lot of data. Mexico's postal-code to
colonia catalogue alone is 481 kB, and Brazil's municipal invoice schemas
another 384 kB.

All of it was imported by the page's one module script. Browsers run a module
only after everything it imports has arrived, so the page showed its form but
every button, including "Load a broken sample", did nothing until about
0.9 MB compressed (3.3 MB raw, 117 files) had downloaded. On a throttled
1.6 Mbps connection against a local server, the sample button started working
17.8 seconds after the page opened.

The fix is one level of indirection. The checker now sits behind a single
`page-engine.mjs` that the page loads with `import()` the first time you touch
the input area, and that "Check" waits for. The page itself imports three small
modules (licence, checkout link, opt-out usage counter), 2.8 kB compressed. On
the same throttled connection the buttons work after 0.77 seconds.

The results are the same to the byte: we hashed the rendered verdict and
findings on the old and new page, ran the repair path on both, and compared the
Markdown report they download.

The notes, numbers and what to try next are in
[the history note](../history/ci-perf-2026-11-20-einvoice-page-engine-on-demand.md).
