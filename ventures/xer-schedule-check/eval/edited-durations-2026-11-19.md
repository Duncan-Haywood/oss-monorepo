# A seventh P6 file, and durations edited after the last schedule run, 2026-11-19

**Question.** The engine matches P6's stored dates on six public P6 exports
(`eval/cpm-vs-p6-2026-11-19.md`, 19,820 of 19,822). That README warns that six
files from six sources is a small sample. Does it hold on a seventh, and when
a file's stored dates disagree with the logic, can the tool say why?

**Data.** A GitHub code search for `ERMHDR extension:xer`, split by file size
(`size:>300000`, `100000..300000`, `40000..100000`) to get past the API's
300-result cap, gave four files from repositories not in
`eval/converter-corpus-2026-11-19.txt`. One is a P6 export with scheduled
dates the six do not cover:

| File | P6 | Source | Open activities |
|---|---|---|---|
| Harbour Pointe Assisted Living Center.xer | 17.12 | djouallah/Xer-Reader-PowerBI, `xerfile/` (HEAD on 2026-11-19, md5 f80412fd4851c0308ff5839d33b31dad) | 113 |

Not committed (no licence covers redistribution). The other three: an Aspose
test file (another copy of one already in the converter corpus; 2 of 83
match, its dates are not P6's), a P6 22.12 file with no scheduled dates, and a
"P6 7.0" file dated 2025 whose zero-duration tasks finish at 08:00 the next day
where P6 writes 17:00 the day before (240 of 281; generated, not exported by P6).

**First reading.** `node eval/cpm-vs-p6.mjs <dir>`: 88 of 113 match early
finish, late finish and total float. The 25 that differ are not one rule:
early finishes, late finishes and floats are all off, by days to weeks, on
both sides.

**What it was.** Take activity EC2170 (Unit Finishes Building South, Floor
3). Its remaining duration is 2,208 h, but its stored early start and
finish, 2012-03-27 16:49 to 2013-03-14 16:49, span 1,968 h of work on its
calendar, the same as its twin EC2150 on the floor below. Its planned finish
(`target_end_date` 2013-04-25 16:00) does fit 2,208 h. So the duration was
changed after P6 last scheduled the project, and the file was exported without
rescheduling (F9). Eight unstarted activities are like that:

| Activity | Remaining duration | Stored dates span |
|---|---|---|
| EC1430 Shop Drawings, Review & Approval | 90 d | 87 d |
| EC1590 Fire Protection and Lighting | 90 d | 87 d |
| EC1680 Finishes and Striping | 108 d | 105 d |
| EC2060 Punch List Garage | 69 d | 60 d |
| EC2170 Unit Finishes Building South - Floor 3 | 276 d | 246 d |
| EC2200 Unit Finishes Building North - Floor 4 | 273 d | 243 d |
| EC2380 Punchlist Garage | 18 d | 12 d |
| EC2410 Final Inspections and Punchlist | 115 d | 90 d |

Rescheduled with the durations the stored dates imply, the engine agrees with
P6 on **113 of 113**. The engine was right about the file; the file had changed
since P6 last scheduled it.

**The feature.** `dcma.mjs` now runs this check on every file whose stored
dates differ from the logic. A not-started, non-milestone activity whose stored
early start and finish span a different amount of work (on its own calendar)
than its remaining duration goes on a new list, "Durations edited after the
last schedule run". Activities whose duration an expected finish date sets are
left out. The tool then reschedules with the durations the stored dates imply
and counts how many of the differing activities agree. Each one that does gets
"agrees once the edited durations are put back" in the stored-dates list. The
written review asks the contractor to reschedule and resubmit (medium). The
web page and the CLI show the list like the other extra checks.
Microsoft Project XML files are left out: Project stores no separate stored
and recomputed dates for this check to compare.

**Checked** with `node eval/edited-durations.mjs <dir> --json eval/edited-durations-2026-11-19.json`
(10 seeds, 5 edits each):

| File | As found | Planted (10 x 5) | Found | Extra | Differences caused | Explained |
|---|---|---|---|---|---|---|
| CCA (6.0) | none listed | 50 | 50 | 0 | 1,634 | 1,614 |
| Expressway (7.0) | none listed | 50 | 50 | 0 | 487 | 487 |
| example (24.12) | none listed | 50 | 50 | 0 | 1,404 | 1,404 |
| hotel (6.0) | none listed | 50 | 50 | 0 | 4,755 | 4,755 |
| sample (20.12) | none listed | 50 | 50 | 0 | 357 | 357 |
| terminal (5.0) | none listed | 50 | 50 | 0 | 429 | 429 |
| Harbour Pointe (17.12) | 8 listed, 25 of 25 explained | (not planted) | | | | |
| **Total** | | **300** | **300** | **0** | 9,066 | 9,046 |

Each planted edit makes an unstarted activity 1 to 20 working days longer or
shorter without rescheduling. The 20 unexplained differences on CCA are its
two known residuals (BAFT/SAFT2305509, `eval/cpm-vs-p6-2026-11-19.md`), once per
seed. They are not caused by the edits and are correctly left unexplained.
None of the six files P6 had just scheduled lists anything. Unit tests:
`edited-durations.test.mjs`.

**Limits.** Only unstarted activities are checked. An in-progress activity's
remaining duration changes with progress, so the stored dates do not pin down
what it was. A duration edited and then changed back is invisible. An edit on an activity whose
stored dates span exactly the new duration (an edit made before the last
schedule run) is no edit at all. Seven P6 files from seven sources is still a
small sample.
