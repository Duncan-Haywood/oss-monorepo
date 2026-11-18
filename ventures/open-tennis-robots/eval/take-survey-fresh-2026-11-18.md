# A fresh take survey with the stretched offsets live (2026-11-18)

firmware/esp32/README.md, "The take fit's four parts and its high reading", shipped `TAKE_MATCH_SPREAD = True`: the
take fit's four half-sine offsets stretched to the half-sine's own variance. That section refitted *stored* survey
wheels offline. This file runs fresh survey drills with the stretched offsets live on the simulated board, on two sets
no earlier run used, and asks the two questions that section left (NEXT.md, "Buildable here"): do 7 ms takes still
read the grid's end (8 ms), and do the 3 ms takes on the grid still read low?

Script: `tests/take_survey_pick.py --capture` (unchanged), then `--score` and `--grids`.

Fresh sets: A, wheel lag 0.35 s, seed 37; B, wheel lag 0.8 s, seed 43. 54 survey drills each (nine takes, two
tachs, three launchers).

## Prediction (written and committed before either set was captured)

On the capture tach (1/8 us), over both fresh sets:

- (a) the board's verdict (the parabola's pick, rounded to 0.5 ms as the Pi rounds it) on the 7 ms takes is below
  8.0 on at least 3 of the 6 builds;
- (b) the dense least's signed mean on the off-grid takes (1, 2.5, 3.5, 4.5, 5.5, 7 ms) is within +-0.15 ms on each
  set;
- (c) the board's verdict on the 3 ms takes is within 0.5 ms on at least 5 of the 6 builds;
- (d) no instant build (0 ms) is advised, on either tach.

## Decision rule (written with the prediction)

This is a check of shipped code, so nothing changes in firmware if all four hold. If (a) fails, the residual's least
sits near 7 while the grid's sums still pin the pick at its end, and the next item is a grid point between 6 and 8
(scored offline with `--grids "0,2,3,4,5,6,8;0,2,3,4,5,6,7,8"` here; adopting it needs its own held-out set). If (b)
fails, the stretched offsets' gain did not carry to fresh wheels and `TAKE_MATCH_SPREAD` is questioned in the README.
If (c) or (d) fails, it is recorded as an open item.

## Second prediction: the spline pick, on a third set (written after A and B were scored, before C was captured)

A and B (scored below) showed something the first prediction did not ask about. With the offsets stretched, the
residual curve's dense least now sits on the true take (+0.08 and -0.12 ms on the capture tach), and the parabola's
pick between grid sums reads about half a millisecond below it (-0.51 and -0.50 ms off-grid on the capture tach).
Before the stretch the parabola's low lean was partly cancelling the fit's high reading. The natural spline
(`survey_spline_pick`, shipped for the ESC-lag survey) read -0.38 and -0.29. On the shipped grid, A and B together:
within 0.5 ms 92 spline against 89 parabola, within 1 ms 105 against 104, named and advised 58 each, no instant build
advised. That margin is small and was found on the same rows, so it decides nothing.

Set C: wheel lag 0.5 s, seed 47 (unused by any earlier set).

- (e) on the capture tach the parabola's signed mean on the off-grid takes is below -0.3 ms, and the spline's is closer
  to zero than the parabola's;
- (f) on the shipped grid the spline has at least as many builds within 0.5 ms as the parabola.

Decision rule: the take survey's report moves to the spline (`TAKE_SURVEY_SPLINE = True`, a new flag, built off) only
if on set C the spline has more builds within 0.5 ms than the parabola, no fewer within 1 ms, no fewer spread takes
named within 1 ms and advised, and no more instant builds advised (all from `--grids` on the shipped grid). Otherwise
the flag stays off. The nine-point grid is reported, not decided: it changes the TAKE_SURVEY frame and costs two fits a
wheel, so it needs its own run.

## Results

Rows (every surveyed wheel's periods and ticks, so every number here can be refitted):
`take-survey-fresh-a-2026-11-18.jsonl.gz`, `-b-` and `-c-`. Full per-build tables: `take-survey-fresh-a-2026-11-18.txt`,
`-b-` and `-c-` (`--score` then `--grids`). No drill aborted (162 of 162).

### First prediction (sets A and B): all four held

| clause | A (lag 0.35 s, seed 37) | B (lag 0.8 s, seed 43) | held |
| --- | --- | --- | --- |
| (a) 7 ms takes, capture tach, verdict below 8.0 | 3 of 3 (7.0, 6.5, 6.5) | 3 of 3 (6.5, 6.5, 7.0) | yes, 6 of 6 (needed 3) |
| (b) dense least, off-grid signed mean, capture | +0.08 ms | -0.12 ms | yes |
| (c) 3 ms takes, capture tach, verdict within 0.5 ms | 2 of 3 (one read 1.5) | 3 of 3 | yes, 5 of 6 (at the bar) |
| (d) instant builds advised | 0 of 6 | 0 of 6 | yes |

Before the stretch, every 7 ms take on the design set read the grid's end (8.0). With the stretched offsets live none
of the six capture-tach builds did; one jittery-tach build on B still read 8.0. The residual's own least now sits on
the true take. What it exposed: the parabola reads below that least, -0.59 and -0.38 ms on the capture tach's off-grid
takes, so the board's pick reads takes about half a millisecond short (-0.51 and -0.50 against the truth).

### Second prediction (set C, lag 0.5 s, seed 47): held, and the rule keeps the parabola

| | parabola | spline |
| --- | --- | --- |
| off-grid signed mean, capture tach | -0.38 ms | -0.27 ms |
| shipped grid: within 0.5 ms (Pi's rounding) | 48 / 54 | 48 / 54 |
| within 1 ms | 53 / 54 | 53 / 54 |
| spread takes named within 1 ms and advised | 38 / 48 | 38 / 48 |
| instant builds advised | 0 / 6 | 0 / 6 |

(e) held: the parabola read below -0.3 ms and the spline closer to zero. (f) held: a tie. The decision rule needed the
spline to have *more* builds within 0.5 ms; it tied, so `TAKE_SURVEY_SPLINE` ships built and **off**. The spline's
smaller lean washes out in the Pi's rounding to 0.5 ms, and on the 7 ms takes it read lower than the parabola (-0.54
against -0.42 on C), so it is not a clean improvement.

### The nine-point grid (reported, not decided)

Within 0.5 ms with the parabola, shipped grid against 0-8 ms by 1: A 43 against 47, B 46 against 52, C 48 against 49.
Within 1 ms: 50/52, 54/54, 53/53. It never lost on these three sets, gained most on the sets where the board read
low, and adding 7 alone did nothing (43, 47, 48). The likely source is the 1 ms point: on the shipped grid, with no
point between 0 and 2, the 1 ms takes read 0 on 16 of 18 builds (8 of 9 on the capture tach), each still within 1 ms
and none advised (share 1.00). Adopting it changes the TAKE_SURVEY frame and
costs two fits a wheel, so it is the next item, to be decided on its own held-out set.

## Not known

All simulated: the simulator's first-order wheel and continuous half-sine take. One seed per set. A real ball's force
profile is not known to be a half-sine.
