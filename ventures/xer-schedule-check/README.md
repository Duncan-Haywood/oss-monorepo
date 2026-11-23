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
tasks, activity and WBS notebooks as task notes under their topics, resource
notes as resource notes, the resource hierarchy as each resource's Group,
expenses as cost resources), checked on six public P6 files against this tool's own
MSPDI reader and against MPXJ (`eval/msproject-check-2026-11-21.md`,
`eval/msproject-udfs-2026-11-21.md`, `eval/rsrc-udfs-2026-11-21.md`,
`eval/wbs-udfs-2026-11-21.md`, `eval/notebooks-2026-11-21.md`,
`eval/resource-notes-2026-11-21.md`,
`eval/resource-hierarchy-2026-11-22.md`, `eval/expenses-2026-11-21.md`).
And the other way: **Microsoft Project XML to a P6 XER** for P6's import, for
a planner in Project who must submit a P6 file (WBS under a project node,
activity IDs, calendars, logic, progress with Project's Resume as P6's
suspend and resume, baseline, resources and assignments with cost, text
columns as activity codes, Number, Cost and Date columns as named
user-defined fields, task notes as notebook entries, resource notes as P6
resource notes, resource Groups as P6's resource hierarchy, cost resources and
fixed costs as P6 expenses, Project's scheduling options, saved in
Windows-1252 as P6 reads an XER), checked on 143 Project files and the six
P6 files sent through Project and back (`eval/p6xer-check-2026-11-21.md`,
`eval/p6xer-udfs-2026-11-21.md`, `eval/expenses-2026-11-21.md`). Give it the
original XER too and a P6 file's user-defined fields come back with their own
types, text UDFs as text UDFs rather than codes
(`eval/udf-types-from-2026-11-22.md`, `eval/udf-type-hints-2026-11-22.md`).

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
`eval/tia-check-2026-11-20.md`). Where the event can go more than one way, branch
groups with probabilities in the fragnet give the expected delay, P50 and P80
over every outcome, each scheduled exactly (2026-11-22, "Probabilistic
branches in the time impact analysis" below). On an update where every activity is
already finished (added work after the scope is done), the delay is measured
from the last actual finish, else the data date, and a note says so
(2026-11-22; it used to read "no change").

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

**Levelling on resource curves** (2026-11-22, opt-in: `--level --curves`, the
page's "Spread each assignment: on its P6 resource curve"): an assignment that
names a P6 resource curve (Back Loaded, Bell Shaped, a file's own) uses its
units at the curve's rate, not at its average. Each curved span is cut into
the curve's twenty slices of working time on the activity's calendar, each
levelled at rate x 20 x its share, with the units summing to the
assignment's. A back-loaded crew then leaves room early that its average hid,
and a peak above the limit that the average stays under is levelled. On the
public CCA hospital file, where one levelled activity carries a custom
late-bell curve at 134 units an hour on average (347 at its peak), the
levelled finish at 100 times the file's limits comes 3.4 working days
earlier on the curve and at 50 times 33 days later; planted on 30% of the
assignments of every limited resource in four files, the self-check stays
0 h and every link holds (eval/level-curves-2026-11-22.md). Even is the
default because no public file shows whether P6's own leveller reads curves.

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
**Microsoft Project work contours** (2026-11-21, `contours.mjs`): a Project
XML converted to an XER (`--to-p6`, the page's P6 button) now carries each
contoured assignment (back loaded, front loaded, double peak, early peak,
late peak, bell, turtle) as a P6 resource curve with Project's own shape,
named "MS Project Back Loaded" and so on, instead of an even spread. The
shapes were measured from Project's timephased work: ten equal segments of
the span at fixed percentages of the peak units (back loaded 10 15 25 50 50
75 75 100 100 100), with the span stretched to work / (units x mean). On all
19 contoured assignments in MPXJ's corpus the spread matches Project's to
0.035 h; P6's curves of the same names (what MPXJ reads a contour as) miss
by up to 15.8 h, an even spread by 31 h. MPXJ reads the written curves back
as the same shapes (eval/work-contours-2026-11-21.md).

**Resource curves in the Project XML** (2026-11-22, `curveRows` in
`curves.mjs`): the other way, an XER converted to Project XML (`--to-project`,
the page's Project button) now writes each unstarted assignment on a P6
resource curve as Project's timephased work in the curve's shape: rows of
remaining work cut at midnights and at the curve's twenty slice ends, each
row's work rounded to the second on the running total so the rows sum to the
remaining units exactly, with WorkContour 8 ("Contoured", Project's word for
an edited spread). Project has no curve table, and its built-in contours are
other shapes, so the rows are the faithful route. A curve that came from a
Project contour (`--to-p6`'s "MS Project Bell") goes back as that contour
number with the same rows, so a Project -> XER -> Project trip keeps it. On
the public hospital file all 33 unstarted curved assignments (PCO119,
Triangular Increase, Back Loaded, Front Loaded, Bell Shaped; up to 567 rows
each) give the earned-value spread day by day within 0.0003 h; on MPXJ's 19
contoured Project assignments the round trip keeps 19 of 19 contours and
Project's own cumulative work to 0.037 h (15 exactly), where it came back
flat before, up to 31 h off. MPXJ reads every written row and contour back,
66 of 66 assignments. Started assignments stay even, as in earned value: P6's
re-fit of a curve to the remaining units is in no public file
(eval/curves-to-project-2026-11-22.md).

`--hours` (page: *in labour hours*) reads labour hours even when cost is
loaded, which gives the manpower curve where a file's curves sit on hours.
`--even-spread` turns the curves off. A second, independent implementation
(PR 18131) gave the same planned value to the cent in 24 of 24 planted runs
(every assignment on Back Loaded, Front Loaded or Bell Shaped, in cost and in
hours, on four public files). Back and Front Loaded moved planned value by
equal and opposite amounts, and every curve closed on budget and EAC. Those
runs also found actuals on actual starts after the data date dropping off the
forecast line (97.32 h on the hospital file). They are now drawn at the data
date.

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

## Schedule health trend across updates (2026-11-22)

A lender's monitor or an owner's scheduler reading a job month after month
asks whether the schedule is getting better or worse, not only how far the
finish moved. Paid schedule-analytics subscriptions sell that trend. `trend.mjs`
(the page's windows section, under the windows; CLI `--trend u1.xer u2.xer
...`) takes the same series of updates and gives, per update in data-date
order: the 14 DCMA points (value, pass), the forecast finish and how far it
moved, open activities, how many sit on zero or negative float and within 10
working days of it, and **path kept**: of the previous update's driving-path
activities still open, the share still on the driving path (a path that
changes every month is one nobody can manage to). Then:

- **BEI and missed tasks against the first update**, not each file's planned
  dates. P6 resets an unstarted activity's planned dates to its early dates
  at every schedule run, so overdue work that has not started never counts
  as missed in a single file (quality audit 2026-11-19). Here an activity's
  baseline finish is its finish in the first update (actual, or the
  recomputed early finish); activities added later are counted apart.
- **What newly fails each point** in each update, by activity: what got worse
  this month.
- **Float erosion**: every activity open at the end and seen in three or more
  updates whose float fell, its float in each update, the loss per month
  fitted across them, the months to zero at that rate, and where the float
  went: its own forecast finish moving later, or its late finish moving
  earlier. The second can happen with nothing late: work under way whose
  successors are start-to-start has its late finish pulled in as its
  remaining duration shrinks (P6's rule; on the public CCA hospital file 15
  activities lose float that way in a series statused exactly as planned).

How it was checked (`eval/trend-check.mjs`,
`eval/trend-check-2026-11-22.md`): six public P6 files, each statused as
planned four times 20 working days apart. On all six the trend reads 0 missed
tasks and BEI 1.000 or more in every update, no finish movement and no
activity eroding because its own finish slipped; the single-file BEI on the
CCA file reads 0.662 on the original file for the reason above. With two
5-day slips planted in the second window over three seeds, the driving-path
slip is named as missed exactly in the updates where its baseline finish is
due (15 of 15), and the off-path slip is listed in the erosion exactly when
its float really fell over the series (9 of 9: it fell in 3, each by the 5
days typed; in the other 6 an FF predecessor or a constraint held the finish).

## Probabilistic branches in the risk run (2026-11-22)

A risk register adds delay to work that will happen. Some uncertainty is about
*which* work happens: an inspection passes, or rework and a re-test follow; a
permit comes through, or the redesign path runs; a pile test is good, or the
foundation is redesigned. Paid risk tools (Primavera Risk Analysis, Safran
Risk) model these as probabilistic branches, and this one did not. The XER
holds every path's activities in the network, so the single CPM date counts
the work of all of them, which overstates the finish when rework is unlikely
and hides how much the finish depends on one outcome.

Now the risk run takes branches, one per line:
`group, branch, probability[, activity ID ...]` (page: "Probabilistic
branches" under the risk register; CLI: `--branches branches.csv`). Lines
sharing a group are the alternatives at one point. In each run one branch per
group is drawn and the activities of the others are dropped from that run
(remaining duration 0, their logic kept, so the work after them waits only on
the rest of its logic), as those tools treat a branch activity that does not
exist in an iteration. A group's probabilities may sum to under 100%: the
remainder is the case where none of the listed activities happen, so
`Inspection, rework, 30%, A2010, A2020` alone is a complete branch. A group
with work already started on one branch has taken it (kept in every run, and
said so); started work on two branches leaves the group out. A risk event on
dropped work adds nothing in that run. Branches draw from their own random
stream, so adding them leaves every duration and event draw as it was.

The result gives each branch's drawn share and its finish shift (the mean
finish of the runs that took it minus the rest, ~ where within the noise of
the run count), on the page, the CLI, the JSON and the written review's risk
section. `risk.mjs`: `parseBranches(text)`, `riskAnalysis(xer, { branches })`,
`branchRows(result)`.

Checked: `risk.test.mjs` (a 30% rework branch moves the finish by exactly
its 5 days and is drawn in 30% of 2,000 runs within 3.5 points; P50 and P80
are the pass and rework finishes; the remainder; a started branch fixed; an
event on dropped work; unchanged draws). `eval/branches-check.mjs` on the six
public files, branches planted on each file's own driving path and every run's
finish checked against cpm.mjs scheduled directly with the dropped activity at
0 (eval/branches-2026-11-22.md). Not yet run on a real job's branch register
(none is public).

## Resource-levelled risk run (2026-11-22)

The CPM date assumes every crew can work on everything at once, and so does a
plain Monte Carlo over it: when two activities that share a crew of one both
run long, the plain run lets them overlap. Primavera Risk Analysis and Safran
Risk can level resources inside every iteration; this tool could level the
file once, or run the risk analysis without levelling, but not both together.

Now it can. Page: "Resource limits in each run: Level every run" in the risk
section (crew size, level within float and resource curves are taken from the
Resource levelling section). CLI: `--risk [N] --levelled [--crew 2]
[--within-float] [--curves]` (100 runs by default, since each run is a whole
levelling). `risk.mjs`: `riskAnalysis(xer, { level: true | { limitScale,
withinFloat, curves } })`.

In each run the sampled durations (and risk events, and the branches drawn)
go to `level.mjs` as `durations`, and the levelled finish is the run's finish.
An assignment that spans its activity stretches with the drawn duration at
the same rate per hour (same crew, longer work); an activity drawn to 0 (a
branch not taken) uses no crew. Every run is also scheduled without levelling
on the same draws (common random numbers), so `levelling.resourceDelay` (the
levelled finish minus the unlevelled one, run by run) is what the crew limits
cost, with no sampling noise between two separate runs. The driving path of a
levelled run (`level.levelledDrivingPath`) follows logic as before and, where
an activity starts on its levelling floor with no driving predecessor, crosses
to the activity sharing that resource whose use of it ended at that start, so
the criticality index counts the work a crew was waiting for. `pathCut` counts
runs where no such activity could be named (a floor set by a change in the
limit itself); `selfCheckMax` is level.mjs's self-check summed over each run
(hours a placed activity is over a limit; 0 when sound).

Checked (eval/risk-levelled-2026-11-22.md, `node eval/risk-levelled.mjs DIR`):
with every limit x1e6 the levelled run equals the plain run exactly, on every
percentile and every activity's criticality index, on all public files run;
at the file's own limits no run's levelling leaves a placed activity over a
limit (self-check 0 h in every run), no run finishes earlier levelled than
unlevelled; a wait's blocker went unnamed only on Expressway (17.5% of runs at
x4, where up to 409 activities a run stay over-allocated past the 30-year
horizon). On the 24.12 example file (26
labour resources at P6's default limit of 1 per hour): the limits add 29.8
working days at P80 (225.3 -> 255.1 days from the data date) and 28.4 on
average per run; doubling every crew still costs 27.1 days a run, and only at
four times the file's limits does the delay vanish (0 in 94% of runs), while
the levelled forecast at x2 is still 27 days later than at x4: the limits
matter far more than one levelled date at x1 suggests. `risk-levelled.test.mjs`
(drawn durations stretch assignments; a dropped activity uses no crew; the
path crosses the wait; x1e6 identity; the crew of one adds the shorter
activity in every run). On the hotel file at four times its limits the
limits add 251 to 286 working days to every run (P80 729.8 -> 1,005.3 days).
Not yet compared with a commercial tool's levelled
risk run (no public file carries one).

Guide (2026-11-23): `how-to-run-a-monte-carlo-schedule-risk-analysis-on-a-p6-schedule.html`;
its worked example (500 runs, seed 1, the page's defaults) is checked against the engine in
`guides.test.mjs`.

## Step by step: the events in the order they happened (2026-11-23)

A claim with several delay events needs each event's share of the delay.
"Each event alone" gives every event the days it would cause by itself, and
those add up to more than the total when events share the path. The common
answer in delay analysis is to insert the events **one at a time in the
order they happened**, recomputing after each, so each step is what that
event adds on top of the ones before it, and the steps add up to the total.

With two or more events in a fragnet the time impact analysis now does this.
The order is each event's earliest `Not before` date; an event with no date
keeps its place in the fragnet. Rows with no event are one more step, `(no
event)`, with a warning. Because a stepwise split depends on the order (the
first event to use up the float leaves the next one to reach the finish),
the same steps are also run newest first, and each event's days in that
order are shown beside its own, with its days alone; `orderSensitive` says
when the two orders disagree.

On the built-in example: the owner's change CO-03 (dated 2026-04-08) adds 3
working days, the late hardware approval 6 more, 9 in all; newest first the
hardware takes all 9 and CO-03 none. Alone they are 3 and 9.

Surfaces: page table "Step by step, in the order the events happened"
(event `tia_stepwise`), printable exhibit, CSV `step` rows, text, `--json`
(`byStep`, `orderSensitive`). `tia.mjs`: `stepsHtml(r)`.

Checked: `tia.test.mjs` (example steps; dates set the order, not row order;
series not order-sensitive; one event gives no steps; rows with no event
grouped) and `eval/tia-steps-check.mjs` on the six public files
(eval/tia-steps-check-2026-11-23.md): series on the driving path 19/19 with
the same split in both orders; an event beside another on the same path
31/31 against the split one-row runs predict, all 31 order-sensitive as the
arithmetic says; fragnets written newest first put in date order 26/26.
Not yet run on a real claim's dated event list; which order a contract or
tribunal prefers is not modelled.

## Delay by party: sole and concurrent delay in the time impact analysis (2026-11-23)

Most claims carry delays from both sides at once: an owner's change while the
contractor's crew is short. Each side asks how much of the delay would have
happened anyway had the other caused nothing. A fragnet row can now name a
`Party` (also read: Responsible, Caused by). Each party's rows are scheduled
alone and every row but that party's. A party's **sole delay** is the total
minus the run without it (the but-for answer); what is left is
**concurrent**: days either side's rows cause by themselves. The parts add to
the total by construction; negative concurrent days mean the delays compound
(one bites only once another has used the float). Rows with no party form
their own group, `(no party)`, with a warning. When a party runs alone, links
to another party's new activities are dropped, as for each event alone.

On the built-in example (`EXAMPLE_PARTY_FRAGNET`, page button "Example with
owner and contractor delays"): CO-03 (owner) alone 3 d, the contractor's
short-crewed level 1 rough-in alone 8 d, both 8 d: owner sole 0, contractor
sole 5, concurrent 3.

Surfaces: page table "Delay by party" (event `tia_party_split`), printable
exhibit, CSV rows (`party alone`, `without party`, `sole delay`,
`concurrent delay`), text, `--json` (`byParty`, `apportionment`). Guide:
`how-to-split-concurrent-delay-between-owner-and-contractor.html`.

Checked: `tia.test.mjs` (example split, series not concurrent, one party
owns all, unassigned rows grouped, cross-party links dropped) and
`eval/tia-party-check.mjs` on the six public files
(eval/tia-party-check-2026-11-23.md): series on the driving path 19/19 with 0
concurrent; owner lengthening an activity while the contractor adds a
parallel copy with extra days 31/31 against the split one-activity runs
predict; one party 30/30. Not yet run on a real claim's fragnet with parties;
whether the contract gives time, money or neither for concurrent days is not
modelled.

## Probabilistic branches in the time impact analysis (2026-11-22)

A fragnet is written as if the delay event will go one way. Often it will
not: the redesigned drawings go back for review and come back approved (5
days) or rejected and resubmitted (15 days and 4 days of rework); the late
hardware may or may not arrive late. A single-path TIA either picks one, and
argues about which, or stacks the worst case. Paid risk tools treat these as
probabilistic branches; the risk run here has had them since this morning
("Probabilistic branches in the risk run"), but the TIA did not.

Now the fragnet takes three more columns, found by name like the others:
`Branch group`, `Branch` and `Probability` (`70%`, `0.7` or `70`). Rows
sharing a group are alternatives, one of which happens; rows with no group are
in every outcome. A branch's probability may be written on any of its rows;
branches with none share what the given ones leave; given probabilities under
100% leave the rest to "none of these" (no row of the group happens); over
100% is refused. The same activity ID may be written on two branches with
different durations or logic, and a link from a common row to an activity
that exists only on a branch not taken is dropped in that outcome.

The TIA is deterministic, so there is nothing to sample: every combination of
branches (up to 512) is inserted and scheduled exactly as a plain fragnet is,
and the result gives the expected delay (each outcome's delay weighted by its
probability), P50 and P80, the range, the chance the finish moves at all, and
for each branch the expected delay if that branch happens (the swing between
a group's branches is what that decision is worth). The finish, milestones,
float and events above it are the run with the most likely branch of each
group, and say so. On the example office fit-out (a 70/30 review and a 40%
hardware delay) the most likely run says 3 working days and the expected
delay is 9.2, P80 18: a TIA that took the most likely path would understate
the request by two thirds.

Page: the same TIA box (a "Probabilistic branches" table above the fragnet);
CLI: `--tia fragnet.csv` reads the columns; the text, CSV (`branches`,
`branch` and `outcome` rows) and printable exhibit carry the section.
`tia.mjs`: `branchSetup(rows)`, `rowsForOutcome(rows, picks, codes)`, and
`timeImpact(...).branches`.

Checked: `tia.test.mjs` (a 30% hold moves the expectation by exactly 30% of
its days; the same ID on two branches; a link to a branch-only activity
dropped; two groups multiply and the probabilities add to 1; over 100%
refused; no branch columns leaves the result unchanged).
`eval/tia-branches-check.mjs` on the six public files, 48 planted fragnets
with two branch groups each: every one of 244 outcomes finishes where a
plain TIA of that outcome's rows does, the expectation equals the weighted
sum 48 of 48, the single result is the most likely branches 48 of 48
(eval/tia-branches-2026-11-22.md). Not yet run on a real job's fragnet with
alternatives; a TIA exhibit with branches is the next thing to read.

Guide (2026-11-23): `how-to-run-a-time-impact-analysis-on-a-p6-schedule.html`; its worked
example (the built-in fragnet) is checked against the engine in `guides.test.mjs`.

## Monthly schedule narrative (2026-11-22)

The contractor's side of the monthly update. Most contracts that call for a CPM schedule
also call for a written narrative with each update (USACE UFGS 01 32 01.00 10's narrative
report, many state DOT and private specifications), and schedulers build it by hand from P6
layouts. `narrative.mjs` drafts it from last month's and this month's file, in eight
sections: status against the must-finish date with the half-step split, the critical path
and what joined or left it, work started and finished, work forecast and not done, every
change to durations, logic, lags, constraints, calendars and activities, float used, the
next N weeks' work (a look-ahead, 4 by default), and edited or future actual dates. Every
date, activity and day count comes from the files; every cause and reason is a highlighted
`[FILL IN: ...]`, never a guess, because a narrative is a contract document. Page:
"Contractor's monthly schedule narrative" under the comparison (print, HTML, text). CLI:
`node cli.mjs current.xer --previous previous.xer --narrative narrative.html` (or `.txt`).
`compare()` now also returns `finish.vsMustFinish` and `prevVsMustFinish` (working days
past the must-finish date). Checked: `narrative.test.mjs`; `eval/narrative-check.mjs` on the
six public files, each statused 20 working days on with a planted slip on driving work and
a planted lag on an unstarted driving link (18 runs: every slip under planned work missed and
every lag under changes, each with a fill-in; one line per change the comparison found;
identity pair reports nothing; eval/narrative-check-2026-11-22.md). Not yet read by a real
scheduler or owner's reviewer; the hotel file had no driving work due in the window, so its
3 runs plant nothing. Guide: `how-to-write-a-monthly-construction-schedule-narrative.html`.

## Collapsed as-built: the "but for" date (2026-11-23)

`collapse.mjs`, `--collapse delays.csv [--csv collapse.csv] [--xer collapsed.xer] [--as-built-xer model.xer]`
(or `--as-built` with no list), and the page's **Collapsed as-built** section: the retrospective
delay method of AACE RP 29R-03, MIP 3.8 (modelled, subtractive, single simulation) and MIP 3.9
(the same, one group at a time). Where the time impact analysis adds a delay to the update in force
before it happened, this starts from what happened. The final update becomes a CPM model that lands
every activity on its actual dates: actual durations on each activity's calendar, the file's logic,
and where an activity started later than its logic needed, that wait (an *as-built gap*) added to
every lag into it, so the predecessor that drove it stays tight and the others keep their slack.
Then the listed delays come out (activity ID; working days, blank for the whole activity; `gap` to
take the days out of the wait before the activity instead of its duration; party; event) and the
model is recomputed: the finish with all of them out, with each party's out ("but for the owner" is
the date the contractor would have finished on its own), with each event's out, and the concurrent
days (parties alone minus all together). With no list it lists the gaps, where unrecorded delays
usually sit, with any constraint the file holds on that activity. The collapsed schedule and the
model download as XERs for P6.

Rules the model follows, each found by a planted case that failed without it (eval below):
time the successor's calendar cannot work is not a wait (a Saturday between a six-day predecessor
and a Sunday-to-Thursday successor, Expressway file); an activity that ran long only because a
finish-to-finish link held its finish keeps its planned duration and the link holds the finish
(hotel file, SS+60 d / FF+60 d pairs); as-late-as-possible activities stay ALAP, and their successors
read gaps from their early dates, as P6's forward pass does (hotel file, 20 ALAP activities); a
start constraint in the file whose date is on or before the actual start is kept as
start-on-or-after (the example's inspection booked for 2026-05-18: without it, taking out an
upstream slip slid the inspection earlier than the city allowed), and when that date is what held
the activity, the gap stays on the date, so `gap` moves the date. Progress, expected finish dates
and other constraints are removed; the model starts at the first actual start with nothing done.

How it was checked (`eval/collapse-check.mjs`, `eval/collapse-check-2026-11-23.md`): each public
file's main project finished as planned by status.mjs, with and without planted slips (1 to 3
activities in progress part-way through, 1 to 30 working days each) and planted waits (a
start-on-or-after hold 1 to 30 days past an activity's early start), so the "but for" date is the
run without them. Six files, seed 2, 10 plants each: as exported the model lands 21,404 of
21,422 activities on their dates (CCA 15,831 of 15,849) and every finish matches; finished as
planned, taking out exactly the planted slips gave back the finish without them 60 of 60 times,
planted waits taken out of the gap 60 of 60, the collapsed XER read back 60 of 60 (seed 1 on
five files: 50/50 each). 7 unit tests in `collapse.test.mjs`; the guide's worked example is
checked against the engine in `guides.test.mjs`.

## As-planned vs as-built: where the delay grew (2026-11-23)

`asplanned.mjs`, `--as-planned baseline.xer [--csv apab.csv]` (or `--as-planned target` to use the
final file's own Planned Start / Planned Finish), and the page's **As-planned vs as-built** section:
the observational, static method of AACE RP 29R-03, MIP 3.1 (gross) and 3.2 (periodic, one period
here). Nothing is rescheduled. The as-built critical path is found from the record, not by eye: the
collapsed as-built's model lands every activity on its actual dates with the file's logic, and the
path is the chain of tight links into the actual finish. Walking it, each step is a change in the
variance (actual minus planned, working days of the project calendar): a **late start** (the gap
after the driving predecessor grew; on an FF or SF link the driven point is the finish), a **longer
duration** (named with the predecessor when a finish-to-finish link held the finish), or, negative,
a **planned gap used up** or a **shorter duration**. The steps telescope, so with the float the plan
gave the path's last activity they add up to the project's delay exactly. Activities added after
the plan have no planned dates; the step across them is reported on the next planned activity with
their IDs. Also: every milestone planned vs actual, every overrun, activities added and deleted,
and how many as-built critical activities were on the plan's critical path.

Rules, each from a planted case that failed without it (eval below): a step is measured as the link
sees it, on the successor's own calendar, and the remainder against the project calendar is shown
as a **calendar** step (Expressway, a six-day predecessor into a Sunday-to-Thursday milestone over
FS-1d; hotel, a 08:00-17:00 crew starting at 16:00 after an 08:00-16:00 predecessor); of several
tight links the walk takes one into the point that drives the rest of the path (an FF link that
held the finish over a tight SS), then the predecessor that slipped most against the plan, and passes
over as-late-as-possible predecessors (placed by their successor, they never drive it); at an
as-late-as-possible activity, where no link is tight, it follows the predecessor with least slack.
The cpm.mjs driving path stops at an ALAP finish milestone (hotel file: 1 activity), so every
activity finishing on the finish date is tried and the longest chain kept.

How it was checked (`eval/asplanned-check.mjs`, `eval/asplanned-check-2026-11-23.md`): each public file is taken as the plan and
finished as planned by status.mjs, with and without planted slips (1 to 3 activities in progress
part-way through, 1 to 30 working days) and planted waits (a start-on-or-after hold 1 to 30 days
past an activity's early start). Six files, seed 2, 10 plants each: built to plan, no delay and no
step on 6/6; every positive step on a slipped activity (or named as held by an FF link, or a
calendar step) 59/60, the miss a 0.1-day residue on hotel with a mid-day data date; steps add up to
the delay 60/60; planted waits 60/60, the 25 on the as-built critical path each measuring exactly
its planted days. Seed 1 on five files: 50/50 and 50/50. The files' own Planned Start / Finish mode
adds up on 6/6. 6 unit tests in `asplanned.test.mjs`; the guide's worked example is checked against
the engine in `guides.test.mjs`.

## GAO Schedule Assessment Guide scorecard (2026-11-23)

`gao.mjs`, `--gao [--baseline baseline.xer] [--csv gao.csv] [--html gao.html]`, and the page's
**Score against the GAO guide**: the ten best practices of the GAO Schedule Assessment Guide
(GAO-16-89G, December 2015), the assessment US federal auditors read a programme's schedule
against, under its four characteristics (comprehensive: practices 1, 3, 4; well-constructed: 2,
6, 7; credible: 5, 8; controlled: 9, 10). Each practice is a short list of tests the file can
answer, each with its threshold beside it and the activities behind every failure. The DCMA
points feed in where they measure the same thing (logic, leads, lags, relationship types and
hard constraints under practice 2; float under 7). New tests, which the 14 points do not have:
open work filed on the project node rather than a WBS element, activity names that repeat, a
finish milestone; resources on open work with no maximum units to level against; unstarted
zero-duration tasks and tasks under half a day; milestones not driven by the work they summarise;
a driving path of work from the data date, with no date constraint or lag on it, and P6's own
longest-path flags agreeing with the logic; durations or lags edited since the last schedule run.
With the baseline project's XER, practice 10 traces activities to it by ID and counts missed
tasks and BEI against its dates instead of the planned dates P6 resets.

A practice's rating is only the share of its tests passed (all: Fully met; three quarters:
Substantially; half: Partially; any: Minimally; none: Not met), and a characteristic is the
rounded average of its practices, the roll-up GAO's reports use. GAO's auditors rate on
evidence beyond the file, and the guide sets practices, not numeric limits, so the scorecard
says the thresholds are the tool's. There is no single overall rating: one unmet practice would
average away. The headline is how many of the four characteristics are at least substantially
met, and the weakest. Practice 8 (a schedule risk analysis) is evidence outside the file: it is
rated only when the file carries three-point duration UDFs, and then on their coverage.

Checked (`eval/gao-check.mjs`, `eval/gao-check-2026-11-23.md`): on the six public P6 files, one
fault of each new kind planted at random per seed (5 seeds; 2 on the 16,000-activity CCA file),
the planted activity named under its own test **129 of 129** times; what each file scores is in
the note. The guide page's worked example is the engine's own output on the built-in example
(`guides.test.mjs`).

## Critical path drag and drag cost (2026-11-22)

`drag.mjs`, `--drag [--drag-cost 12500] [--csv drag.csv]`, and the page's **Find critical path
drag**: which critical activity is worth accelerating. Every critical activity has the same total
float, so float cannot rank them; Devaux's drag can. An activity's drag is how much earlier the
forecast finish would be if it took no time, everything else as is: the most accelerating it can
ever win. Drag cost is drag in calendar days times a typed cost per day of finish (liquidated
damages, extended general conditions). P6 and Microsoft Project do not compute it.

How: each open activity on the longest path (every driving chain into the finish,
`floatpaths.mjs`) is rescheduled at zero remaining duration with `cpm.mjs` (calendars, lag
calendars, SS/FF/SF, constraints, progress, retained logic as everywhere else), and each lag
between them at zero. Negative drag is **reverse drag** (the path enters at the finish by FF and
leaves at the start by SS: shortening moves the finish later), flagged. A drag below the remaining
duration names the parallel path that takes over. A bisection finds the least shortening that wins
the whole drag, since on real calendars the gain can come in steps. An expected finish date in use
overrides a shorter duration, and the row says so.

Checked (eval/drag-check-2026-11-22.md): equal to an independent longest-path oracle (sharing no
code with `cpm.mjs`) on 2,477 of 2,477 activities in 200 random networks, `shortenForHours` too; on
the six public files, shortening each activity by its drag moves the finish by exactly the drag
for 47 of 50 (the 3 explained: an expected finish, a different calendar, a stepped gain). The files
show equal parallel chains (terminal-building-airport: 33 longest-path activities, one with drag)
and reverse drag in practice (hotel-project HEPSS00010/20, -111 and -117 working days). CCA's
19,822 activities take 105 reschedules, 11.7 s in Node. Not compared with a commercial drag
calculation (none public for these files). Guide: `how-to-find-critical-path-drag-in-a-p6-schedule.html`.

## Joint acceleration: the cheapest set to shorten together (2026-11-22)

`crash.mjs`, `--crash [--crash-target 20] [--crash-data rates.csv] [--crash-max 0.25]`, and the
page's **Find the cheapest acceleration** (under drag). Drag is one activity at a time, so where
parallel chains of equal length run side by side it is 0 for each of them: terminal-building-airport
has 33 longest-path activities and one with drag (1 day). Shortening several together still wins
time, and which ones is a minimum cut: the cheapest set of activities that every driving chain into
the finish passes through. Each step takes the driving network from this tool's P6 engine, builds an
event graph on it (start and finish of each activity, FS/SS/FF/SF links between the ends they join),
finds the minimum cut by max flow, shortens the cut together by the least working time that wins
what the step can (up to a day), and reschedules to measure the gain. A cut may also give back time
bought at an earlier step (Phillips and Dessouky's un-crashing). Rates CSV: `activity_id,
max_shorten_days, cost_per_day`; without one each task may lose 25% of its remaining duration at 1
per day, so the cost counts activity-days shortened. With `--drag-cost` it stops where a day costs
more to win than a day of finish is worth. Milestones, mandatory constraints and expected-finish
activities are never shortened.

Checked (eval/crash-check-2026-11-22.md): against brute force over every whole-day combination on
random finish-to-start networks, every step cost the least its gain can cost (14,212 step points in
2,100 networks) and every run reached the most the oracle can win. On 3,000 bridge networks giving
time back matters: without it 69 of 15,283 step points paid more than the optimum (up to 19%); with
it none did. On the six public files with the default room and a 20-day target: terminal-building-
airport 20 days (best single drag 1 day, up to 3 activities at once), hotel-project 13.75 (drag 1),
Expressway 20 (drag 5; 23 parallel fabrication chains cut together), CCA 13 (drag 5.65); every
reported finish matches a fresh schedule with the chosen shortenings. Not compared with a commercial
crashing tool (none public for these files).

SS, FF and SF links (eval/crash-oracle-links-2026-11-22.md): the same brute force on 5,000 random
networks with every P6 relationship type and whole-day lags and leads found two faults, both fixed:
a start pulled back from an FF-driven finish that also sits on the data date, and a start driven by
a link while its finish is driven by an SF tie. Before, 268 networks stopped short or overpaid (up
to 150%); now all 12,791 step points are at the optimum and every run reaches the oracle's most.
The six public files' results are unchanged.

## XER to Excel workbook (2026-11-22)

`excel.mjs`, `--excel out.xlsx [--raw]`, and the page's **Download for Excel (.xlsx)**: the XER as a
workbook with every P6 internal id resolved (activity IDs, WBS paths, calendar, resource and code
names). Sheets: Read me; Activities (WBS path, type, status, calendar, original and remaining
duration and total and free float in days of each activity's own calendar, start/finish, actual,
early, late and planned dates as Excel dates, constraints, predecessors and successors as
`A1010 FS+2d`, the recomputed dates and float beside P6's with Float Agrees, one column per activity
code type and per activity UDF); Relationships (lag in days and hours); WBS; Resources; Assignments
(units and cost: budgeted, actual, remaining, at completion); Expenses; Calendars; Activity codes.
`--raw` adds every XER table as it is, one sheet each. Header rows frozen, filters on. No
dependencies: a small zip writer (deflate through the platform's `CompressionStream`, stored where
none) and inline-string cells; the same input gives the same bytes.

Checked (eval/excel-check-2026-11-22.md): `eval/excel-check.py`, a separate Python reader sharing no
code with the tool, parses each of the six public XERs itself and reads the workbook with openpyxl:
6,239,763 of 6,239,763 values equal on 21,758 activities and 56,666 relationships (stored dates to
the minute, durations and float to 0.005 day, codes, UDFs, links, assignments, and every raw
table cell). The Float Agrees column says yes on 14,268 of 14,270 open activities of the
16,000-activity hospital file (the 2 behind the lag lengthened after P6's last run, as in
eval/cpm-vs-p6-2026-11-19.md) and on all open activities with stored float in the other five.
Not yet opened in desktop Excel itself (none here); openpyxl reads it with no warning. Guide:
`how-to-convert-an-xer-file-to-excel.html`.

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
| Opening the XER in Excel as text, or P6's own Export to Excel | The text shows P6's tables stacked one after another, linked by internal numbers; P6's export needs a P6 seat | An .xlsx with one sheet per table and every id turned into the name P6 shows, durations and float in days, real dates, logic as `A1010 FS+2d`, codes and UDFs as columns, and the recomputed float beside P6's, free and in the browser |
| A look-ahead made by hand (a filtered P6 layout printed to PDF, or copied into Excel each week) | Works for whoever holds P6 or has the time to copy dates | The 1-6 week sheet straight from the XER, with what each activity waits on and the date it is due, open starts and out-of-sequence work named, printable and as CSV, with no P6 seat |
| A constraints log in Excel, or a Last Planner board (sticky notes, or paid tools such as Touchplan or vPlanner) | Tracks what each task waits on, kept apart from the schedule; the paid boards need their own plan entered | The same spreadsheet merged with the P6 schedule: the date each row is needed by from the recomputed dates, late and overdue rows named, and how far the finish moves if the log holds, row by row, free and in the browser |
| P6's own Level Resources | Levels in P6 for people who hold a P6 seat; changes the schedule in the database | The levelled finish, who moved and why, and a crew-size what-if from the XER, without P6 and without touching the contractor's file |
| Paid schedule-risk products (Primavera Risk Analysis, Deltek Acumen Risk, Safran Risk and similar) | Monte Carlo on a P6 schedule with risk registers, desktop licence per seat | P50 / P80, criticality and a risk register (probability x impact on named activities, contingency at P80, events ranked) from the XER in a browser tab, free, with ranges read from the file's own UDFs and probabilistic branches (one path per group drawn each run, each branch's finish shift measured); no resource model |
| A time impact analysis done by hand in P6 (copy the update, type the fragnet in, reschedule, compare the finish), or bought from a claims consultant | Needs a P6 seat and an afternoon per event; consultants charge by the hour | The fragnet as a table, the finish and every milestone's move, float used, each event alone and their overlap, each party's sole and concurrent delay, a printable exhibit and the impacted XER for P6, in a browser tab, free |
| Paid XER-to-Project converters, or MPXJ-based tools you install with Java | Convert the file on your machine or a server, often per seat | The Microsoft Project XML straight from the XER in a browser tab, free, nothing uploaded, with a list of what Project will schedule differently for this file (lag calendars, level of effort, milestones, external dates), checked activity by activity against MPXJ's own reading |
| Paid Project-to-P6 converters, or importing the .mpp into P6 (needs a P6 seat and Project installed on the same machine), or retyping the schedule | Get a Project plan into P6 for an owner or GC who asks for an XER | An XER P6's import takes, straight from the Project XML in a browser tab, free, nothing uploaded: every id renumbered, every field P6 20.12 writes, one project node, Number, Cost and Date columns as named P6 user-defined fields, Project's scheduling options so P6's first run gives Project's dates, task notes as P6 notebook entries under their topics, cost resources and fixed costs as P6 expenses, deadlines as finish-on-or-before constraints on request (so P6's float counts down to them as Project's slack does), and a list of what is not carried (elapsed lags, splits) |
| Accelerating by hand: pick the longest critical activity, add overtime, reschedule in P6 and see; or a paid tool that computes drag (Spider Project) | Trial and error in a P6 seat; most crews shorten an activity that a parallel path then caps | Drag and drag cost for every longest-path activity and lag from the XER, free in the browser: how many days each one really holds the finish, what that costs per your daily rate, which parallel path takes over, and reverse drag flagged |
| Crashing by hand: add overtime to the longest critical activity, reschedule, repeat; or the time-cost trade-off in a textbook spreadsheet that ignores P6 calendars and SS/FF links | Finds the obvious single activities; misses that parallel chains must be shortened together and pays twice for time a later step makes useless | The cheapest set to shorten together at each step from the XER, rescheduled on P6's own rules, with time bought earlier given back when it stops helping, priced from your rates and stopped where a day costs more than it saves |
| A narrative written by hand each month from P6 layouts and last month's report | Whatever the scheduler copies across; slow, and easy to miss a change the owner's reviewer will find | The draft narrative from the two XERs: status, critical path, work done and missed, every change with a fill-in for its reason, float, next period, free and in the browser |
| Paid XER viewers (desktop readers sold per seat or per year) or asking the contractor for a PDF of their layout | Show the activities and bars from an XER without P6; a PDF is whatever layout the contractor chose | The WBS tree and bars in a browser tab, free, with level of effort and WBS summary dates as P6 gives them (305 of 305 on the public files), the baseline bar and finish variance per activity, critical or longest-path colouring, printable and as CSV |
| A schedule-quality trend from a paid analytics subscription, or a spreadsheet of each month's DCMA scores kept by hand | Per-update quality scores and float trends, per project or per seat, or whatever the scheduler copies across | The DCMA points, critical counts and driving-path churn for every update at once, BEI against the first update rather than the planned dates P6 resets, what newly fails each month by activity, and the activities losing float with months to zero, free in the browser |
| An as-planned vs as-built exhibit made by hand (baseline and final update printed side by side, a critical path picked by eye, bars coloured in Excel), or billed by a claims consultant | Shows the plan beside the record; the path and the attribution are argued about because nobody can see how they were picked | The as-built critical path found from the actual dates (a model that lands every activity on them), the plan beside actual activity by activity, and the delay split into late starts, longer durations and planned gaps used up that add up exactly to the delay, free in the browser |
| A collapsed as-built built by hand by a claims consultant (actual durations typed in, "as-built lags" set link by link until the dates line up, delays deleted, rescheduled in P6), billed by the hour | A model that may or may not reproduce the as-built dates, often not shown; a week of expert time per analysis | The model from the final XER in seconds, with a count of how many activities it lands on their as-built dates; the but-for finish by party and by event and the concurrent days; every as-built gap listed; the model and the collapsed schedule as XERs to check in P6 |
| A GAO Schedule Assessment Guide review done by hand (layouts filtered practice by practice), or a paid analytics product's GAO metric library | An auditor's or scheduler's afternoon per update; a per-seat licence | The ten practices scored from the XER, every test with its threshold and the activities behind each failure, practice 10 against the real baseline file, a printable scorecard and CSV, free in the browser |
| Paid schedule-analysis products (Deltek Acumen Fuse, SmartPM, Schedule Analyzer and similar) | Full schedule analytics, desktop or subscription, licence per seat | Free, nothing to install, the file never leaves the browser (owners' schedules are often confidential) |
| P6 Professional's own schedule check | Built into P6 for people who hold a P6 licence | Works for the many who receive XER files without a P6 seat: owners, lenders, subcontractors, claims consultants |
| Open-source XER libraries and checkers (Python packages, local web apps) | A parser or a few checks; you install and run them | All 14 points plus a critical path test on a recomputed schedule, measured against P6's own numbers, in a page |
| A spreadsheet export | Whatever formulas you write | Calendars, lags, constraints and progress handled the way P6 handles them |

**Path to revenue (payment rails off, nothing live):** free tool and lead magnet
for schedule review. The written review (PDF via print) now ships free.
Natural paid paths, each needing the owner: a branded or white-label review for
consultancies; a period-by-period windows analysis across a whole
project's updates for delay claims; a collapsed as-built or as-planned vs as-built exhibit for a claim; and the review itself as a service.

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
  `{ allResources: true }` (`--all-resources`) writes resources with no
  assignment too;
  `{ outlineCodes: true }` (`--outline-codes`, a box on the page) writes the
  10 most assigned code types as Outline Code1..10 instead, each with a
  lookup table holding the type's P6 tree and descriptions
  (`outlineCodeFields`), and `mspdi.mjs` reads outline codes back as a code
  tree; level of
  effort as manual tasks with their links in the notes; warnings for what
  Project schedules differently. `mspdi.mjs` reads task text fields back as
  activity codes. Activity UDFs (`udfFields`): integer and decimal UDFs in
  Number1..20, cost UDFs in Cost1..10 (hundredths), start-date UDFs in
  Date1..10, finish-date UDFs in Finish1..10 (task and resource), text UDFs in the Text fields codes leave free, each named after the UDF;
  codes and text UDFs share the 29 Text fields by how many activities each
  fills. `mspdi.mjs` reads Number, Cost, Date and Start fields back as UDFs
  (Finish fields as finish-date UDFs), so a
  Project file's own Number fields feed the risk run's ranges too.
- `cpm.mjs`: forward and backward passes on each activity's own calendar: FS,
  SS, FF and SF links with lags on the project's lag calendar; total float as
  finish, start or smallest float; retained logic or progress override; planned
  start and must-finish-by; primary and secondary constraints including as late
  as possible; external dates; loops found and reported (Tarjan). Also free
  float and the driving path. Level of effort and WBS summary activities are
  left out of the network.
- `floatpaths.mjs`: the longest path (every driving branch into the project
- `collapse.mjs` `collapsedAsBuilt(xer, delays, { projId })` returns `{ project, asBuilt: { start, finish, modelFinish, activities, reproduced, misses, gaps: [{ code, name, days, after, constraint, onPath }], outOfSequence, drivingPath }, all: { finish, earlierDays, drivingPath }, milestones, byParty, byEvent, concurrentDays, rows, warnings, asBuiltXer, collapsedXer }`; `parseDelays(text)`, `asBuiltModel(xer)`, `collapsedText(r)`, `collapsedCsv(r)`, `collapsedTableHtml(r)`. CLI: `node cli.mjs final.xer --collapse delays.csv [--csv] [--xer collapsed.xer] [--as-built-xer model.xer] [--json]` or `--as-built`.
- `asplanned.mjs` `asPlannedVsAsBuilt(finalXer, planXer | null, { projId, planProjId })` returns `{ project, plan: { source, start, finish }, asBuilt: { start, finish, reproduced, activities }, delayDays, path: [{ code, name, link, plannedStart, plannedFinish, actualStart, actualFinish, plannedDays, actualDays, startVariance, finishVariance, waitDays, durationDays, calendarDays, heldBy, plannedFloat, plannedCritical, through, added }], floatTerm, tail, sum, plannedCritical, milestones, overruns, late, added, deleted, warnings }`; `delaySteps(r)`, `asPlannedText(r)`, `asPlannedCsv(r)`, `asPlannedTableHtml(r)`. CLI: `node cli.mjs final.xer --as-planned baseline.xer [--csv] [--json]` or `--as-planned target`.
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
- `trend.mjs`: schedule health across a series of updates: DCMA points per
  update, critical and near-critical counts, driving path kept, BEI and
  missed tasks against the first update, newly failing activities per point,
  float erosion with months to zero and its cause.
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
node cli.mjs schedule.xer --level [--crew 2] [--within-float] [--curves] [--csv levelled.csv] [--json]   # resource levelling
node cli.mjs this-month.xer --previous last-month.xer [--json] [--csv changes.csv] [--project CODE]
node cli.mjs update.xer --tia fragnet.csv [--csv impact.csv] [--html tia.html] [--xer impacted.xer] [--event NAME] [--by NAME] [--json]   # time impact analysis
node cli.mjs final.xer --collapse delays.csv [--csv collapse.csv] [--xer collapsed.xer] [--as-built-xer model.xer] [--json]   # collapsed as-built (but-for)
node cli.mjs --windows jan.xer feb.xer mar.xer apr.xer [--json] [--csv windows.csv] [--project CODE]
node cli.mjs --trend jan.xer feb.xer mar.xer apr.xer [--json] [--csv trend.csv] [--project CODE]   # schedule health trend
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
  under Project's rules the same on 19,822 of 19,822 (`eval/msproject-latedates-2026-11-22.md`). Not imported into P6
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
  Project's rules the schedule is the same on 19,822 of 19,822 open activities
  (`eval/msproject-latedates-2026-11-22.md`: the last 4 were a P6 rule Project
  lacks: a started activity with no remaining duration whose labour row still
  runs gets its late start rolled up from the assignment; the converter names
  such activities, 2 in CCA). MPXJ
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
- **Resource notes** (`eval/resource-notes-2026-11-21.md`, 2026-11-21): P6's
  resource notes (`RSRC.rsrc_notes`) are written as each resource's Notes in
  the Project XML, and a Project resource's Notes come back as `rsrc_notes`
  (P6 Web's HTML). 241 of 241 planted notes (P6 desktop DHTML, P6 Web HTML
  and plain text) on five public files read as meant in the XML and come back
  on the same resource ID; 17 of 17 resource notes in MPXJ's Project corpus
  reach the XER, and MPXJ reads all 17 with the same words and lines from
  both files. A cost resource's note is reported as not carried (P6 expenses
  have no notes). No public P6 file has a resource note with text, only
  empty editor shells, which write nothing. Before, both directions dropped
  every resource note with no warning.
- **Resources with no assignment** (`eval/all-resources-2026-11-21.md`,
  2026-11-21): `{ allResources: true }` (`--all-resources`, a box on the page)
  writes every resource in the file to Project XML, not only those the
  project's activities use, with its calendar, notes and fields; the default
  now warns how many it left out (before: silently). A Project file through
  the XER and back keeps 890 of 890 work and material resources in MPXJ's
  corpus (408 by default) and 17 of 17 resource notes (6 by default); on six
  public P6 files all 502 resources (33 unassigned) come back on the same
  resource ID, with no assignment changed and no P6 import problem.
- **Resource hierarchy** (`eval/resource-hierarchy-2026-11-22.md`, 2026-11-22):
  P6's resource tree (`RSRC.parent_rsrc_id`: a crew under a trade under
  Labour) is written as each resource's Group in Project XML, the parents'
  resource IDs from the top joined by "/" (`LAB/CARP`), and a Project
  resource's Group is read back into parent resources (one labour resource
  per step the file does not already hold; links that would loop are left
  out and counted). On five public P6 files with resources, 461 of 502 sit
  under a parent, up to three levels deep; every written resource's Group
  matches its tree, and through Project XML and back every resource keeps its
  parent path (469 of 469 by default, the 33 unassigned parents rebuilt from
  the paths and named by their IDs; 502 of 502 with `--all-resources`, names
  kept), with no P6 import problem. 14 of 14 Groups on work resources in
  MPXJ's Project corpus come back. Before, the tree was dropped both ways
  with no warning.
- **Start and finish custom fields** (`eval/finish-udfs-2026-11-22.md`,
  2026-11-22): P6's finish-date UDFs go to Project's Finish1..10 fields (start
  dates stay in Date1..10) and come back as finish-date UDFs, and Project's
  own Start1..10 and Finish1..10 fields now come into P6 as start- and
  finish-date UDFs. MPXJ's task-starts and task-finishes files, saved by
  Project 2003 to 2019 (12 files, 120 values): 120 of 120 read with the right
  kind, written to the XER, and back in a Project field of the same kind;
  before, 0 of 120 were carried. CCA's 182 values in its two finish-date UDFs
  return as finish-date UDFs, 182 of 182; before, all 182 came back as start
  dates. CCA's numeric, cost and date UDFs now keep P6's own type on 7,104 of
  13,174 values, measured against P6's type (the old check had mapped finish
  to start first; on that honest measure main scored 6,922).
- **Interim plans named, and left out on request**
  (`eval/interim-plans-2026-11-22.md`, 2026-11-22): Project's Set Baseline >
  Interim plan stores its copy in a Start/Finish pair, which the line above
  would carry into P6 as two date UDFs. A pair with no alias, on the same
  tasks, start never after finish, is now named in the warnings, and
  `--no-interim` (the page's "leave out interim plans") drops it;
  `--skip-fields Start1,Finish1` drops any named field. 354 of 354 planted
  plans on MPXJ's Project files named and dropped with every other UDF value
  unchanged; 0 named on the 143 files as saved. A planner's own unaliased
  pair looks the same, so the default still keeps it.
- **UDF types from the original XER** (`eval/udf-types-from-2026-11-22.md`,
  2026-11-22): Project has one kind of Number field, so a P6 decimal UDF that
  held only whole numbers came back as an integer one (P6 then refuses a 37.5
  typed into it). Given the XER the Project file was made from
  (`--to-p6 out.xer --types-from original.xer`, or the page's "original XER"
  box), each UDF matched by title keeps its P6 type: decimal or integer,
  start or finish date; an integer type is not taken where a value is no
  longer whole. CCA's activity UDF values with P6's own type: 7,104 to
  13,174 of 13,174 (six percent-complete and number fields, 6,070 values);
  0 import problems on the six public files.
  Text UDFs too (`eval/udf-type-hints-2026-11-22.md`, 2026-11-22): Project
  holds them in Text fields, which came back as activity codes; with the
  original XER a task Text field titled as one of its text UDFs (and not as
  one of its code types) comes back as a text UDF. CCA and Expressway through
  Project XML and back: 28,850 text UDF values no longer become codes, so
  42,847 of 42,847 carried UDF values return as UDFs with P6's own type
  (13,997 with the number types alone, 7,927 with neither); real code
  assignments unchanged (273,917); 0 import problems. MPXJ reads the same
  42,847 values with the same data type on 26 of 26 fields.
- **Resource user-defined fields** (`eval/rsrc-udfs-2026-11-21.md`, 2026-11-21):
  resource UDFs go into Project's resource Text, Number, Cost and Date fields,
  renamed to each UDF's title, and come back from a Project file as P6
  resource UDFs. Through XML and back to an XER, 330 of 330 values return the
  same on the same resource: the 87 real text values on the public 24.12 file
  and 243 with planted cost, date and number UDFs. MPXJ 16.10 reads 330 of 330
  cells from the XML and from the XER, and 12 of 12 field names. A finish-date
  UDF goes to a resource Finish field and comes back as a finish-date UDF
  (2026-11-22, `eval/finish-udfs-2026-11-22.md`). Before, all
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
(`p6XerText`; `node cli.mjs file.xml --to-p6 out.xer [--project-id CODE] [--deadlines] [--types-from original.xer]`);
`eval/p6xer-check.mjs` checks it on MSPDI files and on XERs sent through
Project XML, `eval/p6xer-mpxj.py` compares MPXJ's reading of the XML and the XER.
`excel.mjs` writes an XER as an Excel workbook (`xerToXlsx`; `node cli.mjs file.xer --excel out.xlsx [--raw]`);
`eval/excel-check.py` reads it back with openpyxl against its own XER reader.
`drag.mjs` computes critical path drag and drag cost (`dragAnalysis`; `node cli.mjs file.xer --drag [--drag-cost N]`);
`eval/drag-check.mjs` runs it on the public files with a shorten-by-drag consistency check.
`crash.mjs` finds the cheapest set of activities to shorten together, step by step (`crashAnalysis`; `node cli.mjs file.xer --crash [--crash-target D] [--crash-data rates.csv]`);
`eval/crash-check.mjs` runs it on the public files with a replay check; `eval/crash-oracle.mjs`, `eval/crash-oracle-links.mjs` (SS/FF/SF links and lags) and `eval/crash-bridge.mjs` score it against brute force.
`asplanned.mjs` lays a baseline beside the as-built along the as-built critical path (`asPlannedVsAsBuilt`; `node cli.mjs final.xer --as-planned baseline.xer`);
`eval/asplanned-check.mjs` checks it on the public files with planted slips and waits.
`samples/constraints-log.csv` is a constraints log for the example schedule
(the page's "Example log" button); `eval/constraints-check.mjs` plants logs on
real files and checks the what-if against P6 start-on-or-after constraints.

## Disclaimer

Provided free and as-is, without warranty. Not engineering, legal, contractual
or scheduling advice; it does not replace a qualified scheduler or the
scheduling software of record. Not affiliated with Oracle, Primavera, Microsoft or the
Defense Contract Management Agency; Primavera, P6 and Microsoft Project are
named only to describe the file formats.
