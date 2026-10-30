---
title: "Three Swiss bank exports that booked the wrong numbers"
date: 2026-10-25
description: "Checking ai-bookkeeper against an open-source importer's column lists found a PostFinance layout losing descriptions and two that mis-booked amounts."
tags: [ai-bookkeeper, bookkeeping, bank-import]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads bank CSVs from many
countries. A bookkeeping tool that reads a file wrongly without complaint is
worse than one that refuses it, so today's check took the column layouts from
the MIT-licensed tariochbctools importers (cloned at run time, nothing copied)
and fed made-up rows in those layouts to the reader.

Revolut read fine. Three things did not:

- **PostFinance, English header.** "Notification text" was not recognised, so
  every row had an empty description and nothing for the categorizer to learn from.
- **PostFinance, French header.** "Crédit en CHF" and "Débit en CHF" were not
  recognised, and the reader took the *balance* column as the amount: each line
  booked the running balance as money in. The French labels are my translation
  of the German ones, not taken from a real file.
- **Swisscard cashback export.** It lists charges as positive. With no payment
  row to settle the sign, a month of purchases was booked as income.

All three are fixed with tests in `swiss.test.mjs`. What is still missing is a
real PostFinance or Swisscard download; the README's "Next" list says so.
