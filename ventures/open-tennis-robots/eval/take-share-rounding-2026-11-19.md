# The sub-8 advised instant build was the frame's rounding (2026-11-19, firmware/esp32/README.md, same title)

## The item

README "Take-blind rows traced" ended on one instant build of 72 that the take survey still advised at 1/8 us: the
first held-out capture set's launcher 1 (`eval/take-survey-capture-sub8-heldout-2026-11-18.jsonl.gz`, build
`[0, 0, 1, 0.45, 11]`), a refined pick of 3.5 ms at a best / step share of 0.57, inside `host.TAKE_ADVISE_RATIO`'s 0.6.
`TAKE_SURVEY_BLIND = 1.5` later stopped advising it, but nothing said why it had been advised.

## A scorer fix first

`tests/take_survey_blind.py`, `tests/take_survey_trim.py` and `take_misfit_trace.survey_score` rescored every stored
row on `controller.TAKE_SURVEY_GRID_US`, nine points since 2026-11-19, so each raised an IndexError on the stored sets,
whose board rows carry seven candidates (the same fault `tests/take_survey_kept.py` was fixed for on 2026-11-19).
`GRIDS` and `grid_for` moved to `tests/take_survey_trim.py` and all four take each row's grid from its row length. With
the fix, `take_survey_blind.py` reproduces `eval/take-survey-blind-design-2026-11-18.txt`'s lines for both sets
checked (capture design and capture sub-8 held out) and `take_survey_trim.py` the README's 14 and 42 of 54.

## Why it was advised

The Pi computes the share from the TAKE_SURVEY frame's mean rms per candidate, sent as whole ppm (uint16). At 1/8 us
the capture's fit floor is a few ppm, so the rounding is a large part of each number. On that build the frame carried
the step at 7 ppm and 3 ms at 4 ppm: 4 / 7 = 0.571, advised. The board's own sums give sqrt(S_3ms / S_step) =
**0.635**, outside the margin. With `blind` 1.01 or more the step reads 7 and the best 5: 0.714. The blind filter did
not fix the build; it moved a rounded 4 to a 5. The exact share was 0.63 at every blind value (0.635 at 1, 0.626 at
1.01 and 1.5).

Over all 38 stored capture files (5,012 drill scorings at blind 0 and 1.5), the rounded and exact shares fall on
different sides of 0.6 nine times; eight sit within 0.011 of the margin, and only this build (and its copy in
`take-survey-pick-design-rows`) is moved far, 0.635 to 0.571, because its step rms is 7 ppm.

## The guard, pre-registered

The frame gives each rms to +-0.5 ppm, so the largest share it allows is (min + 0.5) / (step - 0.5). Guard G: the Pi
advises a nonzero pick only when that bound is at most `TAKE_ADVISE_RATIO`; otherwise it says the fits are too close
to the frame's resolution to tell. G never advises where the exact share is over 0.6.

Design (stored sets, shipped trim 0 and blind 1.5, nonzero picks only): 1,944 drill scorings; the exact share advises
1,244, the rounded 1,245, G 1,238. G withholds 6 the exact share would advise, and removes the 2 the rounding added.

Rule, committed before the capture: a fresh capture set (`tests/take_survey_jitter.py --capture --tach-capture --sub 8
--lag 0.57 --seed 443`, 72 drills, the shipped tree), scored with the shipped grid, trim and blind. G ships as the
host's advice if all hold:

1. G advises no instant build;
2. G names within 1 ms and advises at least as many spread takes as the rounded share, less one;
3. every verdict G withholds that the rounded share advised is within 0.1 of the margin by the exact share, or rests on
   a step rms under 10 ppm.

Prediction: 0 or 1 verdict differs between G and the rounded share on that set.
