# The written review on six public XER files, 2026-11-19

**Question.** What does the written review (`report.mjs`) ask a contractor
to fix on real schedules, and does it stay a document a person would send?

**Data.** The six public XER files of `cpm-vs-p6-2026-11-19.md` (same repos
and commits, fetched for this check, not committed). One file per project, so
no update comparison here; the comparison's own check is
`compare-check-2026-11-19.md`.

**Method.** `node cli.mjs <file> --report review.html` for each, then each
review printed to US Letter in headless Chromium (Playwright `page.pdf`).
Severity: high = the dates cannot be relied on; medium = logic that can hide
delay; low = good practice (table in `report.mjs`).

**Result.**

| File | Open activities | DCMA pass | Corrections (high / medium / low) | Activity rows listed | Pages printed |
|---|---|---|---|---|---|
| sample (20.12) | 42 | 12 | 2 (0 / 0 / 2) | 52 | 4 |
| terminal (5.0) | 66 | 10 | 5 (0 / 1 / 4) | 57 | 5 |
| example (24.12) | 404 | 8 | 8 (0 / 4 / 4) | 365 | 7 |
| Expressway (7.0) | 823 | 8 | 7 (0 / 3 / 4) | 920 | 11 |
| hotel (6.0) | 4,217 | 8 | 7 (0 / 3 / 4) | 5,476 | 8 |
| CCA (6.0) | 14,270 | 5 | 11 (2 / 5 / 4) | 19,652 | 13 |

The CCA file's two high items are 544 activities with negative float and 3
invalid dates. Each correction prints its first 40 activities and says how
many more the CSV holds, so reviews print in 4 to 13 pages (the hotel count is after the fix below). The
largest review took 2.0 s to compute (CCA).

**A fault this found in the engine.** The hotel file's first review led with
"High: repair the driving path, delaying it 600 days moved the finish 0 days".
Its driving path is a single finish milestone, ATWTPR000 (as-late-as-possible
constraint), with no open activity behind it. `dcma.mjs` fell back to delaying
that milestone, and added duration on a milestone moves nothing, so the test
reported a broken path it had never tested. It now reports "could not run"
(value n/a, still a fail) and names the milestone; the review asks, at medium,
for the logic that drives the finish. None of the other five files reach that
fallback, so their results are unchanged.

**What is left.** A real pair of consecutive updates through `--previous
--report` (the planted-edit check covers the comparison, not a real reviewer's
reading of the document). Whether reviewers want the 40-row cut or the full
list in an appendix is a question for a user.
