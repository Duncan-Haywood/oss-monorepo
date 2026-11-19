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

**Update-to-update comparison** (2026-11-19): open last month's XER next to
this month's and get the monthly pay-application review: progress claimed
(started, finished, forecast work that did not happen), actual dates edited
after they were reported, actual dates past the data date, progress reversed,
logic added, deleted, retyped or re-lagged, original durations changed on work
not started, constraints and calendars changed, activities added, deleted and
renamed, float used per activity, how the driving path changed, and a
**half-step** run that splits the finish movement into what progress caused and
what the revisions caused.

**Written review** (2026-11-19): one document for the contractor, built from
the assessment and, when loaded, the comparison: a summary (forecast against
the must-finish date, the half-step split), every correction ranked **high**
(dates cannot be relied on: loops, negative float, a broken critical path test,
invalid dates, actuals edited after reporting, critical logic deleted),
**medium** (logic that can hide delay) or **low** (good practice), each with
the exact activities behind it, then the scorecard and the driving path. It has
no scripts or outside files, so it prints the same anywhere; "Save as PDF" in
the print dialog is the PDF. On the six public files it asks for 2 to 11
corrections (eval/review-report-2026-11-19.md).

**Finish date risk** (2026-11-19, `risk.mjs`): a Monte Carlo run over the
recomputed schedule. Each run draws every open activity's remaining duration
from a triangular range (a default of 90 / 100 / 125% the page tells you to
replace, or your own optimistic, most likely and pessimistic working days per
activity), with an optional correlation for causes that hit many activities at
once. You get P10 / P50 / P80 / P90 finish dates, the chance of meeting the
forecast and the must-finish date, a histogram, and per activity the
**criticality index** (share of runs on the driving path) and sensitivity. On
the six public files the zero-width run reproduces the CPM finish exactly, and
the CCA and hotel programmes have 47 and 76 near-critical activities that the
single driving path does not show (eval/risk-check-2026-11-19.md). A
14,000-activity file takes about 70 s for 500 runs in Node; the page runs in
slices so it stays responsive.

**Risk register events** (2026-11-19, `risk.mjs` `risks`, the page's "Risk
register" box, `--risks register.csv`): one line per event, `ID, probability,
optimistic, most likely, pessimistic days, activity ID[, activity ID ...]`.
In each run the event happens with its probability and its drawn delay is
added to the remaining duration of every activity it names (one draw per
event, so a shared cause delays all its activities alike, each on its own
calendar). Every run is scheduled twice with the same duration draws, with
and without the events, so the gap between the two P80s is the contingency
the register asks for, with no sampling noise between two separate runs.
Each event is ranked by its finish shift (mean finish of runs where it
happened minus runs where it did not), marked when within two standard
errors of noise. Checked on the six public files: 207 of 207 planted certain
events of 1 to 40 days give exactly the finish the CPM engine gives with the
same delay applied directly, and a register leaves the no-event column
identical to a run without one on all six (eval/risk-register-check-2026-11-19.md).

**Resource levelling** (2026-11-19, `level.mjs`, the page's "Resource
levelling" box, `--level`): the logic alone lets every crew work on everything
at once. This delays not-started activities until each resource stays within
its maximum units per hour from the file (RSRCRATE, including limits that
change over time), the way P6's Level Resources does: activities in order of
early start, ties by the file's levelling priority list (SCHEDOPTIONS
`LevelPriorityList`, P6's default `priority_type,ASC`) and then total float;
each is placed at the earliest start, on its own calendar, where every
assignment it holds (with its own lag and remaining units) fits. A moved
activity goes back to the CPM engine as a start floor, so successors move by
the same logic, lags and calendars, and anything already placed that the
recompute moved is placed again. Started work keeps its dates and counts
against the limits. Level within float (with the file's float to keep and
over-allocation allowance) is honoured. You get the levelled finish, every
activity that moved and the resource that moved it (or "logic"), peak use and
hours over the limit per resource before and after, a self-check (hours over
a limit while a placed activity uses it, which must be 0), a **lower bound**
no levelling can beat (a resource's remaining work at its limit), and a
**crew size** multiplier to see what crew holds the date. It warns when a
file still carries P6's default limit of 1 per hour on resources used far
above it. Checked on the public files in eval/level-check-2026-11-19.md.

## Why someone would use it

| Today's option | What it does | What this does better |
|---|---|---|
| P6's own Level Resources | Levels in P6 for people who hold a P6 seat; changes the schedule in the database | The levelled finish, who moved and why, and a crew-size what-if from the XER, without P6 and without touching the contractor's file |
| Paid schedule-risk products (Primavera Risk Analysis, Deltek Acumen Risk, Safran Risk and similar) | Monte Carlo on a P6 schedule with risk registers, desktop licence per seat | P50 / P80, criticality and a risk register (probability x impact on named activities, contingency at P80, events ranked) from the XER in a browser tab, free; no resource model, no probabilistic branches yet |
| Paid schedule-analysis products (Deltek Acumen Fuse, SmartPM, Schedule Analyzer and similar) | Full schedule analytics, desktop or subscription, licence per seat | Free, nothing to install, the file never leaves the browser (owners' schedules are often confidential) |
| P6 Professional's own schedule check | Built into P6 for people who hold a P6 licence | Works for the many who receive XER files without a P6 seat: owners, lenders, subcontractors, claims consultants |
| Open-source XER libraries and checkers (Python packages, local web apps) | A parser or a few checks; you install and run them | All 14 points plus a critical path test on a recomputed schedule, measured against P6's own numbers, in a page |
| A spreadsheet export | Whatever formulas you write | Calendars, lags, constraints and progress handled the way P6 handles them |

**Path to revenue (payment rails off, nothing live):** free tool and lead magnet
for schedule review. The written review (PDF via print) now ships free.
Natural paid paths, each needing the owner: a branded or white-label review for
consultancies; a period-by-period windows analysis across a whole
project's updates for delay claims; and the review itself as a service.

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
  single XER rarely carries the baseline project; the page says so). P6 resets
  a not-started activity's planned dates to its early dates whenever it
  schedules (on the CCA sample all 11,775 not-started activities have planned
  finish equal to early finish), so overdue work that has not started is never
  counted as missed and both metrics flatter the schedule (quality audit
  [2026-11-19](../../portfolio/quality/audits/2026-11-19-xer-schedule-check.json)).
- `compare.mjs`: two updates of one project, activities matched by activity ID
  and relationships by predecessor, successor and type (task_id is a database
  key that changes when a project is copied). The half-step file is the
  previous update's tables with the current update's status, actual dates,
  remaining durations and data date laid on the activities both hold, then
  recomputed (AACE RP 29R-03, MIP 3.4 style); progress effect = half-step
  finish minus previous finish, revision effect = current minus half-step, in
  working days of the project calendar. Each file's recomputed-vs-stored
  agreement is checked and a warning shown under 90%.
- `report.mjs`: the written review. `reviewItems` turns each failing DCMA
  point, extra check, stale-date list and comparison flag into one ranked
  correction with its activities; `reviewHtml` lays them out for print.
- `risk.mjs`: the Monte Carlo run. Seeded generator (repeatable), triangular
  draws (one-factor Gaussian copula when correlated), `cpm.mjs` forward pass
  only (`forwardOnly`, `durations`), driving path per run, sensitivity as the
  correlation of each activity's draw with the finish, blank below
  4 / sqrt(runs). Risk events (`parseRisks`) draw from their own seeded
  stream, so adding a register never changes the duration draws.
- `index.html`: the page. `cli.mjs`: the same from a terminal:

```
node cli.mjs schedule.xer                 # scorecard
node cli.mjs schedule.xer --json          # full report
node cli.mjs schedule.xer --csv out.csv   # one row per finding
node cli.mjs schedule.xer --report review.html --to "GC scheduler" --from "Owner's rep"
node cli.mjs current.xer --previous last.xer --report review.html   # review with the update's changes
node cli.mjs schedule.xer --project CODE  # a file with several projects
node cli.mjs schedule.xer --risk 1000 --range 90,100,130 --correlation 0.3 [--ranges ranges.csv] [--csv drivers.csv]
node cli.mjs schedule.xer --risk 1000 --risks register.csv   # risk register events, ranked
node cli.mjs schedule.xer --level [--crew 2] [--within-float] [--csv levelled.csv] [--json]   # resource levelling
node cli.mjs this-month.xer --previous last-month.xer [--json] [--csv changes.csv] [--project CODE]
```

When a file holds several projects, the comparison takes the project with the
same project ID (`proj_short_name`) from last month's file, so the two sides
are the same project; `--project CODE` (or the page's project picker) chooses
it. The changes CSV writes a cell that starts with `=`, `+`, `-` or `@` with a
leading apostrophe, so a crafted activity name in a contractor's file can't
run as a formula in Excel or Sheets.

## How it was checked

- **Against P6 itself** (`eval/cpm-vs-p6-2026-11-19.md`): six public XER files
  from P6 5.0 to 24.12, 19,822 open activities. Early finish, late finish and
  total float all equal P6's stored values on **19,820 (99.99%)**, and late
  finish on all 19,822: 100% on five files (the hotel schedule's last one fixed
  by the free-float rules), 14,268 of 14,270 on a heavily progressed programme
  with 2,134 out-of-sequence links (88.2% before the retained-logic rules of
  2026-11-19, 99.4% before the third pass, 14,256 before the fourth). The two
  left are a finish milestone and its successor whose 608 h lag P6 counts in a
  way no calendar tried reproduces. Every rule added to get there is listed
  there with the count it moved; the fourth pass added five (an open
  predecessor's FS lag into a finished node comes back off, a labour
  assignment's remaining work sets the late start of an activity with no
  remaining duration, unspent SS lag into a finished node, as late as possible
  on started work, and a future actual start that has spent no lag).
- **Free float against P6** (`eval/free-float-2026-11-19.md`): the same files,
  **19,810 of 19,822 (99.94%)** equal P6's stored free float (19,809 before the
  fourth CPM pass), up from 18,537
  (93.5%), after four rules (an open end runs to the project's early finish; SS
  lag already spent on either side of a started link is not free float; a
  finished successor still counts; free float is never negative and not capped
  at total float), each with its measured count. The 12 left: 2 on CCA
  activities whose dates already differ (another 1 since then), 9 in the 24.12 file where P6 stores 0
  against a positive gap in its own dates.
- **Files with no data date, no PROJECT table or no calendar pattern**: two
  hand-made fixtures from the same public repositories crashed the engine
  before 2026-11-19; both now give a full report with a warning for each guess.
- **The simple DCMA counts by hand**: leads, lags and relationship types on the
  Expressway file agree with an awk tally of its TASKPRED table (38, 66, and
  995 / 88 / 11 FS / SS / FF of 1,094).
- **Unit tests** (`engine.test.mjs`, `page.test.mjs`): calendar arithmetic over
  lunch breaks, weekends, a holiday and a half day; FS/SS/FF links with lags,
  float and free float worked by hand (open ends against a must-finish date,
  negative total float, spent SS lags, finished successors); a file with no data
  date, PROJECT table or calendar pattern; the recomputed-schedule CSV; an SS lag partly spent at the data date and
  a finished node's late date with no lag back; constraints and negative float against a
  must-finish-by date; progress with a lag after a finished predecessor;
  retained logic through out-of-sequence progress (SS from started work,
  finished activities as nodes in both passes); ALAP;
  loops; DCMA points 1 to 5, 8, 11, 12 and 14 on a small schedule (points 6,
  7, 9, 10 and 13 are checked only against the public XER files above).
- **Update comparison on real files** (`eval/compare-check-2026-11-19.md`):
  the same six P6 files, each compared with itself (0 changes reported, half-step
  equal to the finish, on all six) and with 20 seeded copies carrying 6 planted
  edits each of nine kinds: **720 of 720 planted edits reported, 0 reported that
  were not planted**. On progress-only copies the half-step finish equals the
  current finish on 120 of 120. No public pair of real consecutive P6 updates
  was found, so the half-step split itself is checked only on the invented
  example pair (by hand: +15 = +6 progress, +9 revisions) and by construction.
- **Not checked**: no file used progress override, start or smallest float, the
  successor or 24-hour lag calendar, or mandatory constraints, and no unit test
  covers them yet.
  An independent DCMA implementation was not run side by side.

## Limits

Screening metrics, not a verdict: a schedule can pass all fourteen and still be
unrealistic, and some failures are justified. Not modelled:
expected finish dates, "make open-ended activities critical", multiple float
paths (resource levelling is the separate `level.mjs` step; the checks always
use the unlevelled dates; it is a serial pass like P6's, not P6's code, so its
dates can differ from a P6 levelled run, which no public file stores). 14 activities of the heavily progressed CCA file still differ (10 late
finishes, 4 early finishes; `eval/cpm-vs-p6-2026-11-19.md`, "What is left"). The float checks use the float the
file stores; the recomputed float is reported next to it, and the recomputed
schedule (every open activity's dates, total and free float beside the stored
values) downloads as a CSV from the page or `node cli.mjs file.xer --schedule out.csv`.

## Files

`samples/make-example.mjs` writes `example.mjs`, an invented office fit-out
schedule with deliberate faults, used by the page's example button and the
tests; `node samples/make-example.mjs office-fitout.xer` also writes it as an
XER file for the CLI. `eval/cpm-vs-p6.mjs` is the P6 comparison (dates, total and free float).

## Disclaimer

Provided free and as-is, without warranty. Not engineering, legal, contractual
or scheduling advice; it does not replace a qualified scheduler or the
scheduling software of record. Not affiliated with Oracle, Primavera or the
Defense Contract Management Agency; Primavera and P6 are named only to describe
the file format.
