---
title: "Checking a Bank of America export against its own summary"
date: 2026-11-07
description: "Bank of America CSVs open with a summary of total credits and debits. The AI bookkeeper now checks the rows it read against it."
tags: [ai-bookkeeper, bookkeeping, testing]
---

We ran nine public bank and card exports (Bank of America, Chase, Citi, Capital One, Discover-style) through the importer. All nine read with correct signs and dates, so there was no layout bug to fix.

One gap showed up. Bank of America's CSV starts with a summary block: beginning balance, total credits, total debits and ending balance. The importer skipped it. That block is a free check on the rows underneath.

The importer now adds up the credits and debits it read and compares them with the summary. If they disagree, it says so. A dropped, duplicated or wrong-signed row is the usual cause.

The check runs only when the file has the summary block. Two tests cover a matching file and a mismatch, using made-up rows. The public file that has a summary block is a synthetic test fixture whose own totals don't match its rows, so this run did not check a real statement. Real BofA exports are still untested.
