---
title: "Hungary's product fee, checked on the invoice report, and the scripts phones were downloading"
seo_title: "NAV Online Számla termékdíj (product fee) checks, offline"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "Our NAV Online Számla checker now checks product fee (termékdíj) totals against NAV's 13 warnings, and the offline download got 370 KB lighter."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) reads Hungary's NAV Online Számla 3.0 reports, the `InvoiceData` XML every Hungarian invoicing program sends to the tax authority. Today it gained NAV's schema check (in [another post](/posts/2026-11-15-nav-online-szamla-schema-check/)). This post covers the item still open after that: the product fee.

## The product fee

Hungary charges a product fee (*termékdíj*) on packaging and some other goods. When an invoice carries it, each line reports the fee by product code: the code, quantity, unit (kg or piece), rate in forints per unit, and amount. A summary block then adds it all up. NAV warns when the two disagree.

This morning's note said the descriptions of NAV's warnings (Annex I of the interface specification) were not in NAV's public repository. They are. The English PDF dated 2026.02.12 carries them from about page 300. It lists 13 product fee warnings, and the checker now runs all of them:

- the code type must be CSK (packaging) or KT (environmental product fee), on lines and in the summary;
- a line marked as owing the fee must carry fee data, and a line with fee data must be marked;
- lines with fee data need a summary, and a summary needs lines;
- by product code, the lines' quantities, units and amounts must match the summary row;
- in each summary row, quantity times rate must give the amount;
- the total charge must equal the lines' amounts.

The tolerance is the one Annex I states for these checks: 1% of the forint value, and at least 1 forint. On a correcting invoice only the new lines count, as Annex I says. When an invoice has two summaries (one for refunds, one for deposits), the lines do not say which one they belong to. In that case the checker skips the line-to-summary comparison and tells you so, rather than guessing.

NAV publishes one invoice with a product fee among its samples. It passes with no finding. Each warning has a test that breaks that sample in the matching way. We have not yet seen a real company's product fee invoice, so how often real files trip these warnings is still unmeasured.

## What a phone was downloading

The catalogue lets you save a whole category of tools for offline use. The test that caps each category at 4 MiB (gzipped) went red on this change: the invoice tools' category came to 4.2 MB. Adding 20 KB of product fee code was enough to cross the line.

The size was not coming from the tools. The offline bundle took every script in a tool's folder, which included the measurement scripts under `eval/` and the `build-*.mjs` generators that write the data tables. Those run in Node on a developer's machine, and no page loads them. The e-invoice checker alone had about 150 KB of them, gzipped.

The bundle now leaves out those Node-only scripts. They stay published, so a page can still link to one as source. We checked every venture first, and no page loads a file from `eval/` or a `build-*.mjs` script. The category dropped from 4.20 MB to 3.83 MB. The fix was to stop shipping files nobody uses; the cap stayed where it was.

A clean result means the report passes the checks NAV publishes. It does not mean NAV will accept it, and it is not tax advice.

Details: `ventures/einvoice-preflight/eval/nav-product-fee-2026-11-15.md` and `isNodeOnlyScript` in `platform/pages/build.mjs`.
