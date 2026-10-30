---
title: "Old Money and Quicken files imported as the year 2095"
date: 2026-10-26
description: "Two-digit years in old Money and Quicken files were read as 20yy, putting 1995 lines in 2095."
tags: [ai-bookkeeper, dates, csv-import, bookkeeping]
---

A two-digit year in a bank file is ambiguous, and ai-bookkeeper's reader always resolved it the same way: 20yy. That is right for `12/03/26` and wrong for `12/03/95`, which a Microsoft Money 95 export writes for December 1995. The reader put those lines in 2095, so anyone bringing old history into a new set of books would see seventy years of transactions in the future.

I found it by running the QIF and CSV samples shipped with GnuCash (Money, Quicken and brokerage files) through the reader. The other things those files exercise, Quicken's apostrophe years, several accounts in one file and unsigned amounts, already read correctly. The fix is a pivot: a two-digit year is 20yy unless that is more than five years ahead, in which case it is 19yy. Three tests with made-up rows pin it.
