# Resource levelling on P6 resource curves, 2026-11-22

**Question.** `level.mjs` levelled every assignment at its average rate
(remaining units / remaining hours) over its whole span. A P6 assignment on a
resource curve (`TASKRSRC.curv_id`, `RSRCCURVDATA`) uses its units at the
curve's rate instead: a Back Loaded crew at 0.7 of its average in the first
half and 1.3 in the second. Does levelling on the curve (opt-in
`opts.curves`, CLI `--curves`, page "Spread each assignment") keep a valid
levelled schedule, and how far does it move the result?

**Method.** Each curved assignment's span is cut into the curve's twenty
slices of working time on the activity's calendar (`curvePieces` in
`level.mjs`: piece k covers working minutes round(k d/20) to
round((k+1) d/20) and holds the slice's share of rate x d), each a span of its
own in the leveller. A curve read as exactly even (P6's Linear) or one the
file does not carry levels as before; the second gets a warning. The curve
reading is `curves.mjs`'s (eval/resource-curves-2026-11-21.md).

Data: the six public XER files of eval/cpm-vs-p6-2026-11-19.md (fetched, not
committed).

1. **Real curves:** `node eval/level-curves.mjs <dir> --scales 50,100,200,400 --json eval/level-curves-2026-11-22.json`.
   Only the resources that carry a curved assignment are levelled, at the
   file's limits times each scale, even and on the curve.
2. **Planted curves:** `node eval/level-curves.mjs <dir> --plant 0.3 --seed 1 --json eval/level-curves-planted-2026-11-22.json`.
   P6's five shipped curves (values as CCA carries them) set at random on 30%
   of the not-started assignments of every resource with a limit, every
   resource levelled at the file's own settings, then: the self-check (hours
   over a limit while a placed activity uses it, must be 0), every zero-lag
   FS/SS/FF link between not-started activities (checked by the script), no
   activity before its unlevelled early start, and limits x1e6 with curves on
   (the levelled dates must equal CPM).
3. Unit tests (`level.test.mjs`): the two shapes below, a missing and a linear
   curve level exactly as no curve, off by default, and the pieces' units sum
   to rate x duration for 1 to 4,801 minutes on three curves.

**Result 1: real curves.** Only CCA (P6 6.0) carries curves on assignments
the leveller sees. 36 of its 36,808 assignments name a curve the file holds;
35 are on level of effort or WBS summary activities, which levelling leaves
out (as P6 does). The one left, UZ9GZ27053R2 "PCO 119, CUP- Electrical", is on
the file's own late-bell curve PCO119 at 133.7 units an hour on average,
347.5 in its peak slice, on LAB GEN (limit 1 per hour, P6's default, so the
runs scale it).

| LAB GEN limit | Even: levelled finish | delayed | Curve: levelled finish | delayed | Peak before (even / curve) |
|---|---|---|---|---|---|
| x50 | 2014-04-30 16:59 (+260 d) | 268 | 2014-06-10 10:35 (+293.3 d) | 297 | 243.5 / 427.3 |
| x100 | 2013-09-02 11:00 (+60.4 d) | 126 | 2013-08-28 16:48 (+57.0 d) | 97 | 243.5 / 427.3 |
| x200 | 2013-06-22 16:59 (+0 d) | 8 | 2013-06-22 16:59 (+0 d) | 48 | 243.5 / 427.3 |
| x400 | 2013-06-22 16:59 (+0 d) | 0 | 2013-06-22 16:59 (+0 d) | 3 | 243.5 / 427.3 |

Self-check 0 h, no activity before its early start and no zero-lag FS link
broken on all eight runs. At x200 the curve's peak (347.5) is over the limit
(200) on its own, so that activity is listed as unfittable (left 1), as an
even assignment over its limit is.

One assignment moves the levelled finish both ways: 3.4 working days earlier
at x100 (its light early slices let other work in), 33 days later at x50 (its
peak needs a gap the average did not).

**Result 2: planted curves.**

| File | Planted (of open assignments on limited resources) | Levelled on a curve (non-linear) | Even finish | Curve finish | Self-check | Links hold | Earlier | x1e6 = CPM |
|---|---|---|---|---|---|---|---|---|
| hotel (6.0) | 703 of 2,278 | 567 | 2021-03-15 | 2021-10-24 | 0 / 0 h | 6,250 / 6,250 | 0 | 4,236 / 4,236 |
| example (24.12) | 431 of 1,397 | 333 | 2027-06-16 | 2027-07-28 | 0 / 0 h | 454 / 454 | 0 | 404 / 404 |
| CCA (6.0) | 8,313 of 26,769 | 3,673 | 2042-10-12 | 2042-12-23 | 0 / 0 h | 29,879 / 29,879 | 0 | 14,270 / 14,270 |
| Expressway (7.0) | 1,079 of 3,519 | 875 | 2045-05-01 | 2044-09-25 | 0 / 0 h | 990 / 990 | 0 | 823 / 823 |

terminal and sample have no limited resource. Planted assignments on level of
effort or WBS summary activities, or with no units, are not levelled either
way, so fewer are levelled on a curve than planted. The even runs give the
same finishes as eval/level-check-2026-11-19.md on all four files (the
default path is unchanged). The lower bound is the same both ways (a curve
moves work in time, not the amount). Time: hotel 14 s even, 25 s curved;
CCA 227 s and 273 s.

**Reading.** Levelling on curves keeps every limit, every link and every
early start, and with no binding limit changes nothing. The finish moves
either way, by up to 7 months on hotel (peaks over the 1-1.5 crews) and 7
months earlier on Expressway.

**Not settled.** Whether P6's own leveller levels on the curve or the
average: no public XER stores P6-levelled dates for a curved assignment
(eval/level-check-2026-11-19.md: none stores levelled dates at all). So even
stays the default. Started curved assignments are levelled from their
remaining start over the whole curve (how P6 re-fits a curve to remaining
units is not known here, as in earned value).
