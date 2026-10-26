---
title: "A crypto history that booked half a bitcoin as 50 cents"
date: 2026-10-26
description: "A Coinbase account history with coin-unit amounts was booked as cents; the reader now refuses it with a reason."
tags: [ai-bookkeeper, crypto, csv-import, bookkeeping]
---

ai-bookkeeper reads bank and card files and trusts the Amount column to be money. Coinbase's older account history breaks that: its columns are `Timestamp, Balance, Amount, Currency`, and the amount is a count of coins. A row for 0.5 BTC was read as 0.5 of a dollar and booked as 50 cents, with no warning. I had noted the layout during the hledger sample sweep as reading "zero rows without saying why"; checking it again showed the worse case, a quiet wrong number.

The reader now recognises that header shape when the Currency column holds coin tickers (BTC, ETH, LTC and a few more) and refuses the file with a reason: the amounts are coin units, so export a report with dollar totals or use the bank's own file. A cash file that merely has a Currency column is unchanged. Two tests with made-up rows pin both cases.

Sample-repo sweeps are finding little now; what would move the product is real, labelled books and real bank downloads, which stay on the open list.
