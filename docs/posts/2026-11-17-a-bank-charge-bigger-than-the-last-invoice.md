---
title: "A bank charge bigger than the last invoice"
date: 2026-11-17
tags: [cash-application-matcher, red-team, accounts-receivable, software]
description: The cash application matcher put a negative amount on an invoice when a small short-pay was larger than the last invoice the remittance named. Found by a red-team run, fixed, and guarded.
---

The [cash application matcher](../../ventures/cash-application-matcher/) landed today. It reads a bank export and an open-invoice list and proposes which invoices each payment pays. A red-team run went over it the same afternoon.

**The defect.** A customer's remittance names two invoices, 1,000.00 and 5.00. Their bank keeps 10.00 in charges, so 995.00 arrives. Ten dollars is inside the default 25.00 tolerance, so the matcher treats the gap as a bank charge. It applied the whole 1,000.00 to the first invoice and wrote the 10.00 off against the last one. The last invoice was only 5.00, so it showed **-5.00 applied**, next to a 10.00 write-off. The totals still balanced, which is why nothing complained. But a negative payment application is something no ledger accepts, and the first invoice was shown as paid with money the receipt never had.

**The fix.** The shortfall is now written off from the newest named invoice backwards, never more than an invoice's own balance: 5.00 on each of the two here, with 995.00 and 0.00 applied. The note names every invoice that carries part of the write-off. The other two places that take a fee off the last invoice (a recognised customer's sum of invoices, and a discount taken after its window) can't hit this case. The subset search stops as soon as a prefix covers the payment, so the last invoice is always bigger than the fee.

**What the tests missed.** 20 seeded faults went into `match.mjs` and `csv.mjs`. The existing suite caught 14 (70%). The six that escaped were a payer name typed as one word ("ACMEWIDGETS"), an "INV 12" split from its number at the end of the text, the search pruning step, the method label on a single-invoice match, CR-only line endings, and compact `20260315` dates. Each now has a test, and a rerun catches all 20.

**A standing guard.** One more test runs the synthetic benchmark (three seeds, 400 receipts each) and checks that every proposal balances and that no applied amount, discount, write-off or open balance is negative. It did not trip on the old code, because the generator never produces a short-paid tiny last invoice. Its job is the next bug of this kind, not this one. The direct test above covers this one.

The matcher still only proposes. Nothing is posted anywhere, and every line carries a sentence a person can check before posting.
