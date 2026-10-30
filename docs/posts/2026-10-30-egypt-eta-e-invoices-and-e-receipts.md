---
title: "Egypt's ETA e-invoices: signed, validated, then valid, and a free registration number check"
seo_title: "Egypt ETA e-invoicing: how it works and a free tax number check"
date: 2026-10-30
tags: [einvoice-preflight, e-invoicing, egypt]
description: "A new e-invoice Preflight page for Egypt's Tax Authority system, with a free tax registration number format check and what the sources leave open."
---

In Egypt a B2B invoice is not valid when you issue it. Per the vendor guides read, the seller's system signs a JSON or XML document with the company's electronic seal, sends it to the Egyptian Tax Authority (ETA) in real time, and the invoice counts once the ETA validates it and returns a UUID. Credit and debit notes point back to that UUID. Retail sales to consumers use a separate e-receipt flow.

[E-invoice Preflight](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/egypt-eta-e-invoice-mandate.html) now has an Egypt page. It checks that a tax registration number has nine digits, in the browser. It cannot test a check digit because no public rule turned up, and the page says so.

**What is unread.** The page rests on search summaries and vendor guides (EDICOM, Fonoa, ClearTax, GS1 Egypt, lookuptax.com). The Ministry of Finance resolutions and the ETA's SDK were not read. Sources disagree on rollout dates and on a reported lower registration threshold from 2026; the page lists these as leads to check, not facts.

There are now 53 country pages with the same disclaimer.
