# Windows analysis and the full-list appendix in the written review, 2026-11-19

**Question.** When the written review (`report.mjs`) is given a windows
analysis (`windows.mjs`), does it ask for exactly the corrections its rules
give, name the planted activity behind each, and, with `--appendix`, list
every activity the body cut? And does it hold end to end: updates written to
disk as XER files, read back by the CLI in shuffled order?

**Data.** The six public XER files of `cpm-vs-p6-2026-11-19.md` (same repos
and commits: MutahirAbbas/xer-checker @ 2296ee1, kaustumbh7/critpath-primavera-p6-checker
@ ba6b5bf, Badr1600/p6-analyzer @ ec457f3, ASHspace/PrimeveraXEREditor @ 9cb4f23;
fetched for this check, not committed). No public series of real consecutive
P6 updates exists, so each file is the first update of a series built by
`status.mjs`, 20 working days apart:

| Window | Planted | The review should |
|---|---|---|
| 1 | nothing (as planned) | ask nothing |
| 2 | a 1-5 day progress slip on driving-path work | ask nothing (progress is not a revision) |
| 3 | an unstarted driving-path activity re-estimated +1-9 days | ask to justify the revisions (medium at 5+ working days of finish movement from revisions, low below), naming that activity |
| 4 | a 3-7 day slip, and a 3-7 day duration cut on later unstarted driving-path work | ask for the recovery plan when revisions took back 2+ days of the slip, naming both |

**Method.** `node eval/review-windows-check.mjs <dir> --seeds 3 --pdf --json eval/review-windows-check-2026-11-19.json`
(full output: `review-windows-check-2026-11-19.txt`). Each update is written
with `xer.mjs` `xerText`, and `node cli.mjs --windows <shuffled files>
--project <code> --report review.html --appendix` writes the review. Checked:
the first file read back from disk assesses the same as the original; the
review's window corrections (read from the HTML) equal `windowItems` on the
library's own windows run; window 3's severity is the rule's; the planted
activities are among each correction's rows; the appendix row count equals
the sum of "lists all N" over the cut items. Seed 1 of each file was printed
to US Letter in headless Chromium.

**Result.** 18 series, 0 errors.

| Check | Result |
|---|---|
| XER written and read back, assessment unchanged | 18 of 18 |
| Window corrections in the review = the rules on the windows run | 18 of 18 |
| Window 3 severity right (medium / low / none) | 18 of 18 |
| Re-estimated activity named, where window 3 asked | 11 of 11 |
| Recovery plan asked where revisions took back 2+ days | 8 of 8 expected, 0 extra; slip and cut both named in 8 |
| Appendix holds every row the body cut | 18 of 18 |

| File | Open activities | Review with appendix (seed 1) | CLI time per series |
|---|---|---|---|
| sample (20.12) | 42 | 6 pages, nothing cut | 0.1 s |
| terminal (5.0) | 66 | 9 pages, nothing cut | 0.1 s |
| example (24.12) | 404 | 15 pages, 243 appendix rows | 0.4 s |
| Expressway (7.0) | 823 | 54 pages, 1,160 rows | 1.4 s |
| hotel (6.0) | 4,217 | 190 pages, 7,961 rows | 2.6 s |
| CCA (6.0) | 14,270 | 582 pages, 18,588 rows | 17-19 s |

The appendix is off by default for that reason: on a 14,000-activity file the
complete list is 582 pages, against 13 for the review with neither the appendix nor windows (`review-report-2026-11-19.md`).

Not every series could plant every change. The hotel file's driving path is
one finish milestone (see `review-report-2026-11-19.md`), so none of its three
series has slip or re-estimate candidates and every window moves 0; the
review then asks nothing, which is right. Expressway seeds 2 and 3 found no
candidates for windows 2 and 3. In CCA seed 3 and terminal seed 3 the
re-estimate moved the finish 0 days (window 3 "none"), so no correction is
asked and nothing is named; in CCA seed 3, window 4's revisions took back 0.3
days, under the 2-day floor, and no recovery plan is asked.

**A fault this found.** The first run read the 24.12 file back wrong: P6 Web
stores each calendar's `clndr_data` as one quoted value spread over many
lines, and the first `xerText` wrote it without quotes, so the reader kept
only its first line. The read-back calendars were empty, and the "as planned"
first window moved the finish 20.7 working days instead of 0. `xerText` now
quotes a value holding a line break (`""` for `"`), as P6 Web does; the
round trip holds on all six files, and a test plants such a value
(`report.test.mjs`).

**Limits.** The series are made by statusing real files, not real monthly
updates, so the planted changes are cleaner than a contractor's. Which party
is responsible for a delay is not something the review says.
