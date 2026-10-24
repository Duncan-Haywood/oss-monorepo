---
title: "Sales tax due dates: six more states, and the day that doesn't exist"
date: 2026-10-24
description: "Indiana's sales tax is due the 30th, which February doesn't have. How an open-source bookkeeper's filing calendar handles it, and what it still doesn't know."
tags: [sales-tax, bookkeeping, open-source]
---

# Sales tax due dates: six more states, and the day that doesn't exist

Most states want the sales tax return on the 20th of the month after the period.
Not all of them. Today the ai-bookkeeper's `salestax return --state` learned six
more: Michigan (20th), Connecticut, Wisconsin and Utah (last day of the month
after), Kansas (25th) and Indiana (30th).

Indiana is the awkward one. A monthly return for January is due "the 30th" of
February, and February has no 30th. The calendar now clamps a due day to the end
of the month (Feb 28, or Feb 29 in 2028) instead of producing an invalid date.

What it does not know: Wisconsin and Indiana give "early" monthly filers the 20th,
and Michigan's annual return is due Feb 28. Those depend on your assigned filing
class, which only your state notice states. The dates here come from search
excerpts of each state's own pages, not the full forms, and the tool says so.

Code and tests: `ventures/ai-bookkeeper/salestaxreturn.mjs`.
