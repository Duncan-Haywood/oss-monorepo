# Free float against P6's stored values, and files with no data date, 2026-11-19

**Question.** The CPM check (`eval/cpm-vs-p6-2026-11-19.md`) matched P6's early
and late dates and total float on 19,807 of 19,822 open activities, but free
float only on 18,537: 1,241 CCA activities and 43 in the 24.12 file disagreed.
Free float is what a reviewer reads to see how far an activity can slip before
it moves anything else. Which rules does P6 use that `cpm.mjs` did not?

**Data.** The same six public XER files, fetched again from the same commits
(not committed; licences in `eval/cpm-vs-p6-2026-11-19.md`). Two hand-made
fixture files that also sit in those repositories (`xer-checker/tests/fixture.xer`,
`critpath-primavera-p6-checker/tests/fixtures/planted-defects.xer`) were run too:
they store no data date and no calendar work pattern.

**Method.** `node eval/cpm-vs-p6.mjs <dir> --json eval/free-float-2026-11-19.json`.
A free float matches when it equals P6's `free_float_hr_cnt` to 0.01 h. Each
rule can be turned off through `schedule(xer, { variant })` (`ffOpenEnd`,
`ffDoneSucc`, `ffSSActivePred`, `ffFloor`) to measure what it does alone.

## Four rules

1. **An open end's free float runs to the project's early finish**, not to a
   must-finish date. An activity with no successor in a project with a
   must-finish date 48.02 h after its forecast finish had 48.02 h too much free
   float, 34 times in the 24.12 file. Because the as-late-as-possible step uses
   free float, this also fixed the hotel file's last disagreement (a finish
   milestone at 17:00 where P6 has 16:00): hotel is now 4,217 of 4,217 on all
   three of early finish, late finish and total float.
2. **A started successor's SS link has already spent its lag.** The forward
   pass already knew this (rule 6 of the CPM check); free float did not, and
   gave -32 to -112 h where P6 gives 0.
3. **A started predecessor's SS lag is spent too**: the successor waits for the
   later of the predecessor's remaining start and its actual start plus the lag
   (the forward rule "maxleft"), so the spent lag is not free float.
4. **A finished successor still counts**, as the zero-length node at the data
   date the forward pass already builds, reached with no lag.

And **free float is the plain gap, never below zero and not capped at total
float**. None of the 20,127 free float values the six files store is negative,
while many activities with negative total float carry hundreds of hours of
free float (UP3OS23003C0: total -320.8 h, free 343.2 h). The old code took the
smaller of the gap and total float.

## Result

| File | Free float before | After |
|---|---|---|
| CCA (6.0) | 13,029 / 14,270 | **14,266** |
| Expressway (7.0) | 823 / 823 | 823 |
| hotel (6.0) | 4,217 / 4,217 | 4,217 |
| terminal (5.0) | 65 / 66 | **66** |
| example (24.12) | 361 / 404 | **395** |
| sample (20.12) | 42 / 42 | 42 |
| **Total** | **18,537 / 19,822 (93.5%)** | **19,809 / 19,822 (99.93%)** |

Early finish, late finish and total float together: 19,808 of 19,822 (was 19,807;
the hotel milestone).

Ablation on CCA (each row turns the named rules off; rules 1 and 2 were
measured by their first landing above, 13,029 to 13,039 to 13,573, then the
plain-gap change to 14,081):

| Rules on | CCA free float |
|---|---|
| all | 14,266 |
| floor only (no finished successor, no started-predecessor SS) | 14,204 |
| finished successor only | 14,127 |
| started-predecessor SS only | 14,220 |
| none of these three | 14,081 |

The floor and the started-predecessor rule overlap: each alone fixes most of
the same "-lag where P6 has 0" cases.

## What is left

- **CCA, 4**: all four are activities whose early or late dates already differ
  from P6's (GV10GL09202R2, UP3S305509C0, SAFT2305509C0, and PGLS703394R02 on
  the PP2S/PP1S/PGLS chain), listed in the CPM check's "What is left". Free
  float follows once those dates do.
- **24.12 file, 9**: P6 stores 0 where the file's own logic gives a positive
  gap. A10590 finishes 2026-11-11 16:12 and its only successor, A10600, starts
  2026-11-20 08:00 in both P6's stored dates and ours, yet P6 stores free
  float 0 (48.8 h here). The five A10810.n activities (started, one FS
  successor, 32 to 72 h of gap) and two started activities with an FF link to
  the finish milestone are the same. No rule found explains them from the
  file; they are left as they are rather than fitted.

## Files with no data date

Both hand-made fixtures crashed `schedule()` (`this.day is not a function or its
return value is not iterable`): with no `last_recalc_date` or `plan_start_date`,
an activity with no predecessor had nothing to start from, and the calendar
code was handed -Infinity. A file from another tool, a converter or a hand edit
can look like this. Now:

- a project with no data date counts from the earliest date the file stores
  (project dates, actual, early or target starts) and says so in a warning;
- activities whose project is not in the PROJECT table (or a file with no
  PROJECT table) are assessed as their own project, with a warning;
- a calendar row with no work pattern becomes Monday to Friday at its
  `day_hr_cnt` hours from 08:00 (with a 12:00 to 13:00 break), with a warning,
  instead of being reported as "not in the file" and silently replaced by the
  default calendar.

Both fixtures now give a full DCMA report (9 of 14 points pass on each) with
the warnings above.

## Where it shows

`dcma.mjs` returns every open activity's recomputed dates, total float and free
float beside the stored values (`report.activities`), and `scheduleCsv(report)`
writes them: the page's "Download recomputed schedule (CSV)" button and
`node cli.mjs file.xer --schedule activities.csv`.
