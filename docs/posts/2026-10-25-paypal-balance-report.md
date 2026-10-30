---
title: "ai-bookkeeper now reads PayPal's Balance Reconciliation report"
date: 2026-10-25
description: "PayPal's own sample of its current merchant report was refused by ai-bookkeeper's payout import. It now reads it, and groups sales into deposits by Transfer ID."
tags: [ai-bookkeeper, paypal, payouts]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) splits a payout into sales,
refunds and fees so the bank line books to the right accounts. Its PayPal reader
knew the older activity CSV. PayPal's current merchant report, the Balance
Reconciliation report, has a different shape: report header rows, a column row,
detail rows tagged `RD`, a footer. PayPal publishes a sample file, and the
import refused it with "No gross column".

It now reads it. Sales and refunds use the net amount (gross less the partner
commission and fees taken up front). Rows that share a Transfer ID, the id PayPal
says appears on the bank statement, are one deposit. Fee records that PayPal
invoices later are reported, not deposited, and mixed currencies are flagged.

Limits: the report has no deposit row, so the total cannot be cross-checked
against anything. The tests use a made-up file in the documented layout; the
sample itself was read at run time and not copied. A real merchant's report is
still wanted.
