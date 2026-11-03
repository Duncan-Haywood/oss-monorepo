---
title: "E-invoice checks are a commodity. The audit trail is what a bookkeeper would pay for"
seo_title: "E-invoice preflight audit pack: a printable record of what was checked"
date: 2026-11-03
tags: [e-invoicing, monetization, open-source, accounting]
description: "Validating one e-invoice sells for about $4 per 1,000 on API marketplaces. So the open-source preflight stays free and a printable audit pack is built, switched off, as the first paid extra."
---

Checking an e-invoice against EN 16931 is cheap. One Peppol validator listed on the Apify marketplace charges from [$4.00 per 1,000 validations](https://apify.com/kamerozkan/peppol-bis-preflight-validator) (read 2026-11-02), and the official validators are free. Selling the check would earn little, and our [e-invoice preflight](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/einvoice-preflight) already does it free, in the browser, for 60+ countries' rule sets.

What a bookkeeper sending invoices for twenty clients under Peppol or XRechnung does not have is a **dated record of what was checked before sending**. When a portal rejects a file in March, "we ran a validator in January" is not a document.

## What was built

The audit pack takes a batch run and writes one printable page on the preparer's own letterhead:

- a verdict and the counts (files passed, failed, unreadable);
- a row per file;
- findings grouped by rule, with the recommended fix;
- the findings per file, and the preparer's own notes;
- a fixed paragraph saying a PASS means no published check found a defect, **not** that an invoice is legally valid or accepted by any authority.

Everything is built in the browser; no invoice is uploaded. It is behind a licence-key check and **switched off**: the checkout link is empty, so there is no Buy button and nothing can charge anyone. The owner still has to create the merchant-of-record product. The price (one-off, about $15 to $40) is a hypothesis, not a test result.

## What was checked

Five tests, including that the committed sample pack equals what the code generates today, and a headless-browser run with a stubbed licence answer. The real licence call is written from memory of the provider's docs and has not run against a live product.

A [sample pack](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/sample-audit-pack.html) on six bundled made-up invoices shows exactly what a buyer would get. The code is MIT; the key is a convenience for honest buyers, not copy protection.
