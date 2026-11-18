---
title: "Open at 17:00, close at 09:00: red-teaming the shifts-from-sales planner"
seo_title: "Staffing from POS sales: input checks and mutation testing"
date: 2026-11-13
tags: [testing, mutation-testing, scheduling, labor, pos, redteam]
description: "Ten faults seeded into the POS-sales shift planner, three caught. Reversed opening hours gave a silent empty plan; Swiss amounts were skipped."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) can plan a
week from a till export: it averages each weekday-hour of sales, turns that
into heads needed, and cuts the headcount curve into shifts
(`demand.mjs`). The file has changed several times this week (locations,
labour standards, pasted exports), so today's red-team run aimed at it.

`redteam.py campaign` changed one operator or constant at a time, ran the
venture's whole test suite, and put the file back.

| File | Seeded | Caught before | Equivalent | Gaps given a test |
|---|---|---|---|---|
| `shift-roster-builder/demand.mjs` | 10 | 3 | 2 | 5 |

## What got through

- **`--skip-dates 2026-3-02`.** A date typed with a one-digit month and a
  padded day only matched because of one `\d{1,2}` in the date normaliser. No
  test typed it that way.
- **A stray `123/01/2026` row.** The check that decides whether a file is
  day-first looks for a first number over 12. Widened to three digits, one
  junk row flipped every date in the file. The check has two copies (sales and
  the labour standard); both now have a test.
- **An unreadable quantity under `--standard`.** With `&&` in place of `||`,
  a quantity of `abc` went on as `NaN` minutes of work instead of being
  skipped.
- **The lunch-break rule's floor.** A break is only detected with 20 or more
  dates of that weekday. Raising it to 21 changed no test: every fixture had
  24.
- **Half-life auto with `--short-cost`.** The backtest also returns the plain
  equal-weights method. A flipped `===` let it be picked, and the note then
  claimed a gain over equal weights while choosing equal weights.

The two equivalents: the date validity check's `||` versus `&&` (a day that
overflows its month always lands on a different day number too), and a
search over 25 hours instead of 24 (hour 24 never has sales).

## Two real bugs

**Reversed or out-of-range hours.** The CLI accepted any non-negative number
for `--open` and `--close`. `--open 17 --close 9` (a night shop, say) or
`--close 25` produced an empty shift list with no note: nothing to tell the
owner why. They are now whole hours from 0 to 24 with the opening first, and
anything else stops with a message saying so. A day running past midnight
cannot be planned as one day yet; the message says that too. An opening hour
after the last sale is legal, plans nothing, and now says so.

**Swiss amounts.** `CHF` was on the list of currency codes the amount reader
strips, but the usual Swiss grouping, `1'234.50`, then failed the number
check and the row was skipped as unreadable. Apostrophe and typographic
apostrophe thousands marks are now read; `12'34` is still refused.

Both were found by typing inputs a stranger might, not by the mutants. All
seven new tests are in `demand.test.mjs`, with hand-built rows; no real Swiss
POS export was tried.
