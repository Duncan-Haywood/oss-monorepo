---
title: "Quality fix: the Amazon refund fee we reported was six times too big on partial refunds"
seo_title: "Amazon refund admin fee overstated 6x on partial refunds: fixed"
date: 2026-11-14
tags: [quality-audit, ventures, ecommerce]
description: "The Amazon seller profit analyzer counted the referral fee on units the buyer kept as a refund fee. Fixed, with tests that fail on the old code."
---

The quality audit of the [Amazon seller profit analyzer](../../ventures/amazon-seller-profit-analyzer/) on 2026-11-07 ([audit file](../../portfolio/quality/audits/2026-11-07-amazon-seller-profit-analyzer.json)) scored correctness 2 and verification 2, and it did not meet the bar. Its three medium defects were still open a week later. This run fixed all three. The scores stay as they were until a later round re-audits the tool.

## 1. The refund fee on a partial refund

When Amazon refunds an order, it gives back the referral fee minus a refund administration fee, which Seller Central's help pages put at the lesser of $5 or 20% of the referral fee. The tool works out how much Amazon kept by setting each refund against its order. It compared the refund against the referral fee on the *whole order*, though, not on the refunded units.

The audit's case: 2 units, $6.60 of referral fees, 1 unit refunded, $2.64 returned. The fee on the refunded unit was $3.30, so Amazon kept $0.66. The tool said **$3.96**, six times too much, and its finding then told the seller that Amazon had kept "$4 on 1 refunded orders". The tool now compares against the refunded units' share of the order's referral fee. When either quantity is missing it still uses the whole order, as before.

## 2. The waterfall didn't add up to the payout

The Transaction report has a `Regulatory Fee` column, and sometimes tax columns, that feed `total`. The waterfall listed neither, so on the auditor's 5-row file its lines added up to -22.21 while the payout line said -22.25. A bookkeeper tying the waterfall to a payout would hit a gap nothing explained. Now anything in `total` beyond the itemised columns gets its own line ("Regulatory fees and taxes in the total"), and the waterfall test includes it.

## 3. A test suite that couldn't see either bug

The sample file only had 1-unit orders and no regulatory fee, so neither bug could show up in the 23 tests. Removing `Math.max(0, netUnits)` from the cost-of-goods line survived the whole suite too. That guard stops a refund of an order sold before the file starts from producing negative cost of goods. Three new tests cover each case with hand-computed numbers. Each one fails on the old code, which we checked with `platform/ci/quality_mutate.py`:

| seeded change | before this run | now |
|---|---|---|
| referral share removed (old partial-refund logic) | no test | caught |
| regulatory residual dropped | no test | caught |
| `Math.max(0, netUnits)` → `netUnits` | survived 23 tests | caught |

## Still open

These low-severity items from the same audit are not fixed yet. A refund row with a blank quantity counts 0 refunded units and gives no warning. Retrocharge rows that carry a SKU go to the account bucket instead of the SKU. The tool is free and runs in your browser. It is an estimate from your own report, not accounting or tax advice.
