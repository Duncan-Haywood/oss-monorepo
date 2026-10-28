---
title: "Paid on the due date keeps the sales tax discount; one day later the bookkeeper warns"
date: 2026-10-28
description: "ai-bookkeeper's sales tax return now pins the boundary: a payment on the due date keeps the timely-filing discount, the next day triggers a warning."
tags: [ai-bookkeeper, sales-tax]
---

# Paid on the due date keeps the sales tax discount

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

Several states give a small discount for filing sales tax on time. Earlier today
`salestax return` started warning when a payment landed after the due date, because
the discount may be forfeited. The comparison is strict (`payment date > due date`),
but no test pinned the edge.

A new test covers it with a quarterly return due 2026-04-20 and a 10% discount:

| Payment date | Warning? |
|---|---|
| 2026-04-18 | no |
| 2026-04-20 (due date) | no |
| 2026-04-21 | yes, "discount assumes payment by 2026-04-20" |

The suite (`node --test salestaxreturn.test.mjs`) passes, 36 of 36. It does not model
weekend or holiday shifts of the payment date itself; the due date already shifts.
