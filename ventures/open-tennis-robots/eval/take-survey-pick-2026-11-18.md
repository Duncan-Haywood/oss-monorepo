# The take survey's pick between contact times (2026-11-18)

firmware/esp32/README.md, "The take survey's pick between contact times". Script: `tests/take_survey_pick.py`
(its docstring holds the prediction and decision rule, committed in 759ce4dea before the held-out capture ran).

Rows: `take-survey-pick-design-rows-2026-11-18.jsonl.gz` (lag 0.45 s, seed 29) and
`take-survey-pick-heldout-rows-2026-11-18.jsonl.gz` (lag 0.6 s, seed 31), 54 survey drills each, with every
surveyed wheel's periods and ticks so the dense refits can be repeated.

## Verdict

Prediction (a), (b) and (c) all held on the held-out set. By the decision rule the take survey keeps the three-point
parabola (the spline was within 1 ms on 53 builds of 54, the parabola on 54) and the shipped grid (the nine-point grid
was within 1 ms on 53 against 54). No firmware change; the Pi's advice gains a grid's-end line.

## Design set: per build and summary

```
54 survey drills (wheel lag 0.45 s, seed 29); dense refits every 0.25 ms from 0 to 8 ms; picks from the board's seven grid sums (trim 0, blind 1.5); advised when the share is at most 0.6
take ms | tach | launcher | kept | dense least | parabola | spline | share
1 | capture 1/8 us | 0 | 18 | 1.00 | 0.00 | 0.00 | 1.00
1 | capture 1/8 us | 1 | 20 | 1.00 | 1.04 | 0.93 | 0.66
1 | capture 1/8 us | 2 | 21 | 1.00 | 0.00 | 0.00 | 1.00
1 | jittery 0.5 us | 0 | 3 | 1.50 | 0.00 | 0.00 | 1.00
1 | jittery 0.5 us | 1 | 3 | 1.00 | 0.00 | 0.00 | 1.00
1 | jittery 0.5 us | 2 | 3 | 4.75 | 4.49 | 4.64 | 0.98
2.5 | capture 1/8 us | 0 | 15 | 2.75 | 2.52 | 2.72 | 0.35*
2.5 | capture 1/8 us | 1 | 14 | 2.75 | 2.51 | 2.68 | 0.33*
2.5 | capture 1/8 us | 2 | 19 | 4.25 | 4.53 | 5.55 | 0.66
2.5 | jittery 0.5 us | 0 | 4 | 3.00 | 2.46 | 2.63 | 0.98
2.5 | jittery 0.5 us | 1 | 3 | 2.00 | 1.07 | 0.93 | 0.95
2.5 | jittery 0.5 us | 2 | 3 | 2.75 | 2.52 | 2.74 | 0.97
3.5 | capture 1/8 us | 0 | 18 | 3.75 | 3.60 | 3.68 | 0.18*
3.5 | capture 1/8 us | 1 | 19 | 3.75 | 3.60 | 3.71 | 0.18*
3.5 | capture 1/8 us | 2 | 17 | 3.75 | 3.60 | 3.79 | 0.56*
3.5 | jittery 0.5 us | 0 | 4 | 3.75 | 3.58 | 3.77 | 0.76
3.5 | jittery 0.5 us | 1 | 4 | 3.50 | 3.48 | 3.52 | 0.43*
3.5 | jittery 0.5 us | 2 | 1 | 7.75 | 8.00 | 8.00 | 0.93
4.5 | capture 1/8 us | 0 | 17 | 5.00 | 4.66 | 5.10 | 0.31*
4.5 | capture 1/8 us | 1 | 18 | 4.75 | 4.66 | 4.81 | 0.11*
4.5 | capture 1/8 us | 2 | 20 | 4.75 | 4.63 | 4.79 | 0.26*
4.5 | jittery 0.5 us | 0 | 4 | 4.75 | 4.52 | 4.58 | 0.52*
4.5 | jittery 0.5 us | 1 | 4 | 4.25 | 4.28 | 4.32 | 0.49*
4.5 | jittery 0.5 us | 2 | 1 | 6.50 | 5.48 | 5.61 | 1.00
5.5 | capture 1/8 us | 0 | 19 | 6.00 | 5.68 | 5.80 | 0.13*
5.5 | capture 1/8 us | 1 | 20 | 6.00 | 5.68 | 5.76 | 0.12*
5.5 | capture 1/8 us | 2 | 17 | 5.75 | 5.66 | 5.71 | 0.21*
5.5 | jittery 0.5 us | 0 | 4 | 5.75 | 5.64 | 5.72 | 0.22*
5.5 | jittery 0.5 us | 1 | 4 | 5.75 | 5.60 | 5.68 | 0.50*
5.5 | jittery 0.5 us | 2 | 2 | 6.25 | 5.85 | 5.98 | 0.71
7 | capture 1/8 us | 0 | 18 | 7.25 | 8.00 | 8.00 | 0.16*
7 | capture 1/8 us | 1 | 20 | 7.75 | 8.00 | 8.00 | 0.36*
7 | capture 1/8 us | 2 | 14 | 7.50 | 8.00 | 8.00 | 0.18*
7 | jittery 0.5 us | 0 | 6 | 7.50 | 8.00 | 8.00 | 0.21*
7 | jittery 0.5 us | 1 | 2 | 7.75 | 8.00 | 8.00 | 0.56*
7 | jittery 0.5 us | 2 | 4 | 7.50 | 8.00 | 8.00 | 0.24*
3 | capture 1/8 us | 0 | 18 | 3.25 | 2.94 | 3.21 | 0.16*
3 | capture 1/8 us | 1 | 16 | 3.25 | 3.05 | 3.38 | 0.24*
3 | capture 1/8 us | 2 | 14 | 2.50 | 1.79 | 1.10 | 0.74
3 | jittery 0.5 us | 0 | 4 | 3.00 | 2.45 | 3.45 | 1.00
3 | jittery 0.5 us | 1 | 3 | 2.75 | 2.52 | 3.04 | 0.76
3 | jittery 0.5 us | 2 | 0 | - | - | - | -
6 | capture 1/8 us | 0 | 17 | 6.50 | 6.07 | 6.08 | 0.22*
6 | capture 1/8 us | 1 | 19 | 6.25 | 6.13 | 6.12 | 0.23*
6 | capture 1/8 us | 2 | 20 | 6.25 | 6.08 | 6.08 | 0.14*
6 | jittery 0.5 us | 0 | 6 | 6.25 | 5.90 | 5.94 | 0.20*
6 | jittery 0.5 us | 1 | 2 | 6.00 | 5.78 | 5.93 | 0.69
6 | jittery 0.5 us | 2 | 3 | 6.25 | 6.06 | 6.03 | 0.47*
0 | capture 1/8 us | 0 | 20 | 0.50 | 0.00 | 0.00 | 1.00
0 | capture 1/8 us | 1 | 19 | 3.75 | 3.48 | 3.61 | 0.63
0 | capture 1/8 us | 2 | 17 | 0.25 | 0.00 | 0.00 | 1.00
0 | jittery 0.5 us | 0 | 2 | 3.00 | 2.45 | 3.43 | 1.00
0 | jittery 0.5 us | 1 | 7 | 1.50 | 0.00 | 0.00 | 1.00
0 | jittery 0.5 us | 2 | 4 | 0.00 | 0.00 | 0.00 | 1.00

Off-grid takes only (1, 2.5, 3.5, 4.5, 5.5, 7 ms); error in ms, signed mean and mean absolute:
tach | builds | dense least - true | parabola - true | spline - true | parabola - dense | spline - dense | within 0.5 ms of true: dense / parabola / spline
capture 1/8 us | 18 | +0.38 / 0.38 | +0.24 / 0.46 | +0.39 / 0.62 | -0.13 / 0.33 | +0.01 / 0.32 | 16 / 12 / 11
all | 36 | +0.58 / 0.62 | +0.37 / 0.69 | +0.48 / 0.80 | -0.21 / 0.39 | -0.10 / 0.36 | 29 / 21 / 20
jittery 0.5 us | 18 | +0.78 / 0.86 | +0.50 / 0.91 | +0.56 / 0.98 | -0.28 / 0.45 | -0.21 / 0.39 | 13 / 9 / 9

On-grid check (0, 3 and 6 ms): within 0.5 ms of true, dense / parabola / spline
capture 1/8 us | 9 | 8 / 7 / 7
all | 17 | 14 / 13 / 14
jittery 0.5 us | 8 | 6 / 6 / 7

By take (all tachs): mean signed error, dense / parabola / spline
1 ms (6): +0.71 / -0.08 / -0.07
2.5 ms (6): +0.42 / +0.10 / +0.38
3.5 ms (6): +0.88 / +0.81 / +0.91
4.5 ms (6): +0.50 / +0.20 / +0.37
5.5 ms (6): +0.42 / +0.19 / +0.28
7 ms (6): +0.54 / +1.00 / +1.00
3 ms (5): -0.05 / -0.45 / -0.17
6 ms (6): +0.25 / +0.00 / +0.03
0 ms (6): +1.50 / +0.99 / +1.17
```

## Design set: grids scored from the dense refits

```
54 survey drills; each grid's verdicts from the dense refits (trim, blind rule and margin as the board's); within 0.5 / 1 ms of true (of builds with a verdict), spread takes named within 1 ms and advised, instant builds advised
  0,2,3,4,5,6,8            parabola: within 0.5 ms 35/53, within 1 ms 47/53, named and advised 29/47, instant advised 0/6
  0,2,3,4,5,6,8            spline  : within 0.5 ms 35/53, within 1 ms 46/53, named and advised 29/47, instant advised 0/6
  0,1,2,3,4,5,6,7,8        parabola: within 0.5 ms 40/53, within 1 ms 47/53, named and advised 31/47, instant advised 0/6
  0,1,2,3,4,5,6,7,8        spline  : within 0.5 ms 39/53, within 1 ms 45/53, named and advised 31/47, instant advised 0/6
  0,2,3,4,5,6,7,8          parabola: within 0.5 ms 38/53, within 1 ms 47/53, named and advised 29/47, instant advised 0/6
  0,2,3,4,5,6,7,8          spline  : within 0.5 ms 37/53, within 1 ms 45/53, named and advised 29/47, instant advised 0/6
  0,1,2,3,4,5,6,8          parabola: within 0.5 ms 37/53, within 1 ms 47/53, named and advised 31/47, instant advised 0/6
  0,1,2,3,4,5,6,8          spline  : within 0.5 ms 37/53, within 1 ms 46/53, named and advised 31/47, instant advised 0/6
  0,2,3,4,5,6,7            parabola: within 0.5 ms 41/52, within 1 ms 46/52, named and advised 28/46, instant advised 0/6
  0,2,3,4,5,6,7            spline  : within 0.5 ms 41/52, within 1 ms 45/52, named and advised 28/46, instant advised 0/6
  0,1.5,3,4,5,6.5,8        parabola: within 0.5 ms 36/52, within 1 ms 47/52, named and advised 29/46, instant advised 0/6
  0,1.5,3,4,5,6.5,8        spline  : within 0.5 ms 37/52, within 1 ms 45/52, named and advised 29/46, instant advised 0/6
  0,1,2,3,4,5,6,7          parabola: within 0.5 ms 43/52, within 1 ms 46/52, named and advised 30/46, instant advised 0/6
  0,1,2,3,4,5,6,7          spline  : within 0.5 ms 43/52, within 1 ms 45/52, named and advised 30/46, instant advised 0/6
```

## Held-out set: per build and summary

```
54 survey drills (wheel lag 0.6 s, seed 31); dense refits every 0.25 ms from 0 to 8 ms; picks from the board's seven grid sums (trim 0, blind 1.5); advised when the share is at most 0.6
take ms | tach | launcher | kept | dense least | parabola | spline | share
1 | capture 1/8 us | 0 | 20 | 1.00 | 0.00 | 0.00 | 1.00
1 | capture 1/8 us | 1 | 16 | 1.25 | 0.00 | 0.00 | 1.00
1 | capture 1/8 us | 2 | 17 | 1.00 | 0.00 | 0.00 | 1.00
1 | jittery 0.5 us | 0 | 5 | 1.25 | 0.00 | 0.00 | 1.00
1 | jittery 0.5 us | 1 | 6 | 1.00 | 0.00 | 0.00 | 1.00
1 | jittery 0.5 us | 2 | 7 | 0.00 | 0.00 | 0.00 | 1.00
2.5 | capture 1/8 us | 0 | 19 | 2.75 | 2.52 | 2.67 | 0.24*
2.5 | capture 1/8 us | 1 | 21 | 2.75 | 2.53 | 2.71 | 0.29*
2.5 | capture 1/8 us | 2 | 19 | 2.75 | 2.53 | 2.76 | 0.57*
2.5 | jittery 0.5 us | 0 | 4 | 2.50 | 2.45 | 2.55 | 0.68
2.5 | jittery 0.5 us | 1 | 10 | 2.75 | 2.55 | 2.73 | 0.73
2.5 | jittery 0.5 us | 2 | 6 | 2.75 | 2.49 | 2.66 | 0.83
3.5 | capture 1/8 us | 0 | 18 | 3.75 | 3.60 | 3.70 | 0.20*
3.5 | capture 1/8 us | 1 | 17 | 3.75 | 3.61 | 3.78 | 0.35*
3.5 | capture 1/8 us | 2 | 20 | 3.75 | 3.59 | 3.71 | 0.25*
3.5 | jittery 0.5 us | 0 | 5 | 4.00 | 3.69 | 3.87 | 0.64
3.5 | jittery 0.5 us | 1 | 9 | 3.75 | 3.65 | 3.82 | 0.77
3.5 | jittery 0.5 us | 2 | 4 | 3.50 | 3.51 | 3.64 | 0.89
4.5 | capture 1/8 us | 0 | 21 | 5.00 | 4.77 | 5.17 | 0.14*
4.5 | capture 1/8 us | 1 | 19 | 4.75 | 4.65 | 4.84 | 0.17*
4.5 | capture 1/8 us | 2 | 22 | 4.75 | 4.69 | 4.97 | 0.13*
4.5 | jittery 0.5 us | 0 | 4 | 4.75 | 4.63 | 4.89 | 0.59*
4.5 | jittery 0.5 us | 1 | 8 | 5.00 | 4.73 | 5.09 | 0.41*
4.5 | jittery 0.5 us | 2 | 7 | 4.75 | 4.62 | 4.72 | 0.41*
5.5 | capture 1/8 us | 0 | 16 | 6.00 | 5.72 | 5.83 | 0.14*
5.5 | capture 1/8 us | 1 | 22 | 5.75 | 5.70 | 5.77 | 0.09*
5.5 | capture 1/8 us | 2 | 19 | 6.00 | 5.68 | 5.75 | 0.13*
5.5 | jittery 0.5 us | 0 | 7 | 6.00 | 5.61 | 5.71 | 0.37*
5.5 | jittery 0.5 us | 1 | 4 | 6.00 | 5.76 | 5.87 | 0.29*
5.5 | jittery 0.5 us | 2 | 5 | 5.50 | 5.54 | 5.61 | 0.27*
7 | capture 1/8 us | 0 | 18 | 7.50 | 8.00 | 8.00 | 0.13*
7 | capture 1/8 us | 1 | 19 | 7.50 | 8.00 | 8.00 | 0.16*
7 | capture 1/8 us | 2 | 21 | 7.50 | 8.00 | 8.00 | 0.17*
7 | jittery 0.5 us | 0 | 3 | 7.50 | 8.00 | 8.00 | 0.23*
7 | jittery 0.5 us | 1 | 5 | 7.25 | 8.00 | 8.00 | 0.30*
7 | jittery 0.5 us | 2 | 8 | 7.50 | 8.00 | 8.00 | 0.27*
3 | capture 1/8 us | 0 | 21 | 3.25 | 3.10 | 3.32 | 0.18*
3 | capture 1/8 us | 1 | 21 | 3.25 | 2.91 | 3.15 | 0.13*
3 | capture 1/8 us | 2 | 16 | 3.25 | 2.93 | 3.31 | 0.29*
3 | jittery 0.5 us | 0 | 4 | 3.25 | 3.00 | 3.21 | 0.43*
3 | jittery 0.5 us | 1 | 8 | 3.25 | 2.96 | 3.28 | 0.50*
3 | jittery 0.5 us | 2 | 6 | 3.25 | 2.79 | 3.38 | 0.77
6 | capture 1/8 us | 0 | 18 | 6.25 | 6.07 | 6.06 | 0.11*
6 | capture 1/8 us | 1 | 18 | 6.50 | 6.10 | 6.10 | 0.13*
6 | capture 1/8 us | 2 | 20 | 6.25 | 6.09 | 6.05 | 0.10*
6 | jittery 0.5 us | 0 | 7 | 6.50 | 6.02 | 6.00 | 0.40*
6 | jittery 0.5 us | 1 | 10 | 6.25 | 6.06 | 6.06 | 0.19*
6 | jittery 0.5 us | 2 | 6 | 6.50 | 6.01 | 6.02 | 0.32*
0 | capture 1/8 us | 0 | 20 | 0.00 | 0.00 | 0.00 | 1.00
0 | capture 1/8 us | 1 | 21 | 0.25 | 0.00 | 0.00 | 1.00
0 | capture 1/8 us | 2 | 19 | 0.25 | 0.00 | 0.00 | 1.00
0 | jittery 0.5 us | 0 | 6 | 1.50 | 0.00 | 0.00 | 1.00
0 | jittery 0.5 us | 1 | 6 | 0.00 | 0.00 | 0.00 | 1.00
0 | jittery 0.5 us | 2 | 6 | 2.00 | 1.00 | 2.20 | 1.00

Off-grid takes only (1, 2.5, 3.5, 4.5, 5.5, 7 ms); error in ms, signed mean and mean absolute:
tach | builds | dense least - true | parabola - true | spline - true | parabola - dense | spline - dense | within 0.5 ms of true: dense / parabola / spline
capture 1/8 us | 18 | +0.31 / 0.31 | +0.09 / 0.42 | +0.20 / 0.54 | -0.22 / 0.38 | -0.10 / 0.33 | 18 / 12 / 11
all | 36 | +0.26 / 0.31 | +0.08 / 0.41 | +0.19 / 0.52 | -0.18 / 0.36 | -0.07 / 0.31 | 35 / 24 / 22
jittery 0.5 us | 18 | +0.21 / 0.32 | +0.07 / 0.41 | +0.18 / 0.51 | -0.14 / 0.34 | -0.03 / 0.29 | 17 / 12 / 11

On-grid check (0, 3 and 6 ms): within 0.5 ms of true, dense / parabola / spline
capture 1/8 us | 9 | 9 / 9 / 9
all | 18 | 16 / 17 / 17
jittery 0.5 us | 9 | 7 / 8 / 8

By take (all tachs): mean signed error, dense / parabola / spline
1 ms (6): -0.08 / -1.00 / -1.00
2.5 ms (6): +0.21 / +0.01 / +0.18
3.5 ms (6): +0.25 / +0.11 / +0.25
4.5 ms (6): +0.33 / +0.18 / +0.45
5.5 ms (6): +0.38 / +0.17 / +0.26
7 ms (6): +0.46 / +1.00 / +1.00
3 ms (6): +0.25 / -0.05 / +0.27
6 ms (6): +0.38 / +0.06 / +0.05
0 ms (6): +0.67 / +0.17 / +0.37
```

## Held-out set: the rule's two grids

```
54 survey drills; each grid's verdicts from the dense refits (trim, blind rule and margin as the board's); within 0.5 / 1 ms of true (of builds with a verdict), spread takes named within 1 ms and advised, instant builds advised
  0,2,3,4,5,6,8            parabola: within 0.5 ms 41/54, within 1 ms 54/54, named and advised 35/48, instant advised 0/6
  0,2,3,4,5,6,8            spline  : within 0.5 ms 41/54, within 1 ms 53/54, named and advised 35/48, instant advised 0/6
  0,1,2,3,4,5,6,7,8        parabola: within 0.5 ms 52/54, within 1 ms 53/54, named and advised 37/48, instant advised 0/6
  0,1,2,3,4,5,6,7,8        spline  : within 0.5 ms 51/54, within 1 ms 53/54, named and advised 37/48, instant advised 0/6
```
