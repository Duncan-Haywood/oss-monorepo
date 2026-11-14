---
title: "--tz=-5 ran in UTC with no warning. Red-teaming the on-call load analyzer's CLI"
seo_title: "On-call load analyzer CLI: a timezone flag that silently fell back to UTC"
date: 2026-11-14
tags: [testing, mutation-testing, on-call, pagerduty, cli, redteam]
description: "Eight faults seeded into the on-call load analyzer's command line, two caught. Reading the code turned up a timezone flag that quietly reported nights in UTC, plus the same silent default in two sibling CLIs."
---

The [On-call Load Analyzer](../../ventures/oncall-load-analyzer/) reads an
incident export from PagerDuty, Opsgenie or Grafana OnCall and says who is
carrying the pager. A page at night counts three times a business-hours page,
so the team's UTC offset decides a lot of the answer. Today's red-team run
seeded eight faults into its command line (`redteam.py campaign`: change one
operator or constant, run the tests, put the file back) and then read the code
looking for input that gives a wrong answer.

| File | Seeded | Caught before | Caught after the new tests |
|---|---|---|---|
| `oncall-load-analyzer/cli.mjs` | 8 | 2 | 7 of 8 (the eighth's line was the bug and is gone) |

## What got through

Five of the six faults that got through were in the `--tz` handling. No test
passed `--tz` at all: reading the offset from the wrong argument, ignoring it
when it came first, or defaulting to UTC+1 all went unnoticed. The sixth was
the exit code: no test ran a file where nobody is overloaded, so the CLI could
have exited 1 every time and failed every CI job that used it as a gate.

## The real bug

The CLI found `--tz` only as its own word and fell back to UTC on anything it
couldn't read. On the built-in sample, which is a UTC-5 team:

| Command | Night share before | After |
|---|---|---|
| `cli.mjs s.csv --tz -5` | 36% | 36% |
| `cli.mjs s.csv --tz=-5` | 45% (UTC, no warning) | 36% |
| `cli.mjs s.csv --tz abc` | 45% (UTC, no warning) | exit 2, says why |
| `cli.mjs s.csv --tz 99` | ran with a 99-hour offset | exit 2, says why |

Nine points of night share is the difference between "this rotation is rough"
and "this rotation is broken", and the person reading the number had no way
to tell the flag hadn't taken. Now `--tz=N` works, and anything unreadable or
outside -12 to 14 stops with the reason. The web page clamps its offset field
to the same range.

One of the new tests passed against a fault the first time round:
`/0% at night/` also matches "100% at night". It is anchored now
(`/; 0% at night/`). A regex that matches more than you meant counts as a
test that always passes.

## The same mistake next door

The pattern `Number(args[i + 1])` with a quiet default shows up in 15 venture
CLIs. Two did the same thing as `--tz`: the
[Postgres Index Auditor](../../ventures/postgres-index-auditor/) read
`--min-mb abc` as 0 and listed every index, and the
[Bid Leveling Worksheet](../../ventures/bid-leveling-worksheet/) read
`--unknown abc` as 1 and accepted weights its own usage line rules out. Both
now exit 2 with the reason, and each has a test that failed before the fix.
The calculator CLIs that pass `NaN` on to a validating `calc.mjs` were not
checked one by one in this run.
