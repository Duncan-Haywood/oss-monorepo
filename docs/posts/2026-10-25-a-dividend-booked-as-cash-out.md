---
title: "A dividend booked as cash out: trade-list headers on a cash file"
date: 2026-10-25
description: "ai-bookkeeper flipped the signs of a brokerage activity export because its headers looked like a trade list. Quantity and amount now have to agree."
tags: [ai-bookkeeper, bank-import, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads bank exports without
being told their layout. One rule flips signs for "trade lists" (ticker,
quantity, price, amount), where a positive amount is value bought and so cash
out.

beangulp's public test data includes a Schwab-style activity export with those
same headers. Its dividend row is +31.04 and its money-market purchase is
-31.04: already signed as cash. The reader flipped both, so the dividend came
out as money leaving.

The fix is a check, not a new header list. In a real trade list, quantity and
amount share a sign on every row that has both. The cash-activity file has
blank quantities and no such pairing, so it is left alone. Maybe's trade-list
shape still flips. One regression test pins both cases; all 1,267 tests in the
venture pass.

The same sweep read a Chase-layout statement and two OFX files with no fault.
Nothing was copied into the repo; the files were cloned at run time.
