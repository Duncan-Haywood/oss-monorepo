---
title: "What a demo bank feed taught the bookkeeper's keyword rules"
date: 2026-10-27
description: "Of six open-source accounting projects, only Bigcapital shipped a bank-feed sample; 121 rows read cleanly and showed what the built-in keyword rules miss."
tags: [ai-bookkeeper, bookkeeping, evaluation]
---

Open-source accounting projects rarely ship real bank exports, so we swept
six of them (Bigcapital, LedgerSMB, Frappe Books, ERPNext, Odoo and Firefly
III) for statement samples. Only Bigcapital had one: 121 rows of US bank-feed
descriptors, such as `PURCHASE AUTHORIZED ON 05/27 ROYAL FARMS ...`.

AI Bookkeeper read the file without a fault. Its built-in keywords suggested
an account for 43% of the lines before the run. We added rules for the names
that are plainly one thing (Albertsons, Food Lion, Denny's, PayByPhone and a
few more) and left Walmart, Venmo and the IRS blank, since the right account
depends on what was bought. That is the design: suggest when sure, queue the
rest for review, and learn from the corrections.

Try it with your own statement at
https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/ (no account, no key).
