# An eight-point take grid (adding 7 ms) on fresh sets, builds within 0.5 ms named first (2026-11-19)

`eval/take-grid-fresh-g-i-2026-11-18.md` kept the shipped take-survey grid (0, 2, 3, 4, 5, 6, 8 ms): the nine-point
grid (0-8 ms by 1) cut builds off by more than 1 ms by 2, not the 4 its rule asked. Outside that rule, builds within
0.5 ms rose from 93 to 121, and every 7.45 ms take read 8.0 on the shipped grid. It named the cheaper fix to test
next: an **eight-point grid, 0, 2, 3, 4, 5, 6, 7, 8 ms**, one more fit a wheel (not two) aimed at the grid's end, with
builds within 0.5 ms named as the measure before the capture. This file does that.

**Why within 0.5 ms here.** The large misses (off by more than 1 ms) are the fit's, not the grid's: G to I's ten
shared ones all sit on takes under 2 ms, where the 7 ms point cannot reach. What the 7 ms point can change is the
verdict between 6 and 8 ms, where the shipped grid's parabola has only 6 and 8 to bend between. A take of 7 ms read
as 8.0 tells the operator to flash `TAKE_US` a millisecond long; the drop fit's ball moment then lands late.

**Seen before the rule (context only, not the decision).** The stored G to I rows refitted offline with the
eight-point grid, parabola, Pi rounding (`--grids "0,2,3,4,5,6,8;0,2,3,4,5,6,7,8;0,1,2,3,4,5,6,7,8"`):

| | G | H | I | pooled |
| --- | --- | --- | --- | --- |
| within 0.5 ms, shipped / eight / nine | 29 / 33 / 39 | 29 / 34 / 41 | 35 / 41 / 41 | 93 / 108 / 121 |
| off by more than 1 ms, shipped / eight / nine | 5 / 5 / 5 | 4 / 4 / 3 | 5 / 5 / 4 | 14 / 14 / 12 |
| mean absolute error, ms | 0.572 / 0.506 / 0.454 | 0.519 / 0.491 / 0.415 | 0.509 / 0.456 / 0.474 | |

These rows chose the question, so they cannot answer it.

**The takes, and one design change made before any capture.** A first draw in the G to I style (one take per
millisecond, `random.Random(20261119)`) gave 0.75, 1.65, 2.65, 3.6, 4.9, 5.8, 6.3, 7.9 ms: no take between 6.5 and
7.5 ms, the only band where the 7 ms point can move a verdict across the 0.5 ms bar. That set would test the
question at one take or none, so before any capture the draw was replaced by a stratified one that weights the band
the added point touches, from `random.Random(20261120)`: one take in each millisecond 0-5 and one in each half
millisecond 5-8, the fraction kept between 0.1 and 0.9, rounded to 0.05 ms, plus the instant build:

    0.45, 1.5, 2.35, 3.25, 4.2, 5.1, 5.95, 6.1, 6.6, 7.15, 7.75 ms, and 0 (the instant build, the advice check)

The weighting is on purpose and named here: half the takes sit at 5 ms and above, so the pooled within-0.5 ms count
measures the grid where it differs, not a user's spread of contact times (which no one has measured).

Fresh sets, neither lag nor seed used by an earlier take capture (used: lag 0.35, 0.4, 0.42, 0.45, 0.5, 0.55, 0.6,
0.65, 0.7, 0.75, 0.8 s; seeds 29 to 73): J, wheel lag 0.48 s, seed 79; K, 0.38 s, seed 83; L, 0.68 s, seed 89. 72
survey drills each (twelve takes, two tachs, three launchers). The board surveys on the shipped grid and every grid's
verdicts are refitted offline from the dense rows, as G to I were.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture rows.jsonl --lag 0.48 --seed 79 --takes "0.45,1.5,2.35,3.25,4.2,5.1,5.95,6.1,6.6,7.15,7.75,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --score rows.jsonl.gz --grids "0,2,3,4,5,6,8;0,2,3,4,5,6,7,8"

## Prediction (written and committed before any of J, K, L was captured)

Parabola, verdicts rounded to 0.5 ms as the Pi rounds them, pooled over J, K and L (216 builds):

- (e1) the eight-point grid has more builds within 0.5 ms than the shipped grid, by at least 6, nearly all of them at
  the 6.6 and 7.15 ms takes;
- (e2) below 5 ms the two grids give identical verdicts on every build (the 7 ms point is outside the parabola's
  three points there);
- (e3) builds off by more than 1 ms are equal on the two grids, within 1;
- (e4) no instant build is advised on either grid.

## Decision rule (written with the prediction)

`TAKE_SURVEY_GRID_US` becomes 0, 2, 3, 4, 5, 6, 7, 8 ms (firmware `controller.py` and `config.py`, the Pi's
`host.TAKE_SURVEY_MS` and `protocol.TAKE_SURVEY_TIMES`, with the older seven-value frame still decoded) only if,
pooled over J, K and L with the parabola:

1. the eight-point grid has at least **6 more** builds within 0.5 ms than the shipped grid (a margin because it costs
   one more fit a wheel, about 14% more survey time, and a frame change);
2. no more builds off by more than 1 ms;
3. its mean absolute error is no higher;
4. no fewer spread takes named within 1 ms and advised by more than 2;
5. no more instant builds advised;
6. and on no single set fewer builds within 0.5 ms than the shipped grid.

Otherwise the shipped grid stays. The nine-point grid and the spline are not scored here.

## Results

Rows: `take-grid-eight-j-2026-11-19.jsonl.gz`, `-k-` and `-l-`. Full tables and the by-take verdicts of both grids:
`take-grid-eight-j-2026-11-19.txt`, `-k-` and `-l-`. No drill aborted (216 of 216). Each set took about 3 minutes to
capture on four cores and about 3 to score.

### The decision: the eight-point grid ships

Parabola, verdicts rounded to 0.5 ms, shipped (0, 2, 3, 4, 5, 6, 8) / eight-point (0, 2, 3, 4, 5, 6, 7, 8):

| | J (0.48 s, 79) | K (0.38 s, 83) | L (0.68 s, 89) | pooled |
| --- | --- | --- | --- | --- |
| within 0.5 ms | 50 / 62 | 48 / 61 | 51 / 62 | **149 / 185** |
| builds off by more than 1 ms | 6 / 6 | 4 / 4 | 5 / 5 | 15 / 15 |
| mean absolute error, ms | 0.443 / 0.353 | 0.432 / 0.339 | 0.514 / 0.426 | 0.463 / 0.373 |
| within 1 ms | 66 / 66 | 68 / 68 | 67 / 67 | 201 / 201 |
| spread takes named within 1 ms and advised | 50 / 50 | 48 / 48 | 48 / 48 | 146 / 146 |
| instant builds advised | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

Clause 1 needed 6 more builds within 0.5 ms and got 36. Clauses 2 to 6 held: the same large misses, a lower mean
absolute error, the same advice, no instant build advised, and more builds within 0.5 ms on every set (+12, +13,
+11). So `TAKE_SURVEY_GRID_US` is now 0, 2, 3, 4, 5, 6, 7, 8 ms in `controller.py` and `config.py`,
`host.TAKE_SURVEY_MS` gained 7, `protocol.TAKE_SURVEY_TIMES` is 8, and the Pi still reads both older frames (seven
candidates with and without the summed-wheel byte; `protocol.OLDER_FORMATS`, `test_seven_candidate_frame_still_reads`).

### The predictions

- (e1) **held, with a correction.** +36, not merely 6. The gains came at 6.6 ms (15: 2 of 18 to 17 of 18 within
  0.5 ms), 7.15 ms (13: 5 to 18) and 6.1 ms (8: 8 to 16). The 6.1 ms gain was not predicted: with only 5 and 8 ms to
  bend through around a least at 6, the shipped parabola read 6.1 ms takes as 5.5 on 10 of 18 builds.
- (e2) **held.** Below 5 ms every verdict is the same on both grids (the by-take tables, 0 to 4.2 ms).
- (e3) **held.** 15 large misses on each grid, the same builds; all sit at 2.35 ms or below, the fit's
  take-blindness under 2.5 ms (`eval/take-grid-fresh-g-i-2026-11-18.md`), which no grid point at 7 ms can reach.
- (e4) **held.** No instant build advised.

### What it costs

One more refit a surveyed wheel. On the simulator's calibration drill (12 balls, `drill.calibration.json`, wheel
lag 0.4 and 0.65 s), the Pi held its balls for the board's surveys 127.4 s against 114.4 s on the seven-point grid
(+13 s, +11%), 10.6 s a ball on average against `host.TAKE_WAIT_S` of 12 s; no ball's survey was cut
(`survey_cut` 0) and 22 wheels were summed on both grids. The TAKE_SURVEY frame grows by two bytes, to 24.

## Not known

All simulated: the simulator's first-order wheel and continuous half-sine take, one seed per set, one draw of takes,
weighted on purpose toward 5-8 ms. The eight-point verdicts are offline refits of wheels the board surveyed on the
seven-point grid, not an eight-candidate board run end to end; the board run above checks the frame, the parser and
the hold time, not the verdicts. A real ball's contact time on a real wheel has not been measured, so how often a real
build's take falls in 6-7.5 ms, where the gain sits, is unknown.
