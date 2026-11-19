# Longest path against P6's own flag, and multiple float paths, 2026-11-19

**Question.** (1) Does `floatpaths.mjs` `longestPath()` pick the activities P6
itself marked as its longest path? Every XER stores P6's answer: at each
schedule run P6 sets `TASK.driving_path_flag = 'Y'` on the activities whose
driving links lead to the project finish. Until now the tool traced a single
chain (`cpm.mjs` `drivingPath`, the first driving predecessor at each step),
so a parallel branch that also drives the finish was missing from it. (2) Is
the backward pass behind the new multiple float paths (`floatPaths()`,
relative float to any one activity) sound on real schedules?

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md` (P6 5.0 to
24.12; fetched from the four GitHub repositories listed there, not committed).
None of the six stores P6's own multiple float path result: `TASK.float_path`
and `float_path_order` are empty in all of them, so (2) is checked by a
property, not against P6.

**Method.** `node eval/longest-path.mjs <dir> --json eval/longest-path-2026-11-19.json`.
Open activities only (not complete, not level of effort or WBS summary), as in
the CPM check. Float paths are run to the activity the longest path ends on
(`finishActivity()`: of the open activities finishing on the project finish,
the one with the most activities driving into it).

## (1) Longest path

| File | P6 flagged (open) | Here | On both | Only P6 | Only here |
|---|---|---|---|---|---|
| Expressway (7.0) | 33 | 33 | 33 | 0 | 0 |
| example (24.12) | 17 | 17 | 17 | 0 | 0 |
| hotel, HBTF-2 (6.0) | 133 | 133 | 133 | 0 | 0 |
| sample (20.12) | 42 | 42 | 42 | 0 | 0 |
| terminal (5.0) | 36 | 36 | 36 | 0 | 0 |
| **Five files** | **261** | **261** | **261** | **0** | **0** |
| CCA (6.0) | 604 | 56 | 56 | 548 | 0 |

On five files the set is P6's exactly. The old single chain (`drivingPath`)
held 19 of the terminal file's 36: the other 17 sit on a second branch that
drives the same finish.

**CCA.** All 56 found here are flagged by P6, but P6 flags 548 more open
activities, and its flags cannot come from the run that wrote the file's
dates: they sit on activities whose *own stored* total float is up to
3,788 h (this file's stored float equals the engine's on 14,268 of 14,270
activities), and on 399 completed activities as well. The flags look left
from an earlier run (P6 6.0 may rewrite them only under some setting); the
page and CLI now print the disagreement and the activities only P6 flags, so
a reviewer can see it instead of trusting either set.

## (2) Float paths

The relative float of an activity is its float against a backward pass run
from the target alone (`targetBound()`): the same open-activity rules as
`cpm.mjs`'s backward pass (FS, SS, FF, SF with lags on the project's lag
calendar; an active successor's SF link is met; a started predecessor's SS lag
is spent), with no other successor, constraint or project date. Seeded at the
target's *late* finish instead of its early finish, the pass must give every
activity a float no smaller than its total float, since `cpm.mjs` takes the
least over everything; equal where the target is what binds.

| File | Paths | Activities in them | TF equals the bound | TF above the bound | Zero relative float = driving into the target |
|---|---|---|---|---|---|
| CCA | 4,880 | 10,118 | 3,352 | **0** | 56 = 56 |
| Expressway | 212 | 579 | 558 | **0** | 33 = 33 |
| example | 41 | 224 | 224 | **0** | 16 = 16 |
| hotel | 1,570 | 4,211 | 4,211 | **0** | 197 vs 132 |
| sample | 1 | 42 | 42 | **0** | 42 = 42 |
| terminal | 13 | 66 | 65 | **0** | 36 = 36 |

No activity in 15,240 has a total float above the bound, so the pass never
gives less float than P6's rules do. Where only the finish binds (the hotel
and example files, whose open work all leads to it), total float equals the
bound on every activity: 4,211 of 4,211 and 224 of 224. The first version of
the pass broke this on 143 CCA activities; the cause was a started
predecessor's SS lag, which `cpm.mjs` treats as spent (its `bwSSActivePred`
rule) and the pass had subtracted. A version before that summed relationship
free float link by link, in hours of each successor's calendar, and broke it
on 831 activities across three files: hours on different calendars do not add.

The hotel file's 65 extra zero-float activities are not driving in the
forward sense (one link in each chain has an 8 h gap) but have zero float to
H0010 by P6's own float rules: the chain runs through HHAWAFAZ0010, an *as
late as possible* activity that P6 places at its late dates, so the gap in
front of it is not float. Total float there is 0 too, and P6 stores the same.

Run time: 0.4 s for every path in the 14,270-activity CCA file, under 0.1 s on
the rest.

## Not checked

- Against P6's own multiple float paths: no public file stores them. P6's
  exact ordering of paths with equal float, and its "total float" option, are
  not reproduced; here ties go to the chain that finishes later, and only the
  free-float style ranking is offered.
- Completed activities are left out of the target-bound pass, so a route that
  runs through a finished node does not bind (the bound is then looser than
  `cpm.mjs`'s, never tighter; the property above holds anyway).
- Constraints and must-finish dates are deliberately not in the bound: relative
  float answers "how far before this one activity moves", not "before the
  project finish moves".
