# XER Schedule Check

Open a **Primavera P6 `.xer` export** in the browser and get the **DCMA 14-point
schedule assessment** with every activity behind each failing point, a critical
path recomputed from the logic, the critical path test, and the faults the 14
points miss: logic loops, out-of-sequence progress, open finishes, expected
finish dates that hide delay, and stored
float that no longer matches the logic. MIT licensed, no dependencies, nothing
uploaded.

**Live tool:** https://marisstella.app/xer-schedule-check/

After using this, an owner's rep can **send a contractor a list of the exact
activities to fix** in a schedule update (not just "fails DCMA point 6"), and a
scheduler can catch the same list before submitting.

**Microsoft Project files too** (2026-11-19, `mspdi.mjs`): open a schedule
saved from Microsoft Project as XML (File, Save As, XML Format; also written
by Project Online, ProjectLibre, GanttProject and most converters) anywhere
an XER goes: the assessment, the comparison of two updates, windows, risk,
levelling and the written review. Summary tasks become WBS, the status date
is the data date, baseline 0 is the planned dates, lags count on the
successor's calendar as Project does (elapsed lags on a 24-hour clock,
percent lags as a share of the predecessor), and activities are matched
between updates by Unique ID, so inserted rows do not break the comparison.
Manually scheduled tasks, links to summary tasks and deadlines are named in
the warnings. On 102 files saved by Microsoft Project 2002 to 2019 (MPXJ's
test corpus, 2,491 open tasks), early finish, late finish and total float
equal what Project stored on 2,406 (96.6%); the 85 others are resource-driven,
split or timephased tasks the engine does not model, and four small edge
cases (eval/cpm-vs-project-2026-11-19.md). `node cli.mjs schedule.xml`.

**Update-to-update comparison** (2026-11-19): open last month's XER next to
this month's and get the monthly pay-application review: progress claimed
(started, finished, forecast work that did not happen), actual dates edited
after they were reported, actual dates past the data date, progress reversed,
logic added, deleted, retyped or re-lagged, original durations changed on work
not started, constraints and calendars changed, activities added, deleted and
renamed, float used per activity, how the driving path changed, and a
**half-step** run that splits the finish movement into what progress caused and
what the revisions caused.

**Windows analysis across every update** (2026-11-19, `windows.mjs`): open
all of a job's updates at once, in any order. Each window between two data
dates gets the forecast finish movement, the half-step split into progress and
revisions, and the activities on the driving path at the start of the window
behind it: work that finished, started or ran late, remaining durations that
grew, and the logic, duration, constraint and calendar changes that touched the
path. The windows add up to the whole movement; the activities named in the
most windows are listed first. The contemporaneous-period analysis a claims
consultant bills for, as a first pass from the files alone; who is responsible
for each delay stays the analyst's call. `node cli.mjs --windows *.xer`.

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

**Ranges from the file's own UDFs** (2026-11-19, `udf-ranges.mjs`, the page's
UDF pickers in the risk box, `--ranges-udf auto` or `--ranges-udf
"optimistic,most likely,pessimistic"`): a schedule that went through a risk
review may keep each activity's three points in activity user-defined
fields, and the XER carries them (UDFTYPE, UDFVALUE). The tool reads numeric
activity UDFs, guesses the range fields from their names (optimistic /
pessimistic / most likely, best / worst case, or min / max / low / high
beside a duration word; "Max Qty" and "Min/Max Dur" are not read), and takes
the unit from the name (days of the activity's own calendar, hours, or % of
the remaining duration; `--udf-unit` overrides). With no most-likely field
the file's remaining duration stands in. Activities with only some of the
fields, and ranges out of order against the remaining duration, keep the
default range and are named. A pasted CSV line wins over the UDF values for
its activity. Checked on the six public files
(eval/udf-ranges-check-2026-11-19.md): none of their 16 real numeric UDFs is
read as a range, and with ranges planted on 16,989 activities the run equals
the run with the same numbers pasted as CSV in 24 of 24 cases (days, hours, %
and no most-likely).

**Risk in the written review** (2026-11-19, `report.mjs` `riskItems`, CLI
`--risk N --report review.html`): run the risk analysis on the page and the
review you print carries a "Finish date risk" section (the ranges assumed and
whether they came from the reviewer, P10 to P90 with and without the risk
register, the chance of the forecast and must-finish dates, the events ranked,
the activities that most often drive the finish) and three corrections a risk
run can back: **must-finish met in under 50% of runs** (high; under 80%
medium), saying whether the forecast itself already misses it; **near-critical
activities**: off the forecast's driving path but driving the finish in 25% or
more of runs (medium), each listed with its criticality; and **no stated
contingency** when the forecast is met in under half the runs (low). A risk run
for another project in the same file is left out with a note. Checked on the
six public files (eval/review-risk-check-2026-11-19.md).

**Windows in the written review, and a full-list appendix** (2026-11-19,
`report.mjs` `windowItems`, page: run the windows analysis on the job's
updates, then print the review of the latest one; CLI `--windows u1.xer u2.xer
... --report review.html [--appendix]`, which reviews the latest update against
the one before it): the review carries a "Delay by window" section (each
window's finish movement split into progress and revisions, the driving-path
activities behind it, the activities named in more than one window) and two
corrections a windows run can back. **Revisions that moved the finish later**
in a window ask the contractor to justify each logic, duration, constraint and
calendar change listed (medium at 5 or more working days, low below).
**Revisions that took back time progress lost** (progress slipped the finish
and the revisions pulled back 2 or more working days of it) ask for the
recovery plan behind the shortened or re-sequenced work: the pattern of a
schedule held on paper. A windows run of another project, or one that does not
end at the reviewed update's data date, is left out with a note. With the
appendix option the body still prints the first 40 activities of each
correction, and an appendix lists all of them, so the document alone is the
complete list. `xer.mjs` `xerText` writes a schedule back to XER text (P6 Web's
multi-line calendars quoted as P6 Web writes them). Checked on the six public
files: 18 update series built from them with planted re-estimates, slips and paper recoveries, written to disk and read by the CLI in shuffled order: the corrections equal the rules on all 18, every planted activity is named, every recovery plan expected (8) is asked and no other, and the appendix holds every row the body cut (on the 14,270-activity file that is 582 pages, so it is off by default) (eval/review-windows-check-2026-11-19.md).
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
no levelling can beat (a resource's remaining work at the limit in force
on each date), and a
**crew size** multiplier to see what crew holds the date. It warns when a
file still carries P6's default limit of 1 per hour on resources used far
above it. Checked on the public files in eval/level-check-2026-11-19.md.

**Expected finish dates** (2026-11-19, `cpm.mjs`, the "Expected finish dates
setting durations" finding): when a project schedules with P6's "use expected
end dates", an activity with an expected finish gets the remaining duration
that ends it on that date, from wherever its remaining work starts; a date at
or before that start is ignored and the stored duration stands. The engine now
does the same in every run (assessment, critical path test, comparison and
half-step, windows, risk, levelling), so a slip upstream is absorbed by such an
activity as it is in P6. The finding lists each one with the duration the date
set against the original, and, where the file says how far along it is, the
time left at the rate so far (a task 2% done after 22 days whose expected
finish leaves it 6 days); dates already passed are listed to clear. On the
public P6 24.12 file (23 activities with one): the stored remaining duration is
the time to the expected finish on 21 of 21, the 2 dates already passed are
ignored as P6 ignored them, and after adding 80 h to each of the 21 stored
durations the engine still reproduces P6's dates on 404 of 404 open
activities with the rule on (0 of 404 with it off). A 10-day slip on a
predecessor moves 2 of those activities 0 days instead of 10
(eval/expected-finish-2026-11-19.md). In the risk run an activity with an
expected finish keeps its date, as in P6, so its sampled duration does not
count; that is said in the eval, not yet on the page.

## Why someone would use it

| Today's option | What it does | What this does better |
|---|---|---|
| P6's own Level Resources | Levels in P6 for people who hold a P6 seat; changes the schedule in the database | The levelled finish, who moved and why, and a crew-size what-if from the XER, without P6 and without touching the contractor's file |
| Paid schedule-risk products (Primavera Risk Analysis, Deltek Acumen Risk, Safran Risk and similar) | Monte Carlo on a P6 schedule with risk registers, desktop licence per seat | P50 / P80, criticality and a risk register (probability x impact on named activities, contingency at P80, events ranked) from the XER in a browser tab, free, with ranges read from the file's own UDFs; no resource model, no probabilistic branches yet |
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
  A not-started activity's remaining duration is a re-estimate, not progress,
  so the half-step keeps the previous update's (2026-11-19; before that a
  re-estimate on unstarted work counted as progress: the example pair moved
  from +6 / +9 to +8 / +7, paint's 10 to 8 days now being a revision).
- `windows.mjs`: a series of updates, sorted by data date, each consecutive
  pair through `compare`; per window the split, the driving path at the start
  and the drivers on it; totals on the last update's calendar. `status.mjs`
  statuses a file as planned to a new data date (optionally with planted
  slips), for the check below and the page's example series.
- `report.mjs`: the written review. `reviewItems` turns each failing DCMA
  point, extra check, stale-date list, comparison flag, risk finding and
  windows finding (`windowItems`) into one ranked correction with its
  activities; `reviewHtml` lays them out for print, with an optional appendix
  of every activity.
- `risk.mjs`: the Monte Carlo run. Seeded generator (repeatable), triangular
  draws (one-factor Gaussian copula when correlated), `cpm.mjs` forward pass
  only (`forwardOnly`, `durations`), driving path per run, sensitivity as the
  correlation of each activity's draw with the finish, blank below
  4 / sqrt(runs). Risk events (`parseRisks`) draw from their own seeded
  stream, so adding a register never changes the duration draws.
- `udf-ranges.mjs`: numeric activity UDFs, the range-field guess by name,
  and the per-activity ranges (days, hours or % of remaining) `risk.mjs`
  takes as `ranges`.
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
node cli.mjs schedule.xer --risk 1000 --ranges-udf auto   # ranges from the file's own UDFs (or "Opt Dur,-,Pess Dur")
node cli.mjs schedule.xer --level [--crew 2] [--within-float] [--csv levelled.csv] [--json]   # resource levelling
node cli.mjs this-month.xer --previous last-month.xer [--json] [--csv changes.csv] [--project CODE]
node cli.mjs --windows jan.xer feb.xer mar.xer apr.xer [--json] [--csv windows.csv] [--project CODE]
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
- **245 XER files written by converters, other tools and by hand**
  (`eval/converter-files-2026-11-19.md`, `node eval/converter-corpus.mjs`):
  every public `.xer` a GitHub code search returned, 50 repositories. Before
  that day's fixes 1 crashed (a lag of "NotANumber") and 28 printed NaN,
  undefined or Infinity somewhere; now 241 are assessed with nothing of the
  kind, 4 that are not P6 files at all are refused with a one-line reason, and
  the warnings fell from 890 to 134 (activities with no calendar are grouped,
  and a blank calendar's week and day hours say whether it works 5, 6 or 7 days).
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
  example pair (+15 = +8 progress, +7 revisions) and by construction.
- **Microsoft Project XML** (`eval/cpm-vs-project-2026-11-19.md`): 102 MSPDI
  files saved by Project 2002 to 2019 (MPXJ's test corpus), 2,491 open tasks:
  early finish, late finish and total float equal Project's stored values on
  2,406 (96.6%), 86 files on every task; the misses are resource-driven,
  split and timephased tasks (61) and three small cases the eval names.
  `mspdi.test.mjs` covers holidays, derived calendars, work weeks, elapsed and
  percent lags, SS and FF links, manual tasks, constraints, progress with a
  status date, and a comparison across renumbered rows. These files are small
  test projects; no real construction schedule from Project has been read yet.
- **Not checked**: no file used progress override, start or smallest float, the
  successor or 24-hour lag calendar, or mandatory constraints, and no unit test
  covers them yet.
  An independent DCMA implementation was not run side by side.

## Limits

Screening metrics, not a verdict: a schedule can pass all fourteen and still be
unrealistic, and some failures are justified. Expected finish dates are
checked on one public file only (23 activities; the rule is read from the
durations P6 stored, not from a second P6 run). Not modelled: "make open-ended activities critical", multiple float
paths (resource levelling is the separate `level.mjs` step; the checks always
use the unlevelled dates; it is a serial pass like P6's, not P6's code, so its
dates can differ from a P6 levelled run, which no public file stores). 2 activities of the heavily progressed CCA file still differ (early
finish and total float; `eval/cpm-vs-p6-2026-11-19.md`, "What is left"). The float checks use the float the
file stores; the recomputed float is reported next to it, and the recomputed
schedule (every open activity's dates, total and free float beside the stored
values) downloads as a CSV from the page or `node cli.mjs file.xer --schedule out.csv`.

## Files

`samples/make-example.mjs` writes `example.mjs`, an invented office fit-out
schedule with deliberate faults, used by the page's example button and the
tests; `node samples/make-example.mjs office-fitout.xer` also writes it as an
XER file for the CLI. `eval/cpm-vs-p6.mjs` is the P6 comparison (dates, total and free float).
`mspdi.mjs` reads Microsoft Project XML into the same tables (`parseMspdi`,
and `parseSchedule`, which picks the reader from the text);
`eval/cpm-vs-project.mjs` compares the engine with Project's stored dates.

## Disclaimer

Provided free and as-is, without warranty. Not engineering, legal, contractual
or scheduling advice; it does not replace a qualified scheduler or the
scheduling software of record. Not affiliated with Oracle, Primavera, Microsoft or the
Defense Contract Management Agency; Primavera, P6 and Microsoft Project are
named only to describe the file formats.
