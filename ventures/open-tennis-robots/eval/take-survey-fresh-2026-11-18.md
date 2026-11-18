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
