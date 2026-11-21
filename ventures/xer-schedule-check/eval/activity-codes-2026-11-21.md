# Gantt chart grouped by activity code, checked on the public P6 files, 2026-11-21

**Question.** P6 users group the Gantt by activity codes (responsibility,
area, phase, trade) at least as often as by the WBS: "show me the electrical
sub's work, by floor". Does the grouped chart (`gantt.mjs` `groupBy`,
`actvcodes.mjs`) put every activity under the value the file gives it, with
nested values as a tree, counts and bars that add up, and P6's value order?

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md` (fetched
for the check, not committed). Four carry activity codes:

| File | P6 | Activities on the chart | Code types used | Nested types | TASKACTV rows |
|---|---|---|---|---|---|
| CCA_R03_dt_24Oct11SC.xer | 6.0 | 16,146 | 37 (34 global, 3 project) | 4 (Carpark code, CUP code, TAG, SSCF) | 258,951 |
| hotel-project.xer | 6.0 | 4,217 | 5 (project) | 0 | 18,020 |
| example_xer_file.xer | 24.12 (Web) | 435 | 3 (global) | 0 | 436 |
| terminal-building-airport.xer | 5.0 | 66 | 1 (project) | 0 | 51 |

Expressway_Project.xer and sample.xer have no code tables. In the CCA file
715 activities hold a value that has values below it (a parent value), which
P6 allows; the chart files them directly under that value, ahead of its
sub-groups, as it does for activities filed on a WBS node with children.

**Method.** `node eval/activity-codes-check.mjs <dir> --json eval/activity-codes-2026-11-21.json`.
For every code type a project's activities carry, two charts: grouped by the
type alone, and by the type then the WBS (92 charts). The checks read
TASKACTV, ACTVCODE and PROJWBS directly, not through `actvcodes.mjs`:

- *once*: every activity on the WBS chart is on the grouped chart exactly once;
- *place*: the group rows above each activity are its TASKACTV value and that
  value's ACTVCODE parents, outermost first (or the single "no <type>" group),
  then, for type + WBS, its PROJWBS branch;
- *count*: each group row's count equals the activities under it;
- *tally*: each value's count equals an independent tally of the drawn
  activities holding that value or a value below it;
- *rollup*: each group row spans exactly the earliest start and latest finish
  under it;
- *order*: siblings follow ACTVCODE seq_num (PROJWBS seq_num for WBS rows),
  "no <type>" last.

P6 stores no layout in the XER, so nothing here is compared with P6's own
screen; these are the rules a P6 user expects of Group and Sort by a code,
checked at scale on real code sets.

**Result.**

| File | Charts | once | place | count | tally | rollup | order | Time |
|---|---|---|---|---|---|---|---|---|
| CCA (6.0) | 74 | 74/74 | 1,194,804/1,194,804 | 80,188/80,188 | 899/899 | 80,188/80,188 | 54,844/54,844 | 11.0 s (0.15 s a chart) |
| hotel (6.0) | 10 | 10/10 | 42,170/42,170 | 7,089/7,089 | 31/31 | 7,089/7,089 | 4,550/4,550 | 0.3 s |
| example (24.12) | 6 | 6/6 | 2,610/2,610 | 92/92 | 3/3 | 92/92 | 66/66 | 26 ms |
| terminal (5.0) | 2 | 2/2 | 132/132 | 128/128 | 10/10 | 128/128 | 67/67 | 1 ms |

**Does the check catch a wrong chart?** Three mutants of `gantt.mjs`, run on
the hotel and CCA files, each failed:

| Mutant | What fails |
|---|---|
| sibling order reversed | order 135/4,550 (hotel), 834/54,844 (CCA) |
| a nested value's parents dropped (only the held value kept) | place 21,145/42,170 (hotel), 570,160/1,194,804 (CCA); tally 832/853 (CCA) |
| a group's count off by one per sub-group | count 4,560/7,089 (hotel), 54,918/80,188 (CCA); tally 832/899 (CCA) |

**What the codes show that the WBS does not.** In the hotel file, grouped by
Responsibility, the main contractor holds 2,311 activities; no WBS node says
so. In CCA, 16,146 of 16,146 activities carry a "CCAD BILL(SET)" value and
16,128 a building, so a reviewer can open one building's work across all of
the WBS. Assignments the code tables do not carry (none in these files) and a
second value of one type for one activity (none) are named in the warnings
and fall back to "no <type>" and the first value.

**Not checked.** EPS-scoped code types (none in the files; they are offered
when the project's activities use them); a real P6 layout file to compare
the order against for values with equal seq_num (ties fall back to short
name, then id).
