# XER Schedule Check

Open a **Primavera P6 `.xer` export** in the browser and get the **DCMA 14-point
schedule assessment** with every activity behind each failing point, a critical
path recomputed from the logic, the critical path test, and the faults the 14
points miss: logic loops, out-of-sequence progress, open finishes, expected
finish dates that hide delay, and stored
float that no longer matches the logic. MIT licensed, no dependencies, nothing
uploaded.

It also **converts an XER to Microsoft Project XML** for someone with Project
and no P6 seat (WBS, activity IDs, calendars, logic, constraints, progress,
baseline, resources, activity codes as named text columns, user-defined fields
as named Number, Cost, Date and Text columns, resource user-defined fields as
named resource columns, WBS user-defined fields as named columns on the summary
tasks, activity and WBS notebooks as task notes under their topics, expenses
as cost resources), checked on six public P6 files against this tool's own
MSPDI reader and against MPXJ (`eval/msproject-check-2026-11-21.md`,
`eval/msproject-udfs-2026-11-21.md`, `eval/rsrc-udfs-2026-11-21.md`,
`eval/wbs-udfs-2026-11-21.md`, `eval/notebooks-2026-11-21.md`,
`eval/expenses-2026-11-21.md`).
And the other way: **Microsoft Project XML to a P6 XER** for P6's import, for
a planner in Project who must submit a P6 file (WBS under a project node,
activity IDs, calendars, logic, progress with Project's Resume as P6's
suspend and resume, baseline, resources and assignments with cost, text
columns as activity codes, Number, Cost and Date columns as named
user-defined fields, task notes as notebook entries, cost resources and
fixed costs as P6 expenses, Project's scheduling options, saved in
Windows-1252 as P6 reads an XER), checked on 143 Project files and the six
P6 files sent through Project and back (`eval/p6xer-check-2026-11-21.md`,
`eval/p6xer-udfs-2026-11-21.md`, `eval/expenses-2026-11-21.md`).

**Live tool:** https://marisstella.app/xer-schedule-check/

After using this, an owner's rep can **send a contractor a list of the exact
activities to fix** in a schedule update (not just "fails DCMA point 6"), and a
scheduler can catch the same list before submitting.

**Gantt chart** (2026-11-20, `gantt.mjs`, the page's "Gantt chart", CLI
`--gantt`): the view a P6 user opens first, for the owners, lenders and
subcontractors who receive an XER and hold no P6 seat. The project's WBS as a
tree in P6's order with a summary bar per node (click to fold), a bar per
activity (actual, remaining, critical by the project's own setting or by the
longest path), milestones, the data date and must-finish lines, the
relationships between rows on screen, a filter for critical work and a
search. Level of effort and WBS summary activities, which the schedule engine
leaves out of the network, get the dates P6 gives them: **305 of 305** on the
public files equal P6's stored early start and finish to the minute (285 LOE
on the CCA hospital file, 10 in the P6 20.12 sample, 10 WBS summaries in the
P6 24.12 file). Open a baseline (or last month's update) next to it for each
activity's baseline bar and its finish variance in working days; without one
the planned dates the file keeps stand in. Prints as a landscape page
(HTML), downloads as CSV. Checked on the six public files: every activity on
the chart once (21,739 of 21,739), every WBS bar exactly the span of the work
under it (2,038 of 2,038), the file against itself shows no variance, and a
baseline with k days planted on one activity shows that activity -k working
days (120 of 120; `eval/gantt-check-2026-11-20.md`).
Group the chart by **activity codes** instead (2026-11-21, `actvcodes.mjs`,
the page's "Group by" and "then", CLI `--group-by "Responsibility,WBS"`, `--codes`
to list them): responsibility, area, phase, trade, whatever code types the
scheduler set up, global or the project's own, in P6's order; nested values
as a tree; a code then the WBS (or the WBS then a code); activities with no
value under "no <type>". Checked on the four public files that carry codes
(46 code types, 92 charts): every activity under the value TASKACTV gives it
and that value's parents (1,239,716 of 1,239,716 placements), counts, spans
and seq_num order all as read straight from the tables, and three planted
bugs each caught (`eval/activity-codes-2026-11-21.md`).

**Time impact analysis** (2026-11-20, `tia.mjs`): write a delay event as a
fragnet (the new activities it added, their working days, what each follows
and what each holds up, the date the event happened; or "+10" days on an
existing activity) and the tool inserts it into the update in force, schedules
the copy with the file's own calendars, logic and options, and reports how far
the finish and every open milestone move, the float every other activity gives
up, and, with two or more named events, each event alone, so concurrent delay
shows (AACE RP 52R-06; RP 29R-03 MIP 3.6). The impacted schedule downloads as
an XER to import into P6 and confirm, and as a printable exhibit for the
extension of time request. Checked on the six public P6 files with planted
fragnets against answers reached another way (a null fragnet moves nothing
120 of 120; a new activity after A equals A made longer 115 of 115; the
impacted XER reads back to the same finish 115 of 115; the finish moves by
the days past relative float 112 of 120, the 8 others crossing another
calendar or absorbed by an expected finish the tool names;
`eval/tia-check-2026-11-20.md`).

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
the warnings; since 2026-11-21 a deadline also caps the task's late finish, as
Project works total slack out from a deadline that falls before the late
finish (negative once the task is forecast past it; eval/deadlines-2026-11-21.md). On 102 files saved by Microsoft Project 2002 to 2019 (MPXJ's
test corpus, 2,491 open tasks), early finish, late finish and total float
equal what Project stored on 2,406 (96.6%) at first (eval/cpm-vs-project-2026-11-19.md),
and on **2,442 (98.0%)** since 2026-11-21: a task now runs on its resources'
calendars as Project schedules it (a night-shift crew works nights; a day and a
night resource together work both), and an in-progress task's remaining work
restarts at Project's Resume date (eval/resource-calendars-2026-11-21.md).
**Split tasks** are read too (2,446, 98.2%, later on 2026-11-21): Project
keeps a split only as zero-work rows in the assignments' timephased data, and
the reader adds that working time to the task's span, so a split task
finishes where Project says and its splits move with it when logic pushes it
(all 7 split tasks in the corpus, eval/split-tasks-2026-11-21.md). The
45 left are contoured and timephased work, manual tasks on start
links, and one file whose stored dates contradict each other.
`node cli.mjs schedule.xml`.

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
complete list. `xer.mjs` `xerText` writes a schedule back to XER text (quotes doubled and P6 Web's
multi-line calendars quoted as P6 writes them; 448,834 of 448,835 rows of the
public files written back byte for byte, eval/quotes-2026-11-21.md). Checked on the six public
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

**Look-ahead for the site meeting** (2026-11-19, `lookahead.mjs`, the page's
"Look-ahead for the site meeting" panel, `node cli.mjs schedule.xer
--lookahead [WEEKS] [--from YYYY-MM-DD] [--html sheet.html] [--csv
lookahead.csv]`): the next one to 26 weeks (3 by default) of work from the
recomputed dates, grouped by WBS in the file's WBS order, a bar for each
day the activity works on its own calendar (critical work in red), and a
make-ready check from the logic: **ready** (every FS predecessor finished,
every SS predecessor started, no lag still running), **waits** on named
look-ahead work with the date it is due, waits on work outside the window or
in another project, or **no predecessor** (an open start). It names what sets
each start (the driving link, a start constraint, the data date or the
project's planned start) and marks started work whose predecessors are not
done as out of sequence. The HTML sheet is self-contained and prints
landscape for the meeting; the CSV has a column per day. On seven public P6
files, the activities in each 1-, 3- and 6-week window are the ones P6's
own stored dates put there on 6,476 of 6,479 (the 3 are the CCA pair behind
a 608 h lag P6's own forward pass shortened to 440 h), no bar is on a wrong day, and every one
of 1,259 "waits" names a predecessor P6's dates are consistent with
(eval/lookahead-check-2026-11-19.md). On those files it surfaced 47 of 87
activities in Expressway's first three weeks held only by the project start,
and 592 of CCA's 1,465 activities in progress running out of sequence.
Crews, materials and permits are not in a P6 file, so "ready" is from the
logic alone and the sheet says so. The CLI also now waits for stdout before
exiting, so a `--json` report piped to another program is no longer cut off
at 64 KB (`--float-paths --json` on the CCA file was cut at 81,920 of 93,526
bytes).

**Constraints log in the make-ready check** (2026-11-20, `constraints.mjs`,
the look-ahead panel's "Constraints log" box, `node cli.mjs schedule.xer
--lookahead 3 --constraints log.csv [--constraints-csv updated.csv]`): the
things a P6 file does not hold (materials, permits, RFIs, submittals, crews,
equipment) kept as the spreadsheet the site team already has, one row per
constraint, pasted or opened as a CSV. Columns are found by name (activity
ID, constraint, type, owner, need by, expected, cleared, notes; only the
activity column is required, and a row may name several activities); dates
read as typed (2026-04-14, 4/14/2026, 14-Apr-26, an Excel day number). Each
row gets the date the schedule needs it by (the activity's remaining early
start, or now for work under way), the latest start before a deadline moves,
the working days to spare, and a status: **overdue** (open, its promised
date passed), **late** (it clears after the need-by day), **no date**,
**on track** or **cleared**; rows against finished work and unknown activity
IDs are named. An activity that is ready by its logic but has an open row
becomes **constrained**, the Last Planner "sound" test with the logic and the
log both clear. Then the what-if: every open row's expected date goes to the
CPM engine as a start floor on its activities, the schedule is recomputed,
and the page says how far the finish moves if the log holds as promised and
which look-ahead starts move; each late row is also run alone and the rows
are ranked by how far each one moves the finish, the one to chase first.
The log comes back as a CSV with the schedule's columns added, ready for next
week's meeting, and the printed sheet gains a constraints section. Checked on
the six public P6 files with planted logs (eval/constraints-check-2026-11-20.md):
the what-if equals the same dates written into the file as P6 "start on or
after" constraints and scheduled from scratch, on the finish and every open
activity's dates, and each row's own finish slip equals the same route run
alone. On the CCA file (14,270 open activities) the finish holds, yet 3 planted rows
pass their late start: the slip lands on an interim finish-on-or-before
milestone, not the project finish, which a finish-only what-if would hide.
No public job publishes its constraints log, so the statuses are checked
against their own rules, not against a site team's.

**"Past late start" says whether the row moves anything** (2026-11-20,
`constraints.mjs` `pastLabel`, eval/constraints-slack-2026-11-20.md). P6's
late start is not always the date after which something slips: its backward
pass leaves out the slack across calendars (a finish that may fall in its
calendar's non-work time, a milestone snapped to its calendar), and on
negative float the late start comes from a deadline that a longer path
already misses by more. A row past P6's late start is now read against both
and labelled in words: **moves the finish or a deadline**, **within the slack
its calendars leave: moves nothing**, or **a deadline is already missed by
more on another path** (with the date after which the row adds to it). On the
six public files with planted logs (three seeds, 65 rows past P6's late
start): the 38 read as moving something all move the finish or a kept date,
the 27 read as moving nothing move none, and each of those probed one working
hour past its bound does move one (21 of 21). On CCA, 25 of 26 such rows were
the "already behind" kind and had read the same as the one that pushes the
deadline out.

**Float P6 does not show across calendars** (2026-11-20, `calslack.mjs`, the
page's "Float P6 does not show across calendars" panel, `node cli.mjs
schedule.xer --calendar-slack [--csv slack.csv] [--json]`): where a
finish-to-finish or start-to-finish link joins two calendars with different
working days, P6 counts the predecessor's late finish back from the
successor's late finish, a period end such as Thursday 16:00. But a successor
on a Friday-off calendar may finish at Saturday 08:00 just as well (nothing
after it can start earlier), so a predecessor on a 7-day curing calendar can
finish a day later without delaying anything, and so can all the work driving
it. The panel lists the links where this enters and every activity with more
total float than P6 shows, least float first. The page's other figures stay
P6's (the engine's default still equals P6's stored dates). Found tracing why
a planted constraints-log row passed an activity's late start without moving
the finish; on the public hotel file 188 activities gain 1 to 17 h through 22
links, 27 of them with 8 h or less of P6 float (one curing activity goes from
8 h to 17 h), and each of the 188 was checked by rescheduling: delayed by the
new float the finish holds (188 of 188), one working hour more and it moves or
another activity runs late (188 of 188). The other five public files join no
calendars this way and show nothing (eval/calendar-slack-2026-11-20.md).

**Time milestones hold back across calendars** (2026-11-20, `milestones.mjs`,
the page's "Time milestones hold back across calendars" panel, `node cli.mjs
schedule.xer --milestone-calendars [--csv held.csv] [--json]`): a milestone
has no duration, but P6 places it on its own calendar. A start milestone after
a Thursday 16:00 finish, on a calendar with Friday off, sits at Saturday
08:00, and a successor crew on a Monday-to-Friday calendar then waits until
Monday. The check schedules the file a second time with every milestone on a
24-hour calendar (`schedule(xer, { milestones24h: true })`; mandatory dates
kept) and lists the milestones that hold work back, each successor they drive
and the hours it loses, the activities that could start earlier and the float
that comes back. On the public hotel file 8 start milestones on the
Friday-off calendar hold 11 successors back by 1 to 9 h; 205 activities
could start earlier, 2,201 gain 1 to 24 h of float and 115 that P6 marks
critical are not, while the finish does not move. The Expressway file has one
(a 7-day milestone starting at 08:00 holding 5-day crews that start at 07:00,
1 h). The other four files show nothing. Each gain was checked by rescheduling
(eval/milestone-calendars-2026-11-20.md). This is the mirror of the calendar
slack item above, the case where P6's float there would be too long if the
milestone's placement were ignored: the engine keeps P6's rule, and the panel
shows what moving the milestones would give.

**Earned value and the S-curve** (2026-11-20, `evm.mjs`, the page's "Earned
value and the S-curve", CLI `--earned-value [--csv activities.csv] [--curve
s-curve.csv]`): from the cost loaded on the resource assignments and project
expenses (labour hours when no cost is loaded): budget at completion, planned
value to the data date (each assignment's budget spread over the working time
of its planned dates on the activity's calendar), earned value from each
activity's percent complete as P6 earns it (physical, duration or units;
0/100, 50/50 or a fixed percent when the project's earned value setting is
exported), actual cost, SV, CV, SPI, CPI, TCPI, three estimates at completion
(the file's AC + ETC, at CPI, at CPI x SPI), earned schedule (SPI(t) and an
independent finish estimate), a monthly S-curve (planned, actual, and the
forecast over the recomputed remaining dates), a breakdown by top-level WBS,
and the cost-loading checks an owner's reviewer runs before paying on the
schedule: open work with no budget, cost on unstarted work, remaining left on
finished work, progress with nothing spent, earned more than 1.5 times spent
(front-loading), overruns, remaining far below the budget not yet earned, and
**actuals equal to earned value** on 90% or more of the activities with
actuals, which means P6 computed them from progress and the CPI proves
nothing. On the public 16,000-activity hospital file, all 2,020 cost-loaded
activities with actuals have actual = budget x the units percent complete this
reads (so the reading agrees with P6's on all 2,020, and that file's CPI of
1.000 is no cost evidence); on a public expressway file, 21 unstarted
activities budgeted at 111,528 carry 669 to complete
(eval/earned-value-2026-11-20.md).

**P6 resource curves** (2026-11-21, `curves.mjs`): an assignment that names a
P6 resource curve (`TASKRSRC.curv_id`, the curve's 21 points in
`RSRCCURVDATA`) has its planned value, the planned value a series of updates
holds as its baseline, and, while nothing is spent on it, its forecast spread
by the curve's twenty slices of working time instead of evenly (Back Loaded:
35% in the first half, 65% in the second; Bell Shaped; or the file's own,
such as a contract's PCO curve). Each slice is a twentieth of the
assignment's working time on its calendar, so a weekend takes nothing. On
the public hospital file, 36 assignments use 6 curves (25 of them a custom
"PCO119" bell): every spread sums to its budget, Linear gives the even
spread exactly, and the curved work's planned S-curve runs up to 109,048 h
(40%) behind the even one, at 2012-03-31 (161,678 h against 270,726 h).
Those 36 carry hours but no cost, so that file's cost figures do not move.
Three files name curve id 9 with no row for it in RSRCCURVDATA (234
assignments on the P6 24.12 Web file, 2 on Expressway, 1 on the hospital
file); they are spread evenly and the notes say so. No public XER carries
P6's own timephased spread of a curved assignment, so the slice reading
(MPXJ's, and the one P6's shipped curves fit) is not checked against P6's
numbers (eval/resource-curves-2026-11-21.md).

**Earned value by window across updates** (2026-11-20, `evmseries.mjs`, the
page's windows panel on cost- or hours-loaded updates, CLI `--windows u1.xer
u2.xer ... --earned-value [--csv ev-windows.csv]`): for each window between
two data dates, what the period earned (the change in earned value, activity
by activity), against what the previous update's own forecast **promised** by
the new data date (each open activity worked from its recomputed remaining
start for the working time to the new data date, its percent complete then
read as above), against the earliest update's planned curve held as the
baseline, and against what was spent. Earned / promised is 1.000 when the
period went exactly as the last update said; unlike a baseline SPI it cannot
be flattered by planned dates that moved with the schedule. Each window names
the activities that earned less than promised (or more), that spent well past
what they earned, whose budget changed (a revision, read on the earlier budget
so it is not counted as progress), whose earned value or actuals went down,
and that were added or removed. On series built from four public files with
planted slips and overruns, window 1 (statused as planned) reads 1.000 on all
of them with nobody named; with 20 plants of each, 41 of 41 slips and 36 of 36
overruns are named, and with 50 over five seeds 435 of 435 and 250 of 250, no
other activity named either way (eval/evm-series-check-2026-11-20.md).
`status.mjs` now posts cost and units with the work it statuses (at the
planned rate; `overruns` plants a cost factor), so the example series and
generated series carry actuals.

## Guides (2026-11-21)

Four search-landing guides, linked from the tool page, `sitemap.xml` and `llms.txt`:
`how-to-run-a-dcma-14-point-schedule-assessment.html`, `how-to-open-an-xer-file-without-primavera-p6.html`,
`how-to-convert-a-p6-xer-file-to-microsoft-project.html` and `how-to-review-a-contractors-p6-schedule-update.html`.
The two worked examples use the built-in invented fit-out; `guides.test.mjs` runs the CLI on it and fails if a
quoted number (6 of 14 pass, logic 10.5%, CPLI 1.051; +15 working days = progress +8, revisions +7) or a named
button drifts. Search impressions not measured yet.

## Why someone would use it

| Today's option | What it does | What this does better |
|---|---|---|
| A look-ahead made by hand (a filtered P6 layout printed to PDF, or copied into Excel each week) | Works for whoever holds P6 or has the time to copy dates | The 1-6 week sheet straight from the XER, with what each activity waits on and the date it is due, open starts and out-of-sequence work named, printable and as CSV, with no P6 seat |
| A constraints log in Excel, or a Last Planner board (sticky notes, or paid tools such as Touchplan or vPlanner) | Tracks what each task waits on, kept apart from the schedule; the paid boards need their own plan entered | The same spreadsheet merged with the P6 schedule: the date each row is needed by from the recomputed dates, late and overdue rows named, and how far the finish moves if the log holds, row by row, free and in the browser |
| P6's own Level Resources | Levels in P6 for people who hold a P6 seat; changes the schedule in the database | The levelled finish, who moved and why, and a crew-size what-if from the XER, without P6 and without touching the contractor's file |
| Paid schedule-risk products (Primavera Risk Analysis, Deltek Acumen Risk, Safran Risk and similar) | Monte Carlo on a P6 schedule with risk registers, desktop licence per seat | P50 / P80, criticality and a risk register (probability x impact on named activities, contingency at P80, events ranked) from the XER in a browser tab, free, with ranges read from the file's own UDFs; no resource model, no probabilistic branches yet |
| A time impact analysis done by hand in P6 (copy the update, type the fragnet in, reschedule, compare the finish), or bought from a claims consultant | Needs a P6 seat and an afternoon per event; consultants charge by the hour | The fragnet as a table, the finish and every milestone's move, float used, each event alone and their overlap, a printable exhibit and the impacted XER for P6, in a browser tab, free |
| Paid XER-to-Project converters, or MPXJ-based tools you install with Java | Convert the file on your machine or a server, often per seat | The Microsoft Project XML straight from the XER in a browser tab, free, nothing uploaded, with a list of what Project will schedule differently for this file (lag calendars, level of effort, milestones, external dates), checked activity by activity against MPXJ's own reading |
| Paid Project-to-P6 converters, or importing the .mpp into P6 (needs a P6 seat and Project installed on the same machine), or retyping the schedule | Get a Project plan into P6 for an owner or GC who asks for an XER | An XER P6's import takes, straight from the Project XML in a browser tab, free, nothing uploaded: every id renumbered, every field P6 20.12 writes, one project node, Number, Cost and Date columns as named P6 user-defined fields, Project's scheduling options so P6's first run gives Project's dates, task notes as P6 notebook entries under their topics, cost resources and fixed costs as P6 expenses, deadlines as finish-on-or-before constraints on request (so P6's float counts down to them as Project's slack does), and a list of what is not carried (elapsed lags, splits) |
| Paid XER viewers (desktop readers sold per seat or per year) or asking the contractor for a PDF of their layout | Show the activities and bars from an XER without P6; a PDF is whatever layout the contractor chose | The WBS tree and bars in a browser tab, free, with level of effort and WBS summary dates as P6 gives them (305 of 305 on the public files), the baseline bar and finish variance per activity, critical or longest-path colouring, printable and as CSV |
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
  Windows-1252, CRLF, P6 Web's quoted multi-line values, P6's doubled quotes
  (`""` read as one, written back as P6 writes it: 22,260 of 22,260 names = MPXJ's,
  eval/quotes-2026-11-21.md), names with stray quotes.
- `p6xer.mjs`: `p6XerText(text, { projectId, activityIds })` writes a P6 XER
  from Microsoft Project XML: every field P6 20.12 writes in CURRTYPE,
  FINTMPL, OBS, PROJECT, CALENDAR, SCHEDOPTIONS, PROJWBS, RSRC, ACTVTYPE,
  ACTVCODE, TASK, TASKPRED, TASKACTV and TASKRSRC, whole-number ids, one
  project WBS node, activity IDs from a text field named "Activity ID" (else A
  + row x 10), calendars in P6's form, Project's Resume as suspend/resume,
  resources (work as labour, material as material) and assignments with cost,
  text fields as project codes (a `parent.child` path type rebuilt as P6's
  code tree), task notes as notebook entries (MEMOTYPE, TASKMEMO, WBSMEMO),
  Project's scheduling options; the result's `bytes` are Windows-1252 (P6's
  XER code page; UTF-8 with a warning when a character does not fit, via
  `xerBytes` in `xer.mjs`); `p6Problems(tables)` lists what
  P6's import would refuse (missing fields, ids, references, lengths, dates).
- `notebook.mjs`: P6 notebooks and Project notes. `memoText(html)` reads a
  notebook entry (P6 desktop's DHTML with 0x7F line breaks, P6 Web's HTML,
  or plain text) as text with its paragraphs, breaks and list items on
  lines; `memoHtml(text)` writes one as P6 Web does (one `<P>` per line, no
  tab or line break in the value); `notesText` / `parseNotes` write and read
  a task's notes as `[Topic]` sections in MEMOTYPE order (a body line that
  looks like a heading is indented a space so it stays put; a note with no
  heading is one entry under "Notes"); `notebookSections(T)` groups an XER's
  TASKMEMO and WBSMEMO by activity and WBS node. `msproject.mjs` writes them
  into task, summary task and project summary notes, `mspdi.mjs` reads task
  notes back as MEMOTYPE, TASKMEMO and WBSMEMO (topic order merged from every
  note), and `p6xer.mjs` writes those tables.
- `calendar.mjs`: P6 work calendars from `clndr_data` (weekly periods, holidays,
  changed days), and working-time arithmetic to the minute.
- `msproject.mjs`: `mspdiText(xer, { projId })` writes Microsoft Project XML
  (MSPDI) from an XER: WBS summary tasks in P6's order, activity IDs in Text1,
  calendars with every exception day, links, lags, constraints, progress
  (duration = actual + remaining, Resume at P6's remaining start), baseline 0,
  resources and assignments; activity codes in Text2..Text30, one per code
  type, named after it (`{ codeNames: true }` writes "code - description"; a
  leaf code repeated under two parents is written as its path);
  `{ outlineCodes: true }` (`--outline-codes`, a box on the page) writes the
  10 most assigned code types as Outline Code1..10 instead, each with a
  lookup table holding the type's P6 tree and descriptions
  (`outlineCodeFields`), and `mspdi.mjs` reads outline codes back as a code
  tree; level of
  effort as manual tasks with their links in the notes; warnings for what
  Project schedules differently. `mspdi.mjs` reads task text fields back as
  activity codes. Activity UDFs (`udfFields`): integer and decimal UDFs in
  Number1..20, cost UDFs in Cost1..10 (hundredths), date UDFs in Date1..10,
  text UDFs in the Text fields codes leave free, each named after the UDF;
  codes and text UDFs share the 29 Text fields by how many activities each
  fills. `mspdi.mjs` reads Number, Cost and Date fields back as UDFs, so a
  Project file's own Number fields feed the risk run's ranges too.
- `cpm.mjs`: forward and backward passes on each activity's own calendar: FS,
  SS, FF and SF links with lags on the project's lag calendar; total float as
  finish, start or smallest float; retained logic or progress override; planned
  start and must-finish-by; primary and secondary constraints including as late
  as possible; external dates; loops found and reported (Tarjan). Also free
  float and the driving path. Level of effort and WBS summary activities are
  left out of the network.
- `floatpaths.mjs`: the longest path (every driving branch into the project
  finish, compared with the flag P6 stores on each activity) and multiple float
  paths to any one activity. Relative float is total float computed as if that
  activity were the only finish: a backward pass from its early finish over its
  predecessors alone, in hours on each activity's own calendar. Path 1 is the
  driving chain into it; each later path is the next least relative float. It
  answers what drives an interim milestone (a handover, a permit, a sectional
  completion), which total float answers only for the project finish.
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
- `tia.mjs`: time impact analysis. `parseFragnet` reads the fragnet table
  (columns found by name; links as `A1030`, `A1030 SS`, `F1 FS+2`, lags in
  working days; an ID that itself ends in `-1` is taken whole when the file or
  fragnet holds it). `insertFragnet` adds TASK and TASKPRED rows to a copy of
  the tables as a scheduler would in P6: a new activity on the calendar of its
  first existing predecessor (else successor, else the project's), a start-on-
  or-after constraint for the event date, lags on the project's lag calendar.
  Days added to a milestone (no duration in P6) or to a finished, level of
  effort or WBS summary activity are refused with a warning; added days on an
  activity with an FF or SF predecessor are warned about (they move its start
  earlier, not its finish). `timeImpact` schedules both and compares: finish
  and milestones in working days of the project calendar, float given up,
  the driving path after the event, and each event alone (forward pass). A
  fragnet that closes a loop is refused.
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
node cli.mjs schedule.xer --float-paths [CODE] [--paths 10] [--csv paths.csv] [--json]   # float paths to CODE (default: the finish)
node cli.mjs schedule.xer --gantt [--baseline baseline.xer] [--html gantt.html] [--csv gantt.csv] [--level 2] [--critical] [--links] [--group-by "Responsibility,WBS" | --codes]   # Gantt chart
node cli.mjs schedule.xer --level [--crew 2] [--within-float] [--csv levelled.csv] [--json]   # resource levelling
node cli.mjs this-month.xer --previous last-month.xer [--json] [--csv changes.csv] [--project CODE]
node cli.mjs update.xer --tia fragnet.csv [--csv impact.csv] [--html tia.html] [--xer impacted.xer] [--event NAME] [--by NAME] [--json]   # time impact analysis
node cli.mjs --windows jan.xer feb.xer mar.xer apr.xer [--json] [--csv windows.csv] [--project CODE]
```

When a file holds several projects, the comparison takes the project with the
same project ID (`proj_short_name`) from last month's file, so the two sides
are the same project; `--project CODE` (or the page's project picker) chooses
it. The changes CSV writes a cell that starts with `=`, `+`, `-` or `@` with a
leading apostrophe, so a crafted activity name in a contractor's file can't
run as a formula in Excel or Sheets.

## How it was checked

- **Deadlines** (`eval/deadlines-2026-11-21.md`, `deadlines.test.mjs`): a
  Project deadline before the late finish caps it in the MSPDI reading (as
  Microsoft documents for total slack), and `--deadlines` writes it to the XER
  as a finish-on-or-before (primary when the task has no constraint, secondary
  beside a start-on-or-after, start-on-or-before, finish-on-or-after or
  as-late-as-possible, the earlier date beside a finish-no-later-than, refused
  and named beside a start-on, finish-on or mandatory one, where P6 takes no
  secondary). On planted files P6's recomputed float then equals the MSPDI
  reading's on every task, and is larger without the switch. Only one public
  Project file has deadlines (MPXJ's `legacy/sample1.xml`, all tasks finished),
  so no real file measured it: the 102-file corpus is unchanged at 2,446 of
  2,491. Not imported into P6 itself.
- **Microsoft Project XML to P6 XER** (`eval/p6xer-check-2026-11-21.md`): 143
  Project files (MPXJ's MSPDI test corpus, Project 2002 to 2019) written as
  XER: none breaks P6's import rules (`p6Problems`); read back by this tool's
  XER reader, 2,520 of 2,520 activities intact, 65 of 65 links, 181 of 181 code
  assignments, and the recomputed schedule equal on 2,509 of 2,509 open
  activities. MPXJ 16.10 reads the same name, start, finish, actual dates,
  constraint, predecessors and resource assignments from the XML and the XER
  on 2,520 of 2,520 tasks, and the same remaining duration on 2,518 (a
  0.01 h rounding and a blank read as 0). The six public P6 files sent through
  Project XML and back: every activity ID returns (21,739 of 21,739), 21,422 of
  21,422 activities intact with the same WBS path, 54,843 of 54,843 links,
  276,042 of 276,042 code assignments (hierarchies rebuilt), the schedule
  under Project's rules the same on 19,818 of 19,822. Not imported into P6
  itself: no P6 seat here.
- **Project custom fields to P6 UDFs** (`eval/p6xer-udfs-2026-11-21.md`):
  every Number1..20, Cost1..10 and Date1..10 field in MPXJ's Project 2003 to
  2019 test files (19 files, 243 values) is written as a P6 activity UDF
  titled after the field and read back the same, 243 of 243; P6 files sent
  through Project XML and back return their numeric, cost and date UDFs,
  13,174 of 13,174 on CCA and 823 of 823 on Expressway. MPXJ reads the same
  14,240 of 14,240 values from both sides. The UDF type is guessed on the way
  back (whole numbers as integer UDFs): 7,104 of CCA's 13,174 keep P6's own.
- **XER to Microsoft Project XML** (`eval/msproject-check-2026-11-21.md`): six
  public P6 files written as MSPDI and read back with `mspdi.mjs`: 21,422 of
  21,422 activities intact (name, status, remaining duration, actual dates,
  constraint, baseline, calendar day by day), 54,843 of 54,843 links kept and
  the 1,810 level-of-effort links found in their notes; recomputed under
  Project's rules the schedule is the same on 19,818 of 19,822 open activities
  (4 in-progress CCA activities differ in late dates only, unexplained). MPXJ
  16.10 reads the same name, dates, durations, progress, constraint, calendar,
  predecessors and assignment hours and cost from the XER and the XML on every
  activity but one (an external date written as a constraint on purpose). Not
  opened in Microsoft Project itself.
- **Activity codes in the Project XML** (`eval/msproject-codes-2026-11-21.md`):
  on the four public P6 files with codes, 276,042 of 276,042 code assignments
  written read back to the same code (and description, with `--code-names`),
  no two values merged; MPXJ 16.10 reads all 38 field names and 276,042 of
  276,042 values where they were meant to go. The CCA file uses 37 code types:
  the 29 most assigned were written and 1,416 assignments in the other 8
  named; since text UDFs share the fields (below), 24 code types are
  written there (255,410 of 255,410 back) and 3,541 assignments named.
  Not opened in Microsoft Project itself.
- **Activity codes as Project outline codes** (`eval/msproject-outline-2026-11-21.md`):
  with `--outline-codes`, the four public files with codes write 19 code
  types as outline codes, with 434 lookup values that read back with the
  same code, parent and description. 179,400 of 179,400 assignments come
  back on the same code and the same path up P6's tree, from either task
  form alone. MPXJ 16.10 reads 19 of 19 field names, 434 of 434 lookup
  values and 179,400 of 179,400 task values, from both forms together and
  from each alone. Back to XER, P6's tree is kept (179,400 of 179,400). On
  CCA, 33 of its 37 code types are carried, against 24 with text fields
  only. Not opened in Microsoft Project itself.
- **User-defined fields in the Project XML** (`eval/msproject-udfs-2026-11-21.md`):
  on CCA, Expressway and a planted file (cost, start and finish date
  UDFs), every UDF value written reads back the same: 13,859 numbers, 226
  dates, 36 costs and 28,850 text values. MPXJ 16.10 reads 42,971 of 42,971
  cells and 32 of 32 field names where they were meant to go. On CCA, 15 text
  UDFs compete with 37 code types for 29 Text fields; 746 values of the 10
  least-filled text UDFs are named, not written. Before, all 41,729 activity
  UDF values on CCA were dropped. Not opened in Microsoft Project itself.
- **Expenses** (`eval/expenses-2026-11-21.md`, 2026-11-21): P6 expenses
  (PROJCOST) become Project cost resources (one per expense name, category
  as Group, accrual as AccrueAt; a name with a second category or accrual
  gets its own resource and an `Expense:` note line) and come back as
  expenses; Project cost resources and task fixed costs become P6 expenses.
  1,557 expenses (41 real rows from a generator-written public XER, 1,516
  planted on the six P6 files) through Project XML and back: 1,526 of 1,526
  (activity, name) groups equal in budget, actual, remaining, category and
  accrual, 1,495 of 1,495 single ones in vendor, PO, quantity and
  description, totals to the cent; MPXJ reads the same from both XERs and
  the cost assignments equal the source on 1,213 of 1,213 activities. 102
  Project files with planted cost resources and fixed costs: 615 of 615
  assignments and 246 of 246 fixed costs written as expenses with equal
  totals, 0 P6 import problems. Before, both directions dropped them. Not
  imported into P6 itself.
- **Notebooks and notes** (`eval/notebooks-2026-11-21.md`, 2026-11-21): the
  88 real notebook entries in the public files (86 activity and 1 WBS entry
  under "Description" on Expressway, 1 under "Anticipated Problems" on the
  24.12 file) sit in the Project XML notes under their topic and come back
  from XML to XER on the same activity or WBS node, same topic, same text:
  88 of 88. With 2,006 planted entries (P6 desktop DHTML, P6 Web HTML and
  plain text; lists, breaks, entities, quotes, accents, heading-like lines)
  on six files: 2,006 of 2,006 read as the generator meant and back the
  same, topic order kept on 700 of 700 activities and nodes with two or more
  topics, 0 P6 import problems. 5 of 5 Project task notes in MPXJ's corpus go
  to XER and back unchanged. MPXJ 16.10 reads 1,702 of 1,713 topic entries
  (activities and WBS nodes with a unique name; not the four-project hotel
  file, where MPXJ opens another project) with the same words from the original XER
  and the one written back; the 11 others are 2 project-node entries MPXJ
  puts on no task and 9 planted plain-text entries starting with a quote
  mark, which MPXJ reads as a quoted value in the original. Before, every
  notebook entry was dropped both ways (and counted). Not imported into P6 itself.
- **Resource user-defined fields** (`eval/rsrc-udfs-2026-11-21.md`, 2026-11-21):
  resource UDFs go into Project's resource Text, Number, Cost and Date fields,
  renamed to each UDF's title, and come back from a Project file as P6
  resource UDFs. Through XML and back to an XER, 330 of 330 values return the
  same on the same resource: the 87 real text values on the public 24.12 file
  and 243 with planted cost, date and number UDFs. MPXJ 16.10 reads 330 of 330
  cells from the XML and from the XER, and 12 of 12 field names. A finish-date
  UDF comes back as a start-date one (Project has one date kind). Before, all
  87 real values were dropped.
- **WBS user-defined fields** (`eval/wbs-udfs-2026-11-21.md`, 2026-11-21):
  WBS UDFs go into the task Number, Cost, Date and free Text fields of the
  summary tasks, renamed to each UDF's title; a WBS UDF titled like an
  activity UDF of its kind shares that column. They come back from a Project
  file as P6 WBS UDFs (summary-task values) beside the activity UDFs (task
  values). No public XER has a WBS UDF, so they were planted on three public
  files: 6,383 of 6,383 values in the fields written return the same on the
  same WBS node, MPXJ 16.10 reads 6,383 of 6,383 cells from the XML and from
  the XER and 20 of 20 field names, 13,997 of 13,997 activity UDF values still
  come back, and the six unplanted files convert byte for byte as before. On
  CCA the text WBS UDFs find no free Text field (codes fill them) and are
  named in the warnings, as is a value on the project node.
- **Gantt by activity code** (`eval/activity-codes-2026-11-21.md`): 92
  charts (each code type alone, and then the WBS) on the four public files
  with codes: every activity once, under its TASKACTV value and that value's
  ACTVCODE parents (1,239,716 of 1,239,716), group counts against an
  independent tally (943 of 943), every group bar the span of its work, and
  siblings in seq_num order; mutants with the order reversed, nested parents
  dropped or counts off by one each fail.
- **Gantt chart** (`eval/gantt-check-2026-11-20.md`): on the six public
  files, the dates given to level of effort and WBS summary activities equal
  P6's stored early start and finish on 305 of 305 (three rules were found
  from mismatches: a started LOE's remaining start is where its predecessors
  allow, the data date only when its successors are already past that; LOEs
  tied to other LOEs resolve in turn; a started WBS summary's remaining start
  is the data date); every other open activity's bar equals P6's stored early
  dates on 19,820 of 19,822 (the engine's two CCA differences); 21,739 of
  21,739 activities on the chart once; 2,038 of 2,038 WBS bars equal the span
  of the work under them and follow the WBS order; with planted baselines,
  120 of 120 finish variances exact.
- **Time impact analysis** (`eval/tia-check-2026-11-20.md`): planted
  fragnets on the six public files. A zero-day fragnet between linked
  activities moves nothing (120 of 120); a new activity inserted between A
  and its only successor moves the finish, every milestone and the
  successor's start exactly as making A longer does (115 of 115); the
  impacted XER, written and read back, schedules to the same finish (115 of
  115); an activity made d days longer moves the finish by d minus its float
  relative to the finish (112 of 120: 7 of the others cross a calendar with
  different working days, 1 is absorbed by an expected finish date, which the
  tool names). The run found days on a milestone silently dropped (now
  refused) and an ID ending in "-1" read as a lag (now taken whole).
- **Longest path against P6's own flag** (`eval/longest-path-2026-11-19.md`):
  on five of the six public files the longest path is exactly the set P6
  flagged (261 of 261 open activities, none extra); the old single chain held 19
  of the terminal file's 36. On the sixth (CCA) all 56 found are flagged, but
  P6 flags 548 more that carry up to 3,788 h of P6's own stored float, so those
  flags are left from an earlier run. The float-path backward pass, seeded at
  the finish's late date, never gives an activity less float than its total
  float (0 of 15,240) and equals it everywhere the finish binds (4,211 of 4,211
  on the hotel file).

- **Against P6 itself** (`eval/cpm-vs-p6-2026-11-19.md`): six public XER files
  from P6 5.0 to 24.12, 19,822 open activities. Early finish, late finish and
  total float all equal P6's stored values on **19,820 (99.99%)**, and late
  finish on all 19,822: 100% on five files (the hotel schedule's last one fixed
  by the free-float rules), 14,268 of 14,270 on a heavily progressed programme
  with 2,134 out-of-sequence links (88.2% before the retained-logic rules of
  2026-11-19, 99.4% before the third pass, 14,256 before the fourth). The two
  left are a finish milestone and its successor behind a 608 h lag that P6's
  own stored early dates break by 168 h, while the relationship date P6 wrote
  on the same link shows it used the full 608 h backward (see "P6's
  relationship dates" below). Every rule added to get there is listed
  there with the count it moved; the fourth pass added five (an open
  predecessor's FS lag into a finished node comes back off, a labour
  assignment's remaining work sets the late start of an activity with no
  remaining duration, unspent SS lag into a finished node, as late as possible
  on started work, and a future actual start that has spent no lag). A fifth
  pass (rule 17: a finished activity's FS/FF lag not yet spent at the data
  date comes back off its late date) brought the late dates P6 stores for
  finished activities from 1,497 to 1,529 of 1,534 in that file (1,550 of
  1,555 over the six); the 5 left are one chain.
- **A seventh P6 file, and edited durations** (`eval/edited-durations-2026-11-19.md`):
  Harbour Pointe Assisted Living Center (P6 17.12, a public copy found by a
  size-split code search) matched on 88 of 113 at first. All 25 that differ
  trace to 8 unstarted activities whose duration was changed after P6 last
  scheduled the file; with the durations the stored dates imply, **113 of
  113** agree. The assessment now lists such activities ("Durations edited
  after the last schedule run") and says how many stored-date differences the
  edits account for. Checked with 300 planted edits on the six files: 300
  found, 0 extra, every difference they caused explained; none of the six
  lists anything as found.
- **Lags edited after the last schedule run** (`eval/edited-lags-2026-11-19.md`):
  P6 meets every link when it schedules, so a link the stored dates break was
  lengthened or added afterwards (or its predecessor's actual date moved
  later). The check tests every link into an
  unstarted activity on both sides: the successor's stored early start (finish,
  for FF and SF) against the predecessor's actual date or stored early date
  plus the lag, and the predecessor's stored late date against the
  successor's, since a longer lag that moves no early date still eats the
  predecessor's float. On the seven P6 files it breaks 1 of 46,727 links as
  found: CCA's FS link BAFT1005509C1 -> BAFT2305509C1, lag 608 h (76 days),
  where the stored dates leave exactly 440 h (55 days). Rescheduled with 440 h,
  both of CCA's last two differing activities agree (one but for an overnight
  gap with no working time in it: P6 wrote 08:00 the next working day where
  the engine writes 17:00). The assessment lists such links ("Lags edited after
  the last schedule run") with the lag the dates leave room for, and the
  written review asks for a reschedule (medium). Planted-edit counts are in
  the eval file. A shortened lag breaks no link and is not found by this
  check; the relationship-date check below finds it. (Correction 2026-11-20:
  CCA's 608 h lag was not edited; P6's own relationship date on it shows the
  608 h was used at that run, so the 440 h gap is P6's forward pass.)
- **P6's relationship dates** (`eval/relationship-dates-2026-11-20.md`,
  `reldates.mjs`): every P6 export from 5.0 to 20.12 stores two dates on each
  link (TASKPRED `aref` and `arls`) that no P6 screen shows. Decoded: `aref` is
  the early start the link gives the successor, `arls` the late date it gives
  the predecessor (for SS, less the predecessor's duration); `arls` agrees on
  **40,476 of 40,476** links between unstarted activities on six files, `aref`
  on 40,383, and from finished predecessors `arls` takes off only the unspent
  lag on 1,894 of 1,894 (an independent check of CPM rule 17). Written in the
  same run as the stored dates, they carry the lag P6 used, so the assessment
  now lists a lag changed after the last run, **longer or shorter**, with the
  old lag (1,200 of 1,200 planted edits read back exactly, 1,200 of 1,200
  planted links added after the run named, 0 false listings). They also close
  the last finished-node residual: CFNS103317C0's stored late date contradicts
  the relationship date P6 wrote on its own link, which the engine matches.
- **Free float against P6** (`eval/free-float-2026-11-19.md`,
  `eval/free-float-expected-2026-11-20.md`): the same files,
  **19,820 of 19,822 (99.99%)** equal P6's stored free float (19,810 before
  the expected-finish rule, 19,809 before the fourth CPM pass), up from 18,537
  (93.5%), after five rules (an open end runs to the project's early finish; SS
  lag already spent on either side of a started link is not free float; a
  finished successor still counts; free float is never negative and not capped
  at total float; an activity with an expected finish, when the project uses
  them, has none: all 23 such activities in the 24.12 file store 0, 9 of them
  against a positive gap in P6's own dates), each with its measured count. The
  2 left are CCA activities whose early dates already differ.
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
  a finished node's late date with only its unspent lag back; constraints and negative float against a
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
  2,406 (96.6%), 86 files on every task; since 2026-11-21 2,442 (98.0%), with
  resource calendars and Resume dates read (`eval/resource-calendars-2026-11-21.md`:
  legacy/sample.xml 0 to 16 of 16, the assignments file 1 to 3 of 3 in seven
  Project versions); split tasks read 2026-11-21 (2,446, 98.2%;
  `eval/split-tasks-2026-11-21.md`: mspdisplittask.xml 0 to 2 of 2, early
  finish 30 of 30 in mspditimephased.xml); the 45 left are timephased late
  dates (36), manual tasks on start links, one assignment delay and one
  self-contradicting file.
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
durations P6 stored, not from a second P6 run). Not modelled: "make open-ended activities critical"; time impact analysis models the delay but not its cause, entitlement or apportionment, and is checked against planted fragnets, not a real TIA exhibit; multiple float
paths follow P6's "free float" style but are not compared with P6's own (no
public file stores them), and P6's "total float" option is not offered (resource levelling is the separate `level.mjs` step; the checks always
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
XER file for the CLI. `eval/cpm-vs-p6.mjs` is the P6 comparison (dates, total and free float);
`eval/longest-path.mjs` checks the longest path against P6's flag and the float-path pass.
`mspdi.mjs` reads Microsoft Project XML into the same tables (`parseMspdi`,
and `parseSchedule`, which picks the reader from the text);
`eval/cpm-vs-project.mjs` compares the engine with Project's stored dates.
`msproject.mjs` writes an XER as Microsoft Project XML (`mspdiText`;
`node cli.mjs file.xer --to-project out.xml`); `eval/msproject-check.mjs` reads
the result back and recomputes it, `eval/msproject-mpxj.py` compares MPXJ's
reading of both files. `p6xer.mjs` writes Microsoft Project XML as a P6 XER
(`p6XerText`; `node cli.mjs file.xml --to-p6 out.xer [--project-id CODE] [--deadlines]`);
`eval/p6xer-check.mjs` checks it on MSPDI files and on XERs sent through
Project XML, `eval/p6xer-mpxj.py` compares MPXJ's reading of the XML and the XER.
`samples/constraints-log.csv` is a constraints log for the example schedule
(the page's "Example log" button); `eval/constraints-check.mjs` plants logs on
real files and checks the what-if against P6 start-on-or-after constraints.

## Disclaimer

Provided free and as-is, without warranty. Not engineering, legal, contractual
or scheduling advice; it does not replace a qualified scheduler or the
scheduling software of record. Not affiliated with Oracle, Primavera, Microsoft or the
Defense Contract Management Agency; Primavera, P6 and Microsoft Project are
named only to describe the file formats.
