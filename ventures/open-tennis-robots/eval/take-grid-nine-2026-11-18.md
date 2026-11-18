# The nine-point take grid on its own held-out sets (2026-11-18)

`eval/take-survey-fresh-2026-11-18.md` scored the take survey's grid offline on sets A, B and C and found the
nine-point grid (0-8 ms by 1) ahead of the shipped one (0, 2, 3, 4, 5, 6, 8 ms) on builds within 0.5 ms: 47, 52 and 49
against 43, 46 and 48, never worse within 1 ms. It left the grid unchanged: the result came from the same rows that
suggested it, and the grid change costs two fits a wheel and a longer TAKE_SURVEY frame. This file decides it on
sets no run has used.

**A bias in the earlier comparison.** A to C's off-grid takes were 1, 2.5, 3.5, 4.5, 5.5 and 7 ms. Two of the six
(1 and 7 ms) sit *on* the nine-point grid's added points, so those sets gave the nine-point grid takes where its
own grid point is the answer. Real contact times are not on anyone's grid. The fresh sets here use takes on the
half-millisecond, 0.5 to 7.5 ms, which sit off both grids (each is half a millisecond from the nearest nine-point
point), plus the instant build (0 ms) as the advice check. 0.5 and 1.5 ms fall in the shipped grid's 0-2 gap, 6.5 and
7.5 ms in its 6-8 gap, the other four between points both grids share.

Script: `tests/take_survey_pick.py --capture ... --takes "0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,0"` (the `--takes` option is
new in this run; without it the script captures A to C's takes as before, and `--score` on set C reproduces the
fresh file's grid table exactly), then `--score` and `--grids "0,2,3,4,5,6,8;0,1,2,3,4,5,6,7,8"`.

Fresh sets, neither lag nor seed used by an earlier take capture: D, wheel lag 0.4 s, seed 53; E, 0.7 s, seed 59;
F, 0.55 s, seed 61. 54 survey drills each (nine takes, two tachs, three launchers).

## Prediction (written and committed before any of D, E, F was captured)

With the parabola pick, rounded to 0.5 ms as the Pi rounds it, pooled over D, E and F:

- (p1) the nine-point grid has more builds within 0.5 ms than the shipped grid, but the margin is smaller than on
  A to C relative to the number of builds (A to C: +11 of 162), because the half-millisecond takes take away the
  on-point advantage;
- (p2) the gain sits in the 0.5 and 1.5 ms takes (the shipped grid's 0-2 gap); between 2 and 6 ms the two grids
  agree on at least 90% of builds;
- (p3) no instant build is advised on either grid.

## Decision rule (written with the prediction)

`TAKE_SURVEY_GRID_US` becomes 0-8 ms by 1 (firmware `controller.py` and `config.py`, the Pi's `host.TAKE_SURVEY_MS`
and `protocol.TAKE_SURVEY_TIMES`, the older-frame decode kept) only if, pooled over D, E and F with the parabola:

1. the nine-point grid has more builds within 0.5 ms than the shipped grid;
2. no fewer within 1 ms;
3. no fewer spread takes named within 1 ms and advised;
4. no more instant builds advised;
5. and on no single set does it have fewer builds within 0.5 ms than the shipped grid by more than 2.

Otherwise the shipped grid stays. A tie on clause 1 keeps the shipped grid (the nine-point one costs two fits a
wheel). The spline is reported, not decided (`TAKE_SURVEY_SPLINE` stays as it is).

## Results

Rows (every surveyed wheel's periods and ticks): `take-grid-nine-d-2026-11-18.jsonl.gz`, `-e-` and `-f-`. Full
per-build tables, the by-take verdicts of both grids and the `--grids` lines: `take-grid-nine-d-2026-11-18.txt`, `-e-`
and `-f-`. No drill aborted (162 of 162). The capture took about 2 minutes a set on four cores, the scoring about 3.

### The decision: the shipped grid stays

Parabola, verdicts rounded to 0.5 ms, from `--grids`:

| | D (0.4 s, 53) | E (0.7 s, 59) | F (0.55 s, 61) | pooled |
| --- | --- | --- | --- | --- |
| within 0.5 ms, shipped / nine-point | 48 / 48 | 47 / 47 | 46 / 46 | **141 / 141** |
| within 1 ms | 48 / 52 | 47 / 50 | 47 / 50 | 142 / 152 |
| spread takes named within 1 ms and advised | 32 / 33 | 29 / 30 | 31 / 30 | 92 / 93 |
| instant builds advised | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

Clause 1 needed more builds within 0.5 ms and got an exact tie, on every set. Clauses 2 to 5 held. A tie keeps the
shipped grid, so `TAKE_SURVEY_GRID_US` stays 0, 2, 3, 4, 5, 6, 8 ms. Nothing in the firmware changes.

### The predictions

- (p1) **failed.** The margin did shrink, as predicted (A to C: +11; here 0), but the nine-point grid did not have
  more builds within 0.5 ms.
- (p2) **half held.** Between 2 and 6 ms the grids gave the same verdict on 68 of 72 builds (94%, the bar was 90%).
  But the gain was not in the 0.5 ms takes: there the nine-point grid did *worse* (14 of 18 within 0.5 ms against 17;
  three builds read 1.5 where the shipped grid read 0 or 1). At 1.5 ms it did better (9 of 18 against 7).
- (p3) **held.** No instant build advised on either grid.

### What the tie hides (reported, not decided)

The bar the rule used is coarse at half-millisecond takes. The Pi rounds to 0.5 ms, so on a 6.5 ms take the shipped
grid's 6.0 and the nine-point grid's 6.5 both count as within 0.5 ms; so do the shipped grid's 8.0 on every 7.5 ms take
(18 of 18 builds read the grid's end) and the nine-point grid's 7.0 and 7.5. Other measures, all from the same tables
and not part of the rule:

| | shipped | nine-point |
| --- | --- | --- |
| mean absolute verdict error, 162 builds | 0.53 ms | 0.45 ms |
| builds off by more than 1 ms | 20 | 10 |
| 1.5 ms takes, mean absolute error | 1.11 ms | 0.78 ms |
| 6.5 ms takes | 0.47 ms | 0.22 ms |
| 7.5 ms takes (shipped: every one read 8.0) | 0.50 ms | 0.31 ms |
| 0.5 ms takes | 0.75 ms | 0.78 ms |

So the nine-point grid halves the builds that miss by more than a millisecond, mostly 1.5 ms takes the shipped
grid reads as 0 (an instant build). Whether that is worth two more fits a wheel (nine instead of seven, about 29% more
survey time on the board) and a frame change is a new question with a new primary measure. Choosing that
measure after seeing these tables and adopting on these rows would be the forking path the rule exists to stop. It
needs a fresh set with the measure (builds off by more than 1 ms, or mean absolute error) named first.

**The board still reads below the residual's own least.** On every set the dense least sat within 0.12 ms of the true
take on the capture tach (-0.02, -0.02, -0.12), and the parabola read 0.29 to 0.39 ms below it, the lean
`eval/take-survey-fresh-2026-11-18.md` found on A to C. The nine-point grid does not remove that lean. It shortens the
span the parabola bridges.

## Not known

All simulated: the simulator's first-order wheel and continuous half-sine take. One seed per set, three sets. The
nine-point grid's verdicts are scored offline from dense refits of wheels the board surveyed on the shipped grid.
The trim and blind rule are the board's, but a board running nine candidates was not simulated end to end.
