---
title: "Red team: the eBay calculator charged one order fee to every unit"
seo_title: "eBay fee calculator red team: batch fixed fee and blank fee boxes"
date: 2026-11-24
tags: [redteam, testing, ebay, resellers, fees]
description: "20 faults seeded in the eBay Fee & Profit Calculator, 13 caught, 4 now guarded; plus three real bugs in batch pricing and blank fee boxes, now fixed."
---

This red-team run aimed at the [eBay Fee & Profit Calculator](../../ventures/ebay-fee-calculator/),
the free tool at the front of the seller-tools family that leads to Seller
Books. Its engine (`calc.mjs`, about 5,400 lines) and its CSV export
(`csv.mjs`) were the targets.

## Seeded faults

`prompts/redteam.py` changed one line at a time, ran the venture's tests and
put the line back. Of 20 faults, 13 failed a test. Of the 7 that passed:

| Fault | Verdict |
|---|---|
| auction's profit delta against Buy It Now computed as a sum | gap: no test read that field; now pinned |
| an exact combined-shipping tie read as "less" | gap: now tested on the note formatter |
| the immediate-payment row's unpaid share shown as 1% | gap: the table prints it; now pinned at 0% |
| unrefunded fees doubled in the Managed Returns break-even fee | gap: that break-even had no test; now it is plugged back in and must tie |
| three float-tolerance and quantity boundaries | equivalent: money inputs cannot reach them |

All four gaps fail with their fault in place now (`redteam.py rerun`).

## Real bugs

Reading the engine as a stranger would use it turned up three wrong answers:

1. **Price for a target leftover, on a batch.** eBay charges the per-order
   fixed fee once per order, and the order result already spreads it across
   the units. The price solver charged it to every unit, so for 10 units and
   a $30 target it named a price that leaves $33.61.
2. **Sourcing ceiling, on a batch.** The same mistake, the other way round:
   the most you can pay per item for a 25% return came out low enough that the
   order then showed 26.1%. A test written earlier had pinned the per-item
   ceiling as identical at 1 and 3 units, which is what hid it.
3. **A cleared fee box.** The page hands the engine each box's raw text, and
   `'' ?? 13.6` keeps the empty string, which reads as 0. Clearing the final
   value fee box to retype it showed an order with no final value fee at all
   ($6.26 too much profit on a $46 order), and a cleared "fees refunded on
   return" box read as 0% instead of the 100% default. Blank now means the
   default, as it already did in every comparison section. A typed 0 is
   still 0.

Each one has a test that failed before the fix. The same `?? default`
pattern appears in about 20 other venture calculators. Whether it bites
depends on whether each page passes blank boxes through (the Amazon FBA page
handles blanks itself), so it is noted for a later run, not linted here.

*This calculator is an estimate from the numbers you type, not eBay's fee
schedule and not tax or financial advice.*
