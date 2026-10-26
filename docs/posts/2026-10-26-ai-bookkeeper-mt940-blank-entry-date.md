---
title: "Bank statements with a blank date field lost their transactions"
date: 2026-10-26
description: "An MT940 line's optional entry date can be four spaces, as in Citi's sample; ai-bookkeeper took that for an unreadable line and dropped the transactions. Fixed."
tags: [ai-bookkeeper, bank-import, testing]
---

An MT940 statement line carries an optional four-digit entry date. Some banks, Citi's sample among them, fill it with four spaces. ai-bookkeeper's reader took that for an unreadable line and dropped the transaction. One Citi file kept none of its three non-zero rows, and an ASNB file kept six of eight. Both now read in full.

I found it by running the other 49 statement files in the open-source wolph/mt940 test suite through the reader. The rest read correctly. The files that failed to read were deliberately malformed ones, and the reader lists them as problems instead of guessing. A new test pins the blank-date case with made-up rows.
