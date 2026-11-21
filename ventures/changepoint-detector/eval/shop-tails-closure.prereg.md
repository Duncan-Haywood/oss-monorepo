# A shop shut one weekday, round 4: the real shop's noise and a Christmas closure (pre-registered 2026-11-21, before any shop in this round ran)

## Why this round

Round 3 (`eval/shut-weekday-ramp.prereg.md`, README "A shop shut one weekday, round 3") found that simulated shops
shut every Saturday are **not** deaf to a gradual climb (Quiet caught 67 of 100 +30% ramps and 73 of 100 +90% ramps),
while on the real UCI Online Retail shop Quiet never heard the autumn climb (about x1.9) with the Saturdays in, and its
late revenue alerts were dated months back (2011-04-18, sent 2011-08-16). The README named two things the simulation
lacks: **the real shop's tails**, and **a long closure** (the design year opens with the shop shut 2010-12-24 to
2011-01-03, 11 days of 0).

### What was looked at before writing this (exploratory, design year and simulated shops only)

`eval/shop-tails.mjs` takes the design year's trading days, removes each weekday's median and a 13-trading-day
running median from log revenue, and reads the residuals: **sd 0.356, MAD sd 0.263** (305 days). Through the same
steps, three round-3 simulated shops (no change) gave sd 0.41 to 0.50 and MAD sd 0.35 to 0.37. The README's "sd 0.50
against MAD 0.32" was read without removing the weekday pattern. So on a like-for-like reading the simulated noise is
**larger** than the real noise, and its tail ratio (sd / MAD 1.17 to 1.36) is about the real one (1.35). That makes the
tails a weak candidate before anything runs. They are still tested, as below, because "the real shop's own noise" is
not only its spread: it is skewed (1% quantile -0.88, 99% +0.91, min -1.59, max +1.22) and lag-1 correlated (0.04 to
0.18 across the two years). No watch was run on any shop for this round before this file was committed.

## Simulation (`eval/shop-tails-closure-sim.mjs`, seed 20261121, fixed now)

Round 3's shop (371 days from Monday 2024-01-01; Saturdays 0; `level * weekday factor * noise`; factors Sun 0.6,
Mon 1.2, Tue to Fri 1.0; AR(1) wobble in the log level, rho 0.5, sd 0.05; 5 random one-day weekday closures), in two
**noise** families:

- **sim**: round 3's noise, `lognormal(0, 0.35)` with 3% wholesale days x4.
- **real**: each trading day's log noise is one of the design year's residuals (`eval/shop-tails.mjs`), drawn with
  replacement, in blocks of 5 consecutive residuals (a random start), so its skew and short-run correlation come along.

Each family has 100 shops with no change (**N**) and 100 with round 3's **R90** ramp (start `a` uniform in days 200 to
300, a linear climb in the log level over `L` days, uniform 28 to 56, to log 1.9, then flat). Every shop is replayed
three ways, from the same draws:

- **clean**: as drawn.
- **xmas**: the same values with days 23 to 33 (11 days, 2024-01-24 to 2024-02-03; in the history before the watch
  starts at day 74, as the real closure is) set to 0.
- **xmas + `--closed`**: xmas with those 11 dates (and the 5 one-day closures) listed as closed, filled the way
  `watch.mjs --closed` fills them (`fillClosed`, lags 1).

Arms, all Quiet (the default detector, `model: 'mean'`, `--period 7`, watch from day 74): **D** on clean, **X** on
xmas, **K** on xmas + `--closed`. Descriptive only: **XT** xmas with `dropShutWeekdays` (period 6).

**Caught** (as round 3): an alert dated from `a - 7` to `a + L`, sent no earlier than day `a` and within 14 days of its
date. **Dated back**: a shop whose alerts include one sent on or after day `a` but dated 60 or more days before `a` (the
real shop's "dated to March, sent in August").

## Bars (R90 unless named)

- **C1 (the closure deafens):** X catches at most D - 20 in the sim family.
- **C2 (the real noise deafens):** D in the real family catches at most D in the sim family - 20.
- **C3 (together they reproduce the real deafness):** X in the real family catches at most 30.
- **C4 (the closure dates alerts back):** in the sim family, X has at least 10 dated-back shops and at least 3 times D's.
- **C5 (`--closed` undoes it):** if C1 passes, K catches at least X + 15 in the sim family, and on N, K sends at most
  2 alerts per 100 checks in both families.

Descriptive, no bar: alerts per 100 checks on N for every arm and family; the median delay of caught ramps; XT.

## What follows from each outcome

- C1 and C5 pass: the closure is a cause, and the fix is already shipped. The watch page and `--suggest` gain a line
  telling a daily series with a run of 5 or more zero weekdays to list them with `--closed` (README, both results).
- C1 passes, C5 fails: the closure is a cause but `--closed`'s fill is not the fix; nothing ships, the next round is a
  fill for long closures.
- C1 fails and C2 or C3 passes: the real noise is the cause; the next round asks which part (skew, blocks, spread).
- C1, C2 and C3 all fail: neither the tails nor the closure explains the real deafness; the README says so and names
  what is left (the level's own path on the real shop: two moves in one year, read by `tolerance` and `holdHistory`).

Whatever happens, the result is written up in the README.
