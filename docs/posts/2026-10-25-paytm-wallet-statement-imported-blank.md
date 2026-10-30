---
title: "A Paytm wallet statement imported with every description blank"
date: 2026-10-25
description: "Running open-source projects' sample bank files through our bookkeeper found a wallet export whose lines had no description. Fixed, with a test."
tags: [ai-bookkeeper, csv, testing, real-data]
---

ai-bookkeeper reads bank exports from many banks, but most of its tests use
files we wrote ourselves. So we keep importing other projects' sample files.
This time: the fixtures in Paisa (an Indian personal-finance tracker) and Maybe.

Four CSVs, one problem. Maybe's Mint-style and plain transaction files read
right. Paisa's ICICI card statement read right too, with a preamble skipped and
a warning that every amount was positive. Paisa's Paytm wallet statement read
all 74 rows with correct dates and amounts, but every description was empty. Its
header has `Activity`, `Source/Destination` and `Comment`, and none matched a
description name. Blank descriptions mean no categorization, so the books would
have come out uncategorized without any error message.

The fix reads `Activity` ("Paid for order", "Added to wallet") as the
description and appends `Comment` when present. It applies only when the header
also has `Wallet Txn ID`, so other files are unaffected. A regression test
covers it, using made-up rows in that layout.

Still open: the ICICI file's dates (01/03/2023) are ambiguous between 1 March
and 3 January; the importer assumes month first and does not say it guessed.
Those fixtures are three rows, so there is nothing to settle it. Real
statements from Indian banks are the next thing to try.
