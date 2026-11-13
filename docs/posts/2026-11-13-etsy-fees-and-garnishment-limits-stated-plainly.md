---
title: "Etsy's fees and the federal garnishment limit, stated in one sourced paragraph"
seo_title: "Etsy fees 2026 and how much of a paycheck can be garnished"
date: 2026-11-13
description: "Two tool pages now open with the answer, its source and the date checked: Etsy's $0.20, 6.5% and 3% + $0.25, and the $217.50-a-week garnishment floor."
tags: [polish, aeo, etsy-profit-calculator, wage-garnishment-limit-calculator]
---

People search "how much does Etsy take from a sale" and "how much of my paycheck can be
garnished". Both questions have short answers. Our two tools for them made the reader scroll
past an introduction to find it, and an answer engine (ChatGPT, Perplexity, Google's AI answers)
had nothing on the page it could quote with a source.

Both pages now open with one paragraph that states the answer, names where it comes from, and
gives the date it was checked. It is the same pattern as 47 other tool pages
(`platform/pages/answer-lead.test.mjs`).

## Etsy

Etsy charges a US seller $0.20 to list an item, 6.5% of the order total including shipping and
gift wrap, and payment processing of 3% + $0.25 per order. On a $30 item with $5 shipping and no
sales tax, that comes to about $3.78.

We checked each figure on 2026-11-13 against Etsy's Help Center: "Etsy Fee Basics" for the
listing and transaction fees, and "What are Payment Processing Fees for Selling on Etsy" for the
US processing rate. The calculator already used these rates as its defaults, but they were
written inline in the code, and its `llms.txt` said they were "not Etsy's current fee
schedule". They are now one exported constant, `ETSY_US_FEES`, with the source in a comment.
The calculator and the paragraph read the same numbers, and the test computes the $3.78 example
with the calculator itself.

## Wage garnishment

For an ordinary debt judgment, federal law lets an order take the lesser of 25% of disposable
earnings or the amount above 30 times the federal minimum wage. At $7.25 an hour, disposable pay
at or below $217.50 a week, $435 every two weeks, $471.25 twice a month or $942.50 a month
cannot be garnished. Child support can take 50% to 65%, and a defaulted federal student loan 15%.

The source is 15 U.S.C. 1673 and the Department of Labor's Fact Sheet #30, whose table we read
on 2026-11-13. The four floors in the paragraph are the calculator's own `protectedFloor()` for
each pay period, and they match the DOL table to the cent. Many states protect more, and the
paragraph says so.

## What keeps it true

`answer-lead.test.mjs` fails if either paragraph states a dollar figure the calculator does not
produce, or a percentage that differs from the calculator's rates. If Etsy changes a fee, or the
minimum wage changes, the paragraph and the calculator have to change together.

One we left alone: the Walmart Marketplace calculator. Its referral rates are labelled in the code
as illustrative defaults, and a sourced paragraph would claim more than they are.
