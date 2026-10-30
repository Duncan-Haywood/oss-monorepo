# Changepoint Detector: find when a time series changed

A free, in-browser **changepoint detection** tool: paste or upload a time series
(sales, sign-ups, sensor readings, latency, prices) and see **when its level or
volatility changed**, with the exact best segmentation from **PELT** and a
probability for each change from **Bayesian online changepoint detection**.
Nothing is uploaded. Also a command-line tool and an engine AI agents can call.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/

After using this, you can say **whether a series really shifted, from which
date, by how much, and how sure the evidence is**, instead of eyeballing a chart.

Part of [research algorithms as free tools](../../portfolio/research-tools/README.md):
methods from published papers, run on your own data, with the papers cited.

## Methods and citations

- **PELT**: Killick, R., Fearnhead, P. & Eckley, I. A. (2012). Optimal
  detection of changepoints with a linear computational cost. *Journal of the
  American Statistical Association* 107(500), 1590-1598.
  doi:[10.1080/01621459.2012.737745](https://doi.org/10.1080/01621459.2012.737745).
  Exact minimum of Gaussian -2 log-likelihood plus a penalty per change, for a
  change in mean (noise sd estimated once from the median absolute difference
  of successive points) or in mean and variance (minimum segment 5 by default).
  A third model, `poisson`, is for count series (visits, orders, incidents
  per day): the cost is the Poisson -2 log-likelihood with one rate per
  segment, and the Bayesian pass uses the Gamma-Poisson conjugate pair
  (negative-binomial predictive, Gamma prior centred on the series mean).
  Penalties: BIC (default; 2 log n for mean, 3 log n for mean and variance),
  AIC, Hannan-Quinn, or a number.
- **Bayesian online changepoint detection**: Adams, R. P. & MacKay, D. J. C.
  (2007). Bayesian online changepoint detection.
  [arXiv:0710.3742](https://arxiv.org/abs/0710.3742). Run-length recursion
  with a constant hazard and a Normal-Inverse-Gamma model (Student-t
  predictive), prior centred on the data's median and robust variance.
  Reported per point: the posterior probability, five points later, that a new
  segment began there (under a constant hazard, P(change at the newest point)
  always equals the hazard, so it carries no information on its own).

The engine exports both citations as `PAPERS`, with what was implemented and
where it departs from the paper.

## Use it

- **Browser:** open the live page, paste a CSV, or click the Nile example.
- **Command line** (Node 18+, no install):
  `node cli.mjs series.csv --column sales --model meanvar` (`--model poisson` for counts), `--json` for
  machine-readable output, `--example` for the Nile data, `--help` for all options.
- **AI agents / MCP:** from a clone of the repository,
  `node platform/agents/tools.mjs call changepoint-detector analyze --input '{"values":[...]}'`
  or the `call_tool` tool of the repository's MCP server
  ([`platform/agents/`](../../platform/agents/README.md)).

## Verification

`node --test` (47 tests). What they check:

- **Against an independent PELT:** on 100 seeded cases (60-200 points, 0-3
  planted changes, mean and mean-and-variance models, several penalties) the
  changepoints equal those of the `ruptures` package's `Pelt` (v1.1.10, BSD-2),
  a separate implementation: 100 of 100 identical. The series and ruptures'
  answers are in `data/ruptures-crosscheck.json`; `data/make_ruptures_fixture.py`
  regenerates them. R's `changepoint` is still unchecked (CRAN was unreachable).

- **Against the literature:** on the Nile series (data/SOURCE.md) PELT puts
  the change at index 28, the first year of the new level being 1899: the
  same answer Cobb (1978) gives and R's `changepoint::cpt.mean(Nile,
  method = "PELT")` reports (`cpts = 28`). Output of `node cli.mjs --example`
  on 2026-10-20: segments 1871-1898 (mean 1097.75, sd 135.0) and 1899-1970
  (mean 849.97, sd 124.8); Bayesian probability 79% at 1899, the only point
  above 50%. The mean-and-variance model gives the same single change.
- **PELT is exact:** on 25 seeded random piecewise series, both models and
  three penalties, PELT's segmentation and cost equal brute-force optimal
  partitioning (no pruning).
- **BOCPD is exact:** with the hazard driven to zero, its log evidence equals
  the closed-form Normal-Inverse-Gamma marginal likelihood (to 1e-6).
- **Poisson model:** the cost equals a hand-computed -2 log-likelihood; PELT
  equals brute-force optimal partitioning on 15 seeded count series, three
  penalties each; the Bayesian log evidence equals the closed-form
  Gamma-Poisson marginal (1e-6) when the hazard vanishes; a planted rate
  shift (4 to 12 per point) is found within 3 points; at most 3 of 20
  constant-rate series are split; non-integer or negative input is rejected.
  `ruptures` has no built-in Poisson cost, so the outside check gives it a
  custom one built from `scipy.stats.poisson.logpmf` at each segment's
  maximum-likelihood rate (full likelihood, so it does not share this
  venture's formula): its PELT returns the same changepoints as ours on 90 of
  90 seeded count series (3 penalties x 30 series, 44 with changes;
  `data/poisson-crosscheck.json`, regenerated by `data/make_poisson_fixture.py`).
  R's `changepoint::cpt.meanvar(test.stat = "Poisson")` was not available.
- **Behaviour:** planted mean shifts are recovered within 2 points; a pure
  variance change is found by the mean-and-variance model; BIC splits at most
  3 of 30 pure-noise series of length 300; the robust noise estimate ignores a
  level shift; CSV parsing handles headers, named columns, quoted thousands,
  blank rows and semicolons.

Not verified: R's `changepoint` package on the Poisson model (above).

Seasonal and autocorrelated series (`--period n`, `--ar1`; seeded synthetic
series, 40 each, in `engine.test.mjs`):

- **Autocorrelation.** Both methods assume independent noise, so AR(1) noise
  (rho 0.8, 300 points, no change at all) gave a false PELT change in 40 of 40
  runs. With `--ar1` the noise scale becomes the long-run sd (difference-based
  sd x sqrt(1+rho)/(1-rho), rho estimated from the lag-1 correlation of the
  clipped first differences, which a level shift barely touches) and false-change
  runs fall to 4 of 40. A real shift of 8 in the same noise was found exactly
  once within 10 points of the truth in 35 of 40 runs, so the correction costs
  some power. Mean model only. The Bayesian pass uses the conditional AR(1)
  likelihood with rho fixed: a run's first point is stationary, x ~ N(mu, s2/(1-rho^2)), and
  later points satisfy x[t] - rho x[t-1] = (1-rho) mu + e, so each run keeps a normal-inverse-gamma
  posterior on mu and s2 (evidence equals the closed form, tested). On the same 40 no-change
  series it raised a detection in 40 of 40 runs uncorrected and 0 of 40 with `--ar1`, and the
  shift of 8 was detected within 10 points in 40 of 40 runs (shift 4: 27 of 40). The earlier
  version ran the plain model on the prewhitened series x[t] - rho x[t-1], which shrinks a
  persistent shift by (1 - rho) and gave 25 of 40 at shift 8 (7 of 40 at shift 4), 1 false run.
- **Joint fit (`--ar1 joint`).** Instead of widening the noise scale, PELT runs on the
  exact Gaussian AR(1) likelihood (each segment's first point stationary, its mean fitted
  in closed form from prefix sums), and rho and the innovation sd are re-estimated from the
  residuals about the fitted segment means, three passes in all. Same 40 series: false
  changes on the 300-point no-change series 4 of 40 (the same as the long-run scale), and a
  shift of 4 found exactly once within 10 points in 34 of 40 runs against 28 of 40 for the
  long-run scale (shift 8: 34 against 35, no gain). A first version with rho taken once from
  the differences gave 7 of 40 false runs; with rho known the figure is 2 of 40, so the
  residual re-estimate is what keeps it honest. PELT on this cost equals optimal
  partitioning (tested). The Bayesian pass uses the conditional AR(1) likelihood above, with the same rho.
  Tried and not kept: under plain `--ar1`, re-estimating rho for the Bayesian pass from the
  residuals about PELT's segment means instead of the clipped differences. On the same series
  (300 points, shift at 150, seeds 1..40) the difference estimate is already close (mean rho
  0.813 at true 0.8, 0.528 at 0.5, with a shift of 4; the joint fit gives 0.772 and 0.479).
  Detections within 10 points of a shift of 4 went 27 to 29 of 40 (rho 0.8) and 37 to 38 (rho 0.5),
  with one more false-detection run each (0 to 1, 1 to 2), so the gain is inside noise and the code was dropped.
- **Seasonality.** A level shift of 4 under a sine of amplitude 10 (period 12,
  144 points) gave exactly one change in 0 of 40 runs without adjustment and
  exactly one change within 1 point of the truth in 33 of 40 with `--period 12`
  (centred moving average, per-phase median, profile centred at zero). It needs
  two full cycles. For counts, see the next item.
- **Known holidays for counts (`--model poisson --holidays a,b,...`, added 2026-10-21).** A bank holiday
  or a closure is a dip a calendar already explains. The listed rows (labels from the date column, else
  1-based row numbers) share one multiplicative factor on their rate, an exposure like the seasonal ones, so it
  composes with `--period` and `--trend`. The factor alternates with PELT: segment under the current exposure,
  then set the factor to the holiday counts over what the segment rates predict there (at most 10 passes, until it
  moves less than 1e-4 in log). Measured on 200 daily counts at rate 40 with a holiday every 17th day at 0.3 of the
  rate, 40 seeded series: with no step, changes per series 3.73 -> 0.07 and the fitted factor 0.297 on average; with
  a 1.5x step at point 100, changes per series 8.40 -> 1.07, step found within 5 points 40 of 40 both ways; with no
  holiday effect (factor 1) the output is unchanged (0.00 and 1.02 changes per series, factor 1.001 and 0.993). Limits:
  one common factor, not one per holiday; a holiday on a seasonal phase was absorbed in that phase's factor
  (fixed 2026-10-21: see "Holidays held out" below); the calendar is yours to supply, none is built in. The
  test in `engine.test.mjs` reproduces the step case on one seed.
- **Seasonal counts (`--model poisson --period n`, added 2026-10-20).** Subtracting a profile
  would break counts, so the cycle is multiplicative: a count in phase p has rate (segment rate) x f[p],
  the factors average 1 and enter the Poisson likelihood as exposures (cost 2(a - a log(a / sum e)), the
  Gamma-Poisson pass gets beta += e and a negative-binomial predictive with success probability beta/(beta + e)).
  The factors start from phase totals over a centred moving average, then alternate with PELT: segment
  under the current exposures, re-estimate each factor as the phase total over what the segment rates predict
  for that phase, until they move less than 1e-4 (at most 8 passes), so a rate shift stays in the segments.
  Tests: the exposure cost equals a hand computation; PELT equals brute-force optimal partitioning with
  exposures; BOCPD log evidence equals the closed-form marginal when the hazard vanishes. Measured on
  weekly counts (period 7, factors 0.4 to 1.6, 210 points, seeds 300..319 and 1300..1319): a constant rate of 12
  gave a false change on 15 of 20 runs without `--period 7` and 0 of 20 with it; a rate going 10 to 15 at
  point 105 gave exactly one change within 8 points of it on 20 of 20 runs with `--period 7`. Fitted factors are
  within 0.12 of the true ones on a 280-point series whose rate doubles midway. `--drift` is not available for counts.
- **Count trends (`--model poisson --trend`, added 2026-10-20).** A subtracted line would break counts, so the
  trend is multiplicative: the rate at point t is (segment rate) x seasonal factor x exp(g u), u running from
  -0.5 to 0.5 over the series, so g is the total log change. exp(g u) is another exposure in the Poisson
  likelihood and composes with `--period`. g starts from the median of lag-n/4 differences of log counts, then
  alternates with PELT: segment under the current exposures, one Newton step on g with each segment's rate
  profiled out, until g moves less than 1e-5. One common growth rate by default; `--trend bend` lets it change once (below).
  Measured on 200 counts, rate 10 growing by e^1.2 (seeds 500..539): no step, 3.80 changes per series without
  `--trend`, 0.07 with it; a x1.6 step at 100 on top of the ramp, 4.55 -> 1.40 changes per series, the step found
  within 8 points 40/40 either way and as the only change 0/40 -> 30/40; flat series 0.03 -> 0.05 (no cost).
  With `--period 7` (210 points, factors 0.4 to 1.6, growth e^1.0, x1.5 step at 105, seeds 900..919): 4.10 -> 1.20
  changes per series, step as the only change 0/20 -> 18/20, mean fitted g 1.04. Tests: growth recovered within 0.35, flat
  series near 0, bends refused.
- **Bends in the count trend (`--model poisson --trend bend`, added 2026-10-20).** The growth rate may change once:
  the log rate follows g u up to a knot and g + h after it. Knots are scanned on a grid of n/40 points between 10% and
  90% (`--knot-margin`), then refined point by point; each candidate starts from the Theil-Sen slope on either side of
  the knot and runs the same PELT / Newton alternation, now with a 2 by 2 Newton step. Candidates are compared by
  PELT's penalised cost plus the term `sum x log(exposure)` that PELT's cost leaves out (without it the comparison
  across exposures was wrong: knots landed at the ends and 12 of 20 straight series got a bend). A bend is kept
  only if it lowers the cost by 3 log n (the knot and the slope change, plus the scan). 200 counts, rate 10, log rate
  rising 0.8 over the first half and 3.2 per series length after (seeds 1600..1639): changes per series 3.38 with
  `--trend`, 0.17 with `--trend bend`; the knot within 15 points of the true 100 on 36 of 40; on 40 straight log-linear
  series (seeds 1600..1639) a bend was kept on 0 of 40 and changes per series stayed 0.03. With `--period 7` (210 points, weekly factors 0.5 to 1.6, rate 10, same bend, seeds 1700..1739): changes per series
  5.83 with `--period` alone, 3.17 with `--trend`, 0.23 with `--trend bend`, a bend kept on 38 of 40 and the knot within
  15 points of the true 105 on 35; on 40 straight series 0.05 changes and no bend. A second knot is offered with `--trend bends` (next item).
- **Two bends in the count trend (`--model poisson --trend bends`, added 2026-10-21).** After the first bend is accepted, the
  search adds one more knot (a new hinge term in the same joint Newton fit, now a general symmetric solve instead of a 2x2
  one) if it lowers the penalised cost by another `3 log n`; at most two bends for counts. Measured on 40 seeded series of
  240 Poisson counts whose log growth is 0.01 per point to 80, 0.03 to 160 and -0.02 after (seeds 2000..2039): changes per
  series 4.08 with `--trend bend`, 1.77 with `--trend bends`; both knots within 15 points of the truth (80, 160) on 23 of 40
  (a second knot was kept on 26). On 40 straight log-linear series (seeds 3000..3039) a bend was kept on 0 of 40 and changes
  per series stayed 0.10. Output: `trend.growthChangesAtAll` and `trend.logGrowthAcrossSeriesRates`. Not yet measured with
  `--period` or `--overdispersion`.
- **Bends on clumpy counts (measured 2026-10-21, no code change).** `--trend bend` with `--overdispersion nb` was not measured before. 210 counts, rate about 10, each drawn at an independent lognormal rate (sd 0.35), log growth flat to point 105 and 4.0 per series length after, seeds 5000..5039 (`data/measure_nb_bend.mjs`), 40 series per row, plus 40 straight log-linear series. Bend kept / knot within 15 points of 105 / changes per series, Poisson cost then NB: no season 15 and 9 of 40 at 4.40, then 15 and 9 at 2.70; weekly (`--period 7`) 18 and 13 at 4.08, then 18 and 13 at 2.63. Straight series (a bend kept at all): Poisson 2 of 40 in both settings, NB 2 of 40 in both. So NB already removes the false step changes (5.03 -> 0.90 per straight series) but the bend search itself still runs on the Poisson cost and keeps the same bends. Tried and dropped: multiplying the bend's `3 log n` threshold by the NB variance-to-mean ratio at the mean rate (1 + mu / r). False bends fell 2 -> 0 of 40 (both settings) but the planted bend was kept on only 9 and 12 of 40 instead of 15 and 18, and the knot within 15 points on 6 and 9 instead of 9 and 13: fewer false alarms bought with more lost power, so it is not shipped. **Then shipped (2026-10-21):** with `--overdispersion nb` the bend search now runs PELT and ranks knots on the negative-binomial cost itself (`poissonTrend`'s `nbSize`; the growth steps stay Poisson score steps, a quasi-likelihood), with the plain `3 log n` threshold. Same 40 series per row, bend kept / knot within 15 points / changes per series, Poisson cost then NB cost: no season 15, 9, 4.40 then 18, 13, 2.30 (the earlier NB-penalty-only row was 15, 9, 2.70); weekly 18, 13, 4.08 then 22, 18, 2.15 (was 18, 13, 2.63). Straight series with a bend kept: Poisson 2 of 40 in both settings, NB 0 of 40 in both, with 0.40 and 0.55 changes per straight series (5.03 and 5.70 for the Poisson cost). So the likelihood does what the rescaled threshold only traded: fewer false bends and more planted bends found. It costs time: the NB cost with exposures is O(segment length), about 3 to 6 s per 210-point series against 0.25 s. An earlier, milder bend (log growth 1.6 then 3.2 per series length, total rise the same as a straight line) was kept on 2 to 3 of 40 series under every setting, i.e. not detectable at this noise level.
- **Two bends on clumpy counts (measured 2026-10-21, no code change).** `--trend bends` with `--overdispersion nb` was not measured. 240 counts, log growth 0.01 per point to 80, 0.03 to 160, -0.02 after (the "Two bends" series), each count at an independent lognormal rate (sd 0.35), 40 series per row, seeds 6000..6039 (`data/measure_nb_bends.mjs [N] [rate]`), plus 40 straight log-linear series. At rate 10, Poisson cost then NB: a bend of any kind kept 17 then 16 of 40 (weekly 17 then 20), both knots within 15 points of 80 and 160 on 3 then 1 of 40 (weekly 0 and 0), changes per series 20.3 then 6.0 (weekly 19.2 then 5.3); straight series with any bend kept 5 then 0 of 40 (weekly 4 then 1), changes per series 9.5 then 0.42. At rate 40 the NB path keeps a bend on only 12 of 40 (weekly 14), both knots on 0, changes per series 10.0 (7.3 weekly), against 36 of 40 bends and 49.5 changes per series for Poisson, whose bends are mostly noise (15 of 40 straight series get two). So under NB the second knot is, honestly, not found: two bends of this size are below what clumpy counts at this rate can show, and what NB buys is the removal of false bends and steps. Tried and dropped: lowering the `3 log n` threshold (rate 40, NB): 2 log n kept a bend on 26 of 40 and two on 5, 1.5 log n on 31 and 7, but both knots near the truth stayed at 2 of 40 and false bends on straight series rose from 0-1 to 6 of 40 at 1.5. More bends found, not more correct ones. Runs 0.3 to 0.6 s per series.
- **A sharper second-bend test? Measured, and no (2026-10-21).** The idea was to replace the `3 log n` cost-drop rule for the second hinge on clumpy counts with a score or profile-likelihood test. Before building one, `data/measure_second_hinge.mjs` asks whether the second knot's cost drop (in units of log n, from `diagBends`, a debugging array that `poissonTrend` fills) ranks the series at all. 240 counts at rate 40, independent lognormal clumping (sd 0.35), `--model poisson --trend bends --overdispersion nb`, 40 series per shape, seeds 6000..6039: the two-bend series (growth 0.01, 0.03, -0.02), a one-bend series (0.01 then 0.03 from 120) and a straight one. A second round happens only when the first knot was accepted. Median drop of the second knot, 90th percentile, maximum: two bends 0.00, 0.93, 3.57; one bend 1.46, 9.80, 21.60; straight 0.00, 0.00, 0.09. The area under the curve for telling two bends from one is 0.22 (chance is 0.50), and from a straight series 0.64. The best second knot on a one-bend series is usually a better fit than the best second knot on the real two-bend series, because the clumping is bigger than the second kink, so no threshold on that statistic, and no test built on the same likelihood gain, can pick out the real second bend. This agrees with the threshold sweep above (more bends, not more correct ones). Dropped: no test was built. The two-bend path stays as it was; the diagnostic array costs nothing when unused. Left open: a different kind of evidence (a hold-out or a second series) rather than a sharper test on this one.
- **Clumpy or sticky counts (`--overdispersion`, added 2026-10-20).** The Poisson cost assumes the variance equals the mean.
  Counts whose rate wanders (a lognormal rate with lag-1 memory 0.6, sd 0.35, on the same weekly series, seeds 1700..1739)
  break it: 24 changes per series with `--period 7` alone and 23 with `--trend bend`, 18 on series with no change at all.
  `--overdispersion` estimates a quasi-Poisson dispersion phi (`countDispersion`: block totals over whole cycles, each
  compared with its neighbours by a second difference, so a straight trend cancels and a rate step is ignored by the
  median) and multiplies PELT's penalty and the bend's `3 log n` threshold by it, or takes phi from `--overdispersion 4`.
  Mean phi was 1.5 on Poisson counts and about 20 and 14 on the wandering ones; changes per series fell 23.1 to 1.4 (bent
  series) and 18.0 to 0.6 (straight), and on independent counts the cost is small (bend kept 38 to 39 of 40, knot within
  15 points 35 to 36). The cost on wandering counts is real: the planted bend is then found on 1 of 40 series, because
  a growth change of that size is hard to tell from the noise at phi 20; the false alarms are gone, the power is not.
  The Bayesian pass is tempered by the same phi (added 2026-10-20): each count and its exposure are divided by phi
  before the Gamma-Poisson update, so it weighs evidence like phi-times-fewer independent counts. On 40 wandering weekly
  series with no change (seeds 1700..1739, `--period 7 --overdispersion`) it flagged 5.8 points per series, on all 40
  series, and now 0.25, on 4 of 40. The cost is power, said plainly: with a planted 1.8x rate step at the midpoint the
  Bayesian pass was within 7 points on 22 of 40 series before (while flagging 6.4 other points per series) and 0 of 40
  now; at 3x it is 34 to 2 of 40, at 5x 35 to 9 of 40. So on wandering counts treat PELT as the detector and the
  Bayesian pass as a check that no longer cries wolf; a negative-binomial cost might recover power. Page: "Counts are clumpy or sticky".
- **Independent clumpy counts (`--overdispersion nb`, added 2026-10-20).** A negative-binomial cost (`makeCost(..., 'negbin')`,
  variance mu + mu^2 / r, one mean per segment, PELT still exact) with r estimated from the series (`negbinSize`: the median
  of squared first differences gives a variance that a step does not spoil). 200 counts, rate 10, each count drawn at a
  lognormal rate (sd 0.35) independently, seeds 1700..1739: false changes per series on a flat series 3.55 with the Poisson
  cost, 0.78 with the quasi-Poisson penalty (`--overdispersion`), 0.13 with the negative binomial. With a 1.8x step at 100 the
  step was found within 10 points on 39 of 40 with either correction, at 1.27 changes per series against 1.50. Sticky counts
  (lag-1 memory 0.6) are not helped: 6.75 false changes per series against 1.20 for the quasi-Poisson penalty, because the
  negative binomial still treats counts as independent, so use plain `--overdispersion` there. Combined with `--period` and
  `--trend` below. The Bayesian pass uses it too (next entry), without a season or trend.
- **Clumpy counts with a season or a trend (`--overdispersion nb --period n`, `--trend`, added 2026-10-20).** The negative-binomial cost now
  takes the seasonal factors or the fitted growth as per-point exposures (mean `lam e[t]`; `lam` per segment from the Poisson estimate
  and two Newton steps, so the cost is O(segment length) rather than O(1)); `r` is estimated on the counts divided by the exposure.
  210 weekly counts (factors 1.6 to 0.5), rate 10, lognormal clumping sd 0.35, seeds 1800..1839, false changes per series on a flat
  series: Poisson 3.92, quasi-Poisson 0.42, NB 0.05; with a 1.8x step at 105 found within 10 points 40/40 each, at 7.90, 1.70 and
  1.25 changes per series. With `--trend` on a log-linear ramp (0.4% a point): flat 10.03, 1.90, 0.78; the step is found 40/40 by Poisson,
  21/40 by quasi-Poisson and 34/40 by NB (so NB keeps most of the power the tempered penalty loses, at 1.93 changes per series).
- **Negative binomial in the Bayesian pass (`--overdispersion nb`, added 2026-10-20).** Tempering the Poisson likelihood by the
  dispersion (`--overdispersion` as a number or estimate) silences clumpy counts but loses most of the power. With `nb` the
  Bayesian pass now uses a conjugate Beta-negative-binomial run model (fixed size `r` estimated as for PELT, p ~ Beta(2, b) with the
  prior mean set to the series mean; log evidence checked against the closed form in `engine.test.mjs`). 120 clumpy counts (rate 10,
  lognormal clumping sd 0.35, seeds 2000..2039, lag 5, threshold 0.5), a step at 60 found within 8 points / false flags per
  flat series: plain Poisson 18/40 at 1.8x, 32/40 at 2.5x, 36/40 at 3.5x with 0.40 false flags; quasi-Poisson 4, 9 and 16 of 40
  with 0; NB 4, 24 and 38 of 40 with 0.05. So NB keeps Poisson's power from about 3x up and is the clean choice there, but a
  1.8x step in counts this clumpy is not found by any of them within 5 points of delay (more lag helps only slightly). With `--period` or
  `--trend` see the next entry.
- **Negative binomial with exposures in the Bayesian pass (added 2026-10-20).** With a season or trend the NB success
  probability depends on the exposure, so the rate has no conjugate prior. Each run now keeps its posterior over the rate on a
  240-point log grid (a factor of 10 either side of the series' mean rate per unit exposure, Gamma(1) prior renormalised on the
  grid), and the predictive is the exact grid sum; with a huge `r` and unit exposures its log evidence equals the Gamma-Poisson
  closed form up to the prior mass the grid cuts off (checked in `engine.test.mjs`). Costs about 0.15 s for 210 points. 210 weekly
  counts (factors 1.6 to 0.5, rate 10, lognormal clumping sd 0.35, seeds 1800..1839, lag 5, threshold 0.5), a step at 105 found within
  8 points / false flags per flat series: plain Poisson 26, 33 and 36 of 40 (1.8x, 2.5x, 3.5x) with 1.38 false flags; quasi-Poisson
  7, 10 and 19 of 40 with 0.40; NB 12, 24 and 38 of 40 with 0.05. Same picture as without a season: NB is the clean choice from about
  3x up, and a 1.8x step in counts this clumpy is not found reliably by any of them. Rates outside the grid are clipped to its ends.
  The trend is measured in the next entry.
- **Negative binomial with a trend in the Bayesian pass (measured 2026-10-21).** 210 clumpy counts on a log-linear ramp (rate 10 at
  the start, 0.4% a point, lognormal clumping sd 0.35, seeds 1800..1839, `--trend`, lag 5, threshold 0.5; `data/measure_nb_trend.mjs`
  reruns it), a step at 105 found within 8 points / false flags per flat series: plain Poisson 28, 29 and 24 of 40 (1.8x, 2.5x, 3.5x)
  with 2.45 false flags; quasi-Poisson 7, 15 and 24 of 40 with 0.17; NB 14, 28 and 36 of 40 with 0.03. As with a season, NB is the
  clean choice from about 2.5x up (Poisson's 1.8x hits come with 2.45 false flags per series), and a 1.8x step in counts this clumpy
  is found on fewer than half the series by any of them.
- **Drifting seasonality (`--period n --drift`).** The fixed profile is wrong when the
  cycle's amplitude grows or its peak moves. With `--drift` each phase is smoothed across
  cycles by a running median (5 cycles, 3 on short series), re-centred per cycle. On 144
  points with the amplitude growing from 4 to 12 and a shift of 5 at point 84 (seeds 401..440):
  the fixed profile gave 12.9 changes per series and never exactly one; `--drift` gave 2.9
  per series, found the shift within 3 points in 40 of 40 and exactly one change in 15 of 40.
  The extra changes are still real noise in the estimated profile; it is better, not clean.
  From 10 cycles up each phase follows a Theil-Sen line through its 9 nearest cycles instead of a
  running median, which does not lag a growing cycle at the ends: on the same seeds 1.95 changes per
  series (from 2.95), shift found 40 of 40, exactly one change 24 of 40 (from 15), false changes on
  14 of 40 no-shift series (from 27). On a steady cycle (amplitude 10) it costs a little: exactly one
  24 of 40 against 27, false 14 against 12.
- **`--period --drift --ar1` together.** On the same growing cycle (144 points, amplitude 4 to 12, shift 5 at
  point 84, seeds 401..440) with AR(1) noise of rho 0.5: `--period 12 --drift` alone gave 9.5 changes per
  series and a false change on 40 of 40 no-shift series; adding `--ar1` gave 1.30 changes per series,
  the shift found in 39 of 40, exactly one change in 33 of 40, false changes on 9 of 40. With independent
  noise `--ar1` still helps (exactly one 24 to 36 of 40, false 14 to 5), because the drift profile leaves
  correlated residue. `--ar1 joint` is about the same (exactly one 30 of 40, false 15 at rho 0.5).
- **A trend under the steps (`--trend`).** A slow ramp reads as many small steps. `--trend` fits one
  line under the steps: start from the median first difference (a step touches one difference), segment
  with PELT, re-estimate the slope as the pooled within-segment least-squares slope (segments of 8 or more
  points), repeat. The segmentation inside that loop uses three times the penalty, because with the normal
  penalty a slightly wrong slope makes PELT cut the residual ramp and the cuts then confirm the slope (seed 3
  below stuck at 0.111 for a true 0.1); the final segmentation uses the normal penalty. On 200 points, slope 0.1,
  shift 5 at point 100, seeds 501..540: 10.1 changes per series without, 1.13 with; mean slope 0.1003; shift found
  40 of 40, exactly one change 37 of 40, a false change on 3 of 40 series with no shift (9.75 changes per
  series without). Combined with `--period 12` (144 points, slope 0.08, amplitude 8, shift 5 at 84, seeds
  601..640): 6.6 changes per series with `--period` alone, 1.25 with `--trend`, found 40 of 40, exactly one 36
  of 40. One common slope only; a slope that itself changes is still read as steps. Not offered for counts.
- **A slope that changes once (`--trend bend`).** `--trend` alone reads a ramp whose slope doubles as steps. `--trend bend`
  tries every knot between 20% and 80% of the series (about 40 candidates), fits a second slope after it
  (continuous at the knot), and keeps the bend only if BIC (n ln(rss/n), ln n per step and per slope parameter) falls.
  On 200 points, slope 0.1 doubling to 0.2 at point 100, seeds 801..840: 4.58 changes per series with `--trend`,
  0.48 with `--trend bend`; mean knot 100.5, mean second slope 0.195; with a step of 5 added at 150 it was found
  in 40 of 40; on 40 straight ramps with no bend, a bend was kept in 0 of 40. One bend only; CLI, API
  (`trend: 'bend'`) and the web page ("Trend under the steps"). Output: `trend.slopeAfter`, `trend.slopeChangesAt`.
- **A slope that changes more than once (`--trend bends`).** Greedy: after the best single knot, try a second (and a
  third) at least 15% of the series away from the others, and keep each only while BIC falls; the slopes are
  re-estimated jointly with the steps at every candidate. On 240 points, slope 0.1, rising to 0.2 at point 80 and
  falling to -0.05 at point 160, seeds 901..940: 9.55 changes per series with `--trend`, 4.03 with `--trend bend`,
  1.05 with `--trend bends`; two knots found in 40 of 40 (mean 81.6 and 161.7 for a true 80 and 160); on 40 straight
  ramps a bend was kept in 0 of 40. At most three bends, knots only between 20% and 80% of the series. Output:
  `trend.slopeChangesAtAll` and `trend.slopes` when there is more than one. About 0.5 s per 240-point series.
  With sticky noise (AR(1) rho 0.5, same ramp, seeds 1001..1040) `--trend bends` alone gave 9.25 changes per series
  (the wandering is cut into steps); `--ar1` brings it to 2.0, and `--ar1 --period 12` with a sine of amplitude 4
  added to 2.25. Both knots were found in only 23 of 40 series there (against 40 of 40 with white noise): under
  sticky noise the BIC for a second bend is often not beaten, so a flat stretch can be read as one slope.
- **An AR(1)-aware BIC for the knot search (`--trend bends --ar1`).** The BIC counted every point as independent evidence, so
  sticky noise made a wandering stretch look like a slope change. With `--ar1` the fit gain is now divided by the variance
  inflation of the mean (long-run over marginal variance, rho from the residuals). Same generator, seeds 1001..1040: on a
  straight ramp with rho 0.5 noise a bend was kept in 11 of 40 before and 0 of 40 after; on the two-bend ramp, 1.98 changes per series before
  and 0.55 after. Both knots are still found in 23 of 40 there (unchanged), so that number is not solved.
- **Knots refined to the point (`--trend bends`).** The knot search steps over a grid of n/40 points (7 on 288 points), so a
  knot could sit up to 3 points off, and the small kink left behind was read as a step. After the greedy search each knot now
  slides one point at a time within a grid step and moves if BIC falls. Same generator before and after, 240 points,
  slope 0.1, 0.2 from point 80, -0.05 from point 160, seeds 901..940: 1.00 changes per series, now 0.42; two knots
  38 of 40 both times (mean knots 78.5 and 160.3 before, 78.6 and 158.6 after); a bend kept on 0 of 40 straight ramps both times.
  On a milder 288-point series (slope 0.05, 0.15 from point 96, -0.03 from point 192, noise sd 1, seeds 1001..1020, and 1101..1120 for the no-step series) with a
  period-12 cycle of amplitude 6 removed by `--period 12` and a step of 5 at point 250, independent noise: exactly one change near the step
  1 of 20 before and 7 of 20 after, found 20 of 20, and on the same series without the step a false change on 14 of 20 before and 8 of 20
  after (`--ar1` added: 13 of 20 and 7 of 20). **Still not solved:** with AR(1) noise of rho 0.5 the same series gave a false change on
  18 to 20 of 20 and no run with exactly one change, with or without `--ar1`, so bends, seasonality and sticky noise together are
  not reliable yet. The first knot of a mild bend (slope change 0.1 against noise 1) is often 5 or more points off, and the cause is still being
  worked out.
- **Scoring every pair of knots (`--trend bends --joint-knots`).** The greedy search keeps the single best knot first, and on a two-bend
  ramp that knot can land between the two true ones, after which the second bend no longer pays for itself under sticky noise.
  `--joint-knots` also fits every pair of grid knots (at least 15% apart, 20 to 80% of the series) and keeps the cheapest by the same
  BIC, then refines as before. 240 points, slope 0.1, 0.2 from point 80, -0.05 from point 160, seeds 1001..1040, `--ar1`:
  with AR(1) rho 0.5, two knots found 20 of 40 greedy, 36 of 40 joint, both within 8 points of the truth 17 of 40 and 28 of 40,
  and a bend invented on 1 of 40 straight ramps both ways. With white noise, two knots 39 and 40 of 40 but both within 8 points
  30 and 24 of 40 at first: the pair search was worse at placing the knots on clean data, because the coarse pair (grid step 6) was
  compared with the already-refined greedy fit. The best pair is now refined to the point too before the two are compared. Re-measured
  with this repository's test generator (seeds 1001..1040, a different noise stream from the figures above, so only compare within this
  sentence): white noise, both knots within 8 points 27 of 40 before the change, 33 of 40 after, against 33 of 40 for the greedy search;
  sticky noise 30 of 38 before and 31 of 38 after (two knots found 38 of 40 joint, 25 of 40 greedy). Use `--joint-knots` when a bend is being
  missed; on clean data it now places knots as well as the default. Cost: about 2 s per 240-point
  series against 0.4 s. An exhaustive pair search on the grid is the exact optimum for two knots (the continuous-slope constraint
  couples neighbouring knots, so a plain segment DP does not apply); a third knot comes only from the greedy search (a winning pair is not extended). The web page has the switch ("Score every pair of slope changes"). **Least-squares pair added.** An exhaustive unpenalised least-squares line with two knots, searched at every point, puts both knots within 8 points on 40 of 40 of the 240-point white-noise series (30 of 40 within 3), because the BIC lets its steps soak up a kink and goes flat near the knots. `--joint-knots` now offers that pair (`lsKnots`) as one more candidate to the same BIC, refined like the rest. Against the version just before it (seeds 1001..1040 from a standalone script, `--ar1` on the sticky ones): white noise both knots within 8 points 32 to **35** of 40 (within 3: 19 to 23), two knots found 40 of 40 both; AR(1) rho 0.5 within 8 points 30 to **33**, two knots found 38 of 40 both (within 3: 12 to 9, noise). False bends on straight ramps 0 of 40 (white), 1 of 40 (rho 0.5). Time about 1.7 s per series against 1.2 s. Caveat: the least-squares search ignores steps, so a large level shift can pull a knot; it is only a candidate and the BIC judges it. Next: a 10 to 90% knot range, and the least-squares pair computed after the steps are removed. **Speed (2026-10-21).** The least-squares pair search now builds each 4x4 normal system from prefix sums instead of a pass over the series, picking the same knots as the brute force (tested on five seeded series). On a seeded 1,200-point noisy ramp with two bends, `trendAdjust` with `--joint-knots` fell from 85 s to 31 s; at 240 points from 2.3 s to 1.5 s. The remaining time is PELT inside the grid-pair BIC fits (27 of the 31 s), the next place to cut.
- **Knot range (`--knot-margin`, `knotMargin`).** Knots were searched only between 20% and 80% of the series, so a slope change near either end was invisible and read as steps. `--knot-margin 0.1` searches 10 to 90% (accepted 0.05 to 0.4; default now 0.1, see below). 200 points, `--trend bend`, noise sd 1, seeds 1201..1240, with a throwaway generator (not the test file's): slope 0.05 then 0.35 from point 24 (12%): a bend kept on 13 of 40 and a knot within 6 points on 0 of 40 at the default, kept on 35 and within 6 on 34 at 0.1; changes per series 2.05 -> 0.33. Mirror case (slope 0.3 then 0 from point 176): within 6 points 0 -> 36 of 40, changes 1.88 -> 0.25. On 40 straight ramps (seeds 1301..1340, `--trend bends`) a bend was kept 0 of 40 at both margins. Measured with the same early bend (seeds 1201..1240; 12 for `--joint-knots`, which is slower), knot within 6 points of 24, default margin 0.2 -> 0.1: white noise with `--ar1`, 0 -> 36 of 40 (changes per series 1.88 -> 0.28); sticky noise (AR(1) rho 0.5) with `--ar1`, 0 -> 25 of 40 (1.10 -> 0.35); sticky noise plus a period-12 cycle with `--ar1 --period 12`, 0 -> 31 of 40 (1.13 -> 0.23); `--joint-knots` on white noise, 0 -> 11 of 12 (1.92 -> 0.17), with `--ar1` on sticky noise, 0 -> 9 of 12 (1.08 -> 0.25). False bends on straight ramps with `--trend bends`: 0 of 40 at both margins for `--ar1`, 1 -> 2 of 40 with `--period 12 --ar1` (noise-level), 0 of 12 for both joint cases. The web page has a "Where slope changes may sit" menu for it. Late knots with sticky noise (slope 0.3 then 0 from point 176 of 200, AR(1) rho 0.5, `--trend bend --ar1`, seeds 1401..1440): knot within 6 points 0 -> 35 of 40 (changes per series 1.02 -> 0.10); with `--period 12` as well, 0 -> 35 of 40 (1.27 -> 0.25). Two knots (point 24 up, 140 down) with `--trend bends --ar1`: both within 6 points 0 -> 34 of 40 greedy, 37 of 40 with `--joint-knots`. Straight ramps with sticky noise and a period-12 cycle (`--trend bends --ar1 --period 12`): no bend kept at either margin, 40 of 40 seeds. **So the default is now 0.1** (2026-10-20); pass `--knot-margin 0.2` or pick "Middle 60%" on the page for the old range.
- **`--trend` with `--ar1`.** Sticky noise wanders, and the slope loop inside `--trend` cut that wandering into
  steps whose segments then bent the slope. With `--ar1` the loop now widens its noise scale by the same
  long-run factor. On 200 points, slope 0.1, AR(1) rho 0.5, shift 5 at point 100 (seeds 701..740): PELT gave
  8.68 changes per series with `--trend` alone and 1.38 with `--trend --ar1`; false changes on the 40 no-shift
  series fell from 39 to 3 (PELT) and 30 to 0 (Bayesian pass); the shift was found in 36 of 40, and the Bayesian
  pass reported exactly one change near it in 34 of 40. Before the loop was made AR(1)-aware, `--trend --ar1`
  still gave a false PELT change on 28 of 40 series. `--ar1 joint` is close (Bayesian exactly one 35 of 40, false 1).
- **Choosing the drift window from the data: tried, not kept.** Picking the half-width (1 to 6 cycles) by
  leave-one-out prediction error, with and without a 10% margin over the fixed default, was worse than
  the fixed rule in all five series shapes tried (growing, steady, fast-growing, 72-point and a
  wandering peak). On the wandering peak (288 points, phase moving 0.2 rad per cycle) it chose 1 cycle
  and gave 32 changes per series against 3.3. The held-out error rewards narrow windows that follow noise,
  so it is not a proxy for clean detection. The fixed rule stays.

- **Trending series (`--model trend`).** The level model reads a steady climb as a staircase. The `trend`
  model fits one straight line per segment (cost: residual sum of squares about the segment's least-squares
  line, from prefix sums; BIC charges 3 log n per change for location, level and slope; minimum segment 4),
  so it finds both jumps and changes of slope. Exact: PELT equals optimal partitioning and the cost equals a
  direct regression (tested). Seeded synthetic series, 120 points, noise sd 1, seeds 1..40, level model
  against trend model: a pure ramp of slope 0.1 with no change gave 5.5 against 0.15 changes per series;
  a slope break at point 60 (0.1 to 0.4) gave 10.4 against 1.1, with the break found within 5 points in
  30 of 40 and exactly one change near it in 27 of 40; a ramp with a jump of 5 at point 60 gave exactly one
  change near it in 38 of 40. The Bayesian pass stays a level-change detector: it runs on the series minus a
  line whose slope is the median first difference (a level shift touches one difference, so it does not
  bend the slope), so it does not flag pure slope changes, which only PELT reports. Not combined with
  `--ar1` and not offered for counts (a line subtracted from counts is not a count; a Poisson trend is the open item); with `--period` the profile is removed first.

- **Growth-change range scored with the NB cost (2026-10-23).** The 2026-10-22 fix widened a Poisson-scored range by `1 + mean / size`. The range now refits each candidate knot with the negative-binomial cost itself (`eval/growth-change-interval-nb.mjs 100 <seed> 0.35 nb`, seeds 2026, 7, 99, three bump sizes): the planted bend sits inside the range on 145 of 161 found bends (90%) against 142 of 161 (88%) for the ratio widening, with narrower ranges (seed 2026, median width 79, 70 and 61 points against 139, 100 and 61). The weakest cell is still bump 0.04 on seed 7 (10 of 15). Runs a few seconds per series.
- **Growth-change range on clumpy counts widened to 95% (2026-10-26).** The NB-scored range covered the planted bend on 145 of 161 found bends (90%). The NB path now tempers the weights by 1.4 instead of 1.15 (`RANGE_TEMPER_NB`; Poisson keeps 1.15). Tuning seeds 2026, 7, 99 (`eval/growth-change-interval-nb.mjs 100 <seed> 0.35 nb`): 1.15 covered 145/161, 1.4 153/161 (95%), 1.7 157/161 (97.5%, wider ranges). Held-out seeds 3, 11, 500, run once at 1.4: 161 of 170 found bends (94.7%); the weakest cell is still bump 0.04 (38 of 44, 86%). Output in `eval/growth-change-interval-nb-temper.out.txt`. Ranges are about 15% wider than before. Two further fresh seeds (41, 77; never used for tuning, 2026-10-26) covered 101 of 107 found bends (94.4%), so the 95% holds on 277 found bends across five untuned-or-held-out seeds taken together; the bump 0.04 cell stays low (18 of 21, 86%, small counts), so treat ranges on steep bends as slightly optimistic. Open: a real series with a documented slope break.
- **The steep-bend range is under-covered (2026-10-27, `eval/growth-change-interval-nb-steep.out.txt`).** Four more fresh seeds (5, 13, 29, 61; same script, temper 1.4, nothing tuned) covered 198 of 215 found bends (92.1%): bump 0.015 83/84 (99%), 0.025 68/73 (93%), 0.04 47/58 (81%). With the earlier 21 steep bends that is 65 of 79 (82%) for bump 0.04, so the 95% label is optimistic there; the steep cell has the narrowest median ranges (43 to 52 points against 90 or more). Not retuned: raising the temper for steep bends would be fitting this one synthetic design. Synthetic only; a real series with a documented steep slope break is still wanted. From 2026-10-27 the NB growth range carries this caveat itself: the CLI prints a note under it and the JSON has `trend.growthChangeRangeNote` (not set for Poisson).
- **A real count series with a documented break: the UK seat-belt law (2026-10-26).** Monthly car drivers killed or seriously injured in Great Britain, 1969-1984 (`data/uk-driver-deaths.csv`, 192 months); the front-seat belt law took effect on 31 January 1983 (Harvey and Durbin 1986). `node eval/seatbelt-law.mjs` (output in `eval/seatbelt-law.out.txt`, test `seatbelt-law.test.mjs`). `--model poisson --period 12 --overdispersion nb` returns 8 changes, one of them 1983-01 (1600 to 1329 a month) with `range95` 1983-01 to 1983-02, which holds the first full month under the law; the other changes include the winter-1973 dip (1973-11, range 1973-10 to 1973-11, fuel rationing and the new speed limits that winter) and the 1974 rebound. Adding `--trend bends` gives the same date and range. Two things the series shows: plain `--model poisson --period 12` treats the clumpy counts as exact Poisson and returns 33 changes, so use `--overdispersion nb` on counts like these; and `--model mean --period 12` finds 1983-01 (range 1982-12 to 1983-02) but also a 2-month dip in 1981-12 and 1982-02 that the count model does not report. One series, one documented break, 0 of 1 misses: this shows the range is not absurd on real data, not that it is calibrated (the calibration is the seeded sets above). The date is one month before the law's first full month, as the January 1983 count is already low.
- **A real daily count series with a documented shock: Puerto Rico deaths and Hurricane Maria (2026-10-29).** All-cause deaths per day, 1,201 days from 2015-01-01 (`data/puerto-rico-daily-deaths.csv`, R's `dslabs::pr_death_counts`). Maria made landfall on 2017-09-20; the count was 106 that day against a 60-day mean of 78.5. `node eval/maria-deaths.mjs` (output `eval/maria-deaths.out.txt`, test `maria-deaths.test.mjs`). All five setups (`mean` and `poisson --overdispersion nb`, with no season, weekly 7 or yearly 365) put a change within a day of landfall, 78.8 to 82.1 per day before and 101.7 to 119.8 after, and the `range95` holds 2017-09-20 in all five (a single day in three of them). The cost is the same as for Ansett: 9 to 11 other changes, mostly the winter peak and the rebound (a drop to about 90 on 2017-10-08 or 10-29), which a three-year series cannot pin as a yearly cycle (a yearly period gave 10, not fewer). The detector reports the rebound as a second change rather than a burst. Two real events now hold, one closure and one shock.
- **A real series quiet outside its one event: US airline passenger miles, 1937-1960 (2026-10-29).** 24 annual values, in logs (`data/airmiles.csv`, R's `datasets::airmiles`). `--model trend` reports exactly one change, 1946 (the first peacetime year; `range95` 1945 to 1948), where the slope falls from 0.250 to 0.136 per year and the level jumps by 0.276 (about 30%). A level-only model reads the same smooth growth as 7 steps, so on a trending series use `trend`. The series is strongly autocorrelated (rho about 0.95, the tool says so and the range is then too narrow); one event and 24 points make this a sanity check, not a coverage test. `node eval/airmiles.mjs` (output `eval/airmiles.out.txt`, test `airmiles.test.mjs`). Still wanted: a closure series quiet outside it.
- **All 30 Ansett route and class series: no quiet closure series exists, and the count model's range holds the stop in 29 (2026-10-29).** Last entry asked for a closure series that is quiet outside the closure. The full `tsibbledata::ansett` table (10 routes x economy, business, first; `data/ansett-all.csv`) is 30 weekly series covering the 1989 pilots' dispute. `node eval/ansett-sweep.mjs` (output `eval/ansett-sweep.out.txt`, test `ansett-sweep.test.mjs`) runs `mean` and `poisson --overdispersion nb` (no season) on each and scores whether a `range95` holds the first week below 25% of the prior median (1989 W34 in 29 of 30; SYD-BNE First closes in W33). The count model's range holds it in 29 of 30 series, the mean model's in 19 of 30 (it misses most MEL-SYD, SYD-* economy and first series, where the mean model's steps sit away from the stop). Quiet outside the closure: none. The fewest other changes is 8 (SYD-OOL Business, count model), the most 36, typically 12 to 30; business series are shortest (about 176 weeks from 1989 W28) and quietest. So the Ansett data cannot score false alarms; it scores the closure range, and the bar for a quiet series still stands. Caveat: the closure week is defined from the data by a threshold, and one series, not thirty, is independent evidence for the pilots' dispute (the same event hit every route).

- **A real weekly series with a documented closure: Ansett's 1989 pilots' dispute (2026-10-29).** Weekly economy-class passengers, Melbourne to Sydney, 283 weeks from 1987-06-29 (`data/ansett-melsyd-economy.csv`, R's `fpp2::melsyd`). The airline's pilots' dispute began on 18 August 1989: the series falls to 7.0 thousand in the week of 1989-08-21, is 0 for the seven weeks to 1989-10-09 and is 11.6 in the week of 1989-10-16 as flights resume. `node eval/ansett-strike.mjs` (output `eval/ansett-strike.out.txt`, test `ansett-strike.test.mjs`). All four setups (`mean` and `poisson --overdispersion nb`, each with and without `--period 52`) put a change within a week of 1989-08-21 and on 1989-10-16, and the stop's and the restart's `range95` holds the true week in all four. The cost is the other changes: the series swings with school holidays and Christmas, so the seasonal mean model returns 24 changes and the count model 43 (28 without the season), of which about 20 are nowhere near the dispute. A period of 52 with five cycles of data does not pin that swing down. One series, one closure: this shows the ranges hold on a clean documented event, not that the other changes are false alarms or that the range is calibrated. The seven zero weeks come back as separate steps, not one burst; `--episodes` was not tried here.
- **The same dispute in first class, which was not quiet either (2026-10-29).** First-class passengers on the same route (`data/ansett-melsyd-first.csv`, `fpp2::melsyd` column `First.Class`, 270 weeks from 1988-03-28; the first 13 weeks are dropped because source week 13 is blank). `node eval/ansett-first.mjs` (output `eval/ansett-first.out.txt`, test `ansett-first.test.mjs`). The hope was a closure series without economy's school-holiday swing, so the other changes would drop. They did not: 29 and 30 changes for `mean` (seasonal 52, none) and 37 and 30 for `poisson --overdispersion nb`, mostly Christmas and Easter dips and the slow 1990-92 slide. The stop's `range95` holds 1989-08-21 or the next week in all four setups. The restart is different: first class opens at 0.05 thousand on 1989-10-16 and climbs for two months, so the two count setups hold the restart (0 to about 50 passengers) and the two mean setups do not (they put the step at 1989-11-06 or 11-13). One more series, and still none that is quiet outside a closure; the open item stays open.

- **Speed: the bend search ranks knots on the Poisson cost (added 2026-10-21).** Profiling a 240-point `--model poisson --trend bend --overdispersion nb` run put 96% of the time in the NB cost, whose continuous-exposure form is O(segment length) and is called O(n^2) times per PELT, for about 35 knots. With 80 or more points under NB the grid and the neighbours of its best knot are now ranked with the Poisson cost (about 25x cheaper), and only the 8 best are refitted with the NB likelihood, which still picks the winner and decides the `3 log n` test. A 240-point series, one bend: 6.4 s to 1.8 s, two bends 12.9 s to 3.4 s, same knot (109) and slope. Cost, said plainly: on `data/measure_nb_bend.mjs` (40 series per row) the no-season row is unchanged (bend kept 18, knot within 15 points 13, 2.30 changes per series; false bends 0/40), but weekly goes from 22 kept / 18 near / 2.15 to 21 / 14 / 2.02 with 8 finalists (3 finalists: 19 / 14 / 1.95 in 1.5 min; 14: 21 / 15 / 2.08 in 3.1 min, no better). So the Poisson ranking misplaces some knots under a season; the whole measurement script runs in 2.4 min instead of about 10. Not done: ranking with a season-aware Poisson cost, which is what the weekly gap suggests.
- **Speed: NB finalists are spread-out grid knots (2026-10-21).** The README entry above blamed the weekly gap on a Poisson ranking that is not season-aware. It is: `poissonTrend` already passes the seasonal factors as exposures to the Poisson cost. What crowded the finalist list was the winner's fine neighbours, which filled most of the 8 NB slots with near-copies of one knot. Finalists are now the 8 best grid knots and the neighbour scan is gone (also cheaper). Same 40 series per row (`data/measure_nb_bend.mjs`), bend kept / knot within 15 points / changes per series: no season 18 / 13 / 2.30 -> 18 / 14 / 2.30; weekly 21 / 14 / 2.02 -> 21 / 16 / 2.05; false bends 0 of 40 in both. A mix of 5 grid and 3 fine finalists was tried and dropped (12 and 15 near, no better). Gains of 1 and 2 series out of 40 are inside noise: the change is kept because it is simpler and no slower, not because it is shown to be better.
- **Tried and dropped: refitting the seasonal factors under the trend (2026-10-21).** The Speed note above ended with "ranking with a season-aware Poisson cost" as not done, but the ranking already runs under the seasonal exposure; what the factors lack is the trend (they are fitted by `poissonSeasonal` with none). Refitting them under the trend found, then the trend under them, was measured on `data/measure_nb_bend.mjs` weekly rows (40 series): Poisson bend kept 18 and knot within 15 points 13, both unchanged (changes per series 4.08 -> 4.00); NB bend kept 21 -> 19, knot within 15 points 14 -> 13, changes per series 2.02 -> 2.30. No gain, so the code was removed. The weekly gap against the no-season row (22 -> 21 kept) is inside the noise of 40 series (about 3 either way), so more finalists or a better ranking is not clearly the cause.
- **Tried and superseded: finalists from separate dips (2026-10-21).** Refitting the best knot of each dip in the Poisson cost curve, instead of the 8 lowest (adjacent) knots, gave weekly kept 21 -> 20, knot within 15 points 14 -> 16 of 40, no-season unchanged, 0 false bends, same time: inside noise. A concurrent change that drops the winner's fine neighbours from the finalist pool addressed the same crowding and landed first, so this was not shipped.
- **Speed: a converged fit skips its last PELT run (added 2026-10-21).** A trend fit that ends on a converged Newton step (under 1e-5) reuses the last pass's PELT cost instead of running PELT once more. Output byte-identical on three seeded 210-point NB bend series; about 15% less time on top of the Poisson ranking (about 1100 -> 900 ms per series before the later warm start).
- **Speed: the negative-binomial cost with a season (per-class prefix sums).** With `--overdispersion nb`
  and exposures, the segment cost used to loop over every point of the segment, twice per Newton step. A season
  has only a few distinct exposures, and the score and likelihood depend on a point only through its exposure
  class, so the cost now keeps prefix sums of count and total per class (up to 64 classes; a continuous trend
  exposure falls back to the point loop). Same costs and same changes, tested against the point loop
  (`negative-binomial cost with a season matches...`). Weekly clumpy counts with one step, size 3, one seeded
  series on this container: 600 points 109 -> 47 ms, 3000 points 2623 -> 172 ms (identical changes and cost).
  Exposures from `--trend` are continuous, so they still loop over the segment, but the loop is leaner
  (2026-10-21): reciprocals computed once per point per Newton step, and the final likelihood written as
  `a log(lam) + sum x log e - sum (x + r) log(lam e + r) + m r log r` with `sum x log e` and the exposure total as
  prefix sums, so it takes one log per point instead of two. Same changes on three seeded 210-point series
  (counts rate about 10, clumpy, log growth flat to 105 then rising; `--model poisson --overdispersion nb --trend bend`):
  3957 -> 2213, 7982 -> 3773 and 2470 -> 1251 ms, about 1.8x. Still seconds, not milliseconds: the bend search runs
  PELT once per knot, and a cost that is O(segment) is the floor without a closed form.
  Warm start (2026-10-21): PELT asks for segments that start at the same point and grow by one, so the cost
  keeps the last fitted rate per start and polishes it with one Newton step instead of two from the Poisson
  estimate. Same changes and knots on 24 seeded clumpy-count fits (trend and trend bend, 150 to 260 points, with and
  without a step; cost differs by at most 2e-5 relative); one seeded 240-point series with
  `--trend bends` under NB, 4.4 -> 1.7 s on this container on the code before PR #9049; on top of #9049's Poisson ranking of knots the same series goes 1.05 -> 0.72 s, a smaller gain because the final fits dominate.

## Limits

Steps by default: a gradual drift is approximated by several steps unless you choose `--model trend` (a line per segment, no curvature). Seasonality is
removed with `--period` (`--drift` follows a changing shape with a running median; no full STL). A changepoint describes the data, not its cause.
Up to 100,000 points; the Bayesian pass is the slow part on long series.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum
extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

An independent implementation from the published papers; not affiliated with or endorsed by their
authors.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`file_opened`, `report_downloaded`) are kept only in local storage, can be switched off on the page,
and honour Do Not Track.

**Best-effort hosting, no SLA.** Free and experimental; may be slow, broken, moved, or taken offline
without notice.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).

## What you use today, and what this does differently

- **R's `changepoint` / Python's `ruptures` packages:** the reference tools, and more complete; they
  need a programming environment. This runs the same class of method in a browser tab, from a CSV.
- **Eyeballing a chart:** fast, but cannot say whether a dip is noise or a shift, or how sure to be.
- **Anomaly alerts in a monitoring product:** flag single odd points, not a lasting change in level.


**Page (2026-10-21).** The web page now has a "Known holidays" box (comma-separated dates or row numbers, counts model) that passes `holidays` to the engine. Checked on 200 seeded daily counts with every 17th day at 0.3x: 6 changes without the list, 0 with it (factor 0.304).

## Holidays of different kinds

`--holidays` entries may be written `label=kind` (`2026-12-25=closed,2026-11-27=sale`). Each kind gets its own fitted factor, reported under `holidays.kinds`; each kind needs at least 2 rows. Checked on 240 seeded daily counts (rate 40) with a 0.3x closed day every 17th row and a 1.8x sale day every 23rd: engine test `a factor per kind recovers two different dips` (closed within 0.1 of 0.3, sale within 0.3 of 1.8). Not measured against real holiday data.

## Holidays held out of the seasonal fit

With `--period`, the holidays are now left out of the seasonal factors (they no longer count toward their phase), so a holiday that always falls on one weekday does not drag that weekday's factor down and bias the holiday factor toward 1. `node eval/holiday-heldout.mjs` runs the check: 40 seeded 224-day series, weekly pattern, a 0.3x holiday every 28th day (always the busiest weekday). Mean fitted holiday factor 0.355 before, 0.311 after (true 0.300); mean absolute error 0.055 -> 0.020; changes per series 0.03 both ways. Synthetic data only; the seasonal PELT pass still sees the holiday dips as unexplained (only the factors skip them).

## Holidays and the seasonal PELT pass

The seasonal PELT pass now sees the fitted holiday exposure: with `--period` and `--holidays`, the engine alternates (seasonal factors with the holidays as an exposure, then the holidays refitted on the new factors) for two extra rounds. `node eval/holiday-alternate.mjs` runs the check on 40 seeded 224-day weekly series (every 28th day a 0.3x holiday on the busiest weekday; half the series carry a 1.5x step at 120): planted step found 20/20 both ways, no extra changes either way, holiday factor error 0.022 -> 0.021, largest seasonal-factor error 0.052 -> 0.045. A small gain on synthetic data, not measured on real holiday series; the previous behaviour is behind the engine option `noHolidayAlternation`.

## A real volatility break: the Great Moderation (2026-10-24)

Every volatility result above is on seeded synthetic series. `eval/great-moderation.mjs`
(output in `eval/great-moderation.out.txt`, test in `great-moderation.test.mjs`) runs
`--model meanvar` on 202 quarters of US real GDP growth, 1959Q2 to 2009Q3
(`data/us-gdp-growth.csv`, public domain, source in `data/SOURCE.md`). The documented
break is the fall in the volatility of growth at 1984Q1 (McConnell and Perez-Quiros 2000);
the sample standard deviation is 4.34 before it and 2.04 from it to 2007Q4.

| setting | changes | the one near 1984 | range95 holds 1984Q1? |
|---|---|---|---|
| `--min-segment 5` (the default until 2026-11-09) | 3 | 1983Q2 (sd 4.32 to 0.75) and 1984Q3 (0.75 to 1.97) | no: 1984Q3 "that point only" |
| `--min-segment 12` | 2 | 1984Q3 (sd 4.33 to 2.00) | yes, 1984Q1 to 1985Q4 |
| `--min-segment 20` | 2 | 1984Q3 (sd 4.33 to 2.02) | yes, 1983Q3 to 1985Q4 |

So the break is found, dated one to two quarters late, but the default setting finds it
the wrong way: a five-quarter calm patch in 1983Q2 to 1984Q2 (sd 0.75) beats one clean
drop, and the reported range around the second change is a single quarter that excludes the
documented date. Quarterly macro data has too few points per regime for a 5-point minimum
segment on a variance model, since a short run of similar numbers has a tiny variance and
looks like its own regime. With a minimum segment of 12 to 20 the range is honest. One
series, one documented break; the default is not changed on this evidence. Since 2026-11-03 a `meanvar` run with any segment under 10 points returns a `rangeWarning` naming it (the CLI prints it), and the default GDP run shows it; `--min-segment 12` does not. `--model mean` on
the same series reports 12 level changes (recessions read as mean shifts), and `--ar1`
refuses `meanvar`. A slope break (log real GDP with `--trend bend`) was tried too: the engine
reports 30 steps under the default and, with `--ar1`, none; a plain least-squares hinge puts the best knot at
1967Q3 (4.8% a year to 3.0%) with residual autocorrelation 0.96, which is the
unit-root problem Perron (1989) and Nelson and Plosser (1982) argued over, so no slope
claim is made from it.

## Holidays on a real daily series

Everything above about holidays is on seeded synthetic counts. As a first
reading on real data, `eval/holiday-real.mjs` runs `--model poisson --period 7
--overdispersion nb` on 731 daily English Wikipedia pageview counts of the
article "Payroll" (2023-2024, `data/payroll-views.csv`, source in
`data/SOURCE.md`), with the 18 US federal holidays that fall on a weekday
listed.

| | changes | holiday factor |
|---|---|---|
| no holidays | 47 | |
| 18 holidays | 45 | 0.957 |

This is a negative result for the feature on this series. Holiday views are
only 8% under a normal weekday (median 366 against 397), so there is little dip
for the factor to absorb, and the 45 changes that remain are bursts (single
days at 2 to 6 times the usual level, likely automated traffic that the "user"
agent filter lets through), not holidays. What this series needs is an outlier
or burst rule, not a holiday list. One series only; a second article was
refused by the Wikimedia API's rate limit (429) and not retried. A series with
a real holiday closure (a shop's or office's daily counts) is still the test
that would show the factor earning its place.

## Burst or two steps? (`excursions`, counts)

With `--model poisson`, the result lists an `excursions` entry (and one sentence in `summary`) when two neighbouring changes enclose a short stretch (at most a quarter of the series) whose rate sits above or below both sides, and the rate before and after it is statistically one rate (Poisson likelihood ratio under 3.84, 1 df). That reads as a temporary burst or dip on a steady baseline, not two level changes. The changes themselves are not altered. Function: `findExcursions`.

Checked: a planted 10-point burst at 4x on a flat series is flagged; a plain step is not (`great-discoveries.test.mjs`). On the real great-discoveries series it is **not** flagged: the rate before 1884 (2.5 a year) and after 1888 (3.68) differ with a likelihood ratio of 6.9, so the honest reading there is a burst plus a persistent rise, which is what the three PELT changes say. The threshold was not moved to make that series pass. Synthetic power and false-flag rates (`eval/excursions.mjs`, plain Poisson counts, level 5, 100 points, 100 seeded series per row, 2026-10-28; output in `eval/excursions.out.txt`):

| series | series with a change | excursion flagged |
|---|---|---|
| no change | 7 | 3 |
| 5-point burst 2x | 61 | 55 |
| 5-point burst 3x | 100 | 97 |
| 10-point burst 2x | 96 | 86 |
| 10-point burst 3x | 100 | 91 |
| 10-point dip 0.3x | 97 | 84 |
| lasting step 2x | 100 | 1 |
| 3x burst for 5 points, then a 1.5x rise for good | 100 | 4 |

When PELT cuts a true burst the note names it in 84 to 97% of series (the 2x, 5-point burst is cut in only 61% at all). A lasting step is wrongly called a burst in 1 of 100, and a burst riding a persistent rise is correctly left alone in 96 of 100. On a series with no change, the 3 flags are among the 7 false alarms PELT itself raised. Synthetic only, no overdispersion; no second real series.

## Bursts

`--bursts [ratio]` (counts only) cuts isolated spikes back before fitting. A
point is a burst when it is at least `ratio` times (default 2.5) the larger of
the medians of its same-phase neighbours before and after it (3 each side with
`--period`, 5 adjacent points without) and clears a Poisson-sized excess. A
step is high against one side only, so it is never flagged. Flagged days are
listed in the result as `bursts`; the raw counts stay in `values`.

`eval/bursts.mjs`, 40 seeded series per row (negative-binomial counts, weekly
season, 200 points, bursts of 2.5 to 6 times the level), `--model poisson
--period 7 --overdispersion nb`:

| series | changes per series, off -> on | step at 100 found | bursts found | other days flagged |
|---|---|---|---|---|
| no step, 4 bursts | 3.85 -> 0.23 | | 119/160 | 1.13 per series |
| 1.8x step, 4 bursts | 4.28 -> 1.30 | 35 -> 36 of 40 | 116/160 | 1.20 per series |
| 1.8x step, no bursts | 1.23 -> 1.15 | 39 -> 39 of 40 | | 1.30 per series |

At ratio 2 the rule finds 134/160 but flags 4.4 ordinary days per series; at 3
it flags 0.4 but finds 90/160. 2.5 is a compromise, not an optimum. On the real
"Payroll" pageviews the default cuts 1 day and takes 47 changes to 43; at 3x
none are cut. The bursts there are mostly runs and wide, so this rule is a
partial answer on that series (2023-24, one series). Synthetic bursts are
planted with the rule's own shape in mind, so the recall figures flatter it.

### Burst episodes (`--episodes [n]`)

For counts (`--model poisson`). Plain Poisson reads a burst as two steps, one up and one back down. `--episodes` looks at the fitted changes and labels an up-step followed within `n` points (default a tenth of the series, at least 5) by a down-step as one **episode** when the level after it is within half of the episode's own jump on a log scale of the level before. It also covers a dip. The changes, ranges and penalty are not touched: the result gains an `episodes` list, and the CLI prints it.

Real series, great discoveries (1860-1959): the three plain-Poisson changes stay, and `--episodes` lists one burst, **1884 to 1888**, 8.2 a year against 2.5 before and 3.68 after (3.28x episode, 1.47x net). Test: `great-discoveries.test.mjs`.

`eval/episodes.mjs` (output `eval/episodes.out.txt`; negative-binomial counts, size 8, level 5, 100 points, 40 seeded series per row):

| series | series with a change | labelled an episode |
|---|---|---|
| no change | 5 of 40 | 5 of 40 |
| 5-point burst 3x | 32 of 40 | 31 of 40 |
| 8-point burst 2.5x | 37 of 40 | 30 of 40 |
| lasting 2x step | 40 of 40 | 5 of 40 |
| burst 3x for 5 points, then 1.8x for good | 40 of 40 | 14 of 40 |

Read plainly: a true burst the model cut is labelled about 80 to 97% of the time, a lasting step almost never. The last row is the limit of the rule: a spike that settles at 1.8x scores 0.53 against the 0.5 cut, so it is labelled a burst in 14 of 40 series. It is a label for the reader, not a test: it cannot tell a burst from a short-lived change of regime, and when no change is found (`--bootstrap` on great discoveries) there is nothing to label. Synthetic apart from the one real series; the 0.5 and the length limit are not tuned.

### Short runs (`--burst-runs n`)

A plateau of 2 to `n` days is not a single-day burst: each of its days may be
under 2.5x the level. `--bursts --burst-runs 5` also cuts a block of 2 to 5
consecutive days when each day is high against the same-phase points outside
it on both sides, the block averages at least 2x that level, and its summed
excess clears a Poisson-sized bar. Off by default; engine and CLI only.

`eval/burst-runs.mjs` (40 seeded series per row, runs of 2 to 5 days at 1.8 to
3x, same generator as above), `--burst-runs 5` against `--bursts` alone:

| series | changes per series | step at 100 found | run days cut | other days flagged |
|---|---|---|---|---|
| no step, 4 runs | 1.27 -> 0.55 | | 192 -> 249 of 567 | 1.00 -> 1.57 per series |
| 1.8x step, 4 runs | 2.15 -> 1.80 | 35 -> 36 of 40 | 182 -> 229 of 526 | 1.05 -> 1.52 per series |
| 1.8x step, no runs | 1.18 -> 1.15 | 40 -> 40 of 40 | | 1.38 -> 1.63 per series |
| no step, no runs | 0.07 -> 0.07 | | | 1.43 -> 1.57 per series |

A gain, but a small one: under a quarter of planted run days are caught. At a
1.6x bar it caught 344 of 567 but flagged 4.8 ordinary days per series and
lifted false changes on clean series from 0.07 to 0.23, so 2x is the default;
at 2.4x it does nothing. On the real Payroll pageviews 2x cuts nothing (47
changes stay 47); at 1.6x it cut two 3-day runs and took 47 to 41. That
series' short rises are mostly 1.3 to 1.8x, below any bar that is safe on
clean data, so they are probably not separable from level changes by size
alone.

On the web page the same rule is the checkbox "Cut back isolated spikes before fitting" (counts model). It lists the days it cut back under the summary. Clicked through in headless Chromium on a hand-made 60-day series with one spike: two false changes without it, none with it (2026-10-22).

## A range on each change date (2026-10-22)

Every PELT change now carries `range95`: with the neighbouring changes held fixed, each possible start of the later segment is weighted by `exp(-(cost - min cost) / 2)` (the cost is -2 log-likelihood, so this is the profile likelihood), and the most likely starts holding 95% of the weight are returned as the first and last. The CLI prints it ("Likely range for each change"); `intervals: false` turns it off. It is not offered for `--ar1 joint`, which has its own likelihood. On the Nile series the 1899 change comes back as 1897 to 1899.

Measured with `node eval/change-interval.mjs` (200 seeded white-noise series of 200 points, one planted shift at a random date from 60 to 139, a change counted only if PELT put one within 15 points):

| shift (noise sd) | found | range holds planted date | median width (points) |
|---|---|---|---|
| 1 | 197/200 | 193/197 (98%) | 16 |
| 1.5 | 200/200 | 189/200 (95%) | 7 |
| 2 | 200/200 | 189/200 (95%) | 4 |
| 3 | 200/200 | 191/200 (96%) | 2 |

Coverage is about the nominal 95% on independent Gaussian noise; the shift-1 row is conservative. Sticky noise (2026-10-22, `node eval/change-interval-sticky.mjs`, output in `eval/change-interval-sticky.out.txt`; marginal sd 1, one shift of 2 or 3 sd, 200 series each): without `--ar1` the range is far too narrow, holding the planted date in 57% to 60% of series at rho 0.5 and 30% to 31% at rho 0.7 (median width 2 to 3 points). With `--ar1` it holds it in 97% to 99%, conservatively wide (5 to 22 points), though PELT finds the change less often at rho 0.7 (149 to 177 of 200 within 15 points). So the result now carries a `rangeWarning` (CLI: a note above the ranges) when the mean model runs without `--ar1` on a series whose lag-1 autocorrelation estimate is 0.3 or more; it fired on 99 to 100 of 100 series at rho 0.5 and 0.7 and 0 of 100 on white noise.

Counts (2026-10-22, `node eval/change-interval-counts.mjs`, output in `eval/change-interval-counts.out.txt`; 200 series of 200 days each, one rate step, simulated data): on true Poisson counts the range holds the planted date in 97% to 98% of series at 10 to 15, 10 to 20 and 30 to 45 (median width 2 to 7 days). On clumpy counts (negative binomial, size 5) the plain Poisson cost gives ranges that are far too narrow, holding it in 35%, 42% and 6% of series; with `--overdispersion nb` they hold it in 92% to 93%, wider (median 6 to 24 days) and honest. So the result now carries a `rangeWarning` when a Poisson fit without `--overdispersion` sees block dispersion of 2.5 or more. On the same simulation it fired on 165 of 200 clumpy series and 27 of 200 clean Poisson ones (13%, a step spoils the dispersion estimate; the threshold is a trade, 2.0 fired on 22% of clean series).

Seasonal and trend models (2026-10-22, `node eval/change-interval-adjusted.mjs`, output in `eval/change-interval-adjusted.out.txt`; 200 white-noise series of 200 points, one level shift of 2 or 3 sd, simulated data): with `--period 7` under a sine of amplitude 1.5 the range holds the planted date in 95% and 97% of series; with `--trend` (one common slope of 0.02 per point) in 92% (192 found) and 94%; with `--model trend` in 95% and 99%. Median widths are 4 and 2 points, like the plain mean model. The 92% is the nearest to a miss: the shift-2 trend row, where 8 of 200 series gave no change within 15 points and 16 of 192 ranges missed.

Not measured: slope changes and bends under `--model trend`, the seasonal counts model, and any real series (all simulated here).

### A range on a slope change (2026-10-22)

With `--trend bend` or `bends`, each slope change also carries `trend.slopeChangeRange95`. Each knot is slid over its allowed span with the other knots held fixed; every position is weighted by `exp(-(BIC - min BIC) / 2)` (the BIC is -2 log-likelihood with the noise variance profiled out, the same profile-likelihood idea as `range95`), and the most likely positions holding 95% of the weight give the first and last. The CLI prints it ("Likely range for each slope change"). Series over 200 points are scanned on a stride of about n / 200.

Measured with `node eval/slope-change-interval.mjs` (100 seeded white-noise series of 200 points per row, slope 0.1 per point growing by the bump at a random point from 70 to 129; counted only if the fitted knot landed within 20 points):

| bump in slope (per point) | found | range holds planted bend | median width (points) |
|---|---|---|---|
| 0.1 | 96/100 | 93/96 (97%) | 31 |
| 0.2 | 100/100 | 95/100 (95%) | 19 |
| 0.3 | 100/100 | 95/100 (95%) | 14 |

It is a likelihood range under the fitted model, checked on synthetic series only; no real series with a documented slope break has been tried.

### A range on a change of growth rate, for counts (2026-10-22)

`--model poisson --trend bend` (or `bends`) now also returns `trend.growthChangeRange95`, the same idea as the slope-change range: each knot is slid over its allowed span with the other knots held fixed, the growth rates are refitted at every position, each position is weighted by `exp(-(cost - min cost) / 2 / scale)` (the Poisson cost is -2 log-likelihood; `scale` is the overdispersion factor, so a noisier series gets a wider range), and the most likely positions holding 95% of the weight give the first and last. Under `--overdispersion nb` a series of 80 or more points is scored with the Poisson cost, as in the knot search. The scan uses a stride of about n / 80. The CLI prints it ("Likely range for each change of growth rate").

Measured with `node eval/growth-change-interval.mjs` (100 seeded Poisson series of 200 points per row, log rate 2 + 0.004 t plus `bump` per point after a random point from 70 to 129; counted only if the fitted knot landed within 20 points; output in `eval/growth-change-interval.out.txt`):

| bump in log growth (per point) | found | range holds planted bend | median width (points) |
|---|---|---|---|
| 0.015 | 90/100 | 85/90 (94%) | 46 |
| 0.025 | 97/100 | 93/97 (96%) | 34 |
| 0.04 | 81/100 | 77/81 (95%) | 22 |

**Calibrated 2026-10-22.** The first version weighted positions by `exp(-(cost - min cost) / 2 / scale)` and held only about 86% (88, 88, 84%) at a nominal 95%; the knots had no bias, the misses were tails. The weights are now tempered by 1.15 (`RANGE_TEMPER` in `engine.mjs`). Sweep on seed 2026, pooled over the three bumps (268 found series): 1.0 gave 86%, 1.1 gave 91%, 1.2 gave 97%, 1.3 gave 99%, 1.5 gave 100% (median width 64 against 37 at bump 0.015). The table is 1.15. Checked on two other seeds (`node eval/growth-change-interval.mjs 100 7`, `... 99`): 246/257 (96%) and 256/269 (95%), widths 22 to 52. 1.15 was picked from the seed 2026 sweep, so that seed is in-sample; the two other seeds are not. Output in `eval/growth-change-interval.out.txt`. Still open: a count series with a documented growth break. Simulated data only, Poisson counts (not clumpy ones).

**Clumpy counts (2026-10-23).** The range above was only measured on Poisson counts. `node eval/growth-change-interval-nb.mjs [runs] [seed] [sd] [nb|poisson]` draws each count at an independent lognormal rate (sd 0.35) and runs `--overdispersion nb --trend bend` on the same series (200 points, 100 per row, seeds 2026 and 7; counted only if the knot landed within 20 points, which on clumpy counts is 11 to 24 of 100). Before: the range held the planted bend on 77 of 100 found series (79, 53, 100% and 92, 75, 67% for bumps 0.015, 0.025, 0.04), against a nominal 95%. Cause: a series of 80 or more points is ranked with the Poisson cost, which on clumpy counts is too sure of itself. Now the weights are also divided by the negative-binomial variance-to-mean ratio `1 + mean / size`: 89 of 100 on those two seeds (100, 79, 100 and 96, 92, 67%), and 53 of 61 (87%) on seed 99, which the change was not tuned on. Still under 95%, and the ranges are wide (median 61 to 142 points of 200). Not claimed calibrated. Output: `eval/growth-change-interval-nb.out.txt`. Still open: a real series with a documented growth break.

## The `meanvar` default minimum segment is now 10 (2026-11-09)

The GDP series above was one real case. `eval/meanvar-min-segment.mjs` (output in
`eval/meanvar-min-segment.out.txt`, seeded, 100 series per cell) checks the minimum segment on
simulated Gaussian series with a known truth:

- **No change (sd 1 throughout):** false alarms 3% / 2% / 1% at n = 60 / 100 / 200 with a minimum of 5,
  2% / 1% / 1% with 10.
- **One sd break at the midpoint (2 to 1, or 1 to 2):** the share of series with exactly one change
  rises from 62-67% (min 5) to 69-72% (min 10) at n = 60, 85-87% to 90% at n = 100 and 95-96% to 97%
  at n = 200. The median dating error and the range95 hit rate (94-98%) do not move.
- **The price:** an 8-point patch of sd 4 inside sd 1 (n = 100) is found by 77% of runs at a minimum
  of 5, 73% at 10, 30% at 12 and none at 20.

So 10 is better or equal everywhere except a true regime of about 8 points, where it loses four
points of detection, and it fixes the real GDP case (1984Q3, range 1984Q1 to 1985Q4, no warning).
`meanvar` now defaults to `--min-segment 10` (`mean` stays at 2, `trend` at 4); pass `--min-segment 5`
for short regimes. Gaussian noise only: heavy tails and autocorrelated variance are untested.

## `meanvar` on noise that is not Gaussian (2026-11-15)

The minimum-segment check above used Gaussian noise only. `eval/meanvar-robustness.mjs` (output in
`eval/meanvar-robustness.out.txt`, seeded, 200 series per cell, default minimum segment) draws unit-variance
noise of four kinds and looks at a series with **no change** and one with an sd 1 to 2 break:

| noise | false alarms, n = 100 / 200 | one change found on the break, n = 100 / 200 |
|---|---|---|
| Gaussian | 4% / 1% | 92% / 97% |
| t with 3 df (heavy tails) | 39% / 62% | 57% / 55% |
| GARCH(1,1) (clustered volatility, no break) | 42% / 51% | 61% / 57% |
| AR(1), rho 0.5 | 51% / 54% | 44% / 37% |

So on such noise `meanvar` reports a change about half the time when there is none, and range95 holds the
true date on only 70% to 83% of the series where it does find the break. The cost has no cheap fix inside the model.
What shipped is a warning: `meanvarNoiseCheck` in `engine.mjs` standardises the series by its fitted segments and
sets `rangeWarning` for a fourth moment above 4.5, a lag-1 autocorrelation of the residuals from 0.25, or of their
squares from 0.2. Fire rates on the same series (null / break): Gaussian 1% to 2% / 0% to 2%, t3 66% to 80% / 55% to
76%, AR(1) 90% to 100% / 88% to 98%, GARCH only 16% to 20% / 11% to 18%. The thresholds were set on seed-based
quantiles of these same simulations, so the rates are in-sample. Clustered volatility is mostly *not* caught, and
no real heavy-tailed series has been tried. Test: `meanvar-noise.test.mjs`.

## `--dispersion`: a heavier penalty when the squared residuals are over-dispersed (2026-10-26)

`--robust` helps on heavy tails but not on clustered volatility (GARCH leaves 21-29% false alarms). `--model meanvar
--dispersion` (`dispersion: true`) fits once, standardises each segment, takes the long-run variance of the squared
residuals (Bartlett window) over 2 (the Gaussian value) as a factor of at least 1, and refits with the BIC penalty times
that factor, the same idea as `overdispersion` for counts. The factor is returned as `dispersion`. Not for use with
`--robust`. `eval/meanvar-dispersion.mjs` (output `eval/meanvar-dispersion.out.txt`, seeded, 200 series per cell, same
generators as `meanvar-robustness.mjs`): false alarms on a null series / exactly one change on an sd 1 to 2 break.

| noise, n = 100 / 200 | plain | `--dispersion` |
|---|---|---|
| Gaussian | 4% / 1%, 92% / 97% | 3% / 1%, 91% / 98% |
| t3 | 39% / 62%, 57% / 55% | 21% / 29%, 56% / 64% |
| GARCH | 42% / 51%, 61% / 57% | 34% / 30%, 58% / 64% |
| AR(1) 0.5 | 51% / 54%, 44% / 37% | 44% / 40%, 48% / 43% |

It roughly halves the false alarms at n = 200 and leaves Gaussian behaviour and detection alone, but 30% on GARCH and
t3 is still not safe: the noise warning stays on and the dates remain candidates. At n = 100 the gain on GARCH is small
(42% to 34%). A GARCH likelihood cost is still open.

### A GARCH filter removes the false alarms and the real variance break with them (2026-10-27, negative result)

The remaining route named above was a GARCH likelihood cost. A cheaper first test of the idea: fit GARCH(1,1) by Gaussian
quasi-ML to the series less its median (`garchSigma` in `engine.mjs`, variance targeting plus a grid and local search), divide
the series by the fitted conditional sd, then run plain `meanvar`. `eval/meanvar-garch-filter.mjs` (output
`eval/meanvar-garch-filter.out.txt`, 200 series per cell, same seeds and noise kinds as the dispersion runs) reports, plain
then filtered: null series with any change / sd 1 to 2 break found exactly once / mean +1.5 sd shift found exactly once.

| n, noise | plain | GARCH-filtered |
|---|---|---|
| 200, Gaussian | 1% / 97% / 98% | 1% / 6% / 99% |
| 200, GARCH | 51% / 57% / 50% | 1% / 9% / 78% |
| 200, t3 | 62% / 55% / 38% | 54% / 41% / 43% |
| 200, AR(1) | 54% / 37% / 47% | 42% / 23% / 63% |
| 100, GARCH | 42% / 61% / 65% | 3% / 13% / 83% |

False alarms on GARCH noise fall from about 50% to 1% to 3%, far below the 30% of `--dispersion`, and mean shifts are
found more often. But a GARCH model reads a lasting jump in variance as high persistence, so the filter also absorbs the real
sd 1 to 2 break (97% down to 6% on Gaussian noise at n = 200). It cannot be a default, and a filter does nothing for t3. What is
left is a joint likelihood where the variance path may break at a changepoint while GARCH holds within segments, which PELT's
segment-independent cost cannot express (the recursion depends on the previous segment's state). Not shipped as an option;
the function and the script stay so the next attempt starts from this baseline. Simulated noise only.

### A second dispersion round does not help (2026-10-26, negative result)

The factor is estimated from a fit that already holds the false breaks, so one idea is to re-estimate it on the refit's
residuals and refit again. `eval/meanvar-dispersion-iter.mjs` (output `eval/meanvar-dispersion-iter.out.txt`, same seeds
and cells, 200 series each) runs one, two and three rounds. False alarms on a null series at n = 200: GARCH 30% / 27% / 27%,
t3 29% / 23% / 22%, AR(1) 40% / 40% / 39%; at n = 100 GARCH stays 34%. Detection of the sd 1 to 2 break moves by at most
4 points either way and Gaussian is unchanged. The gain stops after round two and the residual false alarms are the
noise's memory, which a scale factor cannot remove, so the single pass stays the default and a GARCH likelihood cost is the
remaining route.

## `--bootstrap`: a penalty read off block-resampled residuals (2026-10-27)

`--model meanvar --bootstrap` (`bootstrap: true`) fits once with 3x the BIC penalty, standardises each segment, resamples
the residuals in blocks of 2 n^(1/3) points (so volatility clustering and short memory survive), and takes the 95th
percentile, over 100 seeded resamples, of the best single-split cost drop. The penalty is the larger of that and BIC and is
returned as `bootstrapPenalty`. Unlike `--dispersion` it asks the data how big a spurious drop gets under the noise it
actually has, not for one scale factor. Not for use with `--robust` or `--dispersion`. `eval/meanvar-block-bootstrap.mjs`
(output `eval/meanvar-block-bootstrap.out.txt`, seeded, 200 series per cell, same generators and seeds as
`meanvar-dispersion.mjs`; A = standardised by a BIC pass, B = by a 3x BIC pass, B shipped). False alarms on a null series /
exactly one change on an sd 1 to 2 break:

| noise, n = 100 / 200 | plain | A | B (`--bootstrap`) |
|---|---|---|---|
| Gaussian | 4% / 92%, 1% / 97% | 4% / 92%, 1% / 97% | 2% / 80%, 1% / 100% |
| t3 | 39% / 57%, 62% / 55% | 35% / 59%, 54% / 61% | 8% / 44%, 15% / 69% |
| GARCH | 42% / 61%, 51% / 57% | 39% / 60%, 47% / 60% | 14% / 57%, 16% / 74% |
| AR(1) 0.5 | 51% / 44%, 54% / 37% | 39% / 50%, 36% / 48% | 8% / 49%, 7% / 80% |

At n = 200 it takes GARCH from 51% to 16% false alarms (`--dispersion`: 30%) and detection rises. The price is at n = 100:
Gaussian detection falls from 92% to 80% and t3 from 57% to 44%. Variant A, which standardises by the BIC pass that already holds the false breaks, barely
helps. In-sample on the generators above, simulated data only, no real series tried; the noise warning stays on. About
0.2 s per 200-point series. Test: `meanvar-bootstrap.test.mjs`.

### The mean model too (2026-10-26)

`--model mean --bootstrap` does the same with residuals about the segment means kept in units of the noise scale the mean
cost uses, so autocorrelated noise (residual sd above that scale) raises the penalty. Not with `--ar1`. Measured by
`eval/mean-block-bootstrap.mjs` (seeded, 100 series per cell, n = 200, unit-variance AR(1) noise, detection is a 2 sd step at 100 found within 10):

| noise | false alarms plain | false alarms `--bootstrap` | detection plain / `--bootstrap` |
|---|---|---|---|
| iid | 5% | 1% | 100% / 100% |
| AR(1) 0.3 | 80% | 13% | 98% / 98% |
| AR(1) 0.5 | 100% | 53% | 98% / 94% |

Synthetic noise only; a real autocorrelated series is still wanted.

### Counts too (2026-10-26)

`--model poisson --bootstrap` takes Pearson residuals from a 3x BIC fit (using any seasonal or holiday exposure), resamples
them in blocks and turns them back into counts about the overall rate, so runs of busy and quiet days (overdispersion that
clusters) raise the penalty. `eval/poisson-block-bootstrap.mjs` (seeded, 100 series per cell, n = 200, mean 10, log rate AR(1)
0.8 with the sd shown, detection is a x1.5 step at 100 found within 10):

| clustering (sd of log rate) | false alarms plain | false alarms `--bootstrap` | detection plain / `--bootstrap` |
|---|---|---|---|
| 0 (pure Poisson) | 5% | 4% | 98% / 98% |
| 0.2 | 89% | 11% | 83% / 73% |
| 0.4 | 100% | 74% | 86% / 63% |

Synthetic only, and at sd 0.4 it still raises 74% false alarms; a real clumpy count series is still wanted. Holidays are
still untested. Test: `meanvar-bootstrap.test.mjs`.

**Combined with `--trend`, a weekly season or `nb` (2026-10-28).** `eval/poisson-bootstrap-options.mjs` (n = 210, steady
growth 0.3% a day and/or a weekly season with two days at x0.6, same clustering and detection step at 105; output in
`eval/poisson-bootstrap-options.out.txt`). False alarms plain / `--bootstrap`:

| options | sd 0 | sd 0.2 | sd 0.4 |
|---|---|---|---|
| weekly season (`--period 7`) | 8% / 3% | 81% / 8% | 100% / 73% |
| `--trend` | 6% / 6% | 94% / 59% | 100% / 96% |
| `--trend` + season | 11% / 9% | 87% / 42% | 100% / 92% |
| `--trend` + `--overdispersion nb` | 4% / 4% | 88% / 52% | 100% / 97% |

The season alone behaves like the plain case. With `--trend` the bootstrap barely helps (59% false alarms at sd 0.2 against
8% with the season alone) and detection falls from 82% to 57%, so on clustered counts with a growth term the
penalty is not trustworthy yet. Cause not established (guess: the growth term is fitted before the pilot, so the pilot's
residuals already absorb some clustering). Synthetic only.

**With known holidays (2026-10-28).** `eval/poisson-bootstrap-holidays.mjs` (n = 210, a holiday every 28th day at x0.3 given
with `--holidays`, same clustering and x1.5 step at 105; output in `eval/poisson-bootstrap-holidays.out.txt`, seeded, 100
series per cell, synthetic only). False alarms plain / `--bootstrap`, then detection:

| options | sd 0 | sd 0.2 | sd 0.4 | detection at sd 0.2 / 0.4 |
|---|---|---|---|---|
| holidays | 4% / 3% | 85% / 21% | 100% / 65% | 76% / 72%, 87% / 59% |
| holidays + `--period 7` | 2% / 2% | 77% / 15% | 100% / 67% | 75% / 71%, 81% / 47% |

Holidays behave like the weekly season, not like `--trend`: the bootstrap cuts clustered false alarms to 15-21% at sd 0.2
for a few points of detection. At sd 0.4 it is still 65%, as in every other cell. Holiday dates were given exactly here.

**Missed holidays (2026-10-27).** `eval/poisson-bootstrap-missed-holidays.mjs` (same series, seeded, 100 per cell, output in
`eval/poisson-bootstrap-missed-holidays.out.txt`) tells the engine all, every other, or none of the seven true holidays.
False alarms plain / `--bootstrap` at sd 0.2: 85% / 21%, 86% / 20%, 90% / 19%; at sd 0.4: 100% / 65%, 100% / 72%, 100% / 73%.
Detection at sd 0.2 with `--bootstrap`: 72%, 77%, 73%. At sd 0 false alarms stay 2-6%. So with seven holidays in 210 days a
missed one does not move false alarms or detection beyond seed noise (about +-4 points); the bootstrap's gain does not depend
on the holiday list being complete. This is a small test (a x0.3 day among 30 is a weak outlier); a series with many missed
closures is untested. Synthetic only.

## `--robust`: a Laplace cost for `meanvar` on heavy tails (2026-10-25)

The section above ended with a warning because the Gaussian variance cost has no cheap fix. A different noise model does
help on heavy tails. `--model meanvar --robust` (`robust: true` in `analyze`) fits each segment's median and mean absolute
deviation (double-exponential noise) instead of its mean and variance, so one extreme point no longer inflates a segment's
variance. `eval/meanvar-laplace.mjs` (output in `eval/meanvar-laplace.out.txt`, seeded, 100 series per cell, same
generators as `meanvar-robustness.mjs`, default minimum segment of 10):

| noise, cost | false alarms, n = 100 / 200 | one change found on an sd 1 to 2 break, n = 100 / 200 | range95 holds the date |
|---|---|---|---|
| Gaussian, Gaussian cost | 4% / 0% | 94% / 97% | 98% / 98% |
| Gaussian, Laplace cost | 5% / 4% | **57%** / 92% | 95% / 99% |
| t3, Gaussian cost | 37% / 63% | 58% / 55% | 78% / 69% |
| t3, Laplace cost | **5% / 8%** | 59% / **89%** | 88% / 97% |
| GARCH, Gaussian cost | 41% / 50% | 63% / 58% | 70% / 72% |
| GARCH, Laplace cost | 21% / 29% | 62% / 69% | 85% / 83% |

On heavy tails it removes most false alarms and, at n = 200, finds the break 89% of the time instead of 55%. It is not a
free upgrade: on Gaussian noise at n = 100 it finds the single break in only 57% of series (94% with the Gaussian cost),
so it stays opt-in. Clustered volatility is only half fixed (21% to 29% false alarms). Not changed: the Bayesian
probability view still used the Gaussian model (changed 2026-10-27, below), and the kurtosis part of the noise warning is skipped when `--robust` is
on (autocorrelation and clustered-volatility parts stay). Simulated noise only; no real heavy-tailed series tried. Test:
`meanvar-robust.test.mjs`. Cost: each segment is sorted on demand, so long series (several thousand points) run slower.

## A calibrated penalty for `meanvar`: a mostly negative result (2026-10-25)

The Laplace cost above leaves clustered volatility at 21% to 29% false alarms. A different idea is to keep the Gaussian cost and
scale its BIC penalty by how much the noise inflates the variance-change statistic. For standardised Gaussian residuals the squares
have variance 2; the long-run variance of the squares (Bartlett kernel) divided by 2 is a factor c, and the penalty becomes
max(1, c) times BIC. `eval/meanvar-calibrated-penalty.mjs` (output in `eval/meanvar-calibrated-penalty.out.txt`, seeded, 100 series
per cell, generators and seeds as in `meanvar-laplace.mjs`, plus AR(1) with rho 0.5) tries two ways to get the residuals:
**A** standardise by the first-pass segments, **B** by segments from a 3x BIC pass.

| noise | false alarms n = 100 / 200: plain, A, B | exactly one change near the sd 1 to 2 break n = 100 / 200: plain, A, B |
|---|---|---|
| Gaussian | 4 / 0, 3 / 0, 2 / 0 | 89 / 94, 89 / 96, 41 / 94 |
| t3 | 37 / 63, 17 / 27, 4 / 5 | 46 / 38, 47 / 48, 22 / 42 |
| GARCH(1,1) | 41 / 50, 37 / 35, 8 / 8 | 46 / 42, 45 / 44, 26 / 48 |
| AR(1) 0.5 | 49 / 46, 42 / 34, 31 / 19 | 36 / 35, 40 / 41, 34 / 52 |

A is free (Gaussian rows unchanged) but only halves the false alarms on t3 and barely moves GARCH, because the first pass's
false segments soak up the very inflation it tries to measure. B removes most false alarms on t3 and GARCH but, at n = 100, loses
half the real breaks on Gaussian noise (89% to 41%), because a break left inside one segment looks like heavy-tailed noise. Neither
beats `--robust` on t3 and neither is wired into `analyze`. The open problem is estimating the inflation without the break itself
feeding it. Simulated noise only; 100 series per cell, so differences under about 10 points are within noise.

The page has the option too (2026-10-25): a "Heavy-tailed noise: Laplace cost" checkbox, sent as `robust: true` only when the model is
"Level and volatility". `page.test.mjs` checks the wiring; the Bayesian view is unchanged.

## `--robust` in the Bayesian view (2026-10-27)

The probability view's Normal-Inverse-Gamma model has no Laplace version that stays exact, so with `robust` on, the Bayesian pass
reads the series clipped at its median plus or minus 2 robust noise sds (`robustSd`, successive differences, so a level shift does
not inflate it). One outlier then counts as a bounded surprise, not as evidence for a new segment. PELT is unchanged.
`eval/meanvar-bayes-tails.mjs` (output `eval/meanvar-bayes-tails.out.txt`, seeded, 100 series per cell, threshold 0.5):

| noise, n | null false alarm, plain to robust | mean +1.5 sd found within 3 points | sd 1 to 2 found within 3 points |
|---|---|---|---|
| t3, 100 | 18% to 1% | 45% to 56% | 8% to 0% |
| t3, 200 | 47% to 1% | 48% to 62% | 3% to 1% |
| Gaussian, 100 | 0% to 1% | 23% to 27% | 5% to 1% |
| Gaussian, 200 | 1% to 2% | 19% to 26% | 4% to 1% |

Cost: the Bayesian view, which already caught few variance breaks (3 to 8%), now catches almost none with `--robust`; PELT is the
volatility detector. Mean shifts are found at least as often. The clip width (2) was tried against 1.5 and 3 on t3 only
(3: 2% false alarms, 50% found; 1.5: 1%, 67%); it was not tuned on Gaussian data, and 100 series per cell means differences under
about 10 points are noise. Simulated noise only. Test: `meanvar-robust.test.mjs`.

## A Ljung-Box line for clustered volatility in the `meanvar` warning (2026-10-25)

The noise warning above caught GARCH noise only 16% to 20% of the time, because it read lag 1 of the squared residuals
and GARCH(1,1) with these settings keeps lag 1 under 0.2 while lags 2 to 5 stay up. `meanvarNoiseCheck` now also
adds a Ljung-Box statistic over lags 1 to 5 of the squared segment residuals (needs 50 points) and warns at 11.07,
the 95th percentile of chi-square with 5 df. Same simulation, same seeds (`eval/meanvar-robustness.mjs`, 200 per
cell), null series / sd 1 to 2 break series:

| noise | before, n = 100 / 200 | now, n = 100 / 200 |
|---|---|---|
| Gaussian (false warning) | 2% / 1% | 7% / 4% (null), 6% / 2% (break) |
| GARCH, null | 20% / 16% | 34% / 49% |
| GARCH, break | 11% / 18% | 19% / 39% |

So the cost of the line is about 3 to 5 points of extra false warnings on clean Gaussian series, and the gain is
real but partial: about half of GARCH series at n = 200 are flagged, still about a third at n = 100. The 11.07 cut
is the textbook value, not tuned on these runs; a stricter 15 would hold Gaussian false warnings near 2% to 3%
and flag 11% / 35% of GARCH nulls. Only simulated GARCH was tried, no real volatility-clustering series.

Nile variants (2026-10-26, `nile-variants.test.mjs`): on the real Nile series the documented 1898 dam break comes back as one change at 1899 under `mean`, `--ar1`, `meanvar` and `meanvar --robust`, and every 95% range holds 1899. `--ar1` widens the range from 1897-1899 to 1897-1901 and cuts the Bayesian probability from 79% to 50%: the autocorrelation allowance costs certainty about the date, not the date itself.

## A real count series: British coal-mining disasters (2026-10-26)

Until now the Poisson path was checked on real counts only through the seasonal and trend variants (UK driver casualties, Wikipedia pageviews). `data/coal-mining-disasters.csv` is the plain annual case: 191 disasters of ten or more deaths in 112 years (1851-1962, Jarrett 1979). Plain `poisson` PELT returns two changes: **1892** (3.10 to 1.07 a year, `range95` 1886 to 1897, which holds the literature's 1890) and a second at 1948 (1.07 to 0.27, `range95` 1897 to 1961). The 1948 change is real in the data (a handful of disasters after nationalisation) but the range is 64 years wide: eleven or so events cannot date it, and the tool says so instead of giving a point. `--overdispersion nb` returns the same two changes. One real series, one run: it shows the interval is honest here, not that its coverage is 95%. Test: `coal-disasters.test.mjs`.

## Real overdispersed counts: great discoveries (2026-10-27)

`data/great-discoveries.csv` is 310 "great" inventions and discoveries in 100 years (1860-1959, World Almanac; variance 1.64 times the mean). Years 1884-1888 read 7, 12, 3, 10, 9 against about 2.5 a year before, so the series is a five-year burst more than a level shift. Plain `poisson` PELT returns three changes: **1884** (2.50 to 8.20 a year, `range95` 1883 to 1885), **1889** (8.20 to 3.68, `range95` 1886 to 1894) and **1933** (3.68 to 1.74, `range95` 1930 to 1954). `--overdispersion nb` returns the same three with the 1889 range widened to 1886-1919, so it admits that the fall is not dated. `--bootstrap` returns **no change** (penalty 31.9). The honest reading is that the 1884 and 1889 cuts are one burst the plain Poisson test splits into two steps with narrow ranges that are too confident, and the bootstrap penalty declines to call a level change on 100 clustered annual counts. Whether the slow fall after 1933 is real is not settled by this series either way. One real series, one run: it shows the cost of the default on bursty counts, not a coverage rate. **Two options not tried above (measured 2026-10-28, same series).** `--overdispersion` (quasi-Poisson, estimated dispersion 2.76) returns **no change**, as the bootstrap does, and is the cheaper way to decline the burst. `--bursts` flags 1885 (12, kept as 3) and then still returns a step at **1884** (2.50 to 4.00 a year) and **1933** (4.00 to 1.74): it removes the spike, not the five-year plateau around it, so on a burst this long it is the wrong tool. Neither is a burst-aware count model, which stays open. One real series. Test: `great-discoveries.test.mjs`.

## Real heavy tails: daily exchange-rate returns (2026-10-26)

The robust, dispersion and bootstrap options above were tuned on seeded synthetic noise.
`eval/fx-shocks.mjs` (output `eval/fx-shocks.out.txt`, test `fx-shocks.test.mjs`) runs
`--model meanvar` on 1,750 real daily log returns of the Swiss franc, pound and yen against
the dollar, 2012-2018 (`data/fx-daily-returns.csv`, Fed H.10 via a public-domain mirror,
source in `data/SOURCE.md`). Two dated shocks: the Swiss National Bank dropped its euro
floor on 2015-01-15 (kurtosis of the franc series 111) and the UK voted for Brexit on
2016-06-23 (pound kurtosis 32). Yen (kurtosis 6.6) has no single documented break.

| series | default | `--robust` | `--dispersion` | `--bootstrap` |
|---|---|---|---|---|
| CHF changes (event found; not near the event) | 6 (yes; 4) | 3 (yes; 1) | 3 (yes; 1) | 6 (yes; 4) |
| GBP | 5 (yes; 3) | 4 (yes; 3) | 3 (yes; 1) | 4 (yes; 2) |
| JPY (no event) | 7 | 4 | 4 | 4 |

What this says, on three series and with no labels beyond two dates:

- Every mode finds both events, on the day (CHF 2015-01-15) or the week before (GBP 2016-06-17,
  inside the run-up to the vote; "near" is within 10 trading days of 2016-06-24).
- All four also report the end of the shock as a second change (CHF 2015-01-30, GBP 2016-07-06 or 07-20), which is true: the volatility burst has ended.
- The extra changes are quiet-versus-busy-year splits that default `meanvar` reads from heavy tails. `--dispersion` removes the most on GBP (3 of 5 changes left), `--robust` and `--dispersion` tie on CHF and JPY.
- **`--bootstrap` did not help on the franc, and the reason is measured** (2026-10-26, `eval/fx-bootstrap-why.mjs`, test `fx-bootstrap-why.test.mjs`). The bootstrap standardises the series by a 3x-BIC pilot fit. On the franc that fit cuts the shock into a 10-day segment, and standardising each segment by its own sd removes the tail: kurtosis 111.5 falls to 4.3 (pound 32.0 to 4.6; yen 6.6 to 5.6, no shock to hide). The resampled noise is so much lighter than the data that the penalty rises only from 22.4 to 36.4, and the extra changes drop out at about 45 (a fixed penalty of 45 returns the three-change answer; 100 drops to two). A longer minimum segment for the pilot does not recover the tail (penalty 36 to 38 at 10, 30, 60 and 90 days). So the option suits clustered noise that stays inside the series, and under-corrects when one giant day dominates. Untested fix: standardise by a robust scale fitted across the shock, not segment by segment.
- **The untested fix does not work either** (2026-10-27, `eval/fx-bootstrap-tail.mjs`, test `fx-bootstrap-tail.test.mjs`). Two ways to keep the tail in the bootstrap's pilot residuals, same 3x-BIC pilot, same seeds. Each segment by 1.4826 x its MAD instead of its sd: the franc penalty goes 36.4 to 35.2 and the same six dates come back (a 10-day shock still sets its own scale, because most of its days are big); pound 31.9 to 34.1, yen 45.6 to 47.8, no change in what is found. One global MAD scale after removing segment means: the tail is kept, and the penalty is 589 for the franc and 211 for the pound, so **zero changes**, the real 2015 shock included (yen 61.2, two changes, neither of them the 2013 to 2014 ones). On synthetic n=200 noise (60 reps) the three standardisations match: Gaussian 0% false alarms and 88% detection of an sd doubling, t3 12% / 12% / 8% false alarms, GARCH 17% for all. So the shipped per-segment sd stays. What is left is a pilot that knows which large days are one shock and which are the noise's tail, which needs the shock's date from outside the pilot (a joint fit), not a different scale.
- Residual clustering is still there after the fit (the Ljung-Box line prints for CHF, JPY and the robust runs), so the dates stay candidates.

Not claimed: that these dates are all the true regimes (the year-to-year splits may be real volatility changes), nor a false-alarm rate; that needs labelled series.

## A real slope change that is not a count: UK gas consumption (2026-10-27)

Every real series so far was a level step (Nile, seat belts), a volatility break or counts. `data/uk-gas.csv` is quarterly UK gas consumption, 1960Q1 to 1986Q4 (108 points, R's `UKgas`, source in `data/SOURCE.md`): a strong seasonal swing that grows with the level, and growth that picks up around 1970 (the North Sea gas era; recalled, not checked against a paper, so this is a plausibility check and not a labelled test). `eval/uk-gas.mjs` (output `eval/uk-gas.out.txt`, test `uk-gas.test.mjs`) runs it with `--period 4`.

- **Raw series, `--trend bend`:** one slope change at **1969Q4**, `slopeChangeRange95` **1966Q1 to 1971Q4** (slope 1.69 to 7.79 per quarter), and no level steps. Same bend under `meanvar`. It holds 1970 inside its range.
- **Log series, `--trend bend`:** no slope change at all, and two level steps (1963Q4, 1982Q2) instead. A log-linear series with a changing growth rate is the case the Gaussian trend should read as a bend, and it does not. Not diagnosed: the log scale shrinks the seasonal swing, so the cost drop from one bend may fall under the 3 log n bar; nobody has checked that.
- **`--drift` (drifting seasonal shape):** the seasonal amplitude grows, a fixed additive profile cannot hold it, and drift cuts the 1969 to 1972 stretch into 4 to 6 steps (raw: 1970Q2, 1970Q4, 1971Q2; log: 1969Q4, 1970Q2, 1970Q4, 1971Q3). They mark a changing seasonal shape, not four separate regime changes; the warning text does not say that yet.

What it says: the slope-bend range is useful here, but the answer depends on the scale, and a multiplicative season is not modelled on the Gaussian path (counts have it). Not claimed: a coverage rate; one series cannot give one.

Warning landed (2026-10-27, `driftWarning` in the result, a CLI line, a test in `uk-gas.test.mjs`): with `--drift` and `--period`, three or more steps within two cycles of each other now come back with a note that they usually mark a seasonal shape that is still changing, not separate regimes. It fires on the UK gas series (raw) and stays silent on the fixed profile. Only that one real series was checked, so the threshold (3 steps in 2 cycles) is a guess; a false-alarm rate on drift-free seasonal series is not measured.

**`driftWarning` false-alarm rate (measured 2026-10-28, `eval/drift-warning.mjs`, output `eval/drift-warning.out.txt`, test `drift-warning.test.mjs`; made-up series, mean model with `drift: true`, a sine season of swing 4, noise sd 1, 200 seeded series per row).** How often the note appears:

| series | quarterly, n=120 | monthly, n=144 |
|---|---|---|
| fixed season, no change | 4/200 (2%) | 7/200 (3.5%) |
| two real level steps, far apart | 4/200 (2%) | 23/200 (11.5%) |
| three real steps inside two cycles | 190/200 | 200/200 |
| amplitude tripling over the series | 4/200 | 10/200 |

Read plainly: without a change the note is rare, but with monthly data and two genuine steps it fired on one series in nine, so the 3-steps-in-2-cycles rule is not free of false alarms there. Three genuine steps packed together get the note nearly every time, and that is correct only if they are one drifting shape: the rule cannot tell a real burst of regime changes from drift, and the note's wording ("usually marks", "check the dates") says so. Unexpected, and worth knowing: a tripling amplitude barely produced steps (0.54 to 0.63 per series; the drift option follows a smooth sine amplitude), so the note seldom fires on this kind of drift; UK gas has a more abrupt change. Synthetic, one profile shape, no autocorrelation; the threshold is unchanged.

**Multiplicative season (2026-10-27).** `--multiplicative` (with `--period`, `mean`/`meanvar`; `seasonMode: 'multiplicative'` in the API) estimates the season as a factor: the median of x over its centred moving average at each phase, scaled to mean 1, and divides it out instead of subtracting an amount. It needs positive values and refuses `--drift`. `node eval/multiplicative-season.mjs 200 2026` (output in `eval/multiplicative-season.out.txt`; Gaussian noise at 3% of the level, 120 quarterly or 144 monthly points, one step of x1.3 or x2 at the midpoint, growth runs use `--trend`). Read plainly, the result is mixed. Monthly, a step with a season that scales with the level: steps per series 3.44 to 1.36 (x1.3) and 8.23 to 2.71 (x2), with the step found on 200 of 200 either way; monthly with no step, any alarm 47 to 31 of 200. Quarterly, the additive profile is already robust to a lone step (1.0 steps per series) and the multiplicative one is worse (1.38 and 2.54), probably because my noise is proportional to the level and so the variance doubles after the step; with growth 0.005 per point and `--trend` it is worse still on quarterly data (false alarms 23 to 186 of 200, a linear trend under an exponential level). So: an opt-in for monthly-or-longer cycles where the swing visibly grows with the level, not a default, and the log of the series (README, UK gas) remains the other route. Simulated data only, one profile shape per period; not yet run on a real series with a growing season (UK gas quarterly is the candidate).

**Multiplicative season on a real series (2026-10-28).** `data/airline-passengers.csv` (monthly passengers 1949-1960, 144 points; the season grows with the level; no documented step, so every step is a false alarm; `airline-passengers.test.mjs`). Raw series, `mean`: additive season 21 steps, `--multiplicative` 22; with `--trend bend` 20 and 15. The multiplicative season did not rescue the raw level model here: the underlying rise is exponential, and a linear trend or a level step cannot follow it. The log of the series with `--trend bend` gives 8 steps, and 5 with `--model meanvar`. So the real-series answer agrees with the UK gas one: for a season that scales with the level, take the log first; `--multiplicative` helped only on simulated step data. One series, no claim about rates.

**A narrower window, measured and not shipped (2026-10-28, `eval/drift-warning.mjs` now also counts three windows on the same change points; output in `eval/drift-warning.out.txt`).** The note asks for 3 steps inside 2 cycles. Using one cycle plus 3 points instead, monthly: two genuine far-apart steps 23/200 to 19/200 (one cycle alone: 10/200), no change 7 to 4, but three packed steps 200/200 to 58/200 (one cycle: 38/200). Quarterly: no change 4 to 2, packed steps 190 to 182. The packed cell spans 2P-1 points by construction, so it measures "inside two cycles" and cannot say whether a narrower rule would also catch real drift; the false-alarm gain on the monthly two-step row is 4 series in 200, inside seed noise for one profile shape. So the rule stays at 2 cycles. Made-up series only; wanted: a real monthly series with a known drifting season to choose between windows.

**`driftWarning` on five real series (measured 2026-10-28, `eval/drift-warning-real.mjs`, output `eval/drift-warning-real.out.txt`, test `drift-warning-real.test.mjs`).** `--drift` with the real period, raw and logged, with and without `--trend bend`:

| series | season | warning in 4 runs |
|---|---|---|
| airline passengers (monthly) | grows with the level | 4 of 4 (8 to 21 steps) |
| UK gas (quarterly) | grows with the level | 4 of 4 |
| Johnson & Johnson EPS (quarterly) | grows with the level | 2 of 4 (silent with `--trend bend`) |
| UK driver deaths (monthly) | fixed | 4 of 4 |
| Nottingham temperatures (monthly) | fixed, no change | 0 of 4 |

It is silent on the series with a fixed season and no change, and fires where the season grows, as intended. The UK driver deaths row is the miss: the warning says "usually marks a seasonal shape that is still changing", but its four packed steps (1972-11, 1973-11, 1974-06, 1974-11) are the winter-1973 fuel-rationing dip and the rebound, genuine regime changes in a fixed-season series. The same steps are named in the seat-belt section above. The signs do not separate the cases either: dip-and-rebound (-, +, -) in the deaths, but airline and UK gas also carry mixed signs (1953-03+ 1953-06-; 1970Q2+ 1970Q4- 1971Q2+). Five series, one wrong, no rule found on them; a run-sign test would be fitted to this sample. Not changed: the threshold or the text. Open: more real series, and a way to tell a seasonal shape from a short-lived real shock (a seasonal-profile refit at each step is the candidate).


## Four European indices: a common rise or a German one? (2026-10-29)

`EuStockMarkets` also carries SMI, CAC and FTSE over the same 1,859 trading days, so a cut at the same row is the same
day (`data/{smi,cac,ftse}-returns.csv`, `eval/eu-markets.mjs`, output in `eval/eu-markets.out.txt`, about 6 minutes).
Standard deviation of the returns before and after row 1482, computed directly: DAX 0.90 to 1.43, SMI 0.83 to 1.23,
CAC 1.04 to 1.34, FTSE 0.74 to 0.98. All four rise (by 59%, 48%, 29% and 32%), but the detector does not find it in all four.

| Index | plain `meanvar` | `--bootstrap` | `--dispersion` | `--robust` |
| --- | --- | --- | --- | --- |
| DAX | 32, 42, 275, 332, 1132, 1482 | 32, 42, 1482 | 39, 1482 | 275, 1132, 1488 |
| SMI | 35, 45, 275, 334, 681, 804, 1489 | 1489 | 1489 | 681, 799, 1476 |
| CAC | 32, 42, 99, 1179, 1417 | 1179, 1417 | none | none |
| FTSE | 309, 344, 653, 906, 1545 | 309, 334, 1550 | 309, 334, 1550 | 972, 1545 |

What this shows: the DAX and SMI cut within 7 rows of each other (1482 and 1489) under `--bootstrap` and `--dispersion`, so the rise is not a one-index artifact. FTSE's comes about 60 rows later (1545 to 1550). CAC's rise is the
smallest of the four, and `--dispersion` and `--robust` report no change at all on it: a 29% rise in the
standard deviation on 1,859 clustered, heavy-tailed days is below what these penalties will call a change. Also seen: plain `meanvar` cuts the
same early spike (rows 32 to 45) in DAX, SMI and CAC, around a one-day fall at row 36, so that cut is a shared event too, not noise
in one index. Not checked: calendar dates (the dataset has none), and whether CAC's cut at 1417 is part of the same rise (it
sits 65 rows before the DAX's, so read it as a separate candidate). Test: `eu-markets.test.mjs` (about 4 minutes, `--bootstrap` left to the eval script).

## Two more real series: WWWusage and nhtemp (2026-10-29)

`data/www-usage.csv` (users on an internet server each minute, 100 points) and `data/nhtemp.csv` (New Haven annual temperature, 1912 to 1971), both R datasets (`data/SOURCE.md`). `wwwusage-nhtemp.test.mjs` pins what the detector does; neither series has a documented break.

- **WWWusage wanders and has no steps.** Defaults cut it into 22 segments (21 "changes", 2 to 6 noise sds each); `--trend bend` still gives 15 segments; `--ar1` gives none; `--ar1 joint` gives one (minute 82, up from 125 to 190, only 0.53 noise sds). So on a wandering real series the plain mean model reports a staircase, and `--ar1` is the right switch, as on Lake Huron. One series; no detection-rate claim.
- **nhtemp: one rise at 1944** (50.5 to 51.9 F, 1.2 sds) under the default, `--ar1` and `--ar1 joint`, with a 95% range of 1927 to 1949, wide because the shift is small. `--trend bend` finds no change: a straight line explains the warming. The literature gives no single break to score against.

## A real autocorrelated series: Lake Huron levels (2026-10-27)

`data/lake-huron.csv` is the annual mean level of Lake Huron, 1875 to 1972 (98 points, R's `LakeHuron`, source in `data/SOURCE.md`). The literature puts one drop near 1920; the series has lag-1 autocorrelation of about 0.8, so it is the case the Nile is not. `lake-huron.test.mjs` pins what the detector does today (no eval script; three runs of `analyze`).

- **Plain `mean`:** 10 changes (1889, 1923, 1929, 1931, 1942, 1951, 1956, 1963, 1966, 1969). 1923 has range95 1921 to 1924. A run of short steps is what positive autocorrelation looks like to a white-noise cost.
- **`--ar1`, plain and `joint`:** no change at all. The noise scale is widened enough to hide the drop as well. That is a failure for a user who wants the 1920 drop, and it is not diagnosed (the drop is a few feet over a few years, so an AR(1) around a level may read part of it as persistence).
- **`--model meanvar`:** two changes, 1889 and 1923, 1923 range95 1919 to 1925.

What it says: on a strongly autocorrelated real series, `mean` over-segments and `--ar1` under-segments, and only `meanvar` lands near the documented date here (probably by luck of the variance term; one series, no rate claimed). The 1889 change is not in the literature I recalled; not checked against a paper. Open: an AR(1) mean model that keeps a drop of this size, for instance a penalty rescaled by the estimated coefficient on segment residuals instead of the whole series.

**Diagnosis (2026-10-28, `lake-huron-profile.test.mjs`).** The `--ar1` rho start is 0.95, the clip, so the fit starts from near-unit-root noise. Fitting `ar1mean` afresh at each rho from 0 to 0.9 (innovation sd re-estimated per fit, score n log sd² − log(1−rho²) + 2 log n per change) shows the likelihood itself prefers rho 0.8 with no change (score −64.4, against −63.5 at 0.9 and −26.8 at 0). 1923 appears only at rho 0 to 0.3 (white-noise end) and is gone by 0.5. So `--ar1` is not hiding a drop the exact likelihood supports: on this series a persistent AR(1) around one level is the better description, and the 1920 drop is what you get when persistence is priced as steps. Whether the literature's drop is real is a modelling question this likelihood cannot settle; the 2-parameters-per-change score is a rough BIC, not a tuned one. One series; no detection-rate claim. Still open: a start for the joint fit that is not the clip (a profile over rho is cheap here, 10 PELT runs), tested on simulated AR(1)-plus-step series for detection.

**Profile over rho as the fit itself: measured, no gain (2026-10-28, `ar1ProfileFit` in `engine.mjs`, `eval/ar1-profile.mjs`, `ar1-profile.test.mjs`).** The open item was whether scoring the exact AR(1) likelihood on a grid of rho (each with its own PELT fit) should replace the difference-based start of `--ar1 joint`. Simulated AR(1) noise, n = 100, 200 series per cell, seeds 1..200; "false alarm" is any change on a no-change series, "hit" is exactly one change within 5 points of the true one (shift of 2 stationary sds at the midpoint). rho 0: false alarms white 11.0%, `--ar1` 6.5%, joint 6.0%, profile 5.5%; hits 88.5 / 94.0 / 94.5 / 96.0%. rho 0.5: false alarms 99.0 / 15.0 / 21.5 / 26.5%; hits 2.0 / 67.5 / 69.0 / 66.5%. rho 0.8: false alarms 100 / 17.5 / 24.5 / 34.0%; hits 0.0 / 31.5 / 59.5 / 50.5%. The profile fit is no better than `--ar1 joint` and has more false alarms at high rho (it can pick a lower rho and spend the difference on a step), so it is exported as a diagnostic (`ar1ProfileFit` returns the whole grid of scores) and not wired to a CLI flag. Synthetic only; one noise model.


## A real mean series with several regimes: US inflation (2026-10-27)

`data/us-inflation.csv` is quarterly US CPI inflation, 1959Q2 to 2009Q3 (202 points, source in `data/SOURCE.md`). The literature has a rise with the 1973 oil shock, a second surge in 1978-79, and the Volcker disinflation of 1981-82. `eval/us-inflation.mjs` (output in `eval/us-inflation.out.txt`, `us-inflation.test.mjs`, 2 tests) runs the `mean` model:

- **Defaults:** 12 changes, including a run of short steps in 1980-86 and 2007-09. It over-segments, as on Lake Huron.
- **`--ar1`:** 9 changes; 1973Q3 (4.6 to 11.2), 1978Q2 (6.2 to 10.8) and 1981Q4 (10.8 to 4.0) are the three documented ones.
- **`--bootstrap`:** 7 changes with the same three (1981Q4 now 10.8 to 3.2). The 1973Q3 and 1981Q4 ranges are a single quarter, narrower than the 1978 one (1978Q1 to 1979Q1); I did not check that coverage on this series.
- **Artefact:** the one quarter of 2008Q4 deflation (-5.97) is cut as its own segment by every setting (`--bootstrap` leaves 2008Q3 and 2009Q1 as two changes); minimum segment 8 removes it but also moves 1973Q3 to 1973Q1 and 1965Q4. Treat a one-or-two-quarter segment as an outlier, not a regime.

One series, regime dates from the literature, no rate claimed; this is a real-data check that the settings built on synthetic data land where economists put the breaks.

## A real null series: Nottingham temperatures (2026-10-27)

Monthly mean air temperature at Nottingham Castle, 1920-1939 (240 months, `data/nottem.csv`, R's `nottem`). A
stable climate with a strong season and no documented step, so every cut is a false alarm. With `--period 12`:

| Run | Steps cut |
| --- | --- |
| default (`mean`) | 4: 1922-07, 1922-09, 1929-01, 1929-03 (two pairs, each a spike cut out as a short segment) |
| `--min-segment 6` | 2: 1933-03, 1933-10 (a 7-month warm spell) |
| `--min-segment 6 --model meanvar` | 0 |
| `--model meanvar --bootstrap` | 0 |

So the default `mean` model reads two unusual months as four steps. The pairs are the tell: a step up and back down
within a few months is a spike, not a regime. Use a longer minimum segment or `meanvar` when spikes are expected.
Only the counts above are claimed; whether the spikes are the cold February 1929 and the cool 1922 summer is not
checked against a record here. Test: `nottem.test.mjs`.

## A real volatility rise: DAX returns (2026-10-27)

Daily log returns of the DAX, 1,859 days, 1991 to 1998 (`data/dax-returns.csv`, R's `EuStockMarkets`; the file
carries row numbers, not dates). Volatility is clustered and the tails are heavy, the case `--model meanvar` warns
about. Standard deviation of the returns, computed directly: 0.90 over rows 2-1481, then 1.20, 1.56, 1.53 and 1.32
over the four stretches after 1482 (rows 1482-1560, 1560-1640, 1640-1760, 1760-1860).

| Run | Cuts (row) |
| --- | --- |
| `--model meanvar` | 32, 42, 275, 332, 1132, 1482 |
| `--model meanvar --bootstrap` | 32, 42, 1482 |
| `--model meanvar --dispersion` | 39, 1482 |
| `--model meanvar --robust` | 275, 1132, 1488 |

Every variant keeps a cut near row 1482, where the spread goes from 0.86 to 1.43 (bootstrap run). The earlier cuts
differ by variant: plain `meanvar` cuts a 10-day spike (32-41) and a 57-day dip (275-331), and `--bootstrap` and
`--dispersion` keep only the first spike. The Ljung-Box line fires on all four runs, so read them as candidates.
Not checked: the calendar date of row 1482 (the dataset has no dates; a rough count of 260 days a year puts it in
early 1997, earlier than the October 1997 Asian-crisis turbulence one might expect), or any record of what moved
the market then. Test: `dax-returns.test.mjs` (about 95 s, mostly the bootstrap).

## A real exponential-growth series: Johnson & Johnson earnings (2026-10-28)

`data/johnson-johnson.csv` is J&J's quarterly earnings per share, 1960Q1 to 1980Q4 (84 points, source in `data/SOURCE.md`). It grows roughly 15% a year with a seasonal pattern and has no documented changepoint, so any change reported is, at best, a change in the growth rate. `johnson-johnson.test.mjs` pins what the settings do (2 tests; run by hand with the CLI, no eval script):

- **Raw, `mean`, `--period 4`:** 12 changes with no season, 15 with an additive season, 16 with `--multiplicative`; all up-steps of 0.5 to 2.5 dollars apart from small dips in 1978Q3 and 1980Q3. `--period 4 --trend` still gives 11 and `--model trend --period 4` 5. A straight line or a staircase cannot follow a curve, so the staircase is what comes out.
- **Logged (`ln eps`), `--period 4`:** still 11 steps (the log series still trends).
- **Logged, `--period 4 --trend`:** 5 changes (1960Q4, 1962Q4, 1970Q2, 1975Q3, 1979Q4), each of 0.1 to 0.26 in log units. `--trend bend` leaves 2 (1960Q4, a 3-point opening segment, and 1970Q2); `--trend --bootstrap` leaves 2 (1960Q4 and 1975Q3).

What it says: on a series that grows by a constant percentage, take logs first (`--log` does it, 2026-10-28, below). The 1970 and 1975 dates are where the growth rate looks to change, which I did not check against any account of the company; the 1960Q4 change is an opening-segment effect. One series, no rate claimed. Open: a series with a documented growth-rate break.

### `--log` (2026-10-28)

`--log` (engine option `log: true`) takes natural logs before any other step, for `mean`, `meanvar` and `trend` (counts refuse it: they already model the rate as a factor). Values must be positive; a zero or negative row is an error naming the row. Results come back in original units where that is meaningful: each segment (without a trend) carries `geometricMean` (e^mean), each change a `ratio` (e^shift, the factor the level moves by), and `values` holds the original series. Means, shifts and noise sd stay in log units, and the summary says so. On J&J it gives the same changes as logging the column by hand (`--period 4`: 11 steps; with `--trend` 5; with `--trend bend` 2), pinned in `johnson-johnson.test.mjs`. Not done: the page has no log checkbox yet; `--log` with `--multiplicative` is redundant (a log already makes the season multiplicative) and is not rejected. The page has the same option as a checkbox, "Take logs first" (2026-10-28); checked in headless Chromium on J&J earnings: 12 changes off, 10 on, no page errors, same result as `node cli.mjs --log`. `page.test.mjs` pins the wiring only.

## Shape or shock? A negative result on the drift warning (2026-10-29)

The drift warning fires on UK driver deaths (fixed season, a real 1973 fuel-crisis dip and rebound) as well as on the three series whose seasonal shape really grows (README, drift warning). Idea tested: a shock cancels (dip then rebound) while a growing shape does not, so `net/abs` of the shifts in the warning's window would separate them. `eval/drift-warning-shape.mjs` (output `eval/drift-warning-shape.out.txt`, 14 warned cells on 4 series):

- Airline and J&J, no trend: `net/abs` 1.00 (all steps up), as hoped. Driver deaths: -0.06 to -0.04 raw and log, no trend: cancelling, as hoped.
- With `--trend bend` the shape series cancel too: airline 0.06 (raw) and 0.30 (log), gas 0.10 and 0.04. Gas without trend is 0.38 and 0.50. Driver deaths with bend is -0.56 and -0.44.

So the statistic separates the series only when no trend is fitted, and a cut between the groups (about 0.3) would label UK gas and the bent airline fits as shocks. Not adopted; the warning text is unchanged. Not tried: a joint refit with a seasonal amplitude that scales with level, to see whether the steps vanish (a shape) or stay (a shock). Four series, one shock.

## Shape or shock, second try: a level-scaled season (2026-10-29)

The untried idea from the section above: refit with a seasonal amplitude that scales with the level (`seasonMode: 'multiplicative'`, no `--drift`) and see whether the steps near the drift warning vanish (a shape) or stay (a shock). `eval/drift-warning-multiplicative.mjs` (output `eval/drift-warning-multiplicative.out.txt`), same four real series, steps in the first two-cycle window the drift fit warns on, then steps from the multiplicative fit within one cycle either side of that window:

- UK gas: 3 steps become 1 (no trend) and 0 (bend). Works as hoped.
- Airline: 3 become 6 (no trend) and 5 (bend). Worse, not better.
- J&J without trend: 3 or more become 4 (the bent fit does not warn at all).
- UK driver deaths (the shock): 4 become 4 and 3 become 4. Stays, as a shock should.

So it separates one of three growing-season series from the shock. On the airline series the multiplicative fit finds more steps than the drift fit (22 against 20 in all with no trend, 15 against 8 with bend): a fixed multiplicative factor does not fit a shape that also changes in form, and the mean model has no growth term. Not adopted, and the warning text is unchanged. Both attempts to tell a shape from a shock automatically (cancellation, refit) failed on four real series with one shock; the note's wording ("check the dates against the series") stays the honest answer. Not tried: a multiplicative fit on the log, which turns a growing amplitude into a fixed one. Wanted: a second real series with a documented shock inside a seasonal series.

## Shape or shock, third try: refit on the log (2026-10-29)

The idea left untried above: take logs first (`log: true`, no drift), so a season that grows with the level has a fixed amplitude, and see whether the steps near the drift warning vanish. `eval/drift-warning-log.mjs` (output `eval/drift-warning-log.out.txt`, test `drift-warning-log.test.mjs`), same four series and same window as the multiplicative try:

- UK gas: 15 steps in all fall to 5 (no trend) and 7 to 2 (bend); the 3 steps in the window become 1 and 0. Works.
- J&J: 17 fall to 11 (no trend), the window's 3 steps stay 3; the bent fit, which never warned, goes 5 to 2.
- Airline: no trend, 20 become 22 and the window's 3 become 11, worse; with bend, 8 become 8 and 3 stay 3.
- UK driver deaths (the shock): 6 become 8 and 4 stay 4 (no trend); 4 become 6 and 3 stay 3 (bend). Stays, as a shock should.

So the log refit clears one growing series (UK gas) and thins J&J, but leaves the airline's window untouched or worse, and the shock behaves the same as the airline. A rule "the window empties, so it was a shape" would call one of three shapes right and miss two. Third failed automatic test (cancellation, level-scaled refit, log refit) on four real series with one shock; not adopted, the warning text is unchanged. Wanted, still: a second real seasonal series with a documented shock.

## Shape or shock, a second real series with shocks (2026-10-29)

The README asked for a second real seasonal series with a documented shock. Quarterly arrivals to Australia, 1981Q1 to 2012Q3, from the US (11 Sept 2001, the 2003 Iraq war and SARS) and from Japan (SARS, 2003): `data/au-arrivals-*.csv`, `eval/drift-warning-arrivals.mjs`, output `eval/drift-warning-arrivals.out.txt`, test `drift-warning-arrivals.test.mjs`. Same cells as the other real series (`--drift --period 4`, raw and log, with and without `--trend bend`).

- The warning fires in 7 of 8 cells (only US raw with bend is silent). These series trend hard, so the fit cuts 7 to 17 steps and some window always holds three. The warning cannot tell a shape from a shock here, and it has no way to say the cause is a trend the fit cut into steps.
- The dated shock is found: in all four US cells the fit puts a downward step at 2001Q3, the quarter of the attacks (the visitor drop shows in the quarter itself). The Japan SARS dip appears as a pair, a fall at 2003Q1 or Q2 and a rise at 2003Q4 (cancelling, as a shock does), in all four cells.
- So the "cancelling pair" signature from the earlier negative result holds on this shock too, but only a person reading the dates sees it: the warning window sits on the trend steps, not on the shock, and the 3-in-2-cycles rule would fire without it. Not adopted; the warning text is unchanged. One series pair, one fit, no ground truth beyond the event dates.
- Wanted: a trendless seasonal series with a shock, which would test the warning without the trend confound.

## Shape or shock, a trendless seasonal series (2026-10-29)

The last section asked for a trendless seasonal series with a shock, to test the warning without the trend confound. Monthly UK deaths from bronchitis, emphysema and asthma, 1974-79 (all, male, female; 72 months each), have the January 1976 peak of a bad winter; US accidental deaths 1973-78 have no documented shock and serve as the null. Data in `data/` (`SOURCE.md`), `eval/drift-warning-trendless.mjs`, output `eval/drift-warning-trendless.out.txt`, test `drift-warning-trendless.test.mjs`. Same cells as before (`--drift --period 12`, raw and log, with and without `--trend bend`).

- The spike is found as a cancelling pair in all 12 cells on the three UK series: a rise at 1976-02 and a fall at 1976-04. The warning fires in 11 of the 12 (it is silent only on the female series, log, no trend, which fits just that pair).
- **The null warns too:** 3 of 4 cells on US accidental deaths (silent only on log with bend). The fit cuts 2 to 8 steps in a series with no break a person would name, and a window of three steps lands in two cycles. So here the warning does not tell a shock from a shape, and it does not tell a shape from nothing: 14 of 16 cells warn, 3 of them null cells.
- Takeaway: on 72 months the 3-in-2-cycles rule is not a test of anything. The cancelling pair is visible to a reader (and could be a rule: opposite-sign steps within a few months, net near zero), but the null series also produces such pairs (1976-02+ and 1976-04- appear in US deaths too), so the pair alone does not separate shock from noise. Not adopted; the warning text is unchanged.
- One 72-month series per kind and no ground truth beyond a dated peak. Wanted: a longer trendless seasonal series with a documented one-off event, and a null series long enough that the warning rate means something.

## Shape or shock, 195 months of euro-area factory orders (2026-10-29)

The last section wanted a longer seasonal series with a documented event. Euro-area new orders for electrical equipment, 1996-01 to 2012-03 (195 months, R's `fpp2::elecequip`, `data/eu-elecequip.csv`, `data/SOURCE.md`), carry the late-2008 collapse and the 2009-10 recovery. `eval/drift-warning-elecequip.mjs`, output `eval/drift-warning-elecequip.out.txt`, test `drift-warning-elecequip.test.mjs`; the same four cells (`--drift --period 12`, raw and log, with and without `--trend bend`).

- The collapse is found in all four cells (falls at 2008-11 and 2009-01, after one at 2008-05), and the rebound as a rise at 2009-09 to 2010-08 in three or four.
- **The warning fires in all four cells, and so do 12 to 18 other steps**, from 1996-12 to 2011-06: the series is a business cycle with a long run of small shifts, not one event. So the 3-in-2-cycles rule again does not separate a shock from a shape; with this many steps it cannot fail to find three close together.
- Takeaway: on a longer series the warning is no better evidence than on 72 months. The text's advice (check the dates against the series) is what a reader should do; the number of steps cut (16 to 22 here) is the stronger signal that the segmentation is chasing a cycle, and a candidate for a rule.
- Still wanted: a null series of the same length with no event, so the warning rate means something. No such series is in the repository.

### A same-length null (2026-10-29)

`eval/drift-warning-null195.mjs` (output `eval/drift-warning-null195.out.txt`, test `drift-warning-null195.test.mjs`) builds 195 synthetic months: a fixed 12-month shape, a slow rise of 0.2% a month and Gaussian noise (sd 1%, 2% or 4% of the level), no shock and no drifting shape. 40 seeds per noise setting, `--drift --period 12`, raw and log, with and without `--trend bend`. Synthetic, so it says what the rule does on a clean null, not on real data.

- **White noise, with `--trend bend`:** the warning fires in 0 to 3 of 40 (0% to 8%) in every cell, with 0.4 to 1.1 steps on average. On a clean series the warning is quiet.
- **White noise, no trend term:** the rise is read as steps. At sd 1% it fires in 40 of 40 (16 steps on average); at sd 2%, 8 to 17 of 40; at sd 4%, 2 to 3 of 40. Whether it fires depends on how the noise compares with the drift, so it is no test of a seasonal shape here.
- **Autocorrelated noise (rho 0.5), even with `--trend bend`:** 30 to 35 of 40 at every noise level, with 7 to 9 steps. This is the finding: autocorrelation alone, with no shock and no changing shape, makes the warning fire as often as it did on the real euro series (4 of 4).

So the 16 to 22 steps on the real euro series are what a white-noise null does with no trend term (16 steps), and the warning on it is also what a null with autocorrelation does (8 to 9 steps, trend modelled). Neither a trend nor the warning is evidence of a shock or a shape. The real series' step count was above both nulls, which is weak evidence of a cycle; one real series against a synthetic null with a made-up shape does not fix a rule. Not changed: the rule or its text. Candidate next: point the warning's text at `--ar1` when the residuals are autocorrelated (the `rangeWarning` already does this).


**`driftWarning` and autocorrelated noise: the text now points at `--ar1` (measured 2026-10-29).** `eval/drift-warning-null195-ar1.mjs` re-runs the 195-month null (fixed season, no shock, 40 seeds per cell, raw scale, `--trend bend`) with and without `--ar1`. At rho 0.5 the warning fired in 33, 33 and 35 of 40 series without `--ar1` (sd 0.01, 0.02, 0.04) and in 0, 0 and 1 of 40 with it; at rho 0 it fired 0 to 3 of 40 either way (3, 2, 0 without; 2, 2, 0 with). So when the series looks autocorrelated (rho of 0.3 or more) and `--ar1` is off, the warning now says so and asks for a re-run before reading the steps as a changing shape. Not measured: whether `--ar1` also keeps the warning on a real drifting shape under sticky noise (the `--period --drift --ar1` section above covers the fit, not this warning). Output: `eval/drift-warning-null195-ar1.out.txt`; test: `drift-warning-null195-ar1.test.mjs`.

**`--ar1` on real drifting series (2026-10-29, `eval/drift-warning-real-ar1.mjs`).** With `--trend bend`, `--ar1` keeps the drift warning on the airline-passengers series (raw and log, 8 to 10 steps, warning yes) and stays silent on the fixed-season Nottingham temperatures, but it loses the warning on UK gas, a genuinely growing season (raw and log each fall from 6 or 7 steps to 1), and on UK driver deaths raw (the 1973 shock; log still warns). Johnson & Johnson never warned with bend. So `--ar1` is not a free fix for the autocorrelated false alarm: on a short quarterly series it widens the noise scale enough to swallow the drifting shape. Use it when the lag-1 autocorrelation is high and read the warning as "not shown" rather than "absent" on short series.

## A "null" that was not: US accidental deaths, 1973-78 (2026-10-30)

`eval/drift-warning-trendless.mjs` had used the 72 months of US accidental
deaths (R's `USAccDeaths`) as a no-shock null. It is not quiet. With the
12-month season, every setup tried (mean, NB counts, `--ar1`, `--trend bend`)
puts a fall at 1973-12 of about 1,000 deaths a month (9,707 to 8,757 for the
mean model), and all but the bend run add a second step at 1975-07. With no
seasonal term the winter peaks read as steps instead (1973-05, 1973-11,
1978-05). `eval/us-accidental-deaths.mjs` prints the table and
`us-accidental-deaths.test.mjs` locks it.

The timing sits with the oil embargo of late 1973 and the national 55 mph
limit of January 1974, which is the usual reading of that drop in driving
deaths. This is one dated coincidence on one series, not a test of the
detector against a known date, and the first segment is only 12 months long.
The note in the drift-warning eval now says so; its warning counts on this
series are unchanged, so read them as warnings on a series with a real step,
not as false alarms.

## Two quiet real series: lh and treering (2026-10-30)

The open item "a quiet real series is wanted" is met by two series with no documented step, so every cut is a false
alarm (`data/lh.csv`, `data/treering.csv`, both R's `datasets`; `quiet-series.test.mjs`).

| Series | Default `mean` | `--min-segment 6` | `--min-segment 20` | `--ar1` | `--model meanvar --bootstrap` |
| --- | --- | --- | --- | --- | --- |
| `lh`, 48 luteinizing hormone readings, lag-1 autocorrelation 0.58 | 5 steps (15, 18, 23, 35, 40) | 3 | 1 | 0 | 0 |
| `treering`, 7,980 yearly tree-ring widths, 6000 BC to 1979, lag-1 autocorrelation 0.22 | 38 | 33 | 31 | 11 | 1 (-4353) |

`lh` repeats the synthetic result on a real series: autocorrelation alone makes the default model see steps, and
`--ar1` removes all five. A longer minimum segment only thins them. `treering` is harder: its correlation at lag 1 is
modest but it drifts slowly over centuries, so `--ar1` still leaves 11 and only the bootstrapped `meanvar` penalty is
near quiet (1). Do not read a tree-ring "step" as a climate event from this tool; the counts are the claim, nothing
here is checked against a dendrochronology record. `--ar1` is for the `mean` model only.

## Two cyclic real series: lynx and sunspots (2026-10-30)

Quasi-periodic series with no documented step are a different false-alarm test from `lh` and `treering`: the level
swings up and down every ten or eleven years, and a model of "flat segments" reads each swing as two changes.
`data/lynx.csv` (Canadian lynx trappings, 1821-1934, 114 years) and `data/sunspot-year.csv` (yearly sunspot numbers,
1700-1988, 289 years), both R's `datasets` (`eval/cyclic-series.mjs`, `cyclic-series.test.mjs`).

| Series | Default `mean` | `--min-segment 20` | `--ar1` | `--model meanvar --bootstrap` |
| --- | --- | --- | --- | --- |
| `lynx` | 23 steps | 3 | 0 | 0 |
| `sunspot-year` | 46 steps | 7 | 0 | 0 |

(2026-10-30, later: `--ar1 joint` added as a fifth setup, `lynx` 0 steps, `sunspot-year` 1.)

So on a cycle the default model is wrong by a wide margin, a longer minimum segment only thins the steps, and
`--ar1` or the bootstrapped penalty removes them. Zero is the right answer here, but it is also the answer for a
tool that finds nothing: this table says nothing about power on a series with a real step inside a cycle, which is
not measured. The default output does not warn about a cycle; pointing the text at `--ar1` when it sees a periodic
autocorrelation pattern is open.

## Power on a step inside a cycle (2026-10-30)

The table above only counts false alarms, so it cannot tell a quiet tool from a blind one. This one adds a level
shift of 0.5, 1 or 2 series standard deviations to the real lynx and sunspot series from 30%, 50% or 70% of the way
through, and asks whether a setup puts a change within 3 points of it (hits out of 3 positions;
`eval/cyclic-power.mjs`, `cyclic-power.test.mjs`). "Other" is the count of further changes in the same run.

| Series | Setup | 0.5 sd | 1 sd | 2 sd | Other changes (1 sd) |
| --- | --- | --- | --- | --- | --- |
| `lynx` | default `mean` | 2/3 | 2/3 | 3/3 | 22, 22, 20 |
| `lynx` | `--min-segment 20` | 2/3 | 2/3 | 3/3 | 2, 4, 2 |
| `lynx` | `--ar1` | 0/3 | 0/3 | 0/3 | 0 |
| `lynx` | `meanvar --bootstrap` | 0/3 | 2/3 | 3/3 | 0, 1, 0 |
| `sunspot-year` | default `mean` | 3/3 | 3/3 | 3/3 | 45, 46, 45 |
| `sunspot-year` | `--min-segment 20` | 2/3 | 2/3 | 3/3 | 7 each |
| `sunspot-year` | `--ar1` | 0/3 | 0/3 | 0/3 | 0 |
| `sunspot-year` | `meanvar --bootstrap` | 0/3 | 0/3 | 3/3 | 1 each |

The zeros above were not free. On a cyclic series `--ar1` reports nothing, and that includes a step of two standard
deviations of the whole series: the AR(1) term absorbs the step into the noise, so 0 of 18 inserted steps were found.
The bootstrapped `meanvar` penalty is quiet and does find a 2 sd step, but misses 0.5 sd and (on sunspots) 1 sd.
The default model finds the step and buries it in 20 to 46 false ones. A longer minimum segment is the only setup
that both finds most steps and leaves a readable list, and it is still noisy (2 to 7 extra changes).
Practical reading: on a series with a visible cycle, use the bootstrapped `meanvar` for a large break and treat
`--ar1` as a false-alarm filter that cannot confirm a step. Caveats: two series, one step shape, three positions,
a tolerance of 3 points, so each cell is 3 trials; a step added to a real series is not a real step.

**`--ar1 joint` keeps a step that plain `--ar1` buries (2026-10-30, same script and test, one more setup).** The joint
fit prices persistence with the exact AR(1) likelihood instead of widening the noise scale, so a level shift is not
absorbed whole. On the same inserted steps, hits out of 3 positions (0.5 / 1 / 2 sd): `lynx` 1 / 1 / 3 with 0 to 1
other changes; `sunspot-year` 0 / 2 / 3 with 1 other each (the same single false step it reports with no inserted
step, so it is not caused by the insertion). Plain `--ar1` found 0 / 0 / 0 on both. So the earlier advice to treat
`--ar1` as a filter that cannot confirm a step holds for plain `--ar1` only: on a visible cycle, `--ar1 joint` finds
a 2 sd step as often as the bootstrapped `meanvar` (3/3 on both), finds a 1 sd step on 3 of 6 cells where the
bootstrap finds 2 of 6, and leaves at most one extra change. It still misses most 0.5 sd steps and has one false step
on sunspots. Same caveats: two series, one step shape, 3 trials per cell, a step added to a real series is not a real
step. Open: a joint fit with a second AR term (a cycle is closer to AR(2) than AR(1)), and a real series with a
documented step inside a cycle.

**The default output now says so (2026-10-30, later).** The earlier line "the default output does not warn about a cycle"
was half stale: on both series the existing range warning already fired (lag-1 rho 0.95) but only said the ranges were
too narrow. When the mean model has found 5 or more steps and rho is 0.3 or more, the warning now adds that many of the
steps may be false alarms, with the measured counts (lynx 23, sunspots 46 by default; `--ar1` none; `--ar1 joint` keeps
a 2 sd step). Test: `cyclic-series.test.mjs`. Not covered: `treering` (38 false steps) has rho 0.16 by this estimate, so
it gets no hint; a cycle detector that does not rely on rho is open.

## A warning that does not depend on lag-1 rho (2026-10-30)

The old autocorrelation warning needed rho >= 0.3, so the 7,980 tree rings (rho 0.16, 38 default steps, 11 with `--ar1`) got
none. `blockVarianceRatio` compares the spread of block means (blocks of n/20) with what independent noise of the series'
own difference-based sd gives. White noise: 95th percentile 1.6 at n >= 200, 2.5 at n = 48 (200 draws each, hand-run).
Real series: treering 6.0, Nile 6.5, US inflation 28.9, DAX returns 1.6, great discoveries 2.3, nhtemp 2.6.
When rho < 0.3, 5 or more steps and a ratio of 3 or more, `rangeWarning` says the steps may be slow drift or a cycle.
It fires on treering (38 steps) and US inflation (12); not on DAX (6 steps), Nile (1) or the others. Limits: a real step
raises the ratio too (Nile 6.5), so the text calls it a prompt to check dates, and the 5-step floor does the separating;
tested on these series only, not on a documented many-step series. Test: `quiet-series.test.mjs`.

## Is residual autocorrelation a cycle test that does not rely on rho? No (2026-10-30, later still)

The open item above asked for a cycle check that also catches `treering` (38 false steps, raw rho 0.16). The obvious
candidate is the lag-1 autocorrelation of the residuals after the default fit (each point minus its segment mean),
which does not depend on the differenced rho estimate. `eval/residual-rho.mjs` computes it for all 34 numeric series in
`data/` (output in `eval/residual-rho.out.txt`). It does not separate cycles from series with real, sticky structure:

| series | steps | residual rho | is it a false-alarm case? |
|---|---|---|---|
| `treering` | 38 | 0.22 | yes, no documented step |
| `lh` | 5 | 0.58 | yes |
| `lynx`, `sunspot-year` | 23, 46 | 0.71, 0.81 | yes |
| `us-inflation` | 12 | 0.64 | no, inflation is persistent and has real regimes |
| `us-gdp-growth` | 12 | 0.30 | partly (Great Moderation is a real break) |
| `johnson-johnson` | 12 | 0.93 | no, a growing quarterly series |
| `cac/dax/ftse/smi-returns` | 6 to 11 | -0.00 to 0.09 | mixed |

`treering` (0.22) sits below real-structure series (`us-inflation` 0.64, `puerto-rico-daily-deaths` 0.40) and above the
index returns, so no threshold on residual rho flags it without also flagging series where steps are right. No code
changed. A rho-free cycle detector stays open; a spectral peak test on the residuals is the next thing to try.

## A spectral peak test on the residuals of the steps (2026-10-30, last)

The previous section found that lag-1 rho of the residuals does not separate a cycle from steps. This tries the
untried alternative: Fisher's g (the largest periodogram ordinate over the sum, exact p-value) on the residuals
about the default model's segment means. `node eval/spectral-peak.mjs`, `node eval/spectral-null.mjs`, test
`spectral-peak.test.mjs`.

| series | default steps | g | p | peak period |
|---|---|---|---|---|
| sunspots (cycle) | 46 | 0.119 | 2e-6 | 11.1 years |
| lynx (cycle) | 23 | 0.134 | 0.02 | 9.5 years |
| treering | 38 | 0.003 | 0.04 | 7.0 (no known cycle) |
| lh | 5 | 0.155 | 0.49 | |
| US inflation | 12 | 0.063 | 0.15 | |
| Nile, Lake Huron, nhtemp, discoveries | 1 to 10 | | 0.37 to 0.73 | |
| US accidental deaths (monthly) | 3 | 0.506 | 1e-9 | 12 (months: the season) |

Calibration on 100 synthetic series per cell, p < 0.01: no cycle 3% (n=100) and 1% (n=300); two true 2 sd steps and
no cycle 2% and 1%; a sine of amplitude 1 (period 11, noise sd 1) found in 97% to 100% with or without steps; amplitude 0.5 in 28% (n=100) and 86% (n=300).

Reading: unlike rho it finds sunspots clearly (p 2e-6) and names the period, and steps do not trigger it. On
lynx it is weak (0.02: a 114-point series with 10 or so cycles has few frequencies near the peak) and on treering
it does not fire usefully (p 0.04 at a period of 7 with 38 steps; treering's false steps come from slow drift, not a cycle). So it
covers the cycle half of the "cycle check not tied to rho" item and not the drift half, which the block-variance
warning already covers. It is not wired into the output yet: with a seasonal monthly series it fires for the
season, which `--period` already handles, so a hint needs to be suppressed when a period is set. Wanted: a documented step inside
a real series with a known cycle, to check the test still lets the step through.

## The spectral peak test is wired into the output (2026-10-30, last)

`analyze` now returns `cycleWarning` (and the CLI prints it) when the default fit finds 5 or more steps in a series of
60 or more points, no `--period` is set, the model is not Poisson, and Fisher's g on the residuals about those steps has
p < 0.01 at a period of 3 points or more. It names the peak period and points at `--period`. Sunspots fire (p 2e-6, 11 years);
`lh` and the monthly deaths series with `--period 12` do not (tests in `spectral-peak.test.mjs`). Calibration is the
synthetic 1% to 3% above, so on a series with no cycle about 1 in 50 to 1 in 100 runs with 5+ steps would show it.
Lynx (p 0.02) and treering (drift, not a cycle) stay quiet. Still open: a documented step inside a real cycle, to check the warning
does not drown a true step; the warning is not shown on the page card.
