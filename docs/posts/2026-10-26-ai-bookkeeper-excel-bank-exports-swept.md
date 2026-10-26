---
title: "Ten real Excel bank-statement fixtures through ai-bookkeeper: no faults"
date: 2026-10-26
description: "We ran OCA's 5 .xlsx and 5 .xls bank-statement test files through ai-bookkeeper's Excel readers. All ten read correctly, including text-marker apostrophes."
tags: [ai-bookkeeper, bank-import, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads Excel bank exports with its own dependency-free `.xlsx` and legacy `.xls` readers. Until now they had only been tried on files we wrote ourselves.

OCA's bank-statement-import project keeps test workbooks in both formats (AGPL, so we cloned them at run time and copied nothing). We ran all ten through the readers: one with metadata rows above the header, one with split debit and credit columns and a trailing `Balance at start of period` row, one with amounts typed as text like `'579,68 USD` and `USD 9.126,07` balances, one empty file, and a USD/EUR mix.

Result: no faults. Every amount came out right, the `TOTAL` row was reported instead of booked, the currency mix was warned about, and the empty file said so. The `.xls` and `.xlsx` copies of each sample read identically. We pinned two of those shapes as tests with made-up rows.

What this does not show: these are test files from an accounting-software project, not exports from a real bank. A real Chase, Wells Fargo or OTP workbook is still wanted.
