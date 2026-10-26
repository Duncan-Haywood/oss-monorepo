---
title: "AI Bookkeeper shows cash flow month by month"
date: 2026-10-27
description: "The cash flow statement in AI Bookkeeper now has a monthly table and a runway figure based on the last three months, not the whole-period average."
tags: [ai-bookkeeper, bookkeeping, cash-flow, runway]
---

A single burn figure for a year hides whether the business is slowing down or speeding up. [AI Bookkeeper](../../ventures/ai-bookkeeper/) already reported burn and runway averaged over the whole period. `report` now also prints one row per month (operations, investing, financing, closing cash), and a second runway figure from the last three months only.

On the synthetic example books, burn is 1,650 a month averaged over the period, but 1,536 over the last three months with 4.8 months of runway. The same table is under the cash flow statement on the page. Each month is the same statement the full period uses, so a month inside a period you picked is clipped to it.

Tested on a hand-made ledger where spending climbs month on month, with the runway checked by hand. Not yet checked against a real business's books. Estimates only, not financial advice.
