# Round 8: a pulse-in-growth check on weekly totals, to hear x1.3 climbs (pre-registered 2026-11-22, before the script existed)

## Why this round

Round 7 (`eval/weekly-beside.prereg.md`, output `eval/weekly-beside-sim.out.txt`) shipped the weekly drift watch (**DW**)
beside the daily watch (**Q**): on x1.9 climbs Q+DW heard 131 of 150 by 8 weeks, but on x1.3 climbs only 87 of 150
(Q alone 65). Its README "Next" asked for "a pulse-in-growth test (an epidemic-change statistic on weekly growth) to
hear x1.3 climbs". A slow climb is a pulse in growth: weekly log growth sits near zero, rises for the climb's 4 to 8
weeks, then falls back. This round tests one such statistic, added as a third arm (**P**) beside Q and DW.

## The statistic (P)

On whole Monday-to-Sunday weekly totals `W_0..W_{n-1}` (as round 7), `y_t = log(max(W_t, 1))`. At the end of each week
`T` from week 24 (so a year-long export has history before any climb can start at day 200, week 28):

- for each window length `k` = 2 to 8 weeks, the window's summed growth with two-week ends:
  `D_k(T) = (y_T + y_{T-1}) / 2 - (y_{T-k} + y_{T-k-1}) / 2`;
- its own history: `D_k(t)` for every `t` from `k + 1` to `T - 9` (so no history value shares a week with any window
  checked now); with fewer than 8 values, `k` is skipped this week;
- `Z_k = (D_k(T) - median) / (1.4826 * MAD)` of that history (a robust z against the shop's own k-week growth, so a
  steady grower or a noisy shop is judged against itself);
- `Z = max over k of |Z_k|` (two-sided, as the watch is). P alerts when `Z >= c` and P sent no alert in the previous 8
  weeks. The alert is dated to the Monday of week `T - k* + 1` (`k*` the k with the largest `|Z_k|`) and sent on the
  Sunday of week `T`.

## Calibration of c (before any test shop runs)

`c` is the smallest value in {3, 3.5, 4, 4.5, 5, 5.5, 6} at which P alone, on 150 unchanged calibration shops (round 7's
generator, seed 20261126), sends at most 0.10 alerts per 100 days of Q's checked days (297 days a shop, so at most 44
alerts in all). If none qualifies, the round stops there and fails.

## Test shops (`eval/growth-pulse-sim.mjs`, seed 20261127, fixed now)

Round 7's generator exactly (`eval/weekly-beside.prereg.md`, "Simulation": log-uniform base 500 to 50,000, weekday
factors `exp(0.25 N(0,1))`, a shut weekday in half the shops, Student-t5 day noise at scale `s` from 0.15 to 0.45,
AR(0.5) wobble, five one-day closures; climbs linear in the log over 28 to 56 days from day 200 to 300), with a fresh
seed: 150 unchanged (**N**), 150 x1.3 (**R30**), 150 x1.9 (**R90**), drawn in that order. Q and DW exactly as round 7
ran them. Caught by 8 weeks and false alerts exactly as round 7 defined them.

## Bars

- **P1 (hears more small climbs in time):** on R30, Q+DW+P catches by 8 weeks at least Q+DW + 15 of 150.
- **P2 (for little more noise):** on N, Q+DW+P's false alerts per 100 days are at most Q+DW's + 0.15.
- **P3 (not one noise level only):** P1's gain is at least 5 in each half of the shops, `s` below 0.30 and `s` of 0.30
  or more.

## What follows

If P1, P2 and P3 pass, the watch gets an opt-in that runs P on the weekly totals with the calibrated `c`, and the
README documents it beside `--weekly`. If any bar fails, nothing ships and the README says which. Descriptive only (no
bar): R90 catches for both arms, P alone on R30 and R90, median delays, catches with a shut weekday against without,
and P on the real UCI Online Retail shop (round 7's files).
