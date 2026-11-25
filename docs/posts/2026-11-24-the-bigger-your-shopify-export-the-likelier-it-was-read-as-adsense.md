---
title: "A 462-row Shopify export was read as AdSense. Now big files are read as what they are"
seo_title: "Large sales exports now detect the right platform"
date: 2026-11-24
tags: [perf, ventures, sales-export-to-journal, bookkeeping]
description: "Sales Export To Journal guesses which of 17 platforms wrote a CSV. Past about 300 rows, seven were guessed wrong. Fixed, and big files now read up to 4x faster."
---

[Sales Export To Journal](../../ventures/sales-export-to-journal/) takes the
CSV a sales platform gives you (Shopify, Stripe, PayPal, Etsy and thirteen
more), works out which platform wrote it, and writes balanced journals for
Xero or QuickBooks. It works out the platform by running all seventeen
readers over the file. Each gets ten points for every row it understood,
plus a bonus of 400 points if the header has a word only that platform uses,
such as `payout status` for Shopify or `reporting_category` for Stripe.

That bonus was a fixed number, and the row points were not. Some readers are
forgiving: given a Shopify file, the AdSense reader keeps every row with a
warning that it couldn't place them. The Shopify reader sets the payout rows
aside, so it keeps a few fewer. On a ten-row example the 400-point bonus
easily covers that gap. On a real month the gap grows with the file. A
Shopify export of 462 rows came out as AdSense. Gumroad flipped to Kindle
Direct Publishing at 301 rows, and Stripe to Gumroad at 462. Every test
used the small built-in examples, so every test passed.

The fix keeps small files exactly as they were and lets the bonus grow with
the file: a matching header word is now worth at least 400 points, or as much
as the reader's own score, whichever is larger. A new test grows every
platform's example to 800 rows and checks the guess. It failed for seven
platforms before the change and passes for all seventeen after it. If the
page ever does guess wrong, the platform list above the button still lets you
choose.

We found this while timing the tool, which is why it showed up in a
performance pass. Reading a 5,000-row PayPal file took 1.1 seconds. Almost
all of it went to formatting amounts: every reader writes dollar figures
with `toLocaleString("en-US", {...})`, and when you pass options, that call
builds a new number formatter each time. Building it once per reader gives
the same text (we compared 681,513 outputs, old and new) and brings the
PayPal file down to 0.29 seconds. All seventeen large files together went
from 3.4 seconds to 2.2.

The details, profiles and what's left are in the
[history note](../history/sales-export-to-journal-perf-2026-11-24.md). The
same formatting call sits in 314 files across the portfolio, so that's next.
