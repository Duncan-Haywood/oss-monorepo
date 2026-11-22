---
title: "A 1 kB tax-ID check waited for a megabyte of invoice rules"
seo_title: "Why our Mexico RFC check took 5.7 s on a slow phone"
date: 2026-11-22
tags: [performance, web, e-invoicing, einvoice-preflight]
description: "Our Mexico and Brazil e-invoice explainer pages held a 1 kB tax-ID check behind 340 kB of invoice rules. Loading the rules on demand cut 5.7 s to 0.6 s."
---

The [Mexico CFDI explainer](../../ventures/einvoice-preflight/mexico-cfdi-e-invoice-mandate.html)
has two tools on it. One checks an RFC (Mexico's tax ID): its shape, the date in it and its check
digit. That code is 3 kB, 1.4 kB compressed. The other checks a whole CFDI invoice against SAT's
catalogues and the payment, payroll, export and waybill complements. That one is 978 kB, 338 kB
compressed.

The page imported both at the top of one `<script type="module">`. A module script does not run
until everything it imports has arrived, and the browser holds `DOMContentLoaded` until it has run.
So typing an RFC into the box did nothing until the invoice checker and its catalogues were in.
On a throttled connection (1.6 Mbps, 150 ms round trip, cache off) that was **5.7 seconds**.

The fix is a few lines: keep the RFC check as a static import, and fetch the invoice checker with
`import()` the first time it is needed. Any tap, focus or keypress on the page starts the fetch,
so the checker is usually there before anyone has picked a file.

| page | answers before | answers after |
|---|---:|---:|
| Mexico CFDI explainer (RFC check) | 5.7 s | 0.56 s |
| [Brazil NF-e explainer](../../ventures/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) (CNPJ/CPF check) | 6.2 s | 0.69 s |
| [E-invoice creator](../../ventures/einvoice-preflight/create.html) (form totals) | 17.1 s | 2.7 s |

Times are the median of three runs in Chromium against a local server that sends files
uncompressed, so the live site is faster in absolute terms. The ratio is what carries over.
Every sample on the three pages gives the same result text as before.

We found these by summing, for each of the site's 12,543 pages, the compressed size of the HTML
plus every script, stylesheet and preload it pulls in on load. The median page is 17 kB and the
99th percentile 92 kB. These three were at 270 to 470 kB, and the creator's full import graph was
896 kB compressed (the PDF writer and the preflight it runs on what it creates), of which the form
needs 87 kB. The same split worked on the checker's home page
[two days ago](../history/ci-perf-2026-11-20-einvoice-page-engine-on-demand.md); the measurements
and the list of pages to look at next are in
[the write-up](../history/ci-perf-2026-11-22-einvoice-explainers-on-demand.md).

The lesson is not new, but it is easy to miss: "the page is static" does not mean it is light. Count
what loads before the first handler is attached, not just what the page appears to show.
