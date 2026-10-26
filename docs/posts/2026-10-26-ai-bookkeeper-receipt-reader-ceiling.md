---
title: "Where the receipt reader stops: 16 wrong totals out of 625"
date: 2026-10-26
description: "On 626 real Malaysian receipts the ai-bookkeeper reader gets 97.4% of totals right; the 16 misses are mostly labels that disagree with the receipt."
tags: [ai-bookkeeper, receipts, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads receipt text into a merchant, date and total. On the SROIE set (626 scans, word boxes) it gets merchant 84.7%, date 98.4% and total 97.4% exactly right. Going through the 16 wrong totals today: three are Domino's receipts labelled with the sum before a coupon while the receipt's grand total is after it, and seven are rounded-against-unrounded labels. Chasing those would fit the reader to the labels, not the receipts, so the box-based total is left alone; real phone photos are the next test.

One real fix landed: a company name wrapped over two lines (`POPULAR BOOK` over `CO. (M) SDN BHD`) is now read as one name. Estimates only, not accounting advice.
