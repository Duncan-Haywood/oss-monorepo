# Update-to-update comparison against planted edits, 2026-11-19

**Question.** Does `compare.mjs` report exactly the changes between two updates
of a real P6 schedule: every change that was made, and nothing that was not?

**Data.** The six public XER files of `cpm-vs-p6-2026-11-19.md` (P6 5.0 to
24.12, 19,822 open activities; fetched for the check, not committed). No public
pair of consecutive real updates of one project was found: a GitHub code search
for `ERMHDR extension:xer` (938 hits) turned up update pairs only in tools' own
demo folders (Tahir-yamin/plan-bee, MatthewPaver/ProjectLens,
criad-com/usdaeco-plan, all MIT), and those are hand-written XER text without
calendar data, one without a data date or remaining durations. The comparison
runs on them and its warnings say so (recomputed dates agree with the stored
ones on 0 of 21 activities in the ProjectLens pair), but they measure nothing
about P6.

**Method.** `node eval/compare-check.mjs <dir> --seeds 20 --json eval/compare-check-2026-11-19.json`.
For each file, in its largest project:

1. *Identity*: the file against itself.
2. *Planted edits*: 20 seeded copies, each with 6 edits drawn from nine kinds
   (relationship deleted, lag +2 days, FS and SS swapped, original duration +1
   day on an unstarted activity, start-on-or-after constraint added, renamed,
   unfinished activity deleted with its links, actual start of a completed
   activity moved a day, activity calendar switched), on activities with a
   unique ID and no other edit. Pass: each planted edit appears in its section,
   and no other entry appears in the edit sections (logic, durations,
   constraints, calendars, activities, actual dates). The links of a deleted
   activity are reported, marked "an activity was deleted", and not counted as
   extra.
3. *Progress only*: 20 copies in which one unstarted task is marked started at
   the data date. Pass: half-step finish equals current finish (revision
   effect 0).

**Result.**

| File | Identity changes | Half-step = finish | Planted found | Extra | Progress-only | Time |
|---|---|---|---|---|---|---|
| CCA (6.0) | 0 | yes | 120 / 120 | 0 | 20 / 20 | 101 s |
| Expressway (7.0) | 0 | yes | 120 / 120 | 0 | 20 / 20 | 8.2 s |
| example (24.12) | 0 | yes | 120 / 120 | 0 | 20 / 20 | 2.0 s |
| hotel (6.0) | 0 | yes | 120 / 120 | 0 | 20 / 20 | 13 s |
| sample (20.12) | 0 | yes | 120 / 120 | 0 | 20 / 20 | 0.1 s |
| terminal (5.0) | 0 | yes | 120 / 120 | 0 | 20 / 20 | 0.2 s |
| **Total** | **0** | **6 / 6** | **720 / 720** | **0** | **120 / 120** | |

Times are for 41 comparisons per file (each three CPM runs); one comparison of
the 16,000-activity CCA file takes about 2.5 s.

**The first run's misses** (5 seeds): every "extra" was a link of a deleted
activity counted as a deleted link. The report already marks those
(`bothRemain: false`); the check now skips them, which is what a reviewer
reading the report would do.

**What this does not show.** That the half-step split matches P6 on a real
pair of updates: the split uses this tool's CPM engine, which equals P6's
stored dates on 91.5% of activities (`cpm-vs-p6-2026-11-19.md`), and the
progress-only check passes by construction once the identity holds. The split
was checked by hand only on the invented example pair in `example.mjs`
(finish +15 working days: +6 progress, +9 revisions). Wanted: a real pair of
consecutive updates.
