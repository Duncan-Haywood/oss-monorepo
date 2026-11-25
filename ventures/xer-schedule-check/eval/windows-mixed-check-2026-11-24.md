# Windows analysis with several kinds of change in one window, 2026-11-24

**Question.** The nine-kinds check (`windows-kinds-check-2026-11-24.md`)
planted one change per window. A real monthly update holds progress and
revisions together: an activity going faster than forecast *and* a link
deleted, a constraint added and a duration cut. Does `windows.mjs` still
split the window's movement exactly between progress and revisions, and name
every change on its own side, when they arrive together?

**Data.** The same six public XER files (`bash eval/corpus-fetch.sh DIR`),
three seeds each, 18 series of 6 windows (108 windows). Each series is built
as in the nine-kinds check, statused as planned every 20 working days from the
real file.

**Method.** `node eval/windows-kinds-check.mjs DIR --seeds 3 --mixed N --json ...`
(outputs: `windows-mixed2-check-2026-11-24.txt` and `windows-mixed3-check-2026-11-24.txt`, with JSON).

- `--mixed 2`: each window plants one progress change (late start, gain or
  early finish, in turn) and one revision (each of the six revision kinds
  leads one window).
- `--mixed 3`: the same plus a second revision of another kind.

The changes are chained: the progress change goes on the as-planned file,
then each revision is picked on the driving path of the file the change before
it made. So a revision meets the half-step path (the one this period's progress
left), and a second revision meets the path the first one made, as happens when
a scheduler edits one thing after another. Expected split from counterfactual
files: the progress effect is the window's file with its progress and none of
its revisions, against the previous update; the revision effect is the rest.
Checked per window: the split equals that exactly, and every planted change is
named among the drivers on its own side.

**Result.**

| | `--mixed 2` | `--mixed 3` |
|---|---|---|
| windows with at least one change planted | 77 | 72 |
| of those, split exact | 77 | 72 |
| windows holding 2 or more changes | 34 | 50 |
| of those, split exact | 34 | 50 |
| windows with progress and revisions both planted | 34 | 25 |
| of those, both effects non-zero | 22 | 15 |
| changes planted | 111 | 130 |
| named on their own side | 111 | 127 |
| named on the wrong side | 0 | 0 |
| series adding up, sorted back into date order | 18 of 18 | 18 of 18 |

By kind, `--mixed 3` (planted / named): late-start 5/5, gain 14/14,
early-finish 13/13, constraint 19/19, added 14/13, link-deleted 15/14,
calendar 9/9, cut 20/19, type 21/21.

hotel-project plants nothing (its driving path is one constrained milestone,
as in the nine-kinds check). Expressway plants few (short path through SS
links on a 7-day calendar).

**The three changes not named (`--mixed 3`).**

1. *A duration cut that drove the finish only after another revision.*
   CCA seed 2, window 3: FS T14PA23009C0 -> T14PA23015C0 deleted, then
   T20TS01801C0 cut 4 days; revisions -0.3 days, split exact. The cut was
   picked on the driving path of the file with the deletion already in, and
   a 4-day cut moving the finish only 0.3 days means another path took over
   at the end. So T20TS01801C0 is driving only in that in-between state,
   which no file holds: not at the start, not in the
   half-step (progress in, revisions out), not at the end. `windows.mjs` names a
   revision that touches one of those three paths, so it misses this one. The
   0.3 days still land on the revision side; only the name is missing. This is
   a real limit of the method, not a seeding artefact. The fix would be to
   attribute each revision by taking it out of the end file and re-running
   (leave one out). That costs one CPM run per revision, about 1 s each on CCA,
   and a real update can hold hundreds of revisions, so it is listed in
   NEXT.md rather than done here.
2. *An inserted activity that moved nothing.* CCA seed 3, window 3: a 3-day
   activity inserted between T16TS01808C0 and T16TS01813C0, a link driving
   after a calendar swap on T16P109901C0 in the same window; finish moved 0,
   and the link is on none of the three paths. Naming nothing for a change that moved nothing is defensible.
3. *A deleted link that moved nothing.* terminal-building-airport seed 1,
   window 1: FS BA-P3-70 -> BA-P3-90 deleted after a duration cut on BA-P2-10;
   revisions 0, the window's movement (-1 day) is all progress. Same reading
   as 2.

**What the first run found in the seeding (fixed in the planter, not the
tool).** The first `--mixed 2` run left 7 of 21 gains unnamed, each with a
progress effect of 0. None of them was a gain:

- *Expected finish dates.* example_xer_file's A15460 has `expect_end_date`
  set and the project schedules with expected end dates, so P6 (and `cpm.mjs`)
  recompute its remaining duration from that date: cutting
  `remain_drtn_hr_cnt` changes nothing.
- *Finish held by an FF predecessor.* CCA's metal-stud activities
  (T16P109201C0, T16P209201C0, ...) each have FF links from two or three
  predecessors, which hold their early finish: less remaining duration does
  not bring it in.

`windows.mjs` was right to name nothing in both cases. The gain planter now
skips work with an expected finish and keeps a cut only when the activity's
own forecast finish comes in. The nine-kinds check, rerun after that change
(the planter's new random draws alter some picks): 80 planted, 80 split exactly,
on the right side, and named, as before (`windows-kinds-check-2026-11-24.txt`).

**Limits.** The series are statused-as-planned copies of one real file, not
real consecutive updates (none are public). Two or three changes per window
is still fewer than a real update holds. The expected split comes from this
repository's own CPM engine, so the check is of the split and the naming,
not of P6.
