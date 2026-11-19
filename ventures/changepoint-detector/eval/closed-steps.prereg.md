# Steps beside a closure (pre-registered 2026-11-19, before any replay on the fresh seeds below)

Written and committed before `eval/closed-steps.mjs fresh` ran. The diagnosis on round 1's K4 seeds (20261119,
already seen) runs first and decides nothing; it is reported beside the fresh numbers.

## The problem

README "Closed days filled as missing": round 1's fill (each closed day takes the median of up to 4 earlier
same-weekday open days) cut alerts at closures in simulation from 99 to 8 of 100 no-step series, but steps caught fell
from 75 to 70 of 100 (K4b failed). The untested guess: a closure in the weeks after a step is filled from the weeks
*before* it, a pre-step value inside the new level. Two further faults in round 1's design: K4a's bar of 2 ignored the
base rate of the setting's own false alerts, and K4b compared against the closures-as-zeros arm, whose alerts at a
closure can land within 7 days of a step and count as catches.

## Arms (Quiet: `bocpd`, `--model poisson`, `--period 7`, replayed)

- **clean**: the same series with its closed days open (counts drawn from a side stream so the main draws are
  unchanged). The changes a shop would see if it never shut. This is the baseline round 1 lacked.
- **off**: closed days as zeros.
- **fill4**: round 1's fill (median of up to 4 earlier same-weekday open days).
- **fill1** (the candidate): the nearest earlier same-weekday open day (`fillClosed(..., { lags: 1 })`). One week
  old instead of up to four, so a closure 8 or more days after a step is filled from after the step. Only earlier
  points feed it, so a replay stays honest.

## Fresh simulation (seeds 20261120)

200 daily series of 371 days from a Monday, Saturdays zero, other days Gamma-Poisson (mean 40, Sunday 24, shape 20),
as round 1's K4. Series 0-99 have no step and 6 one-day closures on distinct non-Saturday days from points 84 to 360.
Series 100-199 have a +40% step on a day from 150 to 330 and **one closure placed 1 to 21 days after the step**
(uniform, a non-Saturday), plus 5 more drawn as above: the case round 1 named ("steps placed next to closures").
Each series also gets 6 placebo dates drawn like closures but not closed: the chance rate of an alert "at a closure"
for that arm's own alerts. Run as 4 shards (`fresh 4 0` .. `fresh 4 3`), summed by `sum fresh`.

## Bars for fill1 (all three pass, or it is not offered)

- **S1, the closure effect is gone, against chance:** of the 100 no-step series, those with a fill1 alert within 1
  day of a closure are at most those with a fill1 alert within 1 day of a placebo date, plus 3.
- **S2, steps beside a closure are kept:** of the 100 step series, steps caught by fill1 (an alert dated within 7
  days of the step) are at least clean's minus 5.
- **S3, no worse than round 1's fill:** steps caught by fill1 are at least fill4's.

Reported, not barred: the same bars for fill4; the diagnosis rows (steps caught by group of first closure after the
step); the median delay from step to sending.

## What ships if all three pass

`--closed <dates|@file>` on `watch.mjs` (one column and `--columns`, `--suggest` too), filling with fill1 before any
detector sees the series, with a README section and tests. The real shop's years (README "Closed days filled as
missing", already seen) are then rerun with fill1 and reported, not barred. Any bar fails: written up as failed,
`--closed` stays unoffered, and `fillClosed`'s `lags` option stays a module option.
