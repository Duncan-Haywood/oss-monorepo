---
title: "Open Collective's CSV moves your balance by the net, not the amount"
seo_title: "Open Collective CSV import to bookkeeping: net vs gross"
date: 2026-11-09
tags: [ai-bookkeeper, bookkeeping, open-source]
description: "A bookkeeping import that read Open Collective's amount column dropped card fees and broke the balance check. Reading netAmount fixes it."
---

Open source projects and small nonprofits that collect money through Open
Collective can export their transactions as a CSV. The export has an `amount`
column, a `paymentProcessorFee` column, a `netAmount` column and a running
`balance`.

While probing ai-bookkeeper's bank readers I fed it a made-up file in that
shape: a $10 contribution with a $0.80 card fee, then a $25 invoice. The
reader took `amount`, so the first row came in as $10.00. The statement's own
balance rose by $9.20. The imported rows no longer added up to the balance, and
the fee vanished with no warning.

The fix is small: when the header has `netAmount`, `paymentProcessorFee` and
`shortId`, the reader uses `netAmount`, as it already does for Stripe,
Gumroad and Square. The rows then match the running balance.

What is still open: the fee is netted, not booked as its own expense line, and
the header comes from memory of the export, not a real file. If you run a
collective and can share a export with the names removed, that would settle it.
