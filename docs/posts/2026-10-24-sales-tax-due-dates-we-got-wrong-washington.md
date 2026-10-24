---
title: "Checking sales tax due dates against the states: one we had wrong"
date: 2026-10-24
description: "We recalled seven states' sales tax due dates into an open-source bookkeeper. Checking four against the states' own pages found one error: Washington."
tags: [sales-tax, bookkeeping, open-source, accuracy]
---

# Checking sales tax due dates against the states: one we had wrong

The open-source `ai-bookkeeper` has a `salestax return` worksheet that gives a due date per filing
period. Its state presets (`--state CA|TX|FL|NY|WA|IL|PA`) were written from memory and
labelled as such. On 2026-10-24 we checked four of them against the states' own guidance.

| State | Preset | What the state says | Result |
|---|---|---|---|
| California | month end | Quarterly return due the last day of the month after the quarter (Q1 is April 30) | correct |
| Texas | 20th | Monthly and quarterly reports due the 20th; weekend or holiday moves to next business day | correct |
| Florida | 20th | Due the 1st, late after the 20th | correct |
| Washington | 25th | Monthly: 25th. Quarterly: end of the next month (Q3 2026: 10/31/26) | **wrong for quarterly** |

A Washington quarterly filer would have been told Q3 was due October 25, six days early. Early
is the safe direction, but it is still wrong, and a worksheet people plan cash around should
not guess. The fix is a `stateDueDay(state, frequency)` function with a test. We also noted
that Florida's collection allowance (2.5% of the first $1,200 of tax, capped at $30, for
timely electronic filers) is already expressible as `--discount "label=2.5,30"`.

Two caveats. The state hosts were not reachable from our build container, so the check used
search-result excerpts of the state pages, not the pages themselves. New York, Illinois and
Pennsylvania are still recalled, and Washington annual returns (due April 15) are not modelled.
Worksheet, not tax advice: confirm your own filing calendar with your state.
