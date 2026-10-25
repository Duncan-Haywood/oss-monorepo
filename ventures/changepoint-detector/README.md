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
- **Growth-change range on clumpy counts widened to 95% (2026-10-26).** The NB-scored range covered the planted bend on 145 of 161 found bends (90%). The NB path now tempers the weights by 1.4 instead of 1.15 (`RANGE_TEMPER_NB`; Poisson keeps 1.15). Tuning seeds 2026, 7, 99 (`eval/growth-change-interval-nb.mjs 100 <seed> 0.35 nb`): 1.15 covered 145/161, 1.4 153/161 (95%), 1.7 157/161 (97.5%, wider ranges). Held-out seeds 3, 11, 500, run once at 1.4: 161 of 170 found bends (94.7%); the weakest cell is still bump 0.04 (38 of 44, 86%). Output in `eval/growth-change-interval-nb-temper.out.txt`. Ranges are about 15% wider than before. Open: a real series with a documented slope break.
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
| default (`--min-segment 5`) | 3 | 1983Q2 (sd 4.32 to 0.75) and 1984Q3 (0.75 to 1.97) | no: 1984Q3 "that point only" |
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
