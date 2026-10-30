---
title: "AI Bookkeeper now shows who your money comes from"
date: 2026-10-27
description: "A new payees report ranks customers and suppliers by share of the period's money and warns when one payer is a quarter or more of your income."
tags: [ai-bookkeeper, bookkeeping, small-business, reporting]
---

A profit and loss tells you how much came in, not who from. [ai-bookkeeper](../../ventures/ai-bookkeeper/) now has `payees`: `node cli.mjs --books books.json payees --from 2026-01-01 --to 2026-03-31` ranks the payers and suppliers in your bank and card lines with each one's share, line count and first and last date, and warns when one payer is 25% or more of money in. That is the commonest way a small business gets surprised: one client leaves and a third of income goes with them.

Stripe, PayPal, Square and Gusto lines, and your own transfers, are shown but marked and never warned about, because a payout is many customers in one line. Payees group by the categorizer's two-word key, so `ACME CORPORATION` and `ACME CORP` still show as two rows; run on the bundled example book that split hid a 30% payer, which is the next thing to fix.

Five tests on made-up lines; not yet checked against a real book. An estimate from your own data, not accounting or financial advice.
