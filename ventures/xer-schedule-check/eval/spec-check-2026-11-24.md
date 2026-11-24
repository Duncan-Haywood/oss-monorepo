# Contract specification check on six public XERs (2026-11-24)

`spec.mjs` checks a schedule against limits a reviewer types from the
contract's scheduling section. This file records how it was checked.

    bash eval/corpus-fetch.sh DIR
    node eval/spec-check.mjs DIR/xer > eval/spec-check-2026-11-24.json

## What was compared

`eval/spec-check.mjs` sets one invented rule set (it is no agency's
specification): original durations of 20 working days at most, lags of 10 at
most, no leads, no start-to-finish links, only start-on-or-after and
finish-on-or-before constraints, one start and one finish, names of 10+
characters, resource and cost loading, no activity over 5% of the budget, and
the file's first activity code type required on every activity (when the file
has code types). For each rule it recounts the activities that fail
straight from the raw XER tables (TASK, TASKPRED, CALENDAR, TASKACTV,
TASKRSRC, PROJCOST), without `cpm.mjs`'s model, and compares that count with
the number of items `specCheck` lists.

## Result

**64 of 64 rule counts agree** across the six files (10 or 11 rules each).

| File | Activities | Links | Time (ms) | Durations > 20 d | Lags > 10 d | Leads | Not cost-loaded | Missing the first code type |
|---|---|---|---|---|---|---|---|---|
| CCA_R03_dt_24Oct11SC | 16,146 | 47,286 | 508 | 9,005 | 2,340 | 3 | 13,703 | 15,719 |
| Expressway_Project | 823 | 1,094 | 19 | 399 | 27 | 38 | 800 | (no code types) |
| example_xer_file | 425 | 555 | 12 | 42 | 8 | 18 | 109 | 425 |
| hotel-project | 4,236 | 7,586 | 68 | 277 | 547 | 1 | 2,861 | 475 |
| sample | 52 | 61 | 1 | 0 | 0 | 0 | 30 | (no code types) |
| terminal-building-airport | 66 | 84 | 1 | 21 | 7 | 0 | 63 | 15 |

Times are `specCheck` alone (model built inside it), Node 22 in this
container; reading the 30 MB CCA file takes longer than checking it.

`example_xer_file` has activities on a calendar the file does not hold, so
both sides would differ if the model's fallback calendar had different hours;
here the counts still agree.

## What the counts say

These are public files, not submittals against a known specification, so the
numbers are not grades. They do show what a reviewer gets back: on the hotel
schedule, 277 open activities over 20 working days (the longest are 330-day
design submission and approval activities and 300-day procurement rows,
which most specifications either exempt or ask to split), 547 lags over 10
days, and 2,861 of its activities carrying no budgeted cost.

## Not checked here

- Against a real contract's specification and a reviewer's own read of the
  same submittal (needs a real spec and a reviewer).
- The page form: checked in Chromium at 390 px (no horizontal scroll, no page
  errors, rules saved, reloaded from local storage, and run on the built-in
  example: 5 of 6 requirements not met).
