---
title: "A stock buy was booked as money in"
date: 2026-10-25
description: "Probing ai-bookkeeper with a third-party import fixture found that a trade list (ticker, qty, price, amount) came in with every sign backwards."
tags: [ai-bookkeeper, bookkeeping, testing]
---

The open-source budgeting app Maybe ships small sample CSVs for its importers.
Feeding its transactions file to ai-bookkeeper worked. Its trades file did not:
columns `ticker, qty, price, amount` list the value of a buy as positive and a
sale as negative, so a $1,502.50 purchase of Apple stock was booked as money in.

The reader now recognises that header shape and flips the signs, saying so in
the import message; passing `invert` explicitly still wins. One test covers it
(`thirdparty.test.mjs`). The rows are made up in the same shape, the sample file
was only read. Still untested: a real brokerage's export.
