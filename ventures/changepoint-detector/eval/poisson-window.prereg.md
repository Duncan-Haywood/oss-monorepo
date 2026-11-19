# Pre-registration: a windowed Bayesian detector for watched counts (2026-11-19)

Written and committed before `eval/poisson-window.mjs` was run on any cell below.

**Why.** Building the Shopify source (`shopify-metrics.mjs`), its end-to-end test watched daily orders (Poisson,
30 a day) that halved 12 days before the end. The default `--model poisson` detector, `bocpd`, sent no orders
alert in 2 of 8 shops (seeds 6 and 7 of a scratch replay), while revenue (level model, `bocpd-ar1-window`) was
heard in 8 of 8. On one of them the CLI's Bayesian pass puts only 49% on a change within 3 points of the date PELT
finds: the probability is spread over neighbouring days, and `bocpd` alerts on single points. The level model
fixed exactly this on 2026-11-12 by summing over 5 neighbours (README "Round 4"), but with `--model poisson` the
default stayed `bocpd`; `bocpd-window` (the same sum, no AR(1) term) was never tested on counts.

**Candidate.** `bocpd-window` as the default for `--model poisson`. Everything else at the watch defaults.

**Design.** `replayWatch` (watch-core.mjs) on 120 daily points, first check at point 90, one check per point
(31 checks), budget unlimited. Fresh seeds 101-120 (20 per cell), not used before.

Nulls (false alerts per 1,000 checks; any alert is false):
- N1 Poisson, 30 a day
- N2 negative binomial, mean 30, variance 60
- N3 Poisson, 30 a day with weekends at 0.6x (no `--period`)
- N4 Poisson, 5 a day

Steps (at point 108, 12 days before the end; found = an alert dated within 3 points of 108 by the last check):
- S1 30 -> 15; S2 30 -> 21; S3 30 -> 45; S4 5 -> 2; S5 negative binomial (variance 2x mean) 30 -> 18

**Rule.** `bocpd-window` becomes the `--model poisson` default only if (a) its mean false-alert rate over the four
nulls is at or below `bocpd`'s, and (b) it finds at least as many steps over the five step cells, with at least
one more. Otherwise the default stays and the result is recorded as it falls. Delay (checks from the step to the
alert) is reported, not decided on. No setting is tuned on these cells.
