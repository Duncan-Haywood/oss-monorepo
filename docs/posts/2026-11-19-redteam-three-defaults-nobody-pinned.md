---
title: "Red team: 30 seeded faults in two products, and the defaults no test pinned"
seo_title: "Mutation testing an MRR dashboard and a SQL migration linter"
date: 2026-11-19
tags: [redteam, testing, mutation-testing, mrr-pulse, sql-migration-lock-check]
description: "We seeded 30 faults into MRR Pulse and a SQL migration linter. Tests caught 21; the 8 real escapes were defaults and boundaries, now tested."
---

A red-team run seeds small faults into a file (a `>` that becomes `>=`, a `0` that becomes
`1`), runs that file's own test suite once per fault, and counts how many the tests notice.
This run aimed at three files that changed on `main` in the last three days:

| File | Seeded | Caught | Escaped |
|---|---|---|---|
| [MRR Pulse](https://marisstella.app/mrr-pulse/) `metrics.mjs` | 10 | 7 | 3 |
| [MRR Pulse](https://marisstella.app/mrr-pulse/) `alerts.mjs` | 10 | 8 | 2 |
| [SQL migration lock check](https://marisstella.app/sql-migration-lock-check/) `engine.mjs` | 10 | 6 | 4 |
| **Total** | **30** | **21 (70%)** | **9** |

One of the nine could never change a result: a "reported already" flag guarding a counter that
can only equal 2 once per transaction. That leaves eight real holes. After this run's tests, all
eight are caught.

## What escaped

None of the eight is a bug that shipped. Each is a bug that *could* ship without a test going red.
They have something in common: every one is a default value or a boundary.

- **A new month started with one cent of contraction.** MRR Pulse opens a fresh month row from a
  template of zeros and adds each live sync to it. Seeding `contraction: 1` in that template
  passed every test, because the live-sync test never looked at contraction.
- **The forecast's default window.** The run-rate forecast averages the last three complete months.
  Changing the default to four passed, because every forecast test had three or fewer months to
  read.
- **Free subscriptions in the concentration count.** `concentration()` drops zero-MRR entries
  before counting; letting them through passed.
- **The plus sign on growth.** The weekly digest writes "+11.1% vs last month". A fault that only
  added the plus at 100% growth or more passed, because the only digest test had negative growth.
- **One cent of starting MRR.** The churn alert must work from any positive starting MRR.
- **Half a millisecond in minutes.** The lock checker treats a `lock_timeout` under 0.5 ms as off,
  because PostgreSQL rounds it to 0. A fault in the minutes multiplier passed, since no test used
  a fraction of a minute.
- **A value the parser cannot read.** The checker deliberately counts an unparseable
  `lock_timeout` (`'1e3'`) as a timeout rather than raise a false alarm. Flipping that passed.
- **Finding order.** Findings are sorted by line, then by check id. Breaking the comparator passed,
  because no test asserted the order of findings that the engine pushes out of order.

## Bugs we looked for and didn't find

Both products had already been red-teamed this week (the CSV date check, yen amounts, trials,
`RESET` and `DISCARD ALL`), and they held up. We tried eight date spellings in MRR Pulse's CSV import,
and it rejected every ambiguous one instead of guessing. We also tried `SET LOCAL lock_timeout` outside an
explicit transaction. PostgreSQL ignores that, so it looked like a false all-clear, but the
engine's comment says it's deliberate: most migration runners wrap each file in a transaction of
their own, and under one of them the `SET LOCAL` does apply.

## The open list

Before seeding, the run checked the 12 defects earlier red-team runs left open. All 12 still
reproduce. Eleven are in CI workflows or the red-team tool itself, which need the owner's
approval to change. The twelfth is the help-desk stemmer: it maps "rate" and "rates" to different
stems, but its candidate fix moves a published benchmark both ways, so it waits for a help-centre
evaluation set.

Seeded faults only ever live in a working copy. The tool restores each file byte for byte, and
the only diffs this run merges are tests.
