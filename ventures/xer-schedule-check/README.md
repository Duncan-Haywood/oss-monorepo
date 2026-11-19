# XER Schedule Check

Open a **Primavera P6 `.xer` export** in the browser and get the **DCMA 14-point
schedule assessment** with every activity behind each failing point, a critical
path recomputed from the logic, the critical path test, and the faults the 14
points miss: logic loops, out-of-sequence progress, open finishes, and stored
float that no longer matches the logic. MIT licensed, no dependencies, nothing
uploaded.

**Live tool:** https://marisstella.app/xer-schedule-check/

After using this, an owner's rep can **send a contractor a list of the exact
activities to fix** in a schedule update (not just "fails DCMA point 6"), and a
scheduler can catch the same list before submitting.

## Why someone would use it

| Today's option | What it does | What this does better |
|---|---|---|
| Paid schedule-analysis products (Deltek Acumen Fuse, SmartPM, Schedule Analyzer and similar) | Full schedule analytics, desktop or subscription, licence per seat | Free, nothing to install, the file never leaves the browser (owners' schedules are often confidential) |
| P6 Professional's own schedule check | Built into P6 for people who hold a P6 licence | Works for the many who receive XER files without a P6 seat: owners, lenders, subcontractors, claims consultants |
| Open-source XER libraries and checkers (Python packages, local web apps) | A parser or a few checks; you install and run them | All 14 points plus a critical path test on a recomputed schedule, measured against P6's own numbers, in a page |
| A spreadsheet export | Whatever formulas you write | Calendars, lags, constraints and progress handled the way P6 handles them |

**Path to revenue (payment rails off, nothing live):** free tool and lead magnet
for schedule review. Natural paid paths, each needing the owner: a written
schedule-review report (PDF) an owner's rep can send to a contractor; an
update-to-update comparison (what moved, what float was consumed, which logic
changed) for monthly pay-application reviews; and the review itself as a service.

## How it works

- `xer.mjs`: reads the tab-separated XER tables (`%T`, `%F`, `%R`), UTF-8 or
  Windows-1252, CRLF, P6 Web's quoted multi-line values, names with stray quotes.
- `calendar.mjs`: P6 work calendars from `clndr_data` (weekly periods, holidays,
  changed days), and working-time arithmetic to the minute.
- `cpm.mjs`: forward and backward passes on each activity's own calendar: FS,
  SS, FF and SF links with lags on the project's lag calendar; total float as
  finish, start or smallest float; retained logic or progress override; planned
  start and must-finish-by; primary and secondary constraints including as late
  as possible; external dates; loops found and reported (Tarjan). Also free
  float and the driving path. Level of effort and WBS summary activities are
  left out of the network.
- `dcma.mjs`: the 14 points with the DCMA thresholds, counted over open
  activities (not complete, not level of effort or WBS summary), durations and
  float in working days of each activity's own calendar. The critical path test
  delays an open activity on the driving path by 600 working days and
  recomputes. Missed tasks and BEI use P6's planned dates as the baseline (a
  single XER rarely carries the baseline project; the page says so).
- `index.html`: the page. `cli.mjs`: the same from a terminal:

```
node cli.mjs schedule.xer                 # scorecard
node cli.mjs schedule.xer --json          # full report
node cli.mjs schedule.xer --csv out.csv   # one row per finding
node cli.mjs schedule.xer --project CODE  # a file with several projects
```

## How it was checked

- **Against P6 itself** (`eval/cpm-vs-p6-2026-11-19.md`): six public XER files
  from P6 5.0 to 24.12, 19,822 open activities. Early finish, late finish and
  total float all equal P6's stored values on **18,133 (91.5%)**: 100% on four
  files, 4,216 of 4,217 on a hotel schedule, 12,582 of 14,270 (88.2%) on a
  heavily progressed programme with 2,134 out-of-sequence links. Every rule
  added to get there is listed there with the count it moved.
- **The simple DCMA counts by hand**: leads, lags and relationship types on the
  Expressway file agree with an awk tally of its TASKPRED table (38, 66, and
  995 / 88 / 11 FS / SS / FF of 1,094).
- **Unit tests** (`engine.test.mjs`, `page.test.mjs`): calendar arithmetic over
  lunch breaks, weekends, a holiday and a half day; FS/SS/FF links with lags,
  float and free float worked by hand; constraints and negative float against a
  must-finish-by date; progress with a lag after a finished predecessor; ALAP;
  loops; each DCMA point on a small schedule.
- **Not checked**: no file used progress override, start or smallest float, the
  successor or 24-hour lag calendar, or mandatory constraints (unit tests only).
  An independent DCMA implementation was not run side by side.

## Limits

Screening metrics, not a verdict: a schedule can pass all fourteen and still be
unrealistic, and some failures are justified. Not modelled: resource levelling,
expected finish dates, "make open-ended activities critical", multiple float
paths, and part of P6's retained-logic rule for started activities with mixed
FS and SS predecessors (the CCA residual). The float checks use the float the
file stores; the recomputed float is reported next to it.

## Files

`samples/make-example.mjs` writes `example.mjs`, an invented office fit-out
schedule with deliberate faults, used by the page's example button and the
tests; `node samples/make-example.mjs office-fitout.xer` also writes it as an
XER file for the CLI. `eval/cpm-vs-p6.mjs` is the P6 comparison.

## Disclaimer

Provided free and as-is, without warranty. Not engineering, legal, contractual
or scheduling advice; it does not replace a qualified scheduler or the
scheduling software of record. Not affiliated with Oracle, Primavera or the
Defense Contract Management Agency; Primavera and P6 are named only to describe
the file format.
