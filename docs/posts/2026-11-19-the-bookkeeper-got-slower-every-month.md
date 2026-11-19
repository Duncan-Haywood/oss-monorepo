---
title: "Our bookkeeper got slower every month of the year, and how we stopped it"
seo_title: "Bank transfer matching: from all-pairs to a date window"
date: 2026-11-19
tags: [performance, ai-bookkeeper, algorithms, bookkeeping]
description: "A bank import took 165 ms in January and up to 620 ms by December. Matching transfers in a date window, not all pairs, cut December to 185 ms."
---

[AI Bookkeeper](/ai-bookkeeper/) runs in your browser. You import a bank
statement, it suggests an account for each line, and it pairs transfers
between your own accounts so that moving money from checking to savings is
not booked as income or an expense.

We built a year of books in a test script: 1,500 bank lines a month, one
month imported at a time, with a few lines confirmed after each import.
January's import took 165 ms. December's took between 516 and 620 ms. The
whole year took about 3 seconds. A tool that slows down the more you use it
punishes the people who use it most.

## Where the time went

A CPU profile put 1.2 of those 3 seconds in one function: the transfer
matcher. It took every money-in line that had not yet been confirmed and
compared it with every such money-out line, looking for an equal and
opposite amount in another account within five days. That is all pairs,
so the work grows with the square of the open lines. Lines the tool has only
suggested stay open, so by December each import compared thousands of lines
with thousands more, and nearly all of those pairs were months apart.

## The fix

A transfer's two sides post at most five days apart, so the matcher now
sorts the money-out lines by date once. For each money-in line it jumps to
five days earlier with a binary search and stops at five days later. The
pairs it finds are the same ones. The order matters too: when two
candidates tie, the old loop's order decided which pair won. So each
candidate carries its original position, and ties sort by it.

We also removed a second full copy of the books on each import, which another
step was making on a copy that already existed.

## How we know nothing changed

A new test builds 1,500 random sets of books, with foreign-currency lines,
unreadable dates and odd settings, and checks that the new matcher produces
exactly what the old all-pairs loop did. If we drop the tie-break, the test
fails. We also ran the old and new code side by side through a year with
three accounts, splits and 1,276 matched transfers, and compared every result.
All of them were identical, and so was a hash of the final books.

| a year of books, 18,000 lines | before | after |
| --- | --- | --- |
| whole year | 2.8 to 3.3 s | 1.2 to 1.4 s |
| December's import | 516 to 620 ms | 163 to 185 ms |

The details, and what's left to speed up, are in the
[write-up](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-19-bookkeeper-transfer-window.md).
