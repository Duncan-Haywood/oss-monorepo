# Pre-registration: a wander gate under the count Middle (2026-11-21)

Written and committed before any run of `eval/middle-wander.mjs` on the seeds below. The script was smoke-run with
`SEED_SHIFT=8500 NSEEDS=1` (wiring only). Probes on seeds 9901-9912 (`eval/middle-wander-probe.mjs`) decide nothing and
are not reused.

**Why.** README "The joint growth fit, gated" (2026-11-21) made the gated joint growth fit the count Middle and named
its weakness: a level that wanders at random is not a line. On log-mean walks with sd 1% and 2% a day (set 3 T4, T5)
Middle still sent 5.21 and 11.25 alerts per 1,000 days (20 and 34 of 40 sites alerted): PELT reads the wander as a
staircase and its newest step alerts.

**What the probes showed.** `eval/middle-wander-probe.mjs` prints the gate statistic (log n subtracted; open above 0)
on the first 200 days of probe series, seeds 9901-9910. The first version (no slope taken out) opened on 29 of 30
growth series (T1-T3), and in a replay (`eval/middle-wander-probe-replay.mjs`, seeds 9901-9912) it cut T4 alerts from 7
to 1 and T5 from 19 to 6 but heard T6's fall on 9 of 12 against Middle's 11: on a growing site the drift fit read the
fall as wander. Taking out a one-step median slope opened the gate on everything (that slope is as noisy as the
counts); a lag-n/2 median slope read a large fall as growth (a flat series with a 40% fall opened 7 of 8). The final
version below, with the slope read from lag-n/4 pairs that do not straddle a jump of a first flat fit, opened on 7 of
40 flat and step series of set 2 by at most +0.6, on 3 of 60 simulated Search Console sites, on T4 2 of 10, T5 6 of 10,
T6 3 of 10, T1 2, T2 8 and T3 5 of 10. The gate rarely opening on T4 is why K1 may fail.

**The candidate, W.** `COUNT_MIDDLE` plus `wander: 'gated'` (new option, `watch-core.mjs` `wanderGate`). At each check,
when Middle has found any change, the window's counts are taken to log(x + 0.5), less a day-of-week effect (median per
index mod 7 of the residual from a centred 7-point mean), less a robust slope (median over lag-n/4 pairs, within the
segments of a first no-wander fit, of the difference over the lag). The drift model of `drift-level.mjs` (a random-walk
level with jumps, penalty 2 log n) is then fitted twice with the same noise scale: with its wander q profiled
(`driftNoiseML`) and with q = 0 (a flat level with jumps). If the first beats the second by more than log n, the level
is wandering and a Middle change is kept only when the drift fit has a jump within `tolerance` (5) points of it.
Otherwise nothing changes. The gate only removes changes, so W's alerts are close to a subset of Middle's (the persist
and hold guards can shift a date).

**Arms.** D: `COUNT_DEFAULTS` (reported). M: `COUNT_MIDDLE` (pelt + NB + gated growth). W as above. All
`--model poisson`, watch defaults otherwise, replayed each day, paired by seed. Sets, generators and scoring are those
of `eval/middle-trend-joint.prereg.md`, on **fresh seeds**: set 1 **3501-3520** (20 per cell, cv 0.15 and 0.30), set 2
**6001-6060** (60 per cell), set 3 **3701-3740** (40 per cell). Bootstrap seed 20261124, 10,000 resamples.

**Bars against Middle (K): does W replace `COUNT_MIDDLE`?**
- K1 (the point): set 3, T4 and T5 pooled, W's alerts at most half of M's.
- K2 (a fall on a moving level is still heard): set 3 T6 (grows 30%, falls 20% on day 180), falls heard W at least
  M's minus 4 of 40.
- K3 (Search Console sites, where the gate should stay shut): set 1, at each cv, mean days unaware over the nine fall
  cells, W minus M, upper end of the 95% paired bootstrap interval at most +1.0.
- K4 (flat and step cells): set 2, steps found W minus M, lower end at least -7 of 360; pooled false alerts per 1,000
  checks W minus M, upper end at most +0.5.
- K5 (growth stays quiet): set 3, T1-T3 each, W's alerts per 1,000 days at most M's + 1.0.

**Decision.**
- All K pass: `COUNT_MIDDLE` gains `wander: 'gated'`, so the page's "Middle" for counts, the count hint's middle rung
  and `--detector auto` use it; the notes that say Middle does not allow for a wandering level are reworded by what
  T4 and T5 show.
- Any K fails: `COUNT_MIDDLE` stays; the gate ships as `--wander gated` for counts, an opt-in, with this round's
  numbers and the failed bar named in the README.

**Known risks, written down before the runs.** A 20% fall on a site with cv 0.30 noise is about one noise sd on the
log scale, so on a site the gate calls wandering the drift fit can read the fall as wander and the change is dropped
(K2, K3). The gate statistic depends on the day-of-week removal; a series with another cycle is not covered. T4's
wander (1% a day) is near the noise and opens the gate on fewer sites than T5.
