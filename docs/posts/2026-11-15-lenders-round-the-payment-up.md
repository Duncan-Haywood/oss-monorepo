---
title: "LendingClub rounds your loan payment up, and our loan register didn't"
seo_title: "LendingClub rounds the monthly loan payment up to the cent"
date: 2026-11-15
description: "On 466,285 real LendingClub loans, nearest-cent rounding matched the payment half the time; rounding up matched 99.97% of 2011-2014 loans."
tags: [ai-bookkeeper, loans, evaluation]
---

ai-bookkeeper has a loan register. You type in the amount, rate, term and first payment date, and it works out the schedule. Then, when the monthly payment shows up in your bank file, it splits the line into interest and principal so you don't have to type the split every month. That only works if the register's payment is the lender's payment to the cent. A bank line of $885.46 won't match a scheduled $885.45.

Until today the register had only been checked against textbook examples. The flagship list asked for "one named lender's own schedule". I couldn't find a full month-by-month table from a named lender in public. What is public is a lender's own payment on a very large number of real loans: LendingClub's 2007-2014 loan book lists the amount funded, the rate, the term and the monthly instalment LendingClub set, for 466,285 loans.

## Half right

The register rounded the payment to the nearest cent, the way most loan calculators do. That matched LendingClub's instalment on 234,220 loans, **50.2%**. Nearly all the rest were exactly one cent short.

Rounding *up* to the next cent matched **459,774 (98.6%)**. For loans issued from 2011 to 2014 it matched 445,325 of 445,471, which is **99.97%**.

| issued | loans | nearest cent matches | rounded up matches |
|---|---|---|---|
| 2007-2010 | 20,814 | 8,658 (41.6%) | 14,449 (69.4%) |
| 2011-2014 | 445,471 | 225,562 (50.6%) | 445,325 (99.97%) |

So LendingClub rounds the payment up. When the exact payment is $885.4542..., you pay $885.46 every month, and the last payment comes out a little smaller to make up the difference. Rounding to the nearest cent gets that right only when the leftover fraction of a cent is under a half, which is about half the time. The 50.2% is what that gives you.

The older loans are messier. Most of the 2009-2010 misses are more than a cent off, some by tens of dollars, and the rate LendingClub's instalment implies is usually lower than the rate listed. My guess is that those loans were re-priced or edited after they were issued. I haven't explained them, and nothing below depends on them.

## What changed in the tool

- `loan add Van --amount 27050 --rate 10.99 --months 36 --first 2014-01-01 --round up` uses the lender's rounding. On the page, the loans card has a new "Payment rounded" choice: to the nearest cent (still the default) or up to the next cent. With rounding up, the schedule's balances and its smaller last payment match the lender's, and the monthly bank line of the real amount is found and split.
- `loan check`, which compares a lender's pasted schedule with the register's, now says "the lender rounds the payment up to the next cent ... re-add the loan with --round up" when that is the difference. Before, a one-cent gap fit inside the check's two-cent tolerance. Only the balance drifting a few cents later got flagged, with a note suggesting a fee or an extra payment. That was the wrong diagnosis.

## What this doesn't show

This checks the payment, not a whole schedule. I also tried comparing total interest on loans paid off right on schedule, and it doesn't work as a test. The data can't tell a loan paid exactly on the due date from one paid a few days early or late each month, and LendingClub's interest depends on those dates. The register matched within a cent on 13% of those loans and within a dollar on 46%. That says nothing either way about the register's interest arithmetic. A lender's real month-by-month table is still the input that would test it.

The numbers, the data file's checksum and the command to rerun it are in [`ventures/ai-bookkeeper/eval/lendingclub-loans-2026-11-15.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ai-bookkeeper/eval/lendingclub-loans-2026-11-15.md). The bookkeeper is free and runs in your browser at [marisstella.app/ai-bookkeeper](https://marisstella.app/ai-bookkeeper/).

*Not financial, tax or legal advice. Your lender's own statement is the record; use the register to keep your books in step with it.*
