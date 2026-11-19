# Pre-registration: the windowed Bayesian detector for watched counts, a margin rule on fresh seeds (2026-11-19)

Written and committed before `eval/poisson-window-margin.mjs` was run on any seed below.

**Why.** `eval/poisson-window.prereg.md` asked `bocpd-window` to have a mean false-alert rate *at or below* `bocpd`'s
on four nulls. It found 84 of 100 steps against 60 and lost on false alerts by 1.61 against 1.21 per 1,000 checks:
one alert in 620 checks on one cell (N2). At that size, one alert decides a rule written as "at or below", so the
rule could not tell a real cost from noise. This round asks the question the merchant has instead: is the extra
false-alert rate small enough to be worth the extra steps heard, measured tightly enough to say so?

**Candidate.** `bocpd-window` as the default detector for `--model poisson` (the watch's count columns). Everything
else at the watch defaults.

**Design.** As before: `replayWatch` (watch-core.mjs) on 120 daily points, first check at point 90, one check per
point (31 checks), budget unlimited; a step at point 108, found = an alert dated within 3 points of 108 by the last
check. **Fresh seeds 201-400** (200 per cell; the last round used 101-120 with the same generator, so 201-400 have
not been seen by any rule). Both detectors see the same series (paired).

Cells: the nine of the last round, plus two more overdispersed ones, because real daily orders are usually more
clumped than Poisson and N2 was where the window lost:
- nulls N1 Poisson 30; N2 NB mean 30, variance 60; N3 Poisson 30 with weekends 0.6x (no `--period`); N4 Poisson 5;
  **N5 NB mean 30, variance 90**
- steps S1 30 -> 15; S2 30 -> 21; S3 30 -> 45; S4 5 -> 2; S5 NB (var 2x mean) 30 -> 18; **S6 NB (var 3x mean) 30 -> 18**

**Margin.** A merchant's watch checks once a day, about 365 checks a year. An extra **1.0 false alert per 1,000
checks** is at most one more false alert in about 2.7 years of daily watching. That is the most this round accepts
in exchange for hearing more real drops.

**Rule.** `bocpd-window` becomes the `--model poisson` default only if all four hold:
1. **(F1, non-inferiority on false alerts)** the upper end of the 95% interval for the paired difference
   (window minus bocpd) in false alerts per 1,000 checks, pooled over the five nulls (each null weighted equally), is
   at or below **1.0**. Interval: 10,000 bootstrap resamples of the 200 seeds, stratified by cell, percentile method,
   bootstrap seed fixed in the script.
2. **(F2, no regime blows up)** in no single null cell is the window's point difference above **2.0** per 1,000 checks.
3. **(D1, more steps heard)** the lower end of the 95% interval for the paired difference in steps found, pooled
   over the six step cells, is above **0** (same bootstrap).
4. **(D2, no step cell worse)** in no step cell does the window find more than **4 fewer** of 200 than `bocpd`.

If any fails, the default stays `bocpd`, the per-column opt-in stays as shipped, and the result is recorded as it
falls. Median delay is reported, not decided on. No setting is tuned on these cells.

**If it passes, what changes.** `defaultDetector('poisson')` returns `bocpd-window`; the "How eager" ladder for
counts becomes quiet `bocpd-window`, middle `bocpd`, eager `pelt` only if `bocpd` is quieter than the window on the
null cells here (otherwise middle is dropped and the ladder keeps two settings); the README, the guide page, the made
repository's README and the workflow comment say so. `--model meanvar` is not touched.
