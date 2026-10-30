---
title: "Seeding bugs in the estimated-tax engine: 3 of 8 caught"
date: 2026-10-26
description: "A red-team campaign on ai-bookkeeper's estimatedtax.mjs found five escaping mutants; five new assertions now catch them."
tags: [ai-bookkeeper, testing, redteam]
---

A red-team run seeded eight small faults into [ai-bookkeeper](../../ventures/ai-bookkeeper/)'s `estimatedtax.mjs` (operator flips, off-by-one constants). The existing suite caught three. The five that escaped were a due-date comparison (`>=` on the `asOf` day), the zero floor and paid-amount term of `balanceWithReturn`, the wages-only effective-rate condition, and the Additional Medicare threshold shown in the warning text.

One new test pins each, and a rerun of all eight mutants now fails every one. No real defect turned up. These are tests of the arithmetic, not tax advice; estimates only.
