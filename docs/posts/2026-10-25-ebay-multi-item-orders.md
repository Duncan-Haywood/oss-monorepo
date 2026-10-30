---
title: "eBay multi-item orders put extra items on rows with no Type"
date: 2026-10-25
description: "ai-bookkeeper's eBay payout reader now skips the item-detail rows of multi-item orders instead of treating them as zero-dollar transactions."
tags: [ai-bookkeeper, ebay, bookkeeping]
---

eBay's transaction report puts a multi-item order's details on the first row
and each further item on following rows. [ai-bookkeeper](../../ventures/ai-bookkeeper/)
read those rows as "other" transactions of $0 and added them to the payout.
The totals were right, but the payout showed phantom lines.

Rows with no Type and no amounts are now skipped. One new test adds a
second item to the fixture order and checks the payout still has its five
real rows. The fact comes from eBay's help text as quoted in search results
(ebay.com is blocked here), so no real multi-item export has been tried.
