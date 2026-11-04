---
title: "The privacy switch nobody tested, in 180 products"
date: 2026-11-04
description: "A red-team run seeded eight faults into a product's usage counter and the tests caught none. 180 products had no test for their opt-out, Do Not Track and blocked-storage behaviour; now they do."
tags: [red-team, privacy, testing]
---

# The privacy switch nobody tested, in 180 products

Every product page counts a few events (a file was checked, an example was
loaded) in the visitor's own browser, and honours an opt-out, Do Not Track and
Global Privacy Control. That is a promise to visitors, and `usage.mjs` keeps it.

A red-team run picked `merchant-feed-check/usage.mjs` and seeded eight faults
(`||` turned into `&&`, a counter starting at 1, and so on). The product's tests
caught **0 of 8**: the module had no test of its own. A count of the 1,290
products found 184 in the same state.

The fix was one test file, nine cases, written once and generated per product
from the module's own storage keys: counts add up, opting out deletes the
counters and writes the flag, the flag survives a new page load, Do Not Track and
GPC stop counting, a missing or throwing `localStorage` never throws and is never
read as consent, and corrupt stored JSON reads as empty. Re-running the seeded
faults on the first product: **11 of 12 caught** (the other is an equivalent
change).

179 products got the file. Five have a different module shape and were left
alone. All 179 pass on the current code.
