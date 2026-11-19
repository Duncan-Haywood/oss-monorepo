# The sub-8 advised instant build, on today's tree (2026-11-19)

Written before the recapture below ran; results are appended under "Result".

## The item

README "Take-blind rows traced" (2026-11-18) left one instant build of 72 advised at 1/8 us: the first held-out
set's (lag 0.45 s, seed 11) launcher 1, jitter 0, picked 3.5 ms at a best / step share of 0.57, inside
host.TAKE_ADVISE_RATIO's 0.6. Every flagship row since has carried "the sub-8 advised instant build" as open.

## What the stored rows already show

Rescored from eval/take-survey-capture-sub8-heldout-2026-11-18.jsonl.gz (the board's 7-point grid of the day,
0, 2, 3, 4, 5, 6, 8 ms; tests/take_instant_sub8.py --stored):

- The pick was made by three wheels (of 22) where the step alone fit 10.7, 15.7 and 17.1 ppm against 4.6, 4.5 and
  2.1 ppm for every take; on the rest the step tied the takes. The 4 ms candidate had no such wheel, so it won.
- The share 0.57 was 4 / 7 in whole ppm. TAKE_SURVEY_BLIND (1.5, shipped after this capture) leaves out three tied
  wheels, which moves the rounded rms to 5 / 7 = 0.71, so the board of 2026-11-18 evening already stopped advising
  it; the pick (3.5 ms) did not change.

## Prediction and rule (committed before the recapture)

Recapture the same four sub-8 capture sets (design 0.3 s / seed 7, first held out 0.45 s / 11, fresh 0.38 s / 13,
third 0.52 s / 17; 72 drills each, `tests/take_survey_jitter.py --capture --tach-capture --sub 8`) on today's tree
(nine-point grid, stretched offsets, blind 1.5, trim 0, the ppm-floored bound) and score each build by the board's
own TAKE_SURVEY report and host.take_survey_advice.

Prediction: (a) no instant build is advised on any of the four sets (0 of 72); (b) the first held-out set's
launcher-1 jitter-0 instant build reads 0 ms; (c) spread takes named within 1 ms and advised on the four sets
together are at least the 173 of 216 the 2026-11-18 tree read (README "Take-blind rows traced").

Rule: if (a) and (b) hold, the item is closed and comes off the flagship row. If (a) fails, the advised build is
traced next and the item stays. (c) is reported either way; a fall below 173 is written up as a regression to trace.
