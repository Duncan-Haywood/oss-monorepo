---
title: "We fed AI Bookkeeper bank files from another project's test suite. It read all of them."
seo_title: "AI Bookkeeper read every bank file from another project's tests"
date: 2026-10-25
description: "Four bank-shaped files from beangulp's tests, a Chase-style CSV and two OFX downloads among them, imported cleanly into AI Bookkeeper with no fault to fix."
tags: [ai-bookkeeper, evaluation, bank-import]
---

AI Bookkeeper's bank readers were tested on files we wrote ourselves. That is a
weak check, so we keep pulling in files other people made. This time: the test
data of beangulp, the importer framework from the Beancount project (read only,
nothing copied).

What went in, and what came out:

- A Chase-layout checking CSV with a trailing comma in the header: 6 rows,
  amounts, dates and running balances right.
- Two OFX downloads, 12 and 27 transactions, one from a Bank of America card:
  every row read, closing balance matched the file.
- A small brokerage CSV: 4 rows read.
- An OFX file holding only investment trades: nothing booked, with a message
  saying why, which is the right answer for a cash ledger.

We found no fault, and we are reporting that rather than hunting for one. The
files are another project's fixtures, not fresh downloads from a bank, so the
real-export gap on the roadmap stays open.
