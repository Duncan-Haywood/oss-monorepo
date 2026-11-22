# XER to Microsoft Project XML, checked two ways, 2026-11-21

**Question.** People who receive a Primavera P6 schedule (an XER) often hold
Microsoft Project and no P6 seat. Does `msproject.mjs` write a Microsoft
Project XML (MSPDI) file that carries the whole schedule, and that Project-style
readers read the way P6 wrote it?

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md` (P6 5.0 to
24.12, fetched for this check and not committed). For the hotel file, which
holds four projects, the converter takes the largest (HBTF-2).

## 1. Read back with this tool's own MSPDI reader

`node eval/msproject-check.mjs <dir> --json eval/msproject-check-2026-11-21.json`
writes each file, reads it back with `mspdi.mjs` (the reader whose dates match
Project's own on 2,442 of 2,491 tasks in 102 files saved by Project), and checks:

- every activity: name, status, remaining duration to the half-minute, actual
  start and finish, constraint type and date, baseline (planned) start and
  finish, and its calendar's working periods on every day from a month before
  the earliest date to a year after the latest;
- every relationship: predecessor, successor, type and lag;
- the schedule: the original XER recomputed under Project's rules (lags on the
  successor's calendar, smallest of start and finish float, retained logic, no
  must-finish date, no expected finish, a milestone with a predecessor sitting
  at its finish) against the read-back file, both through `cpm.mjs`; early
  finish, late finish and total float must all agree.

| File | P6 | Activities | LOE / WBS summary | All fields intact | Links kept | LOE links in notes | Schedule equal (Project's rules) | Early finish equal (P6's options) | All three equal (P6's options) | Size, time |
|---|---|---|---|---|---|---|---|---|---|---|
| CCA | 6.0 | 15,849 | 297 | 15,849 | 45,483 / 45,483 | 1,790 / 1,790 | 14,266 / 14,270 | 8,560 | 5,979 | 46.5 MB, 3.3 s |
| Expressway | 7.0 | 823 | 0 | 823 | 1,094 / 1,094 | - | 823 / 823 | 820 | 818 | 3.0 MB, 0.2 s |
| example | 24.12 | 425 | 10 | 425 | 555 / 555 | - | 404 / 404 | 404 | 0 | 1.5 MB, 0.1 s |
| hotel (HBTF-2) | 6.0 | 4,217 | 0 | 4,217 | 7,586 / 7,586 | - | 4,217 / 4,217 | 2,281 | 132 | 8.2 MB, 0.5 s |
| sample | 20.12 | 42 | 10 | 42 | 41 / 41 | 20 / 20 | 42 / 42 | 38 | 36 | 0.1 MB, <0.01 s |
| terminal | 5.0 | 66 | 0 | 66 | 84 / 84 | - | 66 / 66 | 66 | 1 | 0.2 MB, 0.02 s |
| **Total** | | **21,422** | 317 | **21,422** | **54,843 / 54,843** | 1,810 / 1,810 | **19,818 / 19,822** | 12,169 | 6,966 | |

Nothing is lost: every activity's fields, every link and every calendar day come
back as P6 wrote them. Links into or out of a level of effort or WBS summary
activity are the one exception by design (below): they are written into that
task's notes, and all 1,810 are found there.

**The schedule under Project's rules is the same one** on 19,818 of 19,822 open
activities. The 4 that differ are in-progress activities in the CCA file, which
is out of sequence on more than 2,000 links; only their late dates differ (early
finish agrees on all 14,270). Two guesses were tested and ruled out: the Resume
date the writer adds (clearing it changes nothing) and the at-completion duration
of in-progress work (putting P6's planned duration back changes nothing). They
are left open. *Traced 2026-11-22* (`eval/msproject-latedates-2026-11-22.md`):
a P6 rule Project does not have (a zero-duration activity's late start rolled
up from an assignment still running); with it off under Project's rules the
schedule is the same on 19,822 of 19,822, and the converter now names such
activities.

**Under P6's own options the dates move**, which is what someone opening the file
in Project should expect: early finish stays put on 12,169 of 19,822 activities,
and all three values on 6,966. Total float moves most because Project's float is
the smaller of start and finish float and has no must-finish-by date; early dates
move where lags join activities on different calendars (P6 counts them on the
predecessor's, Project on the successor's) and after start milestones that have
predecessors. The converter names each of these that applies to the file it
writes, with a count.

## 2. Read by MPXJ, an independent reader

`python eval/msproject-mpxj.py <xer> <xml> ... --json eval/msproject-mpxj-2026-11-21.json`
reads the XER with MPXJ's P6 reader and the converted file with MPXJ's MSPDI
reader (MPXJ 16.10.0, github.com/joniles/mpxj, the open-source library most
schedule converters are built on; Java via JPype) and compares every activity
matched by activity ID: name, start, finish, remaining duration, actual start
and finish, constraint, its calendar's hours per week, predecessors (activity,
type, lag), and its resource assignments (count, work, actual and remaining
work, cost).

| File | Activities | Name | Start | Finish | Remaining | Actual start / finish | Constraint | Calendar | Predecessors | Assignments, work, actual, remaining, cost |
|---|---|---|---|---|---|---|---|---|---|---|
| sample | 42 | 42 | 42 | 42 | 42 | 42 / 42 | 42 | 42 | 42 | 42 each |
| terminal | 66 | 66 | 66 | 66 | 66 | 66 / 66 | 66 | 66 | 66 | 66 each |
| example | 425 | 425 | 425 | 425 | 425 | 425 / 425 | 425 | 425 | 425 | 425 each |
| Expressway | 823 | 823 | 823 | 823 | 823 | 823 / 823 | 823 | 823 | 823 | 823 each |
| hotel (HBTF-2) | 4,217 | 4,217 | 4,217 | 4,217 | 4,217 | 4,217 / 4,217 | 4,217 | 4,217 | 4,217 | 4,217 each |
| CCA | 15,849 | 15,849 | 15,849 | 15,849 | 15,849 | 15,849 / 15,849 | 15,848 | 15,849 | 15,849 | 15,849 each |

MPXJ reads the same values from the XER and from the converted file on every
field of all 21,422 activities but one: the CCA activity whose external early
start is written as a start-no-earlier-than constraint on purpose (MPXJ's XER
reader shows no constraint there). Level of effort and WBS summary activities
are left out of this table, and predecessors that are level of effort are left
out of each list, since those links go into notes.

## Design choices the checks exercised

- **Level of effort and WBS summary activities** have no Project equivalent.
  Written as ordinary tasks they would hold a duration and drive their
  successors; written as manually scheduled tasks with their links, Project
  drives the successors from a bar that never moves (the first version did
  this, and the CCA file's finish moved 18 months in the read-back). They are
  now manually scheduled tasks on their P6 dates, with their P6 relationships
  written into the task notes ("SS from A1030, FF to A1200").
- **In-progress work** is written as Project holds it: duration = actual
  (actual start to the data date, on the activity's calendar) plus remaining,
  % complete from those, and Resume at P6's remaining start.
- **External dates** (from links to projects not in the file) become a
  start-no-earlier-than (when the activity has no constraint of its own) and a
  deadline, which Project applies to late dates; 3 CCA activities carry them.
  The MSPDI reader here does not model deadlines, so section 1 cannot check
  the late side of that mapping.
- **Assignment work** is P6's at-completion units (actual plus remaining), to
  the second: a finished assignment with no actuals is 0 h, not its budget
  (in the first run MPXJ's work and cost differed on 73 of the example file's 425 activities, from these and from rounding each assignment to the minute), and
  0.16 h is written as 9 min 36 s rather than rounded to 10 min.
- **Quotes**: P6 writes a `"` inside a field as `""`. MPXJ reads it back as one
  quote and so does the converter (10 CCA names). This tool's XER reader keeps
  the doubled quote in names elsewhere; a reader-wide fix is left for another
  run because the comparison and the XER writer depend on it.

## Not checked

The files were not opened in Microsoft Project itself (no licence in this
environment); MPXJ and the MSPDI reader stand in. Activity codes, UDFs, notes,
steps and expenses are not carried (the converter counts each). Converting the
other way, Project XML to XER for P6 import, is not built.
