---
title: "One misspelled header turned every county card charge into income"
seo_title: "A misspelled MCC column, and 850,000 Oklahoma card lines"
date: 2026-11-15
tags: [bookkeeping, open-data, purchasing-card, mcc, csv, categorization, ai-bookkeeper]
description: "A county P-Card report spells its category column MCC_DESCRPTION, so every charge imported as income. 850,000 state lines then found keyword bugs."
---

The open-source bookkeeper in this repository ([ai-bookkeeper](../../ventures/ai-bookkeeper/README.md)) learns to file bank and card lines from the books it is given. It has been tested on public purchasing-card data from three British and Canadian public bodies. Today we tested it on an American one: the State of Oklahoma, which publishes every state purchasing-card line, one file a month, plus a combined report from its counties for 2022 to 2024.

## The header that wasn't a header

The county report is put together by hand each month, and you can tell. Across 30 files the header is spelled at least eight ways: `Amount` with spaces around it, `$425.60 ` with a trailing space, `MERCHANT_NAME`, `Purchase Date`. One month has old Mac line endings (a bare carriage return). Two months were saved as Excel 97 workbooks. The importer already handled all of that.

What it didn't handle was `MCC_DESCRPTION`, the merchant-category column, misspelled in 24 of the 30 months. That one column matters more than it looks. A purchasing-card report lists charges as positive numbers. The importer can only tell such a file from a bank export, where positive means money in, because the file carries a merchant-category column. Without that column it took the numbers as printed, so **every charge in 24 months of county card spending would have imported as income.** Totals matched to the penny, and the sign of nearly every line was wrong.

The misspelling is now a known heading. All 30 county files and 24 state files (858,879 lines) now read exactly: every line, every charge as money out, the category on every line. We checked the totals against a separate, deliberately plain reading of each file's Amount column. Before the fix, 6 of the 30 county files read correctly.

## No answer key, so we measured agreement

These files don't say which account the state filed each line to, so we couldn't score right and wrong the way we did for Durham or Toronto. Instead we measured two things those sets couldn't:

1. **How often the network's category name alone gives an account.** The state's files print the name, not the four-digit code, and cut it to 40 characters.
2. **How often the built-in keywords, reading only the merchant name, agree with that category** where both give an answer.

We read fiscal 2017 (416,812 charges) to make the changes. Fiscal 2018 (407,011) and the county files were held out.

On the first question, a third of charges got no account from their category. Most of those should get none: "grocery stores", "business services", discount stores. But some were our fault. The patterns ended at a word boundary, so stems never matched ("TRAVEL AGENCIES", "HORTICULTURAL", "EXTERMINATING", "TOLLS"). Hotel categories are plural ("HOLIDAY INNS"). And the network names codes 3000 to 3999 after single companies, like "DELTA", "HERTZ CORPORATION" and "WYNDHAM", which no generic pattern catches. Each fix maps a name to the account its code already got, and we read all 59 changed names by eye. Coverage went from 65.1% to 69.7% on the held-out year, and reached 70.4% on the county files.

On the second, reading the disagreements turned up real keyword bugs:

- "CBI WHOLESALE ELECTRIC" and other electrical supply houses were filed as utilities, because of the word "electric".
- "XEROX" was filed as accounting software, because of "xero".
- "BRENNTAG SOUTHWEST", a chemical distributor, was filed as the airline.
- "DOMINO EQUIPMENT" was filed as the pizza chain.
- "PHILLIPS 66 - CRUISE AVIA", an airport fuel stop, was filed as a cruise.
- From the held-out year: "SPECTRUM PAINT" was filed as the cable company, and "PIKEPASS REBILLS", Oklahoma's toll tag, as a utility through "ebill".

| keywords agree with the category, where both speak | fiscal 2018, held out |
|---|---|
| before | 90.4% (12,130 disagreements) |
| after the fixes from fiscal 2017 | 92.8% (9,008) |
| after also reading fiscal 2018's misses | 93.1% (8,611) |

## What it doesn't say

Agreement isn't correctness. A category says what a merchant sells, not why the buyer paid. The largest disagreement left is NAPA and O'Reilly auto parts. Their category says vehicle costs, while the keywords file them as supplies, because earlier labelled tradespeople's books wanted parts as job materials. This set can't overrule that judgement, so we left it.

Nothing moved on the labelled sets. The ten Mint exports (2,926 lines), three YNAB household registers (633 lines) and Durham County Council's 151,437 card lines (keywords alone) score the same to the line before and after.

Two problems are left open. The chain-name list from OpenStreetMap files "SANTA CRUZ BIOTECHNOLOGY" as a food shop, because Santa Cruz is a place name as well as a chain. And a public utility whose name was cut to "NORTHEAST OKLAHOMA PUB" gets filed as a pub. Both need a general rule, not another exception.

The script that reads the files, `eval/oklahoma-pcard.mjs`, prints the fetch commands. The data is the State of Oklahoma's and isn't copied into the repository. Cardholder names are in the files, and the script never reads them.
