---
title: "Shrinking a solar boat's one-year forecast correction makes it safe, not yet useful"
seo_title: "Empirical-Bayes shrinkage of a solar USV's learned sun forecast"
date: 2026-11-14
tags: [research, marine-hull]
description: "Shrinking each learned month toward the mean ratio makes a solar boat's one-year forecast correction harmless, but it still trails no correction."
---

The [last step](2026-11-14-marine-hull-solar-boat-how-many-years-of-history.md) found that a solar boat which corrects its sun climatology from one earlier year of its own log does worse than no correction at all. One year's monthly harvest-to-forecast ratio carries about 4.4% of that year's weather. The forecast's real seasonal error is only 1.8% at a typical point, so the correction adds more error than it removes.

The textbook fix is empirical-Bayes shrinkage (James and Stein, 1961; Efron and Morris, 1973). Pull each month's learned ratio toward the year's average ratio, by the share of its spread that looks like noise. The boat can estimate that noise from the same year's daily numbers: how much each day's harvest strays from the month's ratio, inflated for runs of cloudy or sunny days. We wrote eight predictions down before running anything, reran 6zzb's 168 cases with the shrunk correction, and five held.

What came out:

- **The noise estimate is right.** Across 720 point-half-months, the estimated noise of a one-year monthly ratio is a median 0.89 times the real spread between years. The boat can tell how far to trust its own log.
- **One year stops hurting on ordinary water.** Using only the forecast's own error, the shrunk one-year correction beats the plain 7-day rule (further, with no more payload downtime) in 7 of 8 pooled cases against 8 for no correction and 4 unshrunk. Point by point it wins 129 of 240 cases against 126 uncorrected and 106 unshrunk. Its distance never falls more than 1% below the 7-day rule.
- **It is not yet a gain.** Over all 168 cases, which include added seasonal biases, the shrunk one-year correction wins 110 against 139 for no correction (unshrunk 97). It closes about a third of the gap.
- **It costs where the signal is real.** Above 50 degrees the forecast's seasonal error is 4.5 to 8.5%. There shrinkage throws some of it away: 61 of 168 against 77 unshrunk. The prior treats the twelve months as unrelated, so it shrinks a smooth seasonal swing as hard as noise. Paired with a fixed 30-to-60-day feedback instead of the self-tuning one, the shrunk correction does best of the one-year rules there (6 of 8 real cases).

For anyone building a solar boat's energy manager: after one season, a shrunk month-by-month correction is a safe way to use the log; it will not make things worse on ordinary water. To gain from it, wait for about three years, or at high latitude keep the raw correction. The next thing to test is a prior that expects a smooth yearly cosine, shrinking toward a fitted first harmonic rather than a flat mean.

Limits: one prior family; the signal variance comes from twelve months and hits zero in 15% of one-year fits; the pooled real-data test is 8 cases; history length and recency are still mixed; simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zzc).
