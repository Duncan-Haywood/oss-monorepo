# The nine-point take grid on fresh sets, with the error measure named first (2026-11-18)

`eval/take-grid-nine-2026-11-18.md` kept the shipped take-survey grid (0, 2, 3, 4, 5, 6, 8 ms) because its rule's
first clause, builds within 0.5 ms, tied the nine-point grid (0-8 ms by 1) exactly on sets D to F (141 of 162 each).
On the same tables, outside the rule, the nine-point grid halved the builds off by more than 1 ms (10 against 20) and
had the lower mean absolute error (0.45 against 0.53 ms). Adopting on those measures after seeing them would be the
forking path the rule exists to stop. This file names them first and tests them on sets no run has used.

**Why the measure changes.** Within 0.5 ms is a coarse bar when the Pi rounds the verdict to 0.5 ms: a take of 6.5 ms
read as 6.0 or 6.5 counts the same. What costs a user is a large miss. A 1.5 ms take read as 0 tells the operator
the wheel grips the ball for no time at all, and the take survey's advice on re-flashing `TAKE_US` then points the
wrong way. So the primary measure here is **builds off by more than 1 ms**, with the mean absolute error as a guard.

**A second bias fixed.** D to F's takes all sat on the half-millisecond, exactly 0.5 ms from every nine-point point.
Real contact times fall anywhere. G to I draw one take uniformly in each millisecond, 0-1 to 7-8 ms, with the
fraction kept between 0.1 and 0.9 so no take lands on a grid point, rounded to 0.05 ms, from Python's
`random.Random(20261118)`, drawn once before any capture and not redrawn:

    0.8, 1.75, 2.35, 3.15, 4.1, 5.4, 6.5, 7.45 ms, plus the instant build (0 ms) as the advice check

Fresh sets, neither lag nor seed used by an earlier take capture (used before: lag 0.35, 0.4, 0.45, 0.5, 0.55, 0.6,
0.7, 0.8 s; seeds 29, 31, 37, 43, 47, 53, 59, 61): G, wheel lag 0.65 s, seed 67; H, 0.42 s, seed 71; I, 0.75 s,
seed 73. 54 survey drills each (nine takes, two tachs, three launchers).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture rows.jsonl --lag 0.65 --seed 67 --takes "0.8,1.75,2.35,3.15,4.1,5.4,6.5,7.45,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --score rows.jsonl.gz --grids "0,2,3,4,5,6,8;0,1,2,3,4,5,6,7,8"

`--grids` now prints the two measures ("Error measures"). On set D it reproduces the earlier file's tables.

## Prediction (written and committed before any of G, H, I was captured)

With the parabola pick, verdicts rounded to 0.5 ms as the Pi rounds them, pooled over G, H and I (162 builds):

- (q1) the nine-point grid has fewer builds off by more than 1 ms than the shipped grid, by at least 4;
- (q2) its mean absolute error is lower;
- (q3) most of the shipped grid's large misses sit at the 0.8 and 1.75 ms takes (its 0-2 gap) and the 7.45 ms take
  (read as 8.0 is 0.55 off, so not a large miss; the large misses there come from the jittery tach if at all);
- (q4) no instant build is advised on either grid.

## Decision rule (written with the prediction)

`TAKE_SURVEY_GRID_US` becomes 0-8 ms by 1 (firmware `controller.py` and `config.py`, the Pi's `host.TAKE_SURVEY_MS`
and `protocol.TAKE_SURVEY_TIMES`, with the older seven-value frame still decoded) only if, pooled over G, H and I with
the parabola:

1. the nine-point grid has fewer builds off by more than 1 ms than the shipped grid by **at least 4** (a margin
   because the nine-point grid costs two more fits a wheel, about 29% more survey time, and a frame change);
2. its mean absolute error is no higher;
3. it has no fewer builds within 0.5 ms than the shipped grid by more than 3;
4. no fewer spread takes named within 1 ms and advised by more than 2;
5. no more instant builds advised;
6. and on no single set does it have more builds off by more than 1 ms than the shipped grid.

Otherwise the shipped grid stays. The spline is reported, not decided.

## Results

Rows: `take-grid-fresh-g-2026-11-18.jsonl.gz`, `-h-` and `-i-`. Full tables, the by-take verdicts of both grids and
the error measures: `take-grid-fresh-g-2026-11-18.txt`, `-h-` and `-i-`. No drill aborted (162 of 162). Each set
took about 15 minutes to capture on four cores and about 3 to score.

### The decision: the shipped grid stays

Parabola, verdicts rounded to 0.5 ms:

| | G (0.65 s, 67) | H (0.42 s, 71) | I (0.75 s, 73) | pooled |
| --- | --- | --- | --- | --- |
| builds off by more than 1 ms, shipped / nine-point | 5 / 5 | 4 / 3 | 5 / 4 | **14 / 12** |
| mean absolute error, ms | 0.572 / 0.454 | 0.519 / 0.415 | 0.509 / 0.474 | 0.533 / 0.448 |
| within 0.5 ms | 29 / 39 | 29 / 41 | 35 / 41 | 93 / 121 |
| within 1 ms | 49 / 49 | 50 / 51 | 49 / 50 | 148 / 150 |
| spread takes named within 1 ms and advised | 31 / 31 | 32 / 33 | 33 / 33 | 96 / 97 |
| instant builds advised | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

Clause 1 needed at least 4 fewer large misses and got 2. Clauses 2 to 6 held. So `TAKE_SURVEY_GRID_US` stays 0, 2,
3, 4, 5, 6, 8 ms and nothing in the firmware changes.

### The predictions

- (q1) **failed.** Fewer large misses, but by 2, not 4.
- (q2) **held.** Mean absolute error 0.448 against 0.533 ms.
- (q3) **half held.** No large miss at 7.45 ms on either grid, as predicted (the shipped grid read all 18 as 8.0,
  0.55 off). But none at 0.8 ms either (read as 0, 0.8 off). The shipped grid's 14 large misses: 7 at 1.75 ms, 4 on
  instant builds, 3 at 2.35 ms. The nine-point grid's 12: 7 at 1.75 ms, 4 on instant builds, 1 at 2.35 ms.
- (q4) **held.** No instant build advised on either grid.

### Why the large misses barely move: they are the fit's, not the grid's

The two grids share most of their large misses. On 1.75 ms takes, 5 builds read 0 on *both* grids (G 2, H 2, I 1)
and one I build read 3.5 on both; on instant builds, the same 4 builds read 1.5 to 2.5 ms on both. A grid point at 1 ms cannot help a wheel
whose residual curve bottoms out at 0 or at 2.5: the error is in the survey's residual curve, below the pick. This
matches `eval/take-survey-fresh-2026-11-18.md` (the dense least sits near the true take on the capture tach but
wanders on the jittery one) and README "Take-blind rows traced". All 10 shared large misses are on takes under
2 ms (instant builds included), on both tachs.

### What the nine-point grid does buy (reported, not decided)

Builds within 0.5 ms rose from 93 to 121, on a measure the D to F rule used and tied on. Here, with takes off the
half-millisecond, the Pi's 0.5 ms rounding no longer hides the gaps: every 7.45 ms take read 8.0 on the shipped grid
(18 of 18 outside 0.5 ms) and 15 of 18 read 7.0 or 7.5 on the nine-point grid; the 0.8 and 1.75 ms takes moved from 4
within 0.5 ms to 17. Adopting on that measure after seeing it twice disagree (tie on D to F, +28 here) would be the
forking path again. Two fresh questions follow, each needing its own pre-registered set: an eight-point grid that adds
only 7 ms (one fit a wheel, not two, aimed at the grid's end bias), scored on builds within 0.5 ms at uniform takes;
and the fit's take-blindness under 2.5 ms on the jittery tach, which no grid fixes.

The spline (reported only) did worse with more candidates on large misses: 12 shipped against 16 nine-point, pooled.

## Not known

All simulated: the simulator's first-order wheel and continuous half-sine take. One seed per set, three sets, one
draw of takes. The nine-point verdicts are offline refits of wheels the board surveyed on the shipped grid, not a
nine-candidate board run end to end.
