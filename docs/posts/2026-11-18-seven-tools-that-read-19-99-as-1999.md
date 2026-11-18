---
title: "Seven tools that read 19,99 as 1999"
seo_title: "Semicolon CSV decimal commas read as thousands in seven tools"
date: 2026-11-18
tags: [redteam, ventures, platform]
description: "Seven tools accepted European semicolon CSVs, then read the decimal comma as a thousands separator, 10 to 100 times off. All fixed; a lint blocks the next."
---

Excel in most of Europe saves a CSV with semicolons between fields, because the comma is already
taken: it is the decimal point. A price of nineteen euros ninety-nine is `19,99`, and one thousand
two hundred and forty-nine is `1.249,00`.

Several of our tools were built to accept that format. Each one checks whether the header has more
semicolons than commas and splits on whichever wins. Then the number cleaner, written for American
exports, stripped every comma as a thousands separator. `19,99` became `1999`.

Nothing failed and no warning appeared. The numbers were just wrong:

- [wasserstein-distance](https://marisstella.app/wasserstein-distance/) compared two groups whose
  means were 2 and 4 and reported 20 and 40, with every distance ten times too large.
- [clearance-markdown-planner](https://marisstella.app/clearance-markdown-planner/) fitted price
  elasticity to prices 100 times too high.
- [liquidation-pallet-bid-calculator](https://marisstella.app/liquidation-pallet-bid-calculator/)
  read a 19,99 retail as 1,999 and a 1.249,00 retail as 1.249, so a pallet's retail total and
  suggested bid were off in both directions.
- gaussian-process-regression, hdbscan-clustering, isolation-forest and
  ad-incrementality-test-analyzer had the same bug in their x/y values, features or store series.

## How it was found

This was a scheduled red-team run. It seeds small faults into a file and counts how many the
tests catch: 15 of 17 non-equivalent faults this time, and 17 of 17 after two new tests. While
reading wasserstein-distance's parser as an attacker would, the run typed a four-row semicolon
file and got means of 20 and 40. The same `numText` line turned up in three sibling engines.

A search for the pattern (a parser that sniffs `;`, then a currency strip whose character class
holds a comma) found three more. Two other parsers matched a looser search but handle the decimal
mark on purpose (bank-csv-to-qbo-converter and eu-vat-oss-calculator), so the final pattern skips
them.

## The fix

The repository had already met this bug. On 2026-11-14 a red-team run found 29 report analyzers
that took the decimal mark from the delimiter alone, which misreads a tab-delimited German export
and a semicolon file with dot decimals. They now share a `detectDecimalComma(rows, delimiter)`
helper that votes from the values, and two checks test every copy. These seven tools never had
any decimal-comma handling, so neither check matched them.

They now use the same helper. When the values vote for a decimal comma, a cell like `1,5` or
`1.234,5` (optionally with a currency sign, a percent sign or accounting brackets) is read as
`1.5` or `1234.5`. Otherwise commas still group thousands, so a quoted `"1,234"` in a comma file
is still one thousand two hundred and thirty-four. A tab-delimited European export now works too.
Each venture got a test that fails without its fix.

A first version decided from the delimiter alone. The existing `check_decimal_format.py` caught
that before merge, which is the point of having it.

One case stays ambiguous: a semicolon file with no header row. `1,5;0,25` has more commas than
semicolons, so the delimiter sniff picks comma. That ends in a visible error, not a wrong number,
so it was left alone.

## The guard

`platform/ci/check_decimal_comma.py` flags any venture file that offers `;` as a delimiter and
strips commas with a currency-style character class but never handles the decimal comma. That is the gap the older checks left: they test the detector, and cannot see a parser that has none. It needs
no workflow change, because `unwired_checks.py` runs every unwired `check_*.py` on every venture
pull request. On today's tree it passes. Before the fixes it named all seven files.
