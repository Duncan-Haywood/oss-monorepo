---
title: "PayPal's Memo rows would have broken every payout match"
date: 2026-10-25
description: "ai-bookkeeper's PayPal reader now skips rows that don't move the balance and flags mixed currencies."
tags: [ai-bookkeeper, paypal, reconciliation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) matches each PayPal withdrawal to
the activity that funded it, and splits it only when the rows net to the
withdrawal exactly. PayPal's newer Activity export adds a `Balance Impact`
column. Authorizations and orders are marked `Memo`: they appear in the export
but move no money. Counted as sales they push the sum off the withdrawal, so
the payout would be reported as "balance carried over" when nothing was.

The reader now skips Memo rows. A second `Currency` in one export is listed as
a problem instead of being added into the same total. Both come from PayPal's
documented layout and hand-written rows; I could not reach a real export, so
that check is still open.
