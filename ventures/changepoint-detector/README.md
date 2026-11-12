# Changepoint Detector: find when a time series changed

A free, in-browser **changepoint detection** tool: paste or upload a time series
(sales, sign-ups, sensor readings, latency, prices) and see **when its level or
volatility changed**, with the exact best segmentation from **PELT** and a
probability for each change from **Bayesian online changepoint detection**.
Nothing is uploaded. Also a command-line tool and an engine AI agents can call.

**Live tool:** https://marisstella.app/changepoint-detector/

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
  of successive points) or in mean and variance (minimum segment 10 by default).
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
  machine-readable output, `--example` for the Nile data, `--help` for all options. With the level
  model (the default) the text output leads with the changes all six settings agree on, as the page
  does (`--no-agreed` to skip it). The panel runs on worker threads beside the main analysis and is
  skipped on its own above 10,000 points (see "Agreed changes on worker threads in the CLI").
- **Watch a metric** (2026-11-12): `node watch.mjs daily.csv --state watch-state.json` after each new row
  reports each new change once, after 5 points on its far side, and can post to a Slack, Discord, Teams or
  Mattermost webhook (`--webhook-env NAME`). `deploy/make-watch-repo.sh <folder>` makes a standalone
  repository with a daily GitHub Actions workflow, so anyone can run it in their own account; page:
  [watch-a-metric-for-changes.html](watch-a-metric-for-changes.html). How the defaults were chosen:
  "Watching a growing series" below. Since 2026-11-12 (later) the page replays the watch on the series
  you just analysed ("What a daily watch would have sent"), and agents call `replayWatch` in `watch-core.mjs`
  (README "Replaying the watch on your own history").
- **AI agents / MCP:** from a clone of the repository,
  `node platform/agents/tools.mjs call changepoint-detector analyze --input '{"values":[...]}'`
  (the watch replay: `call changepoint-detector replayWatch --module watch-core.mjs --args '[[...]]'`)
  or the `call_tool` tool of the repository's MCP server
  ([`platform/agents/`](../../platform/agents/README.md)).

## Verification

`node --test` (581 tests on 2026-11-12). What they check:

- **Against an independent PELT:** on 100 seeded cases (60-200 points, 0-3
  planted changes, mean and mean-and-variance models, several penalties) the
  changepoints equal those of the `ruptures` package's `Pelt` (v1.1.10, BSD-2),
  a separate implementation: 100 of 100 identical. The series and ruptures'
  answers are in `data/ruptures-crosscheck.json`; `data/make_ruptures_fixture.py`
  regenerates them. R's `changepoint` is still unchecked (CRAN was unreachable).

- **Against the literature:** on the Nile series (data/SOURCE.md) PELT puts
  the change at index 28, the first year of the new level being 1899: the
  same answer Cobb (1978) gives (R's `changepoint::cpt.mean(Nile)` is expected
  to agree but was not run here). Output of `node cli.mjs --example`
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
- **Steep-bend range, replicated (2026-11-08, `eval/growth-change-interval-nb-steep-only.mjs`, output `.out.txt`, no code change).** Four fresh seeds (9101-9104, 250 series each, bump 0.04 only, temper 1.4, nothing tuned): found 138 bends, range held the planted knot on 108 (78%; per seed 74, 89, 61, 88%). With the 79 earlier steep bends that is 173 of 217 (80%). So the shortfall is real, not seed noise, and the note under the range (about 82%) is slightly generous: 80% is the better figure. Still not retuned (a temper chosen on this one synthetic design would be fitting it); a real series with a documented steep slope break is still wanted. Only 14% of the series were scored as found (the bend must also be located within 20 points), so the 80% is conditional on a successful detection.
- **A real count series with a documented break: the UK seat-belt law (2026-10-26).** Monthly car drivers killed or seriously injured in Great Britain, 1969-1984 (`data/uk-driver-deaths.csv`, 192 months); the front-seat belt law took effect on 31 January 1983 (Harvey and Durbin 1986). `node eval/seatbelt-law.mjs` (output in `eval/seatbelt-law.out.txt`, test `seatbelt-law.test.mjs`). `--model poisson --period 12 --overdispersion nb` returns 8 changes, one of them 1983-01 (1600 to 1329 a month) with `range95` 1983-01 to 1983-02, which holds the first full month under the law; the other changes include the winter-1973 dip (1973-11, range 1973-10 to 1973-11, fuel rationing and the new speed limits that winter) and the 1974 rebound. Adding `--trend bends` gives the same date and range. Two things the series shows: plain `--model poisson --period 12` treats the clumpy counts as exact Poisson and returns 33 changes, so use `--overdispersion nb` on counts like these; and `--model mean --period 12` finds 1983-01 (range 1982-12 to 1983-02) but also a 2-month dip in 1981-12 and 1982-02 that the count model does not report. One series, one documented break, 0 of 1 misses: this shows the range is not absurd on real data, not that it is calibrated (the calibration is the seeded sets above). The date is one month before the law's first full month, as the January 1983 count is already low.
- **The same seat-belt series under the Gaussian models (2026-11-10).** `eval/seatbelt-law.mjs` now also runs `--model mean --period 12` four ways (test in `seatbelt-law.test.mjs`). All four hold 1983-02 in the 95% range. Plain and `--bootstrap` and `--ar1` date the change 1983-01 (range 1982-12 to 1983-02); `--log` dates it 1983-02, the first full month under the law, with range 1983-01 to 1983-02, the narrowest of the four. Change counts: 8 plain, 8 `--log`, 6 `--bootstrap`, 5 `--ar1`; `--ar1` and `--bootstrap` drop the 1981-12 / 1982-02 two-month dip that the plain model cuts (the NB count model never reported it). One series, one documented break: not a calibration, and `--log` dating to the month may be luck of a 1983-01 count already low.
- **A real ramp series: West German unemployment, 1962-1991 (2026-11-05).** Quarterly rate (`data/german-unemployment.csv`, 120 quarters, unadjusted and seasonally adjusted, from AER `GermanUnemployment`). It is near 1% to 1973, ramps through the 1974-75 recession to about 4.5%, then through the 1980-82 recession to about 9%, so there is no clean step to date. `--model mean` returns 24 changes on the adjusted column and 10 on the unadjusted one (it reads each ramp as a staircase). `--model mean --ar1` returns 2: 1974Q3 (1.05 to 4.33) and 1981Q4 (4.33 to 8.28) adjusted, 1974Q4 and 1981Q4 unadjusted. `--ar1` also drops the real 1966-67 recession bump (the default finds it as 1967Q1, 0.7 to 2.2), and `--period 4 --ar1` on the unadjusted column keeps only one change, 1981Q3, and loses 1974: giving the period costs the step. `--ar1 joint` returns 4 (1974Q4, 1981Q4, 1982Q4, 1989Q1). `--model trend` returns 12. Test `german-unemployment.test.mjs`. One series: the dates `--ar1` keeps sit on the two documented recessions, but the rate had been ramping for a year or more before them, so they mark the midpoint of a ramp, not an event; this adds a second real case of `--ar1` taming an over-cut, and the same price as in Gallup (a smaller real change goes).
- **A real inflation series with documented regime changes: Argentina, 1970-1989 (2026-11-05).** Quarterly log change of the CPI (`data/argentina-inflation.csv`, 79 quarters, from AER `ArgentinaCPI`). Two breaks are documented: the Austral Plan of 14 June 1985 and the 1989 hyperinflation. `--model mean` returns 10 changes, among them 1985Q3 (mean 0.661 to 0.165 a quarter, 9.5 noise sd) and 1989Q2 (0.278 to 1.16); `--model mean --ar1` returns 5 and keeps both (1985Q3: 0.539 to 0.254; 1989Q2). `--model meanvar` misses the plan's quarter: it puts the change at 1985Q2 as a 0.65 sd move (the quarter before the plan is a huge spike, so the variance term absorbs it), and `--model mean` without `--ar1` reports the series' rho of 0.57 and warns that its 10 steps are probably over-cut. Test `argentina-inflation.test.mjs`. One series, two documented breaks, 0 of 2 missed by the mean model; the other 8 default changes (1975Q3, 1976Q3, 1982Q3 ...) have no documentation behind them, so this says the dates are right on real data, not that the count is.
- **Shocks with a measured cause: Florida orange-juice prices, 1950-2000 (2026-11-05).** Monthly real price (`data/frozen-juice.csv`, 612 months, AER `FrozenJuice`) with `fdd`, Orlando freezing degree days, as ground truth: eight months have 19 or more (1958-01, 1963-01, 1970-01, 1977-02, 1981-02, 1984-01, 1985-02, 1990-01). Default `--model mean`: 148 changes, all 8 freezes found (within 2 months), but only 13 of the 148 sit near one. `--ar1`: 10 changes, 3 of 8 freezes (1958, 1963, 1977). `meanvar`: 32 changes, 5 of 8. So a setup that stops the over-cut loses most real shocks and one that keeps them over-cuts: item (4) of `next:` has a measured case now. `eval/frozen-juice.mjs`, test `frozen-juice.test.mjs`. Fdd is not a perfect truth (a freeze's price effect lags and depends on the crop), so read the 13 of 148 as a ceiling on precision, not a rate.
- **A real daily count series with a documented shock: Puerto Rico deaths and Hurricane Maria (2026-10-29).** All-cause deaths per day, 1,201 days from 2015-01-01 (`data/puerto-rico-daily-deaths.csv`, R's `dslabs::pr_death_counts`). Maria made landfall on 2017-09-20; the count was 106 that day against a 60-day mean of 78.5. `node eval/maria-deaths.mjs` (output `eval/maria-deaths.out.txt`, test `maria-deaths.test.mjs`). All five setups (`mean` and `poisson --overdispersion nb`, with no season, weekly 7 or yearly 365) put a change within a day of landfall, 78.8 to 82.1 per day before and 101.7 to 119.8 after, and the `range95` holds 2017-09-20 in all five (a single day in three of them). The cost is the same as for Ansett: 9 to 11 other changes, mostly the winter peak and the rebound (a drop to about 90 on 2017-10-08 or 10-29), which a three-year series cannot pin as a yearly cycle (a yearly period gave 10, not fewer). The detector reports the rebound as a second change rather than a burst. Two real events now hold, one closure and one shock.
- **A real monthly series with a documented rule change: Peace Bridge traffic and the 2009 passport requirement (2026-11-01).** Monthly vehicle traffic over the Buffalo-Fort Erie bridge, 156 months from 2003-01 (`data/peace-bridge.csv`, R's `Stat2Data::PeaceBridge2003`). The US required passports for land crossings from 2009-06-01, inside the 2008-09 recession. `node eval/peace-bridge.mjs` (output `eval/peace-bridge.out.txt`, test `peace-bridge.test.mjs`). The seasonal mean model (`--period 12`) puts a step down on exactly 2009-06 (498 to 466, `range95` 2009-05 to 2009-06), but it returns 14 changes, most of them 3 to 6 month swings (including a reversal 2009-09 back up to 503), so the passport step is found and is not distinguishable from the recession or the other wobbles. The seasonal count model (`poisson nb`) is worse on the date: its nearest change is 2008-12, and a wide `range95` (2009-02 to 2011-03) is what holds June 2009. Without a season both models chase the July-August peak (26 to 29 changes). One series and a confounded event: this shows the range can hold a documented date, not that the step is the rule's effect and not that this series is quiet elsewhere (it is not), so the open item "a closure series quiet outside the closure" stays open.
- **Two more smooth real series (2026-11-06).** Box-Jenkins sales in logs (`data/bjsales.csv`, 150 values, R's `datasets::BJsales`) and US census population 1790-1970 in logs (`data/uspop.csv`, 19 values). BJsales has no documented break: `--model trend` reports 12 changes, `--model mean` 25 (with the range warning), `--model mean --ar1 auto` 1 (at 90, a 1.5-sd shift), and `--noise-floor 1` changes nothing (12). So the over-cut of smooth drift is not special to austres, and an AR(1) error term is the one thing that tames it here. uspop is short and `--model trend` reports one change, at 1890, where the growth rate per decade falls from 0.29 to 0.14 in logs (95% range 1880 to 1910): a slowdown that is real in the census counts (recalled that the rate fell through the 19th century; no paper read), not a labelled test. The level model gives 8 and the AR(1) model 0. `node eval/smooth-pair.mjs` (output `eval/smooth-pair.out.txt`, test `smooth-pair.test.mjs`). Still wanted: a documented break inside a long smooth series.
- **A smooth real series with no break: Australian residents, quarterly 1971-1993 (2026-11-04).** 89 values in logs (`data/austres.csv`, R's `datasets::austres`). Nothing documented changed, yet `--model trend` reports 10 changes (and a cycle warning), a level-only model 43 (with the range warning), and `--model mean --ar1 auto` 9. A near-deterministic growth curve has almost no noise, so any bend clears the penalty: the tool over-cuts a smooth, low-noise series, and the warnings (cycle, range) are the only signal. A negative result, listed, not scored; no fix yet. `node eval/austres.mjs` (output `eval/austres.out.txt`, test `austres.test.mjs`). Wanted: a noise floor tied to the series' own scale.

  **First fix: `--noise-floor k` (2026-11-04, off by default).** sigma is at least `k` times the median absolute step between neighbours, so a steady drift per step sets a floor even when the scatter of the differences is tiny; white noise has median |step| of about 0.95 sigma, so `k` below 1 never binds on a flat noisy series. On austres `--model trend` goes 10 changes (k=0), 4 (0.5), 3 (1), 1 (2); `--model mean --ar1 auto` 9, 3, 2, 1; the level-only model still reports a staircase (22 at k=1), as it must on a growing series. Cost: on 200 synthetic series with one 1.5-sd step the step is found 160 times with or without the floor (k=1), but the floor bound on 15 and changed the answer there. k is a knob, not a calibrated default: no k is justified yet by a documented real break in a drifting series. **Real series (2026-11-04):** `node eval/noise-floor-real.mjs` (output `eval/noise-floor-real.out.txt`, test `noise-floor-real.test.mjs`) runs k = 0, 0.5, 1, 2 on six committed real series (Nile, Lake Huron, Peace Bridge with a 12-month season, airmiles in logs, UK gas in logs, New Haven temperature). k up to 1 changes no answer on any of them, so k=1 costs nothing on these; k=2 does: Peace Bridge goes 14 changes to 4 and loses the documented 2009-06 change, New Haven's 1944 step vanishes, Lake Huron goes 10 to 5. So k=1 is the largest value tried that is safe here; none of the six is a drifting series with a documented break, so that is still the missing evidence for a default. `node eval/noise-floor.mjs` (output `eval/noise-floor.out.txt`, test `noise-floor.test.mjs`). **A drifting real series (2026-11-04, negative result):** `data/us-real-gdp.csv` is log US real GDP, 1950Q1 to 2000Q4 (204 quarters, R's `AER::USMacroG`, source in `data/SOURCE.md`); the documented break is the early-1970s productivity slowdown (recalled, no paper read, so a plausibility check, not a labelled test). `node eval/noise-floor-gdp.mjs` (output `eval/noise-floor-gdp.out.txt`, test `noise-floor-gdp.test.mjs`): `--model mean` returns 60, 40 and 26 changes at k = 0, 1, 2 (a staircase, as expected on growth); `--model trend` returns 20, 14 and 7. Only k=2 gets near a short list, and then 1974Q4 is the nearest to the slowdown but sits among six other cuts at business-cycle dates (1953Q4, 1957Q4, 1965Q3, 1978Q4, 1983Q3, 1990Q4). So no k in {0, 1, 2} isolates the documented break here, and k=2 already costs documented breaks on the real series above: the evidence for a calibrated default is still missing, and this series says the knob alone is not enough on a cyclical drift. **Differencing instead (2026-11-04):** `node eval/gdp-growth.mjs` (output `eval/gdp-growth.out.txt`, test `gdp-growth.test.mjs`) runs the level models on annualised quarterly growth, no k. `--model mean` gives 10 changes (1950Q4, 1953Q3, 1954Q2, 1957Q4, 1958Q2, 1973Q3, 1975Q2, 1979Q1, 1983Q1, 1984Q3): the 1973Q3 cut lines up with the slowdown, among business-cycle cuts; with `--ar1 auto` it reports none; `--model meanvar` reports exactly one, 1984Q3, the Great Moderation (recalled date, not a paper read). So on a drifting series differencing first beats any k tried above, and the volatility break is the cleaner finding. The slowdown itself is not isolated by a mean shift alone. Not tried: a robust trend fit under the steps. **A k between 1 and 2 (2026-11-09, negative result):** `node eval/noise-floor-between.mjs` (output `eval/noise-floor-between.out.txt`, test `noise-floor-between.test.mjs`) runs k = 1, 1.25, 1.5, 1.75, 2 on the six real series and on log GDP (trend). The documented Peace Bridge 2009-06 change is already gone at k=1.25 (14 changes at k=1, 10 at 1.25, 6 at 1.5), New Haven's 1944 step survives to k=1.5 and goes at 1.75, and GDP goes 14, 12, 9, 9, 7 cuts without ever isolating the slowdown (1973Q1 and 1975Q1 stay among six or more business-cycle cuts until k=2, where only 1974Q4 remains, among six others). Nile, airmiles and UK gas do not move. So k=1 is still the largest value that costs no documented break, and nothing between 1 and 2 buys the missing evidence for a default; the knob stays off by default.
- **`--noise-floor` on a synthetic drifting series with one known step (2026-11-09, `node eval/noise-floor-drift-sim.mjs`, output `eval/noise-floor-drift-sim.out.txt`, test `noise-floor-drift-sim.test.mjs`).** 60 seeded series of 120 points: drift 0.2 per step, AR(1) noise (phi 0.5), one step at t=60 of 4 noise sd; `--model trend`. The real-series trials could only show what k costs; this shows what it buys, where the truth is known. With noise sd 1 the floor barely binds at k=1 (3.4 other cuts against 3.7 at k=0) but k=1.5 leaves 0.80 and k=2 0.25, the step found 59/60 to 60/60. With noise sd 0.3 (step 1.2): other cuts 3.62, 2.07, 0.27, 0.02 for k = 0, 1, 1.5, 2, step found 59 to 60 of 60. With noise sd 0.1 (step 0.4, twice the drift) k=1 is perfect (1.00 cut, 0 false) but k=1.5 finds the step in 23/60 and k=2 in 0/60. So the floor's price is a step no bigger than a couple of drift-steps, which is the same cost the real series showed (Peace Bridge 2009-06 gone above k=1), and k between 1 and 1.5 is the useful range when drift dominates the scatter. Caveat: the over-cutting at k=0 is mostly the AR(1) noise the trend model ignores; `--ar1 auto` is the other remedy and is not compared here. Synthetic only; the knob stays off by default.
- **`--ar1` against `--noise-floor` on the same synthetic drift (2026-11-09, `node eval/noise-floor-ar1-sim.mjs`, output `eval/noise-floor-ar1-sim.out.txt`, test `noise-floor-ar1-sim.test.mjs`).** The caveat above, answered: same 60 seeded series per noise level, with `--model mean --trend --ar1` (ar1 is a mean-model option, reached through `--trend`; `--model trend --ar1` is refused). `--ar1` cuts the other cuts from 3.6 to 0.4-0.5 per series at all three noise levels, better than k=1 (2.1 to 3.4) and about as good as k=1.5 where that works (0.27 at sd 0.3), but it pays in the step: found in 36/60 (sd 1), 42/60 (sd 0.3) and 39/60 (sd 0.1) series, against 59-60/60 for k=1.5 at sd 1 and 0.3. The step of 4 noise sd is divided by the long-run sd (about 1.7x at phi 0.5), so a 4-sd step looks like 2.3. Adding k to it changes nothing at k=1 and costs more steps at k=1.5 (26/60 at sd 1). So with AR(1) noise known to be present, k between 1 and 1.5 finds the step far more often than `--ar1`; `--ar1` is the safer choice only when missing a step is cheaper than a false cut. Synthetic only, phi fixed at 0.5; not run: `--ar1 joint` (exact AR(1) likelihood), other phi, and why k=1 leaves the `--ar1` arm unchanged (not investigated).
- **`--ar1 joint` on the same synthetic drift, at three phi (2026-11-09, `node eval/noise-floor-ar1-joint-sim.mjs`, output `eval/noise-floor-ar1-joint-sim.out.txt`, test `noise-floor-ar1-joint-sim.test.mjs`).** The arm the entry above did not run: 60 seeded series of 120 points per cell, drift 0.2, one step of 4 noise sd, phi 0.2, 0.5, 0.8, noise sd 1 and 0.3. Plain `--ar1` loses the step as phi rises (found 57/60, 39/60, 27/60 at sd 1) because it divides the step by the long-run sd; `--ar1 joint` finds it 60/60, 51/60 and 60/60 with 1.4, 1.0 and 0.45 other cuts per series. The floor at k=1.5 is best at low phi (60/60, 0.05 other cuts at phi 0.2) but at phi 0.8 leaves 3.15 other cuts (1.10 at sd 0.3) and still misses the step in a few series, while the unfloored trend model leaves 5.9 to 6.6. So when autocorrelation is strong, `--ar1 joint` is the better remedy; when it is weak, k near 1.5 is. Synthetic only, one drift and one step size; phi is not estimated from the data here, so choosing between them on a real series still needs a real drifting series with a documented break. The knob stays off by default.
- **Slope breaks on the differences (`slope-breaks.mjs`, 2026-11-04; CLI `--slope-breaks [n]` and the engine option `slopeBreaks` landed 2026-11-04, tested in `slope-breaks-cli.test.mjs`; not yet on the page).** The wanted model for a growth slowdown. A least-squares kinked line on the levels of log US real GDP puts its best single knot at 1971Q2 (the recalled slowdown), but its gain is 140 against a BIC bar of 10.6, and it would be that large for any kink: the residuals of a drifting series sit near a unit root, so a level fit cannot test a bend. So the test runs on the differences, where a slope change is a mean shift: a sup-Wald over splits with 15% trimmed at each end, the noise widened by (1+rho)/(1-rho) for serial correlation, binary segmentation for more breaks. The bar, 11, is the 95th percentile of the largest W on seeded null series (`node eval/slope-calibrate.mjs`, `.out.txt`: 8.6 to 12.0 across n = 100, 200, 400 and rho = 0, 0.3, 0.5; 11 holds in all but the smallest, most correlated cell, so it is a bar for n >= 200 or white-ish noise). **Result on GDP (`node eval/slope-breaks.mjs`): no slope break clears the bar.** Growth is 3.90% a year before 1971Q2 and 3.14% after, but at quarterly growth sd of about 4 points a year that is not distinguishable from the cycle in 204 quarters. So the date is recoverable and the significance is not: report it as a candidate, not a finding. Power on synthetic series with AR(1) 0.3 noise, 200 seeds: growth 1.0 to 0.6 per step at n=150 is reported 47 times (17 within 10 points of the truth), 1.0 to 0.2 164 times (121), n=204 1.0 to 0.1 191 (153). A weak test by construction. Ten real series (`node eval/slope-real.mjs`, 2026-11-04): none is reported. The largest W is 6.5 (airmiles, annual, n=24, below the bar's n >= 100 range); every series with n >= 100 sits at W 0.1 to 3.8 or less. The seasonal ones (UK gas, Johnson & Johnson, airline passengers) are noise in the differences, since the test does not remove a season. So the missing piece is still a deseasonalised real series, n >= 200, with a documented large slope change, as a positive control. Positive control run (`node eval/slope-productivity.mjs`, 2026-11-04, `data/us-labor-productivity.csv`: US nonfarm business labour productivity, FRED `OPHNFB`, seasonally adjusted, n=318): the best split is 1973Q1 in all three windows (to 2026Q2, 2000Q4, 1990Q4), the documented slowdown quarter, growth 2.82 to 1.79 % a year, but W is 5.8, 5.1 and 6.5 against the bar of 11, so it is not reported. The date is recovered on real data; significance is not, even for a break that large, because quarterly productivity growth is noisy. Not done: the page box, a break search that uses the level fit's date with this test's significance together, a positive control that clears the bar (annual averages tried, below). **Annual means (2026-11-04, negative result).** `node eval/slope-productivity-annual.mjs` (output `.out.txt`, test `slope-productivity-annual.test.mjs`) averages the quarterly log series to 79 full years: the best split is 1973 in every window, growth 2.75 to 1.81 % a year (to 1990: 2.75 to 1.38), and W is 6.5 (all years), 7.6 (to 2000) and 9.9 (to 1990), none above 11. Averaging did not buy the power. And the bar is not valid at that length: `node eval/slope-calibrate-short.mjs` (`.out.txt`) puts the null 95th percentile of W at 9.1 to 9.5 for white noise but 11.6 to 19.2 at rho 0.3 to 0.5 for n = 44 to 79, so a correlated annual series needs a bar well above 11. The honest reading is unchanged: the date is recovered, the significance is not. Open now: (bar by n and rho: done, next entry) and a longer or less noisy documented break. **A bar by n and rho (2026-11-04).** `barFor(n, rho)` in `slope-breaks.mjs` interpolates the null 95th percentile of the largest W from a grid (`node eval/slope-bar-table.mjs 3000`, `.out.txt`: n = 30 to 400, rho = 0 to 0.6): 9.2 / 12.1 / 15.6 / 21.6 at n = 30 and rho 0 / .2 / .4 / .6, 8.2 / 9.8 / 10.8 / 12.4 at n = 100, 8.5 / 9.1 / 9.2 / 9.7 at n = 400. `slopeBreaks(x, { critical: 'auto' })` uses it with the lag-1 autocorrelation of the differences; the default is still 11. Checked on fresh null series (`node eval/slope-bar-check.mjs`, 1000 per cell, seeds not the table's, tested): the fixed bar of 11 reports a break on 13.5% of rho 0.5, n = 36 series and 10.4% at n = 50; the auto bar is 7.0% and 6.3%. Across 20 cells the auto bar's false-report rate is 3.8% to 7.0% (target 5%): a little high at n = 50 to 120 because rho is estimated from the same series, a little low at n = 300. Read it as a better bar, not an exact one. Not done: the page box, a positive control that clears it. **Productivity against the auto bar (2026-11-04, negative result).** `node eval/slope-productivity-auto.mjs` (`.out.txt`, test `slope-productivity-auto.test.mjs`): quarterly (n=318, rho -0.07) W 5.8 against an auto bar of 8.5, p 0.166; annual means (n=79, rho 0.13) W 6.5 against 9.6, p 0.136. Both date the break at 1973 and neither is reported, so the bar by n and rho does not rescue the test here; the earlier p values (0.171, 0.154) differ in the third place because this run estimates rho from the series' own differences.
  **Monte Carlo p-value (2026-11-04, `slopeBreakPValue`, `node eval/slope-pvalue.mjs`, test `slope-pvalue.test.mjs`).** Alongside the `auto` bar: simulates seeded AR(1) nulls at the series' own n and rho and returns p. Size on 300 nulls per cell: 4 to 5.3% at n=79 and 200, 7.7% at n=44 (rho .5). US productivity: quarterly p 0.171, annual means p 0.154, so still not significant.
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
  `watch.mjs` is the lasting-change alert, run in the user's own account (see "Watching a growing series").


**Page (2026-10-21).** The web page now has a "Known holidays" box (comma-separated dates or row numbers, counts model) that passes `holidays` to the engine. Checked on 200 seeded daily counts with every 17th day at 0.3x: 6 changes without the list, 0 with it (factor 0.304).

## Holidays of different kinds

`--holidays` entries may be written `label=kind` (`2026-12-25=closed,2026-11-27=sale`). Each kind gets its own fitted factor, reported under `holidays.kinds`; each kind needs at least 2 rows. Checked on 240 seeded daily counts (rate 40) with a 0.3x closed day every 17th row and a 1.8x sale day every 23rd: engine test `a factor per kind recovers two different dips` (closed within 0.1 of 0.3, sale within 0.3 of 1.8). Not measured against real holiday data.

## Holidays held out of the seasonal fit

With `--period`, the holidays are now left out of the seasonal factors (they no longer count toward their phase), so a holiday that always falls on one weekday does not drag that weekday's factor down and bias the holiday factor toward 1. `node eval/holiday-heldout.mjs` runs the check: 40 seeded 224-day series, weekly pattern, a 0.3x holiday every 28th day (always the busiest weekday). Mean fitted holiday factor 0.355 before, 0.311 after (true 0.300); mean absolute error 0.055 -> 0.020; changes per series 0.03 both ways. Synthetic data only; the seasonal PELT pass still sees the holiday dips as unexplained (only the factors skip them).

## Holidays and the seasonal PELT pass

The seasonal PELT pass now sees the fitted holiday exposure: with `--period` and `--holidays`, the engine alternates (seasonal factors with the holidays as an exposure, then the holidays refitted on the new factors) for two extra rounds. `node eval/holiday-alternate.mjs` runs the check on 40 seeded 224-day weekly series (every 28th day a 0.3x holiday on the busiest weekday; half the series carry a 1.5x step at 120): planted step found 20/20 both ways, no extra changes either way, holiday factor error 0.022 -> 0.021, largest seasonal-factor error 0.052 -> 0.045. A small gain on synthetic data, not measured on real holiday series; the previous behaviour is behind the engine option `noHolidayAlternation`.

## The Great Moderation again, on a monthly series (2026-11-08)

A second, independent check of the volatility model: annualised monthly growth of US industrial production, 1947-02 to 2004-12 (`data/us-ip-growth.csv`, 695 months, AER `USMacroSWM`). The documented break is the fall in volatility around 1984 (McConnell and Perez-Quiros 2000). `node eval/ip-growth.mjs` (output `eval/ip-growth.out.txt`, test `ip-growth.test.mjs`):

| setting | changes | near 1984 |
|---|---|---|
| `--model meanvar` | 7 | 1984-02 (range 1984-02 to 1984-08), among six cuts at recessions (1974-08, 1975-06, 1979-01, 1982-03, 1983-01) |
| `--model meanvar --dispersion` | 2 | 1984-02, `range95` 1983-10 to 1984-09 (sd 10.7 to 6.0); the other cut is 1961-01 (sd 18.5 to 10.7) |
| `--model meanvar --robust --min-segment 24` | 5 | none: 1980-03, 1983-03 and 2000-06 instead |

So `--dispersion` isolates the break on a monthly series as it did on quarterly GDP growth (where only `--min-segment` mattered), and the plain model reads each recession's swing as a regime. One series, one recalled date, 1 of 3 settings clean: a replication of the earlier finding, not a calibration. Caveats the tool itself prints: the residuals keep clustered volatility and autocorrelation (lag 1: 0.31), and a 9.65-month periodic component shows with the plain model. The 1961-01 cut is a fall in sd from the 1950s' swings, not a documented break.

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

## Holidays on a second real daily series: a bike-share system (2026-11-02)

The test the section above asked for: real daily counts with a real holiday flag. `data/bike-sharing-daily.csv` is Capital Bikeshare (Washington DC) rentals per day, 731 days, with the dataset's own 21 holidays. `node eval/holiday-bikes.mjs` (output `eval/holiday-bikes.out.txt`, test `holiday-bikes.test.mjs`) runs `--model poisson --period 7 --overdispersion nb`.

| series | holiday / weekday median | changes, no list | changes, with list | holiday factor |
|---|---|---|---|---|
| registered riders | 0.66 | 56 | 61 | 0.877 |
| casual riders | 1.41 | 70 | 77 | 1.796 |

Another negative result. The holiday effect is real (commuters stay home, so registered riders fall by a third; leisure riders rise by 41%), but the list does not remove changes: it adds five and seven. The fitted factor is also well short of the raw ratio (0.877 against 0.66), because most of these holidays are Mondays and the weekly factor for Monday already absorbs part of the dip. The series is dominated by weather and season over two years (a yearly cycle with a period of 7 does not model it), so most of the 56 to 77 changes are the seasonal swing, which the holiday factor cannot touch. Not tried: a period-365 term, a temperature covariate, or fitting the holidays only inside a stable stretch. So the feature still has no real series where it earns its place; it works on synthetic data and on none of the two real ones tried. Do not read the factor as a holiday effect size on series with a strong yearly swing.

## Holidays inside 12-week stretches of the bike-share series (2026-11-04)

The last "not tried" item above: fit the holiday factor only inside short windows, so the yearly swing is mostly out of the fit. `node eval/holiday-bikes-windows.mjs` (output `eval/holiday-bikes-windows.out.txt`) cuts the 731 days into 84-day windows, keeps the 7 with at least two of the dataset's holidays, and runs `--model poisson --period 7 --overdispersion nb` with and without the list.

| series | windows | changes, no list | changes, with list | fitted factors |
|---|---|---|---|---|
| registered | 7 | 55 | 60 | 0.83 to 1.21 (median 0.92) |
| casual | 7 | 52 | 58 | 0.84 to 2.71 (median 1.75) |

Negative again. Short windows do not make the list remove changes: it adds five (registered) and six (casual) over the seven windows, and fits are two to four holidays each, so they scatter (the registered factor even goes above 1 once). Holiday dips on this series are real in the pooled data but too few per window to estimate. The feature still has no real series where it earns its place; wanted is a shop's or office's daily counts with many closed days. One dataset, made-up window length (84 days, not tuned).

## A yearly (period 365) term on the bike-share days (2026-11-05, negative result)

The remaining "not tried" item for the bike-share series. `node eval/holiday-bikes-yearly.mjs` (output `eval/holiday-bikes-yearly.out.txt`, test `holiday-bikes-yearly.test.mjs`) runs `--model poisson --overdispersion nb` with `--period 365` instead of 7, with and without the dataset's 21 holidays.

| series | period | changes, no list | changes, with list | holiday factor |
|---|---|---|---|---|
| registered | 7 | 56 | 61 | 0.877 |
| registered | 365 | 134 | 125 | 0.894 |
| casual | 7 | 70 | 77 | 1.796 |
| casual | 365 | 129 | 120 | 1.032 |

A period of 365 more than doubles the changes (134 and 129): two years give each day-of-year factor only two observations, so the fit follows noise and PELT cuts around it. With that term the list does remove changes (nine in each series), but only because a factor fitted on two points per day-of-year already absorbs part of a holiday; the casual factor falls to 1.03 against the raw ratio of 1.41. Read it as: a yearly term needs more than two cycles, and the holiday list is still not shown to earn its place on this series. Wanted: a daily series of five or more years with a mild yearly swing and deep holiday dips (US births, 11 years, is the one so far, below).

## Holidays on real daily births: the first real series where the list helps (2026-11-04)

The wanted series was a daily count with deep holiday dips and a mild yearly swing. US births are one: scheduled deliveries and inductions fall on federal holidays, so those days run about 15% under others (mean 8,516 against 10,067 on the other days, 66 holiday days of 4,018). `data/us-births-daily.csv` is CDC daily birth counts, 1978-1988, from the copy in the Python Data Science Handbook repository (see `data/SOURCE.md`). The holiday column is six federal holidays computed by rule (New Year, Memorial Day, July 4, Labor Day, Thanksgiving, Christmas), not taken from the file. `node eval/holiday-births.mjs` (output `eval/holiday-births.out.txt`, test `holiday-births.test.mjs`) runs `--model poisson --period 7 --overdispersion nb` year by year and on all 11 years.

| scope | changes, no list | changes, with list | fitted factor |
|---|---|---|---|
| 11 single years | 239 | 205 | 0.84 to 0.92 |
| 1978-1988 at once | 199 | 164 | 0.875 |

The list removed changes in ten years of eleven and left the eleventh (1987) unchanged; it never added any. This is the opposite of the two bikeshare runs above, where it added changes. Read it with care: there is no ground truth for births, so fewer changes is only evidence that some of the 17 to 22 per year were holiday dips, not that the remainder are real. Most of what remains is the late-summer peak. The fitted factor (0.875) again sits above the raw ratio (0.846) because the weekly term absorbs part of the dip. One dataset, one country, a rule-based holiday list.

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

### Pruning meanvar cuts with a segment-wise GARCH likelihood: fewer extra cuts, GARCH false alarms only partly (2026-11-02, measured, not shipped)

The joint likelihood named above, in its cheapest form. `eval/meanvar-garch-segments.mjs` (output
`eval/meanvar-garch-segments.out.txt`, 100 series per cell, same seeds and noise kinds as the filter run) takes the plain
meanvar PELT cuts as candidates. Every segment gets its own mean and scale, and inside a segment the standardised residual
follows a unit-variance GARCH(1,1) whose a and b are shared by all segments (small grid). The cut whose removal costs least
quasi-log-likelihood is dropped while that cost is under `pen x ln n`. Plain, then pruned: null series with any change / sd
1 to 2 break found exactly once / mean +1.5 sd shift found exactly once.

| n, noise | plain | pruned, pen 12 | pruned, pen 16 |
|---|---|---|---|
| 100, GARCH | 41% / 63% / 63% | 21% / 86% / 82% | 5% / 58% / 36% |
| 100, t3 | 37% / 58% / 48% | 12% / 88% / 90% | 4% / 62% / 31% |
| 200, GARCH | 50% / 58% / 52% | 48% / 97% / 100% | 28% / 97% / 100% |
| 200, t3 | 63% / 55% / 34% | 56% / 99% / 100% | 40% / 99% / 100% |
| 200, Gaussian | 0% / 97% / 96% | 0% / 100% / 100% | 0% / 100% / 100% |

Unlike the filter, the real sd break survives (97% to 100% at n = 200), and the clusters of extra cuts that made "exactly one"
rates low go away. But the false-alarm rate on a null GARCH series barely moves at n = 200 with pen 12 (50% to 48%) and needs
pen 16 to reach 28%, while at n = 100 pen 16 already costs the true breaks (mean shift 82% to 36%). So the penalty would have
to depend on n and the result is still far from the filter's 1%. A single surviving cut is usually a volatility cluster that
a segment-own scale explains better than any shared (a, b). Not wired into `analyze`; next is a joint fit where the cut
candidates are searched, not only pruned. Simulated noise only; the penalty was swept on the same seeds it is reported on.

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

## A staircase of real steps: the block-variance warning cannot tell it from drift (2026-10-30, last)

The block-variance section said the warning was "tested on these series only, not on a documented many-step series".
The repository has no documented series with 5 or more real steps, so this uses seeded synthetic ones where every step
is real: 5, 8 or 12 level changes of 2 or 3 noise sd between segments of 40 points, rising or alternating, 20 seeds each
(`node eval/staircase-warning.mjs`, output `eval/staircase-warning.out.txt`, test `staircase-warning.test.mjs`).

| true steps | warning fired (jump 2 and 3 sd, both shapes) | mean steps found |
|---|---|---|
| 5 | 19 of 20 | 5.0 to 5.2 |
| 8 | 20 of 20 | 8.1 |
| 12 | 20 of 20 | 12.0 to 12.1 |

So on a series made only of real steps the warning fires 95% to 100% of the time, as it does on treering's false ones: the
5-step floor does not separate them, and the text's "a real step raises this ratio too" is a limit, not a nuance. A
residual check does not rescue it (`node eval/staircase-residual.mjs`): the ratio of the residuals about the fitted steps is
0.6 to 0.7 (median) on the staircases, but 1.3 on treering, 0.8 on US inflation and 1.2 on DAX returns, because 38 steps
fit treering's drift just as well as 12 fit a staircase. No code changed. What would separate them is data: a real series with a
documented run of 5 or more steps and a quiet baseline.

## AR(2) by iterated prewhitening does not work (2026-10-30, last)

The open item "a joint fit with an AR(2) term" was tried the cheap way first (`node eval/ar2-prewhiten.mjs`, output
`eval/ar2-prewhiten.out.txt`, no engine change): whiten the series with AR(1) or AR(2) coefficients (Yule-Walker on the residuals
about the fitted steps, three passes, seeded with the robust rho as `ar1JointFit` is), then run mean PELT on the whitened series.

| series | AR(1) prewhitened | AR(2) prewhitened | `--ar1` (exact likelihood) |
|---|---|---|---|
| lynx, false steps | 21 | 22 | 0 |
| sunspots, false steps | 34 | 16 | 0 |

Starting with no whitening is worse (19 and 51: the first pass cuts the cycle into steps, whose residuals look white, so the
coefficients fall to about 0). Even seeded, the coefficients drift (sunspots AR(2): 1.07, -0.48) and many steps remain. A check that a
1 or 2 sd step inserted at six positions is found with 3 or fewer steps reported found 0 of 6 in every cell, so there is no power to
protect either. Plain prewhitening is not the route; an AR(2) fit would need the exact two-lag likelihood inside PELT
(as `ar1mean` does for one lag) with coefficients profiled on a grid. Not built. Real data only; no inserted-step claim beyond the table.

## An exact AR(2) likelihood inside PELT: no better than AR(1) (2026-10-30, later still)

Open item from the flagship list: the iterated-prewhitening fit failed on sunspots, so score segment means under an exact
AR(2) likelihood instead. `ar2mean` (cost, known phi1 and phi2, stationary start, closed form per segment from prefix sums) and
`ar2ProfileFit` (grid over phi1 0 to 1.8 and phi2 -0.9 to 0.2 in steps of 0.1, a PELT fit and innovation sd per pair, best
`n log sd^2 + log(k0 k1) + penalty` wins) are in `engine.mjs`; `eval/ar2-profile.mjs` and `.out.txt` hold the run. Not wired into
the CLI or the page, because it did not win:

| series | AR(1) profile | AR(2) profile |
|---|---|---|
| lynx (no documented step) | 0 | 9 (phi 1.5, -0.9) |
| sunspots, yearly | 1 | 3 |
| lynx, log10 | 0 | 0 |
| sunspots, sqrt | 1 | 1 |
| 40 synthetic AR(2) nulls (1.4, -0.7), n 200 | 0.00 changes each | 0.38 changes each |
| same with a 2 sd step at 100 (found within 5) | 39/40 | 40/40 |

Reading: on raw skewed counts the AR(2) fit runs to the edge of the grid (phi2 -0.9, close to a unit root) and the extra freedom
buys false alarms; once the series is transformed to near-Gaussian it matches AR(1) and costs about seven times the time
(sunspots, 289 points: grid of 190 fits). Its one gain, 40/40 against 39/40 on a 2 sd step, is within noise of 40 runs. So for
cycles the AR(1) profile (`--ar1`) stays the better default, and the transform matters more than the lag order. Open still:
sunspots with a hand-set small phi2 range, and a real documented step inside a cycle.
`ar2-profile.test.mjs` has two tests (a shift in AR(2) noise; log lynx gets none).

## `--bootstrap` on 33 real series (2026-10-31)

The `--bootstrap` section above was synthetic only. `eval/real-bootstrap-sweep.mjs` (output `eval/real-bootstrap-sweep.out.txt`) runs `meanvar` plain and with `--bootstrap` on every real series in `data/` (default settings, no labels): 33 series, bootstrap returns fewer changes on 22, more on none; Series with no documented break lose theirs: `lh` 1 to 0, `sunspot-year` 5 to 0, `great-discoveries` 3 to 0, `uk-gas` 3 to 1, `smi-returns` 7 to 1, `puerto-rico-daily-deaths` 8 to 2. It also keeps a documented one on `uk-driver-deaths` (3 kept, the 1983 seat-belt step among them) and `nile` (1 kept). Cost: `us-accidental-deaths` loses its one cut, the 1973-12 step the flagship notes call real. Without labels this is a count, not a false-alarm or detection rate: it shows the penalty is large on real, clustered series, not that the removed cuts were all false. Test: `real-bootstrap-sweep.test.mjs`.

## `--bootstrap` on US accidental deaths: the lost 1973-12 step was a missing season (2026-11-01)

The sweep above reported that `--bootstrap` drops the 1973-12 step on US accidental deaths. That run had no `--period`, so the series was read with its winter peaks in it, and plain `meanvar` already found only 1973-11 (not the 1973-12 fall). `eval/us-accidental-deaths-bootstrap.mjs` (output `.out.txt`, `us-accidental-deaths-bootstrap.test.mjs`) runs both ways. With `--period 12`, `meanvar` finds 1973-12, 1975-07 and 1978-03; with `--bootstrap` it keeps 1973-12 and drops the other two. `mean` with the season gives the same four changes with and without `--bootstrap`. Without the season, `meanvar --bootstrap` returns none. So the earlier caveat is a seasonal artefact, not a power loss on a real step. One series, 72 months, and the 1973-12 date is a coincidence with the oil embargo, not a labelled truth. The sweep itself is unchanged (it still runs without a season).

## A real interest-rate series: the 1973 fall and the 1980 rise (2026-11-02)

`data/us-real-interest.csv` is the US ex-post real rate (T-bill minus CPI inflation), 1959Q2 to 2009Q3, 202 quarters (source in `data/SOURCE.md`). The shifts in the literature (Garcia and Perron 1996, cited from memory, paper unread) are a fall near 1973Q3 and a rise near 1980Q3. `eval/us-real-interest.mjs` (output in `eval/us-real-interest.out.txt`, `us-real-interest.test.mjs`, 3 tests), `mean` model:

- **Defaults:** 9 changes. 1973Q3 (1.31 to -3.46, `range95` 1973Q1 to 1973Q3) and 1980Q4 (-1.12 to 5.45, `range95` 1980Q4 only), then 1986Q2 (5.45 to 2.10) and a run of one- and two-quarter segments from 2002 on.
- **Dated one quarter after the literature, a convention gap (checked 2026-11-02):** the 1980 rise lands on 1980Q4, the first quarter of the new regime. `eval/us-real-interest-1980-date.mjs` (output `.out.txt`) splits 1973Q4 to 1985Q4 once, after 1980Q2, Q3 or Q4: SSE 186.2, **166.8**, 182.9. The best break falls after 1980Q3, so 1980Q3 (0.30, near the old mean of -1.51, far from the new 5.19) is the last old-regime quarter, and a source that dates a break by the last quarter of the old regime would write 1980Q3 for the same break. The one-quarter `range95` is then not too narrow. What I did not check: which convention Garcia and Perron use (paper unread). The detector's labels are always the first quarter of the new regime.
- **`--ar1`:** the same 9 changes, with a wider range for 1975Q1. **`--bootstrap`:** 8, dropping the 1975Q1 step (the 1973 step now runs 1.37 to -1.52).
- **Artefact:** 2007Q4, 2008Q3 and 2009Q1 are single-quarter swings of the financial crisis (T-bill collapse against a deflation quarter), cut as their own segments, the same failure as the 2008 quarter in US inflation. A mean-shift model has no way to call them outliers.

## Five real series that had no test: Australian arrivals and UK lung deaths (2026-11-02)

`au-arrivals-japan`, `au-arrivals-us` (quarterly, 127 quarters) and `uk-ldeaths`, `uk-mdeaths`, `uk-fdeaths`
(monthly, 72) were in `data/` but only used by a drift-warning script. `arrivals-lungdeaths.test.mjs` now pins what
the detector does on them (run 2026-11-02, `--period 4` or `12`, no tuning):

| Series | Setup | Cuts | Documented event |
|---|---|---|---|
| Arrivals from Japan | seasonal mean | 12, including 2003Q2 | SARS (found) |
| Arrivals from the US | seasonal mean | 12, including 2000Q3 and 2001Q3 | Olympics, September 2001 (found) |
| Both arrivals series | `--ar1` | 6 to 8; none of those three | the shocks are lost |
| `ldeaths` / `mdeaths` / `fdeaths` | seasonal mean | 6 / 10 / 5 | none: all false alarms |
| `ldeaths` | seasonal NB counts | 1976-02, 1976-04, 1979-10 | none |
| `ldeaths`, `mdeaths` | seasonal `--ar1` | 1976-04 only | none |

Read it plainly: the default seasonal mean model finds real shocks and also cuts a trending or clumpy series into
many pieces; `--ar1` removes most false alarms on the lung deaths but swallows the SARS and Olympics shocks, the same
trade as in "Shape or shock". The January and February 1976 cuts are a bad-winter spike, which is a shock and not a
step, so no setup here separates the two (flagship item 4). The arrivals series are counts in thousands with decimals,
so the Poisson model rejects them.

## A real series of recessions: US unemployment (2026-11-03)

`data/us-unemployment.csv` is the US unemployment rate, 1959Q2 to 2009Q3, 202 quarters (source in `data/SOURCE.md`). It rises in each recession and falls back over years, so no step is documented: the question is what the mean model does with a slow, smooth swing. `eval/us-unemployment.mjs` (output `eval/us-unemployment.out.txt`, `us-unemployment.test.mjs`, 3 tests):

| Setup | Changes |
|---|---|
| Defaults | 33, a new level about every six quarters |
| `--bootstrap` | 33, the same dates |
| `--min-segment 12` | 13 |
| `--ar1` | 0 |

- The default output already says why: lag-1 rho is about 0.95, the ranges are "too narrow", and the warning points to `--ar1`. The warning fired as designed.
- `--ar1` is the right call for this series. It also loses nothing documented, because there is nothing documented to lose; this is the opposite of the Australian arrivals, where `--ar1` loses real shocks.
- `--bootstrap` does not help here: block resampling of the residuals of a 33-step fit inherits the steps, so the penalty stays low. That matches the cyclic series (lynx, sunspots).
- With `--min-segment 12` the cuts fall near 1974Q4, 1981Q2, 1991Q1 and 2001Q4 (recession starts) and near 1984Q2, 1987Q2 and 1994Q2 (recoveries): the recessions are read as levels. A user who wants to know "when did the recession start" gets a date, but not a step in any causal sense.

Not done: no model with a slow return (an AR(1) around a level, with steps) is fitted jointly; `--ar1` removes steps rather than finding the ones that are real. That is flagship item 0 and 4 again, on a series with no documented step to test it against.


## Presidential approval (2026-11-04)

`data/presidents.csv` is Gallup's quarterly approval of the US president, 1945Q1 to 1974Q4 (R's `presidents`; 6 missing quarters dropped, 114 rows; `presidents.test.mjs`, 3 tests). Documented events exist (a new president, Vietnam, Watergate), and lag-1 rho is about 0.56. Run 2026-11-04, no tuning:

| Setup | Cuts |
|---|---|
| Defaults | 8: 1946Q1, 1950Q4, 1953Q1, 1957Q2, 1961Q1, 1966Q2, 1969Q1, 1973Q3 |
| `--bootstrap` | 5: 1946Q1, 1950Q4, 1953Q1, 1966Q2, 1973Q4 |
| `--ar1` | 2: 1953Q1, 1966Q2 |

- The default finds the Watergate collapse (68 to 44 to 27, cut 1973Q3) and the January 1953 change of president; the rho warning fires.
- `--ar1` is the same trade as the Australian arrivals: it drops the false alarms and also the real 1973 shock.
- Nothing cuts 1964Q1, the jump from 57 to 80 after the Kennedy assassination: the rally decays within a year, so it reads as a spike, not a step (flagship item 4 again).
- Wanted: the approval series at monthly resolution, where the 1964 rally is longer.

## Lakes Michigan-Huron: a fall to a new, lower level (2026-11-06)

`data/michigan-huron.csv` is the yearly mean level of Lakes Michigan-Huron, 1918-2009, 92 rows, metres (DAAG `greatLakes`; `michigan-huron.test.mjs`, 3 tests). The lake fell from 176.98 m in 1997 to 175.95 m in 2001 and has stayed low since, a documented drop. The series is nearly a random walk (lag-1 rho about 0.9). Run 2026-11-06, no tuning:

| Setup | Cuts |
|---|---|
| Defaults | 12, including 1999 (the others: 1923, 1928, 1931, 1942, 1951, 1956, 1963, 1966, 1969, 1985, 1988) |
| `--bootstrap` | 9, including 1999 |
| `--ar1` | none |
| `--model meanvar` | 2: 1969, 1999 (range for 1999: 1999 to 2000) |

- The same trade as Lake Huron: the default finds the real fall but also cuts the slow swings, `--ar1` removes all of it including the real fall, and the rho warning fires.
- `meanvar` is the tidiest here, but its own warning says the leftover has autocorrelation (lag 1: 0.61) and clustered volatility, so 1969 is a candidate, not a finding.
- Wanted: a lake-level series with a documented step that `--ar1` keeps (flagship item 0, 4b).

## US personal saving rate: a slow decline cut into steps (2026-11-06)

`data/us-saving-rate.csv` is the US personal saving rate, monthly 1967-07 to 2015-04, 574 rows (FRED PSAVERT via ggplot2
`economics`; `us-saving-rate.test.mjs`, 3 tests). It falls gradually from about 12% to about 2% by 2005 and then jumps in
2008-09: mostly drift, with one documented shock. Run 2026-11-06, no tuning, rho about 0.75:

| setup | changes | notes |
|---|---|---|
| default `mean` | 56 | a step every ten months or so; the range warning fires |
| `--bootstrap` | 49 | barely helps |
| `--ar1` | 7 | 1970-03, 1975-12, 1985-02, 1993-07, 1999-03, 2005-01, 2008-10 |
| `meanvar` | 24 | |

So this is another case where the default over-cuts a drift, and `--ar1` is the setup that reads it sensibly, though its
seven cuts are a staircase down the decline and only 2008-10 is a documented event. The drift warning (`driftWarning`) did not fire
here. One series, no truth labels besides 2008, no tuning, so it is a case study and not a calibration.

## US median unemployment duration: a documented level shift among recession cycles (2026-11-06)

`data/us-unemployment-duration.csv` is the median number of weeks unemployed, monthly 1967-07 to 2015-04, 574 rows (FRED
UEMPMED via ggplot2 `economics`; `us-unemployment-duration.test.mjs`, 3 tests). It swings 4 to 12 weeks with each recession,
then climbs to about 25 weeks in 2009-10 and stays high until 2015: the largest and best documented shift in the series.
Run 2026-11-06, no tuning, rho about 0.69:

| setup | changes | notes |
|---|---|---|
| default `mean` | 53 | cuts every recession and recovery; the rho range warning fires |
| `--bootstrap` | 48 | barely helps |
| `--ar1` | 15 | includes 2009-02, 2009-06, 2009-11 (the rise is cut three times, not once) |
| `meanvar` | 27 | has 2008-07 and 2009-05; the leftover-autocorrelation warning fires |

So all four setups find the 2009 rise, but none reports it as one step: a ramp from 10 to 25 weeks over a year is cut into
two or three, and the default adds recession cycles on top. One series, no truth labels besides the 2009 rise, so it is a case
study and not a calibration. Wanted: a way to merge adjacent cuts that belong to one ramp (flagship item 0).

## Ramps: adjacent same-direction cuts reported as one (2026-11-07)

`ramps.mjs` (`groupRamps`, `ramps.test.mjs`, 3 tests) is a post-process on the changes already found. Two or more
consecutive changes that move the level the same way, with every segment between them at most a fiftieth of the series
long (at least 3 points), are listed once as a `ramp` in the JSON and in the CLI. The changes themselves are unchanged.
On the unemployment-duration series with `--ar1` the three 2009 cuts become one rise, 2009-02 to 2009-11, 9.19 to 21.32
weeks (+12.13); 2012-02 to 2012-12 shows as a two-cut fall. It is a grouping rule, not a test: a run of real steps
close together also groups, and there is no calibration on labelled ramps. Wanted: a series with documented ramps and
documented close steps, to see which way it errs.

### Gap rule on synthetic ramps and staircases (2026-11-07, `eval/ramp-gap.mjs`, synthetic only)

n = 300, N(0,1) noise, 40 seeds per cell, default `maxGap` 6, plain `analyze` (no `--ar1`). Truth A: a linear rise of height H starting at
point 120 over L points. Truth B: two steps of H/2, L points apart. Output: `eval/ramp-gap.out.txt`.

| truth | H | L (span or gap) | ramp reported |
|---|---|---|---|
| ramp | 8 | 6 / 12 / 24 / 48 | 38 / 30 / 8 / 0 of 40 |
| ramp | 4 | 6 / 12 / 24 / 48 | 5 / 7 / 0 / 0 of 40 |
| two steps | 8 | 6 / 12 / 24 / 48 | 38 / 0 / 1 / 0 of 40 |
| two steps | 4 | 6 / 12 / 24 / 48 | 24 / 0 / 0 / 0 of 40 |

Reading: a gap of 6 reports a ramp from two steps 6 points apart as often as from a real 6-point ramp (38 of 40 both), so the rule cannot tell
them apart there. That is by design ("not a test"). New: with a ramp of 24 to 48 points the rule almost never fires (0 to 8 of 40), because PELT
cuts a long ramp into segments longer than 6; the cut count per series rises (3.0 to 3.6 at H=8) while the grouping stays silent. Two
steps 12 or more apart are never grouped, correctly. So `maxGap` at a fiftieth of the series catches short ramps and misses long ones; widening
it would also group genuine staircases. Synthetic, one noise model: not a calibration on real ramps, which are still wanted.

### Ramps by fit (2026-11-08, `eval/ramp-gap.mjs`, `eval/ramp-gap-fit.out.txt`, synthetic only)

`analyze` now passes the series to `groupRamps`, which groups same-direction cuts separated by up to a fifth of the series, then keeps a
run as one ramp only if a flat-line-flat fit (two levels, a straight line between two knots placed anywhere from the previous cut to
the next one; 4 parameters) beats the steps PELT found by BIC (2k+1 parameters for k cuts, so the steps pay for their positions). If the
run fails, its last cut is dropped and it is tried again. Called without `values`, `groupRamps` keeps the old gap rule. Same simulation
as above (n = 300, N(0,1), 40 seeds, plain `analyze`), ramp reported of 40:

| truth | H | L = 6 / 12 / 24 / 48 | gap rule before | by fit now |
|---|---|---|---|---|
| ramp | 8 | | 38 / 30 / 8 / 0 | 27 / 29 / 39 / 40 |
| ramp | 4 | | 5 / 7 / 0 / 0 | 5 / 17 / 33 / 33 |
| two steps | 8 | | 38 / 0 / 1 / 0 | 1 / 1 / 0 / 0 |
| two steps | 4 | | 24 / 0 / 0 / 0 | 6 / 9 / 3 / 0 |

Reading: long ramps (24 to 48 points) are now found in 33 to 40 of 40 instead of 0 to 8, and two steps 6 apart are no longer called a ramp
(38 to 1 of 40 at H=8). The price: a 6-point ramp of height 8 is found 27 of 40 instead of 38, and H=4 steps 12 apart are called a ramp 9 of 40
(a small step pair next to noise looks like a bent line). Short ramps and close steps are genuinely alike in the data; this rule only claims
that a long one is a line. The real 2009 US unemployment-duration rise is still one ramp (test `ramps.test.mjs`). Still synthetic with one noise
model, no `--ar1`; no labelled real ramps tested. Next: sticky noise (`--ar1`), and real documented ramps.

### Ramps in sticky noise (2026-11-08, `eval/ramp-ar1.mjs`, `eval/ramp-ar1.out.txt`, test `ramp-ar1.test.mjs`, synthetic only)

The "Next: sticky noise" item above, run: n = 300, AR(1) noise with unit marginal sd, 40 seeds per cell, ramp of height 8 starting at 120. Series with a ramp reported, plain `analyze` against `ar1: true` (cuts per series in brackets):

| noise | truth | plain | `--ar1` |
|---|---|---|---|
| rho 0 | none | 0 / 40 (0.1) | 0 / 40 (0.0) |
| rho 0 | ramp over 12 / 24 / 48 | 34 / 38 / 40 | 34 / 38 / 40 |
| rho 0.5 | none | 0 / 40 (11.7) | 0 / 40 (0.1) |
| rho 0.5 | ramp over 12 | 38 / 40 (13.8) | 13 / 40 (1.5) |
| rho 0.5 | ramp over 24 | 35 / 40 (14.5) | 35 / 40 (1.9) |
| rho 0.5 | ramp over 48 | 33 / 40 (13.8) | 37 / 40 (2.7) |

Reading: with rho 0.5 the plain run makes 12 to 15 cuts per series, so a "ramp" there is one of many groups and says little (the 33 to 38 of 40 do not mean the plain run finds the ramp: it cuts the noise as well). `--ar1` brings the cuts to 0.1 on a null and 1.5 to 2.7 on a ramp, and keeps the ramp from 24 points up (35 to 37 of 40, all on the truth span). The price is that a short, 12-point ramp is found only 13 of 40 times, because the wider noise scale reads it as one step or nothing. Synthetic, one noise model, one height; real documented ramps are still wanted.

## A real series that rises, then flattens and falls: Australian beer (2026-11-07)

`data/ausbeer.csv` is quarterly Australian beer production, 1956Q1 to 2010Q2 (218 points, fpp2's `ausbeer`, source in `data/SOURCE.md`). Production grew to the mid-1970s and drifted down afterwards (recalled, not checked against a paper: a plausibility check, not a labelled test). `eval/ausbeer.mjs` (output `eval/ausbeer.out.txt`, test `ausbeer.test.mjs`) runs it with `--period 4`.

- **Level only (`mean`):** 10 steps raw, 11 on the log. A slow rise and fall is read as a staircase.
- **`--trend bend`, log series:** one slope change at **1976Q2**, range **1975Q2 to 1978Q1**, with the slope falling afterwards.
- **`--trend bend`, raw series:** 1977Q3, but the range runs from **1974Q3 to 1989Q1**, 15 years wide. The same bend is dated, but the raw scale cannot place it.
- **`--trend bends`:** an early bend at 1961Q4 and the mid-1970s one on both scales; the log run adds one at 1990Q3 (range 1988Q3 to 1994Q2). Steps left over include 1983Q1, 1988Q2 and 1992Q1 in most runs; what happened in those quarters was not checked.

Read plainly: here the log scale gives a much tighter range than raw, the opposite of UK gas (README, above), where the log lost the bend. One series, no claim about rates.

## Boston Marathon: a documented step the data does not show (2026-11-08)

`data/boston-marathon.csv` (winning times in minutes, 1897-2016, 120 values, fpp2 `marathon`) was tried as the "documented break inside a long smooth series" the flagship wanted. The course was lengthened from about 24.5 to the full 26.2 miles in 1924 (recalled from the Boston Athletic Association's history; the BAA page was not read). It is not a test: the winners' mean is 153.0 minutes in 1897-1923 and 152.2 in 1924-1950, because faster runners offset the longer course. No model dates a change at 1924. The default reports 9 changes (1900 to 1978, with the range warning), `--model mean --ar1 auto` 6, `--model trend` 7, `--model meanvar` 5; all four date changes at 1953 and 1978, and the first three at 1932. Listed, not scored: no label in the data says what 1953 or 1978 were. `node eval/boston-marathon.mjs` (output `eval/boston-marathon.out.txt`, test `boston-marathon.test.mjs`). Still wanted: a documented step whose size shows in the series.

### Saudi oil production (2026-11-08)

`data/saudi-oil.csv` (millions of tonnes a year, 1965-2013, 49 values, fpp2 `oil`) is a long real series whose big moves have names, recalled and not read from a source: the 1973 embargo and price jump, the 1982-85 fall when Saudi Arabia cut output as swing producer, and the 1990-91 Gulf War surge. The default level model reports 8 changes (1971, 1973, 1979, 1982, 1984, 1988, 1991, 2003); the 1973 one has a mean of 272.5 before and 417.2 after, 5.4 noise sd. `--model trend` reports four (1972, 1982, 1986, 1991), one near each event. `--model meanvar` reports 1991 and 2003. `--model mean --ar1 auto` reports none: the year-to-year persistence of production absorbs the 1970s rise, the 1980s fall and the 1991 surge as one slow wave, the same over-absorbing seen on GDP. So on this series the AR(1) setting hides three events a reader would call real, which fits the case against reading `--ar1 auto` as an over-cut cure. Not a scored benchmark: no label file exists, and 1979, 1984, 1988 and 2003 are unexplained. `saudi-oil.test.mjs`, source in `data/SOURCE.md`. Still wanted: the same on a series with a source-labelled date.

## Australian departures: two documented shocks no model cuts (2026-11-08)

Monthly short-term resident departures from Australia, 1976-01 to 2017-06 (498 months, `fpp2::departures`, `data/au-departures.csv`, `au-departures.test.mjs`). The Bali bombing (2002-10) and SARS (2003-04 to 06) are documented dips in outbound travel. With `--period 12`: the seasonal mean model cuts 42 times, `--ar1` 28 (`auto` the same), `--model trend` 21. The mean models have no cut between 2002-09 and 2003-07 (nearest 2003-12, a growth step, not the shock). The trend model cuts 2003-03, one month before SARS began, so it is a trend break that happens to sit beside the shock, not a detection of it. The series grows about eightfold with a widening season, so most cuts are the over-fit staircase on drift that the block-variance warning already describes. Reading: a 3-month dip inside a growing, widening season is below what the penalty keeps, and nothing here is a real step to test against. Still wanted: a documented step inside a cycle.

## Australian air passengers: one date the models agree on (2026-11-08)

`data/ausair.csv` (annual air transport passengers in millions, 1970-2016, 47 values, fpp2 `ausair`) is a smooth, fast-growing series with two events recalled from memory (not read from a source): the 1989 domestic pilots' dispute and the 2001 Ansett collapse with 11 September. `--model mean --ar1 auto` reports one change, 2002; `--model trend` reports 1989, 1993, 2002 and 2010; `--model meanvar` reports 1980, 1991 and 2002 (with the range warning). Three of four models date 2002, one year after the events (annual data, so the first full year of lower traffic), and only the trend model dates 1989. The default mean model reports 13 changes, 1973 to 2015, with the range warning: the same over-cut on smooth growth as GDP and the Saudi oil series. Not a scored result: the size of either event is not known from a source, only the dates are. `node eval/ausair.mjs` (output `eval/ausair.out.txt`, test `ausair.test.mjs`). Still wanted: a documented real ramp or close steps.

## US female murder rate: two slope bends where homicide turned (2026-11-08)

`data/us-female-murder-rate.csv` (per 100,000, 1950-2004, 55 values, fpp2 `wmurders`, source in `data/SOURCE.md`) rises through the 1960s, plateaus in the 1970s and falls from the 1990s. US homicide peaking near 1980 and again about 1991-93 is recalled, not read from a source, so this is a plausibility check, not a labelled test. The level model cuts it 10 times (1960 to 2002), the staircase-on-a-shape over-cut seen on GDP and beer. `--ar1 auto` keeps one (1966), `--model trend` five (1963, 1976, 1983, 1994, 2001), `--model meanvar` three (1960, 1971, 1995). `--trend bends` finds two slope changes: **1980** (range 1975 to 1983) and **1993** (range 1990 to 1994), one at each recalled turning point, the second inside a range of five years. `--trend bend` alone dates 1980 with a wide range (1970 to 1983). Read plainly: when the shape is a rise then a fall, the bend model, not the step models, gives the dates a reader would expect. One series, a female-only rate, no claim about rates for others. `node eval/us-female-murder-rate.mjs` (output `eval/us-female-murder-rate.out.txt`, test `us-female-murder-rate.test.mjs`). Still wanted: a documented break with a source-labelled date.

## Cement and the 2000 GST: a step inside a seasonal, wandering series (2026-11-08)

`data/qcement.csv` (Australian quarterly cement production, 1956Q1 to 2014Q1, 233 values, `fpp2::qcement`, source in `data/SOURCE.md`, `qcement.test.mjs`). Australia's goods and services tax began on 1 July 2000 (recalled, not checked against a source): 2000Q2 is the year's high (2.07), then 1.90 and 1.65. This is the "real step inside a cycle" the flagship asked for, with `--period 4` on the log.

- **Dated, among 20 or more other cuts.** The level model (raw or log) puts a change at 2000Q4 (raw also 2001Q4); `--model trend` at 2000Q3 and 2001Q4; `--trend bend` at 2000Q3. Each of these cuts the series 20 to 25 times, because production wanders with the building cycle (the log level model has 25 changes), so the GST date is one cut among many, not a finding the tool singles out.
- **Absorbed, not missed on purpose.** `--ar1 auto` (8 changes), `--ar1 joint` (6) and `--model meanvar` (9) date nothing in 1999 to 2001: the 2000 fall is read as part of a wandering level. `--slope-breaks` clears no bar on the bent log series.
- **What it says.** A documented step coinciding with a pull-forward bulge is found only by the over-cutting models and lost by the ones that fix the over-cutting. The same trade as the Saudi oil and Australian departures series: no setting both keeps the 2000 date and stays quiet elsewhere. Still wanted: a real step in a series that does not wander.
## Cafés and the 2000 GST: the same step, found by every model (2026-11-09)

`data/auscafe.csv` (Australian monthly café, restaurant and catering turnover, 1982-04 to 2017-09, 426 values, `fpp2::auscafe`, source in `data/SOURCE.md`, `auscafe.test.mjs`). The GST began on 1 July 2000 (recalled, not checked against a source), the same event as the cement section above.

- **Dated by all six models.** Raw level (49 cuts), log level (44), `--trend bend` (28), `--model trend` (21), `--ar1 auto` (27) and `--model meanvar` (24) each cut at 2000-09, two months after the tax. Cement's `--ar1` and `meanvar` runs absorbed the same event; here they keep it, so the absorption seen there is a property of that series, not of the models.
- **Still over-cut.** Every model cuts 21 or more times over 35 years of growth, and the neighbours differ (`--ar1 auto` also 1999-01, `bend` also 2001-09). A cut at 2000-09 is not evidence of the tax alone: 1999-01 is a cut with no documented cause.
- **Not done.** No source read for the tax date or for the size of the turnover effect; no calibration of `--noise-floor` on this series.

## Dow Jones returns: 1987 and 2008 (2026-11-09)

`data/djia-returns.csv` (DJIA daily log returns in percent, 1980-01-03 to 2012-12-31, 8,609 days, `AER::DJIA8012`, source in `data/SOURCE.md`, `djia-returns.test.mjs`). Two dated events: Black Monday, 19 October 1987, and the Lehman failure, 15 September 2008 (both recalled, not checked against a source). The longest series in the folder, and the first with a crash inside it. All runs `--model meanvar`:

| Run | Cuts | 1987 | 2008 |
|---|---|---|---|
| plain | 27 | 1987-10-14, 1987-10-28 (brackets the crash) | 2008-09-15 (the Lehman day itself), 2008-12-03 |
| `--dispersion` | 10 | 1987-10-06 | 2008-09-04 |
| `--bootstrap` | 11 | 1987-10-14, 1987-10-28 | 2008-09-04 |
| `--robust` | 12 | 1987-10-06 | 2008-09-15 (Lehman), 2008-12-10 |

- **Found by all three.** The crash is a short high-variance window, so the plain and bootstrap runs cut either side of it (14 and 28 October) and `--dispersion` cuts once, 13 days before it. 2008 is cut within 11 days of Lehman by every run.
- **Shared cuts.** 1991-12-31, 1997-03-13, 2003-07-28, 2007-07-10, 2011-08-02 and 2011-12-21 are cut by both `--dispersion` and `--bootstrap`. Whether each marks a real variance regime is not checked against a source (2011-08 is the month of the US downgrade, recalled).
- **Plain over-cuts, as on other returns.** 27 cuts against 10 to 11 once dispersion or the bootstrap is on. Several plain cuts come in pairs 14 days apart (1987-10-14/28, 1989-10-13/27, 1997-10-21/11-04), the pattern of a single spike bracketed on both sides.
- **`--robust` (row added 2026-11-10).** It did not finish in 9 minutes when this section was first written: its Laplace cost sorted each segment afresh for every pair PELT tried. With each start's segment now kept sorted, it takes about 9 s (`docs/history/ci-perf-2026-11-10-laplace-cost-sorted-runs.md`). 12 cuts. It shares 1987-10-06 with `--dispersion`, 1988-01-27 with `--bootstrap` and 2011-08-02 with both, and is the only one besides plain to date Lehman to the day.
- **Not done.** No source read for either event date. No comparison to the DAX, SMI and CAC rise at row 1482 (1997) beyond noting 1997-03-13 sits near it.

## A documented fall in 24 points: Crimean War disease deaths (2026-11-08)

A real series with a dated cause: the British army's monthly death rate from disease in the Crimea, April 1854 to March 1856 (Nightingale's figures, `data/nightingale-disease.csv`, source in `data/SOURCE.md`). The Sanitary Commission reached the Crimea in March 1855 and deaths fell from there. Run with `node cli.mjs --model mean --min-segment 3`:

- PELT cuts four steps: up at 1854-08 and 1854-12, **down at 1855-03** (826 to 269 per 1,000, 80% Bayesian probability within 3 points), and down again at 1855-07. The first fall is dated to the month of the Commission.
- With `--log` the fall is dated 1855-04 (one month late) and the tool reports three cuts from 1855-04 to 1856-01 as "one fall from 6.57 to 1.89", which is the right reading: the decline is a ramp, not a step.
- The warning that the series is autocorrelated (rho about 0.95) fires, as it should, and `--slope-breaks` refuses at 24 points (needs 40).

Limits: 24 points, one series, one cause; the Commission's arrival coincided with winter ending, so this shows the date lines up, not that the tool separates sanitation from season (no seasonal term fits in 24 months). Test: `nightingale.test.mjs`. This is a documented fall dated within a month, not yet a real break clearing the slope-break bar.
## US electricity generation: a documented stall the slope test cannot yet claim (2026-11-08)

`data/us-electricity.csv` (US monthly net generation, 1973-01 to 2013-06, 486 months, fpp2 `usmelec`, `us-electricity.test.mjs`). US generation grew for decades and peaked in 2007 (recalled, not read from a source). With `--period 12` the fixed-season `mean` model cuts it 38 times, because the summer peak grows with the level; `--ar1 joint` keeps three (1978-09, 1989-02, 1998-05) and none is near 2007. On annual totals (40 values) the slope-break test puts its best kink at 2007 (growth about +67 a year before, -20 after) but W = 7.5 against a bar of 9.2 (p = 0.10): five post-peak years are too few, so the detector reports no slope break. This is a real documented break that does not clear the bar, an honest negative; the clearing case is still wanted.

## Australian gas production: a documented takeoff that clears the slope-break bar, narrowly (2026-11-08)

`data/au-gas.csv` (monthly gas production, 1956-01 to 1995-08, 476 months, forecast `gas`, `au-gas.test.mjs`). Production was small until natural gas came into use around 1969-70 (recalled, not read from a source). On the 39 full annual totals (1956 to 1994) the slope-break test reports one knot at 1969: about +1,200 a year before and +22,900 after, W = 12.23 against a bar of 12.08 (p = 0.048, 499 reps). This is the first real documented break that clears the bar, and only just: a margin of about 1%, so a different bootstrap seed could flip it. On logs it finds nothing (W 1.7 against a bar of 21), because the growth is near-exponential rather than one bend. Limits: one series, one cause, date and cause from memory; the knot is a bend in a linear trend, not proof the policy caused it. Still wanted: a documented break that clears by a wide margin.

## Australian gas: how borderline is the clearing? (2026-11-08)

The gas takeoff above cleared its bar by about 1% with seed 1. `eval/au-gas-seeds.mjs` reruns the test over 20 Monte Carlo seeds (`eval/au-gas-seeds.out.txt`, test in `au-gas.test.mjs`): at 499 reps W = 12.23 clears the bar for **17 of 20 seeds** (p 0.032 to 0.066; bar 10.6 to 13.5); at 1,999 reps it clears for **19 of 20** (p 0.035 to 0.052; bar 11.2 to 12.4). Read plainly: the p-value is about 0.045, so this is a borderline real break, not a rout, and a single-seed "clears" should be quoted with that. Raising `reps` narrows the bar's wobble but cannot make the evidence stronger. Still wanted: a documented break clearing by a wide margin.

## Australian arrivals from Japan: three documented shocks, found by different models (2026-11-08)

`data/au-arrivals-japan.csv` (quarterly short-term arrivals from Japan, 1981Q1 to 2012Q3, 127 values, `fpp2::arrivals`, `au-arrivals-japan.test.mjs`; the series was in the repository only for the drift warning). Three shocks with known causes, dates recalled, not read from a source: the Asian financial crisis (1997-98), SARS (2003) and the global financial crisis (2008-09).

- **Default mean model:** twelve cuts, including 1998Q4, 2003Q2 and 2009Q1. The crisis dates are found, among eight other cuts in a growing, cyclic series.
- **`--model trend`:** four cuts (1987Q2, 1996Q2, 2003Q4, 2008Q2): SARS and the crisis year, but not 1998.
- **`--model meanvar`:** dates 1998Q4 and 2008Q2 and nothing in 2003. **`--ar1 auto`:** eight cuts, keeps 1998Q4, loses SARS.
- **What it says.** SARS, a two-quarter dip, is found only by the level and trend models; the models that fix over-cutting absorb it, as with the cement GST step. No model dates all three shocks and keeps the cut count low. One series, one country pair, no significance tested here.

## Australian arrivals from the US: the Olympics quarter found by two models (2026-11-08)

`data/au-arrivals-us.csv` (quarterly short-term arrivals from the US, 1981Q1 to 2012Q3, 127 values, `fpp2::arrivals`, `au-arrivals-us.test.mjs`; the file was in the repository but untested). Companion to the Japan series. Known events, dates recalled, not read from a source: Expo 88 and the Bicentennial (1988), the Sydney Olympics (September 2000, 2000Q3) and 11 September 2001.

- **Default mean model:** twelve cuts, including 1988Q3, **2000Q3** and 2001Q3.
- **`--model trend`:** five cuts (1986Q4, 1989Q1, 1997Q3, 2000Q3, 2002Q1): the Olympics quarter exactly, 9/11 one quarter-plus later.
- **`--model meanvar`:** six cuts, 2002Q2 but not 2000. **`--ar1 auto`:** six cuts, no 2000Q3.
- **What it says.** The one-quarter Olympics spike is dated to the right quarter only by the level and trend models; the models that curb over-cutting absorb it, as with SARS in the Japan series. Without tests of significance here, and with a dozen other cuts in the default model, treat the match as suggestive. One series.

## A monthly inflation series: three documented dates, and a postwar mess (2026-11-09)

`data/us-cpi-monthly.csv` is US CPI inflation by month, 1947-02 to 2004-12 (695 points, source in `data/SOURCE.md`), a monthly companion to the quarterly series above. `us-cpi-monthly.test.mjs` (2 tests) runs the `mean` model:

- **Defaults:** 28 changes, 14 of them before 1953: pairs of two-month segments in 1947-48 and 1950-52 (the end of price controls, the Korean War spike), so the plain model reads a noisy postwar stretch as a staircase.
- **`--ar1`:** 14 changes. **`--bootstrap`:** 16. Both keep 1973-08 (4.7 to 11.2), 1981-10 (11.0 to 3.8 with `--bootstrap`, the Volcker fall) and 1967-06 (1.5 to 4.7, a weak 1.5 noise sd). Only `--bootstrap` keeps 1986-02 to 1986-04, a three-month dip to -4.4 that matches the 1986 oil-price collapse, and it then cuts it back up, so it reads as a shock, not a regime.
- **Not found:** a clean 1979 surge. `--bootstrap` merges 1978-04 to 1981-09 into one 11.0 segment; the defaults split it at 1979-02 and 1980-07.
- **Warning:** with `--bootstrap` the block-variance warning fires (block means vary 56.8 times white noise, rho 0.26): the 1947-52 steps and the 1991-02 drop (4.5 to 2.5, under 1 sd) are the ones to doubt.
- **`--bootstrap --ar1`** is refused by the CLI, as documented.

One series, dates from the literature, no rate claimed. It adds a second look at the 1973 and 1981 dates at monthly resolution, where the quarterly series put them within a quarter.

## Canada's baby boom: a documented step that every model dates, and a series where `--ar1` finds nothing (2026-11-09)

`data/canada-fertility.csv` is Canada's total fertility rate (births per 1,000 women), 1931 to 1968, 38 values (`carData::Hartnagel`, column `tfr`; `canada-fertility.test.mjs`, 3 tests). The postwar baby boom starting in 1946 is the documented step (date recalled, not read from a source); the 1960s fall is a decline over several years, not a step.

- **Default mean model:** seven cuts (1933, 1942, 1946, 1953, 1963, 1965, 1967). 1946 is one of them, 3018 to 3488 (a jump of 356 in one year, 3018 to 3374). The series has rho about 0.95, so the other six are mostly a staircase over drifting levels, and the tool says so.
- **`--model meanvar`:** two cuts, 1946 (2869 to 3651, 8.8 noise sds, 95% Bayesian probability) and 1959, where the volatility rises as the fall begins. `--model trend`: 1937, 1946, 1962.
- **`--ar1` and `--ar1 joint`:** no change at all, 1946 included. With rho 0.95 and 38 points, widening the noise scale swallows a real step; this is the opposite failure to the over-cutting `--ar1` fixes elsewhere.
- **`--slope-breaks`:** refused, 38 points is under its 40-point minimum.
- **What it says.** The one documented date is found by every model that is allowed to cut, so on a strongly autocorrelated series with a real step, `meanvar` was the model that gave the cleanest, shortest answer. One series, no rate claimed; it is a second real case, after the Peace Bridge, of `--ar1` removing a true change.

## Treasury yield volatility: the 1979 to 1982 regime

Checked 2026-11-09. `data/us-tbill-1m-changes.csv` is the monthly change of the US 1-month T-bill yield, 1947-01 to 1991-02 (530 points, source in `data/SOURCE.md`). The documented event (cited from memory, sources unread) is the Fed's reserves-targeting period, October 1979 to October 1982, a regime of much higher volatility. `tbill-volatility.test.mjs` (6 tests), `--model meanvar`, no tuning:

- **Found by all three variants:** 1979-10 is cut with `range95` 1979-05/06 to 1979-10/1980-01 (plain, `--dispersion`, `--robust`). The segment sd is 1.78 against 0.40 before and 0.52 after. The end is cut at 1982-09 (range 1982-09 to 1983-01), one month before October 1982, in the first month the rate stops moving as it did.
- **Other cuts differ by variant:** plain gives 8 cuts (1974-05 and 1975-03 bracket a 10-month trough, the 1974 recession), `--dispersion` 6, `--robust` 4. The plain run's extra cuts are likely the clustered volatility the result's own warning names (Ljung-Box of squares 21.6 against a 5% line of 11.1); I did not test that.
- **Not checked:** the 1979-10 range is one-sided (it stops at the cut), so its upper end is the cut itself; a series other than `r1` (the 3-month and 12-month yields are in the same file upstream).

## Global temperature: a documented 1945 step

Annual global temperature anomaly, 1880-2024 (`data/global-temp-annual.csv`, 145 values, NOAA/NASA GCAG via datahub.io; `eval/global-temp.mjs`, output `eval/global-temp.out.txt`, test `global-temp.test.mjs`, retrieved 2026-11-09). Two dates are recalled from the literature, not read from a source here: a sea-surface measurement change around 1945 (ships switching from bucket to engine-intake readings, which published work treats as a step in the record; the GCAG series is already adjusted, so any residue is partial), and slope changes near 1910, 1940 and 1976.

**The slope-break test on the same series (2026-11-09, negative result).** `node eval/slope-global-temp.mjs` (output `eval/slope-global-temp.out.txt`, test `slope-global-temp.test.mjs`): the recalled 1976 acceleration is the best single split of the differences (1880-2024, and again in 1910-2024 and 1930-2024), but W is 1.8 against an auto bar of 8.4 (lag-1 autocorrelation of the differences -0.20, n=145) and the Monte Carlo p is 0.80, so nothing is reported. The date is recovered and the significance is not, as with GDP and productivity, for a different reason: annual temperature noise (about 0.1 degree of year-to-year change) is large against a slope change of a few hundredths of a degree a year, and a test on differences gives up the level fit's information. The bend model (`--trend bends`) dates 1913, not 1976, so no model here both dates and tests 1976. Not a positive control; the bar's validity at this n and rho is not in question, the power is.

- **The 1945 step is found, to the year after.** The level model (`mean`), `--model trend` and `--trend bend` all cut at **1946** (the level model also cuts 1920, 1937, 1977, 1987, 2001, 2015, 2023; trend cuts 1907, 1964, 2021). `--ar1 auto` does not: it keeps 1930, 1987 and 2014, because on a rising series the AR(1) term absorbs the drift that carries the step. This is the first series here with a documented step that three models agree on, and the one model that misses it is the one a reader would call the cautious choice.
- **The slope model dates one bend, 1913, with a 95% range of 1895 to 1992.** It does not find 1976, the best-known acceleration; `--trend bends` returns the same single bend. The range is nearly a century, so this is a bend the series cannot place, not a date to quote.
- **Reading:** on a drifting series the step models cut a staircase (8 cuts for the level model), as on GDP and beer. The agreement at 1946 is the useful result; the other cuts have no documentation behind them. One series, one recalled date: it says the detector can date a real step on real data, not how often it will.

Still wanted: the 1976 acceleration found by a bend model on a series long enough to place it (a longer or less smooth record).

## Mauna Loa CO2: a smooth acceleration, no step (2026-11-09)

Monthly CO2, 1958-03 to 2026-09 (`data/co2-mauna-loa.csv`, 823 values, the interpolated column of NOAA GML as republished by datahub.io `co2-ppm`; `eval/co2-mauna-loa.mjs`, output `eval/co2-mauna-loa.out.txt`, test `co2-mauna-loa.test.mjs`, retrieved 2026-11-09). From the literature, recalled and not read from a source here: the yearly rise grows from about 0.8 ppm in the 1960s to over 2 ppm lately, smoothly, with no step. So the right answer is no steps and at most a gentle bend.

- **Every step model over-cuts it.** The level model cuts 126 times, `--model trend` 30, `--period 12 --trend bend` 46, `--trend bends` 41. This is item (0) of the flagship list (smooth, low-noise series) on a second real series: the seasonal cycle and the curvature are tiny against the month-to-month noise, so PELT buys steps for curvature.
- **`--noise-floor 1.5` helps only a little here:** 41 steps down to 30, slope changes unchanged. `--ar1 auto` 22 steps, `--ar1 joint` 18, and both move the slope bends to 1972-07 and 1994-06 (range to 2002-11) from 1965-03, 1978-05 and 2001-11. No setting agrees with another on where the acceleration "is", and none is quiet. A curve with no kink has no true change date, so the dates are the estimator's choice, not findings.
- **What it says about the tool:** on a smooth quadratic-like record the step count is not a number to quote; read `--trend bends` ranges, and treat a range that moves with the AR(1) setting as no date at all. Wanted: a curvature (quadratic) trend option that explains the series with zero cuts, so a smooth acceleration is reported as one.

**A curvature trend (`--trend quad`, added 2026-11-09).** Fits a slope and a curvature under the steps (both estimated within the steps' segments, alternating with the step search like `--trend`) and keeps the curve only if the BIC falls against the straight line; the output has `trend.curved`, `curvaturePerPoint2` and `slopeChangePerPoint`. Gaussian models only (counts refuse it). On Mauna Loa CO2 with `--period 12` it reads the slope growing by 0.019 ppm per year per year (the recalled 0.8 to 2.4 ppm a year over about 55 years is about 0.03, same order; recalled, not read from a source), and the steps fall from 60 (straight `--trend`) to 46, with `--ar1 auto` 25 and `--noise-floor 1.5` 32. **It does not reach zero cuts:** the month-to-month noise is sticky and the seasonal shape is not a clean 12-month factor, so PELT still buys steps. Invented series (`quad-trend.test.mjs`, seeded): a quadratic with a 6-unit step at 120 in noise sd 1, step found within 5 points on 40 of 40; on 40 straight lines a curve was kept on 1 of 40. Still wanted: a curve test that is robust to sticky noise on the real series.

## Hurricane Sandy in the bikeshare counts: a two-day outage, dated to the day (2026-11-09)

`data/bike-sharing-daily.csv` (Capital Bikeshare, Washington DC, 731 days) holds a documented shock: Hurricane Sandy shut the system around 2012-10-29 (recalled, source unread). The rows say so: 20 registered and 2 casual rides on 10-29, 1,009 and 87 on 10-30, then 5,147 and 419 on 10-31 against about 5,000 a day registered either side. `node eval/sandy-bikes.mjs` (output `eval/sandy-bikes.out.txt`, test `sandy-bikes.test.mjs`, 4 tests), weekly period, no tuning:

- **Found by every count-aware or log setup, to the day.** Poisson with negative-binomial dispersion and the Gaussian log model, on both registered and casual riders, cut **2012-10-29** (start) and **2012-10-31** (recovery), each with a `range95` of that one index. The 10-30 half-recovery day sits inside the outage segment.
- **The plain Gaussian level model dates it wrongly for casual riders.** It cuts 10-28, a day early (the casual series has 84 changes under it, 59 to 70 under the others), and has no cut at 10-29 or 10-31. Registered riders are fine under it (cuts 10-29 and 10-31). So on a series with a seasonal count, the log or count model is the setup that matters; this is the first real series here where a Gaussian level model misdates a known event by a day.
- **Not checked:** the other cuts in the window (11-22 to 11-26, Thanksgiving week, likely holidays; the dataset's holiday flag does not cover it) are not examined; one event, one city.

## `--spikes` on a documented shock: Sandy ranks first for registered riders, is missed for casual (2026-11-10)

`node eval/sandy-spikes.mjs` (output `eval/sandy-spikes.out.txt`, test `sandy-spikes.test.mjs`, 2 tests). Capital Bikeshare daily counts (`data/bike-sharing-daily.csv`, 731 days), mean model, weekly period, `--spikes`, no tuning. This is the second real series with a documented bad point that the gold section asked for, with the caveat that Sandy is a real closure (recalled, source unread), not a data error.

- **Registered riders:** 16 labels, the largest is 2012-10-29 to 10-30 at -15.7 noise sd, twice the next (-7.8 sd). Ranked by excursion, the event comes first. Labels over 3, 5 and 7 sd: 16, 6, 3, so the 3 sd threshold alone would not separate it; the ranking does.
- **Casual riders:** 27 labels, none holds Sandy. The plain level model cuts 10-28 for casual riders (see the Sandy section above), so the run does not return to its start and the label rule skips it. The count and log models date it; `--spikes` does not run with the count model, but does with `--log` (next section).
- **Reading.** Use the label list sorted by excursion, not the 3 sd line: on a seasonal series most labels are weather and holidays. One event, one city; the 3 sd, 5-point and half-excursion thresholds stay untuned.

## `--spikes` with `--log`: Sandy ranks first for casual riders too (2026-11-10)

`node eval/sandy-spikes-log.mjs` (output `eval/sandy-spikes-log.out.txt`, test `sandy-spikes-log.test.mjs`, 2 tests). The previous section's question, with `log: true` (`--log --spikes`). No engine change: the spike guard only ever refused the Poisson model, so `--spikes` already ran on log values and the earlier note that it "does not run with them" was wrong for the log scale.

- **Registered riders:** 22 labels; Sandy is first at -39.4 noise sd, twice the next (-19.1 sd). Labels over 3, 5, 7 sd: 22, 18, 9.
- **Casual riders:** 16 labels; Sandy is first at -17.7 sd, nearly twice the next (-9.5 sd), at 0.02 of the normal level. Under the level model it had no label. On the log scale a closure is a fixed fraction of normal ridership, so the level shift the plain model cut is gone and the run returns to its start.
- **Reading.** For a series whose level moves a lot (casual riders, summer against winter), try `--log --spikes` before concluding there is no spike. Excursions are in log units: `exp(excursion)` is the ratio to the surrounding level. Still the same caveats: one event, one city, recalled not checked against a source, thresholds untuned. The Poisson model still refuses `--spikes`.

## Lynx: a known period does not remove the cycle (2026-11-09, negative result)

`node eval/lynx-period.mjs` (output `eval/lynx-period.out.txt`, test `lynx-period.test.mjs`). The Canadian lynx trappings (`data/lynx.csv`, 114 years, 1821-1934, about a 10-year cycle, no documented step) are cut 23 times by the default model, and every cut is a false alarm. The result's own warning says "give the period with `--period`". This run checks that advice on the one series where the period is known.

- **It helps a little and never reaches zero.** `--period 8` to `12` leaves 24, 19, 16, 17 and 18 steps; with `--log` 18, 16, 18, 12 and 10; `--period 10 --drift` 17. The best case, `--log --period 12`, still cuts 10 times.
- **Why.** The cycle is irregular: its length runs from 8 to 12 years and its peaks differ several-fold, so a fixed-length seasonal profile cannot absorb it. The residual is still cyclic.
- **What does remove them:** `--ar1` (0 cuts, README "Two cyclic real series"), which treats the cycle as autocorrelation instead.
- **Reading.** The warning's hint to give `--period` is right for a calendar cycle (12 months, 7 days) and weak for a biological or solar one. One series, no rate claimed; sunspots (11 years) not rerun with a period.

## Gold prices: a random walk, and a bad data point (2026-11-09)

`gold-price.test.mjs`, data `data/gold.csv` (forecast::gold, daily 1985-1989, 1074 priced days). No documented level shift; day 770 reads 593.7 against about 485 either side, a known data error (recalled from the forecasting literature, source unread).

- **Levels:** the default mean model returns 113 changes, a staircase on a random walk (as on every drifting series here); `--ar1` brings it to 24. Cuts at 769 and 771 bracket the bad day, among the staircase.
- **Daily log returns (%):** the mean model returns 7 cuts, including 769, 771 and 773 around day 770. `--model meanvar` gives 10; `--robust` and `--dispersion` 5; `--bootstrap` 2 (762 and 772). So on returns the penalty choice moves the count from 10 to 2; the bad day shows as a cut only in the mean model.
- **Reading.** Difference a random walk first. A one-day outlier is reported as a pair of changes either side of it, not as an outlier: `--spikes` (added 2026-11-09, labels only) now lists the 769/771/773 run as one spike (the cuts are unchanged). A run of changes within 5 points whose last level is within half the excursion of the starting level, with the excursion at least 3 noise sd, is labelled a spike or dip; a lasting step never is. Synthetic checks and gold only (`spikes.test.mjs`); the 5-point span, 0.5 and 3 sd are not tuned. The Poisson model keeps `--bursts` and `--episodes`. One series, no rate claimed.

- **`--spikes` on five real return series (2026-11-09, `spikes.test.mjs`).** With `--model meanvar` it labels nothing on DJIA (8,609 days), DAX, SMI, CAC and FTSE (1,859 days each): no false label in about 14,000 days, though none of these has a documented bad price, so this is specificity only. With the mean model on DJIA it labels 18 days, and they are real shocks, not data errors: the 1987-10-16 dip (excursion -14.2 noise sd, the Black Monday week), 2001-09-17 (the reopening after 11 September), a run of 2008 October and November spikes and dips, and 2011-08-04. Dates and events are recalled, not checked against a source. Read it as "one-day shock that reverted", which is what the label says; it does not tell a bad print from a crash. A second real series, with a documented closure rather than a bad print: see "`--spikes` on a documented shock" (2026-11-10). Still wanted: a documented bad print.

## S&P 500 monthly returns, 2000 to 2010 (2026-11-10)

`data/sp500-monthly.csv` (source in `data/SOURCE.md`) is 123 monthly index levels; `eval/sp500-monthly.mjs` (output `eval/sp500-monthly.out.txt`, test `sp500-monthly.test.mjs`) runs 122 log returns. The regimes are recalled, no source read, so this is a plausibility check, not a labelled test.

- `--model meanvar` (defaults) gives 3 changes: Jun 2003, Nov 2007 and Mar 2009. Segment sd: 0.054 (2000 to May 2003), 0.021 (the calm expansion), 0.060 (Nov 2007 to Feb 2009), 0.038 after. The calm-expansion and crash regimes are separated by volatility as well as level. Nov 2007 is a month after the October 2007 index peak, and Mar 2009 is the month of the market low; the Bayesian pass puts 56% on the 2009 change and about 7% on 2007.
- `--robust` gives the same three with the first cut at Mar 2003 (the 95% range on the default 2003 cut runs Jan 2003 to Jan 2004, so that cut is loosely dated).
- The plain `mean` model gives two: Sep 2008 (the Lehman month, mean -0.0008 to -0.0928) and Mar 2009.
- **Negative result:** `--bootstrap` reports no change at all on these 122 points. With block-resampled penalties the series is too short and too noisy for the 2007 and 2003 shifts to clear the bar. If you want to see the crash on a series this size, use the default or `--robust` and read the Bayesian probability before trusting the 2007 cut.
- Not tried: daily data, a longer span, `--spikes`. Whether the levels are a month's open, close or average is not stated by the source.

- **`--noise-floor-diff2`: a floor from second differences (2026-11-10, `node eval/noise-floor-diff2-sim.mjs`, output `eval/noise-floor-diff2-sim.out.txt`, test `noise-floor-diff2-sim.test.mjs`).** The first-difference floor of `--noise-floor k` is polluted by the drift it is meant to survive: median |step| is about the drift when drift exceeds the scatter, so its best k depends on the drift-to-noise ratio (the sim of 2026-11-09: k=1 perfect at noise sd 0.1, step lost at k=1.5). Add `--noise-floor-diff2` and the floor is `k * 0.578 * median |y[t] - 2y[t-1] + y[t-2]|`, where second differences cancel a straight drift and 0.578 keeps k on the same white-noise scale. Same 60 seeded series per cell as the 2026-11-09 sim (drift 0.2, AR(1) phi 0.5, one step of 4 noise sd, `--model trend`), now with noise sd 1, 0.3, 0.1 and 0.03: the first-difference floor at k=1 finds the step 59, 59, 60 and **0** of 60 (it swamps a step smaller than the drift), while the second-difference floor at **k=2** finds it 60, 59, 60 and 60 of 60 with 0.30, 0.37, 0.25 and 0.10 other cuts per series, the same behaviour at every noise level. At k=1.5 it leaves about 1.1 to 1.3 other cuts. So with a steady drift, k=2 on second differences is the setting that does not depend on the scale of the noise, which is the calibration the first-difference knob could not give. Caveats: synthetic, one drift, phi fixed at 0.5 (the second difference of AR(1) noise shrinks as phi rises, so the floor is lower and less protective at high phi; not run); not tried on the six real series or log GDP; a curved (not straight) drift leaves a constant in the second difference, which the floor then counts as noise. Off by default; needs `--noise-floor k`.

- **`--noise-floor-diff2` on six real drift series: not scale-free (2026-11-10, `node eval/noise-floor-diff2-real.mjs`, output `eval/noise-floor-diff2-real.out.txt`, test `noise-floor-diff2-real.test.mjs`).** The sim above was synthetic with a straight drift. On committed real series the second-difference floor at k=2 over-cuts: US real GDP (logs, 204 quarters) 20 cuts off, 14 with the first-difference floor at k=1, 7 at first-difference k=2, but **15 at second-difference k=2** (12 at k=3); Australian residents (89 quarters) 7 cuts off and **7 at second-difference k=2** (6 at k=3) against 2 and 1 for the first-difference floor; Mauna Loa CO2 30 off, 28 / 10 first-difference, 13 second-difference k=2, 10 at k=3. Real drift is curved and autocorrelated, so second differences carry the curvature and the floor stays near the raw noise level, which is the caveat the sim named and it bites. Where the series is already well behaved the settings agree (US electricity logs 5 and 5 at k=2, population 1 cut at 1890; global temperature 2 against 1 at k=2, so the k=2 second-difference floor adds a 1914 cut the first-difference floor drops). No series has a documented break here, so this measures over-cutting only, not detection. Reading: the 'k=2 is scale-free' claim holds for straight drift only; on real series use `--noise-floor` first-difference k=2 or the second-difference floor at k=3, and do not rely on diff2 k=2 for curved drift. Still wanted: a curvature-robust floor (third differences or a local-quadratic residual) and a real series with a documented step inside drift.

## `--consensus`: which changes do several settings agree on (2026-11-10)

The trials above found no single setting right on every series, so `--consensus [n]` (`consensus.mjs`) runs a panel of six (level; level under a trend with `--ar1`; the same with `--ar1 joint`; level with `--noise-floor 1.5`; `--model trend`; trend with the floor) and lists each change with how many settings put a change within `n` points (default 2% of the series, at least 2; anchored on the first cut of a group, so a staircase does not merge into one wide change). Tiers: every setting, half or more, fewer than half (candidates). It takes `--log`, `--period`, `--penalty`, `--min-segment`, `--column` and `--json`. Agreement among settings that share a likelihood family, not a probability.

**Measured** (`node eval/consensus-sim.mjs`, output `eval/consensus-sim.out.txt`, test `consensus.test.mjs`): the drifting series of the `--ar1 joint` entry above (n 120, drift 0.2, one step of 4 noise sd, 60 seeded series per cell, phi 0.2/0.5/0.8, noise sd 1 and 0.3). "Every setting" is clean (0.00 to 0.02 other cuts per series) but loses the step as phi rises, because plain `--ar1` loses it (found 56/60 at phi 0.2, 36/60 at 0.5, 25/60 at 0.8). "Half or more" finds the step 60/60 in every cell with 0.43 to 5.08 other cuts; against `--model trend` alone (59-60/60) that is fewer false cuts at phi 0.5 and 0.8 (1.95 vs 3.62, 2.47 vs 3.32, 3.67 vs 5.93, 5.08 vs 6.63) and more at phi 0.2 (noise sd 0.3: 1.02 vs 0.82). It is not the best single setting anywhere it matters: `--ar1 joint` alone finds 60/60 with 0.45 other cuts at phi 0.8, and trend with floor 1.5 gets 0.05 at phi 0.2. So it is the choice when you do not know phi, not an improvement on knowing it.

**On four real series (2026-11-10, `node eval/consensus-real.mjs`, output `eval/consensus-real.out.txt`, test `consensus-real.test.mjs`).** The panel's synthetic cells say nothing about real drift, so it was run on four committed real series. UK drivers killed or seriously injured (log, `--period 12`, 192 months): the seat-belt law's 1983-02 (the first full month under the law of 31 January 1983) is found by 6 of 6, as is 1974-12; 1973-11 (fuel rationing, new speed limits) by 5 of 6; the whole panel returns 8, 6, 6, 3, 3 and 3 cuts, so the level model alone would show a longer list. Nile (1871-1970): 1899 by 6 of 6 and nothing else, the cleanest case. Lake Huron (1875-1972): a level drop at 1925 by 4 of 6 (the 1920s drop is recalled, no paper read), but both `--ar1` settings return **0 cuts** on this strongly autocorrelated series, so no change reaches "every setting" and a true shift at 1925 is capped at 4 of 6; the list also has 1931 (mixed), 1889, 1956 and 1963 at 3 of 6. Global temperature (1880 on): 1946 and 2023 are each found by 3 of 6, nothing by every setting, and the other nine cuts sit at 2 of 6 or fewer. So on real data the "every setting" tier held both documented breaks it could reach and flagged nothing false, while "half or more" is a candidate list (on Lake Huron it holds four entries besides 1925, none of them documented). The tier does not rise with how real a break is: a documented change can sit in the middle tier because a setting that widens for autocorrelation cannot see it. Four series, no labelled set: not a detection rate. Still wanted: a real drifting series with a documented break, where `--ar1` does not remove everything.

**Third batch: a short series, a drifting quarterly one and a long drifting monthly one (2026-11-10, same script and test).** US airline passenger miles in logs (24 years): 1946 is found by 4 of 6 and is the only change listed; both `--ar1` settings return 0 cuts, as on Lake Huron. UK gas in logs with `--period 4` (108 quarters): the panel's cuts per setting are 5, 0, 0, 3, 1 and 0, and the recalled 1970 North Sea step appears once (1970Q2, 1 of 6, "few"), nothing reaches half: a negative result, the panel says "no agreed change" on a series whose growth shape changed gradually. US saving rate (574 months): 2008-07 is found by 6 of 6, but so are 1999-04 and 2005-01, which are stages of the long decline, not documented breaks; the panel returns 56, 7, 11, 42, 39 and 28 cuts and 28 changes at half or more. So "every setting" is not a guarantee of a documented break on a long drifting series: it held the documented one and two undocumented ones. Across the three batches every documented break except UK gas 1970 reached "most" or "every setting"; a labelled set is still missing, so this is not a detection rate.
**Fourth batch of real series (2026-11-10, same script and test).** Three more with a documented event, and one honest miss. `consensus-real.mjs` now also counts a documented date that falls inside a group's span (`from` to `to`), not only its label; this changed no earlier line. Puerto Rico daily deaths (1,201 days, tolerance 24): Hurricane Maria's landfall 2017-09-20 sits inside a group labelled 2017-10-07 (span 2017-09-20 to 2017-10-08) found by **6 of 6**; the label is the first cut of the group, 17 days after landfall, so read the span. The panel also lists three other changes by every setting (2016-02-28, 2016-12-22, 2017-02-03; none checked against an event) and 2018-03-17 by 5 of 6, so "every setting" held the documented shock and was not clean. Argentina's quarterly log-CPI change (79 quarters): the May 1989 hyperinflation peak 1989Q2 by **6 of 6**, along with 1985Q3 (the Austral plan, recalled, no paper read); the April 1991 Convertibility Law (1991Q2) is **not in the list at 3 of 6 or more**: the fall of inflation after it comes in steps the panel splits or misses, so a documented stabilisation is not found where a documented spike is. British coal-mining disasters (112 years): the panel returns one cut by 4 of 6, at 1887 (down), the year of the Coal Mines Regulation Act; the earlier trials dated this series' change near 1890, and the tolerance is 2 years, so 1887 against the literature's date is a three-year gap I did not resolve (no paper read). The panel has now been run on eleven real series. Still no labelled set, so still not a detection rate. I did not run the US personal saving rate monthly series as a documented case, but it is a warning: 574 months, panel cuts 56, 7, 11, 42, 39, 28, and 27 listed changes, 3 by every setting, none tied to an event; on long monthly series the "most" tier is a long list, not a short one.

**Sixth batch (2026-11-10, same script and test).** Two committed series not yet in the panel. Crimean War army disease death rate (24 monthly points, 1854-04 to 1856-03): the Sanitary Commission's arrival in March 1855 (recalled, no source read) is listed as 1855-04 by **5 of 6**, a one-month offset, with a rise at 1854-12 also at 5 of 6; the `--ar1` setting returns 0 cuts at this length. Canada total fertility rate (38 years from 1931): the postwar rise is listed at 1946 by 4 of 6; the fall after the late 1950s (1960, recalled) is **not** listed, the panel putting it at 1963 (4 of 6, down) and 1965 (3 of 6), three years late, and the `--ar1` setting again returns 0 cuts. Both are short series with no source read, so these are two more rows and not a detection rate; the pattern from earlier batches holds: a documented rise or spike is found, a documented gradual fall dates late.

**Four more real series (2026-11-10, same script and output; second batch).** Chosen because they drift and a break is documented outside this repository (none of the sources was read for this entry; the dates are recalled). US CPI inflation, quarterly (202 quarters): **1973Q3** (the October 1973 oil embargo) and **1981Q4** (the end of the Volcker disinflation, 1979-82) are each found by **6 of 6**, and here `--ar1` keeps its cuts (8 and 8 cuts), so this is the case the earlier entry wanted: a drifting real series where "every setting" reaches a documented break. It also lists 1975Q1 and 2008Q3 at 6 of 6 (both recalled as real shocks: the 1974-75 recession and the 2008 oil-then-crash swing). US real 3-month T-bill rate: 1980Q4 (the Volcker rise) and 1973Q3 by 5 of 6, with 2005Q4 and 2008Q3 at 6 of 6; the settings return 4 to 10 cuts. Saudi oil production (49 years): the 1982 fall (OPEC output cuts) by 5 of 6; `--ar1` returns 0 and 1 cuts on 49 points, so the other two documented-looking moves (1972 rise, 1986 recovery) stay at 3 to 4 of 6. Lakes Michigan-Huron: the late-1990s drop shows at 1999 in the annual means (176.72 m in 1998, 176.24 m in 1999) and is found by 4 of 6, again capped because both `--ar1` settings return 0 cuts; the list also holds 1928, 1931, 1952 and 1988 at 4 of 6. Tally over all eight series: "every setting" held the 4 documented breaks it could reach (seat-belt, Nile, two US inflation) and every other "every setting" entry is a recalled real shock or unexplained (1974-12, 1975Q1, 2005Q4, 2008Q3, 1999-04); where both `--ar1` settings return 0 cuts (Lake Huron, Michigan-Huron, Saudi oil) a true shift tops out at 4 to 5 of 6, so the tier there cannot be "all". Eight series, no labelled set, dates recalled: not a detection rate.

**Fifth batch: three more real series (2026-11-10, same script and test).** Australian arrivals from the US (log, `--period 4`, 127 quarters): 9/11's 2001Q3 is found by 3 of 6 and labelled down, but the Sydney Olympics' 2000Q3 is **not listed at 3 of 6 or more**; the panel's two "every setting" changes are 1986Q4 and 1989Q1 (Expo 88 and the Bicentennial are recalled, not checked), and it holds seven changes at half or more. Peace Bridge traffic (log, `--period 12`, 156 months): the one "every setting" change is 2008-11 (down; the 2008 recession, a documented shock inside the series), while the land-border passport rule of 2009-06-01 (the date in `data/SOURCE.md`) is **not in the list**: the recession swamps it, so the panel cannot separate two overlapping causes. Australian air passengers (annual, log, 47 years): 2002 (the Ansett collapse and 9/11 a year earlier) by 3 of 6, below 1991 at 5 of 6; both `--ar1` settings are 0 and 2 cuts, and the plain level model cuts 15 times. So of the three documented dates, one reached "most", none "every setting". Still no labelled set, so no detection rate; dates other than the passport rule are recalled.

**Real series, negative result:** on a smooth drifting series it does not rescue the staircase. Log US GDP gives 13 "half or more" changes and one cut all six agree on (1965Q3; the early-1970s slowdown shows as 1972Q1 and 1973Q1 at 4/6); austres has a dozen at 4/6 and none at 6/6. The panel's plain level model is the staircase, so any change a smooth series buys in four settings is a candidate, not a finding. Nile gives 1899 at 6/6. No documented break was tested beyond that; recalled dates only.

- **`--noise-floor-diff3`: a third-difference floor does not fix it either (2026-11-10, negative result, `node eval/noise-floor-diff2-real.mjs`, same output and test).** Third differences cancel a quadratic drift (scale 0.3166 keeps k on the white-noise scale), the curvature-robust floor the diff2 entry asked for. On the same six real series: US real GDP 16 cuts at k=2 and 12 at k=3 (first-difference k=2: 7); Australian residents 7 at k=2 **and** 7 at k=3 (first-difference k=2: 1); Mauna Loa 13 / 10; electricity 5 / 3; temperature 2 / 1; population 1 / 1. It matches second differences, so curvature was not the cause: real quarterly series carry autocorrelated, non-white wobble that differencing amplifies, so the high-order floor sits at the raw noise level. Left in as an option (`--noise-floor-diff3`, off by default); on real drift prefer first-difference k=2. Still wanted: a floor from a robust local fit rather than differences, and a real drifting series with a documented step. Six series, no detection claim.

**Two documented dates now read from a source (2026-11-11, `eval/consensus-real.mjs`, output and test unchanged apart from a label).** The flagship asked for a panel run where the documented break's source was actually read. For the two oldest cases it now is, to the extent of the R documentation pages (not the papers): Nile "with apparent changepoint near 1898 (Cobb 1978, Table 1)", and UK drivers "Compulsory wearing of seat belts was introduced on 31 Jan 1983" (`data/SOURCE.md`). The panel results stand: 1899 by 6 of 6 (the first low year, one after the documented "near 1898"), 1983-02 by 6 of 6 (the first full month under the law). Note the source says "near", not a year: a one-year offset on a hundred-point series is inside the tolerance of 2 and is not evidence the model dates the break better or worse than Cobb. The other sixteen series in the panel run are still recalled dates.


- **`--noise-floor-local`: a floor from a robust local fit (2026-11-10, partial result, `node eval/noise-floor-local-real.mjs`, test `noise-floor-local-real.test.mjs`).** The floor is the median absolute residual of centred 7-point line fits, rescaled by the white-noise value (0.627 sd, measured on 200,000 draws) so k keeps the first-difference scale. On the six real series at k=3: US real GDP 7 cuts (same as first-difference k=2; second and third differences gave 12 to 16), Mauna Loa 9 (differences 10 to 13), electricity 3, temperature 1, population 1, but Australian residents still 4 against 1 for first-difference k=2 and 7 with no floor. So a local fit is the best of the high-order floors on GDP and Mauna Loa and still leaves quarterly Australian population over-cut. Six series, no documented break and no detection claim. Off by default; wanted: a wider or quadratic window tried on Australian residents.
- **`--noise-floor-local [w]` and `--noise-floor-quad [w]`: a wider window works, a quadratic does not (2026-11-10, `node eval/noise-floor-local-window-real.mjs` and `node eval/noise-floor-local-window-sim.mjs`, test `noise-floor-local-window.test.mjs`).** The local floor now takes a window width (odd, default 7) and a quadratic fit (Savitzky-Golay centre weights). Its white-noise scale is now exact, not simulated: the centre residual has variance (1 - c0) sd^2, so the median |residual| is 0.6745 sqrt(1 - c0) sd (0.6245 for the 7-point line; the 0.627 it replaces gave the same cut counts on all six series). On the six real smooth series: Australian residents go 4 cuts (line w=7 k=3), 3 (w=13), **1 (w=25 k=2, the same 1981.25 cut as first-difference k=2)**, and 2 at w=25 k=1.5; log US GDP 1 cut at w=25 k=2 (1965Q1) and 4 at k=1.5; (k=2 / k=1.5 at w=25) Mauna Loa 10 / 12, electricity 3 / 5; temperature 1; population 0. Quadratic fits make it worse (Australian residents 4 to 7 cuts at every window): a quadratic follows the curve, so its floor is smaller. So the over-cut comes from slow wobble that a narrow fit absorbs, not from curvature left in the residuals. **Synthetic drift with a known step at phi 0.2, 0.5, 0.8** (the open question; same design as `noise-floor-ar1-joint-sim.mjs`, noise sd 1, 0.3 and 0.1, 60 seeded series per cell): `line w=25 k=2` finds the step in 55 to 60 of 60 in all nine cells with 0.00 to 0.12 other cuts; first-difference k=1.5 finds it in 22 to 31 of 60 at noise sd 0.1 (its floor follows the drift, not the noise) and leaves 3.15 other cuts at phi 0.8, sd 1; `--ar1 joint` finds it 55 to 60 of 60 with 0.6 to 1.2 other cuts; quadratic w=25 k=3 misses it often at low phi (20 to 36 of 60). **Cost on the six documented-break real series:** Nile 1899 kept; New Haven 1944 lost at k=2, kept at k=1.5; the Peace Bridge 2009-06 passport rule lost at both (as with first-difference k of 1.25 or more); Lake Huron 10 changes to 1; UK gas 0. A series no longer than the window (airmiles, 24 points) falls back to the first-difference floor, silently. Off by default: one drift and one step size, twelve real series, and still no real drifting series with a documented break. Wanted: that series, and `line w=25` beside `--ar1 joint` on it.

## A labelled benchmark: the Turing Change Point Dataset (2026-11-10)

The `--consensus` entries above kept saying "no labelled set, so not a detection rate". The Turing Change Point Dataset (TCPD; van den Burg and Williams 2020, arXiv:2003.06222, MIT code, per-series data licences) is one: real series, each marked by five annotators, with a published benchmark (TCPDBench) that scores 14 methods in a "default" experiment (no per-series tuning) by F1 (margin 5 points) and segmentation cover. `sh eval/tcpd-fetch.sh tcpd-data && node eval/tcpd.mjs tcpd-data` fetches the 31 univariate series that ship in the TCPD repository (11 of the 42 need a download from their source and are left out; `uk_coal_employ` has 2 missing values, carried forward), runs this detector with fixed settings (no `--log`, no `--period`, nothing read from the series), and scores it with a line-for-line port of TCPDBench's `metrics.py` (`eval/tcpd-metrics.mjs`; test `tcpd-metrics.test.mjs` runs its doctests). The data is not committed (several series are GPL or CC BY-SA); the output is, in `eval/tcpd.out.txt`.

**The port is checked against the published numbers:** TCPDBench's own default predictions for binseg, pelt, bocpd and zero on these series (121 runs), cleaned as its `summarize.py` cleans them (indexes 1 to n-2), re-score to the published F1 and cover within 2.2e-16.

**Mean over the 31 series (F1 / cover; published methods' failed runs count 0):**

| setting | F1 | cover |
|---|---|---|
| binseg (published, best F1) | 0.714 | 0.671 |
| **this detector, BOCPD default** | **0.706** | 0.634 |
| pelt (published) | 0.704 | 0.672 |
| **`--consensus`, every setting** | **0.702** | 0.633 |
| zero (no change at all) | 0.663 | 0.568 |
| **level+volatility (`--model meanvar`)** | 0.652 | 0.505 |
| **`--consensus`, half or more** | 0.652 | 0.538 |
| **level model, the page's default** | **0.477** | 0.374 |

So the **default level model scores below reporting no change at all** on real data: it over-cuts long smooth or trending series (406 cuts on the 816-month US population, 178 on `bank`, 65 on Gapminder fertility). That is open item (0) of the flagship, now measured on an outside benchmark rather than on series picked here. The BOCPD detections and the every-setting consensus both clear the "zero" baseline and sit within 0.012 F1 of the best published method. "Zero" is a hard baseline here: in the published scores on these 31 series it beats 9 of the 13 other methods on F1, because the F1 counts the start of the series as a found change and several series were mostly left uncut by the annotators.

**Agreement tiers as a detection rate (the flagship's ask).** Of the consensus changes (default tolerance), the share within 5 points of a change an annotator marked: every setting 23 of 59 (39%; 18 by a majority of annotators), half or more 90 of 319 (28%), fewer than half 51 of 206 (25%). The order holds, but the gap is small and no tier is reliable: most "every setting" changes on these series are on the over-cut smooth ones. Of the 59 locations a majority of annotators marked, 17 are reached by an every-setting change, 38 by a half-or-more change, 2 only by a fewer-than-half one, 2 by none: the panel's recall is high, its precision is the problem. These rates are now printed under every `--consensus` report (`TCPD_RATES` and `TCPD_NOTE` in `consensus.mjs`; a test checks them against `eval/tcpd.out.txt`), replacing "the one to trust" with a number.

**Support threshold, split half.** Keeping a change only when k of 6 settings found it peaks at k = 4 or 5 (F1 0.706 / 0.709 on all 31). Chosen on alternate halves of the series: k = 6 chosen on half A scores 0.693 on half B (zero 0.620, binseg 0.737); k = 4 chosen on B scores 0.679 on A (zero 0.703, binseg 0.692). So the threshold is not stable across halves of 15 to 16 series, and a held-out consensus does not reliably beat "no change". Nothing was tuned into the defaults.

Caveats: Nile and UK seat belts are in TCPD and were used in this repository's earlier trials, so two of 31 series are not unseen; the 11 series that need a download (including the multi-dimensional ones) are not scored; TCPD scores by the annotators' marks, which include series where the annotators disagree. Next: a default that does not over-cut smooth series, measured here by split half (the noise-floor and `--ar1` options are the candidates), and the 11 download-only series.

## A default chosen by split half on TCPD, and an over-cut warning (2026-11-10)

The flagship's item (a) asked for a level-model default that beats "no change" on TCPD, chosen by split half. `node eval/tcpd-defaults.mjs tcpd-data` (output in `eval/tcpd-defaults.out.txt`) scores 12 level-model settings, written down before any was scored: the current default; the BIC penalty times 2, 4 and 8; noise floors of 1 and 2 times the median step; 1 on second differences; 2 times the local-line scale over 25 points; `--ar1`; `--ar1 joint`; `--ar1` with that local floor; `--ar1` with a 10-point minimum segment. BOCPD's detections are shown beside them. The halves are the same as above (alternate series in name order).

| setting | F1 half A (16) | F1 half B (15) | F1 all | cover | cuts |
|---|---|---|---|---|---|
| current default | 0.429 | 0.528 | 0.477 | 0.374 | 1329 |
| penalty 8x BIC | 0.603 | 0.725 | 0.662 | 0.550 | 729 |
| noise floor 2, local 25 | 0.641 | 0.738 | **0.688** | 0.594 | 460 |
| `--ar1` + noise floor 2, local 25 | 0.732 | 0.624 | 0.680 | 0.621 | 50 |
| `--ar1 joint` | 0.603 | 0.731 | 0.665 | 0.610 | 451 |
| BOCPD detections | 0.704 | 0.708 | 0.706 | 0.634 | 161 |
| zero (published) | 0.703 | 0.620 | 0.663 | 0.568 | 0 |
| binseg (published) | 0.692 | 0.737 | 0.714 | 0.671 | |

**Answer to (a): no level-model setting chosen by split half reliably beats "no change".** Chosen on A, `--ar1` with the local floor scores 0.624 on B (zero 0.620); chosen on B, the local floor scores 0.641 on A (zero 0.703). Over all 31, the local floor minus zero is +0.025 F1 (95% bootstrap interval -0.093 to 0.136; better on 15 series, worse on 15). BOCPD's detections are the most stable (0.704 and 0.708 on the two halves; minus zero +0.043, interval -0.061 to 0.137, sign test p 0.052), still not a significant win.

**But the local floor clearly beats the current default:** +0.211 F1 (95% interval 0.147 to 0.280), better on 27 series and worse on 1. So the result is a product change, not a new default: the level model's output is pinned by about a hundred real-series tests and the page's documented behaviour, and the evidence says the floor beats today's default, not that it beats doing nothing.

**What shipped.** An over-cut check (`overcutWarning` and `overcut` in the result; printed by the CLI, the page and the analyst report): when the plain level model (no floor, no `--ar1`, no trend, period or log) cuts 5 or more times, it reruns the same search with the floor at twice the scatter about a local 25-point line, and if that halves the count it says so and lists the refit's dates. The page gets a matching control, "Smooth or trending series", that switches the floor on. On TCPD the warning fires on 20 of 31 series; there, following it raises F1 from 0.375 to 0.650 (zero 0.639, binseg 0.656). Following it wherever it fires lifts the all-series F1 from 0.477 to 0.655 (+0.177, 95% interval 0.112 to 0.248; better on 20 series, worse on 0). The warning's threshold (5 cuts, halved) was set before scoring and not tuned. On the 11 series where it stays quiet the floor would also help (0.663 to 0.756), so the trigger is conservative.

Limits: 31 series is a small sample and the bootstrap is over series; the warning was checked on TCPD, which also chose the floor, so its numbers there are in-sample (the split-half rows are the out-of-sample evidence); a smooth logistic curve with white noise does not trigger it (a local line follows the bend), random walks and AR(1) noise do (`overcut.test.mjs`).


## Held out: the TCPD series nobody tuned on, and agreed changes on the page (2026-11-10)

Every choice above (the default panel, the over-cut warning and its refit, the split-half table) was made on the 31 univariate series that TCPD ships in its repository. TCPD has 42 annotated series; the other 10 are built by scripts that download from web.archive.org, which this sandbox cannot reach (and one of the 32 shipped files is multi-dimensional, which is why earlier sections said 11). `sh eval/tcpd-fetch.sh tcpd-data` now also fetches those 10 built files from a public copy at a pinned commit and keeps each only if its md5 is in TCPD's own `checksums.json`; all 10 matched, so they are byte-identical to TCPD's build. They go in `tcpd-data/heldout/`, so `eval/tcpd.mjs` and `eval/tcpd-defaults.mjs` still score the same 31. `node eval/tcpd-heldout.mjs tcpd-data` (output in `eval/tcpd-heldout.out.txt`) scores the frozen settings on the 7 univariate ones (bitcoin, iceland_tourism, measles, ratner_stock, robocalls, scanline_126007, scanline_42049); apple, bee_waggle_6 and occupancy have 2 to 4 dimensions and are listed, not scored, since the detector is univariate.

| setting | F1 held out (7) | cover | F1 shipped (31) | F1 pooled (38) |
|---|---|---|---|---|
| `--consensus` every setting | **0.711** | **0.742** | 0.702 | 0.704 |
| BOCPD detections | 0.622 | 0.558 | 0.706 | 0.690 |
| level, following the over-cut warning | 0.497 | 0.394 | 0.655 | 0.625 |
| level (plain) | 0.296 | 0.191 | 0.477 | 0.444 |
| zero (published) | 0.639 | 0.597 | 0.663 | 0.658 |
| binseg (published) | 0.727 | 0.731 | 0.714 | 0.716 |

What held and what did not:

- **The over-cut warning replicates.** It fired on 6 of 7 held-out series; following it beat the plain level model on all 6 (+0.201 F1, 95% bootstrap interval 0.098 to 0.297, sign test p 0.031). It still does not beat reporting no change (-0.142, interval -0.436 to 0.120).
- **BOCPD did not hold up.** The flagship's item (b) proposed a BOCPD-led page summary because BOCPD was the most stable on the two shipped halves. Held out it falls to 0.622, below "no change": on measles (991 weekly counts) it reports 27 changes where four of five annotators mark none (see "Measles" below). Item (b) is answered no.
- **The every-setting consensus held up.** 0.711 held out against 0.702 in sample, the best cover of any method on these 7 (0.742, binseg 0.731), and 0.704 pooled over 38, second only to binseg (0.716). It cuts conservatively: on measles it keeps 1 change (F1 0.643) where the level model keeps 167 (0.024). Against "no change" it is +0.072 held out (interval -0.097 to 0.263; better on 3, worse on 1), not a significant win on 7 series.

**What shipped.** The page now runs the six-setting panel whenever the level model is chosen and leads the results with an "Agreed changes" line (`agreedText` in `consensus.mjs`): the changes every setting finds, with direction, then the held-out figures it is quoting (F1 0.71 vs 0.30 for the single level model in the table below it, 0.64 for reporting nothing). When no change is agreed, it says so and calls the table's changes candidates. The table and chart are unchanged, so the hundred-odd real-series tests pinned to the level model still hold. `agreed-text.test.mjs` checks the wording and that the quoted figures match `eval/tcpd-heldout.out.txt`. The panel runs in about 0.2 s on the Nile example in headless Chromium.

Limits: 7 held-out series is a very small sample (two are image scanlines); the bootstrap is over series; the mirrored files were checked by md5 against TCPD's published checksums, not rebuilt from source here.

## Agreed changes in the CLI and the report (2026-11-10)

The held-out check above moved the page to lead with the changes every setting agrees on. The CLI's
text output and the branded change report now do the same, so the three surfaces say one thing first.

- **CLI.** With the level model (the default, or `--model mean`) and text output, `cli.mjs` runs the
  six-setting panel with the options the panel shares (`--column`, `--label-column`, `--log`,
  `--period`, `--penalty`, `--min-segment`) and prints the `agreedText` paragraph first, then
  "Level model alone" and the old output unchanged. `--no-agreed` turns it off; other models and
  `--json` are unchanged (agents call `--consensus` for the panel's JSON).
- **Cost, measured here 2026-11-10** (wall clock, one run each, on `data/treering.csv` cut to length):
  1,000 points 1.6 s with the panel vs 0.6 s without; 2,000 points 5.3 s vs 1.1 s; the full 7,980
  points 32 s vs 5.7 s; `data/djia-returns.csv` (8,609 rows) 20 s vs 3.1 s. So above 2,000 points
  (`AGREED_MAX_POINTS`) the CLI prints that the panel was not run and how to run it, instead of
  making every long run several times slower. The page has no such cap yet: a long series pasted
  there pays the same cost in the browser (next step below).
- **Report.** `changeReportHtml(r, { agreed })` puts the same paragraph at the top of "What
  changed" and labels the summary after it "Level model alone"; the page passes the paragraph it
  just showed, and `sample-change-report.html` is rebuilt with it (Nile: all 6 settings agree on
  1899, down). The paragraph is escaped like every other typed string.
- The paragraph's wording changed from "the single level model in the table below" to "the single
  level model whose results follow", which is true on all three surfaces.

Tests: `cli.test.mjs` (lead line on the Nile example, `--no-agreed`, another model, a CSV with
`--column` whose unset options keep their defaults, the length cap) and `report.test.mjs` (lead
paragraph, escaping, absent when not passed).

Next: the same length cap on the page (or run the panel in a worker: done 2026-11-11, "Agreed changes off the main thread"), and a check that the
"agreed" summary on real long series (the TCPD ones above 2,000 points) is worth its cost.

## Measles: the consensus loses F1 by cutting, not by missing (2026-11-10)

The flagship asked why the every-setting consensus "misses measles' marked change" (F1 0.643 against 0.947 for amoc). The annotations answer the premise: four of TCPD's five annotators marked **no change** on the 991 weekly measles counts (England and Wales, 1948 to 1966), and one marked week 141. Reporting nothing scores 0.947, and amoc and binseg score exactly that because their one cut is the last point, which the metric drops. So nothing was missed; the consensus loses F1 by keeping one cut. `node eval/tcpd-measles.mjs tcpd-data` (output in `eval/tcpd-measles.out.txt`) shows where and why.

- **The cut is the fall of the largest epidemic.** It sits at week 693 (April 1961), one week after the series' highest week (41,005 cases). Measles here runs on a two-year epidemic cycle (yearly means alternate between about 3,000 and 12,000 cases), and 1961 is the biggest year. Five settings cut within a week of 693; the sixth (level under a trend, AR(1) widened, 2 cuts in all) cuts at 702, which the default 20-point tolerance (2% of n) counts as the same change. So the one agreed change is a cycle peak, agreed on partly through a wide tolerance.
- **Two declared options remove it.** With `--period 52` (the yearly season any user of weekly data knows) or `--log` (counts spanning a 78-fold range), no change is agreed and F1 is 0.947, equal to "no change". `--period 104`, the epidemic cycle itself, does worse (17 agreed cuts, F1 0.105): the cycle's amplitude varies too much for a fixed two-year profile.
- **Neither is a default.** One series cannot choose one, so both were tried on every TCPD series they apply to. `--log` on all-positive series whose max/min ratio is at least R helps on the 31 shipped series (R 30: 0.702 to 0.709) but hurts on the 7 held out at every R tried (R 100, 30, 10, 3: 0.711 to 0.699, 0.705, 0.673, 0.673; bitcoin, ratner_stock and scanline_42049 get worse). Declaring the calendar season the time stamps imply (monthly 12, weekly 52) on the 11 series that have one: better on 3 (construction, seatbelts, measles), worse on 3 (jfk_passengers, lga_passengers, us_population), the same on 5, mean +0.023 F1. That is no evidence either way.

**What changes.** Nothing in the engine; this is a measurement and a negative result. Item (b) is answered: the consensus did not miss a change, and the cures that fix measles do not generalise. For a user, the practical reading is the one the page already gives: declare a season you know (`--period`, page: seasonal period), and on weekly epidemic counts the agreed changes then match the annotators. Limits: one series motivated both cures; 11 dated series and 7 held-out series are small samples; F1 here is TCPD's with margin 5.


## Several columns at once: the three multi-dimensional TCPD series (2026-11-10)

Every TCPD script above left out apple (close and volume, 622 days), bee_waggle_6 (x, y and the sine and cosine of a dancing bee's heading, 609 frames) and occupancy (four room sensors, 509 readings), because the detector took one column. `multivariate.mjs` now takes several columns measured at the same points, two ways:

- **columns: every setting** (`columnConsensus`): the six-setting consensus on each column alone, keeping the changes every setting agrees on, merged across columns (anchored grouping within the consensus tolerance, 2% of n). Each merged change names the columns that found it.
- **joint** (`multiPelt`): one segmentation for all columns. A segment's cost is the sum of the engine's own per-column costs (`makeCost`, each column scaled by its robust noise sd) and the BIC penalty counts what one change adds: the location plus one level per column (`mean`, (1 + d) log n) or a level and a volatility per column (`meanvar`, (1 + 2d) log n). With one column it is exactly `pelt()` (tested on Nile).

The settings, the primary one ("columns: every setting") and the tolerance were written into `eval/tcpd-multi.mjs` before any of the three series was scored, and nothing was changed after. `node eval/tcpd-multi.mjs tcpd-data` (output in `eval/tcpd-multi.out.txt`), F1 at margin 5 beside the TCPDBench default methods that run on several dimensions:

| setting | apple | bee_waggle_6 | occupancy | mean F1 | mean cover |
|---|---|---|---|---|---|
| columns: every setting (primary) | **0.741** | 0.124 | 0.696 | 0.521 | 0.367 |
| columns: every setting, half the columns | 0.741 | 0.080 | 0.789 | 0.537 | 0.387 |
| joint level | 0.171 | 0.050 | 0.295 | 0.172 | 0.119 |
| joint level+volatility | 0.365 | 0.120 | 0.494 | 0.326 | 0.178 |
| bocpd (published) | 0.513 | 0.121 | **0.807** | 0.480 | 0.335 |
| bocpdms (published) | 0.382 | 0.388 | 0.461 | 0.410 | **0.554** |
| ecp (published) | 0.513 | 0.124 | 0.750 | 0.462 | 0.317 |
| zero, "no change" (published) | 0.594 | **0.929** | 0.341 | **0.621** | 0.517 |

What it says:

- **The primary setting beats every published multi-dimensional default on mean F1** (0.521 against bocpd 0.480, ecp 0.462, bocpdms 0.410) **but not "no change" (0.621).** That one is carried by bee_waggle_6, where four of five annotators mark nothing and every method that reports anything scores near 0.12. On apple it is the best of any method (0.741; it dates 54, 91, 321 and 535 within two points of annotator marks); on occupancy it is behind bocpd (0.696 against 0.807).
- **The joint fit over-cuts real series**: 95 cuts on apple, 117 on bee_waggle_6, 132 on occupancy, as the univariate level model over-cuts smooth series. A stock price, a dancing bee's position and a room's temperature are not steps in white noise.
- **Where the joint fit earns its place** (`node eval/multi-sim.mjs`, output in `eval/multi-sim.out.txt`, 100 seeded series per cell, n 200, white noise, one step in every column at t = 100): a step of 0.5 noise sd in each of 4 columns is found by the joint fit in 76% of series (0.23 other cuts each) and by the column-by-column consensus in 0%; at 8 columns, 92% against 1%. With no step, the joint fit reports 0.00 to 0.08 false cuts per series. The consensus needs about 1.5 sd per column. So the two are complementary: the consensus is the safe reading on real, smooth data; the joint fit finds small shared shifts in data that really is level-plus-noise (a residual series, a controlled experiment's sensors).

**What shipped.** `cli.mjs --columns [a,b,...]` (no list: every numeric column) prints the column-by-column agreed changes first, then the joint segmentation with each column's shift in its own noise sds (`--model meanvar` for level and volatility; `--json` for the full result). Missing cells are carried forward so every column keeps its row indexes. `multivariate.test.mjs` pins the one-column identity, the penalty, the parser, a 0.75 sd step shared by four columns that the joint fit finds, the CLI, and the figures above.

Limits: three series is a panel, not a benchmark (one series moves the mean F1 by a third); the half-the-columns variant was listed in advance but is not the primary, so its slightly higher mean is not a finding; the joint cost assumes independent columns (no cross-correlation) and uses the plain level model with no trend, AR(1) or noise floor. On the page since 2026-11-11 (next section).

## Several columns on the page, and a joint over-cut warning (2026-11-11)

The page now has a **What to analyse** box: "Several columns measured at the same points" runs `analyzeMulti` on the pasted CSV (every numeric column, or the ones named in the new **Columns** box) and shows:

- one small chart per column on a shared time axis, the column-by-column agreed changes as solid blue marks on the columns that found them, the joint segmentation as dashed red marks with its segment means;
- the agreed changes table (date, how many columns, which), led as the safer reading;
- the joint table with each column's shift in its own noise sds, and under the level-and-volatility model the column's sd after over before, so a volatility change no longer reads as "+0.0" (bold at 1 sd of shift or a 1.5x sd change either way);
- a per-point CSV (each column, the joint segment number, and which columns have an agreed change at that row).

Only the level and level-and-volatility models take several columns; the page says so for the others. The run takes about 5 s on 1,751 points by 3 columns (the six-setting check per column), so a "Working" note paints first.

**Example: the franc, the pound and the yen, 2012 to 2018** (`data/fx-daily-returns.csv`, daily log returns, Federal Reserve H.10; loaded on click from `example-fx.mjs`, which a test pins byte for byte to the data file). Level and volatility, BIC:

- agreed, column by column: **2015-01-20 in chf only** (the Swiss National Bank dropped its floor on 2015-01-15; the six settings put the merged change three trading days on) and **2016-06-24 in gbp only** (the day after the Brexit referendum);
- joint: 9 changes, among them 2015-01-15 to the day (chf -1.09, -2.2 sd) and 2015-01-30, 2016-06-16 and 2016-07-06 bracketing the vote in gbp (+-1.4 sd); the other five move every mean by under 0.3 sd and are volatility regimes, which the new sd column shows.

**Joint over-cut warning** (`jointOvercut`, `JOINT_OVERCUT_EVERY` in `multivariate.mjs`; page and CLI text). The joint fit is called over-cut when it has more than one change per 50 points (and more than 3). The bar was set from measurements already in the repository, before any new series was scored: on white noise with one shared step (`eval/multi-sim.out.txt`, every cell) the joint fit averaged at most 1.5 cuts per 200 points; on the three labelled TCPD multi-column series (`eval/tcpd-multi.out.txt`) the level fit made one cut per 4 to 7 points and the level-and-volatility fit one per 13 to 21, so the warning fires on all six of those fits. Checked afterwards: German unemployment, unadjusted and adjusted (120 quarters, two smooth series), 22 joint cuts, warned; the currency example, 9 cuts on 1,751 points, not warned; 20 seeded white-noise sets of 4 columns with a 1 sd shared step, one joint cut each and none warned (`multi-view.test.mjs`).

Limits: the warning is a count, not a test; it says to prefer the column-by-column list, it does not fix the joint fit. The joint fit itself is unchanged (independent columns, plain level cost); a noise floor or trend per column inside the joint cost is the next step. In the branded report since 2026-11-11 (section "Several columns in the branded report").

## A joint fit that survives smooth columns: a noise floor per column (2026-11-11)

The joint fit took each column's noise from its step-to-step scatter, so a smooth column (a stock price, a bee's position, a room's temperature) looked almost noiseless and every bend cleared the penalty: 95 to 132 cuts on the three TCPD series. `multivariate.mjs` now sets each column's noise separately (`columnSigmas`; `multiPelt(cols, { floor, ar1 })`):

- **`floor: 'auto'`** (the new default for the level model on the page, the CLI and `analyzeMulti`): a column gets the univariate floor, twice the scatter about a local 25-point line, only if its own level fit over-cuts (5 or more cuts that the floor at least halves). That is the univariate over-cut test from `analyze()`, copied, not tuned. A white-noise column keeps its plain sd.
- **`floor: k`**: every column floored at k times the local-line scatter. **`ar1: true`**: each column's sd raised to its AR(1) long-run sd (the plain `--ar1` correction, per column). **`floor: 'off'`**: the old fit.

The six settings, the primary (`auto`) and a decision rule were written into `eval/tcpd-multi-floor.mjs` before any was scored: the default becomes `auto` if it beats the plain joint fit's mean F1 on the three series **and** keeps every white-noise hit rate in `eval/multi-floor-sim.mjs` within 5 points of the plain fit's. `node eval/tcpd-multi-floor.mjs tcpd-data` (output `eval/tcpd-multi-floor.out.txt`), F1 at margin 5:

| joint level fit | apple | bee_waggle_6 | occupancy | mean F1 | mean cover | cuts |
|---|---|---|---|---|---|---|
| plain (before) | 0.171 | 0.050 | 0.295 | 0.172 | 0.119 | 95/117/132 |
| **floor auto (primary, now default)** | 0.378 | 0.140 | 0.342 | **0.286** | 0.233 | 20/39/89 |
| floor 2, every column | 0.378 | 0.140 | 0.498 | 0.338 | 0.249 | 20/39/51 |
| floor 1, every column | 0.242 | 0.086 | 0.414 | 0.247 | 0.186 | 57/66/79 |
| ar1 per column | 0.339 | 0.061 | 0.845 | 0.415 | 0.359 | 23/94/10 |
| ar1 + floor 2 | 0.709 | 0.194 | 0.789 | 0.564 | 0.485 | 4/27/6 |
| columns: every setting (unchanged reference) | 0.741 | 0.124 | 0.696 | 0.521 | 0.367 | 7/29/10 |
| zero, "no change" (published) | 0.594 | 0.929 | 0.341 | 0.621 | | 0 |

`node eval/multi-floor-sim.mjs` (output `eval/multi-floor-sim.out.txt`, same seeds as `eval/multi-sim.mjs`, 100 series per cell):

- **White noise, one shared step:** `auto` matches the plain fit's hit rate in all 20 cells (1 to 8 columns, steps 0 to 1.5 sd) and its false cuts in 19 (one cell 0.26 to 0.23). A floor on every column costs the power the joint fit exists for: at 0.5 sd over 4 columns, 76% found plain and with `auto`, 3% with floor 2.
- **Random walks, one 3-sd shared step:** false cuts per series drop from 18-37 to 4-9 with `auto` (hits 92-100% to 51-78%); `ar1` cuts them to about 1-2 but finds the step in only 17-25%.
- **AR(1) rho 0.9, one 3-sd shared step:** false cuts 18-33 to 2-5 with `auto`; `ar1` 0.2-0.6, hits 18-51%.

What it says:

- **The rule is met, so `auto` is the default.** Mean F1 0.172 to 0.286, cuts down by a third to four fifths, and no cost on white noise. Over-cut columns: both apple columns, all four bee columns, two of four occupancy sensors (the output lists the sd each got).
- **`auto` is still below the column-by-column reading (0.521) and "no change" (0.621).** The page keeps leading with the agreed changes, and the over-cut warning still fires on occupancy (89 cuts in 509 points).
- **AR(1) plus floor 2 on every column scored best here (0.564), above the consensus.** It was listed in advance but is not the primary, so that is a lead, not a finding: three series is a panel, and in simulation it gives up most of the power on smooth columns. It ships as a page and CLI option ("Autocorrelation and a floor on every column (fewest cuts)", `--joint-floor 2 --joint-ar1`), to be tested on fresh multi-column data before it is anything more.
- **A real pair checked after the rule was applied:** German unemployment, unadjusted and adjusted, quarterly 1962-1991 (`data/german-unemployment.csv`). Plain joint fit: 22 changes and the over-cut warning. With `auto` (both columns floored): 1974Q4 (+3.4 points, the first oil shock's recession), 1982Q1 (+4.3, the early-1980s recession) and 1989Q2 (-1.8), no warning. With AR(1) as well: one change, 1981Q3. Pinned in `multi-view.test.mjs`.

**What shipped.** `columnSigmas` and the `floor`/`ar1` options of `multiPelt`; `analyzeMulti` defaults to `floor: 'auto'` for the level model and reports `floor`, `ar1` and `flooredColumns`; the text output and the page summary name the floored columns; CLI `--joint-floor auto|off|k` and `--joint-ar1`; a page select, "One segmentation for all columns: noise per column". `eval/tcpd-multi.mjs` and `eval/multi-sim.mjs` call `multiPelt` with no floor, so their figures above are unchanged. Tests: `multivariate.test.mjs` (auto floors a random walk and leaves white noise alone, the shared step survives, the pre-registered figures and the white-noise equality from the output files) and `multi-view.test.mjs` (German unemployment both ways).

Limits: three labelled series; columns still independent (no cross-correlation); no trend term per column (a floor is a blunt answer to a trend); the level-and-volatility joint fit is unchanged.


## Agreed changes off the main thread (2026-11-11)

The page ran the six-setting "Agreed changes" panel on the main thread, straight after the main
analysis and with no length cap (the CLI skips it above 2,000 points). The panel costs about four
times the main analysis, so a long series froze the tab: on the 7,980-point tree-ring series
(`data/treering.csv`) nothing could be clicked or scrolled for about half a minute.

- **What changed.** `consensus()` is now `runSetting` (one setting) plus `mergeConsensus` (the
  grouping and tiers), with the same result, pinned in `agreed-worker.test.mjs` for any finishing
  order. `consensus-worker.mjs` runs one setting. The page shows the main results first, then
  starts up to `navigator.hardwareConcurrency` module workers (at most six), hands out the slowest
  settings first (the two AR(1) settings, then level, noise floor, the trend pair: measured 7.0,
  6.9, 5.6, 4.8, 1.4 and 1.0 s on tree-ring in Node), shows "k of 6 settings done", and merges
  when all are back. Analyzing again stops an unfinished panel. Without workers (an old browser, a
  `file:` page) it runs on the main thread as before, but only up to 2,000 points; above that it
  says it was not run and points to `--consensus`. A worker error falls back the same way. Usage
  counter `agreed_run` counts finished panels, locally like the others.
- **Measured** (`node eval/agreed-worker-browser.mjs [points | file.csv]`, headless Chromium,
  4 cores, output `eval/agreed-worker-browser.out.txt`): the page's panel text is identical to
  `consensus()` in Node on every input. Wall clock from the click:

  | series | main results shown | panel done | `consensus()` alone, one thread | a 50 ms timer during the panel |
  |---|---|---|---|---|
  | 1,500 seeded points, three steps | 0.3 s | 1.2 s | 1.4 s | 2 ms late |
  | 6,000 seeded points | 3.3 s | 8.2 s | 12.2 s | 33 ms late |
  | tree-ring, 7,980 points | 6.5 s | 16.0 s | 27.2 s | 80 ms late |

  Before, the tab was blocked for the main analysis plus the one-thread panel (tree-ring: about
  34 s); now it is blocked only for the main analysis, and the panel finishes in about a third of
  its one-thread time after it. The 80 ms on tree-ring is the main thread sharing four cores with
  four workers; clicks and scrolling still answer.
- **Not done.** The main analysis itself is still on the main thread (6.5 s on tree-ring); the
  "level" setting repeats the main analysis when the page's options are the defaults and could
  reuse it; the CLI panel could use `worker_threads` the same way to lift its 2,000-point cap.
  Whether the agreed summary is worth its cost on long real series (the TCPD ones above 2,000
  points) is still open.

## Several columns in the branded report (2026-11-11)

The branded change report (the planned paid extra, dark until `checkout.mjs` has a link) now covers
the several-column view too. With **What to analyse** set to several columns, **Open the report**
builds `multiReportHtml` (`multi-report.mjs`) from the last run, without rerunning it, on the same
letterhead as the one-column report (`reportShell` in `report.mjs`, shared, so the colour and logo
rules and the escaping are the same code; the one-column report's output is byte-identical, pinned
by its sample test). In order:

- the agreed changes, column by column and merged, as the lead (the reading that held up on the
  labelled multi-column TCPD series), then the column count, point count and joint change count;
- the over-cut warning when the joint fit trips it;
- the page's small-multiples chart (`multiChartSvg`, the same function);
- the merged agreed-changes table, with the merge tolerance stated;
- **each column on its own**: how many agreed changes it has and their dates (new: the page shows
  these only as marks on the chart);
- the one-segmentation table with each column's shift in its own noise sds and, under level and
  volatility, the sd ratio; the model, penalty and noise floor are stated above it;
- the analyst's notes, and assumptions written for several columns: the six settings, the
  independence assumption of the joint fit, that a change seen in several columns is not evidence
  that one caused another, and that a change does not show its cause.

**Sample** (`sample-multi-change-report.html`, built by `node build-sample-report.mjs` from the
bundled FX returns, an invented firm; linked from `change-report-for-analysts.html`, `noindex`).
Its agreed changes are the franc on 2015-01-20 and the pound on 2016-06-24, as in the section above;
the notes name the Swiss National Bank's 2015-01-15 floor removal and the 2016-06-23 referendum.

**Checked.** `multi-report.test.mjs`: the report's sections, the chart equal to the page's,
escaping of column names, labels and typed text, the colour and logo restrictions, the empty case,
the sample equal to what the code builds now, and the page wiring. `eval/multi-report-browser.mjs`
(headless Chromium, output `eval/multi-report-browser.out.txt`): loads the FX example on the page,
shows the report card as an unlocked key would, opens the report, and compares it with
`multiReportHtml` run in Node on the same input: equal, 74,364 characters, no page errors.

**Not done.** The CLI has no report output for one column or several (the report is the paid
extra; an open-source CLI flag would be honest but is the owner's pricing call). A wide joint table
(many columns) scrolls sideways on screen; in print it was clipped, fixed the same day (next section).

### Wide sets in print: one chart and one table per group of columns (2026-11-11)

The several-column report put every column in one small-multiples chart and one joint table. On a
printed page neither can bend: the joint table sat in a box that scrolls sideways, which paper cannot
do, and the chart is one image that cannot split. `eval/multi-report-print.mjs` (headless Chromium,
print media, A4 with 15 mm margins, so 680 by 1009 CSS px printable; output
`eval/multi-report-print.out.txt`) measured it on a real seven-column set, the UK road-casualty
series behind the seat-belt studies (`data/uk-road-casualties.csv`, R's `Seatbelts`; Harvey 1989),
and on synthetic 12- and 20-column sets:

| case | joint table, before | after | tallest chart, before | after |
|---|---|---|---|---|
| road casualties, 7 columns, level | 648 px (fits, wrapped) | 648 px | 631 px | 363 px |
| road casualties, 7 columns, level and volatility | **814 px** | 648 px | 631 px | 363 px |
| synthetic, 12 columns, level | **1,081 px** | 648 px | **1,078 px** | 542 px |
| synthetic, 20 columns, level and volatility | **2,156 px** | 648 px | **1,792 px** | 363 px |

Now `columnGroups` (`multi-report.mjs`) splits the columns into balanced groups of at most
`COLUMNS_PER_GROUP` (6 under the level model, 4 under level and volatility, whose cells also carry
the sd ratio; on the road data 5 volatility columns still fit at 648 px and 6 reach 710, so 4 leaves
room for longer numbers). Each group gets its own chart and its own joint table, captioned
"Columns 1 to 4 of 7: DriversKilled, drivers, front, rear", each kept whole on a page. Every chart
draws the same joint and agreed changes, so the groups line up by date. Sets that fit in one group
(the usual 2 to 4 columns, and the FX sample) are laid out exactly as before: the three sample reports
regenerate byte-identical.

**What the road data says** (pinned in `multi-report.test.mjs`): the joint level-and-volatility fit
has a change at 1983-02, the first full month of the front-seat belt law, among 5; but the only
changes every column-by-column setting agrees on are the petrol price's three steps (1974-04,
1977-08, 1979-06). The casualty counts are strongly seasonal and the several-column mode has no
season term, so the per-column panel cannot settle on the law there; one column at a time,
`--period 12` does find it (the seat-belt section under Verification). A season term per column is
open.

**Checked.** `multi-report.test.mjs` (7 tests, 2 new): the groups cover every column once and never
exceed the limit; on the seven real columns the report has two charts, each equal to
`multiChartSvg` on its group, two joint tables with each column's header exactly once, and no single
tall chart. `node eval/multi-report-print.mjs`: before, 3 of 4 cases did not fit the printed page;
after, all 4 do.

## The wandering-level model in the branded report (2026-11-11)

The branded change report (the planned paid extra, dark until `checkout.mjs` has a link) now covers
`--model drift` too. Before, **Open the report** after a wandering-level run refused and pointed at
the CSV. Now it builds `driftReportHtml` (`drift-report.mjs`) from the last run, without rerunning it,
on the shared letterhead (`reportShell` in `report.mjs`; the one-column and several-column reports
are unchanged, pinned by their sample tests). In order:

- the lead: how many jumps stand out from the drift and the largest in noise sds, or, when none
  does, that the movement reads as wander rather than a change;
- the page's plain-language summary (`driftSummary`), the heavy-tail check when it fires and the
  TCPD score (`driftNotes`), and a note naming any page options the model ignored (logs, season,
  trend, AR(1), noise floor, growth-rate test, heavy-tailed noise), so a reader of the PDF knows;
- the page's chart with the fitted level drawn per stretch (`driftChartSvg`, the same function);
- the jumps table and the stretches table (the page's, the same functions), then noise sd, wander
  sd, penalty and any steady growth taken out;
- the analyst's notes, and assumptions written for a wandering level: a random walk plus Gaussian
  noise after Romano, Rigaill, Runge and Fearnhead (2022); slow wander is never listed, so a gradual
  shift is not a jump; season, trends other than a steady growth, autocorrelation and heavy tails are
  not modelled; a jump does not show a cause; no warranty.

**Sample.** `sample-drift-change-report.html`, built by `build-sample-report.mjs` from the real code
on Canada's total fertility rate, 1931-1968 (`data/canada-fertility.csv`), for an invented firm. The
plain level model cuts that series into 8 flat segments (1933, 1942, 1946, 1953, 1963, 1965, 1967;
`canada-fertility.test.mjs`); the wandering-level model lists 3 jumps, 1946 (+388, 7.0 noise sd), 1965
(-461, 8.3) and 1967 (-320, 5.8), and reads the rest (the 1930s fall, the 1950s rise to the peak)
as wander. The marketing page (`change-report-for-analysts.html`) links it under "Series that wander".

**Verification.** `drift-report.test.mjs` (5 tests): the report contains the page's chart, tables and
summary for the Nile (1899 alone); the no-jump lead on Lake Huron; every typed string, label and
ignored option escaped, SVG logos and non-hex colours refused; the sample equals the real code's
output; the page imports `drift-report.mjs` and no longer refuses. `eval/drift-report-browser.mjs`
(headless Chromium, `eval/drift-report-browser.out.txt`): Canada's fertility rate pasted, the drift
model chosen with "take logs first" ticked, the report card shown as an unlocked key would, **Open
the report** clicked; the opened report equals `driftReportHtml` in Node byte for byte (9,420
characters), lists 1946, 1965 and 1967, names the ignored option, and the page raised no errors.

**Not done.** The CLI has no report flag for any model (the report is a page feature); the
several-columns mode still does not take the drift model; the report has no Bayesian panel for it
because the model has none.

## Main analysis off the main thread (2026-11-11)

The section above moved the six-setting panel into Web Workers but left the main analysis on the
page's main thread, so a long series still froze the tab until its results showed. That was the
flagship's item (c), "next: main analysis in a worker".

- **What changed.** `analyze-job.mjs` turns one page request into plain data (`{ kind: 'one',
  opts }` for `analyze`, `{ kind: 'multi', csv, columns, opts }` for `parseColumns` plus
  `analyzeMulti`) and returns `{ result }` or `{ error }`, never throwing. `analyze-worker.mjs`
  runs it in a module worker. The page keeps one such worker; clicking Analyze again while it is
  busy terminates it and starts a new one, so a stale result can never overwrite a newer one.
  Without workers (an old browser, a `file:` page) or if the worker fails to load, the same call
  runs on the main thread after a 30 ms pause that lets the "Working" note paint. Both modes (one
  column and several columns) go through it. Results are identical: `analyze-worker.test.mjs`
  checks the job against a direct call after a structured clone, for eight model setups and the
  several-columns example.
- **The page's own result now stands in for the panel's "level" setting** when nothing in its
  options moves a cut (`levelRunFromMain` in `consensus.mjs`: plain level model; the Bayesian
  hazard and threshold and the trend knot margin may differ, every other box must be off). The
  panel then runs five analyses instead of six. `agreed-worker.test.mjs` checks that the stand-in
  equals `runSetting(base, PANEL[0])` and that the merged panel equals `consensus()` on seven
  option sets, and that nine option sets that could move a cut (AR(1), trend, bursts, drift,
  meanvar, the local floor, holidays, the growth-rate test, a minimum segment) get no stand-in.
- **Measured** (headless Chromium, 4 cores, one run each, same container; before = this
  directory at the parent commit, `eval/agreed-worker-browser.mjs`; after =
  `eval/analyze-worker-browser.mjs`, output `eval/analyze-worker-browser.out.txt`, and
  `eval/agreed-worker-browser.out.txt`):

  | series | tab blocked before | after: click returns / worst 50 ms timer lag | results shown | panel done before → after |
  |---|---|---|---|---|
  | 6,000 seeded points | 2.2 s | 1 ms / 21 ms | 2.2 s | 5.6 s → 5.0 s |
  | tree-ring, 7,980 points | 4.7 s | 1 ms / 29 ms | 4.7 s | 11.9 s → 11.0 s |

  The results arrive no sooner (the worker does the same work), but the page answers clicks and
  scrolling throughout, and a new click cancels the old run instead of queueing behind it. The
  panel's 7 to 11% saving is one run each and within run-to-run noise on a shared container, so
  read it as "one fewer analysis", not a measured speed-up. The panel text matched `consensus()`
  in Node on all three inputs; the stale-run, no-worker and several-columns checks passed on both.
- **Not done.** The CLI's panel still runs in one thread with its 2,000-point cap
  (`worker_threads` would lift it); whether the agreed summary earns its cost on the long TCPD
  series is still open.

## Agreed changes on worker threads in the CLI (2026-11-11)

The CLI led its text output with the six-setting panel only up to 2,000 points, because on one
thread the panel cost about five times the main analysis (2026-11-10 measurement above). The page
already ran it in Web Workers; the CLI now does the same with Node's `worker_threads`.

- **What changed.** `consensus-threads.mjs` (`runPanelThreaded`) hands the settings to up to
  one thread per core (`consensus-thread.mjs`), slowest first (the two AR(1) settings, then level,
  noise floor and the trend pair), and returns `runSetting` results in panel order for
  `mergeConsensus`. The CLI starts the threads *before* its main analysis and runs that analysis on
  its own thread meanwhile, leaving one core for it. When the options cannot move a cut away from
  the panel's "level" setting (`levelRunFromMain`, the page's rule; `--label-column` and
  `--min-segment` go to both alike), the main result stands in for that setting and five settings
  run, not six. `--consensus` uses the same threads (all six). If threads cannot start, or one
  dies, the missing settings run on the main thread, so the answer never depends on the threads.
  The length cap (`AGREED_MAX_POINTS`) goes from 2,000 to 10,000 points.
- **Same answer.** `consensus-threads.test.mjs` pins the threaded merge to one-thread `consensus()`
  with three threads, one thread, and the main level run standing in; the CLI's lead line and
  `--consensus` output on a 2,400-point series (above the old cap) equal the one-thread text, and
  with `--ar1` (no reuse) too. The eval below checks the same on every input.
- **Measured** (`node eval/cli-panel-threads.mjs [file.csv ...]`, 4 cores, wall clock of a whole
  `node cli.mjs` run, output `eval/cli-panel-threads.out.txt`):

  | series | CLI, panel on threads | CLI, `--no-agreed` | main + panel on one thread |
  |---|---|---|---|
  | tree-ring, first 1,000 points | 0.9 s | 0.3 s | 1.1 s |
  | tree-ring, first 2,000 points | 2.1 s | 0.8 s | 3.8 s |
  | tree-ring, first 4,000 points | 4.3 s | 1.6 s | 10.4 s |
  | tree-ring, all 7,980 points | 9.5 s | 4.0 s | 23.5 s |
  | DJIA daily returns, 8,609 points | 6.4 s | 2.3 s | 15.9 s |

  So the panel now adds about 1.4 to 2.4 times the plain run, against about 3 to 6 times before;
  the full tree-ring series, which the old cap skipped, now gets its agreed line in under ten
  seconds. The threads run slower than one setting alone (the AR(1) setting takes 5.1 s alone on
  tree-ring, more beside four other busy threads), so the wall clock sits above the slowest
  setting; four cores are the ceiling here. The cap of 10,000 covers every committed series; above
  it the CLI still says the panel was not run and points to `--consensus`.
- **"Is the agreed summary worth its cost on the long TCPD series?" has no subject.** The open item
  assumed TCPD has univariate series above 2,000 points. It does not: of the 31 series that ship
  (fetched with `eval/tcpd-fetch.sh` 2026-11-11) the longest is `us_population` at 816 points, and
  of the 7 held out the longest is `measles` at 991. Every TCPD series was already under the old
  cap, so the held-out F1 figures quoted in the agreed line (0.71 vs 0.30) are from series of 52 to
  991 points. Whether the panel earns its cost on long real series needs labelled long series
  from elsewhere; the tool now says so rather than implying TCPD covers them.
- **Not done.** The several-column panel (`--columns`) still runs its per-column panels on one
  thread; the page's 2,000-point no-worker fallback is unchanged.


## Jumps on a drifting level: `--model drift` (2026-11-11)

Open item (0) of the flagship: the plain level model cuts smooth or wandering series into staircases
(406 cuts on TCPD's 816-month US population). Every fix tried so far kept the flat-level model and
changed its noise (`--ar1`, the noise floors, the over-cut warning's refit). This one changes the
model: between changes the level follows a random walk, so slow wander is paid for by a per-step
variance omega^2 and only a jump too big for the walk is a change.

- **What it is.** `drift-level.mjs`. The model is the phi = 0 case of DeCAFS (Romano, Rigaill,
  Runge and Fearnhead, "Detecting Abrupt Changes in the Presence of Local Fluctuations and
  Autocorrelated Noise", JASA 2022, doi 10.1080/01621459.2021.1909598; the arXiv abstract page
  2005.01379 was read for the title and DOI, the paper's body was not re-read here). It is solved
  differently: a change restarts the level from a flat prior, so segments are independent and each
  costs the -2 log likelihood of a local-level Kalman filter over it; exact optimal partitioning
  over all segment starts (the filter's variances depend only on the position in the segment, so
  every start costs one multiply-add per point; O(n^2), 44 ms for all 38 TCPD series). sigma and
  omega come first, robustly: the lag-k difference has variance 2 sigma^2 + k omega^2, so a
  least-squares line through the MAD variances at lags 1 to 10 gives both. Penalty 2 log n, the
  plain level model's BIC. `driftLevelPath` gives the smoothed level, so each jump is reported as
  the level just before and just after it.
- **Pre-registered on TCPD** (`node eval/tcpd-drift.mjs tcpd-data`, output `eval/tcpd-drift.out.txt`;
  the settings and the decision rule are in the script's header, written before any TCPD series was
  run through it). Rule: offer it if the primary setting beats the plain level model on both the 31
  shipped and the 7 held-out series; put it in the default panel only if it also beats the level
  model following the over-cut warning on both.

  | setting | F1 shipped (31) | cover | cuts | F1 held out (7) | cover | cuts |
  |---|---|---|---|---|---|---|
  | drift level, 2 log n (primary) | 0.677 | 0.592 | 247 | 0.420 | 0.524 | 284 |
  | drift level, 4 log n | 0.682 | 0.620 | 117 | **0.538** | 0.606 | 182 |
  | drift level, min segment 5 | **0.715** | 0.616 | 160 | 0.493 | 0.534 | 153 |
  | drift level + median slope (post hoc) | 0.680 | 0.604 | 249 | 0.429 | 0.502 | 286 |
  | level (default) | 0.477 | 0.374 | 1329 | 0.296 | 0.191 | 585 |
  | level, following the over-cut warning | 0.655 | 0.561 | 653 | 0.497 | 0.394 | 233 |
  | `--consensus` every setting | 0.702 | 0.633 | 59 | 0.711 | 0.742 | 25 |
  | zero (published) | 0.663 | 0.568 | | 0.639 | 0.597 | |
  | binseg (published) | 0.714 | 0.671 | | 0.727 | 0.731 | |

- **Verdict: offered, not in the panel.** Primary minus plain level: +0.200 F1 shipped (95%
  bootstrap 0.115 to 0.286, better on 24 of 31) and +0.124 held out (0.070 to 0.195, better on 7
  of 7). Primary minus following the warning: +0.022 shipped (-0.055 to 0.099) and -0.077 held out
  (-0.151 to -0.001). So it beats the plain model everywhere and the warning's refit nowhere
  reliably; the second half of the rule fails and the panel is unchanged. It does not beat
  "no change" or binseg either.
- **Where it helps and where it does not.** It takes US population from 406 cuts to 1 (F1 0.015 to
  0.615), JFK passengers 57 to 0, seat belts 24 to 1 (0.333 to 0.824), Japan's GDP 17 to 2, and
  dates Brent's changes better than any level setting (0.726). It fails on series whose trouble is
  heavy tails or volatility bursts, not drift: `bank` 48 cuts where annotators mark none, bitcoin
  103, measles 30, Ratner's stock 46. Those are the held-out set's bulk, which is why it drops there.
  And it pays the absorbing price: Nile's 1899 drop (2.15 noise sd on a flat level) is read as
  wander, because the robust omega estimate (45 on noise sd 118) is inflated by the step's own
  lag-k differences. Of the secondary settings, 4 log n does best held out (0.538, above the
  warning's 0.497) and min segment 5 best shipped (0.715); neither wins on both, and choosing
  between them now would be tuning on the test.
- **Synthetic, where the truth is known** (`node eval/drift-sim.mjs`, output
  `eval/drift-sim.out.txt`; n 200, noise sd 1, random-walk step sd omega, one step at t = 100,
  60 series per cell): with omega 0.3 and no step the plain model reports 5.40 cuts, the local
  floor 1.70 and the drift model 0.30; a 5-sd step is found 60, 59 and 60 of 60 times with 5.05,
  1.28 and 0.08 other cuts. A 3-sd step on that wander is found 57, 46 and 44 times. On white noise
  (omega 0) all three agree (3-sd step 60, 60, 58 of 60).
- **Steady growth: `--drift-slope` (post hoc).** A random walk without a drift term cannot follow a
  steady slope, so Australian residents (smooth quarterly growth, no documented break) still gave
  31 cuts (plain level 43). Taking out the median first difference first (`slope: true`) gives 0;
  US real GDP 2 cuts (1978Q2, 1999Q4) without it and 0 with it; Mauna Loa CO2 16 to 10 (the season
  is not modelled). Added after the TCPD scoring, so its TCPD row (+0.003 / +0.009 over the primary)
  is in-sample and is not evidence; it stays an opt-in flag.
- **Shipped.** `node cli.mjs series.csv --model drift [--drift-slope] [--penalty <number>]
  [--min-segment n] [--json]` (`drift-cli.mjs`; the text quotes the TCPD figures above, which a test
  checks against the eval output, and cites the paper). Not on the page or in the agent tool yet (both since 2026-11-11, "Jumps on a wandering level, on the page" below).
  Tests: `drift-level.test.mjs` (noise estimates, a step on white noise and on a walk, the optimal
  partition is exact against every single-change move, US GDP, Australian residents, the Nile miss,
  the CLI).
- **Next.** The AR(1) term (DeCAFS's phi) for sticky noise around the walk; a volatility-robust
  cost (bitcoin, `bank`) or a check that tells drift from heavy tails before choosing this model;
  an omega estimate that a single large step does not inflate (Nile); the model as a panel member
  scored on fresh labelled data, not TCPD again.


## A step-robust omega: wander chosen with the changes (2026-11-11, later)

Open item from "Jumps on a drifting level": the lag-difference estimate of the wander omega is
inflated by the very steps the model is meant to find (Nile: omega 45 on noise sd 118, so the 1899
drop of 2.1 noise sd is read as wander). Now `--model drift` keeps sigma from the lag fit's
intercept, which a few jumps barely move, and chooses omega *together with the changes*: for each
q = omega^2 / sigma^2 one exact partition gives the penalised cost, q is profiled on a log grid
(0 and 1e-4 to 1e4) and refined by golden section (`driftNoiseML` in `drift-level.mjs`). A step is
then absorbed as wander only if a larger omega costs less than one change at the penalty.

- **Check of the likelihood.** With no change allowed, the segment cost's minimum on the Nile is
  Durbin and Koopman's local level fit (sigma_eps^2 15,099 and sigma_eta^2 1,469, *Time Series
  Analysis by State Space Methods*, 2nd ed., section 2.10; our grid lands within 100 and 50 of
  them; `drift-level.test.mjs`). With changes allowed, omega drops to 0.9 and 1899 is the one cut.
- **Two estimators that did not work, kept here so nobody retries them.** First, profiling sigma
  too. Each segment's first point is diffuse, so the likelihood in the data's units drops one
  log sigma^2 per change: a change is worth -log sigma^2, a bonus that depends on the data's units,
  and the first coded version also reported a sigma one step ahead of its changes. Its TCPD run
  (seen, then discarded): F1 0.649 shipped, 0.413 held out. Second, charging that point log sigma^2
  too: scale-free, but unbounded (sigma to 0 and q at the grid's top, 1e4, on each of the TCPD series looked at; looked
  at as q values and cut counts, not scored). The third, sigma held, is what ships. Because the
  first two were seen on TCPD, the figures below are not as clean as a first, pre-registered run.
- **TCPD** (`node eval/tcpd-drift-ml.mjs tcpd-data`, output `eval/tcpd-drift-ml.out.txt`; the rule
  is in the script's header, written before the first run: ML wander becomes `--model drift`'s
  default if its mean F1 beats the lag estimate on both sets; the model joins the consensus panel
  only if it also beats the level model following the over-cut warning on both).

  | setting | F1 shipped (31) | cover | cuts | F1 held out (7) | cover | cuts |
  |---|---|---|---|---|---|---|
  | drift level, wander by likelihood (now the default) | **0.694** | 0.622 | 226 | **0.527** | 0.576 | 180 |
  | drift level, lag-difference wander | 0.677 | 0.592 | 247 | 0.420 | 0.524 | 284 |
  | level, following the over-cut warning | 0.655 | 0.561 | 653 | 0.497 | 0.394 | 233 |
  | level (default) | 0.477 | 0.374 | 1329 | 0.296 | 0.191 | 585 |
  | `--consensus` every setting | 0.702 | 0.633 | 59 | 0.711 | 0.742 | 25 |
  | zero / binseg (published) | 0.663 / 0.714 | | | 0.639 / 0.727 | | |

  Paired, ML minus lags: +0.018 shipped (95% bootstrap -0.036 to 0.071; better on 14, worse on 10)
  and +0.107 held out (-0.043 to 0.321; 5 and 2). ML minus the warning's refit: +0.040 (-0.048 to
  0.131) and +0.031 (-0.115 to 0.199). Both halves of the rule pass on the means; no interval
  excludes zero.
- **Decision: the default for `--model drift`, not a panel member.** The first half is taken. The
  second half also passes on the means, but the panel step is not taken this run: the gaps are
  inside noise on 7 and 31 series, the estimator is a third version chosen after seeing TCPD output,
  and the panel's agreed line is the tool's headline. That needs fresh labelled data (a deviation
  from the written rule, recorded in the run record). `--drift-noise lags` keeps the earlier
  estimate; the library default stays `lags` so existing callers see no change.
- **Where it helps:** Nile 0 to 1 cut (F1 0.824 to 1.000), quality control 1 and 2 (to 1.000),
  `businv` 18 cuts to 3 (0.348 to 0.559), US population 1 to 0, Iceland tourism 5 to 0 (0.281 to
  0.947), bitcoin 103 to 52, scanline 42049 69 to 27, Brent 0.726 to 0.773, Dutch unemployment
  0.817 to 0.930. **Where it loses:** quality control 3 and 4 (0.571 to 0.333, 0.936 to 0.638), Iran's
  GDP (0.888 to 0.655), Japan's GDP (0.800 to 0.571), seat belts (0.824 to 0.621, the 1983 law's
  step now absorbed), robocalls (0.966 to 0.778), and `bank` stays at 63 false cuts (heavy tails, not
  drift). On the committed series: Mauna Loa CO2 16 cuts to 4; Australian residents with
  `--drift-slope` 0 to 4 (worse; no documented break); US real GDP 2 to 6, and with `--drift-slope`
  0 to 11, several near recession dates (1958Q1, 1975Q1, 1980Q2, 1982Q1, 1990Q4; not scored).
- **Synthetic** (`eval/drift-sim.mjs`, new last column, data unchanged): white noise with a 3-sd
  step found 60 of 60 (lags 58); omega 0.1 with no step 0.08 false cuts (lags 0.47); omega 0.3 with
  a 3-sd step 42 of 60 (lags 44) and 0.18 other cuts (0.28); with a 5-sd step 0.25 other cuts
  (0.08), the one cell where it is clearly worse.
- **Cost.** About 30 exact O(n^2) partitions a series instead of one: 566 ms for all 38 TCPD series
  (lags: 44 ms); a 10,000-point series takes seconds, not milliseconds.
- **Next.** A heavy-tail check before choosing this model (`bank`, bitcoin); why ML absorbs the
  seat-belt law and quality control 4's step (omega chosen high on a seasonal or trending series);
  the AR(1) term; the model as a panel member on fresh labelled data, not TCPD again.

## Several columns on worker threads, in the CLI and on the page (2026-11-11, later)

"Several columns" ran each column's six-setting panel one after another, on one thread: on the
1,751-day currency example that was 8.0 s of an 8.2 s analysis (the joint fit takes 0.2 s). The
flagship's item (c) ended "next: --columns per-column panels on threads". Both front ends now
hand those 6 x columns settings to a pool, slowest setting first across every column, and merge
them exactly as before.

- **What changed.** `consensus-threads.mjs` has a general job pool (`runJobsThreaded`: jobs of
  `{ base, setting }`, the next job to whichever thread finishes first, everything missing run here
  if threads cannot start or one dies). `runPanelThreaded` (the one-column panel) now uses it, and
  `runColumnPanelsThreaded(cols)` is new. `columnConsensus` and `analyzeMulti` take the runs done
  elsewhere (`runs`, `columnRuns`) and merge each column with `mergeConsensus`, the same call
  `consensus()` makes. `cli.mjs --columns` parses the columns, runs the pool, then the joint fit.
  On the page, several-columns mode feeds every column's settings to the panel's Web Workers
  (`consensus-worker.mjs` now echoes a `column`), then sends the finished runs with the job to the
  main analysis worker; a newer click stops both. With no workers, or a worker that fails, the
  main worker runs the panels itself, as before.
- **Same answer.** `columns-threads.test.mjs` pins the threaded `columnConsensus` to the one-thread
  result with 1, 2 and 4 threads, `analyzeMulti` with runs done elsewhere to `analyzeMulti` alone,
  the CLI's text and `--json` to the one-thread text and JSON, and the currency example's two agreed
  dates (chf 2015-01-20, gbp 2016-06-24). The evals below compare text and tables on every input.
- **Measured, CLI** (`node eval/cli-columns-threads.mjs`, 4 cores, wall clock of a whole
  `node cli.mjs file --columns` run against `analyzeMulti` in-process on one thread, output
  `eval/cli-columns-threads.out.txt`):

  | input | CLI, panels on threads | one thread, in-process | text equal |
  |---|---|---|---|
  | German unemployment, 2 columns, 120 quarters | 0.4 s | 0.2 s | yes |
  | currency returns, 3 columns, 1,751 days | 3.6 s | 8.8 s | yes |
  | the same, level and volatility | 3.0 s | 7.3 s | yes |
  | European index returns (DAX, CAC, FTSE, SMI), 4 columns, 1,859 days | 6.1 s | 16.4 s | yes |

- **Measured, page** (`node eval/columns-workers-browser.mjs`, headless Chromium, 4 cores, click to
  results shown; "before" blocks the panel workers so the page takes its fallback, every panel in
  the one main worker, which is what it did until now; output `eval/columns-workers-browser.out.txt`):
  currency returns 3.8 s against 7.5 s, European indices 7.2 s against 15.8 s. Summary and agreed
  table equal `analyzeMulti` in Node in all three modes (panel workers, one worker, no workers).
- **What it does not change.** The answers, the cap-free several-column path (there is no length
  cap there; a long multi-column file still takes seconds per column on 4 cores), and the small
  case: on 120 points thread start-up makes the CLI slower than one thread in-process (0.4 s
  against 0.2 s, process start included). Timings are one run each on a shared container.
- **Found on the way, and fixed.** `node cli.mjs --columns file.csv` read `file.csv` as the
  column list (the option takes an optional list) and then waited on stdin. Now a list of one
  name ending in `.csv`, `.tsv` or `.txt`, with no other file given, is read as the file; decided
  by the name, not by whether the file exists, so the command means the same in every folder
  (`columns-threads.test.mjs`).

## Heavy tails on a drifting level: a bounded loss makes it worse (2026-11-11, latest, negative result)

Open item from "A step-robust omega": `--model drift` still makes 63 false cuts on TCPD's `bank`
(annotators mark none) and 52 on bitcoin. Both look heavy-tailed, so the obvious fix is a loss that
an outlier cannot dominate. `drift-level.mjs` now takes `loss: 'biweight' | 'huber'` and `lossK`
on the standardised innovation z = v / sqrt(F) of the segment's Kalman filter. Biweight charges
min(z^2, K^2) and leaves the level unchanged past K. That is the bounded loss of Fearnhead and Rigaill,
"Changepoint Detection in the Presence of Outliers" (JASA 114(525), 2019, doi
10.1080/01621459.2017.1385466; abstract read, not the body), applied inside the filter instead of to
a flat segment mean. Huber charges 2K|z| - K^2 and moves the level by the clipped innovation. The
variances are untouched, so the cost stays O(n^2) and the ML wander is profiled under the same loss.

- **Synthetic first** (`node eval/drift-robust-sim.mjs`, output `eval/drift-robust-sim.out.txt`;
  n 200, one step at 100, 60 series a cell). Student t3 noise with no step: Gaussian 1.58 false
  cuts a series, Huber 0.15, biweight 0.03. A 3-sd step on t3 noise is found 55, 58 and 60 times
  out of 60. With wander (omega 0.3), the 3-sd step is found 32, 45 and 45 times. On Gaussian noise
  all three agree to within one series a cell. So where the tails are in the *observation* noise,
  the robust losses work as intended.
- **Pre-registered on TCPD** (`node eval/tcpd-drift-robust.mjs tcpd-data`, output
  `eval/tcpd-drift-robust.out.txt`; settings and rule in the script's header, written before any
  TCPD series went through either loss). Primary: biweight K 3. Rule: it becomes an opt-in if its
  mean F1 beats the shipped Gaussian drift on both sets, and the default only if it is also better
  on more series than worse on both. Huber K 2 is reported, not acted on.

  | setting | F1 shipped (31) | cover | cuts | F1 held out (7) | cover | cuts |
  |---|---|---|---|---|---|---|
  | drift ML, biweight K 3 (primary) | 0.681 | 0.624 | 341 | 0.448 | 0.408 | 278 |
  | drift ML, Huber K 2 (reported only) | 0.709 | 0.622 | 265 | 0.533 | 0.563 | 216 |
  | drift ML, Gaussian (shipped default) | 0.694 | 0.622 | 226 | 0.527 | 0.576 | 180 |
  | level, following the over-cut warning | 0.655 | 0.561 | 653 | 0.497 | 0.394 | 233 |
  | `--consensus` every setting | 0.702 | 0.633 | 59 | 0.711 | 0.742 | 25 |

- **Verdict: rejected. Nothing changes for users.** Biweight minus Gaussian: -0.013 shipped (95%
  bootstrap -0.050 to 0.027; better on 5, worse on 9) and -0.080 held out (-0.186 to 0.007; 1 and 4).
  It makes the two series it was aimed at worse: `bank` 63 cuts to 111, bitcoin 52 to 98 (F1 0.407 to
  0.164), scanline 42049 27 to 56, UK coal employment 11 to 31. Its one clear gain is `well_log`
  (21 cuts to 15, F1 0.764 to 0.874), the series in TCPD that has isolated outliers. No CLI flag ships.
  The option stays in the library, with tests (`drift-robust.test.mjs`), for the evals and the next try.
- **Why: the tails are in the walk, not the noise.** On the fitted Gaussian drift model the
  wander-to-noise ratio q = omega^2 / sigma^2 is 6,400 on `bank`, 4,100 on bitcoin and 3,900 on
  scanline 42049, against 0.016 on `well_log` and 0.00006 on the Nile. So the model reads the first
  three as near-pure random walks. Their large moves are big *increments of the level*, and once the
  cuts are in, the standardised innovations look ordinary: 1.4 to 2.9% beyond 3, sd 1.00. A bounded
  loss on the observation then does the wrong thing. It refuses to follow a big increment, the level is
  left behind, and every later point is "an outlier" until a cut restarts it, which means more cuts,
  not fewer. Huber follows the increment partway, which is why it does less harm. (Diagnostic run
  once in the session on the fitted filters, not committed as an eval; numbers above.)
- **What it means for the next try.** The heavy tail belongs in the state equation: a level whose
  increments are heavy-tailed (a t or a mixture walk) treats a big move as part of the walk. Or
  `--model drift` should say "this looks like a random walk with heavy-tailed steps; its jumps are
  its largest steps" when q is far above 1. Either needs fresh labelled data to score, not TCPD again.
  Huber K 2 beat the Gaussian on both TCPD means (+0.015 shipped, +0.006 held out). That is a lead
  for fresh data, not a finding: it was reported only, and the gaps are within noise.

## The heavy-tail check: walk or noise (2026-11-11, after "a bounded loss makes it worse")

The section above ends with "`--model drift` should say 'this looks like a random walk with
heavy-tailed steps; its jumps are its largest steps' when q is far above 1". Every `--model drift`
text and JSON (`tails`) now carries that check (`driftTailCheck` in `drift-level.mjs`). A second
session ran the same pre-registered loss study in parallel and reached the same verdict; its
duplicate is not committed, and this section keeps only what it adds.

- **The check.** Kurtosis of the first differences above 6 (a t distribution with 6 degrees of
  freedom). Then **walk** if the lag fit finds no noise around the level beyond its 2% floor (the
  series reads as a pure random walk, so its differences are the walk's own steps), else **noise**.
  'walk' says the jumps may be the walk's largest steps, not changes, that a robust cost does not help,
  and to try `--model meanvar` on the differences. 'noise' says lone outliers may be read as jumps,
  and that the bounded cost which helps there is not offered yet because it failed its pre-registered
  rule. The CLI flag stays out, as the rule above decided.
- **Synthetic, where the truth is known** (`node eval/drift-tails-sim.mjs`, output
  `eval/drift-tails-sim.out.txt`; n 400, 60 series a cell, t3 tails scaled to sd 1, biweight K 3 and
  Huber K 2 as in the TCPD run; cells written after the TCPD run, before this one):

  | cell | Gaussian: found / other cuts | biweight: found / other | check says |
  |---|---|---|---|
  | Gaussian noise, 3-sd step | 60 / 0.00 | 60 / 0.00 | nothing 60 of 60 |
  | t3 noise, 3-sd step | 57 / 3.07 | 60 / 0.07 | noise 36, nothing 24 |
  | t3 noise, wander 0.2, 5-sd step | 60 / 2.68 | 60 / 0.52 | noise 44, nothing 16 |
  | t3 noise, no step | - / 3.00 | - / 0.07 | noise 30, nothing 30 |
  | Gaussian random walk, no noise | - / 2.33 | - / 2.30 | nothing 60 |
  | t3 random walk, no noise | - / 17.40 | - / 18.18 | walk 42, noise 12 |
  | t3 random walk, noise 0.1 | - / 16.50 | - / 17.12 | walk 43, noise 9 |

  On a heavy-tailed walk no loss helps (Huber 18.30 and 16.65), and the check says 'walk' on 42
  and 43 of 60. It is a check, not a test: on single t3-noise series it fires about half the time.
- **On TCPD (in-sample: the bar of 6 was set after looking at TCPD's per-series kurtosis;
  `eval/tcpd-drift-tails.mjs`, output `eval/tcpd-drift-tails.out.txt`).** The lag fit's noise is at
  its floor on 21 of 38 series. 'walk' on 12 (bank, bitcoin, measles, both scanlines, usd_isk,
  children per woman, ...): Gaussian drift F1 0.552 there against 0.595 for reporting nothing.
  'noise' on 5 (well_log, homeruns, lga, shanghai, ratner): biweight 0.619 against Gaussian 0.573.
  Using biweight only where the check says 'noise' would score 0.702 shipped and 0.526 held out
  (Gaussian 0.694 and 0.527). That is post hoc, so it is a rule to pre-register on fresh labelled
  data, not a default.
- Tests: `drift-tails.test.mjs` (the check on known walks and noise, the text for each case, the
  JSON, the quoted figures against both eval outputs).

## Jumps on a wandering level, on the page (2026-11-11)

`--model drift` was CLI-only. It is the model that stops the plain level model cutting a smooth or
wandering series into a staircase (TCPD F1 0.694 / 0.527 against the plain model's 0.477 / 0.296),
so it belongs where most people meet the tool: the page.

- **What changed.** "Look for a change in" has a fifth choice, **Sudden jumps on a level that
  wanders (random walk)**, and a box **Take out a steady growth first** (the CLI's `--drift-slope`).
  The run goes through the page's existing background worker (`analyze-job.mjs`, new job
  `{ kind: 'drift', opts }` calling `driftResult`), so the page answers while the about 30 exact
  partitions run. `drift-view.mjs` words the result for the page: a summary (the jumps with their
  size in noise sds, the wander and the noise), the heavy-tail check in page words (the CLI's
  "try `--model meanvar` on its differences" becomes the "Level and volatility" model), the TCPD
  figures, a chart of the series with the fitted level drawn per stretch and a dashed line at each
  jump, a jumps table (level before and after, jump, jump in noise sds), a stretches table and a
  per-point CSV (`label,value,stretch,fitted_level`). The penalty takes BIC or a custom number; AIC
  and Hannan-Quinn are refused with a message (they are not defined for this model here). Boxes the
  model ignores (logs, season, trend, AR(1), noise floor, growth-rate test) are named in a note
  rather than dropped silently. The branded report covers it since 2026-11-11 ("The wandering-level model in the branded report"). Usage
  counter `drift_run`, local like the others. The method section cites the paper (BibTeX added).
- **Agents.** `node platform/agents/tools.mjs call changepoint-detector analyzeJob --input
  '{"kind":"drift","opts":{"csv":"..."}}'` now reaches the model, since the page imports the
  module (the tool exposes what the page imports).
- **A fix found on the way.** With `--drift-slope`, each jump's size included one step of the
  removed growth, because the fitted path adds the growth back. On Australian residents (growth
  51.3 a quarter) the 1988 jump read +79.8 (+62.2 noise sd); it is +28.5 (+22.2). Where the jumps
  fall is unchanged; only their reported size moves (`drift-level.mjs` `driftLevel`).
- **Checked.** `drift-page.test.mjs`: the worker job equals `driftResult` after a structured
  clone; Nile's summary, table, chart, stretches and CSV (1899 alone, -249, -2.11 noise sd); the
  notes with and without the heavy-tail check; the penalty mapping and ignored options; the slope
  fix; a flat series draws no NaN; labels escaped; the page wiring. `eval/drift-page-browser.mjs`
  (headless Chromium, 4 cores, output `eval/drift-page-browser.out.txt`): summary, notes, jumps
  table and CSV on the page equal Node's; AIC refused; logs reported as ignored; on tree-ring's
  7,980 points the click returns at once, results show after about 5.7 s (5.7 s in Node) and a
  50 ms timer is never more than 35 to 86 ms late across runs; without workers the same Nile
  summary; switching back to the level model restores its legend, headings and tables; no page
  errors.
- **Not done.** The model is not in the agreed-changes panel (that needs fresh labelled data, as
  "A step-robust omega" decided) and has no Bayesian view; the several-columns mode does not take it
  (the branded report does since 2026-11-11).

## The drift model on several columns: measured, not offered; and a fix for sticky series (2026-11-11, last)

Flagship item (b): the drift model (`--model drift`, random-walk level between jumps) with one
segmentation shared by every column. `multi-drift.mjs` (`multiDriftChanges`, `multiDrift`): each
column keeps its own sigma and omega (sized by that column's own `ml` fit), a change restarts every
column's level, and a segment's cost is the sum of the columns' Kalman filter costs. Penalty
(1 + d) log n, which is the one-column default 2 log n at d = 1; with one column the changes and the
cost are exactly `driftLevelChanges` (pinned in `multi-drift.test.mjs`). O(d n^2): 2 s for all
three TCPD multi-column series, including the per-column `ml` fits.

**Pre-registered** (settings and rule in the headers of `eval/tcpd-multi-drift.mjs` and
`eval/multi-drift-sim.mjs`, written before either was run): offer `--columns --model drift` if the
primary beats the joint level default (floor auto, mean F1 0.286) on TCPD's three multi-column
series *and* the simulation shows (i) fewer false changes on wandering columns at every d and
(ii) white-noise power within 10 points of the joint level fit at every d and step of 1 sd or more.

- **TCPD, as first run** (`eval/tcpd-multi-drift-before-fix.out.txt`): mean F1 **0.245**, below 0.286.
  Fails.
- **Simulation** (`eval/multi-drift-sim.out.txt`, n 200, 60 series a cell): on wandering columns
  (omega 0.3) with no step the joint drift fit reports 0.12 to 0.25 false changes where the joint
  level fit reports 3.0 to 4.8, so (i) holds, by a factor of 12 to 40. (ii) fails: a 1 sd step on
  white noise is found 43% / 63% / 85% of the time at d = 1 / 2 / 4, against 90% / 90% / 97%. At
  2 sd and above both find it 97 to 100%.
- **Verdict: not offered.** The drift model is the one to use when columns wander; the price is
  power on small steps in plain noise, and the panel on TCPD did not favour it. The CLI's
  `--columns` still takes `mean` and `meanvar` only; `multi-drift.mjs` stays as a library and
  measured baseline.

**A defect the run turned up, fixed for the one-column model too.** On occupancy, column V3 is 0 on
329 of its 508 differences (a sensor that sits still), so the median absolute difference at every
lag is 0 and `driftNoise` left sigma at its 1e-6 numerical floor, in the data's own units: every move
became a change. It now falls back to the plain variance of the differences, as `robustSd` in
`engine.mjs` already did for the level model. On V3 alone, `--model drift`: 86 cuts to 23, F1
0.418 to 0.724. None of the 38 one-column TCPD drift results moves (`eval/tcpd-drift*.out.txt`
regenerate byte-identical apart from timings), and the other three occupancy columns are unchanged.
With the fix (post hoc, so not a test of the rule) the joint primary scores 0.334 on the three
series (`eval/tcpd-multi-drift.out.txt`): occupancy 0.359 to 0.625. The 2x-penalty secondary scores
0.767, but 0.929 of that is bee_waggle_6 with no cut at all, the score "no change" gets; a lead for
fresh multi-column labelled data, not a finding.

Where it still fails: apple's volume has volatility bursts, and the drift model reads them as
jumps (30 cuts, 20 of them in 250-317), the same failure as `bank` and bitcoin in one column.

## Volatility on a drifting level: a scale per segment (2026-11-11, measured, not offered)

Flagship item (b): `--model drift` reads a burst of volatility as a run of jumps (`bank` 63 cuts where
annotators mark none, bitcoin 52, apple's volume 30 in several-columns mode). `drift-level.mjs` now
takes `scale: 'segment'`: every segment gets its own scale s, which multiplies both its noise sd and its
wander sd (the wander-to-noise ratio q stays shared), so a calm stretch and a wild one are two segments,
not a staircase of jumps. Each segment's s^2 is profiled out of its Kalman innovations
(j log s^2 + sum log F + S / s^2 with s^2 = max(S / j, 0.01) in global-sigma units, `scaleCost`), the
ML wander is chosen under the same cost, and the default penalty is 3 log n (a level and a scale per
change, as `meanvar` has). Same O(n^2) exact partition: 1.5 s for all 38 TCPD series with the wander
search. `driftLevel` reports each change's scale before and after (`scaleRatio`). No CLI flag.

**Pre-registered** (headers of `eval/drift-scale-sim.mjs` and `eval/tcpd-drift-scale.mjs`, written
before either was run): offer `--drift-scale segment` as an opt-in if (i) on a near-pure random walk
whose step sd is 5x for 60 of 300 points it reports at most half the shipped model's cuts, (ii) on a
3-sd step in white noise and a 5-sd step on a wander it finds the step at most 6 of 60 series less often,
and (iii) its TCPD mean F1 is no more than 0.02 below the shipped drift on both sets. TCPD has been
through many drift settings already, so (iii) is a guard, not evidence of a gain.

- **Synthetic** (`eval/drift-scale-sim.out.txt`, n 300, 60 series a cell): the volatility-burst walk
  goes from **17.00 cuts to 2.43**, with both burst edges found 1.98 times of 2 (shipped 1.83); the
  same walk without a burst from 1.98 to 0.13; white noise whose sd triples for 60 points from 7.12 to
  2.02. Steps: 60 and 60 of 60 on white noise, 60 and 59 on the wander. (i) and (ii) pass.
- **TCPD** (`eval/tcpd-drift-scale.out.txt`):

  | setting | F1 shipped (31) | cover | cuts | F1 held out (7) | cover | cuts |
  |---|---|---|---|---|---|---|
  | drift, scale per segment, 3 log n (primary) | **0.756** | 0.661 | 285 | 0.464 | 0.390 | 173 |
  | drift, scale per segment, min segment 5 | 0.749 | 0.654 | 175 | 0.479 | 0.400 | 138 |
  | drift, scale per segment, 2 log n | 0.618 | 0.516 | 511 | 0.352 | 0.247 | 348 |
  | drift, one scale (shipped `--model drift`) | 0.694 | 0.622 | 226 | 0.527 | 0.576 | 180 |
  | `--consensus` every setting | 0.702 | 0.633 | 59 | 0.711 | 0.742 | 25 |
  | binseg (published) | 0.714 | 0.671 | | 0.727 | 0.731 | |

- **Verdict: (iii) fails on the held-out set; nothing changes for users.** Primary minus shipped drift:
  +0.062 shipped (95% bootstrap -0.001 to 0.127; better on 16, worse on 7) and **-0.064 held out**
  (-0.176 to 0.043; 3 and 4). The shipped-set mean is the highest any setting of this detector has
  scored there, binseg included, but the rule asked for both sets and the held-out set says no. The
  option stays in the library with tests (`drift-scale.test.mjs`).
- **Where it helps:** bitcoin 52 cuts to 28 (F1 0.407 to 0.535), quality control 4 3 to 1 (0.638 to
  0.936), JFK 0 to 1 (0.723 to 0.868), Croatia's GDP 6 to 1, well log 21 to 18 (0.764 to 0.832).
  **Where it hurts:** `bank` 63 to **170** cuts, scanline 42049 27 to 75, iceland tourism 0 to 1
  (0.947 to 0.643), US population 0 to 3.
- **Why `bank` gets worse (diagnostic, run once in the session, not an eval):** it is sticky, not
  bursty. 246 of its 580 steps are exactly zero (scanline 42049: 233 of 480), so every flat run is a
  stretch with no innovation at all; the profiled scale drops to its floor (81 of `bank`'s 171
  segments, 44 of scanline's 76) and each flat run buys about j log 100 of likelihood, far above the
  3 log n penalty. Median segment length 3. A floor tied to the data's resolution (the smallest nonzero
  step), or a zero-inflated noise term, is the obvious next try; it is post hoc, so it needs a fresh
  pre-registration, and the held-out loss on iceland tourism (a single cut on a smooth seasonal
  series) is a separate failure it would not fix.

## Sticky series: exact repeats (2026-11-11, two fixes measured and not offered; a warning ships)

The last section left `bank` going from 63 to 170 cuts under a scale per segment, because it is
sticky: 246 of its 580 steps repeat the previous value exactly (scanline 42049: 233 of 480,
ratner_stock 138 of 599, children per woman 75 of 300). A stale quote or a sensor that sits still
gives a flat run, the drift model reads it as a stretch of almost no noise, and a cut at each end
buys a lot of likelihood. Simulation first showed this is not only a scale-per-segment problem:
on a random walk with no change, the **shipped** `--model drift` reports 2.05 false changes a series
with no repeats, 4.75 when 15% of points are stale repeats, **8.38 at 20% and 37.95 at 40%**
(`eval/drift-sticky-share.mjs`, `.out.txt`, n 300, 60 series a share).

**First try, pre-registered: drop the repeats** (`repeats: 'drop'` in `drift-level.mjs`; rules in the
headers of `eval/drift-repeats-sim.mjs` and `eval/tcpd-drift-repeats.mjs`, committed in 94deb19c
before either was run). Fit the model to the series with every exact repeat taken out and map the
changes back. Continuous data has no repeats and is untouched (360 of 360 synthetic fits identical).

- Sticky walk, no change (F): shipped 34.50 cuts, global with drop **3.68**; scale per segment 60.12,
  with drop **0.98**. Sticky walk with a 5x volatility burst (H): 26.60 / 9.83 / 67.07 / **3.10**.
- **Sticky walk with a 5-sd level step (G): found 59 / 51 / 58 / 38 of 60.** The rule allowed 6 fewer
  than shipped. Both fail.
- TCPD, mean F1 (shipped 31 / held out 7): scale per segment with drop **0.764 / 0.590**, against the
  shipped drift 0.694 / 0.527 (+0.069, 95% 0.007 to 0.135, better on 17 and worse on 6; held out
  +0.063, -0.093 to 0.203); global with drop 0.695 / 0.589. Both pass the TCPD guard. Held out,
  scanline 42049 goes 0.593 to **0.963** (27 cuts to 13, annotators' median 7) and ratner_stock 0.324
  to 0.549; `bank` 63 to 52 cuts (39 global). TCPD has been through many drift settings, so these
  are a guard, not evidence of a gain.

**Second try, post hoc: repeats as missing observations** (`repeats: 'missing'`, `gapPartition`;
headers of `eval/drift-missing-sim.mjs` and `eval/tcpd-drift-missing.mjs`, committed before they
ran, same rules, a new seed). Dropping a repeat charges the k + 1 steps of wander behind the next
new value as one step, which I guessed made a real jump look like wander. The Kalman filter now keeps
the time axis: the predicted variance grows by q for every step and only new values are charged
(Durbin and Koopman, section 4.10); with no repeats it is the shipped partition to 1e-12. The guess
was wrong: on G the step is found **46 and 33 of 60** (global, per segment) against shipped 60, worse
than dropping; F falls further (1.28 and 0.20 cuts), and TCPD is within 0.006 of `drop`.

**Verdict: neither is offered.** Each fails its pre-registered power rule, and shipped's 59 to 60 of
60 on G is partly bought by 35 cuts a series (35 random cuts land within 5 points of the step about
three times in four), but that reading came after the rule, so it does not change the verdict. Both
stay in the library with tests (`drift-sticky.test.mjs`). The next try is a model in which a repeat
is its own event (a zero-inflated observation with a shared stale probability), tested first on why
a 5-sd step goes missing in G.

**What ships: a sticky-series check.** `driftLevel` now returns `sticky` (`stickyCheck`: the share of
steps that repeat exactly), and when at least 20% do (where the shipped model's false changes reach
about four times the no-repeat rate on the table above; the threshold comes from that synthetic table,
not from TCPD) the CLI text, the JSON and the page's "Read with care" notes say so, quote the table
and tell the reader to treat jumps at the ends of flat runs as suspect. On TCPD it fires on `bank`,
children per woman, ratner_stock and scanline 42049, and on no other series.

### The same power loss on real shocks: frozen orange juice (2026-11-11, not pre-registered)

The power cell above is synthetic. `eval/frozen-juice-sticky.mjs` (`.out.txt`) asks whether real shocks
go missing too, on Florida frozen orange-juice prices (612 months, `data/frozen-juice.csv`; 253 of 611
steps, **41%**, repeat the previous month exactly, so the sticky warning fires). Truth, as in "Shocks with a
measured cause" above: the eight months with 19 or more Orlando freezing degree days, found if a change
lies within 2 months. Run once, after both options had been declined. It informs the next try and is
not a decision rule.

| setting | cuts | freezes found | cuts near a freeze |
|---|---|---|---|
| shipped `--model drift` | 67 | **8 of 8** | 11 |
| drop, global scale | 15 | 6 of 8 (misses 1970, 1985) | 6 |
| drop, scale per segment | 15 | 4 of 8 | 5 |
| missing, global scale | 18 | 5 of 8 | 7 |
| missing, scale per segment | 15 | 5 of 8 | 5 |

Handling the repeats removes about three quarters of the cuts and raises the share near a freeze (11
of 67 is 16%; 6 of 15 is 40%), but it loses two to four documented shocks, which is the synthetic
power loss on real data. The freezes it keeps are the largest (1963, 1977, 1984 and 1990 in every
row). A second session reached the same option independently on 2026-11-11 with a rule that had no
step-in-a-sticky-walk cell. Its rule passed (TCPD 0.764 / 0.585 with the penalty on the kept length,
matching the 0.764 / 0.590 above), and it was not merged once this section's verdict was on `main`.
A benchmark guard alone would have shipped an option that misses real shocks. Test:
`frozen-juice-sticky.test.mjs`.

### Why the step goes missing: the repeats hide when it happened (2026-11-12, pre-registered)

The open question from the sections above: on the sticky walk (step sd 1, noise 0.1, 40% of points a
stale repeat) a 5-unit level step is found 60 of 60 times by the shipped `--model drift` and 46 by
repeats `missing`. `eval/drift-sticky-why.mjs` (`.out.txt`; predictions and rule in its header, committed
before it ran, fresh seed, 120 series a cell) asks why, and whether the rule that declined `missing`
compared the two at the same false-alarm rate.

**Why.** Under `missing` the step is seen only at the first new value at or after it, and the jump there
also carries k steps of wander, k the steps since the last new value before it. Its chi-square is about
25 / k against a penalty of 2 log 300 = 11.4. All three predictions held:

| reveal gap k | series | found | share | median z^2 of the jump |
|---|---|---|---|---|
| 1 (no repeat at the step) | 43 | 39 | 0.91 | 22.9 |
| 2 | 36 | 24 | 0.67 | 15.2 |
| 3 | 26 | 9 | 0.35 | 5.7 |
| 4 or more | 15 | 5 | 0.33 | 4.4 |

39 of the 43 misses have k of 2 or more, and the fitted wander is not inflated by the step (median 0.917
on the step cell, 0.891 with no step; true 1). So the step is not absorbed by a bad estimate. It is
hidden by the data. Once repeats cover the step, nothing in the series says it was one jump rather than
k ordinary steps of wander, and no model of the repeats can get that back.

**What that means for the next idea.** A zero-inflated observation with one stale probability p for the
whole series (the flagship's next item) adds -2 [r log p + (n - 1 - r) log(1 - p)] to every partition's
cost, r the number of repeats. That is the same constant for every partition, so it picks exactly the
partition `missing` picks. It cannot change this cell, so it was not built. Only a stale probability
per segment, where a change in stickiness is itself a change, could add anything. That is a different
question.

**The operating point.** Mean false cuts on the walk with no step (F) and steps found (G), by penalty
multiplier m on the default 2 log n:

| 40% repeats | m 0.5 | 1 | 2 | 4 |
|---|---|---|---|---|
| shipped: F cuts / G found | 89.9 / 120 | 34.8 / 117 | **1.35 / 82** | 0.03 / 17 |
| `missing`: F cuts / G found | 29.5 / 114 | **1.35 / 77** | 0.00 / 33 | 0.00 / 0 |

| 20% repeats | m 0.5 | 1 | 2 | 4 |
|---|---|---|---|---|
| shipped | 61.7 / 120 | 7.76 / 118 | 0.28 / 85 | 0.00 / 9 |
| `missing` | 35.9 / 119 | 1.52 / 100 | 0.02 / 56 | 0.00 / 0 |

At 40% repeats the shipped model at twice its penalty has exactly the false-cut rate of `missing` at the
default (1.35 a series), and finds the step 82 times against 77. So most of the "power loss" behind the
declines was an operating-point difference: shipped's 60 of 60 was bought with 35 false cuts. But
`missing` is not more powerful at any matched rate, and at 20% repeats the shipped model is ahead
(0.28 cuts and 85 found at m 2, against 0.02 and 56 for `missing` at m 2). **The pre-registered rule
(missing at least as powerful at no more false cuts, at every shipped m and both shares) fails, so
nothing changes for users.**

**A lead, not a finding.** On a sticky series, the shipped model with a doubled penalty behaves about as
well as any repeat model tried here, and it needs no new code: `--penalty` with 4 log n. Seen after the
rule was written, so it needs its own pre-registration, on TCPD's four sticky series and on frozen orange
juice (where it must still find the big freezes), before the sticky-series warning can suggest it. Test:
`drift-sticky-why.test.mjs`.

### A doubled penalty on sticky series: fewer cuts, lost freezes (2026-11-12, pre-registered, negative)

The lead above, tested. `eval/drift-sticky-penalty.mjs` (`.out.txt`; rule in its header, committed in
ad6c8a60 before any real series was fitted at 4 log n) runs the shipped `--model drift` at 2 log n
(shipped) and 4 log n on every real series where the sticky check fires: TCPD's four (scored with TCPD's
F1, margin 5, and cover) and frozen orange juice (the eight freezes, found within 2 months). The rule
said the warning could suggest 4 log n only if mean F1 on the four did not fall, mean cover fell by no
more than 0.02, juice kept at least 7 of 8 freezes, and juice's cuts at least halved.

| series (repeats) | cuts / F1 / cover at 2 log n | at 3 log n (descriptive) | at 4 log n |
|---|---|---|---|
| bank (42%) | 63 / 0.031 / 0.048 | 50 / 0.038 / 0.048 | 43 / 0.044 / 0.048 |
| children per woman (25%) | 19 / 0.571 / 0.756 | 14 / 0.628 / 0.781 | 6 / 0.367 / 0.793 |
| ratner_stock (23%) | 30 / 0.324 / 0.592 | 9 / 0.547 / 0.726 | 3 / 0.308 / 0.746 |
| scanline 42049 (49%) | 27 / 0.593 / 0.702 | 13 / 0.700 / 0.740 | 8 / 0.805 / 0.847 |
| **mean of the four** | 0.380 F1 / 0.524 cover | 0.478 / 0.574 | **0.381 / 0.609** |
| frozen juice (41%) | 67 cuts, **8 of 8** freezes | 24 cuts, 6 of 8 | 9 cuts, **5 of 8** |

**Verdict: fails on R3, so the warning is unchanged.** On TCPD the doubled penalty passes (F1 level,
cover +0.085), but on frozen juice it keeps only five freezes, dropping 1958, 1970 and 1985: the same
smaller shocks the repeat models dropped. The synthetic cell's "same power at matched false cuts" does
not carry to real shocks. On a sticky series every option tried so far (drop, missing, a doubled
penalty) buys its fewer cuts by losing documented shocks, so the warning keeps telling the reader to
check jumps at the ends of flat runs against the raw data rather than offering a setting.

Seen after the rule, deciding nothing: 3 log n is best on F1 of the three on the sticky four (0.478) and
also on the 34 TCPD series where the check does not fire (0.754 against 0.697 shipped; 4 log n 0.706),
and finds 6 of 8 freezes. TCPD has been tuned against many times, so that is a lead for a fresh labelled
set, not a default to change. Test: `drift-sticky-penalty.test.mjs`.

### A stale probability per segment: it dates a change in stickiness, not the lost freezes (2026-11-12, pre-registered, negative)

"Why the step goes missing" left one repeat model untried: each segment with its own stale
probability, so that a change in how often a series updates counts toward a cut. It is now in the
library (`repeats: 'missing', stale: 'segment'` in `drift-level.mjs`; each segment adds the profiled
Bernoulli cost `staleCost(r, m)` of its r repeats among m steps; with no repeats it is plain `missing`).
The hypothesis was that a freeze moves the juice price and also makes it update more often, so this
term would recover the freezes (1958, 1970, 1985) that `missing` and a doubled penalty both drop.
`eval/drift-stale-segment.mjs` (`.out.txt`; rule in its header, committed in dfe02989e before the option
ran on anything) tested it at the default 2 log n. The first run stopped on a loader bug (two TCPD
series sit in `heldout/`) after the synthetic table and two TCPD rows had printed; the lookup was fixed
and the whole file rerun with the rule unchanged.

| | shipped | `missing` | per-segment stale |
|---|---|---|---|
| F: sticky walk, no change (cuts a series) | 35.43 | 1.59 | 3.98 |
| G: same with a 5-unit step (found of 120) | 119 | 93 | 97 |
| S: repeats 10% then 60%, no step (cut within 5 of the switch) | 71 | 4 | **103** |
| TCPD sticky four, mean F1 / cover | 0.380 / 0.524 | 0.476 / 0.570 | 0.381 / **0.435** |
| frozen juice: cuts, freezes found | 67, 8 of 8 | 18, 5 of 8 | 24, **5 of 8** (the same five) |

**Verdict: fails R1, R2 and R3 (R4 passes), so nothing changes for users.** The term does what it says:
it dates a pure change in stickiness 103 times in 120. But that is not what the freezes needed. It adds
six cuts on juice and finds the same five freezes, and on TCPD it cuts where annotators saw no change
(children per woman: cover 0.780 under `missing`, 0.408 here). A descriptive check run afterwards
(`eval/frozen-juice-staleness.mjs`, `.out.txt`) shows why: the repeat share does fall after five of the
eight freezes, but at the three lost ones it barely moves (1958: 0.67 before and after; 1970: 0.58 to 0.42;
1985: 0 and 0). Those shocks are small jumps in a series that updates at the same rate on both sides,
which no model of the repeats can tell from wander.

What it leaves: four repeat treatments (drop, missing, a doubled penalty, a stale probability per
segment) now fail the same frozen-juice bar, so the sticky-series warning's advice (check jumps at the
ends of flat runs against the raw data) stands. A per-segment stale rate may still be worth showing as a
*description* ("this series began updating less often here"), which is a different product question
from finding level changes. Test: `drift-stale-segment.test.mjs`.

## When a series starts updating less often (2026-11-12, pre-registered; ships as a description)

"A stale probability per segment" left one product idea: the drift model's per-segment stale rate dated a
pure change in stickiness 103 times in 120, but did nothing for level changes, so it could only be worth
showing as a *description*. That is now a separate pass, `update-rate.mjs`, apart from any level model:
optimal partitioning (PELT) of the 0/1 indicators "this step repeats the previous value exactly", each
stretch with its own repeat behaviour. A stretch is a two-state chain (P(repeat | the last step repeated),
P(repeat | it updated)), so a quote that sits for months, which makes long flat runs, is not read as a
change of rate. Missing values never count as repeats. It runs only with 10 or more repeats.

**Round one: cost and penalty** (`eval/update-rate-sim.mjs`, `.out.txt`; rule in its header, committed in
27308c125 before any run). On a calibration seed, independent-repeat costs needed 4 x 2 log n to keep
false changes at or under 0.05 a series once flat runs clump (at 2 log n they reported 2.1 to 6.9 false
changes a series on clumped chains), while the chain cost met it at 2 x 2 log n and found more, so that
was chosen. On the confirmation seed false changes stayed at or under 0.005 a series in all 18
no-change cells (repeat shares 10% to 60%, independent and clumped, n 100 to 600), but the rule also asked
for a date within 5 steps: **S1 (10% to 60% repeats) 179 of 200, needed 180; S4 (a clumped stale feed
fixed to 5% repeats) 121 of 200, needed 150. Fails, so it did not ship.** A diagnostic on another seed
(not a decision input) showed why S4 fell short: only 16 of 200 had no change at all, 49 were dated 6 to
20 steps early. In a clumped chain the last flat run before the switch ends at random, so the data do not
say to the step when the rate changed.

**Round two: a date range** (`eval/update-rate-range.mjs`, `.out.txt`; rule committed in 9302534ae after
round one's verdict and before the range ran). Each change gets every position between its neighbours
whose two-stretch cost is within a slack of the best. The slack was chosen on seed 20261203 as the
smallest of {2, 3.84, 6, 9, 2 log n} with coverage 0.90 in every power cell (9; 6 gave 0.89 on S4), then
checked on fresh seeds:

| confirmation (200 series a cell) | result | rule |
|---|---|---|
| no-change cells, worst mean false changes | 0.010 | <= 0.10, pass |
| S1, 10% to 60% repeats: range holds the switch | 200 of 200, median width 17 steps | >= 170, pass |
| S4, clumped stale feed fixed: range holds the switch | 181 of 200 (a change found in 185), width 44 | >= 150, pass |
| S2, 20% to 50% / S3, 40% to 10% (descriptive) | 172 of 200 / 197 of 200 | |

**Verdict: ships.** `--model drift` (CLI text and JSON field `updateRate`), the page's "Read with care"
notes and the branded drift report now say, when it finds one, "from about X (between A and B) it began
updating less often (repeats p% of steps before, q% after)", and that jumps near those dates may be
catch-ups after a stale stretch.

**On real series** (`eval/update-rate-real.mjs`, `.out.txt`, run after the verdict, descriptive; no labels
exist for this). Of 38 TCPD series it runs on 6 and speaks on 3: children per woman (37% repeats, then 5%
from row 108, then 59% from row 255, the stretch where the series reads as projected), scanline 42049 (six
switches between about 10% and 80 to 86% repeats, the image row's flat bright bands) and measles (6% to
0% from row 519). It stays silent on `bank` (42%) and ratner_stock (23%), sticky at a steady rate. On
Florida frozen orange juice it says repeats fell from **60% of months before about 1981-08 (between
1980-09 and 1982-04) to 12% after**. Whatever changed in how that price was collected, a reader looking
for freezes before 1981 should know that most months then were carried forward, which is why four
repeat models lost the smaller early freezes. Test: `update-rate.test.mjs` (pruning against exhaustive
search, the committed verdicts, the juice description and its wording in the CLI and page notes).

Next: show it beside the other models too (it depends only on the values), and a long series with a
documented change in collection to check a date against.

## The update-rate check beside every model, and on long series (2026-11-12, later)

The update-rate check above reads only the values, so it now runs beside the level models too, not only
`--model drift`: `analyze()` adds `updateRateWarning` and `updateRate` (changes and stretches) when it finds
a change, the CLI prints the line after the likely ranges, and the page's "Read with care" notes and the
branded report carry it. It reads the values as given, before `--log`. Frozen orange juice with the default
level model (and meanvar, trend, `--log`) now says the same thing the drift model does: repeats fell from
60% to 12% of months around 1981-08 (between 1980-09 and 1982-04). The Nile, with no repeats, says nothing.
Test: `update-rate-everywhere.test.mjs`.

**The check on long series.** Wiring it in exposed a cost: PELT prunes little when changes are few, so the
exact search grew as n squared (24 s at 20,000 steps, 48 s on a steady series; a 100,000-point series did
not finish in two minutes). That was already true of `--model drift`. Two changes: the segment cost no
longer allocates arrays (a constant factor), and above 1,500 steps (`EXACT_UP_TO`; the calibration and
confirmation sims ran at 100 to 600, so they are unaffected) the search places cuts on a grid of about
1,500 positions and then moves each cut, neighbours fixed, to its best position anywhere between them,
repeating until nothing moves.

Checked against the exact search by a rule committed with the code before it ran (`eval/update-rate-long.mjs`,
`.out.txt`; seed 20261210; 20 series a cell, n 4,000 and 8,000; two no-change cells, a switch, a fixed
clumped stale feed and a switch and back):

| | result | rule |
|---|---|---|
| G1, same number of changes as the exact search, every cell | 20 of 20 in all 10 cells | >= 18 of 20 |
| G2, grid change inside the exact change's range | 160 of 160, and at the same step every time | >= 95% |
| time over the 200 series (not judged) | 14.0 s against 302.9 s | |

**Verdict: the grid ships.** A 100,000-point series with one switch now takes about 0.15 s through
`updateRateChanges` (tested under 8 s, with the switch inside its range). Next: the multi-column and
`--consensus` outputs, which do not show it yet, and a long series with a documented change in collection.

## The update-rate check on every output, and repeats from rounding (2026-11-12, last)

**Several columns and `--consensus`.** The two outputs that did not show the update-rate check now do.
`--columns` (CLI text and JSON `updateRate` / `updateRateWarnings`, the page's several-columns "Read with
care" notes and the branded multi-column report) runs it on each column alone and names the column. A
cell the parser carries forward to keep the columns aligned is read as missing, never as a repeat:
`parseColumns` now lists those cells (`missing`), because a column with scattered blanks would otherwise
show a change of update rate that is not in the data (tested: 40 scattered blanks from row 40 read as a
change when carried forward, nothing when read as missing). `--consensus` (text and JSON) reads the
values before `--log`, as beside every single model.

**What it found on the juice file's second column.** Run on all of `data/frozen-juice.csv`, the check
also speaks on `ppi`, the producer price index: repeats fell from 33% of months before about 1969-04
(between 1968-03 and 1974-01) to 8% after. The index was published every month. It is recorded to 0.1,
and in the 1950s and 1960s it moved less than that in a third of months; half of the months it did move,
it moved by exactly 0.1. Those repeats are rounding of a slow series, not a stale feed, and the old
sentence ("this describes how often the data was refreshed ... a stale feed") would have misled.
The juice `price` column is the other case: when its stickier stretch moved, the median move was 19.5
ticks, so a repeat there is a month nobody refreshed the figure.

**The rounding sentence** (`eval/update-rate-rounding.mjs`, `.out.txt`; rule in its header, committed
with the code, run once on seed 20261212 with no retuning; both real columns were seen before the rule
was written, so they illustrate it and are not evidence for it). For each change, take the stretch with
more repeats; its tick is its own smallest move between neighbours (to 9 significant digits, so a series
that later gains a decimal is judged on its own precision). If the median move, among steps that moved,
is at most 1.5 ticks (`ROUNDING_TICKS`: half the moves are one tick), the change is flagged `rounding` and
the text says the repeats may only mean the series moved less than its recorded precision.

| 200 series a cell, n 300, switch at 150 | with a change | flagged rounding | rule |
|---|---|---|---|
| R1 rounded walk, step sd 0.04 -> 0.40 (tick 0.1) | 200 | 200 | >= 90%, pass |
| R2 rounded walk, 0.40 -> 0.05 | 200 | 200 | >= 90%, pass |
| R3 rounded walk, 0.06 -> 1.0 | 200 | 200 | >= 90%, pass |
| F1 stale feed, walk sd 2.0, carried forward 60% -> 10% | 200 | 0 | <= 5%, pass |
| F2 stale feed, walk sd 0.5 (5 ticks), 10% -> 60% | 200 | 0 | <= 5%, pass |
| F3 clumped stale feed fixed, walk sd 2.0 | 183 | 0 | <= 5%, pass |

**Verdict: ships.** The cells are well apart; a stale feed whose moves are themselves about one tick is
the case it cannot tell apart, and there it says "may". On the real series (`eval/update-rate-real.out.txt`,
descriptive): children per woman (2 decimals, moving 0.01 a year in its sticky stretches) and every
switch on scanline 42049 (integer pixel values) are flagged rounding; measles and the juice price are not.
Test: `update-rate-columns.test.mjs`.

Next: a long series with a documented change in collection to check a date against; a stale feed whose
moves are about one tick (the case the rounding sentence cannot separate).

### One-tick stale feeds: the catch-up check (2026-11-12, pre-registered twice; negative, not offered)

The rounding sentence above names the case it cannot separate: a stale feed whose real moves are about
one tick also has a median move of one tick, so it reads as `rounding`. What differs is the move that
*ends* a run of repeats. A rounded slow walk leaves a run by crossing the next rounding boundary, so that
move stays about one tick however long the run was. A stale figure catches up on every step it skipped,
so after k repeats its move has about k + 1 times the variance. `catchUpRatio` (update-rate.mjs) is the
mean squared move, in ticks, ending a run of `minRun` or more repeats over the mean squared move that
follows a move: near 1 for rounding, about 2 to 4 for a one-tick stale feed.

**Round one** (`eval/update-rate-catchup.mjs`, `.out.txt`; rule committed in 344f58cb3 before the
confirmation ran; setting chosen on calibration seed 1, runs of 2+ and ratio 1.4). Cells as in the
rounding check (R1-R3 rounded walks, F1-F3 stale feeds with large moves), plus three one-tick stale feeds
(T1 walk sd 1 tick, carried forward 10% then 60%; T2 1.2 ticks, 60% then 10%; T3 1 tick, clumped).

| seed 20261213, change nearest step 150 | catch-up among one-tick series | rule |
|---|---|---|
| R1 / R2 / R3, rounded walks | 3.0% / 0.5% / **6.0%** | <= 5% each: **fails on R3** |
| T1 / T2 / T3, one-tick stale feeds | 89.7% / 95.8% / 93.2% | >= 80% each: pass |
| F1-F3, rounding <= 5% (unchanged) | 0 / 0 / 0 | pass |

R3 is a walk of 0.6 ticks a step: after a long run it now and then moves two ticks, and with five or so
such moves the ratio is noisy enough to cross 1.4.

**Round two** (`eval/update-rate-catchup-2.mjs`, `.out.txt`; rule committed after round one's verdict and
before either step ran): pick on a new calibration seed (2) the setting with the best worst T cell among
those with every R cell at or under 2.5%, then run round one's rule once on fresh seed 20261214. It picked
runs of 3+ and ratio 1.8. R cells 1.5% / 0.0% / 1.5% (pass), F cells pass, T2 85.5% and T3 84.6%, but
**T1 79.5% (116 of 146), bar 80%: fails**, by one series.

**Verdict: not offered.** Two rounds bracket the trade-off: a ratio low enough to catch 90% of one-tick
stale feeds calls a 0.6-tick rounded walk stale about 5% of the time, and one high enough to keep that to
1.5% catches only about 80%. With about 300 steps there are too few catch-ups in a stretch to do better
with this statistic. A third round tuned on the same cells would be a forking path, so there is none.
`CATCHUP.ratio` is `Infinity`: the `rounding` flag and every sentence are exactly as before; each change
carries `catchUpRatio` as a number, with no sentence. Test: `update-rate-catchup.test.mjs`.

**On the juice file** (descriptive, seen after both verdicts): `ppi`, the rounded index, has a ratio of
0.48 (runs 3+), what rounding predicts; the move that ends a run is *smaller* than a typical move. The
`price` column, which the median-move test already calls stale (19.5 ticks), has 1.73: its moves after
long runs are larger, but by less than a carried-forward random walk's k + 1 would give. Why is open
(a price that mean-reverts, or one reset on its own schedule, would both do it); nothing here decides it.

Next for this question: longer stretches (the ratio's noise falls with the number of catch-ups, so a
power curve in n would say where a setting could pass both bars), or a likelihood for a rounded walk
against a rounded walk carried forward; and a real series with documented carry-forward to check against.

## Watching a growing series (2026-11-12, four pre-registered rounds; ships)

The page and CLI answer "did this series change?" once. Most people with a metric want the other
question: tell me, once, when it changes from now on. `watch.mjs` does that. Each run refits the newest
`--window` points (default 1,000) with the same engine, compares the changes with the ones in a state
file, and reports a change only when `--confirm` points (default 5) are on its far side and no change
already on record lies within `--tolerance` points (default 5), so a change re-dated by a point or two as
data arrives is not a second alert. The first run on a file with history records its changes as the
baseline instead of alerting (`--alert-history` reports them). A change on record is found again by its
label, so a rolling file that drops old rows keeps it; a shorter file or a vanished last label is
reported as a note. `--webhook-env NAME` posts each alert to the URL in that environment variable as
`{text, content}` (Slack, Teams and Mattermost read `text`, Discord `content`); when the webhook fails
the state is not saved, so the next run retries. `--fail-on-alert` exits 1, which turns a CI run red and
emails its owner. Tests: `watch.test.mjs` (12; a local HTTP server stands in for the webhook; no real
chat service was called).

**Self-deploy.** `sh deploy/make-watch-repo.sh <folder>` (or the `curl ... | sh -s -- <folder>` line in
the script's header, which needs no clone) writes the engine, `watch.mjs`, the MIT licence, a README and
`.github/workflows/watch-metric.yml`: a daily run that reads the `METRIC_CSV` variable (a file in the
repository or an https link, such as a published Google Sheet's CSV), posts to the `WATCH_WEBHOOK_URL`
secret if set, and commits `watch-state.json` back. Nothing in it calls anything the owner runs. The
workflow's own shell steps are replayed over simulated weeks of daily runs by `watch-workflow.test.mjs`
(section "The self-deploy workflow, run as a deployer's repository runs it" below); it has still not run on
GitHub itself.

**Round 1: which detector and how much confirmation** (`eval/watch-replay.mjs`, output
`eval/watch-replay.out.txt`). The rule was written in the script's header before the first run:
candidates PELT level, PELT level and volatility, and the engine's Bayesian detections, each at
`--confirm` 3, 5 and 10; among those reporting at least 90% of 2-sd steps in independent noise, take the
fewest false alerts per 1,000 checks averaged over three null streams (independent, AR(1) 0.5, t with 3
degrees of freedom); ties within 0.5 go to the shorter delay. Each stream is 500 points, watched from
point 100 with one check per new point, 10 seeds per cell. All nine passed the power bar; the Bayesian
detections with `--confirm 5` won: 0 / 7.5 / 2.5 false alerts per 1,000 checks on the three nulls
against PELT level's 2.5 / 49.75 / 12.75, 9 of 10 two-sd steps reported with a median delay of 5 points.
Its blind spot showed at once: 0 of 10 one-sd steps (PELT level 9 of 10). Level and volatility needs 10
points per segment, so its confirmation setting changes nothing.

Then the 31 univariate TCPD series, scored once and changing nothing, each watched from 20% of its
length (6,369 checks):

| setting (`--confirm 5`) | alerts | at an annotated change | per 1,000 checks | majority-marked changes reached | median delay |
|---|---|---|---|---|---|
| **Bayesian detections (default)** | 193 | 63 (33%) | 30.3 | 38 of 52 | 5 |
| PELT level | 626 | 134 (21%) | 98.2 | 52 of 52 | 5 |
| PELT level and volatility | 446 | 100 (22%) | 70.0 | 50 of 52 | 9 |

`bank` alone gave 42 of the default's 193 alerts and none at a mark: a level that wanders all the time
keeps alerting, so the page tells people to watch a quantity that holds a level, or its daily change.

**Round 2: a windowed probability** (`--round2`, output `eval/watch-replay-round2.out.txt`). A unit
test then found a clear 3-sd step that the default never reports: its Bayesian probability was split
over neighbouring points (0.15, 0.03, 0.17, 0.36), so no single point reached 0.5. Candidate
`bocpd-window` sums the probability over 5 neighbouring points. The rule, written before the run, on
fresh seeds 11-20: adopt it if it reports at least as many steps in every step cell and more overall,
and its mean null false-alert rate is at most 1.0 per 1,000 above the default's. It reported far more
(2-sd steps 10 of 10 against 6 of 10; 3-sd 10 against 8; 2-sd in AR(1) noise 10 against 7) but raised
false alerts from 3.92 to 7.58 per 1,000 (AR(1): 7.0 to 15.0). **Not adopted**; it is the option
`--detector bocpd-window`. On TCPD it sent 307 alerts, 85 at a mark (28%), 46 of 52 marked changes.

The fresh seeds also undercut round 1's pass: the default reported 6 of 10 two-sd steps there, so over
both rounds it is 15 of 20, below the 90% the rule asked for. The default stays as pre-registered, and
the page states the trade plainly: quiet, and it misses small steps; `--detector pelt` reaches every
marked change at about three times the alerts.

**Round 3: the AR(1) term in the Bayesian pass** (`--round3`, output `eval/watch-replay-round3.out.txt`;
rule committed before the run). Sticky noise is where round 2 lost, and the engine's Bayesian pass already
has an AR(1) term (`--ar1`: rho from the lag-1 correlation of the clipped first differences, then the
conditional AR(1) likelihood in every run). Candidates `bocpd-ar1` and `bocpd-ar1-window` (the same pass,
probability summed over 5 neighbours), each at `--confirm 5`, against `bocpd`, on fresh seeds 21-30, with two
cells added: AR(1) 0.8 noise with no change, and a 4 marginal-sd step in it. Rule: replace the default only if
the mean false-alert rate over the four nulls is at or below `bocpd`'s and the steps found over the five step
cells are at least as many.

| detector (`--confirm 5`) | iid | AR(1) 0.5 | t3 | AR(1) 0.8 | 1-sd | 2-sd | 3-sd | 2-sd AR(1) 0.5 | 4-sd AR(1) 0.8 |
|---|---|---|---|---|---|---|---|---|---|
| `bocpd` (old default) | 0.00 | 6.25 | 3.75 | **32.25** | 0/10 | 7/10 | 10/10 | 8/10 | 10/10 |
| `bocpd-ar1` | 0.00 | 0.75 | 3.75 | 1.00 | 0/10 | 7/10 | 10/10 | 3/10 | 10/10 |
| **`bocpd-ar1-window` (new default)** | 0.50 | 0.75 | 6.75 | 1.50 | 2/10 | 10/10 | 10/10 | 6/10 | 10/10 |

(False alerts per 1,000 checks on the four nulls, then steps reported.) `bocpd-ar1-window` passed both parts
(mean false alerts 2.38 against 10.56; 38 steps against 35) and **is the default from 2026-11-12** for the
level model. `bocpd-ar1` passed the false-alert part and failed on steps (30). What it costs: on t3 noise
false alerts rose from 3.75 to 6.75, and the 2-sd step in AR(1) 0.5 noise was found 6 times in 10 against 8,
because the AR(1) term explains part of a modest step as noise. The AR(1) term is for the level model only:
with `--model poisson` or `meanvar` the default stays `bocpd`.

The TCPD replay, scored once and deciding nothing, shows the same trade on real series, and the loss is
larger than on the synthetic cells:

| detector | alerts | at an annotated change | per 1,000 checks | majority-marked changes reached |
|---|---|---|---|---|
| `bocpd` | 193 | 63 (33%) | 30.3 | 38 of 52 |
| `bocpd-ar1` | 76 | 29 (38%) | 11.9 | 23 of 52 |
| **`bocpd-ar1-window`** | 103 | 39 (38%) | 16.2 | 29 of 52 |

About half the alerts, a slightly larger share of them at a marked change, and 9 fewer of the 52 marked
changes reached. Many TCPD series are short and smooth (yearly GDP, population), where the estimated rho is
high and a real move reads as persistence. So the page now says: the default is the quiet one; if a missed
change costs more than a false alarm, use `--detector bocpd` (38 of 52) or `--detector pelt` (52 of 52 at
about six times the alerts).

**Why the AR(1) pass lost marked changes** (`node eval/watch-rho.mjs tcpd-data --why`, output
`eval/watch-rho-why.out.txt`; diagnostic, decides nothing). The same replay, per series, with the rho the AR(1)
pass used at each check. Of the 17 majority-marked changes the plain windowed pass reaches and the AR(1) pass does
not, 15 were confirmed at a check where rho sat at the engine's 0.95 clip (median 0.95, range 0.55-0.95); the 29 it
reaches had median rho 0.48. 20 of the 30 series long enough to watch are at the clip from the baseline on, and all
are smooth or wandering: Brent crude (4 marked changes, 4 reached by the plain pass, 0 by the AR(1) pass), CO2 in
Canada (4 against 1), fertility (2 against 0), business inventories. At rho 0.95 the conditional AR(1) likelihood
expects each point to sit almost on the last, so a real move reads as persistence. A rho frozen at the baseline
cannot help: it is 0.95 there too.

**Round 4: a cap on rho** (`node eval/watch-rho.mjs tcpd-data --round4`, output
`eval/watch-replay-round4.out.txt`; the rule is in the script's header, committed before the run). Candidates: rho
capped at 0.8 and at 0.5, against the uncapped estimate, on round 3's nine synthetic cells with fresh seeds 31-40
plus AR(1) 0.95 noise (reported, deciding nothing). Unlike rounds 1-3, the TCPD series count, because the fault only
shows on real series. Rule: (a) mean false alerts over the four round-3 nulls at most 1.0 per 1,000 above the
uncapped default, (b) at least as many synthetic steps, (c) more TCPD marked changes reached with the share of
alerts at a mark at most 5 points lower.

| rho (`--confirm 5`, window 5) | iid | AR(1) 0.5 | t3 | AR(1) 0.8 | AR(1) 0.95 | steps (5 cells) | TCPD alerts | at a mark | marked changes reached |
|---|---|---|---|---|---|---|---|---|---|
| uncapped (round 3 default) | 0.50 | 0.25 | 5.25 | 0.25 | 1.25 | 36 | 103 | 39 (38%) | 29 of 52 |
| **capped at 0.8 (default from round 4)** | 0.50 | 0.25 | 5.25 | 0.00 | 3.00 | 36 | 115 | 47 (41%) | 33 of 52 |
| capped at 0.5 | 0.50 | 0.50 | 5.25 | 15.00 | 27.25 | 37 | 169 | 66 (39%) | 41 of 52 |

The 0.8 cap passed all three parts and **is the default from 2026-11-12** (`--rho-cap`, default 0.8; `--rho-cap
0.95` is the uncapped estimate). On the synthetic cells it changed nothing except the stickiest noise: AR(1) 0.95
with no change rose from 1.25 to 3.0 false alerts per 1,000 checks. The 0.5 cap reaches 41 of 52 at 15 and 27 false
alerts per 1,000 on AR(1) 0.8 and 0.95 noise; it failed (a) and is not offered as a default, though `--rho-cap 0.5`
runs it. On the real series shipped with the tool (`watch.test.mjs`), the capped watch reports the S&P 500's
October 2008 fall and Canada's 1946 fertility rise, which the uncapped estimate read as persistence. TCPD now
counted in a rule, so its 33 of 52 is no longer a held-out figure: a fresh labelled set is the test.

## Round 5: flicker after the baseline (2026-11-12, pre-registered; `hold` ships)

The fault is the one the replay found on `ausair`: right after a quiet first check, a short history can make the
engine find changes well in the past for one check, and the watch alerted on them. Two guards, written as `advance`
options in `watch-core.mjs` and pre-registered with the rule in the header of `eval/watch-flicker.mjs` (committed
before the first run; output `eval/watch-flicker.out.txt`, 349 s on 4 cores):

- `hold` (`holdHistory`): a change dated where the first check already had 5 points after it is history the
  baseline called quiet; it is recorded as held, never alerted. The state keeps that row's label (`quietUntil`).
- `persist2` (`persist: 2`): a change is alerted only if a detection within 5 points of it was also there at the
  previous check, so a one-check blip is never sent; it costs one check of delay.

All candidates use the shipped detector (AR(1) Bayesian pass, rho cap 0.8, probability over 5 neighbours,
`--confirm 5`), so the detections are identical and only what is sent differs. Rule: replace the default only with
mean false alerts on the four synthetic nulls no higher, at least as many synthetic steps with the median delay at
most 2 points longer, and on TCPD's 31 shipped series at least as many majority-marked changes reached, fewer alerts
and no lower share at an annotated change.

| policy | null false alerts / 1,000 (mean of 4) | steps (5 cells, 50) | median delay | TCPD alerts | at a mark | marked reached | flicker alerts |
|---|---|---|---|---|---|---|---|
| now (old default) | 1.44 | 40 | 5 | 115 | 47 (41%) | 33 of 52 | 8 |
| **hold (default from round 5)** | 1.44 | 40 | 5 | **106** | 45 (42%) | **33 of 52** | 7 |
| persist2 | 1.25 | 40 | 5 | 112 | 46 (41%) | 32 of 52 | 4 |
| hold + persist2 | 1.25 | 40 | 5 | 103 | 44 (43%) | 32 of 52 | 4 |

(Flicker alert: one whose change has no detection within 5 points at the very next check.) `hold` passed all three
parts and **is the default from 2026-11-12** in the CLI, the page's watch card, the replay and the agent tools;
`--alert-old-history` (or `holdHistory: false`) turns it off. On the synthetic cells it changes nothing, because
their baseline is at point 100 and the changes come later: the guard only acts on short histories. On TCPD it took
9 alerts off six series (bank 3, children per woman 2, and one each on ozone, quality control 4, Dutch unemployment
and the krona-dollar rate) and lost no majority-marked change; two of the 9 were at a change at least one annotator (not a majority) marked
(ozone, the krona), so the share at a mark moved only from 41% to 42%. `persist2` removed half the flicker alerts
and the most false alerts on sticky noise, but it lost the one majority-marked change it reached on `children_per_woman` (why
was not traced), so it failed the rule and stayed an option (`--persist 2`) until round 7, which traced the lost mark to the replay ending and made it the default (below). On
`ausair` the replay now sends 1 alert (2011, for the 1991 rise) instead of 3; the 1979 and 1985 detections that
showed at row 1990 are listed as held (`watch.test.mjs`).

**On fresh data.** Part C of the same run scored the 7 univariate TCPD series TCPD does not ship (bitcoin, Iceland
tourism, measles, Ratner stock, robocalls, two scan lines; `tcpd-data/heldout`, never used by a watch round),
deciding nothing for round 5. `hold` went from 68 alerts to 61 with the same 9 of 12 marked changes (38% to 43% at a
mark). The same run made round 4's pre-registered check of the rho cap on fresh data: capped at 0.8 the watch
reaches 9 of 12 marked changes with 38% of alerts at a mark; the uncapped estimate 6 of 12 at 43%. **The cap held
on fresh data** (the bar was at least as many marks, share no more than 5 points lower). The plain windowed pass
without the AR(1) term reached all 12 at 161 alerts (24% at a mark), so the quiet default still trades about a
quarter of the marked changes for 60% fewer alerts; measles alone gave the shipped watch 20 alerts and no mark.
Seven series and 12 marks are few; these are leads, not tight estimates.

Old state files have no `quietUntil`, so a watch that was already running keeps alerting as before until it is
reset; a new watch or a forgotten one starts with the guard.

### Round 5, after the round: the other two settings, the coarse replay, and why persist 2 lost a mark (2026-11-12, deciding nothing)

Three checks of the round-5 result, run after it and changing nothing.

**The page's other "How eager" settings with `hold`** (`node eval/watch-hold-detectors.mjs tcpd-data --detector pelt`
or `bocpd`; outputs `eval/watch-hold-pelt.out.txt`, `eval/watch-hold-bocpd.out.txt`). Round 5 scored only the quiet
default, but the guard applies to every detector. With Eager (`pelt`), TCPD alerts go from 626 to 611 and the watch
still reaches 52 of 52 marked changes. The 7 held-out series go from 289 to 286, still 12 of 12. With Middle (`bocpd`),
TCPD goes from 193 to 183, still 38 of 52, and held-out from 122 to 112, still 11 of 12. Neither setting now sends an
alert about history before the baseline (Eager had 15 on TCPD and 3 held out; Middle 10 and 10). So the page's labels
still hold: Middle sends about 1.7 times the default's 106 TCPD alerts, and Eager reaches every marked change.

**The coarse replay agrees a little more** (`node eval/watch-replay-bisect.mjs`, output
`eval/watch-replay-bisect-hold.out.txt`; the pre-round file is kept). On the 57 series in `data/`, the every-point
replay sends 130 alerts (was 141). Checking every 5 points gives 114 identical alerts (88%, was 85%) and every 15
gives 110 (85%, was 80%). Hold removes some flicker but not all of it, so a coarse replay of a long series still
undercounts.

**Why persist 2 lost a mark** (`node eval/watch-persist-why.mjs tcpd-data`, output `eval/watch-persist-why.out.txt`).
`children_per_woman` is 301 yearly points, 1800 to 2100. With persist 1, the alert that reaches the majority mark
(row 145, the 1940s) is the change at row 142. The engine first detects it at point 301, the last row of the
series, and sends it there, 159 rows late. With persist 2 it is still waiting for its second check when the
series ends. The replay has no next point, so it scores the change as missed. A watch on a live series would have
sent it the next day if the detection held. The mark was lost to censoring at the end of a finite replay, not to the
guard. A fair retry of persist 2 scores changes still waiting at the end apart from misses (or adds one check past
the end), and that rule needs pre-registering before the run.

### The watch on the page and as an agent tool (2026-11-12)

The watch needed a GitHub repository and a scheduled workflow; someone who looks at a metric every few days
needed neither. The logic moved, unchanged, from `watch.mjs` to `watch-core.mjs` (no file, network or process
access; `watch.mjs` re-exports it and keeps the state file, the CSV link, the webhook and the exit code), and
gained `watchCheck({ csv, state, column, model, detector, ... })`, one call that parses, detects and advances the
state and returns `{ alerts, pending, baseline, notes, state, text }`.

- **On the page:** a card, "Keep watching a series", under the results. It reads the data box or an https CSV link
  (a published Google Sheet answers with CORS; a link that does not is reported with "paste the rows instead"),
  takes the value column, model, period and logs from the boxes above (the trend, drift and robust models are
  watched as a level, and the card says so), and offers the three measured settings as "How eager": quiet
  (`bocpd-ar1-window`, the default), middle (`bocpd`), eager (`pelt`). The state is kept in the browser's
  localStorage under the watch's name (the link, or "pasted series"); "Forget this watch" drops it. A new local
  counter, `watch_check`. The one `fetch` on the page is that link, a GET without cookies; `page.test.mjs` now
  allows exactly that call and nothing else.
- **As an agent tool:** the page imports `watch-core.mjs`, so `platform/agents/tools.mjs` exposes it (its gate
  refuses modules that touch the network or the process, which is why the CLI's `watch.mjs` could not be).
  `node platform/agents/tools.mjs call changepoint-detector watchCheck --input '{"csv":"...","state":null}'`;
  the agent keeps `state` for its next call.
- **Checked:** `watch-page.test.mjs` (4: a baseline, then one new step reported exactly once across 80 one-row
  checks with the state round-tripped through JSON as the page stores it, at 5 to 15 points after the step; the
  CLI and the page share one copy; bad input; the page's wiring). `eval/watch-page-browser.mjs` in headless
  Chromium (output `eval/watch-page-browser.out.txt`, 8 of 8): the baseline survives a reload, a second step is
  reported once and then not again, an unreachable link explains itself, a CORS link (answered by Playwright, no
  real sheet was read) is read into the data box, Forget starts a fresh baseline, no page errors. The deploy
  script now copies `watch-core.mjs` too (`watch.test.mjs`'s self-deploy test runs the folder it makes). No
  detection numbers changed: same defaults, same engine.
- **Not done:** no person has used the card yet; a browser that clears storage forgets the watch (the card says
  so); there is no reminder to come back, which is what the self-hosted daily run is for.

Next: a real deployer's repository run end to end on GitHub Actions; the cap on fresh labelled series from outside TCPD; the
plain pass's remaining lead (38 against 33 marked changes) is on series whose level wanders, where the drift model
(`--model drift`) may be the better watch.

## Replaying the watch on your own history (2026-11-12, later)

The question before anyone sets an alert up is "how often would this have pinged me, and how late?".
`replayWatch(values, labels, opts)` in `watch-core.mjs` (re-exported by `watch.mjs`) answers it by running the watch's own
`detectChanges` and `advance` after each new point of a finished series. As a real first run does, the
first check (default: at 20% of the series, at least 20 points) records the changes already there as the
baseline. Each later alert comes back with the change's date, the row whose arrival sent it, and its delay
in rows. On the page it is the card "3. What a daily watch would have sent" after any one-column run. It
runs in the page's background worker (`analyzeJob` kind `replay`) and is counted as `watch_replay`. Agents
call `node platform/agents/tools.mjs call changepoint-detector replayWatch --module watch-core.mjs --args
'[[...values], [...labels], {"from": 100}]'`. It complements "Keep watching a series" (`watchCheck`, the
section above), which checks from today on with the state in the browser; the replay answers what that
check would have said on every past day.

**Cost, and a coarse replay.** Each check refits up to `window` points, and the Bayesian pass is about
quadratic in that: 175 ms for 1,000 points on one core of this session's machine, so replaying a
1,000-point series after every point took 25 s. A replay is therefore held to a work budget
(`REPLAY_BUDGET`, 3e7 point-squares, about 5 s here). Series up to about 450 points are checked after
every point; longer ones are checked every `step` points (2 at 500 points, 12 at 1,000, 48 at 2,000).
When a coarse check finds an alert, the replay bisects back to the first row whose arrival sends it.
Timings on synthetic steps: 500 points 5.1 s, 1,000 points 6.5 s, 2,000 points 7.3 s, each step alert
found and dated 5 or 6 rows late.

**Does the coarse replay give the same alerts?** `node eval/watch-replay-bisect.mjs` (output
`eval/watch-replay-bisect.out.txt`) ran it on every real series in `data/` with 40 to 800 points (57
series, default settings, last numeric column). The every-point replay sent 141 alerts. The coarse
replays compared with it:

| checked every | alerts identical (same change, same row) | sent at another row | missed | extra | checks |
|---|---|---|---|---|---|
| 1 point (reference) | 141 | | | | 10,724 |
| 5 points | 120 (85%) | 9 | 12 | 3 | 2,622 |
| 15 points | 113 (80%) | 12 | 16 | 3 | 1,398 |

The differences are not bisection errors. They come from detections that flicker: present at one check
and gone at the next. One example is `ausair` (47 points). The first check at 20 points sees no change.
At 21 points the engine finds two changes, at rows 9 and 15, both with enough rows after them, so the
every-point watch alerts on both, about history it had just called quiet. At 22 points both are gone, and
from 23 on there is one change at row 16. The coarse replay never sees the 21-point check, sends one alert
(row 16), and then, because row 21 is within the 5-row tolerance of 16 and not of 15, misses a third.
So a coarse replay undercounts the flicker alerts a real daily watch would send (12 of 141 missed at
step 5). That is the price of keeping long series to a few seconds in a browser tab. The page checks
every point up to about 450 points, so most pasted series are replayed exactly. Above that, the
replay's own text says how often it checked.

**What the replay shows about the watch itself.** The `ausair` case is a weakness of the watch, not
only of the replay: right after the baseline, a short history can produce alerts about changes well in
the past, sent the day the engine first finds them. Two fixes were then tested in a
pre-registered round and one ships: "Round 5" below.

Tests: `watch.test.mjs` (2 new). A clear 3-sd step at row 200 of 260 is alerted once, 5 to 7 rows late,
and checking every 7 points with bisection gives the same change and row. A step before the first check
is baseline, not alert; quiet noise (seed 22) sends nothing with the budget raising the step. Under 10
points is refused. Page: headless Chromium at 390 px on the Nile example. The card appears after the run,
the replay reports 1 alert (sent at 1904 for the 1899 change, 6 rows late, level 1,098 to 826, 62%),
there are no console errors, and the page has no horizontal scroll.

## Round 6: which "How eager" suits this series? A hint from your own history (2026-11-12, pre-registered; ships, narrowly)

Rounds 1-5 chose one default for every series, and the held-out replay showed what that costs: the plain pass
reached 12 of 12 held-out marks where the quiet default reached 9, while on measles alone the default sent 20 alerts
and reached none. The one thing the tool knows about a person's series before the watch starts is its history. So:
replay that history once per setting (quiet `bocpd-ar1-window`, middle `bocpd`, eager `pelt`), count alerts per 100
daily checks, and suggest the most eager setting that stayed at or under a budget.

**The round** (`eval/watch-eagerness.mjs`, output `eval/watch-eagerness.out.txt`, 101 s on 4 cores; the rule is in the
script's header, committed in its own commit before the first run). Each univariate TCPD series is cut in half: the
first half is the history, the second the future. The watch is replayed after every point with the shipped policy
(confirm 5, tolerance 5, hold). The hint at B = 2 alerts per 100 checks picks a setting from the first half; it is
scored on the second half only. Rule: (a) more future majority-marked changes reached than fixed quiet, (b) future
alerts per 1,000 checks at most fixed middle's, (c) share at a mark at most 5 points below quiet's. Series with fewer
than 30 points of history are skipped (8 of the 31, all short yearly series), leaving 23.

| policy (future halves, 23 TCPD series) | alerts | at a mark | per 1,000 checks | majority-marked reached | picks q/m/e |
|---|---|---|---|---|---|
| fixed quiet (default) | 62 | 27 (44%) | 16.0 | 16 of 31 | 23/0/0 |
| fixed middle | 107 | 35 (33%) | 27.6 | 23 of 31 | |
| fixed eager | 369 | 80 (22%) | 95.2 | 31 of 31 | |
| **hint, B = 2 (pre-registered; ships)** | 68 | 28 (41%) | 17.5 | **17 of 31** | 15/6/2 |
| hint, B = 1 | 62 | 27 (44%) | 16.0 | 16 of 31 | 17/5/1 |
| hint, B = 5 | 97 | 37 (38%) | 25.0 | 21 of 31 | 7/11/5 |

All three parts passed, so **the hint ships**, but read the margin: one more marked change than quiet (17 against 16)
for 6 more alerts. It moved 8 of 23 series off quiet: the two airport passenger series, seat belts, US population and four
quality-control series, where every setting was nearly silent on the history (which series gained the mark was not
traced). The B = 5 row shows the trade a person can make by hand: 21 of 31 at 25 alerts
per 1,000, still under fixed middle on both counts.

**Held out** (6 of the 7 held-out series; robocalls is too short; deciding nothing): every series' quiet rate on the
history was under 2 but middle's and eager's were over, so the hint picked quiet everywhere and changed nothing (6 of 9
marks at 22.7 per 1,000, the same as the default). B = 5 would have reached 8 of 9 at 39.7 per 1,000.

**The rate as a forecast.** The page shows "on your history it would have sent r alerts per 100 checks". The
pre-registered bar for showing it was a Spearman correlation of at least 0.5 between history and future rate across
the scored TCPD series for quiet; it was 0.616 (middle 0.687, eager 0.739), so it ships. On the 6 held-out series it was
-0.20 for quiet and -0.43 for middle: six series is too few to rank, but it is the wrong sign, so the page words the
number as what the history would have sent, not a promise. Iceland tourism is the example: quiet sent 3.8 per 100 on
the history and none on the future.

**Where it is.** `eagernessReplay(values, labels, opts)` and `eagernessText` in `watch-core.mjs` (each setting's
`replayWatch`, each with its own work budget; for `meanvar` and `poisson` the quiet default is already `bocpd`, so
there are two settings). On the page, the replay card has a button "Which How eager suits this series?" that runs it
in the background worker (`analyzeJob` kind `eagerness`), shows a table of the settings, and a button "Use Middle for
the watch below" that sets the "Keep watching" card's select; counted locally as `watch_eagerness`. Agents:
`node platform/agents/tools.mjs call changepoint-detector eagernessReplay --module watch-core.mjs --args '[[...values]]'`.
Tests: `watch-eagerness.test.mjs` (6); `eval/watch-eagerness-browser.mjs` in headless Chromium at 390 px on the Nile
example (output `eval/watch-eagerness-browser.out.txt`, 8 of 8: Nile suggests Middle, the button sets the select, no
page errors, no sideways scroll). Not done: the CLI `watch.mjs` has no flag for it yet; no person has used it.

Next for the watch: a second labelled set to test the hint where it matters (only 23 series and 31 future marks
here); a budget the person sets in plain terms ("about one alert a month at a daily check" is B = 3.3); the drift model as
the watch for wandering levels.

## The hint in the CLI watch, and a budget in plain terms (2026-11-12)

Round 6's hint was on the page and the agent tool only; the scheduled watch (`watch.mjs`, the one that runs daily
in a deployer's own GitHub repository) still needed the person to pick "How eager" by hand. Now:

- `node watch.mjs daily.csv --suggest` replays the history once per setting and prints the same table and
  suggestion as the page, then stops (no state read or written; `--json` for the numbers).
- `--detector auto` makes the first run pick the setting from the history by the round 6 rule and store it in the
  state file as `choice` (detector, setting, budget, the number of points it was picked from, the history rate).
  Later runs reuse it, so the watch does not switch setting under the person as the series grows; deleting
  `choice` from the state file picks again. Under 30 points of history (round 6 skipped those series) it keeps
  Quiet and says why. `advance` now carries `choice` from one state to the next.
- The budget in plain terms: `--alerts-per 1/month` (also `<n>/week`, `<n>/year`) with `--check-every day`
  (default; `hour`, `week`), or `--budget <alerts per 100 checks>`. A month is a twelfth of 365.25 days, so one
  alert a month at a daily check is 3.29 per 100 checks; the default budget, 2 per 100, reads back as "about
  7.3 alerts a year at a daily check". `budgetFromPlain` and `plainBudgetText` are in `watch-core.mjs`, so the
  page and agents can use them; `eagernessText` now prints the budget in both forms.
- The scheduled workflow (`deploy/watch-metric.yml`) and the README `deploy/make-watch-repo.sh` writes suggest
  `WATCH_OPTIONS="--detector auto --alerts-per 1/month"`.

**What the plain budgets do on TCPD** (round 6's script re-run with the extra budgets via `WATCH_BUDGETS`, deciding
nothing; output `eval/watch-eagerness-plain.out.txt`; every original row reproduced exactly). Future halves of the
23 scored series, then the 6 held-out ones:

| budget | as asked | alerts | at a mark | per 1,000 checks | marked changes reached | held out: per 1,000, reached |
|---|---|---|---|---|---|---|
| fixed quiet (default) | | 62 | 27 (44%) | 16.0 | 16 of 31 | 22.7, 6 of 9 |
| 1.64 | 6 a year | 67 | 28 (42%) | 17.3 | 17 of 31 | 22.7, 6 of 9 |
| 2 (pre-registered default) | about 7 a year | 68 | 28 (41%) | 17.5 | 17 of 31 | 22.7, 6 of 9 |
| 3.29 | 1 a month | 76 | 34 (45%) | 19.6 | 19 of 31 | 30.6, 6 of 9 |
| 14.3 | 1 a week | 292 | 74 (25%) | 75.3 | 29 of 31 | 93.5, 9 of 9 |
| fixed middle | | 107 | 35 (33%) | 27.6 | 23 of 31 | 41.9, 8 of 9 |

Read it as a menu, not a result: "1 a month" reached 19 of 31 future marks at 19.6 alerts per 1,000 checks with the
best share at a mark of any row (45%), but on the held-out series it sent a third more alerts for the same 6 of 9.
"1 a week" is close to eager. The budget caps what a setting sent on the history; the future rate came out well under
it at every budget up to a month (19.6 per 1,000 is about 0.6 a month), because most series are quiet in their second
half. The shipped default stays 2 per 100, the pre-registered budget.

Tests: `watch-auto.test.mjs` (5): the conversions and their round trip; `--suggest` prints all three settings and the
plain budget and writes nothing; `--detector auto` picks Eager at a 100-per-100 budget on 150 points, stores it, keeps it
for 70 one-row runs even when later runs pass a budget that would pick otherwise, and alerts the step at row 200 once;
under 30 points and over budget it keeps Quiet; bad flags are refused. Run on the Nile (59 then 60 points, 1 a month):
picked Eager at 2.56 per 100 on the history, recorded 1899 as the baseline, then kept the pick.

Not done: the page's hint button still uses the fixed budget (a plain-terms box is next); no person has used it.

## A budget box on the page (2026-11-12)

The page's "Which How eager suits this series?" button used the fixed budget of 2 alerts per 100 checks; only the CLI
(`--alerts-per`) took one in plain terms. Now the replay card has a box above the button: "About [n] alerts a
[year | month | week], checked every [day | hour | week]". Blank is the tested default (2 per 100, about 7.3 a year at a
daily check). The summary reads the budget back in both forms, so a person sees what their words meant.

- **No second replay.** Alerts per 100 checks do not depend on how often the checks run, so the box only moves the
  cut. `suggestFor(settings, budget, n)` (new in `watch-core.mjs`, used by `eagernessReplay` too) re-picks from the
  last replay as the box changes; the replay itself runs once per button press.
- **Off the tested budget, the evidence says so.** The "not a promise" line was measured at 2 per 100. At any other
  budget `eagernessText` adds that those numbers are for the tested budget and gives the plain-budget menu from the
  section above (about 1 a month: 19 of 31 future marks at 19.6 per 1,000; about 1 a week: 29 of 31 at 75.3).
- **Two edge cases the browser check found.** "30 a week at a daily check" is 429 alerts per 100 checks, more than one
  per check; `budgetFromPlain` now refuses it ("That is more than one alert per check (7 daily checks a week); give
  at most 7"), in the CLI as well. And a budget of 0 a year printed the "a level that wanders all the time" advice,
  which is wrong when the person simply asked for few alerts: under the default budget the text now says Quiet is
  the least eager setting and leaves the wandering-level advice to budgets at or above 2. The old error said
  "dayly"; fixed.
- **Under 30 points the hint keeps Quiet**, as `--detector auto` already did (round 6 skipped those series). Before,
  the page and `--suggest` would suggest Eager on, for example, the 24-point airmiles series, where every setting sent
  nothing on a history too short to judge.

What the box changes on real series in `data/` (default settings; rate = alerts per 100 daily checks on the
history; computed with `suggestFor` on one replay each, not a round, deciding nothing):

| series | points | quiet | middle | eager | default (7.3/yr) | 6 a year | 1 a month | 1 a week |
|---|---|---|---|---|---|---|---|---|
| nile | 100 | 1.25 | 1.25 | 2.50 | Middle | Middle | Eager | Eager |
| uk-driver-deaths | 192 | 0.00 | 1.95 | 5.84 | Middle | Quiet | Middle | Eager |
| lake-huron | 98 | 0.00 | 3.85 | 8.97 | Quiet | Quiet | Quiet | Eager |
| us-unemployment | 202 | 3.70 | 6.79 | 12.96 | Quiet | Quiet | Quiet | Eager |
| ausbeer | 218 | 0.00 | 0.00 | 1.71 | Eager | Middle | Eager | Eager |
| payroll-views | 731 | 0.00 | 0.17 | 4.27 | Middle | Middle | Middle | Eager |
| gold | 1074 | 1.51 | 3.60 | 9.53 | Quiet | Quiet | Quiet | Eager |

uk-driver-deaths shows why the box matters: Middle sent 1.95 per 100 on the history, just under the default's 2, so
"6 a year" (1.64) and "about 7 a year" give different answers. A person can now see that cliff instead of trusting
one fixed number. "1 a week" picks Eager on every one of them, which matches round 6's B = 5 and plain-budget rows:
a weekly budget is close to always-eager.

Tests: `watch-eagerness.test.mjs` (7: re-picking from one replay matches a fresh replay at five plain budgets; the
off-budget caveat; the under-30 rule), `watch-auto.test.mjs` (the over-one-per-check refusal and 7 a week = 100 per
100), `watch-page.test.mjs` (the import). `eval/watch-eagerness-browser.mjs` in headless Chromium at 390 px on the Nile
example (output `eval/watch-eagerness-browser.out.txt`, 15 of 15): 0 a year suggests Quiet without the wandering
advice, 3 a week suggests Eager and reads back "42.9 alerts per 100 checks, about 13 alerts a month", "Use Eager" sets
the watch select to `pelt`, -1 and 8 a week are refused in words, blank returns to the default, no page errors, no
sideways scroll.

Not done: the budget box does not carry into the "Keep watching" card's state (the card stores the setting, not the
budget); no person has used it; the next real test of the hint is still a fresh labelled set.

## The self-deploy workflow, run as a deployer's repository runs it (2026-11-12, last; a bug found and fixed)

Every earlier test ran `watch.mjs` in the folder `make-watch-repo.sh` writes, never the workflow file that wraps it,
so the YAML's shell, its `if: always()` save step and its `git push` were untested. `deploy/run-workflow.mjs` now runs
`watch-metric.yml`'s own `run:` blocks the way a GitHub-hosted runner does: a fresh shallow clone per run (as
`actions/checkout`), GitHub's default shell (`bash --noprofile --norc -eo pipefail`), `${{ vars.* }}` and
`${{ secrets.* }}` substituted (empty when unset), `GITHUB_STEP_SUMMARY` as a file, and later steps skipped after a
failure unless marked `always()`. A local bare repository stands in for GitHub; a second clone plays the deployer's
data job, committing one row a day. `watch-workflow.test.mjs` (5 tests, about 18 s) replays 20 daily runs after a
60-row history, with orders around 100 a day (sd 5) stepping to 120 on day 70:

- **No webhook:** the baseline run is green and its state reaches the remote; exactly one run goes red, on day 72,
  for a change dated day 68 (within the 5-point tolerance of the true day 70, after 5 points on its far side); the
  state is committed on that red run too, so no later run repeats it.
- **A failing webhook:** the run whose POST got a 500 is red and saves nothing ("the state was not saved"); the
  next day's run posts the same dated change once more, gets a 200 and stays green. Two POSTs in all, `text` and
  `content` identical. The stand-in chat service is a local HTTP server; no real one was called.
- **`METRIC_CSV` unset:** the first step exits 2 with the instruction; the save step still runs and commits nothing.
- **The bug: a row pushed while the run is in progress.** A deployer whose CSV is updated by another scheduled job,
  or by hand, can push between the checkout and the save step. The old save step ran a plain `git push`, which the
  remote refused ("fetch first"): the run went red, `watch-state.json` was lost, and the next day the same change
  would have been reported again. The test reproduced it against the old file (it fails there and passes now). The
  save step now replays its one commit on top with `git pull --rebase` and pushes again, up to four tries 0, 5, 15
  and 30 s apart, and says so if it still cannot. Only the bot writes `watch-state.json`, so the rebase has
  nothing to conflict with.

Not done: this is an emulation, not GitHub. `actions/checkout` and `actions/setup-node` are replaced by `git clone`
and the local Node 22 (the workflow asks for 20); the YAML reader handles only the subset this workflow uses; GitHub's
60-day pause of scheduled workflows in quiet repositories, run timing and the token's push permission are not
exercised. A real deployer's repository on GitHub is still the open check.


## Round 7: persist 2 retried, with the end of the replay scored apart (2026-11-12, pre-registered; ships, narrowly)

Round 5's `persist2` guard (send a change only when the next check still finds it) cut flicker alerts by half but
failed its rule by one majority-marked change, on `children_per_woman`. The diagnosis afterwards (Round 5, "after the
round") found the cause: the change at row 142 is first detected at point 301, the series' last row. Persist 1 sends it
there. Persist 2 is still waiting for its second check when the replay runs out of rows, and the replay scored that as
a miss. A live watch would get its next check.

`eval/watch-persist-censor.mjs` retries the comparison. Its rule was committed before the first run (git history of
this PR). It compares `hold+persist2` with the default `hold` and scores **end-pending** changes apart: a change that
has its 5 points after it and is waiting only for the second check when the replay ends. A majority-marked change is
censored when one policy has such a change near it and no alert there. It is then dropped from both policies' totals.
An alert sent at the last check, at a change the other policy holds end-pending, is set apart in the same way. To
adopt, all four parts had to pass: (a) and (b) on fresh synthetic seeds 51-60 (round 5's null and step cells), (c) on
TCPD's 31 series (reach no fewer marks, send fewer alerts, keep no lower a share at a mark), and (d) on the 7
held-out series (no fewer marks, no more alerts). Output: `eval/watch-persist-censor.out.txt`, 278 s on 4 cores.

| part | hold | hold + persist2 |
|---|---|---|
| (a) false alerts / 1,000 checks, mean of 4 nulls (fresh seeds) | 2.13 | 2.06 |
| (b) steps found (50), median delay | 39, 5 | 39, 5 |
| (c) TCPD, censored: marks reached, alerts, share at a mark | 32 of 51, 105, 41.9% | 32 of 51, 103, 42.7% |
| (d) held out, censored: marks reached, alerts | 9 of 12, 61 | 9 of 12, 59 |
| 57 unlabelled series in `data/` (deciding nothing): alerts | 130 | 125 |

All four passed, so **persist 2 is the watch's default from round 7** in `WATCH_DEFAULTS` (CLI, page watch card,
replay, eagerness hint and agent tools). `--persist 1` sends at once. Only one mark was censored, the
`children_per_woman` one. No held-out series and none of the 57 in `data/` ended with a change waiting.

How much this rests on, said plainly. Parts (c) and (d) re-score data round 5 already reported for this policy, under
a rule written after seeing it. The header of the script predicted (c) to the alert before the run, and the run
matched. Only (a) and (b) are on unseen data. There persist 2 ties on every step cell and every rule null except
AR(1) 0.8 (1.00 against 1.25 false alerts per 1,000) and 0.95 (2.00 against 2.50, reported only). Its delay is one
point longer on the 1-sd and 2-sd iid cells (6 against 5). So the gain is small: about 2% fewer alerts on real
series, a fifth fewer on very sticky noise, no marked change lost. The cost is one check of delay on every alert,
which is a day on a daily watch. Adopted because the pre-registered bar was met, not because the margin is large.

Two things in the scripts were fixed after the run, and neither changes a decision. `advance` fills any option a
policy leaves out from `WATCH_DEFAULTS`, so since round 5 the `now` policy (`{}`) in `eval/watch-flicker.mjs` and in
this script had silently meant `hold`. In this run's first output `now` equals `hold`. Once persist 2 became the
default, `hold` would likewise have meant `hold+persist2`. Every policy in both scripts now names both options. The
output file is the rerun with the pinned policies. Its `hold` and `hold+persist2` rows and the decision match the
first run's exactly, and its `now` row again matches round 5's (115 TCPD alerts, 68 held out, 141 on the 57 in `data/`).

Old watch-state files have no `seen` list, so after upgrading, a running watch's first newly confirmed change waits
one check more than it would have. Nothing is lost.
