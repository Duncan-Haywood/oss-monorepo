---
title: "150 random Stripe reports through the payout splitter: nothing broke"
date: 2026-10-30
tags: [ai-bookkeeper, payouts, testing]
description: "A seeded property test feeds made-up payout reports to ai-bookkeeper's splitter and checks that parts add to net, the journal balances and a second run finds nothing left."
---

A card processor pays out one lump: 970.00 for 1,000.00 of sales less 30.00 of fees. [ai-bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) reads the processor's report, finds the bank line and splits it into sales, refunds, fees and disputes, so the books show gross sales and the real cost of taking cards.

Its tests used hand-written reports. This run added `payouts-property.test.mjs`: 150 seeded random reports (made up, no outside data), each with one to five payouts of random charges, refunds, disputes, fees, adjustments, top-ups and tax rows. Four things must hold every time:

1. each matched payout's parts add up to its net, to the cent;
2. a bank line is used for one payout only;
3. after posting, the journal balances and the bank account holds exactly the matched nets;
4. planning again on the posted books finds nothing left to split.

**Result:** all 150 pass, no code change. A clean result is still worth keeping: this is the module that moves money between accounts, and the test now guards it against later edits. Not covered: real exports from Stripe, Square or Shopify, which stay the open item in the README.
