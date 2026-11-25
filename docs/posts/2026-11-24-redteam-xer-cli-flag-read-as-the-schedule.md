---
title: "Red team: the flag value read as the schedule, and seven untested paths"
seo_title: "XER Schedule Check red team: a CLI flag read as the schedule"
date: 2026-11-24
tags: [redteam, testing, construction, scheduling, primavera-p6, xer]
description: "20 faults seeded in XER Schedule Check's CPM engine and Project XML reader: 13 caught, 7 now guarded. And `--risk 1000 file.xer` opened a file named 1000."
---

This red-team run aimed at [XER Schedule Check](../../ventures/xer-schedule-check/),
the browser and command-line tool that recomputes a P6 schedule's critical
path and runs the DCMA 14-point check. Two files changed on `main` in the
last few days, so those were the targets: the CPM engine (`cpm.mjs`) and the
Microsoft Project XML reader (`mspdi.mjs`).

## Seeded faults

`prompts/redteam.py` changed one line at a time, ran the venture's 542 tests,
and put the line back. Of 20 faults, 13 failed a test. The 7 that passed were
all real gaps, each a path no test went down:

| File | Fault | What no test had |
|---|---|---|
| `cpm.mjs` | an SF link with no lag held its predecessor 1 minute early | a zero-lag SF link into a started activity |
| `cpm.mjs` | the started-successor rule for SS links fired for every other type | an unstarted predecessor FS-linked to an activity already under way (out-of-sequence progress) |
| `cpm.mjs` | calendar slack applied to zero-length work | a 0 h task under the calendar-slack option |
| `mspdi.mjs` | a file with no Title or Name got an empty project name | a Project file with neither |
| `mspdi.mjs` | critical slack limit divided by the day length instead of multiplied | any file setting the limit |
| `mspdi.mjs` | a level-2 task after a plain level-1 task filed under an older summary | a malformed outline |
| `mspdi.mjs` | a text field with exactly 20 distinct values was dropped | the 20 vs 21 boundary |

Each now has a test that fails with the fault and passes without it, and
`redteam.py rerun` confirmed all 7: the catch rate on these two files went
from 65% (13 of 20) to 100%.

## A real defect: the flag value read as the schedule

Reading the command line as a stranger would turned up the real one. Four
flags take an optional value: `--risk [N]`, `--lookahead [WEEKS]`,
`--ribbon [BY]` and `--float-paths [CODE]`. The CLI picks the schedule as
the first argument that is not a flag and does not follow a flag that takes
a value. Those four were on neither list, so

```
node cli.mjs --risk 1000 schedule.xer
```

stopped with `ENOENT: no such file or directory, open '1000'`. Put after
the file, the same command worked, which is how every README example writes
it. `--ribbon schedule.xer` was worse: it ran, grouping by a field called
`schedule.xer`.

A flag that needs a value, given without one, failed too: `--report` last on
the line crashed on a write to `undefined`, and `--csv --json` wrote the CSV
to a file named `--json`.

The fix: a value after an optional flag is its value unless it names a file
on disk; a required value that is missing or is another flag stops the run
with `--report needs a value` and writes nothing. A new test reads the
CLI's own source and fails if a flag read with `opt()` is on neither list,
so the next flag added cannot repeat this.

## What did not break

Hostile files were also tried: an empty file, a calendar with no working
time, a self-linked task, a link to a missing activity, negative and
non-numeric durations, a 10^12 minute lag, 20,000 nested elements and a
3,000-activity chain. Each either scheduled sensibly, reported the loop, or
stopped with a plain message (`calendar C1 has no working time`,
`addWork: ran past 1,000 years`). None hung.
