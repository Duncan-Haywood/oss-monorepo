# A closure in the week before a step (pre-registered 2026-11-19, before any replay on seeds 20261123)

Written and committed before `eval/closed-before.mjs` ran on anything. The rounds before it
(`eval/closed-steps.prereg.md`, `eval/closed-recent.prereg.md`, `eval/closed-recent-r4.prereg.md`) simulated a closure
*after* a step. README "A closure in the first week after a step" then found that the real case that cost an alert,
orders on the design year (2011-09-01, the start of the Christmas build-up), had its bank holiday **before** the step:
2011-08-29, three days earlier. With closures as zeros, Quiet sent that alert on 2011-09-05; with the shipped fill
(`--closed`, fill1: the nearest earlier same-weekday open day) it sent nothing.

## The question

Does fill1 cost steps when a closure falls 1 to 7 days before the step, measured against **clean** (the same shop with
the closed day left open)? Or does the zeros arm only catch more because the zero before the rise widens the apparent
step, so the lost real alert is one a shop that never shut would not have been sent either?

Prediction, written down so it can be wrong: fill1 is within noise of clean (a fill one week old is from before the step,
which is the right level for a day before the step), and zeros catch more than clean.

## Simulation

As `eval/closed-recent.mjs` (371 days, Gamma-Poisson counts with mean 40 and Sundays 24, Saturdays shut, Quiet:
`bocpd`, `--model poisson`, `--period 7`, replayed), with seeds **20261123**, and:

- 100 no-step series with 6 random one-day closures;
- **300** step series (+40%, step day drawn from days 150 to 330), each with **one closure 1 to 7 days before the
  step** (an open weekday) and 5 more at random;
- 6 placebo dates per series, drawn as the closures are (the chance rate);
- arms: clean, off (zeros), fill1 (ships). A step is caught when an alert is dated within 7 days of it.

300 step series, not 100: round 4 showed 100 is too few to see a 4-in-100 effect.

## Bars

- **V1, the cost** (the question): fill1 catches at least clean's count minus 9 of 300 (a cost of at most 3 in 100).
- **V2, no slower:** over steps both clean and fill1 catch, fill1's median days from step to sent is at most clean's + 1.
- **V3, closure effect gone (as S1/T1):** no-step series with a fill1 alert within 1 day of a closure at most the
  placebo count + 3.
- **V4, the zeros arm's extra catches (the mechanism):** off catches at least clean's count + 9 of 300.

## What follows

- V1 to V3 pass: `--closed` needs no change for closures before a step; the README says so with the numbers and the
  watch's `--closed` help names the case. If V4 also passes, the lost 2011-09-01 alert is read as one the zero lent the
  shop, and the real-data diagnosis below is reported beside it.
- V1 or V2 fails: the cost is real; the README records it and the next candidate is named there (none is tried in this
  round).
- V4 fails with V1 passing: the zeros do not lend catches in simulation, and the real case stays unexplained.

## Real data, reported, not barred (already seen)

The design year's orders, Quiet, `--period 7`, four ways: zeros; fill1; fill1 with 2011-08-29 alone left as a zero; and
all closures filled with fill1 except 2011-08-29, which takes the mean of the Mondays either side (2011-08-22 and
2011-09-05; uses a later day, so not a fill a watch could make, only a stand-in for "the shop opened that day").
Whether 2011-09-01 is alerted in each is printed and changes nothing above.
