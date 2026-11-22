---
title: "A finished schedule said \"no change\": mutation testing the time impact analysis"
seo_title: "Mutation testing a time impact analysis: a finished update"
date: 2026-11-22
tags: [redteam, testing, mutation-testing, xer-schedule-check, time-impact-analysis, javascript, ventures]
description: "Red team on tia.mjs: 5 of 10 seeded bugs caught, three gaps closed, and added work on a finished schedule update no longer reads as no delay."
---

The [XER schedule check](https://marisstella.app/xer-schedule-check/) got
probabilistic branches in its time impact analysis today: a fragnet row can say
"the submittal passes review, 70%, or comes back, 30%", and the tool schedules
every outcome. This red-team run seeded ten bugs into `tia.mjs`, the file that
changed, and read it looking for inputs that give a wrong answer.

## Seeded bugs: 5 of 10 caught

`tia.test.mjs` (19 tests, under a second) caught five of ten mutants. Of the
five that escaped:

- **A lag on a 24-hour lag calendar written as 25 hours a day.** Nothing
  tested a fragnet link with a lag under the `rcal_24Hour` scheduling option.
  New test: a 2-day lag is 48 hours there and 16 on the default calendar.
- **The "given on an earlier row" warning fired on every repeat.** A branch can
  span several rows; writing 40% on each of them is fine, and only a
  different number deserves the warning. The mutant (`b + f` for `b - f`) warned
  on every repeat and no test noticed. New test covers both.
- **"N more in the CSV" off by one.** The printable exhibit shows 40 rows and
  counts the rest. The count had no test, nor did its twin under the branch
  outcomes table. New test covers both copies.
- Two were equivalent: a `<=` against `<` at a float boundary no typed
  probability reaches, and a null guard that today's fix (below) makes
  unreachable.

After the new tests, all three gaps are caught: 5 of 8 non-equivalent mutants
before, 8 of 8 after.

## The real bug: added work on a finished update

The null guard pointed at a question: when is the base finish null? When every
activity in the update is finished, the scheduler has no early finish, so it
reports none. The analysis then compared nothing with the impacted finish and
fell back to zero:

```
Finish:  -> 2026-04-17 15:30: no change
```

That is wrong for the case it exists for: a claim for added work after the
original scope is done. The base finish now falls back to the project's last
actual finish (what P6 shows for a completed project), then to the data date,
and the result says so in a note:

```
Finish: 2026-04-03 15:30 -> 2026-04-17 15:30: 10 working days later
```

The test was written first and fails on the old code.

## Numbers

| | Before | After |
|---|---|---|
| Mutants caught (non-equivalent) | 5 of 8 | 8 of 8 |
| Real defects | 1 found | 1 patched |
| `xer-schedule-check` suite | 375 tests | 379 tests, 2 s |

As with every tool in the portfolio, the time impact analysis models the delay
with the schedule's own logic; it does not decide entitlement, and its dates
should be confirmed in P6.
