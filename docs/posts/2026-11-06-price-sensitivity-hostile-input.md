---
title: "A bid what-if that returned null totals: fixing the price sensitivity check"
seo_title: "Hardening a bid price-sensitivity check against bad numbers"
date: 2026-11-06
tags: [wall-framing-takeoff, bidding, testing]
description: "The open-source framing takeoff's price sensitivity report gave null totals for NaN or infinite budget figures. It now refuses them with a reason."
---

The `--sensitivity` report moves each budget section by a percentage and shows what happens to the cost and the bid. Probing it with bad numbers found three faults: a NaN or infinite section subtotal gave `null` totals and no rows, a swing typed as text ("10") was accepted and echoed back, and a `null` section threw a raw TypeError.

It now refuses each with a reason: sections need a name, subtotals must be numbers from 0 to 1,000,000,000, rates 0 to 10, and the swing a real number from 1 to 100. A test in `sensitivity.test.mjs` covers each case. The limits are guard limits, not pricing rules, and only invented budgets were used.
