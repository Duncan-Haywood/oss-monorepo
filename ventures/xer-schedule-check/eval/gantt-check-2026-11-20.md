# Gantt chart against P6's stored dates, 2026-11-20

**Question.** The Gantt chart (`gantt.mjs`) draws every activity of an XER on
the WBS tree. Two parts of it are new computation and need checking: the dates
of **level of effort (LOE)** and **WBS summary** activities, which the CPM
engine (`cpm.mjs`) leaves out of the network, and the **finish variance**
against a baseline file. The rest (WBS rollups, order, coverage) must hold as
invariants on real files.

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md` (P6 5.0
to 24.12; fetched for the check, not committed). Three of them carry span
activities: CCA (285 open LOEs), sample.xer (10 LOEs), example_xer_file.xer
(10 WBS summaries, 8 of them started).

**Method.** `node eval/gantt-check.mjs <dir> --json eval/gantt-check-2026-11-20.json`
(about 21 s; the CCA file is 17 s of it, mostly the 20 planted baseline runs).

**Result.**

| File | LOE (start / finish = P6) | WBS summary | Open bars = P6 | Once | WBS rollup | Order | Self-baseline 0 | Planted -k |
|---|---|---|---|---|---|---|---|---|
| CCA (6.0) | 285 / 285 | - | 14,268 / 14,270 | 16,146 | 860 / 860 | 860 / 860 | 16,146 | 20 / 20 |
| Expressway (7.0) | - | - | 823 / 823 | 823 | 179 / 179 | 179 / 179 | 823 | 20 / 20 |
| example (24.12) | - | 10 / 10 | 404 / 404 | 435 | 18 / 18 | 18 / 18 | 435 | 20 / 20 |
| hotel (6.0) | - | - | 4,217 / 4,217 | 4,217 | 951 / 951 | 951 / 951 | 4,217 | 20 / 20 |
| sample (20.12) | 10 / 10 | - | 42 / 42 | 52 | 5 / 5 | 5 / 5 | 52 | 20 / 20 |
| terminal (5.0) | - | - | 66 / 66 | 66 | 25 / 25 | 25 / 25 | 66 | 20 / 20 |
| **Total** | **295 / 295** | **10 / 10** | 19,820 / 19,822 | 21,739 / 21,739 | 2,038 / 2,038 | 2,038 / 2,038 | 21,739 | 120 / 120 |

A span activity matches when its early start (the remaining start for a
started one) and early finish equal P6's stored `early_start_date` and
`early_end_date` to the minute. The two open bars that differ are the CCA
engine differences already reported in `eval/cpm-vs-p6-2026-11-19.md`.

**Rules, each found from a mismatch and kept only when the count rose:**

1. LOE start: the earliest date its FS (finish + lag) and SS (start + lag)
   predecessors allow, never before the data date; finish: the latest date its
   FS successors (start - lag), FF successors (finish - lag) and FF
   predecessors (finish + lag) ask for, snapped back to the end of a working
   period on the LOE's calendar. First try: 243 of 285 starts, 278 finishes.
2. A started LOE starts at the data date: 280 starts, 285 finishes. Two
   started LOEs (CV09GZ21158R2, DV09GZ21159R2 and others) contradicted it:
   P6 had them start with an SS predecessor that had not started yet.
3. So, instead of rule 2: an SS predecessor that has started gives its actual
   start (before the data date, so the LOE resumes at the data date), one
   that has not gives its early start: 283 starts, 284 finishes.
4. Rules 4a and 4b, landed together: LOEs tied to other LOEs (BAFTS01809G0
   starts 240 h after BAFTS01808G0) are resolved in passes until nothing
   moves; and a started LOE whose successors already finish before the start
   its predecessors give (I05GN02301C0, an FS predecessor not finished) keeps
   the data date as its remaining start: 285 of 285.
5. WBS summary: the earliest start and latest finish of every activity in its
   WBS node and the nodes under it; a started summary's remaining start is the
   data date: 2 of 10, then 10 of 10 once the nodes under it were included
   (the first run looked only at the summary's own node).

**Planted baselines.** For 20 not-started activities per file, one at a time,
a baseline copy with k = 1 to 10 working days added to the activity's
remaining and original duration; the chart of the file against that copy
must give the activity a finish variance of exactly -k working days. The
first run picked activities with FF predecessors too and missed 3 of 120:
each had its finish tied by an FF predecessor, so the longer duration moved
its start, not its finish, and 0 was the right answer. Activities with an FF
or SF predecessor are now left out of the sample: 120 of 120.

**What it does not show.** No public XER carries a P6 baseline project next
to its update, so the baseline comparison is checked on planted copies only.
WBS summary dates are checked on one file (10 activities). The bar colours
follow the project's critical setting (total float at or below its threshold,
or longest path); P6's own Gantt layouts, filters and grouping by activity
code are not reproduced.
