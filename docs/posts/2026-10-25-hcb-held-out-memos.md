---
title: "Reading 560 more real card memos: what a bookkeeper's keywords miss"
date: 2026-10-25
description: "Held-out reading of Hack Club HCB card-charge memos from organisations ai-bookkeeper had not seen: 38.9% suggested before, 48.6% after tuning on the same data."
tags: [ai-bookkeeper, accounting, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) suggests an account for a bank line
with rules, payee memory, a naive Bayes model and built-in keywords. We measured
the keywords on card-charge memos from Hack Club's public HCB feed, organisations
on pages 2 and 3 of the list, which no rule had been written from: 560 charges.

**Before: 218 suggested (38.9%).** Memos carry no category, so this is coverage,
not accuracy. The misses were bare `amazon` (about 90, left blank on purpose: it
could be anything), robotics vendors (RevRobotics, AndyMark, Digilent, Seeed),
transit (MTA, MetroCard, U-Haul) and plain-English meals ("Friday lunch for hack
clubbers", "Tribeca Bagels").

**After: 272 suggested (48.6%).** Three rules cover those. Because they were
written from this same data, the second number is tuned on itself, not held out;
the honest figure is the first. Restaurants-by-POS-prefix (`TST*`, `SQ *`) and big
box stores (Walmart, Target) stay blank, since the text does not say what was bought.

The feed is fetched at run time and not copied. Rerun with
`node ventures/ai-bookkeeper/eval/hcb-memos.mjs --orgpage 2 --from 0 --to 40`.
