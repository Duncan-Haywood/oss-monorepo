---
title: "Six US bank CSV layouts the bookkeeper now has tests for"
date: 2026-11-04
description: "AI Bookkeeper read six US bank and card layouts correctly without changes; they are now pinned by tests, with the caveat that the rows are made up."
tags: [ai-bookkeeper, bookkeeping, testing]
---

# Six US bank CSV layouts the bookkeeper now has tests for

Before changing the bank reader I tried six common US layouts: US Bank, Navy
Federal, Truist, TD, a Citi card and Bank of America (with its summary block
above the header). All six read correctly: signs, amounts and dates were right,
and the running balance chained wherever the file had one.

So the slice is tests, not code (`us-banks.test.mjs`). The honest limit: the
rows are invented and the headers come from memory of each layout, so this
guards against regressions but does not prove a real download works. A real
export from any of these banks is still the most useful thing to try.
Navy Federal, Truist and TD read but are not named in the bank sniffer.
