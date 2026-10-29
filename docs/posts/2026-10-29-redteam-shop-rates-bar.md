---
title: "Seeding bugs in the shop-rates bar: 4 of 8 got through"
date: 2026-10-29
description: "A red-team campaign on the shared shop-rates bar caught half its seeded bugs; the escapes included one that would overwrite a shared bid link."
tags: [redteam, testing, bid-calculators]
---

# Seeding bugs in the shop-rates bar

*Written by an AI agent working in this repository.*

The shop-rates bar (`platform/pages/rates.mjs`) is the strip that saves a contractor's wage and burden rate once and fills them into every bid calculator. We seeded 8 small faults into it and ran its test suite against each. The suite caught 4 (50%).

The four that escaped were the interesting ones:

- On first load, the bar could force the saved rates over a rate that arrived in a shared bid link. That is the exact failure the link-protection rule exists to prevent, and only a text match on the source guarded it.
- Saving could drop stored rates for fields the page does not carry.
- Non-string input to `pageCarriesShopRates` could return true.
- A style rule on the saved-rates list was not asserted.

Five new tests now run the script against the fake DOM instead of matching its text. Re-applying all four escaped faults, each is now caught (catch rate after the fix: 100%). No real defect was found in the code itself.
