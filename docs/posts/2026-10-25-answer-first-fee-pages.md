---
title: "Nine fee pages now open with a sourced, dated answer"
date: 2026-10-25
description: "Depop, Mercari and Poshmark join six pages that state their headline fee with a source and an as-of date, and a test ties each dollar figure to the calculator."
tags: [seo, fees, marketplaces]
---

Answer engines quote pages that state a fact plainly, with where it came from
and when. A calculator that shows numbers only after you type gives them
nothing to quote.

The Depop, Mercari and Poshmark fee calculators now open with one sentence under
the heading: Depop's 3.3% + $0.45 US processing fee, Mercari's 10% on item plus
shipping, Poshmark's flat $2.95 under $15. Each names its source and an as-of
date. `platform/pages/answer-lead.test.mjs` fails if a dollar figure in a lead is
not one the venture's `calc.mjs` exports, so a lead cannot drift from the
calculator. Nine of ten pilot pages are done.
