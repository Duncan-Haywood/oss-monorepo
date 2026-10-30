---
title: "E-invoice Preflight adds Japan: a T-number check and the October 2026 credit step-down"
seo_title: "E-invoice Preflight adds Japan"
date: 2026-10-26
description: "A new Japan page checks a qualified-invoice registration number in the browser and shows the 80% to 50% transitional credit step on 1 October 2026."
tags: [einvoice-preflight, e-invoicing, japan]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) now has a page for [Japan](../../ventures/einvoice-preflight/japan-invoice-system-e-invoice-mandate.html), the 37th in the all-countries table. Japan has no clearance mandate. Since 1 October 2023 a buyer claims the consumption-tax credit only on a qualified invoice carrying the seller's registration number, the letter T and 13 digits. Vendor guides report that the transitional credit for unregistered sellers is 80% until 30 September 2026 and 50% after, so the step is this week.

The page checks a number locally. A corporation's number is T plus its 13-digit corporate number, whose first digit is a mod-9 check digit; the code reproduces the tax agency's own number, and a test shows the blind spot: a 0 swapped for a 9 passes, 8 of 117 single-digit typos on that sample. An individual's number is not a corporate number, so a mismatch says "typo or an individual", not "wrong".

What is not done: the 2026 tax reform is reported to revise the percentages and cap relief for large purchases from one unregistered seller, and that came from one adviser article, so the page says so and applies the older schedule. The agency's text, a registrant lookup and the Peppol JP PINT rules are the next reads. A summary, not tax advice.
