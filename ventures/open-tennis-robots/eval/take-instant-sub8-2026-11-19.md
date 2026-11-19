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

## Result (appended after the recapture)

`tests/take_instant_sub8.py --score` on the four recaptured sets (eval/take-instant-sub8-{design,heldout,fresh,third}-2026-11-19.jsonl.gz;
output eval/take-instant-sub8-2026-11-19.txt):

| set | instant builds advised (of 18) | spread takes named within 1 ms and advised (of 54), today / 2026-11-18 | within 1 ms (of 72) |
| --- | --- | --- | --- |
| design (0.3 s, seed 7) | 0 | 38 / 44 (37 with #17636's share guard) | 67 |
| first held out (0.45 s, seed 11) | 0 | 48 / 42 | 72 |
| fresh (0.38 s, seed 13) | 0 | 54 / 54 | 68 |
| third (0.52 s, seed 17) | 0 | 54 / 47 | 67 |
| all | 0 of 72 | 194 / 187 of 216 | 274 of 288 |

(a) held: no instant build advised. (b) held: the first held-out set's launcher-1 jitter-0 instant build now picks
0 ms ("keep TAKE_US = 0", bound 1.5 ms), its rms rising 6, 41, 84, ... 360 ppm across the nine candidates where the
stored row was flat to within a few ppm. (c) held: 194 of 216 against the README's 173 (that board, no blind rule) and 187 with the stored rows rescored as below. By the rule the item is closed.

The 2026-11-18 column is the stored rows rescored by today's ResidualSurvey (blind 1.5, trim 0) on their own
seven-point grid (tests/take_survey_blind.py, now that it reads each set's grid). "Advised" counts
host.take_survey_advice telling the builder to flash a non-zero TAKE_US with the pick within 1 ms; on all four sets it
equals the older count (share at most 0.6 and pick within 1 ms).

### The one regression: the design set, traced to the ball hold's gain scale

The design set fell 44 to 38. Of its 16 misses, 15 picked within 1 ms but at a share over 0.6. One of them (3 ms
take, launcher 2, jitter 0) read rms 87 / 59 / 11 ... ppm on 2026-11-18 and 12 / 8 / 9 / 9 ... today. Rerunning that
build with one knob changed at a time: TAKE_MATCH_SPREAD False reads 12 / 9 / 10 / 9 (no better); LOOP_BALL_GAIN False
(the ball hold's gain scale, "down" since #17530 on 2026-11-18 21:06) reads 34 / 34 / 18 / 7, pick 2.9 ms at share
0.21. A paired capture of the four sets at jitter 0 and 0.5 us with LOOP_BALL_GAIN False
(tests/take_survey_ball_gain.py) follows below.

### Whole-ppm rounding

The stored advised build's 0.57 was 4 / 7 in whole ppm; unrounded it was 0.635, not advised. A parallel session
(#17636, eval/take-share-rounding-2026-11-19.md) reached the same reading and shipped host.take_share_bound, a guard
on the frame's rounding, while this recapture ran. Rescored with that guard on main, the four recaptured sets give 193
of 216 named and advised (194 without it) and still 0 instant builds advised (eval/take-instant-sub8-2026-11-19.txt).

### The paired ball-gain capture (appended)

`tests/take_survey_ball_gain.py --compare` (eval/take-ball-gain-off-2026-11-19.txt): the same 96 builds (four sets,
jitter 0 and 0.5 us) with LOOP_BALL_GAIN "down" (shipped) and False.

| set (24 builds) | named and advised (of 18), down / False | mean share, down / False |
| --- | --- | --- |
| design | 14 / 16 | 0.39 / 0.25 |
| first held out | 16 / 16 | 0.27 / 0.29 |
| fresh | 18 / 18 | 0.31 / 0.23 |
| third | 18 / 18 | 0.23 / 0.24 |
| all | 66 / 68 of 72 | |

No instant build advised either way; within 1 ms 92 of 96 either way. The gain scale costs the survey two builds of
72, both on the design set (lag 0.3 s), and the share moves both ways on the others. Too small to justify switching the
ball hold's gains off during a calibration drill, so nothing changes; the 3 ms build above is the large case, not the
typical one. The rest of the design set's fall (44 to 38) sits at jitters 1-3 us, which this pair did not capture.
