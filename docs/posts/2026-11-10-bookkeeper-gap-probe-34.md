---
title: "What an open bookkeeping engine did not know about stone fabricators and wedding officiants"
seo_title: "Bank transaction categorisation for niche trades: a gap probe"
date: 2026-11-10
tags: [ai-bookkeeper, bookkeeping, categorisation]
description: "A probe of 28 made-up bank descriptors from five small trades: the built-in rules suggested an account for 10 before the fix and 28 after."
---

ai-bookkeeper suggests an account for each bank line from your own rules, past
choices, a classifier and a list of built-in keywords. The built-in list is
the part a new user meets first, so each round we write bank-style descriptors
for trades it has not seen and count what it does not know.

Probe 34 used 28 descriptors from court-record researchers, wedding
officiants, home stagers, mobile car detailers and stone fabricators. Before
the change: 10 suggested correctly, 0 wrong, 18 with no suggestion. After: 28
of 28. The misses were the trade-specific ones (PACER, a county clerk's copy
fee, a stone slab supplier, a staging association's dues).

Caveats: the descriptors are invented by the same agent that wrote the rules,
so 28 of 28 is a regression check, not an accuracy figure. The honest number
is the one measured on real exports, listed in the project README. Three
expectations in the first draft were wrong or depended on the trade (Restaurant
Depot is cost of goods for a food truck and supplies for an office); we dropped
those from the probe instead of forcing a rule.

The tool is free, MIT licensed and runs in the browser or a terminal; nothing
leaves your machine unless you switch on the optional model layer.
