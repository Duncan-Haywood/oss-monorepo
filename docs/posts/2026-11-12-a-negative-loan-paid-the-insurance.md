---
title: "A negative loan paid the insurance: sixteen seeded faults in two creator and host analyzers"
seo_title: "Turo profit analyzer now rejects a negative loan; 9 new tests"
date: 2026-11-12
tags: [testing, mutation-testing, turo, youtube, redteam]
description: "Sixteen faults seeded into the Turo earnings and YouTube RPM analyzers, four caught. A hand search found a negative loan quietly cancelling the insurance."
---

Today's red-team run aimed at two browser tools that changed this week: the
[Turo earnings report analyzer](../../ventures/turo-earnings-report-analyzer/)
(profit per car after Turo's fee, per-trip costs and monthly loan, insurance
and depreciation) and the
[YouTube revenue and RPM analyzer](../../ventures/youtube-revenue-rpm-analyzer/)
(revenue per thousand views by video, country or day, read from a Studio
export). `redteam.py campaign` seeded eight faults into each calculation file.
Each fault changes one constant or flips one comparison. The tool then runs
the tests and puts the file back.

| File | Seeded | Caught before | Equivalent | Caught after the new tests |
|---|---|---|---|---|
| `turo-earnings-report-analyzer/calc.mjs` | 8 | 2 | 2 | 6 of 6 |
| `youtube-revenue-rpm-analyzer/calc.mjs` | 8 | 2 | 1 | 7 of 7 |

The two suites caught 4 of 16 faults, or 4 of 13 once the three equivalent
ones are set aside. That is low for tools whose whole output is numbers.
These faults got past the suites:

- **Revenue concentration.** In the YouTube tool, changing `x / whole` to
  `x * whole` in the share function broke every "top video is N% of revenue"
  figure. Reversing the "highest revenue first" sort did the same to the
  table. No test read either value.
- **Day-first dates.** With `> 12` changed to `>= 12`, a file of US dates
  that starts "12/05/2026" would be read as 12 May, not 5 December.
- **UTF-16 exports.** Excel's "Unicode text" export is UTF-16. A flipped
  byte check sent those files to the UTF-8 decoder and turned them into
  garbage.
- **Turo findings text.** The break-even percentage in the "lost money"
  finding, the cancelled-trip note when every cancelled trip had no payout,
  the `pct` formatter, and durations written as "1h 5m" had no tests either.

Each now has a test that fails with the fault in place. The tool's `rerun`
re-applies every escaped fault and checks that the new tests catch it, and
all 13 non-equivalent faults are now caught. One guard missed on its first
try: with a small loan, a break-even of 87.6% shows as "88%" whether the
code multiplies by 100 or by 101. The test now uses a loss big enough for
the rounding to show the difference.

## The real bug: costs checked only in total

The Turo tool refuses a negative cleaning, fuel or delivery cost one field at
a time. For the monthly costs it added loan, insurance and depreciation
together first and only checked that the total was not negative. So a loan
typed as `-500` next to `600` of insurance gave a fixed cost of 100 a month,
and the report went on as if the input were fine. A car that loses money
could then come out as a profit. The browser's `min="0"` attribute does not
stop a typed minus sign from reaching the calculation.

Each of the three costs is now checked on its own, and a test pins it. No
other venture repeats the summed check (a repository-wide grep found none).

## What the numbers say

Both suites tested parsing and the main totals, but rarely the sentences and
rankings a user reads. Most of the escaped faults were in that layer: a
share, a sort order, a percentage in a finding. A test that checks one
finding's exact text catches more faults than one that only checks a finding
exists.

The run record, with every fault and its triage, is
`prompts/runs/2026-11-12-session_01XpHqydNaLGzcW2tCVhZBHw.json`.
