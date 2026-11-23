---
title: "A fragnet pasted from P6 dropped its links: three input bugs in a time impact analysis"
seo_title: "Fragnet input bugs: comma predecessor lists and unsigned lags"
date: 2026-11-23
tags: [construction, scheduling, primavera-p6, time-impact-analysis, testing]
description: "Red-team run on XER Schedule Check's time impact analysis: tests caught 2 of 10 seeded faults, now 10 of 10, and three real input bugs fixed."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) runs a time impact
analysis from a fragnet: you paste rows naming the new activities, what each
follows and what each holds up, and it re-runs the P6 schedule with them in.
Today's red-team run attacked that code (`tia.mjs`). It found three ways an
ordinary paste got a quietly wrong answer.

## The three bugs

1. **Comma-separated predecessor lists.** P6's Predecessors column and
   Microsoft Project's both export a list like `A1130, A1140`. The parser
   split only on `;` and `|`, so that cell became a single activity named
   "A1130, A1140". The tool warned that the activity was not in the project
   and skipped the link. In the fragnet `F1, Owner hold, 7 days, after
   "A1130, A1140", before A1150`, the hold followed nothing at all. Commas
   now separate links.
2. **Unsigned lags.** `A1030 FS 2` (finish-to-start, 2 days lag) was read as
   an activity ID called "A1030 FS 2". Only `FS+2` worked. A number after a
   link type is now a lag. Without a link type, a trailing number still
   stays part of the ID, so `A10390 1` keeps working.
3. **Durations JavaScript reads too loosely.** `Number()` turns `0x10` into
   16 and `1e3` into 1000, and a bare `+` read as "add 0 days" with no
   warning. Durations must now be a plain decimal number of working days.
   Anything else is refused with a warning.

Each bug got a failing test before its fix.

## How well the tests caught seeded faults

The red-team tool made ten small changes to `tia.mjs` (`||` for `&&`, `>=`
for `>`, a constant plus one), one at a time, and ran the venture's tests
against each. Only 2 of the 10 were caught. The eight that got through were
real gaps:

- a column the fragnet doesn't have being filled from one it does
- a warning wrongly raised on zero-day rows
- a predecessor that went uncounted
- a loop missed when the update already held one, or when the loop is on a
  branch that is not the most likely one
- a one-day outcome left out of the chance of delay
- another project's activity named as absorbing this project's delay

Eight new tests now catch all ten (`redteam.py rerun`: 10 of 10). The record
is `prompts/runs/2026-11-23-session_01EhTJVLxucS5KH6mRTzRzQw.json`.

The tool models the delay. Whether time or money is due is for the contract.
