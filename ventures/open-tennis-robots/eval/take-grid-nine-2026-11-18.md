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
