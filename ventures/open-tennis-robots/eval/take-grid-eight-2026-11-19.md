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

(Filled in after the capture.)
