# A closure in the first week after a step (pre-registered 2026-11-19, before any replay of the candidate)

Written and committed before `eval/closed-recent.mjs` ran on either seed set. Round 3 of closed days (round 1:
`eval/closed-days.prereg.md`; round 2: `eval/closed-steps.prereg.md`, which shipped `--closed` with fill1).

## The problem

README "Steps beside a closure": with a closure 1 to 7 days after a +40% step, fill1 (each closed day takes the nearest
earlier same-weekday open day) caught 11 of 27 steps against 16 for the shop that never shut. A fill one week old is
still from before the step, so it pulls the new level back exactly where the detector needs it. The same thing was
seen once on real data: the 2011-09-01 build-up alert on orders, three days after the August bank holiday, is lost.

## The candidate: rec3 (`fillClosed(..., { lags: 1, recent: 3 })`)

Each closed day i (weekday p) is filled from the **3 nearest earlier open days within the last week** (j from i-1 down
to i-6, skipping listed closures and days whose weekday mean is 0, such as an always-shut Saturday), each scaled to
the closed day's weekday: `fill = s_p * mean_j(v_j / s_q(j))`, where `s_q` is the mean of open days of weekday q in the
4 weeks ending at i-7 (so the recent days do not normalise themselves). A closure 3 or more days after a step is then
filled at the new level. Only earlier points feed it, so a replay stays honest. Falls back to fill1 when the window has
no mean for the closed weekday or no usable recent day. k = 3 is fixed here, not tuned.

A closure 1 or 2 days after the step cannot be helped by any fill from earlier days; it is reported separately.

## Arms (Quiet: `bocpd`, `--model poisson`, `--period 7`, replayed)

clean (closed days left open, side-stream counts), off (zeros), fill1 (shipped), rec3 (candidate).

## Design run (round 2's fresh seeds 20261120, already seen; decides nothing)

Same draws as round 2: a check that the script reproduces round 2's clean 57 and fill1 52, and a first look at rec3.

## Fresh simulation (seeds 20261121)

200 daily series of 371 days from a Monday, Saturdays zero, other days Gamma-Poisson (mean 40, Sunday 24, shape 20),
as rounds 1 and 2. Series 0-99: no step, 6 one-day closures on distinct non-Saturday days from points 84 to 360.
Series 100-199: a +40% step on a day from 150 to 330 and **one closure 1 to 7 days after the step** (uniform over
open days), plus 5 more drawn as above. 6 placebo dates per series give the chance rate. 8 shards, summed.

## Bars for rec3 (all four pass, or it is not shipped)

- **T1, the closure effect stays gone:** no-step series with a rec3 alert within 1 day of a closure are at most those
  with a rec3 alert within 1 day of a placebo date, plus 3.
- **T2, the case it is for:** steps caught (an alert dated within 7 days of the step) by rec3 are at least fill1's
  plus 5, of 100.
- **T3, near the shop that never shut:** steps caught by rec3 are at least clean's minus 5.
- **T4, no noisier:** rec3's alerts over all 200 series are at most 1.05 times fill1's.

Reported, not barred: caught by group (closure 1-2 days after, 3-7 days after), median delay, the real shop's two years
(`real`, both seen), especially whether rec3 keeps the 2011-09-01 orders alert.

## What ships if all four pass

`watch.mjs --closed` switches to rec3 (README, tests, the CLI's "Closed:" line). Any bar fails: written up as failed,
`--closed` keeps fill1, and `recent` stays a module option.
