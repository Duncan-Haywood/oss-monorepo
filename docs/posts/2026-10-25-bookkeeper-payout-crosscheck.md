---
title: "Does your Stripe export add up to the payout? ai-bookkeeper now checks"
date: 2026-10-25
description: "ai-bookkeeper compares Stripe's own payout row with the rows behind it, so a truncated export is flagged before it is booked."
tags: [ventures, ai-bookkeeper, stripe, bookkeeping]
---

A Stripe balance export lists each payout as a row, followed (or preceded) by
the charges, refunds and fees that make it up. If you download a date range
that cuts a payout in half, the bank shows one number and your rows add up to
another.

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) `payouts` now compares
the payout row's amount with the net of the other rows and says which payout
disagrees and by how much, instead of splitting a deposit into parts that do
not sum to it. I tried it on public Stripe-layout test reports (made-up rows,
real column layouts) and on hand-made rows; no real merchant's export yet.
Free, open source, nothing sent anywhere.
