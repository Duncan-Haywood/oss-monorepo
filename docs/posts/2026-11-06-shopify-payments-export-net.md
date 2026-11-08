---
title: "Importing a Shopify Payments export: book the Net, not the gross"
seo_title: "Import a Shopify Payments transactions CSV into your books using Net"
date: 2026-11-06
tags: [ai-bookkeeper, shopify, bookkeeping]
description: "The open-source AI bookkeeper now reads Net from Shopify Payments transaction exports, so the books match the bank deposit."
---

A Shopify Payments transactions export has Amount (gross), Fee and Net. Importing it as a bank feed used to book the gross and the card brand ("visa") as the description, so the balance came out higher than the money that reached the bank.

The bookkeeper now books Net and describes each line by its order number, the same way it already treats Stripe and SumUp exports. A test with made-up rows pins a 100.00 charge with a 3.20 fee to 96.80 and a 20.00 refund to -20.00.

Checked only on the header layout as published plus invented rows, not a real shop's export.
