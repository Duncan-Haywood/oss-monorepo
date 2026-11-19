# 245 XER files not written by P6, through the full assessment, 2026-11-19

**Question.** The engine matches P6's own dates on six real P6 exports
(`eval/cpm-vs-p6-2026-11-19.md`). Many XER files a reviewer meets were not
written by P6: converters (MPXJ, Aspose, GroupDocs), other schedulers' exports,
hand-made test files, and generated demo schedules. Does the tool read them,
and does what it prints make sense?

**Data.** A GitHub code search for `ERMHDR extension:xer` (938 hits; the API
returns the first 300) gave 269 files that downloaded, 245 distinct by content,
from 50 public repositories. The list is `eval/converter-corpus-2026-11-19.txt`;
the files are not committed (their licences vary). 207 of the 245 store no early
and late dates at all; of the 38 that do, none is a P6 export that adds anything
to the six already scored: the dates in the others were typed or generated
(they disagree with their own logic, and several have no calendars or
scheduling options), and MPXJ's four lag-calendar fixtures each hold one
finished activity with no links, so they test only that the lag calendar
setting is read (it is: `rcal_Predecessor`, `rcal_Successor`, `rcal_24Hour`,
`rcal_ProjDefault`). So this is a robustness check, not an accuracy check.

**Method.** `node eval/converter-corpus.mjs <dir> [--fetch eval/converter-corpus-2026-11-19.txt]`
runs `assess` (DCMA points, recomputed schedule, stale-date list) and the
written review on every file, and counts crashes, refusals, and any `NaN`,
`undefined` or `Infinity` in the report or its warnings.

**Result.**

| | before | after |
|---|---|---|
| assessed | 240 | 241 |
| refused, with a reason | 4 (a stack trace from the CLI) | 4 (one line, exit 1) |
| crashed | 1 (`addWork: ran past 1,000 years`) | 0 |
| files with NaN / undefined / Infinity in the output | 28 | 0 |
| warnings, all files | 890 (179 in one file) | 134 (14 in one file) |
| calendars with no pattern read as 6 or 7 days a week | 0 | 4 |

The six real P6 files are unchanged: 19,820 of 19,822 open activities match P6
on early finish, late finish and total float (`node eval/cpm-vs-p6.mjs`).

**What was wrong, and the fix (one test each in `converter-files.test.mjs`):**

1. A lag of `NotANumber` read as NaN; `?? 0` does not catch NaN, and adding NaN
   hours of work to a date ran until the 1,000-year guard threw. `num()` now
   returns null for anything that is not a finite number ("NaN", "inf",
   "1e999999", text), so it falls back like a blank; a filled-in lag or
   duration that does not read as a number is reported once per field with
   the activity or link IDs.
2. Activities whose TASK row has no `clndr_id` printed "calendar undefined not
   in the file" once each (179 lines in one file) and took the first calendar
   in the file, which in several was a 24-hour one. They now take their
   project's calendar (else the file's default), and the warning is one line
   per missing calendar naming up to five activities.
3. A file storing early and late dates but no total float printed "float NaN h"
   in the stale-dates list; it now says "float not stored".
4. A calendar with no work pattern was always read as Monday to Friday, even
   when its own hours said otherwise ("Standard 6 Day Week", 8 h a day, 48 h a
   week). When week hours over day hours is exactly 6 or 7, the week is Monday
   to Saturday or every day; anything else (42 over 8, a weekend-only 24 over
   12) stays Monday to Friday, as before, and the warning says which was assumed.
5. A TASK table with no `task_id` column (a parser test file headed `Task_ID`)
   was assessed as one phantom activity with no ID. Rows with no `task_id` are
   now left out, and a file left with no activities and no PROJECT table is
   refused with "is it an XER export from P6?".
6. The CLI printed a stack trace for a file it refuses; it now prints one line
   and exits 1 (`XER_DEBUG=1` keeps the trace).

**Not checked.** The page (`index.html`) runs the same modules, so it gets the
same fixes, but was not driven over the 245 files. The warnings were read for
sense on about 20 files, not all 241. Accuracy on non-P6 files cannot be scored:
their stored dates are not P6's.
