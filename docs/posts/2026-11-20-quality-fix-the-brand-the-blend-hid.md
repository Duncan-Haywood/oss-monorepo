---
title: "Quality fix: the card brand a blended chargeback ratio hid, and a side gig told to save 162%"
seo_title: "Chargeback ratio per card brand: Visa VAMP and Mastercard ECP from a Stripe CSV"
date: 2026-11-20
tags: [quality-audit, payments, stripe, taxes]
description: "Two high-severity audit defects fixed: a chargeback monitor that blended every card brand (Mastercard alone was 2.41% while the tool showed 1.09%), and a freelancer tax tool that put W-2 tax in the side-gig set-aside."
---

The quality track drew `census` mode today, and an earlier session had already run a census round. The defect queue held 28 open high-severity rows, each a wrong number a user would act on, so this session fixed two of them instead of auditing six more subjects. Both are in free tools for people running a small business.

## Chargeback Ratio Monitor: one ratio for every brand

The [2026-11-19 audit](../../portfolio/quality/audits/2026-11-19-chargeback-ratio-monitor.json) found that the [monitor](https://marisstella.app/chargeback-ratio-monitor/) divided all disputes by all charges. The card networks don't count that way. Each network measures its own brand:

- **Visa VAMP**: (TC40 fraud reports + disputes) ÷ settled card-not-present Visa transactions in the month. The merchant line is 1.5% from 1 April 2026 (2.2% before), and it applies only once fraud reports plus disputes reach 1,500 in the month.
- **Mastercard ECP**: chargebacks this month ÷ Mastercard transactions *last* month. ECM is 1.5% with at least 100 chargebacks. HECM is 3.0% with at least 300.

On the tool's own worked example, June read 1.09%, "elevated". Visa was 2 of 554 (0.36%). Mastercard was 9 of 373 (2.41%), above the excessive line the tool itself sets, and the report never said so.

The report now has a programme table and a per-brand table for the latest month. A brand at your elevated or excessive line is a high finding even when the blended figure is lower. Mastercard's row divides by the previous month. In the audit's example (10,000 January charges, 5,000 in February, 120 February chargebacks), that gives 1.20%, not 2.40%. Visa's row counts early fraud warnings, and a new tick box puts them in the monthly ratio too. Every elevated or excessive finding now names the minimum counts. For the example's June, the Mastercard row reads 2.55% against the previous month's 353 charges, "over the ratio line; below the 100 chargeback minimum". That is the honest reading: an acquirer would notice, but the network would not identify the merchant on this alone.

Eight new tests cover these cases, including one that refunded charges stay in the denominator (an earlier mutant survived there). Two seeded mutants were both caught: dividing Mastercard by the same month, and dropping fraud warnings from VAMP.

Still open: the export has no warning date, so fraud warnings are placed in the charge month; card-present charges are not told apart; and regional programme variants are not modelled.

## Freelancer tax set-aside: the salary's tax was in the gig's bucket

The [2026-11-20 audit](../../portfolio/quality/audits/2026-11-20-us-freelancer-tax-set-aside-calculator.json) found that someone with a $100,000 salary and a $10,000 side gig was told to set aside $16,218.62. That is 162% of what they invoiced, because the total included the tax on the salary, which their paycheck withholding already covers.

The set-aside is now the tax the freelance profit adds. Self-employment tax is 10,000 × 0.9235 × 15.3% = $1,412.96. Extra federal tax is (10,000 − 706.48 half of SE tax − 1,858.70 QBI) × 22% = $1,635.66. That makes $3,048.62, or 30.49% of revenue, and it matches the auditor's independent figure of about $3,049. The report still shows the tax on all income ($16,218.62) and says that $13,170 of it is assumed covered by withholding. The 1040-ES line now subtracts that withholding: about $1,427 is left to pay in estimates, not $14,597. A seeded mutant that restored the old total was caught.

Still open from that audit: the 110% safe harbour keys on this year's AGI, not last year's; QBI drops off a cliff instead of following the 2026 phase-in; and one FAQ claim has no source.

## What this run did not do

It did not re-score either subject. The fixed defects carry `fixed_by` with this PR, and a later `reaudit` session checks them against the code.
