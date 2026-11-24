# Windows analysis on nine more kinds of change, 2026-11-24

**Question.** The first windows check (`windows-check-2026-11-19.md`)
planted three kinds of change, all of them delays: a slip in remaining
duration, a lag, and a longer duration. A real job's updates also hold late
starts, gains, early finishes, constraints, inserted activities, deleted and
retyped links, calendar swaps and duration cuts. Does `windows.mjs` put each
one on the right side of the split (progress or revisions), split it exactly,
and name the activity or link behind it?

**Data.** The same six public XER files (`bash eval/corpus-fetch.sh DIR`).
Each one is the first update of a series made by `status.mjs`: statused as
planned every 20 working days, with one kind of change planted in each window,
on the driving path at the start of that window. The nine kinds come in a
seed-shuffled order, so each kind meets the schedule at several stages.

| Kind | Side | What is planted |
|---|---|---|
| late-start | progress | an unstarted activity forecast to start in the window stays unstarted (nothing after it had started either) |
| gain | progress | work under way has 1-5 fewer days left than forecast |
| early-finish | progress | work under way, every predecessor complete, finishes at the data date |
| constraint | revisions | start on or after, 1-5 days after the early start |
| added | revisions | a new 1-5 day activity inserted into a driving FS link |
| link-deleted | revisions | a driving FS link deleted where both ends keep other links (no open end) |
| calendar | revisions | an unstarted activity moved to another calendar in the file that moves the finish |
| cut | revisions | original and remaining duration of an unstarted activity cut 1-5 days |
| type | revisions | a driving FS link retyped SS |

**Method.** `node eval/windows-kinds-check.mjs DIR --seeds 3 --json eval/windows-kinds-check-2026-11-24.json`
(output: `windows-kinds-check-2026-11-24.txt`). Expected split from
counterfactual files, as in the first check: the progress effect is the finish
of the window's file with its progress and without its revision, against the
previous update; the revision effect is the rest. Checked per planted window:
the split equals that exactly, the other side is 0, and the planted activity
or link is among the window's drivers on its own side.

**Result after the two fixes below.** 18 series, 162 windows, 80 planted,
0 errors.

| Kind | Planted | Finish moved | Split exact | Other side 0 | Named |
|---|---|---|---|---|---|
| late-start | 5 | 5 | 5 | 5 | 5 |
| gain | 9 | 7 | 9 | 9 | 9 |
| early-finish | 9 | 6 | 9 | 9 | 9 |
| constraint | 12 | 12 | 12 | 12 | 12 |
| added | 10 | 10 | 10 | 10 | 10 |
| link-deleted | 6 | 3 | 6 | 6 | 6 |
| calendar | 4 | 4 | 4 | 4 | 4 |
| cut | 12 | 9 | 12 | 12 | 12 |
| type | 13 | 9 | 13 | 13 | 13 |

All 18 series add up (sum of windows = first-to-last movement) and come back
in data-date order after being handed over shuffled. The first check, rerun
after the fixes: 144 of 144 windows split exactly, 86 of 86 planted named,
unchanged.

**What the first run found, and what changed.**

1. **Gains were not named (0 of 9).** Work under way that went faster than
   forecast pulled the finish in, and the split was right, but the window named
   nothing for it: the driver list only took work whose forecast finish moved
   *later*. A window that recovered time now names the work that recovered it
   ("in progress, forecast finish ... (-3 working days, ahead of the forecast)"),
   marked `gain`, and kept out of the "named in the most windows" list, which is
   where the job lost its time. Unit test: `windows.test.mjs`, "a gain on the
   driving path is named".
2. **A deleted link that pulled the finish in 2.9 days was not named** (CCA,
   seed 1, window 7). Progress in the same window had moved the driving path,
   so the link was on neither the path at the start nor the one at the end. The
   revisions act on the half-step schedule (this period's progress in, the
   revisions not yet), so `compare.mjs` now reports that schedule's driving
   path (`criticalPath.halfStep`) and a revision touching it is named.
   Rerun with the first run's seeding (`--out-of-sequence --only CCA... --seeds 1`):
   named.

**Seeding note.** The first run also let early-finish plant on work already
out of sequence (CCA's TEXCO04405C0, started before its FS predecessor
T15CO04407C0 finished). Completing it moved the finish 19.4 days *later*: the
engine keeps a completed activity's node behind an unfinished predecessor, and
its SS successors followed. That is a property of out-of-sequence progress,
not a gain, so the planter now takes in-sequence work only; `--out-of-sequence`
keeps the first behaviour. Whether P6 moves the finish the same way in that
case is not checked here (no P6 to run it on).

**Where nothing was planted.** hotel-project: 0 of 27. Its driving path is one
activity, the constrained finish milestone ATWTPR000, so no driving work exists
to change. Expressway plants 3-4 of 9 a series: its path is short and runs
through SS links and a 7-day calendar, so many kinds find no candidate.
Calendar plants need a second calendar that moves the finish: 4, all on CCA.

**Finish moved.** A planted change does not always move the finish (the
"Finish moved" column): a cut on an activity with a parallel path as long, a
link retype where the successor had another driving predecessor. Those
windows still check that the split is 0 on both sides and the change is named.

**Limits.** The series are made from one real file by statusing as planned,
not real consecutive updates (none are public; `compare-check-2026-11-19.md`).
One change per window; a real window holds many at once, which the first
check's window 4 (slip and lag together) covers for two kinds only. The
expected split comes from this repository's own CPM engine (checked against
P6's stored dates on the same files, `cpm-vs-p6-2026-11-19.md`), so the check
is of the split and the naming, not of P6 itself.
