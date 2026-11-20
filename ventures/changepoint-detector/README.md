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
- **Watch several metrics in one run** (2026-11-13): `node watch.mjs kpi.csv --state s.json --columns all` (or
  `--columns orders:poisson,revenue,signups:poisson`, a model per column, and a detector per column since
  2026-11-19: `orders:poisson:bocpd-window`, README "A detector per column"; a cost for clumped counts per column,
  `orders:poisson:bocpd-window:nb`, README "Clumped counts in the watch") watches every column of one CSV, keeps a
  record per column in one state file and sends the day's new changes as one webhook message. README "Several metrics in
  one watch".
- **Watch your Stripe account** (2026-11-16): `STRIPE_API_KEY=rk_live_... node stripe-metrics.mjs --out data/stripe.csv`
  writes payments, revenue and failed payments per complete day from your own account; the self-deploy workflow
  fetches and watches it when the secret `STRIPE_API_KEY` is set. README "Stripe as a source".
- **Watch your Shopify store** (2026-11-19): `SHOPIFY_SHOP=my-store SHOPIFY_ACCESS_TOKEN=shpat_... node shopify-metrics.mjs --out data/shopify.csv`
  writes orders, revenue and cancelled orders per complete day from your own store's Admin GraphQL API; the self-deploy
  workflow fetches and watches it when the secret `SHOPIFY_ACCESS_TOKEN` and variable `SHOPIFY_SHOP` are set. README
  "Shopify as a source".
- **AI agents / MCP:** from a clone of the repository,
  `node platform/agents/tools.mjs call changepoint-detector analyze --input '{"values":[...]}'`
  (the watch replay: `call changepoint-detector replayWatch --module watch-core.mjs --args '[[...]]'`)
  or the `call_tool` tool of the repository's MCP server
  ([`platform/agents/`](../../platform/agents/README.md)).

## Verification

`node --test '*.test.mjs'` (1,027 tests on 2026-11-19, about 5 minutes). What they check:

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
  of squared first differences gives a variance that a step does not spoil; since 2026-11-15 each difference is read against its
  local level, see "Clumpy counts that grow" at the end). 200 counts, rate 10, each count drawn at a
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
A change of **shape** at an unchanged level and spread (one waveform giving way to another) is outside what it models: on
TSSB's 75 such series the agreed changes scored below reporting none, and on long repeating waveforms (heartbeats, gestures) all
six settings can agree on the cycle's own peaks. For that job use a shape method such as ClaSP ("Long series from outside TCPD").

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum
extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

An independent implementation from the published papers; not affiliated with or endorsed by their
authors.

**Privacy.** Nothing is uploaded. Anonymous feature counts (the 13 event names are listed in
the page's privacy note: `analysis_run`, `agreed_run`, `drift_run`, `watch_check`, `report_downloaded`
and the rest) are kept only in local storage, can be switched off on the page,
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
- **Stripe analytics apps (Baremetrics, ChartMogul, ProfitWell and the like):** subscription dashboards, mostly
  paid, holding the merchant's data. `stripe-metrics.mjs` plus the watch sends one message when payments, revenue
  or declines move to a new level, from the merchant's own GitHub account, free (see "Stripe as a source").
- **Shopify's own analytics and alert apps (Shopify's reports, Triple Whale, Lifetimely, Better Reports and the
  like):** dashboards and scheduled reports, the useful ones on paid plans, with the store's data on their servers;
  a person still has to read them to notice a lasting drop. `shopify-metrics.mjs` plus the watch sends one message
  when orders, revenue or cancellations move to a new level and stay there, from the merchant's own GitHub account,
  free (see "Shopify as a source").


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

### Pruning meanvar cuts with a segment-wise GARCH likelihood (2026-11-02; table withdrawn and re-measured 2026-11-13, not shipped)

The joint likelihood named above, in its cheapest form. `eval/meanvar-garch-segments.mjs` (output
`eval/meanvar-garch-segments.out.txt`) takes the plain meanvar PELT cuts as candidates. Every segment gets its own mean
and scale, and inside a segment the standardised residual follows a unit-variance GARCH(1,1) whose a and b are shared by
all segments (small grid). The cut whose removal costs least quasi-log-likelihood is dropped while that cost is under
`pen x ln n` (log-likelihood units).

**The 2026-11-02 table measured nothing.** The script passed `analyze()`'s changepoint objects into the segment
likelihood, which needs indexes, so every total was NaN and the "pruned" columns were whatever the NaN comparisons left
(found 2026-11-13). The table is withdrawn; its conclusions (pen 12 to 16, "barely moves at n = 200") do not stand.
`pruneByGarch` now refuses anything but integer cuts, and `garch-prune.test.mjs` checks it keeps a real break and drops
false cuts.

**Re-measured** (100 series per cell, the original seeds, so in-sample): null series with any change / sd 1 to 2 break
found exactly once / mean +1.5 sd shift found exactly once. Plain meanvar first, then pruned at three penalties.

| n, noise | plain | pen 1 ln n | pen 1.5 ln n | pen 2 ln n |
|---|---|---|---|---|
| 100, Gaussian | 4% / 94% / 95% | 4% / 92% / 95% | 3% / 61% / 95% | 0% / 26% / 100% |
| 100, GARCH | 41% / 63% / 63% | 28% / 61% / 65% | 10% / 45% / 77% | 3% / 26% / 94% |
| 100, t3 | 37% / 58% / 48% | 36% / 57% / 48% | 33% / 57% / 48% | 20% / 56% / 65% |
| 200, Gaussian | 0% / 97% / 96% | 0% / 97% / 96% | 0% / 94% / 96% | 0% / 76% / 99% |
| 200, GARCH | 50% / 58% / 52% | 29% / 63% / 68% | 9% / 61% / 89% | 1% / 45% / 97% |
| 200, t3 | 63% / 55% / 34% | 63% / 57% / 34% | 61% / 56% / 35% | 51% / 66% / 55% |

The prune does what it was meant to on clustered volatility: at 1.5 ln n the GARCH false alarms fall to 9% at n = 200
(`--bootstrap`: 16%) and mean shifts are found more often. It does nothing for t3 or AR(1) noise, as expected of a
GARCH model. The cost is the real variance break, which a shared GARCH partly explains away: at 3 ln n it is found 4% to
11% of the time, the filter's failure again.

**Pre-registered on fresh seeds (2026-11-13; `eval/meanvar-garch-segments-prereg-2026-11-13.md`).** Hypothesis: grid
points with a + b above 0.9 are what absorb a lasting step, so a grid capped at 0.9 keeps it. Fixed beforehand: pen 1.5 ln
n, cap 0.9, 200 series per cell, every seed moved by 1,000,003. Bar: GARCH null false alarms at n = 200 at most 10%; sd
break on GARCH noise at n = 200 at least 74% (`--bootstrap`); Gaussian null at most 2%, sd break at least 90% (n = 200)
and 80% (n = 100); mean shift at least the plain rate.

| n, noise | plain | pruned, cap 0.9 (pre-registered) | pruned, no cap (diagnostic, after) |
|---|---|---|---|
| 100, Gaussian | 1% / 92% / 95% | 1% / **74%** / 96% | 1% / 68% / 96% |
| 100, GARCH | 36% / 67% / 71% | 14% / 39% / 85% | 14% / 39% / 85% |
| 200, Gaussian | 3% / 98% / 98% | 2% / 96% / 99% | 2% / 93% / 99% |
| 200, GARCH | 49% / 51% / 49% | 10% / **55%** / 82% | 9% / 54% / 83% |

**It fails** on two of the four lines: the sd break on GARCH noise (55% against 74%) and Gaussian at n = 100 (74%
against 80%). False alarms (10%) and mean shifts pass. The hypothesis is mostly wrong too: without the cap the GARCH-noise
break is found 54% of the time, so high persistence is not what absorbs it. On GARCH noise at n = 100 the plain fit finds
the break alone 67% of the time and the prune keeps it 39%, so the prune is removing the true break, not failing to add
one. Not shipped; `--bootstrap` stays the option for clustered volatility. The open route is unchanged: candidates
searched jointly with the GARCH fit, or a penalty for the prune read off a block bootstrap as `--bootstrap` does for
plain meanvar. Simulated noise only.

### Cuts searched jointly with a GARCH likelihood: `--garch` (2026-11-13, pre-registered; ships)

The prune above only ever removes meanvar's cuts, and it removed the true variance break. The route it left open was to
search the cuts with the GARCH fit. `garchCuts` in `engine.mjs` (`analyze({ model: 'meanvar', garch: true })`, CLI
`--model meanvar --garch`, page box "Volatility comes in clusters") uses the same segment likelihood (own mean and scale per
segment, a unit-variance GARCH(1,1) inside, a and b shared and read off the 18-point grid, a + b under 0.98). A greedy
forward search adds, at each step, the cut at any position that raises the best-over-grid quasi-log-likelihood most. It
runs twice, once with independent noise (a = b = 0) and once on the grid, and keeps the cut set with the highest
LL - 1.5 ln n per cut - 0.25 ln n if GARCH. Without that second term the search let a GARCH path absorb a plain variance
step on Gaussian noise (61% found at n = 100, against 94% plain).

**Tuned in sample** (the prune's seeds, 100 per cell, `eval/meanvar-garch-choose-tuning.out.txt`): the per-cut penalty and
the GARCH penalty (0.25, 0.5 or 1 ln n). The first same-seed comparison with `--bootstrap`
(`eval/meanvar-garch-compare.out.txt`) showed why: earlier tables had put `--bootstrap` on other seeds.

**Pre-registered on fresh seeds** (`eval/meanvar-garch-choose-prereg-2026-11-13.md`, committed before the run; every seed
moved by 2,000,003, 200 series per cell, `--bootstrap` on the same series; `eval/meanvar-garch-choose-prereg.out.txt`).
Null series with any change / sd 1 to 2 break found exactly once / mean +1.5 sd found exactly once:

| n, noise | `--bootstrap` | `--garch` |
|---|---|---|
| 100, Gaussian | 3% / 76% / 98% | 3% / 77% / 99% |
| 100, GARCH | 12% / 53% / 85% | 11% / 51% / 87% |
| 100, t3 | 9% / 43% / 83% | 44% / 68% / 56% |
| 200, Gaussian | 1% / 99% / 97% | 1% / 95% / 97% |
| 200, GARCH | 19% / 69% / 69% | **7%** / 65% / **90%** |
| 200, t3 | 13% / 61% / 83% | 49% / 50% / 49% |

**It passes** every line of the bar: GARCH false alarms at n = 200 are 7% (at most 10% and half of 19%); mean shifts on
GARCH noise 87% and 90% (bootstrap 85%, 69%); the variance break on GARCH noise 51% and 65% (at least 48% and 57%);
Gaussian false alarms 3% and 1%, the variance break 77% and 95% (at least 75% and 95%, the second exactly at the bar), mean
shifts 99% and 97%. So on clustered volatility it trades about 4 points of power on a lasting variance step for a third of
`--bootstrap`'s false alarms and 21 more points on mean shifts. It is bad on heavy tails without clustering (t3: 44% to 49%
false alarms), as a GARCH model is expected to be, so `--bootstrap` stays the option there and the note says so. The
pre-registration said "24-point grid"; the code it ran excluded a + b of 0.98 or more, which leaves 18 (the test checks it).
The run scored at most two cuts; the shipped default allows 40 and gives the same table
(`eval/meanvar-garch-shipped.out.txt`). Simulated noise only.

**What it does on real returns** (descriptions, not evidence; `garch-search.test.mjs`). DAX 1991-1998 (1,859 days): cuts at
rows 28, 39 and 1482 with a = 0.1, b = 0.85, the same three dates `--bootstrap` and `--dispersion` find give or take 4 rows.
SMI: 29, 39, 1489. CAC: 1171 and 1502. FTSE: none. The Dow, 1980-2012 (8,609 days, 2.5 s): **no cut at all**: the shared
GARCH explains both October 1987 and the 2008 crisis as volatility clustering, where `--bootstrap` cuts 11 times including
both. That is what the model says, not a bug: it asks whether anything changed beyond what clustering explains, and a
crash followed by slow calm is what GARCH describes. For bursts as changes, use `--bootstrap`; the output says this.

Costs and limits. Each step rescans every segment, so above 250 points the search scans every `ceil(n / 250)` points and
then every point within that stride of the best (`garch-search.test.mjs` checks it lands on the same cut as the full scan
on a clear step); 20,000 points at most. Since 2026-11-13 (later) the 95% ranges come from the GARCH fit when it reads the
noise as clustered (next section); before that they came from the independent-noise cost and held the date on a volatility
step only 75-77% of the time. Not with `--robust`, `--dispersion`, `--bootstrap`, `--ar1`, `--trend` or `--period`.

### A range from the GARCH fit (2026-11-13, pre-registered; ships)

The output used to warn that `--garch` ranges were "too narrow", because they came from the independent-noise meanvar cost,
not the model that chose the cuts. That was never measured. `garchCost` in `engine.mjs` is the GARCH segment likelihood
at the fitted shared (a, b) used as a `changeIntervals` cost: the same profile-likelihood range as every other model
(positions between the neighbouring cuts weighted by exp(-cost / 2), the smallest set holding 95%). It is used only when
the search reads the noise as clustered; otherwise the GARCH and meanvar costs are the same model. There is no free
parameter, so nothing was tuned.

**Pre-registered** (`eval/meanvar-garch-range-prereg-2026-11-13.md`, committed before the run; `node
eval/meanvar-garch-range.mjs 400 4000003 200,400`, output `eval/meanvar-garch-range-prereg.out.txt`). GARCH(1,1) noise, one
change at n / 2, 400 series per cell, scored among series where `--garch` reads the noise as clustered and finds exactly one
cut within 15 points. Planted index held by the range (median width in points):

| n, change | kept | independent-noise range | GARCH range |
|---|---|---|---|
| 200, sd 1 to 2 | 142 | 77% (14) | **93%** (26) |
| 200, mean +1.5 | 294 | 94% (6) | **97%** (6) |
| 400, sd 1 to 2 | 248 | 75% (15) | **98%** (37) |
| 400, mean +1.5 | 374 | 92% (6) | **96%** (6) |

**It passes** (at least 90% in every cell and at least the old range's coverage). The old warning was right about
volatility steps: the independent-noise range missed the date a quarter of the time, because clustering makes a stretch
of high volatility look like the new regime arriving early or late. Mean shifts were already close to 95% and keep their
6-point width. So `--garch` ranges now come from the GARCH fit and the warning is gone. Conditioned on a kept cut near the
truth, as every coverage table in this README is; simulated noise only.

On the real returns (descriptions, not evidence): the DAX's early cuts keep 3-point ranges (rows 25-27, 37-39), but its late
volatility rise at row 1480 widens from rows 1469-1495 to **273-1576**: under the GARCH fit the data say volatility was
higher at the end, not when it rose. The SMI's matching cut narrows (1450-1567 to 1442-1500); the CAC's widen a little
(1155-1226 to 1130-1232, 1395-1500 to 1390-1500). Test: `garch-search.test.mjs`.

### Heavy tails in the GARCH search: Student t innovations (2026-11-13, pre-registered; fails one line, not shipped)

`--garch` raised a false change on 44-49% of t3 series: a Gaussian segment likelihood reads one heavy-tailed move as a
change of volatility. `garchCuts(x, { tPen })` adds two paths to the model choice: independent Student t noise and t-GARCH
(Bollerslev 1987), the standardised residual a unit-variance t with nu from {4, 8} shared across segments. Each segment's
mean and scale come from four EM passes (weights (nu + 1) / (nu - 2 + z^2)); `garch-t.test.mjs` checks the EM against a
brute-force grid over mean and scale and the t likelihood against the Gaussian at large nu. A t path pays tPen on top of
the per-cut and GARCH-term penalties. Tuned in sample (shift 0, 100 per cell, `eval/meanvar-tgarch-tuning.out.txt`):
tPen in {0.25, 0.5, 1} ln n; 0.5 taken. Known bias, stated in the pre-registration: the shipped Gaussian GARCH path is
slightly under-converged (two scale passes, unweighted mean), so a t path at very large nu scores up to ~0.3 higher per
segment against a penalty of 2.3 at n = 100.

**Pre-registered on fresh seeds** (`eval/meanvar-tgarch-prereg-2026-11-13.md`; `node eval/meanvar-tgarch.mjs 200 3000003
off,0.5`, run split across four processes, output `eval/meanvar-tgarch-prereg.out.txt`). Null any change / sd 1 to 2 found
exactly once / mean +1.5 found exactly once; t-GARCH noise is GARCH with t5 innovations:

| n, noise | shipped `--garch` | with t paths |
|---|---|---|
| 100, Gaussian | 2% / 80% / 96% | 2% / 78% / 97% |
| 100, GARCH | 13% / 53% / 82% | 13% / 53% / 82% |
| 100, t3 | 38% / 67% / 65% | **4%** / **58%** / **96%** |
| 100, t-GARCH | 37% / 58% / 60% | 20% / 51% / 73% |
| 200, Gaussian | 1% / 96% / 100% | 1% / 95% / 100% |
| 200, GARCH | 9% / 64% / 89% | 9% / 64% / 89% |
| 200, t3 | 54% / 57% / 42% | **3%** / **90%** / **98%** |
| 200, t-GARCH | 38% / 62% / 49% | 12% / 54% / 77% |

**It fails one line of the bar**: the t3 variance break at n = 100 is found exactly once in 58% of series, under the bar of
the shipped search's 67% minus 5. Every other line passes: t3 false alarms 4% and 3% (bar at most 10%, from 38% and 54%),
t3 mean shifts 96% and 98%, t-GARCH false alarms 12% at n = 200 and 20% (below 37%) at n = 100, Gaussian and GARCH cells
within a point or two. The pre-registration said nothing ships on a failure, so `analyze` does not use it and `--garch`'s
note still says to use `--bootstrap` on heavy tails. Reading it plainly: the shipped search's 67% comes with a 38% false
alarm rate on the same noise, so its "found" is less trustworthy than the t search's 58%; but that argument was available
before the run and the bar did not make it. Next: a pre-registration that scores the variance break jointly with false
alarms (for instance found-exactly-once minus null false alarms), or nu read off a finer grid, on new seeds. On the real
returns the t paths take nu = 8 (DAX cuts 37 and 1437; the Dow still none) at 4x to 10x the run time (15 s on 8,609 points).

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

Still wanted: the 1976 acceleration found by a bend model on a series long enough to place it (a longer or less smooth record). **Answered 2026-11-13 by a test on the levels, not the differences:** see "The 1976 acceleration, dated and tested on the levels" below (knot 1976, p 0.001 on GCAG and GISTEMP).

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
- **AR(1) plus floor 2 on every column scored best here (0.564), above the consensus.** It was listed in advance but is not the primary, so that is a lead, not a finding: three series is a panel, and in simulation it gives up most of the power on smooth columns. It ships as a page and CLI option ("Autocorrelation and a floor on every column (fewest cuts)", `--joint-floor 2 --joint-ar1`), to be tested on fresh multi-column data before it is anything more. **Tested 2026-11-16 on five fresh bee dance sequences and failed** (see "The AR(1)-plus-floor lead on fresh labelled data" below).
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

### One-tick stale feeds: a likelihood (2026-11-15, pre-registered round three; negative, not offered)

The catch-up ratio reads only the moves that end a run of repeats, and 300 steps hold too few of them.
`rounded-walk.mjs` uses every step. Two models for the stickier stretch, in ticks: **M0**, a hidden
Gaussian random walk (step sd s) recorded rounded; **M1**, the same walk, but with probability p each step
repeats the last recorded value whatever the hidden value did. A forward filter over the hidden value on a
grid (10 cells a tick; 20 and 40 move LR by under 0.02) gives each likelihood exactly up to the grid,
maximised over s and p. Under M0 the statistic LR = 2 (l1 - l0) is a 50:50 mix of 0 and chi-square(1),
since p = 0 is a boundary, so the threshold was set from theory at its 1% point, **5.41**, not tuned.

Pre-registered in `eval/update-rate-stale-lr.mjs` (committed in 259872106 before the confirmation ran):
the same cells and rule K1-K3 as rounds one and two, fresh seed 20261215, plus a K4 that would only have
changed the wording: two rounded slow series that are not Gaussian walks (X1, Student t steps with 3
degrees of freedom; X2, mean-reverting, rho 0.95).

| seed 20261215, change nearest step 150 | called stale among one-tick series | rule |
|---|---|---|
| R1 / R2 / R3, rounded walks | 7.0% / **11.5%** / 9.0% | <= 5% each: **fails** |
| T1 / T2 / T3, one-tick stale feeds | 100% / 100% / 98.3% | >= 80% each: pass (rounds one, two: 80-96%) |
| F1-F3, rounding <= 5% | 0 / 0 / 0 | pass |
| X1 heavy-tailed walk / X2 mean-reverting | **61.5%** / 9.5% | <= 10% each (wording only): fails on X1 |

**Verdict: not offered.** `method: 'lr'` stays an opt-in (`updateRateChanges(values, { catchUp: { method:
'lr', test: staleTest } })`, with `staleTest` from `rounded-walk.mjs`, returns `staleLR` and `staleP`); `CATCHUP` and every sentence are as before.

**Why the rounded walks failed** (`eval/update-rate-stale-lr-why.mjs`, `.out.txt`; post hoc, fresh seed 5,
80 series a cell, descriptive). On the true slow half the test is calibrated: 1, 0 and 1 of 80 rounded
walks called stale (the 1% design rate). On the stretch the update-rate partition hands it, 11, 3 and 11.
The partition's cut lands a few steps late, so the "sticky" stretch ends with fast, 10-tick moves; a
Gaussian walk with one s cannot have both, and M1 explains the big moves as catch-ups. Trimming 15 steps
on the side of the cut removes them (1, 0, 0 of 80). That points at a round four: test the stretch inside
the cut's range, not up to the cut, on new seeds.

**Why that would not be enough:** X1. A slow series whose hidden steps are heavy-tailed (most steps tiny,
a few large) is called stale 61.5% of the time on its own true slow half (49 of 80 post hoc): to M0 its rare
big jumps after quiet runs look exactly like catch-ups. A real slow price or index often moves that way.
So a likelihood that assumes Gaussian steps cannot tell "stale" from "jumpy" on real data; a round four
needs a heavy-tailed M0 (a t or a mixture of two step sizes) as well as the trimmed stretch.

On the juice file (descriptive): `ppi`, the rounded index, has LR 1.26 (p 0.05): rounding, as the
catch-up ratio also said. `price` is not one-tick, so the test does not run on it. Test: `rounded-walk.test.mjs`.

### One-tick stale feeds: a heavy-tailed walk (2026-11-15, pre-registered round four; ships)

Round three's post hoc named two causes of its false calls, and this round changes exactly those two:

1. **The stretch.** The update-rate partition's cut lands a few steps late, so the "sticky" stretch ends
   with the fast regime's moves. Now the likelihood sees the stretch only inside its cuts' date ranges
   (`cutRanges`, the shipped slack 6): it starts after the latest date its left cut could have and ends
   before the earliest its right cut could have (`trim: 'range'` in `update-rate.mjs`). Not the post
   hoc's 15 steps, a number seen on the data.
2. **The walk.** Both models now have Student t steps (`rounded-walk.mjs` `staleTestHeavy`), with the
   degrees of freedom profiled over {2, 4, 10, Infinity}; Infinity is round three's Gaussian, so the old
   M0 is inside the new one. M0 can now explain a rare big jump by a heavy tail; M1 has to win on
   catch-ups whose size grows with the run of repeats before them. The grid was written down before any
   run and does not contain X1's own 3. The threshold stays 5.41 (theory; the degrees of freedom are a
   nuisance shared by both models).

Pre-registered in `eval/update-rate-stale-lr-4.mjs` (committed in 3b049bf88 before the confirmation ran,
with a 20-series smoke run on seed 6 in its commit message, used to choose nothing). Same cells and K1-K3
as rounds one to three, round three's X1 and X2, and **K4 now binding**: a check that calls a jumpy slow
series stale would mislead on real prices. One new cell reported, not judged: X3, X1's heavy-tailed walk
carried forward 60% of steps. Fresh seed 20261216, 200 series a cell, run once (551 s on four threads):

| seed 20261216, change nearest step 150 | called stale among one-tick series | rule |
|---|---|---|
| R1 / R2 / R3, rounded walks | 0.0% / 0.0% / 0.0% | <= 5% each: pass (round three 7.0-11.5%) |
| T1 / T2 / T3, one-tick stale feeds | 98.0% / 96.9% / 81.3% | >= 80% each: pass |
| F1-F3, rounding <= 5% | 0 / 0 / 0 | pass |
| X1 heavy-tailed walk / X2 mean-reverting | 3.0% / 0.5% | <= 10% each: pass (round three 61.5% / 9.5%) |
| X3 heavy-tailed walk carried forward (not judged) | 81.9% | power on a jumpy stale feed |

**Verdict: ships.** `CATCHUP` is now `{ method: 'lr', test: staleTestHeavy, trim: 'range', lr: 5.41 }`:
a one-tick sticky stretch where the likelihood ratio clears 5.41 is flagged `catchUp` instead of
`rounding`, and the update-rate line says so ("the moves that end runs of repeats grow with the run, as a
stale figure catching up would (a rounded walk carried forward on about N% of steps fits it better than
the same walk only rounded, even allowing heavy-tailed jumps (likelihood ratio X, against 5.4 at the 1%
level))"). Passing any `catchUp` option replaces the default whole over the ratio-only base, so rounds one
to three still reproduce their files; `catchUp: { method: null }` is the median-move test alone.

What it costs: T3, the clumped stale feed, is the weak cell (81.3%, just over the bar): long clumps look
like a slow walk to both models. The heavy test takes about 0.5 s on a 150-step stretch (four model
fits per side), and runs only on stretches that already pass the one-tick test. On the juice file,
`ppi` (the rounded index) now has LR 0.0 (round three's Gaussian test gave 1.26): rounding, as before.

Still open: a real series with documented carry-forward to check a call against (all the evidence here
is simulated); clumped carry-forward (T3) is the cell to improve. Tests: `rounded-walk-heavy.test.mjs`,
`rounded-walk.test.mjs`, `update-rate-catchup.test.mjs`.

### One-tick stale feeds: clumped carry-forward (2026-11-15, pre-registered round five; ships)

Round four's weak cell was T3, the clumped stale feed (once it repeats, it repeats again with
probability 0.7; after a fresh value, 0.2): 81.3%, just over the 80% bar. Its M1 carries each step forward
with one probability, so it expects runs of repeats to be short and geometric; a feed that sits for
several steps at a time looks to it more like a slow walk. Round five changes only M1. It is now a
**Markov carry-forward**: one chance to start repeating after a fresh record (`pEnter`), another to keep
repeating after a carried one (`pStay`). Whether the last record was carried is hidden too, since a
repeat may be rounding, so the forward filter runs over the hidden value and that flag
(`roundedWalkLogLikMarkov` in `rounded-walk.mjs`). With `pStay = pEnter` it is round four's M1 exactly (a
test checks the likelihoods agree to 1e-9). It is fitted from round four's M1, for each degree of freedom
in round four's grid, so its statistic is never below round four's. Steps, grid, trim and the one-tick
test are all round four's.

**The threshold had to come from simulation.** Under M0 (`pEnter = 0`), `pStay` is not identified, so the
chi-square boundary mix behind 5.41 no longer holds. The rule, committed with the code before anything
ran (`eval/update-rate-stale-lr-5.mjs`, commit 4cd7a9b45, with a 10-series smoke run in its message),
set tau on the null cells only (R1-R3, X1, X2) of a new calibration seed, 31. Tau is the smallest value at
which no null cell has more than 2% of its one-tick series at or above it, and never below 5.41. No stale
cell was run on that seed. X1, the heavy-tailed walk, was the binding cell, and **tau = 6.56**
(`eval/update-rate-stale-lr-5-calibration.out.txt`; the first calibration run crashed in its table printer
after the fits and was rerun unchanged on the same seed). Then one confirmation on fresh seed 20261217
with round four's K1-K4, plus a K5: T3 at 85% or more, and at least 5 points above round four's rule on the
same series. Round four's statistic comes out of the same fit, so the comparison uses identical stretches.
200 series a cell, 1,619 s on four threads:

| seed 20261217, change nearest step 150 | called stale, Markov (LR >= 6.56) | round four (LR >= 5.41), same series | rule |
|---|---|---|---|
| R1 / R2 / R3, rounded walks | 1.0% / 0.0% / 0.0% | 0.5% / 0 / 0 | <= 5% each: pass |
| T1 / T2 / T3, one-tick stale feeds | 98.6% / 100% / **96.8%** (60 of 62) | 97.8% / 100% / 80.6% (50 of 62) | >= 80% each: pass; T3 >= 85% and +5 points: pass |
| F1-F3, rounding <= 5% | 0 / 0 / 0 | 0 / 0 / 0 | pass |
| X1 heavy-tailed walk / X2 mean-reverting | 1.5% / 0.0% | 2.0% / 0.0% | <= 10% each: pass |
| X3 heavy-tailed walk carried forward (not judged) | 81.5% | 83.5% | reported |

**Verdict: ships.** `CATCHUP` is now `{ method: 'lr', test: staleTestMarkov, trim: 'range', lr: 6.56 }`.
The update-rate line names the clumping it found ("carried forward in runs (after a fresh value the next
repeats about A% of the time, after a repeat about B%)") and the threshold with what it means ("against
6.6, which about 2% of rounded slow series clear in simulation"). Each change also carries `staleLRIid`
(round four's statistic), `staleEnter` and `staleStay`. Rounds one to four still reproduce when their
options are passed.

What it costs: X3, a heavy-tailed stale feed with no clumping, falls 2 points (167 to 163 of 200), because
the threshold is higher. The test takes about three times as long as round four's (four extra fits a
degree of freedom; 2.7 s against 0.9 s a series on these cells). It still runs only on stretches that
pass the one-tick test. On the juice file, `ppi` stays rounding. On the rounding check's own seed (20261212, `eval/update-rate-rounding.mjs`), 2 of
200 R1 walks now read as catch-ups (198 rounding, Q1 still passes); that file predates the catch-up, so its
test now reproduces it with the catch-up off.

Still open: a real series with documented carry-forward to check a call against (all the evidence here
is simulated), and a faster fit (the Markov ascent could skip the degrees of freedom that round four's
M1 already places far behind). Tests: `rounded-walk-markov.test.mjs`, `rounded-walk-heavy.test.mjs`,
`rounded-walk.test.mjs`.

## Stripe as a source (2026-11-16)

Most people who want to hear "sales moved to a new level" sell through Stripe, and asking them to export a CSV every
day is where a watch dies. `stripe-metrics.mjs` turns the deployer's own Stripe account into the daily CSV the watch
reads, with a read-only restricted key (Charges; Customers too for `--customers`) from an environment variable:

- one row per **complete** day in the deployer's `--utc-offset` (today is left out, so a half day never reads as a
  fall), zeros on days with nothing, so a count series has no holes;
- `payments`: succeeded charges in any currency; `revenue`: their gross amount in one currency, major units, summed
  in minor units so it stays exact (zero- and three-decimal currencies from Stripe's currency list); `failed`:
  charges with status `failed`; `new_customers` with `--customers`. Pending charges count once they settle; refunds
  are not subtracted (a refund belongs to the day it was made, which a charge list does not date);
- an existing CSV is extended: its last `--refetch` days (default 3) are fetched again for late settles, the rest
  kept, and the currency summed is remembered beside it (`<file>.currency`) so a column never mixes two;
- list pages followed with `starting_after`, 429 and 5xx retried with backoff (1, 2, 4, 8, 16 s), a 401 or 403
  answered with what to fix; a publishable key is refused before any call. `STRIPE_API_BASE` (tests only) takes a
  loopback address and nothing else, so the key cannot be pointed at another host.

`deploy/watch-metric.yml` runs it before the watch when the secret `STRIPE_API_KEY` is set (options in the variable
`STRIPE_OPTIONS`), caches `data/stripe.csv` with `actions/cache` so a run fetches days, not 400 days, and with
`METRIC_CSV` unset watches `--columns payments:poisson,revenue,failed:poisson`. `make-watch-repo.sh` copies the
script and writes a `.gitignore` for the CSV. The repository should be private: `watch-state.json` records the
level around each change, which for revenue is the business's revenue.

**Checked** (`stripe-metrics.test.mjs`, 10 tests, one the CSV formula guard): against a stand-in for Stripe's list API with its documented
shape (`{object: 'list', data, has_more}`, newest first, `created[gte]`, `created[lt]`, `starting_after`, `limit`
capped at 100): every charge read once across pages; retries and error messages; day boundaries at an offset;
complete days only; the incremental refetch window; the currency guard; then the made repository's workflow run
under `deploy/run-workflow.mjs` against the stand-in served over HTTP (fetch step writes 400 days, state holds the
three columns, the CSV is not committed, the key never printed). **Not checked against a live Stripe account**: no
session holds a key. A deployer's first run is that check; the field names used (`id`, `created`, `amount`,
`currency`, `status`) are the stable core of the Charge object.

**How the default watch behaves on it** (`eval/stripe-declines.mjs`, output `eval/stripe-declines.out.txt`;
synthetic shops, 40 Poisson payments a day of $10-50, declines 2% of attempts, watched daily over the last 30 of
120 days, 20 seeds per row; measured once, no setting tuned on it):

| case | decline jump heard | days after the jump | payments/revenue alerts at the jump | other alert lines / 620 checks |
|---|---|---|---|---|
| declines 2% to 25%, 12 days before the end | 20 of 20 | 5 (all) | 12 | 0 |
| declines 2% to 10% | 16 of 20 | median 5, 4-7 | 0 | 0 |
| no change | - | - | - | 0 |

The 12 payments/revenue alerts in the first row are true: a quarter of attempts declined takes about a quarter off
succeeded payments. The quiet is optimistic: these shops have no weekly cycle, promotions or growth, all of which a
real shop has and which the watch's own history replay (`--suggest`) is there to measure. Next: a real shop's
daily Stripe series (a deployer's, or a public one) through `--suggest`, and a weekly cycle (`--period 7`) per column.

## Shopify as a source (2026-11-19)

Stripe covers merchants who take payments directly; most small online shops sell through Shopify, where the payment
processor is Shopify Payments and a Stripe key does not exist. `shopify-metrics.mjs` turns the deployer's own store
into the daily CSV the watch reads, with the Admin API access token of a **custom app** the merchant makes in their
own admin (Settings > Apps and sales channels > Develop apps; scope `read_orders`, `read_all_orders` for more than 60
days of history, `read_customers` for `--customers`), from an environment variable:

- one row per **complete** day in the store's own time zone (`Shop.ianaTimezone`, read first; any token may read
  it), zeros on quiet days, today left out, as for Stripe. Since 2026-11-20 (below) the days follow daylight saving;
  `--time-zone <name>` or `--utc-offset <hours>` overrides;
- `orders`: orders placed that day, not cancelled, not test orders (`--include-test` counts them); `revenue`: their
  `totalPriceSet.shopMoney` (the total after discounts, with tax and shipping, always in the store's own currency, so
  one column never mixes two unless the store changed currency, which is printed), summed exactly in thousandths of
  the decimal strings Shopify returns; `cancelled`: orders placed that day and cancelled since; `new_customers` with
  `--customers`. Refunds are not subtracted;
- the Admin GraphQL API (`orders` and `customers` connections, `query: "created_at:>='...' AND created_at:<'...'"`,
  250 a page, `pageInfo.endCursor`), version pinned at 2025-01; the REST Admin API is legacy since 2024-10 and was
  not used;
- an existing CSV is extended: its last `--refetch` days (default 3) are fetched again (late cancellations);
- HTTP 429/5xx and GraphQL `THROTTLED` errors (Shopify's cost-based limit answers 200 with that code) retried with
  backoff; 401, 403, 404 and `ACCESS_DENIED` answered with what to fix (the token, the scope, the store name). A
  shared secret (`shpss_`) is refused before any call;
- the token goes only to `https://<name>.myshopify.com`: `SHOPIFY_SHOP` must read as a myshopify.com name (a custom
  domain or anything with another host is refused), and `SHOPIFY_API_BASE` (tests only) takes a loopback address;
- Shopify silently returns only the last 60 days of orders without `read_all_orders`. A first fetch that asked for
  more and got nothing older says so, so a short history is not mistaken for a new store.

`deploy/watch-metric.yml` runs it before the watch when the secret `SHOPIFY_ACCESS_TOKEN` is set (store in the
variable `SHOPIFY_SHOP`, options in `SHOPIFY_OPTIONS`), caches `data/shopify.csv` beside the Stripe file, and with
`METRIC_CSV` unset and no Stripe file watches `--columns orders:poisson,revenue,cancelled:poisson`.
`make-watch-repo.sh` and the no-terminal zip on the watch page copy the script and ignore the CSV. As for Stripe, the
repository should be private.

**Checked** (`shopify-metrics.test.mjs`, 9 tests at the time; 10 since the time-zone test below): against a stand-in for the Admin GraphQL API with its documented
shape (POST with `X-Shopify-Access-Token`, connections with `pageInfo` and `nodes`, the `created_at` search syntax,
`THROTTLED` with HTTP 200, string errors on 401): every order read once across 10+ pages with a throttle and a 502 in
between; exact sums (0.1 + 0.2 writes 0.30; yen whole); day boundaries at an offset; cancelled and test orders kept out
of `orders`; the incremental refetch window; the 60-day note; the host guard; then the made repository's workflow run
under `deploy/run-workflow.mjs` against the stand-in over HTTP (fetch step writes 400 days, state holds the three
columns, the CSV is not committed, the token never printed). **Not checked against a live store**: no session holds
a token. A deployer's first run is that check; the fields used (`id`, `createdAt`, `cancelledAt`, `test`,
`totalPriceSet.shopMoney`) are core Order fields of the 2025-01 schema.

### Days in the store's own time zone (2026-11-20)

The quality audit of 2026-11-19 found the source bucketed days at a fixed `--utc-offset`, and the watch page told
deployers to set `-5` for New York. That is right in winter only: from March to November every order placed between
23:00 and midnight New York time landed on the next day's row, and the day the clocks change shifted the boundary by
an hour. Whatever share of a shop's orders arrives in that last hour moved to the wrong day (not measured here: no
session holds a store's order timestamps), and the series then disagreed with the merchant's own Shopify reports.

Now `shopify-metrics.mjs` asks the store for its own zone (`query Zone { shop { ianaTimezone } }`) and buckets days
in it, the zone Shopify's own Analytics uses, so the CSV's days match the merchant's dashboard. `--time-zone
America/New_York` (any IANA name, checked by `Intl`) or `--utc-offset` overrides; an answer without a zone falls back
to UTC and says so. `stripe-metrics.mjs` takes the same `--time-zone` (Stripe's account zone is not read: a restricted
key may lack the permission). The day maths lives in `stripe-metrics.mjs` (`dayOf`, `dayStart`, `checkZone`): a
day's start is the first second whose local date is that day, found by bisection inside UTC-15h..UTC+13h, so a zone
that skips midnight (Santiago's spring change) starts the day at 01:00.

**Checked** (`stripe-metrics.test.mjs`, `shopify-metrics.test.mjs`): New York's day starts at 05:00 UTC on
2026-03-08 and 04:00 UTC on 03-09, 04:00 on 11-01 and 05:00 on 11-02; a 00:30 EDT order on 1 July is the 1st by
name and the 30th under the old `-5`; Santiago's 2026-09-06 starts at 04:00 UTC; Kolkata and Kiritimati; every day
of 2026 in New York, London and Sydney maps its start back to itself and the second before to the day before. The
stand-in answers the zone query; with `America/New_York` the orders search runs from 04:00 UTC, a given
`--utc-offset` sends no zone query, and a missing zone writes UTC days with a warning. **Not checked against a live
store**, as above.

**Changing zone on an existing CSV.** Rows already written keep their old days; the first run after the change
fetches from the day after the last kept row at the new zone's midnight, so for a store west of UTC the hours
between UTC midnight and local midnight of that one day are not counted (a single low day at the junction), and
for one east of UTC they are counted twice (a single high one). Delete the CSV (the workflow cache) to refetch everything in the new zone.

## Counts and the windowed detector (2026-11-19, pre-registered; the rule fails, the default stays)

The Shopify end-to-end test watched 30 orders a day that halved 12 days before the end. The `--model poisson`
default, `bocpd`, sent no orders alert in 2 of 8 scratch shops, while revenue (level model, `bocpd-ar1-window`) was
heard in 8 of 8: on one of them the Bayesian pass puts 49% on a change within 3 points of PELT's date, spread over
neighbouring days, and `bocpd` alerts on single points. The level model fixed this on 2026-11-12 by summing over 5
neighbours ("Round 4"), but counts kept `bocpd`, and `bocpd-window` had never been tested on them.

The rule was committed before the run (`eval/poisson-window.prereg.md`): switch only if mean false alerts over four
nulls are at or below `bocpd`'s and at least one more step is found over five step cells. `eval/poisson-window.mjs`,
output `eval/poisson-window.out.txt`: `replayWatch` on 120 daily points, checks from point 90 (31 checks), fresh
seeds 101-120, steps at point 108, found = an alert within 3 points of it.

| detector | N1 Poisson 30 | N2 NB 30, var 60 | N3 weekends 0.6x | N4 Poisson 5 | S1 30 to 15 | S2 30 to 21 | S3 30 to 45 | S4 5 to 2 | S5 NB 30 to 18 |
|---|---|---|---|---|---|---|---|---|---|
| `bocpd` (default) | 0.00 | 3.23 | 1.61 | 0.00 | 19/20 | 10/20 | 14/20 | 3/20 | 14/20 |
| `bocpd-window` | 0.00 | 4.84 | 1.61 | 0.00 | 20/20 | 18/20 | 19/20 | 10/20 | 17/20 |

(False alerts per 1,000 checks on the nulls, then steps found; median delay 4 checks for both, 5 on S4.)
`bocpd-window` found 84 of 100 steps against 60, but its mean false-alert rate was 1.61 against 1.21 per 1,000
checks (one more alert in 620 checks, on the overdispersed null), so part (a) fails and **the default stays
`bocpd`**. The trade is printed, not hidden: a merchant who would rather hear a 30% drop in orders (18 of 20
against 10 of 20 here) can add `--detector bocpd-window` with a count
column (`--column orders --model poisson --detector bocpd-window`), or, in a mixed CSV, name it for that column alone
(next section). Next: a fresh-seed re-test with a rule written for the margin (the nulls' 95% interval at 620 checks
is wide enough that one alert decides it).

## A detector per column (2026-11-19)

The section above ended with "a per-column detector in `--columns` so a count column can take `bocpd-window` beside a
level column's default". Until now `--detector` applied to every column of a `--columns` run, so a Shopify or Stripe
watch could not give orders the windowed pass without moving revenue off its level default
(`bocpd-ar1-window`) as well. Now a column names its own detector after its model, in either order:

```
node watch.mjs data/shopify.csv --state watch-state.json --columns orders:poisson:bocpd-window,revenue,cancelled:poisson
```

- each part after a colon is a model (`mean`, `meanvar`, `poisson`) or a detector (any of `--detector`'s), at most
  one of each; anything else is refused with both lists;
- `--detector X` applies to the columns that name none; a named one keeps its own;
- `--detector auto` picks for the columns that name none and leaves a named one alone (it writes no `choice` for it,
  so naming a detector later takes effect at once);
- the text output starts a named column's block with `Detector: bocpd-window (named for this column).`, and `--json`
  carries `detector` on that column.

The default is unchanged: the switch for counts failed its pre-registered rule above, so this is the opt-in that
section printed, made usable in the mixed CSVs the Stripe and Shopify workflows watch. The made repository's README,
the workflow's comment and the guide page (`watch-a-metric-for-changes.html`) say how, with the trade (84 of 100 test
steps against 60; since the margin round below, with the cost measured at 3.26 more false alerts per 1,000 checks and
the clumping cost that removes most of it).

**Checked** (`watch-column-detector.test.mjs`, 3 tests; `watch.test.mjs`'s `--columns` test updated for the new
message): the parser (both orders, case, a second model or detector refused, a bare `:poisson` refused); a shop
whose orders fall from 30 to 21 a day at day 108 of 120 (cell S2 of `eval/poisson-window.mjs`; seed 5 is the first
of 1-199 where the replay with `bocpd` misses the drop and `bocpd-window` hears it) watched daily from day 90 through
the CLI: `orders:poisson,revenue` sends no orders alert within 3 days of the drop,
`orders:poisson:bocpd-window,revenue` sends one (dated 2026-04-18, day 107, 29.5 to 20.8 a day, sent 6 days later),
revenue's record is the same in both runs, and the orders record equals a one-column watch with
`--detector bocpd-window`; `--detector auto` and `--detector pelt` beside a named column. One seed shows the wiring,
not the rate: the rates are the table above.

## Clumped counts in the watch (2026-11-19, two pre-registered rounds; both fail, `--overdispersion` ships as an opt-in)

"Counts and the windowed detector" above ended on a margin: `bocpd-window` lost its rule by one false alert in 620
checks, too few to tell a real cost from noise. Two rounds followed, each written down and committed before it ran.

**Round 1, the margin** (`eval/poisson-window-margin.prereg.md`, `.mjs`, `.out.txt`; fresh seeds 201-400, 200 per
cell, both detectors on the same series, a stratified paired bootstrap). The rule: `bocpd-window` becomes the count
default only if the upper end of the 95% interval for its extra false alerts, pooled over five nulls, is at most 1.0
per 1,000 checks (one more false alert in about 2.7 years of daily checks), no null cell is worse by more than 2.0,
it hears more steps (the interval's lower end above 0), and no step cell is worse by more than 4 of 200. Two clumpier
cells were added, since real orders bunch (N5 and S6 below, variance 3x the mean).

| cell | `bocpd` | `bocpd-window` |
|---|---|---|
| N1 Poisson 30 | 0.00 | 0.32 |
| N2 NB 30, variance 60 | 2.58 | 6.77 |
| N3 Poisson 30, weekends 0.6x | 0.97 | 1.45 |
| N4 Poisson 5 | 0.16 | 0.16 |
| N5 NB 30, variance 90 | 11.29 | 22.58 |
| steps found of 1,200 | 704 | 988 |

(False alerts per 1,000 checks.) The extra cost is **3.26 per 1,000 checks (95% interval 2.68 to 3.87)**, so F1 and
F2 fail and the default stays. Measured tightly, the old "about one more false alert in 600 days" was too kind: it is
about one in 300, and the table shows where it comes from. On Poisson counts the window costs 0.0 to 0.5 per 1,000; on
clumped counts it costs 4 to 11. The watch scores counts with a Poisson likelihood, which reads a bunch of busy days as
evidence of a change; the window sums that evidence over five neighbours, so it pays more for it. `bocpd` itself sent
11.3 false alerts per 1,000 checks on the clumpiest null.

**Round 2, a cost for clumped counts** (`eval/poisson-window-clumping.prereg.md`, `.mjs`, `.out.txt`; fresh seeds
401-600, the same rule against `bocpd`). The engine already had two corrections its Bayesian pass honours, never tried
in the watch: a negative-binomial size estimated from the window at each check (`nb`; Poisson-like data get no
clumping and the plain cost) and a dispersion phi that tempers the Poisson likelihood (`phi`).

| cell | `bocpd` (default) | C1 `bocpd-window` + `nb` | C2 `bocpd-window` + `phi` | `bocpd-window` | `bocpd` + `nb` |
|---|---|---|---|---|---|
| N1 Poisson 30 | 0.16 | 0.32 | 0.16 | 0.32 | 0.16 |
| N2 NB 30, variance 60 | 3.55 | 0.97 | 2.26 | 7.74 | 0.48 |
| N3 Poisson 30, weekends 0.6x | 0.97 | 0.48 | 0.65 | 3.23 | 0.00 |
| N4 Poisson 5 | 0.00 | 0.16 | 0.00 | 0.16 | 0.00 |
| N5 NB 30, variance 90 | 10.81 | 0.16 | 4.19 | 19.35 | 0.16 |
| S1 30 to 15 | 191 | 199 | 182 | 199 | 191 |
| S2 30 to 21 | 66 | 150 | 109 | 150 | 66 |
| S3 30 to 45 | 146 | 195 | 165 | 194 | 144 |
| S4 5 to 2 | 44 | 123 | 66 | 123 | 44 |
| S5 NB (2x) 30 to 18 | 142 | 150 | 105 | 175 | 92 |
| S6 NB (3x) 30 to 18 | 126 | **103** | 58 | 155 | 52 |
| pooled false per 1,000 | 3.10 | **0.42** | 1.45 | 6.16 | 0.16 |
| steps found of 1,200 | 715 | **920** | 685 | 996 | 589 |

C1 cuts the pooled false alerts by 2.68 per 1,000 (interval 2.06 to 3.32 fewer) and hears 205 more steps (175 to
235), but on the clumpiest step cell it hears 103 of 200 against 126, 23 fewer, past D2's 4. **C1 fails one bar, C2
fails two, and the default stays `bocpd`.** Median delay was 4 or 5 checks in every arm.

**What ships: `--overdispersion nb|nb1|phi` as an opt-in**, on the one-column watch (with `--model poisson`) and per
column in `--columns` after the model and detector:

```
node watch.mjs data/shopify.csv --state watch-state.json --columns orders:poisson:bocpd-window:nb,revenue,cancelled:poisson
```

A global `--overdispersion` applies to the count columns and skips level columns; a level column that names one is
refused, as is `--overdispersion` without `--model poisson` on one column. The text output names the cost on the
column's block (`Detector: bocpd-window, negative-binomial cost (named for this column).`) and `--json` carries
`overdispersion`. The guide page, the made repository's README and the workflow comment give the trade with these
numbers. `nb1` (clumping in proportion to the level) is wired because the engine has it, but this round did not
measure it in the watch.

**Checked** (`watch-clumping.test.mjs`, 4 tests): the parser; the refusals; a clumped null shop (N5's generator,
the first seed where the plain window alerts and the window with `nb` does not) watched daily through the CLI sends
at least one orders alert with `orders:poisson:bocpd-window` and none with `:nb`, revenue untouched; the one-column
`--overdispersion nb` run sends what `replayWatch` does. One seed shows the wiring, the rates are the tables above.

**A real shop, exploratory** (not pre-registered, no labels; `eval/clumping-real-shop.mjs`, `.out.txt`). The UCI
Online Retail orders ("A real shop's daily series" below) on open days have a variance **4 to 6 times their mean** in
most 60-day stretches (11 and 23 in the two that hold the Christmas and Easter closures), clumpier than N5, the
clumpiest simulated cell. Replayed daily from day 90 with `--period 7` (285 checks): `bocpd` sent 4 alerts,
`bocpd-window` 9, `bocpd-window` with `nb` 2 (2011-04-26 down and 2011-05-03 up: the zeros of the spring closures,
shut 22-25 April, 29 April and 2 May, which `--closed` is for). With no labels this does not say which alerts were right; it says that a real shop sits at the clumped end of the tables
above, where the plain window is loudest and the clumping cost matters most.

**Next:** a rule for the 40% drop in very clumped counts that C1 hears less often, so the cost could become the
default; and a deployer's real orders, with the changes the merchant knows about, to score these arms on.

## A real shop's daily series through `--suggest` (2026-11-18, pre-registered; all three bars fail; a weekly-cycle line ships)

The Stripe section above ended on "Next: a real shop's daily series (a deployer's, or a public one) through
`--suggest`, and a weekly cycle (`--period 7`) per column". No deployer's account exists yet, so this uses a public
one: **UCI Online Retail** (Chen, Sain and Guo 2012, CC BY 4.0), every invoice line of a UK online gift shop from
2010-12-01 to 2011-12-09. `eval/real-shop-daily.py` turns its 541,909 lines into `data/online-retail-daily.csv` in
the shape `stripe-metrics.mjs` writes: one row per calendar day, zeros on days with nothing, with `orders`,
`revenue` (GBP), `cancellations` and `new_customers`. The shop never trades on a Saturday. It was also shut for
Christmas (2010-12-24 to 2011-01-03) and on six one-day UK bank holidays.

The bars were written and committed before any watch ran (`eval/real-shop-suggest.prereg.md`). The run was
`eval/real-shop-suggest.mjs`, output in `eval/real-shop-suggest.out.txt`, which lists every alert with its date and the
28-day mean before and after it. The watch starts at day 74 (2011-02-13) and then makes 300 daily checks. Columns use the
Stripe workflow's models (counts Poisson, revenue mean).

| column | Quiet, no period | Quiet, `--period 7` | Eager, no period | Eager, `--period 7` |
|---|---|---|---|---|
| orders | 37 | 4 | 42 | 12 |
| revenue | 0 | 2 | 8 | 12 |
| cancellations | 20 | 14 | 41 | 21 |
| new_customers | 4 | 2 | 19 | 9 |

- **B1 fails** (Quiet at most 2 per 100 checks on every column, no period): orders 12.3, cancellations 6.7.
- **B2 fails** (`--period 7` cuts Quiet's sum by 25% or more and no column rises). The sum fell from 61 to 22
  (-64%), but revenue rose from 0 to 2, and both of those alerts are poor: a March dip, and an April change that was
  only sent in August.
- **B3 fails** (no alert within a day of a one-day bank holiday at the suggested setting). Nine of the sixteen
  column, period and budget cells have one or two, chiefly Easter (2011-04-22/25) and the early May holiday (2011-05-02).

What the alerts show:

- **The weekly cycle is the whole of the orders problem.** Without a period, all 37 of Quiet's order alerts are
  dated on a Sunday or a Monday. Every week the zero Saturday reads as a step down and Monday's orders as a step back
  up. With `--period 7` four remain: the two around the May bank holidays, one in June, and **2011-09-01**, sent
  2011-09-05 (28-day mean 43 to 59 orders a day). That last one is the start of the Christmas build-up, which is the
  change a shop owner would want to hear about.
- **Revenue at Quiet and Middle is deaf to the build-up.** Daily revenue went from about £26k to £39k (September) and
  then £50k (November), and neither setting alerted with or without a period. Only Eager (PELT) heard it, on
  2011-09-19 and 2011-11-07, at 2.7 to 4.0 alerts per 100 checks. Revenue here has heavy tails (single wholesale
  orders), and the AR(1) default reads the slow climb as sticky noise. This is unfixed and written down as the next
  item.
- **One-day closures still alert, even with the cycle removed.** A closed weekday is a single-point outlier that the
  count model cannot absorb. A deployer whose shop closes on holidays should expect an alert around each one.

**What ships: a weekly-cycle line in `--suggest`** (watch-core.mjs `weekdayBunching`, `weekdayEffect`; also on the
page, which prints the same `eagernessText`). It applies when the labels are consecutive calendar days and no period
is given. If a setting's replayed alerts fall on one pair of adjacent weekdays far more often than chance, the replay
adds: "Weekly cycle: 37 of these 37 alerts are dated on a Sunday or Monday ... Replay with --period 7."
The test has two parts:

1. The alert dates: the most-hit adjacent weekday pair against Binomial(n, 2/7), Bonferroni over the 7 pairs, p < 0.01,
   with at least 6 alerts.
2. The history itself: a weekday effect at p < 0.001. Each day less its centred 7-day mean, ranked, then
   Kruskal-Wallis across the weekdays (chi-square with 6 df).

The alert test alone was not enough. On synthetic series with no weekly cycle, a busy watch spaces its alerts about a
week apart (confirm 5, tolerance 5), so half of them landed on one weekday pair by chance and the alert test fired on 4
of 60 replays. Adding part 2 fixed that. The rule was set on one seed set and then checked on fresh seeds
(`eval/weekday-bunching.mjs`, output `eval/weekday-bunching.out.txt`; 300-day clumpy Poisson series on a wandering
level, both settings replayed):

| series | seeds | replays | alert-date test alone | the shipped line (both parts) |
|---|---|---|---|---|
| no weekly cycle | design (20261118) | 60 | 4 | **0** |
| closed every Saturday | design | 60 | 53 | **53** |
| no weekly cycle | fresh (777) | 200 | 6 | **0** |
| closed every Saturday | fresh | 200 | 180 | **180** |
| weekend 30% lower | fresh | 200 | 14 | **14** |

So on fresh series it raised no false warnings and caught a closed day in 9 of 10 replays. A mild weekend dip is
mostly missed (14 of 200), because a 30% dip in noisy counts rarely moves the alerts onto fixed weekdays. The line is
a check for the case seen on the real shop, not a general seasonality test.

**Checked:** `real-shop.test.mjs` (4 tests). The CSV's zero Saturdays and Christmas closure; orders without a period
give 37 Quiet alerts, all on Sunday or Monday, and the line; with `--period 7` there are 4 alerts and no line; and the
test's guards (dates only, at least 6 alerts, no line when the history has no weekday effect).

Next: revenue's deafness to a slow seasonal climb at Quiet and Middle (a heavy-tailed column; try `--log` and a
pre-registered bar on a second shop); one-day closures (a `--closed` list of dates treated as missing, pre-registered,
on a second shop); a deployer's real Stripe series.

## Closed days filled as missing (2026-11-19, pre-registered; three of five bars fail, `--closed` not offered)

The section above left "one-day closures (a `--closed` list of dates treated as missing, pre-registered, on a second
shop)". A closed weekday is a zero the count model reads as a step down and back up, so a shop that shuts on bank
holidays hears about each one. The rule and four bars were committed before the fill was coded or any watch ran on
the fresh data (`eval/closed-days.prereg.md`):

- each listed date is filled with the **median of the same weekday in up to 4 earlier weeks** (the `--period` phase
  when one is given; lag 1 when the labels are not consecutive days), rounded for counts. Only earlier points feed a
  fill, so filling a whole history once equals filling each prefix and the replay is honest;
- the closed list is a calendar fact: every non-Saturday day with no orders, cancellations or new customers.

**Fresh data:** UCI **Online Retail II** (Chen 2019, CC BY 4.0), the same shop's earlier year, 2009-12-01 to
2010-12-09, which no earlier round used (`data/online-retail-2009-daily.csv`, `data/SOURCE.md`). Its 15 closed days
are the Christmas closure and exactly the 2010 English bank holidays (Good Friday, Easter Monday, the two May
Mondays, the August Monday). The 2010-11 year from the section above is the design year: reported, not barred.
Runs: `eval/closed-days.mjs`, output `eval/closed-days.out.txt`; four columns as in the Stripe workflow, `--period 7`,
the "How eager" replay at the default budget and at about 1 a month, with and without the fill.

| bar (fresh year) | without fill | with fill | result |
|---|---|---|---|
| K1: alerts within a day of a closure at the suggested settings (4 columns x 2 budgets) | 10 | 2 | **fails** (bar: 0) |
| K2: Quiet's alerts, 4 columns | 31 | 22 | passes |
| K3: alerts away from closures kept (within 3 days) | 42 | 36 kept | passes (86%, bar 80%) |
| K4a: simulation, no-step series with an alert at a closure (of 100) | 99 | 8 | **fails** (bar: at most 2) |
| K4b: simulation, +40% steps caught within 7 days (of 100) | 75 | 70 | **fails** (bar: at least 72) |

The simulation (`eval/closed-days-sim/`, 200 series of 371 days, Gamma-Poisson counts with mean 40, Saturdays shut, 6
random one-day closures, Quiet with `--period 7`; run as 4 shards that each draw all 200 series from the one seed and
replay every 4th) took the alerts over all 200 series from 1,593 to 775.

On the design year the fill took the closure alerts from 11 to 0, Quiet's from 22 to 14, and kept 26 of 29 alerts
away from closures.

What the alerts show:

- **The two survivors are one alert, counted at both budgets:** cancellations dated 2010-04-06, the Tuesday after
  Easter Monday. It does not look like a holiday artefact: cancellations ran at 2 to 6 a day for the whole week after
  Easter against about 14 on a usual trading day, then came back on 04-12. The bar counted any alert within a day of
  a closure, and this one is. The verdict stands: the bar was fixed, and a real dip that starts the day a shop
  reopens is exactly what a stricter rule would have to tell apart from a catch-up day.
- **Orders, the column a shop owner reads first:** Quiet went from 11 alerts (3 at a closure: after Easter, after
  the May Monday, after the August Monday) to 6, none at a closure, and the autumn build-up, dated 2010-11-09 either
  way, was **sent 2010-11-13 instead of 2010-11-19**, six days sooner, because the filled holidays no longer muddied
  the weeks before it.
- **A cost on the design year:** Quiet on orders lost its 2011-09-01 alert (the start of that year's build-up, sent
  2011-09-05), and instead sent a change dated 2011-03-18 on 2011-10-07, seven months late. K3 did not count the lost
  one, because 2011-09-01 is three days after the August bank holiday and K3 only scored alerts more than 3 days
  from a closure. Part of what Quiet heard there in 2011 was the holiday's zero.

- **K4a's 8 is the background, not the holidays.** With the fill, Quiet still sent 3.2 alerts per no-step series on
  this overdispersed noise (321 over 100 series). Six closures with a day either side cover 18 of the 287 watched
  days, so alerts placed at random would put one near a closure in about 18 of 100 series; 8 is under that. The fill
  removed the closure effect (99 to 8), but the bar of 2 ignored the base rate of false alerts and could not have
  passed at Quiet on this noise. The verdict stands as fixed.
- **K4b: five fewer steps caught** (75 to 70). Not diagnosed. A likely cause, untested: steps drawn from days 150 to 330
  often fall within a week of a closure, and filling a closed day after a step from the weeks before it puts a
  pre-step value into the post-step stretch.

So the fill does most of what it was for (closure alerts down 80% on the fresh year, 100% on the design year,
Quiet quieter, the build-up sooner on the fresh year), but not what was barred, and it moved the one alert a shop
owner most wants on the design year. Not offered: `fillClosed` stays in `watch-core.mjs` as a module function, with
its rule and the fresh-year numbers pinned in `closed-days.test.mjs` (5 tests), and the CLI, the page and the agent
tool are unchanged. A deployer whose shop shuts on holidays should still expect an alert around each one; the
`--suggest` replay shows where.

Next, pre-registered before it runs: a closure bar scored against the chance rate of the setting's own alerts; fills
taken from the open days after a step once one is found (so a fill does not pull a new level back); separate a post-holiday dip from a holiday artefact (alerts dated the first
open day after a closure, held until a second open week agrees), on a third shop's daily series; and a check that
the fill does not swallow a real change that starts within 3 days of a closure (the 2011-09-01 case), in simulation
with steps placed next to closures.

## Steps beside a closure (2026-11-19, pre-registered; all three bars pass, `--closed` ships)

The section above failed K4b (steps caught fell from 75 to 70 of 100 with the fill) and guessed that a closure just
after a step is filled from the weeks before it. Two things in that round's design were also wrong: K4a's bar ignored
the setting's own false-alert rate, and K4b compared the fill with the closures-as-zeros arm, whose alerts *at* a
closure can land within 7 days of a step and count as catches. This round adds the baseline round 1 lacked, **clean**:
the same series with its closed days left open (their counts drawn from a side stream, so every other draw is
identical). `eval/closed-steps.mjs`; Quiet (`bocpd`, `--model poisson`, `--period 7`), replayed.

**Diagnosis on round 1's seeds (already seen; decides nothing; `eval/closed-steps-diag.out.txt`).** The script
reproduces round 1's numbers exactly (zeros 75, fill 70), and the clean shop catches **67**. So the fill did not
swallow steps: the zeros arm caught 13 of its 75 only through an alert within a day of a closure, which a shop that
never shut would not have sent. Against clean, round 1's fill lost 2 steps and found 5 others. On the no-step series it
put an alert at a closure in 8 of 100 against 16 at random placebo dates; the clean series, with no closures at all,
had 22 against 18. K4b and K4a measured the wrong thing.

**The candidate and the bars** were committed before the fresh run (`eval/closed-steps.prereg.md`). **fill1**: each
closed day takes the nearest earlier same-weekday open day (`fillClosed(..., { lags: 1 })`), one week old rather than up
to four, so a closure 8 or more days after a step is filled from after it. Fresh seeds 20261120: 100 no-step series
with 6 closures, and 100 series with a +40% step and **one closure placed 1 to 21 days after it** (plus 5 more), the
case round 1 named. Every series also gets 6 placebo dates drawn like closures: the chance rate of an alert "at a
closure" for each arm's own alerts.

| fresh seeds 20261120 | clean | zeros | round 1 fill (median of 4) | **fill1** |
|---|---|---|---|---|
| no-step series with an alert within 1 day of a closure (of 100) | 16 | 100 | 8 | **16** |
| ... of a placebo date (chance) | 21 | 40 | 21 | 21 |
| steps caught within 7 days (of 100) | 57 | 67 | 51 | **52** |
| of which closure 1-7 days after the step (27) | 16 | 20 | 11 | 11 |
| of which closure 8-21 days after (73) | 41 | 47 | 40 | 41 |
| alerts over all 200 series | 846 | 1,584 | 819 | 820 |

- **S1 passes** (closure alerts at most chance + 3): 16 against 21.
- **S2 passes, at the line** (steps caught at least clean's minus 5): 52 against 57 - 5 = 52.
- **S3 passes, by one** (at least round 1's fill): 52 against 51. Round 1's fill fails S2 (51).

The zeros arm's 67 is again inflated: 21 of its 67 catches came only through an alert at a closure. The cost of a
fill is real and sits where the guess put it: with a closure 1 to 7 days after the step, both fills catch 11 of 27
against 16 for the clean shop, since a fill one week old is still from before the step. One week instead of four
fixed the 8-21 day case (41, as clean) but not that one. The median delay to the alert was 5 to 6 days in every arm.

**The real shop again (both years already seen; reported, not barred; same output file).** Quiet, `--period 7`:

| | zeros | round 1 fill | fill1 |
|---|---|---|---|
| fresh year 2009-10, orders: alerts (at a closure) | 11 (3) | 6 (0) | 7 (0) |
| fresh year, all 4 columns: alerts at a closure | 5 | 1 | 1 |
| design year 2010-11, orders: alerts (at a closure) | 4 (2) | 3 (0) | 2 (0) |
| design year, all 4 columns: alerts at a closure | 5 | 0 | 0 |

On the fresh year fill1 sends the autumn build-up (dated 2010-11-09) on 2010-11-13, six days sooner than with zeros,
as round 1's fill did. The cancellations alert at a closure is the post-Easter week described above, a real dip. On the
design year **fill1 also loses the 2011-09-01 build-up alert on orders**, three days after the August bank holiday
(round 1's fill lost it too, and sent a 2011-03-18 change seven months late instead; fill1 does not). That is the
1-to-7-day cost from the simulation, seen once on real data: part of what Quiet heard there was the holiday's zero.

**What ships: `--closed <dates|@file>` on `watch.mjs`** (one column, `--columns`, `--suggest` and the normal run),
filling with fill1 (rounded for counts) before any detector sees the series. The text output says how many listed days
were in the series and which; `--json` adds `closed: { listed, filled }`. Days a shop is always shut (a Saturday) are
for `--period 7`, not this list. The page and the agent tool are unchanged.

**Checked:** `closed-days.test.mjs` (now 8 tests): the `lags` rule, its prefix honesty, the CLI with a list and an
`@file`, and fill1 on the fresh year's orders with no alert at a closure.

Next: a closure in the first week after a step (11 of 27 caught against 16): hold an alert dated within a week before a
closure for one more open week, or fill from the open days after a found change; pre-register it on fresh seeds and a
third shop's daily series.

## A closure in the first week after a step (2026-11-19, two pre-registered rounds; both fail, `--closed` keeps fill1)

The section above left one cost of the shipped fill: with a closure 1 to 7 days after a +40% step, fill1 caught 11 of 27
steps against 16 for the shop that never shut, because a fill one week old is still from before the step. The
candidate here, **rec3** (`fillClosed(..., { lags: 1, recent: 3 })`), reads the level from the 3 nearest open days in
the last week instead, each scaled to the closed day's weekday by the weekday means of the 4 weeks ending a week before
the closure (skipping always-zero days such as Saturday). A closure 3 or more days after a step is then filled at the
new level, and only earlier points feed it, so a replay stays honest. k = 3 was fixed, not tuned. Script
`eval/closed-recent.mjs`, output `eval/closed-recent.out.txt`; Quiet (`bocpd`, `--model poisson`, `--period 7`),
replayed; the simulation is the section above's, except that **every** step series has a closure 1 to 7 days after its
step, so the case has 100 series rather than 27.

**Round 3** (`eval/closed-recent.prereg.md`, fresh seeds 20261121). A design run on the section above's seeds first
reproduced its numbers exactly (clean 57, fill1 52) and decided nothing.

| fresh seeds 20261121 | clean | zeros | fill1 (ships) | rec3 |
|---|---|---|---|---|
| no-step series with an alert within 1 day of a closure / of a placebo date (of 100) | 17 / 24 | 99 / 41 | 23 / 26 | 18 / 25 |
| steps caught within 7 days (of 100; closure 1-7 days after each) | 59 | 85 | 53 | 66 |
| alerts over all 200 series | 874 | 1,580 | 845 | 903 |

T1 (closure effect against chance), T2 (rec3 catches at least fill1 + 5) and T3 (at least clean - 5) passed. **T4
failed**: 903 alerts against a cap of 1.05 x fill1's 845 = 887. The diagnosis showed the cap's reference was wrong:
on the step series fill1 sends *fewer* alerts than the shop that never shut (439 against 474), because a pre-step fill
mutes the step's own alerts, and rec3 (486) sits next to clean. On the no-step series, where every alert is false,
rec3 sent 417 against clean's 400.

**Round 4** (`eval/closed-recent-r4.prereg.md`, fresh seeds 20261122), written after seeing round 3, changed only the
noise bar: **U4**, false alerts on the no-step series at most 1.05 x clean's (the 1.05 kept, not re-chosen). T1 to T3
unchanged.

| fresh seeds 20261122 | clean | zeros | fill1 (ships) | rec3 |
|---|---|---|---|---|
| no-step series with an alert within 1 day of a closure / of a placebo date (of 100) | 21 / 29 | 100 / 41 | 17 / 26 | 19 / 28 |
| steps caught within 7 days (of 100) | 58 | 89 | **60** | 62 |
| false alerts (100 no-step series) | 346 | 728 | 329 | 358 |

T1, T3 and U4 passed (358 against 363). **T2 failed**: 62 against 60 + 5. On these seeds fill1 caught as many steps as
the shop that never shut, 18 of its 60 through an alert within a day of a closure. So rec3 does not ship, `--closed`
keeps fill1, `recent` stays a module option (`closed-days.test.mjs`, 2 new tests: the new level after a step, the
weekday scaling past a shut Saturday, the fallback and prefix honesty), and there is no round 5 on this candidate.

What the three seed sets say together (descriptive, not barred): over 227 steps with a closure 1 to 7 days after them,
clean caught 133, fill1 124 and rec3 139. Round 2's "11 of 27 against 16" was mostly the luck of 27 series. fill1's
real cost is about 4 steps in 100 against a shop that never shut, and rec3 recovers it with about 3% more false alerts,
but 100 series per round is too few to show a 4-in-100 effect against a bar of 5. A bar that small needs about 1,000
series, five hours on this container's four cores.

**The real case was a different one.** Both real years were rerun (`real`, reported). On the design year rec3, like
fill1, does not bring back the 2011-09-01 orders alert, and it sends a 2011-03-18 change on 2011-11-17, eight months
late (fill1 does not). The data say why: the August bank holiday was **2011-08-29, three days *before* the build-up's
first day**, not after it (`data/online-retail-daily.csv`). The "closure after a step" this round simulated is not
what cost the alert on real data. The zeros arm's 2011-09-01 alert was sent partly because the holiday's zero sat a few
days before the rise, and no fill restores that. On the fresh year rec3 sends the autumn build-up (2010-11-09) on
2010-11-15, two days later than fill1 and four sooner than zeros.

Next: a closure in the week *before* a step (the 2011-09-01 case), simulated with the step placed 1 to 7 days after a
closure and scored against clean; rec3's gain needs about 1,000 series per arm to settle, as a long background run.

## A closure in the week before a step (2026-11-19, pre-registered; all four bars pass, `--closed` unchanged)

The section above found that the real alert `--closed` lost, the design year's orders build-up dated 2011-09-01 (sent
2011-09-05 with closures as zeros), had its bank holiday **before** the rise: Monday 2011-08-29, three days earlier.
So the case to measure was a closure 1 to 7 days before a step, scored against **clean**, the same shop with the
closed day left open. The bars were committed before anything ran (`eval/closed-before.prereg.md`), with a written
prediction that fill1 would sit within noise of clean and that zeros would catch more. Script
`eval/closed-before.mjs`, output `eval/closed-before.out.txt`; the simulation is the section above's (Quiet: `bocpd`,
`--model poisson`, `--period 7`, replayed), on fresh seeds 20261123, with **300** step series rather than 100 (each with
one closure 1 to 7 days before its +40% step and 5 more at random) and 100 no-step series.

| fresh seeds 20261123 | clean | zeros | fill1 (ships) |
|---|---|---|---|
| steps caught within 7 days (of 300) | 183 | 274 | **179** |
| ... closure 1-2 / 3-4 / 5-7 days before the step | 56 / 54 / 73 | 84 / 81 / 109 | 53 / 54 / 72 |
| paired against clean: lost / found | | 7 / 98 | 18 / 14 |
| median days from step to the alert being sent (steps both caught) | 5 | 4 | 5 |
| no-step series with an alert within 1 day of a closure / of a placebo date (of 100) | 15 / 24 | 99 / 37 | 13 / 24 |
| false alerts (100 no-step series) | 355 | 716 | 343 |

- **V1 passes** (the cost: fill1 at least clean - 9): 179 against 174. The fill costs about 1 step in 100.
- **V2 passes** (no slower): median 5 days, as clean.
- **V3 passes** (closure effect gone): 13 against a placebo rate of 24.
- **V4 passes** (zeros lend catches: zeros at least clean + 9): 274 against 192. Of the zeros arm's 274 catches, **122
  came only through an alert within a day of the closure**. Its alerts in the step window pile up on the step day
  itself (74 of 317) and on the days just before it: the zero followed by the higher level reads as one larger change,
  and the detector dates it between the two.

**The real case, four ways** (already seen; reported, not barred; same output file). Orders on the design year:

| 2011-08-29 (the August bank holiday) | build-up alert dated 2011-09-01 |
|---|---|
| left as a zero, all closures zeros | sent 2011-09-05 |
| fill1 (the shipped `--closed`) | none |
| left as a zero, every other closure filled | sent 2011-09-05 |
| read as an ordinary Monday (the mean of the Mondays either side, 65 and 68) | none |

The 28-day mean of open weekdays went from 52.7 to 69.1 orders a day across 2011-09-01, and Quiet does not call that a
change on its own. The alert came from the holiday's
zero, and a shop that had opened that Monday would not have been sent it either. So `--closed` did not lose a real
alert it should have kept; it removed one the closure lent. Whether a busier setting hears that rise was not checked here.

**What ships:** `--closed` is unchanged; its help text now gives the cost of a closure before a step. **Checked:**
`closed-days.test.mjs` (now 11 tests) pins the real case: with 2011-08-29 a zero Quiet sends the 2011-09-01 alert, and
with fill1 or the Monday read as an ordinary open day it does not.

Next: rec3 against fill1 at about 1,000 series per arm (a closure after a step; README section above), as a long
background run; revenue's deafness to a slow climb at Quiet and Middle.

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

## Round 6 again, under persist 2 (2026-11-12, pre-registered re-check; the budget stands)

Round 7 made persist 2 the watch's default, and the page's and CLI's eagerness hint replays with the defaults, so
since round 7 the hint has been picking from replays that round 6 never scored. The round 6 script had the same
silent drift: its replay named confirm, tolerance and hold but not `persist`, so `advance` would have filled in
persist 2. `eval/watch-eagerness.mjs` now names it (`WATCH_PERSIST`, default 1, so the published round 6 output
reproduces line for line, which it did). The re-check's rule was committed in the script's header before the run:
keep `HINT_BUDGET` = 2 if round 6's parts (a), (b) and (c) all pass under persist 2; if any fails, record it and
adopt no other budget from this run, since every other row is post hoc.

Output: `eval/watch-eagerness-persist2.out.txt` (104 s on 4 cores; `WATCH_PERSIST=2 WATCH_BUDGETS=1.64,3.29,14.3`).
Future halves of the 23 scored TCPD series:

| policy | persist 1 (round 6): alerts, at a mark, per 1,000, reached | persist 2 (shipped): alerts, at a mark, per 1,000, reached |
|---|---|---|
| fixed quiet (default) | 62, 27 (44%), 16.0, 16 of 31 | 61, 26 (43%), 15.7, 16 of 31 |
| fixed middle | 107, 35 (33%), 27.6, 23 of 31 | 106, 35 (33%), 27.3, 23 of 31 |
| fixed eager | 369, 80 (22%), 95.2, 31 of 31 | 364, 79 (22%), 93.9, 31 of 31 |
| **hint, B = 2** | 68, 28 (41%), 17.5, 17 of 31 | **68, 27 (40%), 17.5, 17 of 31** |
| hint, about 1 a month (3.29) | 76, 34 (45%), 19.6, 19 of 31 | 75, 32 (43%), 19.3, 19 of 31 |
| hint, about 1 a week (14.3) | 292, 74 (25%), 75.3, 29 of 31 | 287, 73 (25%), 74.0, 29 of 31 |

**All three parts pass, so the budget stands at 2:** (a) 17 marks against quiet's 16; (b) 17.5 per 1,000 against
middle's 27.3; (c) 39.7% at a mark against quiet's 42.6%, inside the 5-point allowance. The forecast claim's
Spearman for quiet is 0.616 again (middle 0.600, eager 0.767), so the "on your history it would have sent" line
stays. Held out (6 series, deciding nothing): the hint still picks Quiet on all six, 6 of 9 marks at 22.1 per 1,000.

What persist 2 changed, read plainly: about 1-2% fewer alerts at every setting, the same marks reached, and one pick.
`children_per_woman`'s Middle setting sent 3.3 alerts per 100 history checks under persist 1 and 1.7 under persist
2 (the flicker persist 2 exists to cut), so the hint moved it from Quiet to Middle (picks 14/7/2 against 15/6/2).
That did not change the totals. One mark fewer at a mark under the hint (27 against 28) is the cost of that move.
The margin is what it was in round 6: one marked change over the default for 7 more alerts on 23 series. The fresh
labelled set is still the real test.

The page's and CLI's off-budget caveat (`eagernessText`) quoted round 6's persist-1 numbers for the plain budgets;
it now quotes this run's (1 a month: 19 of 31 at 19.3 per 1,000; 1 a week: 29 of 31 at 74.0), and the
default-budget line says the 15.7 baseline is under the shipped persist 2. Test: `watch-eagerness.test.mjs`
("round 6 re-checked under persist 2"), which reads the output file and the text.

## The 1976 acceleration, dated and tested on the levels (2026-11-13, pre-registered; ships as `--hinge-test`)

The slope-break test above works on the differences because, on a drifting series (GDP, productivity), the residuals
about any line are close to a unit root and a level fit's gain is meaningless. That safety costs power: on annual
global temperature it finds the recalled 1976 acceleration as its best split but gives p 0.80. Temperature does not
drift that way: about a trend its year-to-year scatter is a stationary AR(1) with rho near 0.5. So `hinge-test.mjs`
tests on the levels: one continuous hinge (`x = a + b t + c (t - k)+`), a sup-F over knots with 15% trimmed at each
end (Andrews 1993; the knot is not identified under the null, Davies 1987, so no table applies), the series and the
regressors Prais-Winsten transformed with the rho of the best least-squares hinge's residuals, and a p-value from a
parametric bootstrap that reruns the whole procedure on the fitted straight line plus AR(1) noise. It refuses when the
straight line's residuals have bias-corrected rho above 0.9 (0.7 under 100 points), the unit-root case the differences
test is for.

**Size, synthetic** (`node eval/hinge-test-sim.mjs 300 99 line size`, `eval/hinge-test-sim-size.out.txt`; straight
line plus AR(1) noise, 300 series per cell, 99 replicates each): rejections at p <= 0.05 between 3.0% and 7.7% in all
12 cells (n 60, 145, 300; rho 0, 0.3, 0.6, 0.8). Two choices were made on synthetic size alone, before any real run:
the bootstrap draws its noise with the rho of the straight-line residuals, not the hinge's (the hinge's gave 10.0% and
20.0% at n 60, rho 0.6 and 0.8), and under 100 points the guard is 0.7 (with 0.9, n 60 rho 0.8 rejected 10.7%; now
195 of 300 such series are refused and the rest reject 3.3%).

**Power, synthetic** (`node eval/hinge-test-sim.mjs 150 99 line power`, `eval/hinge-test-sim-power.out.txt`; one
slope change at 65% of the series, innovation sd 1):

| n | rho | slope change per step | levels: p <= 0.05 | levels: also dated within 5% of n | differences: p <= 0.05 |
|---|---|---|---|---|---|
| 145 | 0.5 | 0.02 | 14% | 3% | 0% |
| 145 | 0.5 | 0.04 | 40% | 14% | 0% |
| 145 | 0.5 | 0.08 | 94% | 51% | 0% |
| 145 | 0.3 | 0.04 | 71% | 31% | 0% |
| 300 | 0.6 | 0.02 | 57% | 21% | 0% |
| 300 | 0.6 | 0.04 | 99% | 51% | 0% |
| 60 | 0.3 | 0.10 | 35% | 10% | 0% |
| 60 | 0.3 | 0.20 | 83% | 52% | 0% |

The differences test finds none of these: differencing AR(1) noise with rho 0.5 leaves noise about as large as the
original, against a mean shift of a few hundredths. The levels test detects far more often than it dates: a hinge is
a gentle feature, and the best knot wanders. Read the date with the slopes, not alone.

**Real series, pre-registered** (`eval/hinge-test-prereg-2026-11-13.md` committed before the run;
`node eval/hinge-test-real.mjs`, `eval/hinge-test-real.out.txt`; 999 replicates, seed 1). GISTEMP annual and GCAG
1850-2024 are new fixtures made from the same monthly file as the existing one (`data/SOURCE.md`).

| series | knot | F (bar) | p | slope before -> after, degrees per century | differences test p |
|---|---|---|---|---|---|
| A. GCAG 1880-2024 | 1976 | 72.0 (11.7) | 0.001 | 0.44 -> 2.03 | 0.800 |
| B. GISTEMP 1880-2024 | 1976 | 85.6 (13.2) | 0.001 | 0.35 -> 2.12 | 0.746 |
| C. GCAG 1850-2024 | 1976 | 93.1 (13.0) | 0.001 | 0.30 -> 2.16 | 0.763 |
| D. log US real GDP | refused (rho 0.97) | | | | |
| D. log US labour productivity | refused (rho 0.98) | | | | |
| E. GCAG 1910-2024 (no prediction) | 1985 | 47.8 (11.3) | 0.001 | 0.59 -> 2.30 | 0.907 |
| E. GCAG 1930-2024 (no prediction) | refused (rho 0.76 above the short-series 0.7) | | | | |

Every prediction held (A, B and C: p <= 0.01, knot in 1960-1985; both D refused), so the test ships. p 0.001 is the
floor at 999 replicates. B is a second analysis of largely the same thermometer readings, not independent evidence.
The mid-1970s date is recalled from the literature, not read from a source here, so the knot is a plausibility check,
not a labelled hit.

**What it does not say.** A small p rejects the straight line; it does not say one hinge is the right model (the
record also rises in 1910-1940 and has the 1945 step). The 1930-2024 refusal shows the guard's weak point: it reads
the straight line's residuals, which a real hinge makes stickier, so on a short window with a strong bend it can
refuse a series it could have tested. Dependence beyond AR(1) (long memory) would make it over-reject; this was not
measured on real data. Up to 600 points in `analyze` (the bootstrap reruns a quadratic scan).

**Use it.** CLI `--hinge-test`; `analyze({ ..., hingeTest: true })` returns `hingeTest: { index, label, f, bar95, p,
rho, slopeBefore, slopeAfter, significant, note }` or `{ refused, reason }`; on the page, the "Also test one change of
slope on the levels" box. Test: `hinge-test.test.mjs`.


### A guard read off the hinge's residuals (2026-11-15, pre-registered; fails, not the default)

The guard above reads the straight line's residuals, and a real bend makes those stickier, so on GCAG 1930-2024
(95 points) it refused at rho 0.76, above the short-series 0.7. `guard: 'hinge'` reads the guard off the best OLS
hinge's residuals instead, and its bootstrap null still draws with the straight-line rho, capped at 0.95. Four bars
were written down first (`eval/hinge-guard-prereg-2026-11-15.md`); both guards ran on the same series
(`node eval/hinge-guard-sim.mjs 300 99`, `eval/hinge-guard-sim.out.txt`; `node eval/hinge-guard-real.mjs`,
`eval/hinge-guard-real.out.txt`). Each figure is the share of **all** series with p <= 0.05, with refusals counted as
not rejecting.

| bar | cell | line guard (shipped) | hinge guard | holds? |
|---|---|---|---|---|
| R | GCAG 1930-2024 | refused | knot 1974, p 0.001, slope -0.00 -> 2.08 per century | yes |
| R | GCAG/GISTEMP 1880, GCAG 1850; log GDP, productivity | 1976, p 0.001; refused | same; refused (hinge rho 0.95, 0.96) | yes |
| P | n 95, rho 0.5, slope change 0.2 | 20.7% (64 tested) | 98.7% (300 tested) | yes |
| P | slope change 0.1 / 0.05 | 63.3% / 25.0% | 70.3% / 25.3% | |
| S1 | n 60, rho 0.8 (straight line, no bend) | 3.3% | **10.7%** | no (8% cap) |
| S1 | other 11 cells | 3.0-7.7% | identical to the line guard but n 60 rho 0.6 (6.7%) | |
| S2 | random walk with drift, n 60 / 145 / 300 | 0.3% / 2.0% / 0.0% | **11.0% / 16.0%** / 3.0% | no |
| S2 | AR(1) rho 0.9, n 60 / 145 / 300 | 1.0% / 5.7% / 6.3% | **8.3% / 8.3%** / 7.3% | no |
| S2 | AR(1) rho 0.95, n 60 / 145 / 300 | 0.7% / 3.0% / 0.3% | **9.0% / 8.7%** / 5.3% | no |

Two bars fail, so the default stays `line`. The risk named in the pre-registration is what happened: a hinge fits a
random walk's wander better than a line does, so a hinge-residual guard admits random walks (171 of 300 at n 145),
and on those the level test rejects about one time in six. The power is real, though. With a 0.2 slope change at
n 95, the line guard refuses 236 of 300 series, and the hinge guard tests all 300 and finds 98.7%. That is the
1930-2024 problem: the stronger the bend, the more often the shipped guard refuses it. `guard: 'hinge'` stays in
`hingeTest` for evaluation, and it is not in the CLI or on the page.

**What the table suggests, not tested.** The failures are at n 60 and 145 and near a unit root. A guard that needs
both rhos to clear, or one that refuses when a hinge cuts the rho by less than a unit root's typical cut, would
target the gap; each needs its own pre-registration and fresh seeds, since these cells are now seen.
Test: `hinge-test.test.mjs` ("hinge-residual guard").

### A guard that asks how much the bend cut the stickiness (2026-11-15, later; pre-registered on fresh seeds; ships as the default)

The section above ended with an untested idea: refuse when a hinge cuts rho by less than a unit root's typical cut.
A real bend makes a straight line's residuals sticky and the hinge removes most of that; a random walk's wander is
cut far less. `guard: 'cut'` keeps the line guard where it admits a series, and where it would refuse, admits only
when (1) the best OLS hinge's residuals clear the guard (0.9; 0.7 under 100 points) and (2) the cut, line rho minus
hinge rho (both bias corrected), is above the 99th percentile of the same cut over 299 random walks of the same length
(seed 7; detrending removes a walk's drift and rho ignores scale, so the bar depends on n alone: 0.42 at n 60, 0.25 at
95, 0.21 at 145, 0.09 at 300, 0.05 at 600). An admitted series' null draws with its line rho capped at 0.95.

The bars were the four of the hinge-guard pre-registration, written down before the guard ran through `hingeTest`
(`eval/hinge-cut-guard-prereg-2026-11-15.md`), after one look at cut distributions on development seeds that are not
reused. The synthetic cells are the same as above with every seed moved by 50,000,000, so the series are fresh
(`node eval/hinge-cut-guard-sim.mjs 300 99`, `eval/hinge-cut-guard-sim.out.txt`; `node eval/hinge-cut-guard-real.mjs`,
`eval/hinge-cut-guard-real.out.txt`). Share of **all** series with p <= 0.05, refusals counted as not rejecting:

| bar | cell | line guard | cut guard | holds? |
|---|---|---|---|---|
| R | GCAG 1930-2024 | refused (rho 0.76) | knot 1974, p 0.001, slope -0.00 -> 2.08 per century (hinge rho 0.33, cut 0.43 against a bar of 0.25) | yes |
| R | GCAG/GISTEMP 1880, GCAG 1850; log GDP, productivity | 1976, p 0.001; refused | same; refused (hinge rho 0.95, 0.96) | yes |
| P | n 95, rho 0.5, slope change 0.2 | 15.3% (47 tested) | **83.0%** (250 tested) | yes |
| P | slope change 0.1 / 0.05 | 62.0% / 19.0% | 64.0% / 19.0% | |
| S1 | 12 cells, straight line plus AR(1) | 2.0-8.0% | identical but n 60 rho 0.8 (3.7% against 3.0%); 8.0% at n 300 rho 0.6 sits on the bar under both guards | yes |
| S2 | random walk with drift, n 60 / 145 / 300 | 1.3% / 1.7% / 0.0% | 4.0% / 2.7% / 3.3% | yes |
| S2 | AR(1) rho 0.9, n 60 / 145 / 300 | 1.3% / 5.3% / 2.7% | 2.3% / 5.3% / 2.7% | yes |
| S2 | AR(1) rho 0.95, n 60 / 145 / 300 | 1.3% / 2.7% / 0.7% | 2.3% / 3.0% / 2.0% | yes |

All four bars hold, so `cut` is now the default of `hingeTest`, `--hinge-test` and the page box; `guard: 'line'`
gives the old rule. Against the `hinge` guard it keeps most of the power on strong bends (83% against 98.7% on the
earlier seeds) without the random-walk leak: at n 145 the hinge guard admitted 171 of 300 walks and rejected 16.0%
of all of them; the cut guard admits 34 of 300 fresh walks and rejects 2.7%. The CLI and the page say when a series was admitted by the cut, with both rhos and
the bar.

**What it does not say.** The 99% bar means about one random walk in a hundred is admitted by the cut alone, and
admitted walks then reject more often than not; S2 shows the total stays at or under 4%. The bar is calibrated on
Gaussian walks; a walk with heavy-tailed steps was not measured. R's 1930 cell is the case that motivated the guard,
so it is seen, not fresh evidence. Test: `hinge-test.test.mjs` ("rho-cut guard", "random-walk cut bar", "the CLI
says when a sticky series was admitted by the cut").

### Step or bend? A check beside the hinge test, and the test on eight fresh real series (2026-11-15, latest; pre-registered; the check fails, not offered)

The hinge test asks "one bend against a straight line", so a level jump on a trend can reject the line and come back
as a change of slope; its note said so but nothing measured how often. `stepOrBend(x, rho)` in `hinge-test.mjs` fits,
with the test's Prais-Winsten rho and the same knot range, the best hinge and the best single level step on the same
line. Both have three coefficients and one knot, so the smaller transformed residual sum of squares names the kind.
The bars and the real predictions were written down first (`eval/hinge-step-or-bend-prereg-2026-11-15.md`, committed
before the code existed); `node eval/hinge-step-or-bend-sim.mjs 200 99` (`eval/hinge-step-or-bend-sim.out.txt`, seeds
from 61,000,000) and `node eval/hinge-step-or-bend-real.mjs` (`eval/hinge-step-or-bend-real.out.txt`, 999 replicates).

**Synthetic** (line 0.02 t plus AR(1) noise, innovation sd 1, change at 60% of n, 200 series per cell). "Right kind"
is among the series the hinge test rejects at p <= 0.05:

| cell | hinge test rejects (share of all) | right kind (pre-registered, GLS) | post hoc: OLS | bar |
|---|---|---|---|---|
| step 1, n 100, rho 0.5 | 5.5% | 54.5% | 54.5% | reported |
| step 2, n 100, rho 0.5 | 14.0% | 82.1% (28 rejections) | 71.4% | too few to decide |
| step 3, n 100, rho 0.5 | 15.5% | 90.3% | 90.3% | SS holds |
| step 2, n 145, rho 0.5 | 20.5% | 85.4% | 80.5% | SS holds |
| step 2, n 100, rho 0 | 42.0% | 98.8% | 98.8% | SS holds |
| bend 0.04, n 100, rho 0.5 | 17.0% | 29.4% | 35.3% | reported |
| bend 0.08, n 100, rho 0.5 | 60.0% | **44.2%** | 56.7% | **SB fails** |
| bend 0.04, n 145, rho 0.5 | 49.5% | 35.4% | 53.5% | reported |
| bend 0.08, n 100, rho 0 | 100% | **82.0%** | 81.0% | **SB fails** |

**Real, bar R** (recalled kinds, plausibility labels): it holds. The Nile is tested (n 100, rho 0.24) and the hinge
test **rejects**, knot 1913, F 12.5 against 8.7, p 0.017, a slope of -8.1 a year turning flat: a bend that is not
there. The check says `step`, after 1898, size -284, step RSS 0.90 of the bend's: the documented drop. GCAG
1880/1850, GISTEMP and GCAG 1930-2024 all say `bend` (step RSS 1.16 to 1.25 of the bend's).

**Verdict.** SB fails in both cells, so the check is not in `hingeTest`'s output, the CLI or the page (it is exported
for evaluation). It is lopsided: given a real step it says `step` 85-99% of the time, but given a real bend at
rho 0.5 it says `step` more often than not. With 40 points after the knot and sticky noise, a ramp of 3.2 is fit
about as well by a jump half-way along it. The OLS column (looked at after the result, not pre-registered) does not
rescue it. Two things do ship, as text: the report note now says a level step can pass for a hinge, with the Nile
and the measured rate (a 2 sd step on a line makes the test reject in 14-42% of series, against about 5% with no
change), and asks the reader to run the step models too.

**The test on fresh real series: 4 of 5 predictions fail, all by refusal.** None of these had been run through
`--hinge-test`:

| series | n | prediction | result |
|---|---|---|---|
| P1 Australian gas, annual totals 1956-1994 | 39 | tested, p <= 0.05, knot 1966-1973 | refused: line rho 0.97, hinge 0.83 (guard 0.7) |
| P2 US electricity, annual totals 1973-2012 | 40 | tested, p <= 0.05, knot 1998-2008 | refused: line 0.82, hinge 0.72 |
| P3 US female murder rate 1950-2004 | 55 | tested, p <= 0.05, knot 1975-1995 | refused: line 0.97, hinge 0.80 |
| P4 Lake Huron 1875-1972 | 98 | p > 0.05 | refused: line 0.80, hinge 0.75 |
| P5 UK gas, annual totals 1960-1986 | 27 | refused (under 30) | refused, as predicted |
| Canada fertility 1931-1968 (no prediction) | 38 | | refused: line 0.92, hinge 0.77 |
| Michigan-Huron 1918-2009 (no prediction) | 92 | | refused: line 0.87, hinge 0.80 |
| CO2 annual means 1959-2025 (no prediction) | 67 | | refused: line 0.97, hinge 0.92 |

So, counting GCAG 1930-2024, the test has now run on one of eight real series under 100 points. Under 100 points the
guard is 0.7 on the best hinge's residuals, and every one of these left the hinge's residuals above it: a growth
curve (gas, CO2), a rise and fall (murder rate: two bends, one hinge), a near-random-walk lake. That is the guard
doing what its size table asked for (it was set to keep n 60, rho 0.8 at 3.3%), and the predictions were wrong
about how sticky these series are, not about their shapes. The page box now says it refuses most real series under
100 points. **Next** (not run): a second hinge, or a hinge on the log for growth curves, would cut these rhos further
and might admit them; each needs its own size check on fresh seeds. A step-or-bend rule with a margin (call it only
when one RSS is clearly smaller, else "can't tell") is the obvious repair to the check; it needs fresh seeds too.
Test: `hinge-test.test.mjs` ("step or bend").

### Step or bend, as two tests (2026-11-15, last; pre-registered on fresh seeds; fails two bars, not offered)

The RSS check above names whichever kind fits better even when the two fit equally, and that is where it failed. Its
named repair was a rule that can say "can't tell". `stepOrBendTest(x)` in `hinge-test.mjs` does that with two tests:
T = log(step RSS / bend RSS), and each kind in turn is the null, drawn from its best OLS fit plus AR(1) noise and
rerun through the whole procedure 199 times. A kind is named only when its rival is rejected at 0.05 and it is not;
otherwise "unclear". Guard: refused under 30 points, or when both fits' residuals have bias-corrected rho above 0.9
(0.7 under 100). The bars were written down and committed before the fresh run
(`eval/hinge-step-or-bend-boot-prereg-2026-11-15.md`), after one look at the old check's seeds, which showed why
the bars are over **all** series and not only those the hinge test rejects: there, 9 of 28 and 10 of 41 sticky steps
were called bends. The hinge test fires on a sticky step mainly when the noise happens to bend it, and no check on the
same data can undo that selection. `node eval/hinge-step-or-bend-boot-sim.mjs 200 199` (seeds from 62,000,000,
`eval/hinge-step-or-bend-boot-sim.out.txt`, about 45 min on 4 cores) and `node eval/hinge-step-or-bend-boot-real.mjs`
(`eval/hinge-step-or-bend-boot-real.out.txt`, 999 replicates).

| cell (200 series) | step | bend | unclear | bar |
|---|---|---|---|---|
| step 2, n 100, rho 0.5 | 68 | 9 (4.5%) | 123 | W holds |
| step 3, n 100, rho 0.5 | 134 | 6 (3.0%) | 60 | W holds |
| step 2, n 145, rho 0.5 | 86 | 10 (5.0%) | 104 | W holds |
| step 2, n 100, rho 0 | 178 (89%) | 0 | 22 | W, U hold |
| bend 0.08, n 100, rho 0.5 | **22 (11.0%)** | 52 | 126 | **W fails** (cap 8%) |
| bend 0.08, n 100, rho 0 | 11 (5.5%) | 149 (74.5%) | 40 | W, U hold |
| no change, n 100 rho 0 / n 100 rho 0.5 / n 145 rho 0.5 | 13 / 16 / 11 | 8 / 10 / 13 | 179 / 174 / 176 | N holds (all <= 8%) |
| random walk with drift, n 100 (195 tested) | 5 | **129** | 61 | **RW fails** (cap 10% of all) |
| random walk with drift, n 145 (162 tested) | 3 | **112** | 47 | **RW fails** |
| reported: step 1 / bend 0.04 n 100 / bend 0.04 n 145, all rho 0.5 | 17 / 13 / 14 | 8 / 21 / 41 | 175 / 166 / 145 | |

**Bar R holds:** the Nile is called `step` (after 1898, size -284;
pStep 0.52, pBend 0.014), and GCAG 1880, GISTEMP and GCAG 1850 are called `bend` at 1976 (pStep 0.001, pBend 0.69 to
0.76). Not predicted: GCAG 1930-2024 `bend` at 1974; Canada fertility (a rise and fall) rejects both kinds, so
`unclear`; Lake Huron `unclear`; five short sticky series refused.

**Verdict: two bars fail, so it is not offered** (it was wired into the CLI as `--step-or-bend` while the run went;
that wiring was removed before merge). It is honest where its guard is: with white noise it names a clear step 89%
of the time and a clear bend 75%, with wrong calls at or under 5.5%, and with no change it names a kind in 10.5-13% of
series. Two things break it. (1) **The guard.** Read off the fitted step's and bend's residuals, it admits nearly every
random walk at n 100 (where the limit is 0.9), and a walk's wander fits a bend far better than a step. On the same walks the
hinge test, behind its rho-cut guard, rejected only 14 and 6: the next round should reuse that guard. (2) **Sticky bends.** Post hoc,
on the development seeds: with true rho 0.5 the fitted bend's residuals give a bias-corrected rho of about 0.44 (the
knot search soaks up stickiness), so the bend null's noise is too smooth and it rejects a real bend too often. A
bootstrap bias correction of rho (fit, simulate, refit, shift by the mean bias) is the obvious repair; it needs fresh
seeds. `stepOrBendTest` is exported for evaluation. Test: `hinge-test.test.mjs` ("step or bend as two bootstrap
tests").

### The hinge test on the logs, and its size at 40 points (2026-11-15, latest; pre-registered; size holds, logs admit nothing)

"Step or bend" ended with the test refusing 7 of 8 real series under 100 points, and named a hinge on the log for
growth curves as one way in. `--log --hinge-test` (and the page's "Take logs first" box) already passed logged values
to the test, but nobody had run it, and the report still said "on the levels". The bars, the predictions and the
decision rule were committed before any run (`eval/hinge-log-prereg-2026-11-15.md`). The two growth series that
motivated it have 39 and 40 points, below the n 60 where the shipped size tables start, so the synthetic half measures
the shipped test (guard `cut`) at n 40 on fresh seeds: `node eval/hinge-log-sim.mjs 300 99`
(`eval/hinge-log-sim.out.txt`, seeds from 63,000,000, under a minute) and `node eval/hinge-log-real.mjs`
(`eval/hinge-log-real.out.txt`, 999 replicates). One smoke run of the sim script (20 series, 19 replicates, the same
first seeds) came before the full run; it only checked that the script ran.

| bar | cell (n 40, 300 series) | share of all series with p <= 0.05 | tested | holds? |
|---|---|---|---|---|
| S1 | line plus AR(1), rho 0 / 0.3 / 0.6 / 0.8 | 3.7% / 5.0% / 6.7% / 3.3% | 300 / 300 / 266 / 134 | yes (cap 8%) |
| S2 | AR(1) rho 0.9 / 0.95, random walk with drift | 4.0% / 1.7% / 2.3% | 93 / 57 / 72 | yes (cap 8%) |

| series | logs | levels | prediction (logs) |
|---|---|---|---|
| L1 Australian gas, annual 1956-1994 (39) | refused: line rho 1.00, hinge 0.95 | refused: 0.97, 0.83 | tested, p <= 0.05, knot 1966-1976: **fails** |
| L2 US electricity, annual 1973-2012 (40) | refused: line 0.89, hinge 0.71 (guard 0.7) | refused: 0.82, 0.72 | tested, p <= 0.05, knot 1998-2008: **fails** |
| C Lake Huron, Michigan-Huron, US female murder rate | refused (0.75, 0.80, 0.79) | refused | refused: holds |
| CO2 annual means 1959-2025 (reported) | refused: 0.96, 0.90 | refused | refused |
| Canada fertility 1931-1968 (reported) | refused: 0.91, 0.79 | refused | none |

**Verdict.** Size holds at 40 points, so the 30-point minimum stands: under 100 points the 0.7 guard keeps every cell,
random walks included, at or under 6.7%. Logs do not help, and bar L fails. Logging gas makes it worse (a supply that
grew from almost nothing in the 1960s is far from a straight line on the log scale, hinge rho 0.95), and electricity
misses the guard by 0.01. What blocks these series is the stickiness left after one bend, not the scale. As the decision
rule set out, no refusal suggests logs. The one change that ships is the wording: with logs on, the CLI, the page and
`hingeTest.note` say the test ran on the logs and that a slope there is a growth rate (0.02 a step is about 2% a step),
and the report carries `scale: 'log' | 'levels'`. **Next** (not run): the series' hinge residuals sit at 0.71-0.95, so a
second hinge or a smooth trend term, not a transform, is the remaining route; it needs its own size check at n 40.
Test: `hinge-test.test.mjs` ("with logs on, the report says the test ran on the logs").

## Round 8: a watch for a level that wanders (2026-11-13, pre-registered; ships as an option)

The watch took the level, volatility and count models only, so a series whose level drifts all the time (a price, a
stock of inventory, a slowly growing count) was watched with the level detectors, which read the drift itself as a run
of steps and keep alerting. `--model drift` ("Jumps on a drifting level") models the drift as a random walk and cuts
only jumps the walk does not explain. Now the watch can use it: detector `drift` (`detectDrift` in `watch-core.mjs`:
`driftLevel` on the newest `window` points, wander chosen with the changes, `noise: 'ml'`, as `--model drift` does;
level model only; no seasonal period; `--log` honoured). The alert gives the smoothed level on each side of the jump.

**The round.** `eval/watch-drift.mjs` holds the rule, committed before the first run (this PR's first commit). The
candidate is measured against the default `bocpd-ar1-window` under the shipped advance policy (confirm 5, tolerance 5,
hold, persist 2), so only the detections differ. To be offered as a setting, not the default, it had to (a) at least
halve the default's false alerts on two random-walk nulls and (b) find as many jumps on four walk-plus-jump cells
with a median delay at most 3 points longer. The synthetic generator is new (seeds 81-90, noise sd 1, walk step sd
omega, jump at point 301 of 500, a check after every point from 100). Output: `eval/watch-drift.out.txt`, 253 s on
4 cores.

| cell | default: false alerts / 1,000 checks, jumps found, delay | drift |
|---|---|---|
| walk 0.1 | 2.00 | 1.00 |
| walk 0.3 | 7.00 | 0.50 |
| walk 0.1 + jump 3 sd | 0.50, 10/10, 5 | 0.50, 10/10, 5 |
| walk 0.1 + jump 5 sd | 0.25, 10/10, 5 | 0.50, 10/10, 5 |
| walk 0.3 + jump 5 sd | 6.00, 10/10, 5 | 0.25, 10/10, 5 |
| walk 0.3 + jump 8 sd | 5.25, 10/10, 5 | 0.25, 10/10, 5 |
| null iid (reported only) | 0.00 | 0.00 |
| null AR(1) 0.8 (reported only) | 3.25 | 1.75 |
| step 2 sd iid (reported only) | 0.25, 10/10, 5 | 0.00, 10/10, 5 |

**Both parts pass:** (a) 0.75 against 4.50 false alerts per 1,000 checks on the walk nulls; (b) 40 of 40 jumps against
40 of 40, median delay 5 against 5. So `drift` ships as an option: "Wandering level" in the page's "How eager"
select (also used when the page's model is the wandering-level one and no setting is picked), `--detector drift` in
`watch.mjs`, and `detector: "drift"` for agents calling `watchCheck`. The default does not change. The gain is where
the pre-registration said it would be: at the larger wander (omega 0.3, about a third of the noise sd each step) the
default sends 6 to 7 false alerts per 1,000 daily checks, about 2.5 a year, and the drift watch about 0.2 a year. At
omega 0.1 the two are close.

**TCPD, deciding nothing, and a prediction that was wrong.** On TCPD's 31 univariate series (watched from 20% of their
length, as in rounds 4-7) the drift watch sent 202 alerts against the default's 103, 40.6% at an annotated change
against 42.7%, and reached **44 of 52** majority-marked changes against 32. The header predicted that the default
would reach more marks. It did not: the drift watch reached more on brent_spot, businv, children_per_woman,
co2_canada, gdp_iran, ozone, uk_coal_employ and usd_isk, all of them series whose level moves for years at a time,
and lost one on construction and one on lga_passengers. The extra alerts come from the same wandering series (co2_canada
23, children_per_woman 15, bank 47 against 29 on a series with no marks). That is about the trade the "Middle"
setting makes (README "Round 6": 23 of 31 on the future halves at 1.7 times the default's alerts), here at twice the
alerts for 12 more marks. It is one run on seen series and decided nothing: it says the drift watch is worth trying
on a series that clearly wanders, not that it should be the default. A pre-registered round on fresh labelled data
would be the test for that.

Not done: the "Which How eager suits this series?" hint does not consider `drift` (round 6's replay scored three
settings), and the budget box cannot pick it. The drift fit costs about 25 ms at 500 points and 90 ms at 1,000, about
half the default's time per check, so a replay is no slower.

Tests: `watch-drift.test.mjs` (4: it is a named detector for the level model only; a 6-sd jump on a wander of 0.3 is
found within 2 rows with its levels; a watch from 100 to 260 points sends that jump once and nothing for the wander;
`window` and `--log` are honoured). `eval/watch-drift-browser.mjs` in headless Chromium at 390 px (output
`eval/watch-drift-browser.out.txt`, 5 of 5): 150 rows of wander send nothing under "Wandering level"; checks at 250, 259
and 260 rows send the row-201 jump once (level 88.7 to 96.3, 7.75 noise sd); the wandering-level model with the setting
blank uses the drift watch; no page errors, no sideways scroll. `deploy/make-watch-repo.sh` now copies `drift-level.mjs`, which `watch-core.mjs`
imports.

## Round 9: the drift watch in the "How eager" hint (2026-11-13, pre-registered; negative result, the hint keeps three settings)

Round 8 left the hint ("Which How eager suits this series?", `--suggest`, `--detector auto`) scoring three settings, so a
person whose level wanders was never pointed at "Wandering level". Round 9 asked whether it should be. `eval/watch-hint-drift.mjs`
holds the rule, committed in its own commit before the first run: round 6's design unchanged (each univariate TCPD series cut in
half, the watch replayed after every point under the shipped policy, confirm 5, tolerance 5, hold, persist 2; picked from the
first half, scored on the second), with drift added to the ladder as quiet < middle < drift < eager and the hint taking the most
eager setting whose history rate is at most 2 alerts per 100 checks. Rule: against the shipped three-setting hint, (a) more
future majority-marked changes reached, (b) future alerts per 1,000 checks at most fixed middle's, (c) share at a mark at most
5 points lower. Output `eval/watch-hint-drift.out.txt`, 153 s on 4 cores; the shipped hint's row reproduces round 6b's exactly
(68 alerts, 27 at a mark, 17.5 per 1,000, 17 of 31).

| policy (future halves, 23 TCPD series) | alerts | at a mark | per 1,000 checks | majority-marked reached | picks q/m/d/e |
|---|---|---|---|---|---|
| fixed quiet (default) | 61 | 26 (43%) | 15.7 | 16 of 31 | |
| fixed middle | 106 | 35 (33%) | 27.3 | 23 of 31 | |
| fixed drift | 98 | 45 (46%) | 25.3 | 25 of 31 | |
| fixed eager | 364 | 79 (22%) | 93.9 | 31 of 31 | |
| hint, three settings, B = 2 (shipped) | 68 | 27 (40%) | 17.5 | 17 of 31 | 14/7/0/2 |
| **hint, four settings, B = 2 (candidate)** | 59 | 23 (39%) | 15.2 | **15 of 31** | 12/1/8/2 |
| four settings, drift below middle, B = 2 (reported) | 62 | 25 (40%) | 16.0 | 16 of 31 | 12/7/2/2 |

**(a) fails** (15 against 17); (b) and (c) pass. The prediction in the header said (a) was where it could fail, but for the wrong
reason: it expected too few wandering series to move to drift. None did. The eight series the candidate moved to drift were
mostly the quietest ones (construction, the two airport series, seat belts, three quality-control series, US population), where drift sent 0
to 1.6 alerts per 100 history checks. On a flat level the drift model explains a modest step as wander, so it is quiet there
because it is insensitive, not because the series is calm; the hint reads "few alerts on the history" as "room to be more eager"
and gets it backwards. Construction and seat belts each lost their one future mark that way. The wandering series did not move
because drift was over the budget on their histories: co2_canada 15.1 per 100 (quiet 3.5), children_per_woman 9.2, businv 5.3,
usd_isk 10.1. Of the 9 series where even Quiet was over 2 per 100, drift's history rate was higher than Quiet's on 5, equal on 3
and lower on 1 (quality_control_4), so the page's advice there, to watch the daily change, stands; pointing those people at
"Wandering level" would have made it worse.

The hint's rule assumes the settings are nested: each more eager one sends at least the alerts of the one below on any series.
Quiet, middle and eager nearly are (one engine, fewer assumptions each step). Drift is a different model, quieter than Quiet on a
flat level and louder than Middle on a wandering one, so no single place on the ladder fits it. Held out (6 series, deciding
nothing) said the same: the candidate moved iceland_tourism and scanline_126007 to drift and lost scanline_126007's mark (5 of 9
against 6 of 9).

**Post hoc, deciding nothing: fixed drift beat fixed middle on all three counts** on these future halves (25 of 31 against 23, at
25.3 against 27.3 per 1,000, 46% at a mark against 33%), and on the held out ties it on marks (8 of 9) at 44.2 against 41.4 per
1,000. That is on series rounds 3-8 have all seen, and round 8 already looked at drift on them, so it is a lead for a fresh
labelled set, not a reason to change the Middle setting.

What changed: nothing in the hint. `eagerSettings` says why drift is not on the ladder, and `watch-eagerness.test.mjs` pins the
round's result. Next for the hint: a rule that does not assume nested settings (for example, pick drift only when it sends fewer
alerts than Quiet on the history *and* the drift fit's wander is a material share of the noise), pre-registered on a fresh
labelled set.

## Several metrics in one watch (2026-11-13; `--columns` ships, a split budget was pre-registered and fails)

A business rarely watches one number. Orders, revenue, sign-ups and tickets usually sit as columns of one sheet, and
until now the self-deployed watch took one column, so five metrics meant five repositories, five state files and five
messages a morning.

**What shipped.** `watch.mjs --columns <list|all>`: `all` takes every numeric column but the label column (the same
detection as the analysis's several-columns mode, `parseColumns`); a list names columns by header or 0-based index, and
a column may carry its own model after a colon (`orders:poisson,revenue:meanvar`), so counts and money can share a
sheet. Each column runs exactly the one-column watch (same detectors, guards and defaults), with its record under
`columns.<name>` in one state file; a day's new changes from every column go out as one webhook message naming each
column, and `--fail-on-alert` fails on any. A one-column state file is refused rather than reused, `--column` and
`--columns` together are refused, a column listed twice is refused. `--suggest` and `--detector auto` work per column.
`deploy/make-watch-repo.sh` now copies `multivariate.mjs` and `consensus.mjs`, so the standalone repository runs
`--columns` (tested), and its README, the workflow's header and the watch page explain it. Tests: four in
`watch.test.mjs` (spec parsing and refusals; per-column records with a step in one column sent once, naming only it;
`--detector auto` per column; the standalone folder).

**The budget question, pre-registered.** Five columns give noise five chances a day. The obvious fix is to split the
`--alerts-per` budget across the columns (1/k each) when `--detector auto` picks each column's setting.
`eval/watch-columns.mjs` fixed the rule before any result was printed (two run-time changes made before output, noted
in its header: 10 seeds, not 20, and one eagerness replay per column shared by both arms): ship the split if, on 5
independent N(0,1) columns of 300 points with no change, the split's whole-watch rate is at or under 2 alerts per 100
checks and the unsplit rate is above it. Output: `eval/watch-columns.out.txt`.

| set | columns | unsplit (2 each) | split (2/k each) |
|---|---|---|---|
| synthetic null, 10 seeds | 5 | 1.33 per 100 checks | 0.13 |
| UK road casualties, monthly, `--period 12` | 5 | 3.25 (5 alerts) | 5.19 (8 alerts) |
| bike share daily, `poisson --period 7` | 2 | 15.21 (89) | 15.21 (89) |
| German unemployment, quarterly | 2 | 5.21 (5) | 5.21 (5) |
| frozen orange juice price and PPI, `--log` | 2 | 4.08 (20) | 4.08 (20) |

**Fails.** The unsplit picks already kept five noise columns under the budget (1.33 per 100 checks for the whole
watch), so the rule's second half is false and the split does not ship: each column is picked against the whole
budget, as a one-column watch is. The real sets say why the split is not even a safe default. On three of four the
budget never binds: the hint already picks Quiet, and the split changes nothing. On the seat-belt set (Harvey and
Durbin's UK driver casualties) it made the watch noisier: the split pushed DriversKilled and drivers from Middle to
Quiet, and on these seasonal monthly series Quiet sent more alerts than Middle (drivers 4 against 2), because the
"How eager" settings are not nested in their alert counts here (Round 9 met the same thing). The documented 1983-02
seat-belt law was alerted within 3 months in drivers and front under both arms. The bike-share columns send about 15
alerts per 100 checks on every setting, even with the weekly cycle removed: a level that moves with weather and season
keeps tripping a level watch, one more reason to replay the history (`--suggest`, or the page's replay) before setting
one up.

Not done: a budget rule for the whole watch that does not assume the settings are nested (the same open item as the
hint's non-nested rule); a several-columns card on the page (the page's watch card is still one column).
## Round 10: the watch on a fresh labelled set, NAB's 47 real series (2026-11-13, pre-registered; all three rules fail)

Since round 6 every watch decision has waited on "a fresh labelled set". Every round so far scored TCPD, which rounds 3-9
had all seen. The Numenta Anomaly Benchmark (NAB; Lavin and Ahmad 2015, arXiv:1510.03336; MIT, Copyright 2014-2024
Numenta Inc.) is one nobody here had looked at. It has 47 real series from AWS CloudWatch, an ad exchange, known-cause
failures (a machine's temperature before a breakdown, the NYC taxi holidays), Twin Cities traffic sensors and Twitter
volumes, with labelled anomaly windows. `sh eval/nab-fetch.sh nab-data && node eval/watch-nab.mjs nab-data` (output
`eval/watch-nab.out.txt`, 1,730 s on 4 cores). The rule, the code and three predictions were committed in this PR's
first commit, before any run that printed a score. The data is not committed.

**Design.** Round 9's design, with one change. Each series is averaged into clock-hour buckets: an hourly watch, 48,163
points. At NAB's native 5-minute rows a check after every row would have taken about 15 hours. The watch is replayed after
every point (no coarse checks) under the shipped policy (window 1,000, confirm 5, tolerance 5, hold, persist 2). Each series
is cut in half; the hint picks from the first half and is scored on the second. A future alert is "at a window" when its
change date lies inside any labelled window; a future window is "reached" when some future alert's change lies inside it.
NAB's windows are wide (10% of each file split among its anomalies), so 11.8% of future points lie inside one: that is
the chance rate for "at a window".

| policy (future halves, 47 NAB series, 61 windows) | alerts | at a window | per 1,000 hourly checks | windows reached | picks q/m/d/e |
|---|---|---|---|---|---|
| fixed quiet (default) | 798 | 109 (13.7%) | 33.1 | 50 | |
| fixed middle | 1,273 | 159 (12.5%) | 52.8 | 52 | |
| fixed drift ("Wandering level") | 405 | 83 (**20.5%**) | **16.8** | 48 | |
| fixed eager | 2,073 | 268 (12.9%) | 86.0 | 56 | |
| hint3, B = 2 (shipped) | 791 | 109 (13.8%) | 32.8 | 49 | 39/7/0/1 |
| hintNN, B = 2 (candidate) | 408 | 88 (21.6%) | 16.9 | 48 | 22/6/19/0 |

- **T1, the shipped hint against Quiet: not confirmed.** (a) 49 windows against 50 fails; (b) and (c) pass. On most of
  these histories even Quiet sent more than 2 alerts per 100 checks, so the hint picked Quiet on 39 of 47 and changed
  little. The one series it moved to Eager (`rogue_agent_key_updown`) lost its window. As pre-registered, the hint stays
  (it is opt-in advice, not a default) and `eagernessText` now says, on the page, in `--suggest` and in the agent tool,
  that it was not confirmed on NAB.
- **T2, round 9's lead (drift beats middle): dropped.** Drift reached 48 windows against Middle's 52. It did send under a
  third of Middle's alerts, and its share at a window was the highest of any setting.
- **T3, a hint that does not assume nested settings: does not ship.** The candidate rule was "drift when the history is
  too loud for Quiet and drift is quieter on it". It moved 19 series to drift, roughly halved the alerts (791 to 408) and
  raised the share at a window from 13.8% to 21.6%. It reached 48 windows against 49, so it fails (a) by one. `nyc_taxi`
  decided it: drift reached 1 of its 5 holiday windows against Quiet's 4. Those holidays are dips a day or two long, and
  the drift model absorbs short dips as wander. Drift gained a window on `ec2_request_latency` and on
  `machine_temperature`.

**Predictions, scored.** T1: predicted to pass by a few windows. It failed by one. T2: predicted to fail on (a) because drift
absorbs short excursions; it did. T3: predicted to fail on (a) "by a tie or near tie"; it failed by one, but I did not
predict it would move 19 series.

**What the round says beyond the rules (deciding nothing).** The level detectors' alerts on these operational metrics sit
inside an anomaly window barely more often than chance: 13.7% for Quiet, 12.5% Middle, 12.9% Eager, against 11.8%. The
windows are reached because the watch alerts often (33 per 1,000 hourly checks for Quiet, about 0.8 a day), not because
its alerts point at the anomalies. Drift is the only setting clearly above chance (20.5%, 1.7 times), at half Quiet's
alerts. That is the opposite of TCPD's picture, where the three level settings had 22-44% at a mark. NAB measures
something different: anomalies (spikes and failures) in noisy, daily-cycling server metrics, judged by wide windows,
against TCPD's annotated level changes. Two caveats on the hourly design. Averaging over an hour dilutes 5-minute
spikes. The round ran with no seasonal period, as pre-registered, although the level settings take `--period`. So no setting
here removed the daily cycle, and much of what Quiet alerts on is probably the cycle itself.

So the next round should remove the season, not tune the hint. NAB's server, traffic and Twitter series cycle daily
(period 24 hourly). The useful round is the level settings with `--period 24` against drift (which takes no period), pre-registered on
these same 47 series, which are now seen. Another option is a third labelled set. Neither the hint nor the default changes from this round.

Tests: `watch-nab.test.mjs` (6: hourly buckets, step 1, the two hint rules on made-up rates, the committed output's
three verdicts, and the hint text's NAB line).

## Round 11: the daily cycle removed, on the same 47 NAB series (2026-11-14, pre-registered; both rules fail)

Round 10 ended on a caveat: no setting removed the daily cycle, although NAB's server, traffic, taxi and Twitter series
cycle daily and the level settings take `--period`. So perhaps Quiet's alerts sat near chance because they were alerting
on the cycle itself. This round tests that. `sh eval/nab-fetch.sh nab-data && node eval/watch-nab-season.mjs nab-data`
(output `eval/watch-nab-season.out.txt`, 1,767 s on 4 cores). The rules, predictions and code were committed in PR #15440
on 2026-11-13, before any run that printed a score. This PR adopted that PR's branch after its session stopped, and ran it.

**Design.** Round 10's, with five settings: Quiet and drift with no period, and Quiet, Middle and Eager with period 24
(`quiet24`, `middle24`, `eager24`). Every setting starts after two full days (`max(48, 0.2 h)`). The 47 series have now
been seen once, so this is a second look at a seen set.

**One fix before the scored run.** The first run crashed after about an hour, before it printed anything.
`watch-nab-season.mjs` imports `watch-nab.mjs`, and that file's worker listener also answered every job, with no
period. So each job got two replies, and the job count reached its total at about half the work. If the timing had gone the other
way, the period-24 rows could have been silently scored with no period. Each script's listener now answers only workers
it started, and a second reply for the same job is an error. A test runs two real worker jobs and checks that each gets
the same alerts as a direct call with its own period. The rules, settings and data are unchanged. As a consistency
check, Quiet and drift came out within one alert of round 10 (797 against 798, 404 against 405) despite the later start.

| setting (future halves, 47 series, 61 windows) | alerts | at a window | per 1,000 hourly checks | windows reached |
|---|---|---|---|---|
| Quiet, no period (default) | 797 | 108 (13.6%) | 33.1 | 50 |
| drift ("Wandering level") | 404 | 83 (**20.5%**) | **16.8** | 48 |
| Quiet, period 24 | 833 | 124 (14.9%) | 34.6 | 52 |
| Middle, period 24 | 1,297 | 187 (14.4%) | 53.8 | 52 |
| Eager, period 24 | 2,096 | 294 (14.0%) | 87.0 | **57** |

Chance is 11.8% (the share of future points inside a labelled window).

- **T4, the season helps the default: fails.** Quiet with period 24 reached two more windows (52 against 50), but it sent
  slightly *more* alerts (34.6 against 33.1 per 1,000), and its share at a window rose 1.3 points, short of the 2 the
  rule asked. As pre-registered, the page, `watch.mjs --help`, the standalone repository's README and the agent tool say
  nothing new about period 24 for hourly metrics.
- **T5, the level watch with the season against drift: fails** on share (14.9% against 20.5%) and on alert rate. It
  does reach four more windows than drift (52 against 48). With T4 failed, there is no new advice for this to rank.
- Nothing in the default or the hint changes.

**Predictions, scored.** T4: I predicted about two thirds of Quiet's alerts, 16-18% at a window, and a window or two
fewer. All three were wrong in direction: alerts went up, the share rose only to 14.9%, and two more windows were reached.
T5: predicted to fail on (b) because drift's share is out of the season's reach; it did. But I predicted it would reach
about as many windows as drift, and it reached four more.

**What the round says (deciding nothing).** The daily cycle was not what kept Quiet's alerts near chance. Taking it out
moved the share from 13.6% to 14.9%, still close to 11.8%, and the alert count barely changed. On these hourly server
and traffic metrics, the level watch alerts at about the same rate with or without the cycle. Its alerts mostly mark
level moves that NAB does not label as anomalies. Where the season did help, it helped on reach. `nyc_taxi`, which decided round 10 against drift
(holiday dips a day or two long), went from 4 of 5 windows to 5 of 5 with period 24, and the known-cause folder's share
went from 10.3% to 15.7%. Drift stays the setting whose alerts point at anomalies (20.5%, 1.7 times chance, at half the
alerts), and the level settings, with or without the season, are the ones that reach more windows. On the 29 series with no missing hour,
the picture is the same (Quiet 12.6%, Quiet period 24 14.3%, drift 19.2%).

So neither the season nor the eagerness ladder makes the level watch a good anomaly pointer on NAB, and the trade
between drift's precision and the level settings' reach is real, not an artefact of the cycle. The next useful round is
a third labelled set, not a third look at NAB.

Tests: `watch-nab-season.test.mjs` (8: the settings, the start, gap-free marking, the period-ladder hint, the rules on
made-up totals, a period-24 replay on a daily cycle, one reply per worker job with its period applied, and the
committed output's verdicts with Quiet and drift checked against round 10's).

## Round 12: a third labelled set, SKAB's 33 pump faults, every sensor watched (2026-11-14, pre-registered; all three rules fail)

Rounds 10 and 11 ended on "the next useful round is a third labelled set, not a third look at NAB". This is that round, and
the first with labels on several columns at once. The Skoltech Anomaly Benchmark (SKAB v0.9; Katser and Kozitsin 2020,
doi:10.34740/KAGGLE/DSV/1693952; GPL-3.0, so fetched and not committed) logs 8 sensors of a water-circulation testbed
once a second: two accelerometers, motor current, pressure, motor temperature, fluid thermocouple, voltage and flow rate.
33 runs each hold one fault made on purpose: a valve closed at the pump's inlet (16) or outlet (3), and 14 others (leaks,
rotor imbalance of five shapes, water added, cavitation, hot water). Each run marks the fault's start, the end of its
transition, the start of the return and the return: 123 marks. A separate 2.6-hour run is anomaly-free. `sh
eval/skab-fetch.sh skab-data && node eval/watch-skab.mjs skab-data` (output `eval/watch-skab.out.txt`, 1,001 s on 4
cores). The rules, design and predictions were committed in this PR's first commit, before any run that printed a score.

**Design.** 5-second buckets (a check after every 1-second row would have taken about 6 hours; a timing-only pilot chose
this), about 230 points a run. All 8 columns are watched, as `--columns all` does, under the shipped policy, replayed
after every point from point 20. The hint reads the anomaly-free run (a person sets up a watch on a machine by replaying
a normal day), so each column's pick is made once and applied to all 33 fault runs. A mark's window runs from 5 s before
to 60 s after it (SKAB's own leaderboard uses 60 s after). An alert line is one column's alert.

| policy (33 fault runs, 8 columns, 123 marks) | alert lines | at a mark | per 1,000 checks | marks reached | faults caught | median delay | normal run, lines per 100 checks |
|---|---|---|---|---|---|---|---|
| fixed Quiet (default) | 457 | 168 (**36.8%**) | **69.4** | 97 | 33/33 | 30 s | **8.54** |
| fixed Middle | 1,203 | 314 (26.1%) | 182.7 | 115 | 33/33 | 25 s | 20.47 |
| fixed drift ("Wandering level") | 1,153 | 297 (25.8%) | 175.1 | 112 | 33/33 | 25 s | 9.94 |
| fixed Eager | 2,995 | 740 (24.7%) | 454.9 | **123** | 33/33 | 20 s | 37.24 |
| hint3, B = 2 (shipped) | 1,076 | 306 (28.4%) | 163.4 | 118 | 33/33 | 25 s | 9.56 (in-sample) |
| hintNN, B = 2 | 1,229 | 332 (27.0%) | 186.7 | 118 | 33/33 | 25 s | 9.30 (in-sample) |

Chance for "at a mark" is 23.1% (the share of scored points inside a mark window).

- **T6, the hint on a third set: not confirmed.** (a) 118 marks against Quiet's 97 and (b) 163.4 lines per 1,000 checks
  against Middle's 182.7 both pass; (c) fails: 28.4% of its alerts sat at a mark against Quiet's 36.8%, more than the 5
  points allowed. The normal run is calm on current, pressure and voltage, so the hint picked Eager there and Middle on
  three more columns. That reached more of the transition and return marks and sent more than twice Quiet's lines. As
  pre-registered, `eagernessText` (the page, `--suggest`, the agent tool) now says it was not confirmed on SKAB either.
- **T7, NAB's drift reading: fails** on both parts. Drift's share at a mark was 25.8%, against Quiet's 36.8% and
  chance's 23.1%, and it sent 2.5 times Quiet's lines. NAB's 20.5% does not carry to a second set, so nothing new is said
  about drift.
- **T8, unsplit `--columns all` on a real normal run: fails.** Quiet on all 8 columns sent 8.54 lines per 100 whole-watch
  checks of the anomaly-free run, every one of them false, against the budget of 2. As pre-registered, `watch.mjs --help`
  and the watch page now say so, and to replay with `--suggest` first. The page also says which columns to drop.
- Nothing in the default changes.

**Predictions, scored.** T6: predicted (a) pass and (b) fail; (a) passed, (b) passed too, and (c), which I expected to
hold, failed. T7: predicted to pass on both parts with drift catching fewer faults. Wrong on all three: it failed both
and caught all 33. T8: predicted to fail; it did, at 8.54.

**What the round says (deciding nothing).** Every setting caught all 33 faults. A closed valve or a drained tank moves the
flow rate a lot, and every detector sees it. The settings differ on the other marks and on noise. Quiet sat at a mark
1.6 times as often as chance and was the most precise setting here, the reverse of NAB, where it sat near chance. One
column did most of the work. Watched alone under Quiet, flow rate caught 29 of the 33 faults with 118 lines, 61.9% of
them at a mark. Pressure, voltage and current sent 15 lines between them and caught none alone. Motor temperature sent
97 lines, 18.6% at a mark, and the thermocouple 76 at 27.6%. Both drift with the room over a run, and they are the loud
columns on the normal run. So the advice the page now gives (replay first, keep the columns that matter) comes from this
table, not from a rule. A budget for the whole watch that is not per column is still open: the split failed on
synthetic noise (README "Several metrics in one watch"), and here even Quiet, the floor of the ladder, is over budget on
the normal run, so a split could not have fixed it.

Caveats. The runs are short (about 19 minutes each in 5-second buckets) and 16 of the 33 are near-copies of one valve
fault (the inlet valve closed). The hint's history is a different run from the scored ones. The 5-second buckets smooth the accelerometers. SKAB
labels collective anomalies, not every level move. The anomaly-free run has 556 two-second gaps between rows; buckets are
by row count, so those buckets span more than 5 s.

Tests: `watch-skab.test.mjs` (8: the round's settings, the file parser, buckets, marks and the fault start, the score on
made-up alerts, the hint rules, the three rules on made-up totals, the committed output's verdicts, and the hint and
`--columns` texts).

## Round 13: wait for two columns to agree (2026-11-14, pre-registered on a seen set; fails, not offered)

Round 12 left the many-column watch over budget: on SKAB's anomaly-free run, Quiet on all 8 sensors sent 8.54 alert lines
per 100 checks, all false, and a budget split could not help because Quiet is already the floor of the ladder. A column
screen by loudness would have kept the sensors that caught nothing (pressure, voltage, current) and risked dropping flow
rate, which caught 29 of 33 faults alone. So this round tested a rule on the whole watch instead: send a message only when
at least two columns date a change within 12 points (60 s) of each other. Independent noise rarely lands on the same
point twice; a fault on a machine usually moves more than one sensor. `agreeAlerts` (watch-core.mjs) is the rule;
`sh eval/skab-fetch.sh skab-data && node eval/watch-skab-agree.mjs skab-data` runs the round (output
`eval/watch-skab-agree.out.txt`, 1,233 s on 4 cores). The rule, design and predictions were committed in this PR's
second commit, before any scored run. It is a second look at a seen set: round 12's per-column output was known, which
columns' alerts coincide was not.

The baseline is the same lines merged into one message per change (A1, k = 1), so both arms are counted the same way.

| every column on Quiet (33 fault runs, 123 marks) | messages | at a mark | per 1,000 checks | marks reached | faults caught | median delay | normal run, per 100 checks |
|---|---|---|---|---|---|---|---|
| A1, one message per change | 238 | 31.5% | 36.1 | 81 | 31/33 | 30 s | 4.19 |
| **A2, two columns agree** | 129 | 37.2% | 19.6 | 54 | **22/33** | 50 s | **2.69** |
| A3, three agree | 52 | 46.2% | 7.9 | 30 | 12/33 | 58 s | 1.13 |
| A2 on Middle | 312 | 25.6% | 47.4 | 88 | 31/33 | 45 s | 4.41 |
| A2 on Drift | 286 | 26.2% | 43.4 | 83 | 28/33 | 50 s | 2.58 |

- **T9 fails on two of three parts.** (a) the normal run still sent 2.69 messages per 100 checks, over the budget of 2;
  (b) A2 caught 22 faults against A1's 31 (the rule allowed losing 2); (c) its share at a mark rose, 37.2% against 31.5%.
  As pre-registered, nothing ships: `watch.mjs --help` under `--columns` and the watch page record the result.

**Predictions, scored.** (a) I predicted about 1.5 and "could fail": it failed, at 2.69. (b) I predicted 30 or more caught:
wrong, 22. The inlet-valve faults decided it: A2 caught 8 of 16, because a closed inlet valve moves the flow rate
clearly and the other sensors often do not alert within 60 s of it. (c) I predicted about 50% against 37%: it rose, but only to
37.2% against 31.5%.

**Why the noise still agrees (deciding nothing).** The pairs that completed A2's false messages on the normal run were
mostly coupled sensors: the two accelerometers (8 of the run's 50 messages), accelerometer 1
with flow rate (8), the thermocouple with flow rate (7). On a real machine the columns are not independent, so their
noise is not either. On synthetic noise (5 independent N(0,1) columns) Quiet sent one column line in 2,400 checks, so
the synthetic check could not tell the rules apart; only the real normal run could. Agreement trades away exactly the
faults a single sensor sees best. Three columns (A3) brought the normal run under budget (1.13) and caught 12 of 33.

Caveat on the baseline. A1 caught 31 faults, not round 12's 33, though it is built from the same lines: merging drops
a line whose change lies within 12 points of a change already sent, and on two runs the message already sent was dated
just before the fault's window. Both arms carry the same merging, so the rule's comparison stands.

Open: a whole-watch budget that respects sensor groups (agreement only across groups that measure different things,
named by the person who sets the watch up), or a per-column rate cap from the normal history. Neither is pre-registered.

Tests: `watch-agree.test.mjs` (7: agreement on made-up lines, k = 1 as one message per change, order and argument
checks, the round's window, T9 on made-up totals, the seeded noise, and the committed output's verdict with the help
and page texts).

## Round 14: a smallest-move floor per column from the normal history (2026-11-14, pre-registered on a seen set; fails, `auto` not offered; hand-set `--min-shift` ships)

Rounds 12 and 13 left the many-column watch over budget on SKAB's normal run, and neither eagerness, a budget split nor
agreement between columns fixed it. An operator's own answer to a loud sensor is "don't tell me about moves smaller than
X". This round tested that answer with X read off the normal history, so the person sets nothing by hand. For each
column, replay Quiet on the anomaly-free run and take the size (|level after - level before|, the move the alert message
states) of every line it sent. Then set the column's floor so that at most m = 4 of those lines clear it, its equal
share of the whole-watch budget (2 per 100 of 1,861 checks, over 8 columns). The floor sits in the watch
(`minShift`, `aboveFloor` in watch-core.mjs): a detection under it is dropped at every check, before the guards, so a
change too small at first can clear it a few points later and is then sent. The fault runs were replayed with the floor
in the watch, not filtered afterwards. The out-of-sample null is each fault run's stretch before its fault (SKAB marks
it normal; 2,997 checks over the 33 runs, recorded on other days than the normal run): every line sent before the
fault's window opens is false. `sh eval/skab-fetch.sh skab-data && node eval/watch-skab-floor.mjs skab-data` (output
`eval/watch-skab-floor.out.txt`, 800 s on 4 cores). The rule, design, predictions and the `minShift` code were committed
in this PR's second commit, before any scored run.

Floors read off the normal run: accelerometers 0.0050 and 0.0043, temperature 0.45, thermocouple 0.79, flow rate 1.67;
current, pressure and voltage sent 4 or fewer lines there and got no floor.

| every column on Quiet (33 fault runs, 123 marks) | lines | at a mark | per 1,000 checks | marks reached | faults caught | median delay | pre-fault, per 100 checks | normal run, per 100 (F in-sample) |
|---|---|---|---|---|---|---|---|---|
| Q, no floor | 457 | 36.8% | 69.4 | 97 | 33/33 | 30 s | 6.34 (190) | 8.54 |
| **F, floor in the watch** | 198 | **46.5%** | 30.1 | 74 | **28/33** | 52.5 s | **2.27** (68) | 1.93 |
| P, Q's lines with the floor applied after the fact | 165 | 46.1% | 25.1 | 62 | 22/33 | 27.5 s | 2.00 (60) | 1.34 |

- **T10 fails on two of three parts.** (a) Pre-fault false lines 2.27 per 100 checks, over the budget of 2 (Q: 6.34);
  (b) F caught 28 faults against Q's 33 (the rule allowed losing 2); (c) its share at a mark rose, 46.5% against 36.8%.
  As pre-registered, `--min-shift auto` does not ship. The hand-set `--min-shift <x>` (or `column=x,...` with
  `--columns`) ships either way, as the rule said: it is the person's own threshold, not a claim this round tested.

**Predictions, scored.** (a) I predicted Q's pre-fault rate near 8.5 and F's about 1.5: Q was 6.34, F 2.27, a fail by
0.27. (b) I predicted 31 or more caught: wrong, 28. Flow rate's floor (1.67) was set by its own normal-run moves and cut
the column's fault catches from 29 alone to 18; the inlet-valve folder went from 16 of 16 to 13. (c) I predicted about
45% against 36.8%: 46.5%.

**What the round says (deciding nothing).** The floor is the best whole-watch rule tried so far on this set: of rounds
12-14 it is the only one that cut the false lines by about two thirds out of sample (190 to 68) while keeping most
faults, and the lines it keeps sit at a mark half again as often (46.5% against 36.8%). Agreement (round 13) cut fewer
false lines and lost more faults (22 of 33). The two misses were near the line and have one cause: an equal split of the
budget gives every loud column the same 4 lines, so flow rate, the column that sees the faults, was floored as hard as
the thermocouple, which sees almost none. Temperature shows the other side: its floor (0.45) held on the normal run
(27 lines to 7), but the fault runs were recorded on other days and it still sent 67 lines there, 21% at a mark. A floor
read off one normal day does not carry to every other day. Putting the floor in the watch beat applying it afterwards
(28 faults against 22): a fault's move is often small for the first few points and clears the floor a check or two
later. That is also why F's median delay grew from 30 s to 52.5 s.

So for a loud many-column watch the advice is now concrete: set `--min-shift` by hand on the loud columns that do not
matter (here the two temperatures), and leave the column that sees the faults alone. A rule that picks floors by how
much each column matters needs labelled faults, which a person setting up a watch rarely has. Open: an unequal split
(floors on the columns whose normal-run lines are not followed by any labelled event), or floors re-read on a rolling
normal window so a new day's temperature level does not trip them. Neither is pre-registered.

Tests: `watch-floor.test.mjs` (8: the floor on made-up changes, a replay with and without a floor, `--min-shift`
parsing and refusals, the CLI with a per-column floor, the round's floor rule, pre-fault counting, T10 on made-up
totals, and the committed output's verdict with the help and page texts).

## Round 15: one floor for every column, in units of its own recent spread (2026-11-14, pre-registered on a seen set; fails on faults caught, not offered)

Round 14's floor gave each column an equal share of the budget, so flow rate, the column that sees the faults, was
floored as hard as the thermocouple, and temperature's floor, read off one day, did not carry to the fault runs' other
days. Its own suggestion, an unequal split, needs labelled faults. This round tested a label-free one: measure each move
against how much its column wandered just before it. A detection is dropped when its |shift| is under k times the
column's spread over the 60 points (5 minutes) before the change (1.4826 times the MAD, or the SD when the MAD is 0;
`minSpreadRatio`, `spreadBefore`, `aboveSpreadFloor` in watch-core.mjs). One k serves all 8 columns, read off the normal
run so that at most 37 of the whole watch's lines clear it (2 per 100 of 1,861 checks); nothing is set per column. The
floor sits in the watch at every check, as round 14's did, and the scoring, the out-of-sample null (each fault run's
stretch before its fault, 2,997 checks) and the three-part rule are round 14's. `sh eval/skab-fetch.sh skab-data && node
eval/watch-skab-spread.mjs skab-data` (output `eval/watch-skab-spread.out.txt`, 618 s on 4 cores). The rule, design,
predictions and the code were committed in this PR's second commit, before any scored run. k came out at 4.94.

| every column on Quiet (33 fault runs, 123 marks) | lines | at a mark | per 1,000 checks | marks reached | faults caught | median delay | pre-fault, per 100 checks | normal run, per 100 (in-sample) |
|---|---|---|---|---|---|---|---|---|
| Q, no floor | 457 | 36.8% | 69.4 | 97 | 33/33 | 30 s | 6.34 (190) | 8.54 |
| **R, spread floor in the watch** | 150 | **59.3%** | 22.8 | 75 | **27/33** | 50 s | **1.40** (42) | 2.69 |
| P, Q's lines with the spread floor after the fact | 105 | 67.6% | 15.9 | 66 | 24/33 | 35 s | 0.83 (25) | 1.99 |
| F, round 14's equal-split floors (quoted) | 198 | 46.5% | 30.1 | 74 | 28/33 | 52.5 s | 2.27 (68) | 1.93 |

- **T11 fails on one of three parts.** (a) passes: 1.40 false lines per 100 pre-fault checks, the first whole-watch rule
  in rounds 12-15 under the budget of 2 out of sample; (c) passes: 59.3% of its lines sat at a mark, against Q's 36.8%
  and round 14's 46.5%; (b) fails: 27 faults caught, against the 31 the rule allowed (Q 33, round 14 28). As
  pre-registered, nothing ships to the CLI; `watch.mjs --help` under `--columns` and the watch page record the result,
  and the option stays in watch-core.mjs for later rounds.

**Predictions, scored.** (b) I predicted 31 or more and more than round 14's 28: wrong on both, 27. (c) I predicted about
45%: it was 59.3%, better than predicted. (a) I called a coin flip near 2.0: 1.40, a clear pass.

**What the round says (deciding nothing).** The ratio did make the split unequal without a label, and mostly in the
right direction: temperature's normal-run lines had a median ratio of 0.64 (slow drift, about one spread) and all 27 of
them fell; flow rate kept 60 of its 118 fault-run lines, 75% of them at a mark, and caught 19 faults alone against
round 14's 18. But one column set k: the thermocouple's normal-run moves were sharp steps on a flat trace (median ratio
7.90), so 31 of its 42 lines cleared a k that the other seven columns' noise alone would have set much lower, and that
k cost the inlet-valve folder 4 of its 16 faults (12/16, against round 14's 13). The normal run's in-sample rate (2.69)
is over budget though k was read off it: k came from the lines Q sent, and with the floor in the watch a move that is
small at first can clear it a few checks later, as round 14 found. Putting the floor in the watch again caught more than
filtering afterwards (27 against 24 faults), at a longer median delay (50 s against 35 s).

So the two floors fail on opposite sides of the same bar: round 14's let too much noise through, this one cuts too many
faults. Open, neither pre-registered: k read with the loudest column's lines left out (a k for the other seven would
have been lower, keeping more valve faults), or a ratio floor only on the columns whose own normal-run lines are mostly
small ratios (drift), leaving the sharp ones to the detector. Both are second looks at the same set; a fresh labelled
multi-sensor set is still the stronger test.

Tests: `watch-spread.test.mjs` (6: the spread on made-up noise, quantized and constant stretches and the window; one k
keeping a move on a flat column and dropping it on a wandering one; a replay with the floor; the k rule and T11 on
made-up totals; the committed output's verdict with the help and page texts).

## Round 16: the spread floor with the loud column given its own k (2026-11-14, pre-registered on a seen set; fails, not offered; hand-set `--min-spread` ships)

Round 15's single k (4.94) was set by one column: 31 of the 37 normal-run lines that cleared it were the thermocouple's
sharp steps on a flat trace, and that k cost the valve faults. Its first open item was a k read with the loudest column's
lines left out. This round tested a label-free version (`loudSplit` in `eval/watch-skab-loud.mjs`): read the common k as
round 15 did; a column is loud when more than half of the normal-run lines that clear it are its own; the loudest gets
its own k, read so that at most m = floor(37 / 8) = 4 of its own normal-run lines clear it; its 4 lines leave the shared
budget and the common k is read again from the other columns, until no column is loud. Nothing is set by hand and no
label is read. Data, replay, policy, scoring, out-of-sample null (2,997 pre-fault checks) and the three-part rule are
round 15's. `sh eval/skab-fetch.sh skab-data && node eval/watch-skab-loud.mjs skab-data` (output
`eval/watch-skab-loud.out.txt`, 842 s on 4 cores; round 15's R is re-run there and matches its committed output). The
rule, design, predictions and code were committed in this PR's second commit, before any scored run.

The split took one column off: the thermocouple got k = 22.4; the other seven share k = 2.60.

| every column on Quiet (33 fault runs, 123 marks) | lines | at a mark | per 1,000 checks | marks reached | faults caught | median delay | pre-fault, per 100 checks | normal run, per 100 (in-sample) |
|---|---|---|---|---|---|---|---|---|
| Q, no floor | 457 | 36.8% | 69.4 | 97 | 33/33 | 30 s | 6.34 (190) | 8.54 |
| R, round 15's one k (re-run) | 150 | 59.3% | 22.8 | 75 | 27/33 | 50 s | 1.40 (42) | 2.69 |
| **S, loud split in the watch** | 218 | 50.5% | 33.1 | 84 | **30/33** | 35 s | **2.47** (74) | 2.90 |
| P, Q's lines with S's floors after the fact | 180 | 53.3% | 27.3 | 79 | 29/33 | 30 s | 2.04 (61) | 1.99 |

- **T12 fails on two of three parts.** (a) 2.47 false lines per 100 pre-fault checks, over the budget of 2; (b) 30
  faults caught against the 31 the rule allowed; (c) passes, 50.5% at a mark against Q's 36.8%. As pre-registered,
  `--min-spread auto` does not ship. The hand-set `--min-spread <k>` (or `column=k,...` with `--columns`) ships either
  way, as the rule said: the person's own threshold in units of the column's recent spread, not a claim this round
  tested.

**Predictions, scored.** I predicted the shared k "near 3": 2.60. (b) 30, a narrow fail: exactly that. (c) about 50%:
50.5%. (a) about 1.9, a coin flip: wrong, 2.47.

**What the round says (deciding nothing).** Splitting the thermocouple off did what it was meant to on the faults: the
valve folder went from 12 of 16 under R to 15 of 16, flow rate alone caught 25 faults (R 19, Q 29) with 70.5% of its 88
lines at a mark, and the median delay fell from 50 s to 35 s. The thermocouple went from 22 fault-run lines to 2. The
false lines came back through temperature. On the normal run its 27 lines were all slow drift (median ratio 0.64) and
none cleared even k = 2.60; on the fault runs, recorded on other days, it sent 47 lines, 17% of them at a mark. That is
round 14's finding again: the motor temperature's normal day does not describe its other days, whatever the floor is
measured in. Rounds 14-16 now bracket the bar from both sides (round 14: 28 faults, 2.27 false; round 15: 27, 1.40;
round 16: 30, 2.47), and each miss traces to one column whose normal run did not predict the fault days.

So the advice for a loud many-column watch stands and is sharper: put a hand-set floor on the slow-drifting columns that
do not matter (`--min-spread temperature=8`, or leave temperature out), and a low spread floor, about 2.5, on the rest.
Open, neither pre-registered: a floor re-read on a rolling normal window, so a new day's temperature resets it; and a
fresh labelled multi-sensor set, which remains the stronger test than another look at SKAB.

Tests: `watch-loud.test.mjs` (7: the loud split on made-up ratios, with and without a loud column; T12 on made-up totals;
`--min-spread` parsing and refusals; the CLI with a per-column and a one-column spread floor; the committed output's
verdict with the help and page texts).

## Round 17: a floor re-read on a rolling window of the same run (2026-11-15, pre-registered on a seen set; fails, not offered)

Rounds 14-16 read their floors off one anomaly-free day and applied them to fault runs recorded on other days, and each
missed the bar through a column whose normal day did not describe its fault days, mostly the motor temperature. Round 16's
open item was a floor re-read on a rolling normal window, so a new day resets it. This round tested the simplest such
floor, with nothing read from another day: tell me about a move only when it is bigger than any move the same column made
in the five minutes before it. `largestMoveBefore` (watch-core.mjs) takes the 60 points before the change and the largest
|mean of 12 points - mean of the 12 before them| over every split; `minMoveRatio` drops a detection whose |shift| is under
k times that. Unlike round 15's spread (the MAD of the points), it sees drift: a ramp of 0.1 a point reads as a move of
1.2. W, the tested arm, fixes k = 1 before the run. K (reported only) reads k off the normal run by round 15's rule
(at most 37 of the whole watch's lines clear it). Data, replay, policy, scoring and the out-of-sample null (2,997 pre-fault
checks) are rounds 14-16's. `sh eval/skab-fetch.sh skab-data && node eval/watch-skab-rolling.mjs skab-data` (output
`eval/watch-skab-rolling.out.txt`, 842 s on 4 cores). The rule, design, predictions and code were committed in this PR's
first commit, before any scored run.

| every column on Quiet (33 fault runs, 123 marks) | lines | at a mark | per 1,000 checks | marks reached | faults caught | median delay | pre-fault, per 100 checks | normal run, per 100 |
|---|---|---|---|---|---|---|---|---|
| Q, no floor | 457 | 36.8% | 69.4 | 97 | 33/33 | 30 s | 6.34 (190) | 8.54 |
| **W, rolling floor, k = 1** | 352 | 38.4% | 53.5 | 87 | **32/33** | 27.5 s | **4.67** (140) | 6.13 (out of sample) |
| K, rolling floor, k = 4.03 read off the normal run (reported only) | 134 | 55.2% | 20.4 | 64 | 29/33 | 50 s | 1.50 (45) | 2.69 (in-sample) |
| P, Q's lines with W's floor after the fact | 312 | 39.4% | 47.4 | 83 | 31/33 | 25 s | 4.27 (128) | 5.37 |

- **T13 fails on one of three parts.** (a) 4.67 false lines per 100 pre-fault checks, far over the budget of 2;
  (b) passes, 32 faults caught against the 31 allowed; (c) passes, 38.4% at a mark against Q's 36.8%. As pre-registered,
  nothing ships to the CLI; `--columns`'s help and the watch page record it, and the option stays in watch-core.mjs.

**Predictions, scored.** (b) 32 caught: exactly. (c) about 45%: 38.4%, a pass but by less. (a) about 3.0, a fail: it
failed, and worse, at 4.67. The normal run, about 4 predicted: 6.13. K's k, near 2 predicted: 4.03, catching 29 (28
predicted).

**What the round says (deciding nothing).** The idea behind the round was wrong about temperature. Its fault-run lines are
not drift that a same-day window would explain: their median move was 1.07 times the largest move in the five minutes
before, so 68 of 97 cleared k = 1, and only 16% of them sat at a mark. On the normal day its lines were smaller than its
recent wander (median 0.70) and half fell. The thermocouple shows the same in reverse: its normal-day lines were sharp
steps, 6.3 times its recent moves, while on the fault days its lines were 1.37. So on this testbed the columns behave
differently on different days in ways no one-day reading, fixed or rolling, picks up. A rolling window at k = 1 is close
to no floor at all on noisy columns (white noise reads about 0.9 sd), which is why the accelerometers kept most of their
lines. With k read off the normal run (K), the rolling floor sits where rounds 14-16 sat: 1.50 false lines per 100 and
29 of 33 faults, between round 15 (1.40, 27) and round 16 (2.47, 30). Five rounds of label-free floors now bracket the
bar without meeting it; the trade between false lines and faults looks set by the data, not the floor's form.

So the advice for a loud many-column watch does not change: replay first, drop or hand-floor the columns that do not
matter (the two temperatures here), and leave the one that sees the faults alone. Open: a fresh labelled multi-sensor set
(the stronger test, now overdue), or a floor named per sensor group by the person who sets the watch up. More floor shapes
on SKAB are not worth a sixth round.

Tests: `watch-rolling.test.mjs` (5: the move reading on a step, a ramp, a constant stretch and white noise; the floor
keeping a step and dropping a drift-made move, in a replay; T13 on made-up totals; the committed output's verdict with the
help, page and llms.txt texts).

## Round 18: the label-free floors on a fresh multi-sensor set, SMD's 28 servers (2026-11-15, pre-registered on unseen data; all three fail)

Rounds 14-17 tried four label-free floors for a loud many-column watch on SKAB, and every one missed the three-part bar
narrowly, from both sides. Round 17 closed with "a fresh labelled multi-sensor set (the stronger test, now overdue)".
This is that test. The Server Machine Dataset (SMD; Su et al. 2019, KDD, "OmniAnomaly"; github.com/NetManAIOps/OmniAnomaly,
MIT, fetched and not committed) holds 28 servers of a large internet company, 38 metrics each, one row a minute for
about five weeks: a train half with no labels, which the benchmark treats as normal, and a test half with 327 labelled
anomaly segments. Nobody here had scored it. `sh eval/smd-fetch.sh smd-data && node eval/watch-smd.mjs smd-data` (output
`eval/watch-smd.out.txt`, 5,361 s on 4 cores). The rule, design, predictions and code were committed in this PR's
second commit, before any run that printed a score.

**Design.** Hourly buckets (a timing-only pilot: 30-minute buckets would have cost about 8 times as much). The 862
metrics that vary over the first half of a machine's train half are watched, 27-34 a machine, under the shipped Quiet
policy, replayed after every point. Each floor's k is read per machine, by its own round's rule, off Quiet's lines on
the first half of the train half, at a whole-watch budget of 2 lines per 100 checks (3-4 lines a machine). The
out-of-sample null is the second half of the train half (other days, 5,899 whole-watch checks): every line sent there
counts false. The test halves are scored from point 24 (one day of baseline); a segment's window is its hours plus one
each side; 309 segments start after the baseline. The arms are Q (no floor), R (round 15's one spread k), S (round 16's
loud split) and K (round 17's rolling move floor with k read off the setup lines). Round 14's equal split was left out:
with about 30 columns its per-column share is 0 lines.

| every metric on Quiet (28 test halves, 309 segments) | lines | at a mark | per 1,000 checks | segments caught | under 60 min / longer | median delay | null, per 100 checks |
|---|---|---|---|---|---|---|---|
| Q, no floor | 10,039 | 23.5% | 902.8 | **290** | 204/222, 86/87 | 4 h | 75.79 |
| R, one spread k (round 15) | 522 | 35.2% | 46.9 | 88 | 38, 50 | 5 h | 3.05 |
| S, loud split (round 16) | 679 | **38.7%** | 61.1 | 106 | 52, 54 | 5 h | 4.25 |
| K, rolling move floor, k read (round 17) | 300 | 35.3% | 27.0 | 42 | 15, 27 | 4 h | **1.24** |

Chance for "at a mark" is 12.4% (the share of scored hours inside a segment window).

- **T14 fails for all three arms.** Every arm fails (b) by a wide margin: the rule allowed losing 17 of Q's 290 caught
  segments, and the arms lost 184 to 248. R and S also fail (a), at 3.05 and 4.25 false lines per 100 null checks; K
  passes (a) at 1.24. All three pass (c): their lines sat at a segment 35-39% of the time, against Q's 23.5%.
  As pre-registered, nothing ships: `--columns`'s help, the watch page and llms.txt say the label-free floors missed the
  bar on a second, fresh set too, and the advice (replay first, hand floors on the columns that do not matter) stands.

**Predictions, scored.** Q's null: I predicted about 15 lines per 100 whole-watch checks. It was 75.79, five times that:
on 30 server metrics Quiet sent about three lines every four hours of normal operation. (a): I predicted a pass for all
three, about 2-4, with one or two under 2. Only K passed (1.24); R was 3.05 and S 4.25. (b): I predicted a fail for all
three, each under 80% of Q's catches. They all failed, and by far more than I predicted: 30%, 37% and 14% of Q's
catches. (c): I predicted a pass for all three, and all three passed.

**What the round says (deciding nothing).** Five floors over two labelled sets have now missed the same bar, and SMD
shows why more plainly than SKAB did. Without a floor, Quiet on a server's 30 metrics alerts at almost every hourly
check: 0.9 lines a check on the test halves and 0.76 on the normal days. It reaches 290 of 309 segments only because it
alerts nearly everywhere: its share at a segment (23.5%) is under twice chance. A budget of 2 lines per 100 checks for
the whole watch leaves 3 or 4 setup lines a machine to read a k from. Any k read that way sits in the far tail of
normal moves, so it also silences most labelled events. Two thirds of SMD's segments (222 of 309) last under an hour.
In hourly buckets they are diluted, and every floor caught few of them (K 15, R 38, S 52). On the 87 longer segments
the spread floors caught 50-54. There was one failure of mechanism, not of trade-off. On some machines a metric sits
almost constant and then steps, so the spread before the step is nearly zero and the ratio is enormous: R's k came out
at 2.7 x 10^13 on machine-3-5 and K's at 3.0 x 10^12 on machine-3-1. A spread or move floor in units of recent
wiggle is undefined in practice on step-like counters, which servers have many of. The metrics the publishers name for
a segment sent the first line that caught it 52% of the time under Q and 66% under R, so a floor did favour the
"right" metric, at the cost of most of the catches. Round 13's two-metric agreement, applied after the fact to Q's
lines, sent 6.22 false messages per 100 null checks and caught 132.

So the conclusion is stronger than "the floors narrowly miss": no label-free floor read off a normal stretch gets a
30-metric server watch near a 2-per-100 budget without losing most labelled events. The trade is set by the data and
the budget, not by the floor's shape. For the product this means three things. The watch's job on many metrics is
level changes in the few metrics a person chooses, not anomaly detection across everything on a box; the page now says
so. Hand floors and dropping columns stay the advice. And a whole-watch budget for 30 metrics should be stated per
metric-day, not per check, before anyone tunes for it. Open, not pre-registered: per-group floors named by the person
(SMD's metric names are not published, so this needs another set); a floor that skips columns that were constant
before the move; and SMD at 10-minute buckets on a few machines, to see how much of the miss is hourly dilution.

Tests: `watch-smd.test.mjs` (7: the round's constants, segments and the interpretation labels, a machine in hourly
buckets, the score on made-up lines, T14 on made-up totals, the floors' reading with a loud column, and the committed
output's verdicts).

## Round 19: SMD at 10-minute buckets on three machines, to see how much of round 18's miss is hourly dilution (2026-11-15, pre-registered; no arm meets either line)

Round 18 left open "SMD at 10-minute buckets on a few machines, to see how much of the miss is hourly dilution": two
thirds of SMD's segments last under an hour, and an hourly mean shrinks a 10-minute event to a sixth. This round runs
round 18's pipeline twice on the same three machines, chosen by name before anything was looked at (the first of each
SMD group: machine-1-1, machine-2-1, machine-3-1; 93 watched metrics, 24 scored segments), changing only the bucket:
H is hourly buckets replayed after every point (round 18 exactly), T is 10-minute buckets checked once an hour
(replayWatch's `step` of 6, each alert dated back by bisection to the point that would have sent it). The whole-watch
budget (2 lines per 100 hourly checks, so 3-4 setup lines a machine) is the same in both. The policy and the floors'
rolling windows are kept in points, as shipped. The null stretch was not run (it would have doubled a 70-minute run);
round 18 measured it under H on all 28 machines. `node eval/watch-smd-10min.mjs smd-data [cache]` (output
`eval/watch-smd-10min.out.txt`, 4,162 s on 4 cores). The rule, design, predictions and code were committed in this PR's
second commit, before any run that printed a score.

| three machines, 24 segments | H lines | H caught (under 60 min, longer) | H median delay | T lines | T caught (under 60 min, longer) | T median delay | T at a mark |
|---|---|---|---|---|---|---|---|
| Q, no floor | 1,080 | 22 (12/14, 10/10) | 4 h | 5,193 | **24** (14/14, 10/10) | **0.7 h** | 10.7% |
| R, one spread k (round 15) | 61 | 12 (4, 8) | 4.5 h | 39 | 12 (3, 9) | 1.1 h | **66.7%** |
| S, loud split (round 16) | 66 | 14 (6, 8) | 4 h | 289 | 16 (7, 9) | 0.8 h | 32.2% |
| K, rolling move floor (round 17) | 19 | 4 (1, 3) | 4.5 h | 62 | 9 (1, 8) | 1 h | 24.2% |

Chance for "at a mark" is 11.2% under H and 6.3% under T (the windows are a bucket wide each side, so they shrink with
the bucket). H reproduced round 18's by-machine catches for every arm (Q 8/11/3, R 4/7/1, S 4/9/1, K 2/2/0).

- **D19 (under T an arm keeps Q's catches less 6%) is not met by any arm**: R 12, S 16 and K 9 against the 23 needed.
- **D19' (an arm's kept share of Q's catches rises 20 points from H to T) is not met either**: R went from 55% to 50%,
  S from 64% to 67%, K from 18% to 38% (19.3 points, one short).
- As pre-registered, nothing changes for the product: finer buckets did not rescue the floors on these machines, and
  round 18's reading (the miss is set by the data and the budget, not the bucket) stands.

**Predictions, scored.** H reproduces round 18: right, exactly. Q under T catches about as many: right (24 of 24, from
22). No arm meets D19: right. R and S meet D19': wrong for both; R's kept share fell and S's rose 3 points. K does not
meet D19': right, by 0.7 points.

**What the round says (deciding nothing).** The short segments are not where finer buckets help the floors. Under T the
floors caught 3, 7 and 1 of the 14 segments under an hour, against 4, 6 and 1 under H. What T changes is the long
segments and the delay: the floors caught 8-9 of the 10 longer ones (3-8 under H), and every arm's median delay fell
from 4-4.5 hours to 0.7-1.1 hours, because a step is seen within a few 10-minute points rather than after several
hourly ones. Without a floor, T's Quiet is far louder: 408 lines per 100 hourly checks (85 under H), with 10.7% at a
mark against chance 6.3%, so on 30 server metrics it alerts on almost every 10-minute wiggle. The k's read off the
finer setup lines are higher (R's 91 against 43 on machine-1-1, and 3,780 on machine-2-1, where a step-like counter
had a near-zero spread before its step, round 18's failure of mechanism again), so a short event in a busy metric
still sits under the floor. So the honest summary for a person: on server metrics, finer data makes the watch faster
on the changes it does catch (a quarter of the delay), not able to catch short spikes under a budget. Short spikes are
anomaly detection, which this watch does not claim. Three machines and 24 segments is a small sample; the delay
finding is the one worth testing on the other 25 machines with the null, if anyone runs a server watch on finer data.

Tests: `watch-smd-10min.test.mjs` (4: the round's constants, a machine in 10-minute buckets with its windows and
baseline, D19 and D19' on made-up totals including the tie, and the committed output's verdicts).

## Long series from outside TCPD: TSSB's 75 labelled series (2026-11-15, pre-registered; the headline fails off its domain)

Every default here was chosen on TCPD, whose series are 15 to 991 points. The flagship asked for long labelled series
from outside it. The Time Series Segmentation Benchmark (TSSB; Ermshaus, Schäfer and Leser 2023, Data Mining and
Knowledge Discovery, doi 10.1007/s10618-023-00923-x; BSD-3 code, pinned commit e0c7a1f) has 75 series of 240 to 20,700
points (359,497 in all, 190 annotated changes) and publishes each method's per-series covering. Each TSSB series is
UCR classification instances grouped by class, **each instance z-scored**, and concatenated, so a labelled change is
mostly a change of **shape** at an unchanged level and spread: outside what this detector models. The round therefore
asks whether the shipped settings stay quiet off their domain. The lines, settings (exactly `eval/tcpd-heldout.mjs`'s)
and predictions were committed before any run (`eval/tssb-prereg-2026-11-15.md`).
`sh eval/tssb-fetch.sh tssb-data && node eval/tssb.mjs tssb-data` (output `eval/tssb.out.txt`, 2.4 min on 4 cores; the
data is not committed). The metric port is checked against the published sheet: on all 75 series a published method
that cut nothing scores exactly this port's "zero" covering.

| 75 series | cover | F1 margin 5 | cuts per 1,000 points |
|---|---|---|---|
| ClaSP (published, a shape method) | 0.855 | | |
| PELT / BinSeg as TSSB ran them (published) | 0.581 / 0.575 | | |
| zero (no change) | **0.401** | 0.513 | 0 |
| **every-setting consensus (the page's "Agreed changes")** | **0.344** | 0.414 | 1.6 |
| level following the over-cut warning | 0.304 | 0.349 | 9.2 |
| level+volatility | 0.235 | 0.189 | 26.9 |
| BOCPD detections | 0.165 | 0.119 | 31.4 |
| consensus, half or more | 0.156 | 0.139 | 7.2 |
| level (plain) | 0.094 | 0.086 | 123.5 |

- **T1 fails: the agreed changes do harm here.** Every-setting covering 0.344 against zero's 0.401 (bar 0.381):
  -0.057, 95% bootstrap interval -0.099 to -0.022, worse on 15 series and better on 1. 59 of 75 series get no agreed
  change at all (so they score exactly zero's), but 16 get 579, of which 7 (1%) are within one TSSB window of a
  labelled change. Most of those 16 are repeating waveforms (ECG, EOG, gun-point and trace gestures, freezer and
  olive-oil spectra): all six settings cut the same peaks, so they agree, and agreement is no evidence of a change. Two
  of them (UMD, DodgerLoopDay) have no labelled change and get 31 and 23.
- **T2 holds:** the over-cut warning fires on 61 of 75. **T3 holds:** following it beats the plain level model on 59 of
  those 61 (+0.258 covering, interval 0.199 to 0.320), as on TCPD; it still loses to zero (-0.097).
- **T4 fails:** the consensus is 0.237 below published PELT, not within 0.05. The pre-registration assumed TSSB's PELT
  scored near "no change"; it scores 0.18 above it (on Crop 0.987), so TSSB's runs found shape changes a mean-shift
  cost does not see (the paper gives its competitors' settings; they are not re-run here).
- **Predictions, scored:** T1 met: wrong. T2, T3 met: right. T4 met: wrong (the assumption above). Consensus near zero:
  wrong by 0.057. No setting within 0.15 of ClaSP: right. Plain level worst, under 0.35: right (0.094). BOCPD over-cuts
  and scores below zero: right (0.165).

**The existing cycle warning does not mark these series** (`node eval/tssb-cycle.mjs tssb-data`, output
`eval/tssb-cycle.out.txt`, run after the verdicts, deciding nothing): of the 15 series with 10 or more agreed
changes it fires on 3. What does mark them is the count. TCPD's 31 shipped series got 59 agreed changes between them
and the 7 held-out at most 12 on one series; here 14 series get 23 to 50, near the panel's ceiling (changes are merged
within 2% of the length, so about 50 at most). A guard on "many agreed changes, evenly spread" is the candidate for a
next, separately pre-registered round, to be checked on TCPD (where it must stay quiet) and a fresh set.

**What changes now.** As pre-registered, this round only measures; no default moves. The limits (here, on the page and
in `llms.txt`) now say that a change of shape at an unchanged level and spread is outside what this detector finds,
that on long repeating waveforms the agreed changes can be the cycle itself, and name a shape method (ClaSP) for that
job. Tests: `tssb.test.mjs` (5: desc parsing, the pinned round, single-annotator covering, every setting on a made-up
step, and the committed output's four verdicts).

## Many agreed changes spread through a series: a guard, and a fresh activity set (2026-11-15, pre-registered; fails two of three lines, not offered)

The TSSB round above found the page's headline ("every setting agrees on these changes") scoring below "no change" on
long repeating waveforms, and named a guard on "many agreed changes, evenly spread" as the next round. Fixed before it
ran on anything (`eval/repeat-guard-prereg-2026-11-15.md`): the guard (`consensus.mjs` `repeatGuard`) fires on 15 or
more every-setting changes falling in at least 8 of the series' 10 equal tenths; when it fires, the series is scored as
reporting no agreed change. Three sets: TSSB (seen: the guard was designed on its counts), TCPD's 38 univariate series
(it must stay quiet) and a **fresh** labelled set, the Human Activity Segmentation Challenge 2023 (HAS; 250 smartphone
recordings of people moving through routines of activities, 1.93 M points, 785 labelled activity changes; CC BY-NC-SA,
fetched by `eval/has-fetch.sh` with a pinned sha256, never committed), read as the accelerometer magnitude.
`node eval/repeat-guard.mjs tssb-data tcpd-data has-data` (output `eval/repeat-guard.out.txt`, 10 min on 4 cores).

| covering (one annotator) | TSSB, 75 | HAS 2023, 250 (fresh) |
|---|---|---|
| zero (no change) | 0.401 | 0.444 |
| every-setting consensus (the page's headline) | 0.344 | **0.619** |
| guarded every-setting | **0.403** | 0.611 |
| guard fires on | 14 (all repeating waveforms) | 31 |

- **G1 holds (seen set).** On TSSB the guard fires on exactly the 14 series with 23 or more agreed changes, holding 568
  of the 579 agreed changes; guarded covering 0.403 against zero's 0.401 (+0.059 over unguarded, better on 14, worse on 0).
- **G2 fails.** It fires on one TCPD series, `bank` (30 agreed changes). The pre-registration's premise, "TCPD's most on
  any one series is 12", was wrong: 12 was the held-out seven's most; the shipped 31 were not checked per series. (Post
  hoc, deciding nothing: `bank` has no annotated change, so firing there would raise its score.)
- **G3 fails (fresh set).** On HAS the guard costs 0.008 covering (bar -0.005; 95% interval -0.020 to 0.003) and is worse
  on 20 of the 31 series where it fires, better on 11. Repeated motions (steps, jumps, sit-ups) do produce evenly spread
  agreed changes, but a routine of several activities spread through a recording does too, and there the agreed
  changes carry real ones: on has-195 (8 labelled changes) dropping them takes covering from 0.743 to 0.117. Count and
  spread alone cannot tell the two apart. The count-only arm (descriptive) is worse still: 0.587.
- **Predictions, scored:** G1 met: right. G2 met: wrong (the premise above). G3 met: wrong. Fires on 10 to 60 HAS series:
  right (31). Consensus above zero on HAS: right.

**The finding that matters more: on a fresh set nearer the detector's domain the headline holds.** HAS's activity
changes move the level and spread of the accelerometer magnitude, and there the every-setting consensus beats reporting
no change by +0.175 covering (95% 0.142 to 0.207; better on 160 series, worse on 32), with 1.15 cuts per 1,000 points;
24% of its 2,220 agreed changes lie within 2% of the length of a labelled change. Following the over-cut warning lifts the
plain level model from 0.131 to 0.492. This is the third labelled set the agreed-changes headline has been scored on
(TCPD held out F1 0.711, TSSB covering 0.344 below zero, HAS 0.619 above zero), and it is the first fresh one of over a
million points.

**What changes now.** As pre-registered, nothing ships: `repeatGuard` stays in `consensus.mjs` for the eval, uncalled by
`consensus()`. The limits keep saying that many evenly spread agreed changes on a long periodic signal can be the cycle,
now with the counter-case: on a routine of activities they can be real. A next guard would need a reading of the
waveform between cuts (are the segments the same shape repeated?), not their count or spread. Tests:
`repeat-guard.test.mjs` (7: the thresholds, firing and quiet cases, the tenth at the end, `consensus()` without the
warning, the HAS line parser, the committed verdicts and the HAS headline).

## Agreed changes that are the same waveform repeated: a shape check, and a fresh fourth set (2026-11-15, pre-registered; fails one of four lines, not offered)

The count-and-spread guard above failed on HAS because a routine of activities spreads agreed changes through a
recording just as a repeating waveform does, and the round ended asking for "a reading of the waveform between cuts".
This round is that reading. Fixed before it was computed on any series (`eval/shape-repeat-prereg-2026-11-15.md`), the
check (`consensus.mjs` `shapeRepeats`) cuts the series at the every-setting changes, reduces each segment of 4 or more
points to a 32-point z-normalised shape, calls two segments a match when their lengths are within 1.5x and their shapes
correlate at 0.8 or more, calls a segment a repeat when it matches 2 or more others, and drops an agreed change when the
segments on both sides of it repeat. Nothing reads labels or a period. Four sets: TSSB (seen), TCPD's 38 univariate
series, HAS 2023 (seen) and a **fresh** one, the UCR Semantic Segmentation Benchmark (UTSA; Gharghabi et al., ICDM
2017; 32 real physiological and mechanical repeating signals of 2,000 to 40,000 points with one or two labelled regime
changes; fetched by `eval/utsa-fetch.sh` with a pinned sha256, never committed).
`node eval/shape-repeat.mjs tssb-data tcpd-data has-data utsa-data` (output `eval/shape-repeat.out.txt`, 2.2 min on 4
cores once the TSSB and HAS detections are cached).

| covering (one annotator) | TSSB, 75 | HAS 2023, 250 | UTSA, 32 (fresh) |
|---|---|---|---|
| zero (no change) | 0.401 | 0.444 | 0.512 |
| every-setting consensus (the page's headline) | 0.344 | 0.619 | 0.458 |
| shape-filtered every-setting | 0.365 | **0.620** | **0.522** |
| agreed changes dropped (series touched) | 113 of 579 (11) | 21 of 2,220 (7) | 176 of 301 (5) |

- **S1 fails (TSSB, seen).** Shape-filtered 0.365 against a bar of 0.381 (zero minus 0.02). It helps on all 11 series it
  touches (+0.021, 95% 0.008 to 0.037; worse on none) but drops only a fifth of the agreed changes: on most of TSSB's
  waveforms the six settings cut at slightly different phases of each cycle, so neighbouring segments differ in length
  or shape and do not count as repeats. The count guard, which drops everything, reached 0.403.
- **S2 holds (TCPD).** F1 0.704 to 0.703, covering 0.653 to 0.656. It drops 8 of `bank`'s 30 agreed changes (bank has
  no labelled change) and 1 of `bitcoin`'s 12, which costs bitcoin F1 0.570 to 0.521: the one loss anywhere in the round.
- **S3 holds (HAS, seen).** +0.001 (95% 0.000 to 0.001), better on 6, worse on 0; it drops 21 of 2,220 agreed changes,
  so the routines of activities that broke the count guard keep their real changes.
- **S4 holds (fresh UTSA).** +0.064 (95% 0.015 to 0.124), better on all 5 series it touches, worse on none. Those five
  (gun-draw motion, pig airway and arterial pressure, tilt-table ABP and ECG) are long repeating signals where the
  headline listed 34 to 50 agreed changes against one labelled one; the filter drops 23 to 47 of each. Covering rises
  from 0.04-0.12 to 0.24-0.67.
- **Predictions, scored:** S1 met: wrong. S2, S3 met: right. S4 met: right, but it touched 5 UTSA series, not 10 to 25
  (so S4 was one series from "not informative"). UTSA consensus below zero: right (-0.054, interval -0.136 to 0.026;
  6 of 301 agreed changes lie within the file's window of a labelled change).

**What it shows.** On the three long-series sets (357 series) it made covering worse on none; on TCPD it cost one
series (`bitcoin`) one true change. It is a safe but timid filter: it catches the waveforms whose
cycles every setting cuts at the same phase and misses the rest. Post hoc (deciding nothing): every series it touched
on TSSB, UTSA and 6 of 7 on HAS is one where the count guard also fires, so the two read the same thing from
different sides, the count guard too eagerly, the shape check too cautiously.

**What changes now.** As pre-registered, a failed line means nothing ships: `shapeRepeats` stays in `consensus.mjs`
for the eval, uncalled by `consensus()`, and the page's headline is unchanged. Also fixed: `eval/repeat-guard.mjs`
read `consensus().repeatWarning`, which `consensus()` no longer sets, so a rerun reported G2 met; it now calls
`repeatGuard` itself and reproduces the committed output. The next candidate, to be pre-registered on a fifth
labelled set (none of TSSB, HAS or UTSA may decide it): segments matched with a tolerance for phase (a lag search or
cross-correlation), or the count guard confirmed by the share of segments that repeat. Tests: `shape-repeat.test.mjs`
(8: the settings, segment shapes, a sawtooth whose cuts all drop, a staircase that keeps all, the length rule, that
`consensus()` does not call it, the UTSA name parser, the committed verdicts).

## Clumpy counts that grow: the clumping size read against the local level (2026-11-15, pre-registered twice; round 2 ships)

`--overdispersion nb` needs the negative binomial's size r, and `negbinSize` estimated it by comparing the median squared
first difference with the series' **global** mean. On counts whose level moves a lot that is wrong in one direction: the
typical local spread belongs to a typical local level, far below the global mean squared, so r came out too large, and on
steep growth (rate 7 to about 700) it came out Infinity. Infinity means "not clumpy", so the NB path quietly ran the plain
Poisson cost, steps soaked up the growth, and the bend landed at the edge of the scan. That is why only 14% of the steep
cell's bends were located before (2026-11-08 entry above, "Steep-bend range, replicated"), and why the range under them
was short (80%).

The new `negbinSize` reads each difference against the mean of the 7 points around it. Under NB2 a pair at level m has
E d^2 = 2 (m + m^2 / r), so with z = d^2 / (2 (m + c m^2)) it solves mean min(z, 6.635) = 0.9813 for c = 1 / r (the cap is
chi-square(1)'s 99th percentile, so a step's few big differences do not set the size; 0.9813 is E min(chi-square(1), cap)),
and calls the series Poisson unless the mean at c = 0 clears 0.9813 by two standard errors. The old estimator stays as
`negbinSizeGlobal` for comparison. Bars written first: `eval/nb-size-local-preregistration.md`.

- **Round 1 failed.** The same idea with a median instead of the capped mean held the size and the false-bend bars, but
  plain Poisson counts at rate 10 read as clumpy on 32 of 100 (bar: at most 10): at small counts d^2 takes a few lattice
  values and the median jumps. Not shipped.
- **Round 2, fresh seeds, all five bars hold** (`eval/nb-size-local.mjs 9501 9502 9503`, `eval/nb-size-local.out.txt`;
  steep cell `eval/nb-size-local-steep.out.txt`):

| 200 clumpy counts, lognormal sd 0.35 (true size 7.67) | global-mean size (before) | local size (now) |
|---|---|---|
| median size, no bend / bump 0.015 / 0.025 / 0.04 | 8.6 / 31 / 123 / Infinity | 8.2 / 8.2 / 8.4 / 8.6 |
| Poisson counts read as Poisson, rate 10 / ramp 7 to 700 | 95 / 100 of 100 | 99 / 100 of 100 |
| steep bend (bump 0.04) located within 20 points | 81 of 500 (16%) | **280 of 500 (56%)** |
| ... and its 95% range holds the true knot | 58 of 81 (72%) | **278 of 280 (99%)** |
| straight growth 0.02 per point: a bend kept | 11 of 100 | 0 of 100 |
| straight growth 0.02 per point: step changes per series | 1.86 | 0.08 |

- **Real series (bar 5).** 739 of 747 tests passed unchanged. The 8 that moved are pinned counts on real series, all
  toward fewer changes, because the old size was too large wherever the level moved: bike-share days (size 58 before, 32
  now, raw counts), Wikipedia "Payroll" views (45 to 27), UK lung deaths (104 to 59). No documented date was lost: the
  Ansett 1989 stop and restart are found in every setup (23 and 24 other changes, was 37 and 30), the stop's range holds
  on 29 of 30 routes as before, and the fewest changes outside the closure on any route fell from 8 to 4. UK lung deaths
  (no documented step) lose the 1979-10 cut. Payroll 47 to 26 changes (45 to 25 with holidays). US births: the holiday
  list still removes changes in every year (239 to 205 before, 205 to 179 now). Bike-share at period 7: 56 to 30 changes,
  and the holiday factor no longer adds any (61 before). One pinned observation reversed: at period 365 bike-share goes
  134 to 29 changes, and the holiday list now adds changes there (29 to 36) instead of removing them.
- **Milder bends too (measured after, not a bar).** On the earlier held-out seeds 3 and 11 (bumps 0.015, 0.025, 0.04, 100
  series each; `eval/growth-change-interval-nb-local-size.out.txt`) bends found went from 114 to 301 of 600 and the range
  held 299 of them (99%, was 107 of 114, 94%). The 1.4 temper was not retuned, so the ranges are now probably wider than a
  95% range needs; the note under them says 99% and says so.
- **Not checked.** A real count series with a documented steep slope break (still wanted, as before); clumping that
  itself changes with the level (NB1-like, variance proportional to the mean), which a single r cannot describe.


## Clumping that grows with the level: an NB1 cost and a law check (2026-11-16, pre-registered; ships)

`--overdispersion nb` uses the NB2 law, variance mu + mu^2 / r with one size r. Counts that arrive in batches of a
typical size clump in proportion to their level instead (NB1, variance phi mu), and on a series whose level moves a
lot one r cannot describe that: it overstates the spread where the level is high and understates it where it is low,
so the low stretch sprouts changes. Measured first (`eval/nb1-probe.mjs`, `eval/nb1-probe.out.txt`): on NB1 counts
(phi 3) ramping 100-fold with `--trend bend` and no change, the NB2 cost gave 0.38 to 0.68 false changes per series,
4 to 7 times what it gives when its law is right; the quasi-Poisson route (`--overdispersion`) was worse everywhere,
up to 8 per series on NB2 ramps.

**What shipped.**

- `--overdispersion nb1` (CLI, API `overdispersion: "nb1"`, the page's counts box): the NB1 negative-binomial
  likelihood, size lam e_t / delta per point (delta = phi - 1), with `--period` and `--trend` exposures as `nb` has.
  The segment's rate has no closed-form maximum, so the moment estimate is polished by a Newton step on the exact
  score (digamma, trigamma), warm-started along PELT's scan; within 1e-3 of a brute-force grid (`nb1.test.mjs`).
  It costs about 2.5 times `nb` with `--trend bend` (1.3 s against 0.5 s on 200 points). The Bayesian pass has no
  NB1 conjugate, so it tempers the Poisson likelihood by phi there.
- `nb1Dispersion`: phi read against each point's local 7-point level, the same capped-mean equation `negbinSize` uses
  for NB2 (so growth is not read as clumping), and phi 1 unless Poisson is rejected by two standard errors.
- `clumpingLaw` and the output's `clumping` field: both laws fitted to the same differences; the right law leaves the
  scaled differences equal on the lower and upper halves of the level. It says `nb1`, `nb2` or `either` (the level
  spans under 3 times, or neither is clearly worse). When the other law fits better, `clumpingWarning` says which
  setting to use, on the page and in the report.

**Pre-registered bars, fresh seeds, run once** (`eval/nb1-preregistration.md`, `eval/nb1.mjs 9701 9702 9703 9704`,
`eval/nb1.out.txt`; 100 series of 200 counts per cell):

| | NB2 cost (`nb`) | NB1 cost (`nb1`) |
|---|---|---|
| NB1 phi 3, ramp 7 to 700, false changes per series | 0.45 | **0.19** |
| NB1 phi 3, ramp 2 to 200, false changes per series | 0.47 | **0.15** |
| NB1 ramp with a x1.6 step: found within 5 points | 100 of 100 | 100 of 100 |
| ... other changes per series | 0.50 | 0.47 |
| NB2 r 8 ramps, false changes per series (no bar) | 0.15 / 0.12 | 3.50 / 2.67 |

The law check said `nb1` on 94 of 100 NB1 ramps in each cell (the rest `either`, never `nb2`) and `nb2` on 100 of 100
NB2 ramps. phi came out 2.91 (flat) and 3.00 (ramp) against the true 3, and plain Poisson ramps read phi 1 on 97 of 100.

**Read with care.** The wrong law costs more in the NB1-on-NB2 direction (3.5 false changes against 0.45 the other
way), so `nb` stays the default clumpy-count cost and `nb1` is opt-in, with the law check to say when to take it. Two
changes were made on development seeds before the run (the Newton polish, and a bug in the trend fit that subtracted
an exposure term the NB1 likelihood already holds: a bend won on 8 of 8 straight ramps until it was fixed); they are
listed in the pre-registration. On development seeds the 2-to-200 cell read 0.30 against the 0.2 bar; the bars were
not moved, and the pre-registered run decided. Remaining false changes are short bursts and short runs of zeros on
series whose phi comes out low. Not checked: a real count series known to clump in proportion to its level (call
centre arrivals in batches, insurance claims per event; real call-centre arrivals were checked on 2026-11-16 and turned out
Poisson around a wandering rate, see the next section), and the law check under a season (it reads the raw counts).
Tests: `nb1.test.mjs` (6: the special functions, the cost against a grid with and without exposures, phi on flat and
growing counts, the law check both ways and on a flat series, analyze's output and hint, a flat series kept whole).

## Two changes of slope: a second hinge for the short sticky series (2026-11-16, pre-registered; ships as `--two-hinge-test`)

"Step or bend?" and "The hinge test on the logs" ended the same way: `--hinge-test` refused 7 of 8 real series under
100 points because the residuals about its best single bend stayed sticky (rho 0.71-0.95), and a second hinge was the
route both named. `two-hinge.mjs` (`twoHingeTest`) is the same procedure with two knots: `x = a + b t + c1 (t - k1)+
+ c2 (t - k2)+` plus AR(1) noise, a sup-F with 2 and n - 4 degrees of freedom over knot pairs (each knot 15% from either
end, the two at least 15% of n apart), rho from the best OLS pair's residuals, Prais-Winsten GLS, and a bootstrap from
the GLS straight line. The guard is the one-hinge `cut` guard with the random-walk bar recomputed for two hinges (0.90
at n 39, 0.82 at 40, 0.65 at 55, 0.64 at 60, 0.40 at 95: two bends cut a walk's stickiness much more than one does).
The scan precomputes the Gram matrix of the hinge columns, so a pair costs a 2 x 2 solve; 499 replicates on 145 points
take about 1.3 s, and 300 points (the cap) about 8 s. Bars, predictions and the decision rule were committed before any run
(`eval/two-hinge-prereg-2026-11-16.md`; development seeds 900,000+ looked at once for speed, not reused).
`node eval/two-hinge-sim.mjs 300 99 size <n>` (`eval/two-hinge-sim-size.out.txt`, seeds from 64,000,000),
`node eval/two-hinge-sim.mjs 300 99 power` (`eval/two-hinge-sim-power.out.txt`), `node eval/two-hinge-real.mjs`
(`eval/two-hinge-real.out.txt`, 999 replicates).

**Size (S1) and unit roots (S2): all 21 cells hold** (share of all series with p <= 0.05, refusals counted as not
rejecting; cap 8%):

| n | line + AR(1) rho 0 / 0.3 / 0.6 / 0.8 | AR(1) 0.9 / 0.95 / random walk with drift |
|---|---|---|
| 40 | 5.7% / 4.3% / 7.3% / 4.7% | 2.7% / 3.7% / 2.3% |
| 60 | 4.7% / 7.0% / 5.3% / 2.7% | 1.3% / 2.7% / 1.7% |
| 95 | 3.3% / 5.0% / 5.3% / 2.3% | 0.7% / 1.0% / 2.0% |

**Power (P): holds.** Flat to n/3, rising 0.25 a step to 2n/3, flat after, rho 0.5, on the same series:

| cell | two hinges | one hinge (shipped) | difference |
|---|---|---|---|
| n 60, rise 0.25 (bar: at least 10 points) | 30.7% (224 tested) | 7.3% (224 tested) | **+23.3** |
| n 95, rise 0.25 (reported) | 46.3% (144 tested) | 1.7% (77 tested) | +44.7 |
| n 60, rise 0.15 (reported) | 17.0% | 7.7% | +9.3 |

**Real series: 6 of 7 predictions hold, and the motivating ones are still refused.**

| series | n | two hinges | one hinge | prediction |
|---|---|---|---|---|
| R1 Australian gas, annual | 39 | refused: line 0.97, two 0.47, cut bar 0.90 | refused | refused: holds |
| R2 US electricity, annual | 40 | refused: line 0.82, two 0.49, cut bar 0.82 | refused | refused: holds |
| R3 US female murder rate | 55 | refused: line 0.97, two 0.68, cut 0.29 against 0.65 | refused | tested, p <= 0.05: **fails** |
| R4 Canada fertility | 38 | refused: line 0.92, two 0.61, cut bar 0.93 | refused | refused: holds |
| C Lake Huron / Michigan-Huron | 98 / 92 | refused (two 0.71 / 0.78) | refused | refused: holds |
| G GCAG 1880-2024 | 145 | knots 1904 and 1985, p 0.002; -0.26 -> 0.62 -> 2.27 degrees per century | 1976, p 0.001 | knot in 1965-1985: holds |
| CO2 annual means (reported) | 67 | refused: line 0.97, two 0.77 | refused | |
| Nile (reported) | 100 | knots 1892 and 1907, p 0.019, a slope of -18.6 a year between | 1913, p 0.017 | |

**Verdict: ships.** S1, S2 and P hold, so the decision rule puts it in `analyze({ twoHingeTest })`, the CLI
(`--two-hinge-test`) and the page ("Also test two changes of slope"), 30 to 300 points. On a series the shipped test
already admits, it finds two-bend shapes the one-hinge test misses (the plateau: 31% against 7% at n 60). It does
**not** rescue the short sticky series it was built for. Two hinges do take their stickiness down (gas 0.83 to 0.47,
fertility 0.77 to 0.61, murder rate 0.80 to 0.68), but two hinges take a random walk's down by about as much, so the
random-walk bar rises with them and the cut never clears it under 60 points. That is the guard working: S2 at n 40 is
at most 3.7%, and a rule loose enough to admit the gas series would admit walks. Under 60 points, these series need
outside information (a documented break date, which would fix the knots and remove the search) rather than another
shape. GCAG's pair dates the early-century warming's start and the late acceleration; 1976 sits between 1904 and 1985
as one hinge's compromise. The Nile result is the familiar warning: two close knots make a 15-year plunge that stands
in for the 1898 drop, and the note says so.

**Use it.** CLI `--two-hinge-test`; `analyze({ ..., twoHingeTest: true })` returns `twoHingeTest: { index1, index2,
label1, label2, f, bar95, p, rho, slopes: [before, between, after], significant, note }` or `{ refused, reason }`; with
`--log` it runs on the logs. Test: `two-hinge.test.mjs`. **Next** (not run): a hinge test with the knot or knots given
by the user (a documented date: no search, so a far smaller null and a looser guard), which is the remaining route for
the 39-55 point series.

## The clumping-law check on real call-centre arrivals (2026-11-16, pre-registered; fails its bar by abstaining, nothing changed)

The NB1 section left open "a real count series known to clump in proportion to its level". This is the first real
one: `fpp2::calls`, five-minute calls handled by a large North American bank, 164 weekdays of 169 slots from
3 March 2003 (`data/bank-calls-5min.csv`, `data/SOURCE.md`). The reference law was read across days, which the
check never sees: a weekday-by-slot profile times a day level, then the mean of (y - E)^2 / E by decile of E
(`eval/calls-law-preregistration.md`, written before any check ran; `node eval/calls-law.mjs`,
`eval/calls-law.out.txt`).

| | Pre-registered | Result |
|---|---|---|
| Reference law | `nb2`, `nb1` or `unclear` by a fixed rule | `nb1`: top / bottom decile 0.83, bottom 1.60 |
| L1: check says `nb1` on at least 99 of 164 days | | **0 of 164: fails** |
| L1/L2: check says `nb2` (a wrong warning) on at most 16 | | 0 of 164: holds |

`clumpingLaw` said `either` on every day and `nb1Dispersion` read phi 1 (Poisson) on 161 of 164. The level inside a
day spans 2.16 times (median, upper half against lower), under the check's 3. Both NB costs gave the same changes
on the first five whole weeks with `--period 169` (7 to 13 a week, 0.1 s each), with no warning.

**Why, post hoc (not pre-registered; `eval/calls-law-posthoc.mjs`, `eval/calls-law-posthoc.out.txt`).** The
pre-registration named this weakness in advance: a profile that differs from the fitted one leaves residuals that
look like clumping. That is what happened. Pooled over all 27,552 within-day first differences, d^2 / (2m) is 1.005,
Poisson to the third digit, so adjacent five-minute counts do not clump. The across-day residuals are correlated
inside a day (lag 1: 0.31), and their dispersion grows with the block they are summed over: 1.34 at 5 minutes, 2.18
at 15, 3.25 at 30, 5.17 at an hour, 8.02 at two hours. Independent clumping would stay flat. So these arrivals are
Poisson around a rate that wanders slowly away from the weekday profile, the doubly stochastic picture of the
call-centre literature, and the reference's "NB1" was that wander, not batches.

**What it means for use.** On counts like these the law check abstaining is the right answer, and the NB costs add
nothing over plain Poisson. The 7 to 13 changes a week are the wandering rate cut into steps, not clumping. Nothing
in `clumpingLaw` was changed (decided in advance: one series does not retune it). Still open: a real series that does
clump in batches (insurance claims per event, orders per basket), and, for wandering rates on counts, a drift model
like "Wandering level" (the mean model has one) for the Poisson cost. Test: `calls-law.test.mjs` (2: the reference
reads `nb1` by the pre-registered rule; the check says `either` on all 164 days and a week run warns nothing).


## The AR(1)-plus-floor lead on fresh labelled data: five bee dance sequences (2026-11-16, pre-registered; fails, a muted-column note ships)

On TCPD's three multi-column series the joint level fit with an AR(1) long-run sd and a floor of 2 on every column
scored best (mean F1 0.564), but it was not the primary there, so it was recorded as a lead to test on fresh
multi-column labelled data. The bee dance set (Oh et al. 2008, via KL-CPD's BSD-3 repository; `data/SOURCE.md`) is
that: six tracked dances, three columns each (x, y, heading), 602 to 1124 frames, with 15 to 28 labelled switches
between left-turn, right-turn and waggle phases. Sequence 6 is TCPD's `bee_waggle_6` (seen, and TCPD's annotators
marked 2 changes where this set marks 15), so only 1 to 5 enter the rule. The settings (the six of
`eval/tcpd-multi-floor.mjs`, now shared through `eval/tcpd-multi-floor-settings.mjs`), the primary and the rule were
committed in `eval/beedance-multi.mjs` before any score: the lead confirms if (1) it has the best mean F1 of the six,
(2) it beats the column consensus and (3) it beats `floor auto` on at least 4 of the 5. `node eval/beedance-multi.mjs`
(output `eval/beedance-multi.out.txt`), F1 at margin 5, TCPDBench definitions:

| joint level fit | bee 1 | bee 2 | bee 3 | bee 4 | bee 5 | mean F1 | cover | cuts | bee 6 (seen) |
|---|---|---|---|---|---|---|---|---|---|
| plain | 0.204 | 0.242 | 0.248 | 0.283 | 0.319 | 0.259 | 0.242 | 101-165 | 0.281 |
| floor auto (default) | 0.354 | 0.306 | 0.340 | 0.357 | 0.328 | 0.337 | 0.443 | 35-61 | 0.231 |
| floor 2, every column | 0.354 | 0.310 | 0.340 | 0.357 | 0.328 | 0.338 | 0.447 | 35-60 | 0.231 |
| floor 1, every column | 0.279 | 0.299 | 0.376 | 0.262 | 0.436 | 0.330 | 0.343 | 65-103 | 0.342 |
| ar1 per column | 0.296 | 0.316 | 0.400 | 0.308 | 0.446 | **0.353** | 0.480 | 7-91 | 0.337 |
| **ar1 + floor 2 (primary)** | 0.273 | 0.245 | 0.111 | 0.267 | 0.327 | 0.244 | 0.446 | 0-25 | 0.150 |
| columns: every setting (consensus) | 0.375 | 0.217 | 0.111 | 0.250 | 0.255 | 0.242 | 0.469 | 0-27 | 0.324 |
| zero (no changes) | 0.095 | 0.083 | 0.111 | 0.105 | 0.067 | 0.092 | 0.056 | 0 | 0.118 |

- **The lead fails.** (1) not met: plain AR(1) has the best mean F1 (0.353); (2) met, by 0.002 over the consensus;
  (3) not met: it beats `floor auto` on 0 of 5. It is the worst joint setting here bar none, and on bee 3 it reports no
  change at all against 16 labelled.
- **Why: the two corrections stack until a column goes silent.** The floor already raises a smooth column's sd, and the
  AR(1) long-run sd multiplies it again by sqrt((1+rho)/(1-rho)), which grows without bound as rho nears 1. A bee's
  position is a smooth path (rho near 1), so a column scaled to [0, 1] got a noise sd of 1.07 to 1.88: no move inside
  its own range can pay the penalty, and the segmentation came from the remaining columns or from none.
- **No setting does well on this set.** Every joint fit cuts 35 to 165 times except the two with AR(1) + floor; the best
  mean F1 is 0.353 against 16 to 28 labels. Unlike TCPD's three series, where "no change" scored 0.621,
  this set labels many changes, so "zero" scores 0.092 and every method clears it. Published methods were not rerun.
- **Nothing in the defaults changes.** The joint default stays `floor auto` whatever this showed (decided in advance:
  a floor on every column costs most of the power on small shared steps in white noise, `eval/multi-floor-sim.mjs`).

**What ships: a muted-column note.** `mutedColumns` in `multivariate.mjs` names any column whose noise sd the floor
or the AR(1) correction raised to more than 3 times the column's own whole-series sd, and `analyzeMulti` returns it
as `mutedWarning` ("Read with care") in the CLI text, the page and the branded report. The plain sd is never flagged
(a column with no change has a plain sd close to its whole-series sd). The 3 was set after this run and checked on
simulations, not tuned on the bees (`node eval/muted-sim.mjs`, output `eval/muted-sim.out.txt`, 300 columns per
cell): under the default it fires on no column of white noise, AR(1) at rho 0.5 or 0.9, random walks or smooth sines;
under AR(1) + floor 2 it fires on no white-noise column, but on 282 to 296 of 300 autocorrelated or random-walk columns,
which is what that option does to them. On the bees it names x on 1 and 2, x and y on 3, y on 4, nothing on 5, and
nothing under the default. The page's option now reads "fewest cuts; can mute autocorrelated columns".

Not done: the heading column wraps at the scale's edge and was left in as distributed (it is noisy enough that no
setting mutes it); TCPD's three series were not rerun for the note (the TCPD files are fetched, not committed);
published methods (bocpd, KL-CPD) were not rerun on 1 to 5. Next for (a): a per-column trend term instead of a blunt
floor, or the AR(1) correction alone (best here, 0.353) on a sixth fresh multi-column set before it is anything more.
Tests: `beedance-muted.test.mjs` (3: the rule fails with the committed numbers; white noise never flagged under the
default or a floor of 2; bee 3 under AR(1) + floor 2 names x and y in the text and the default names nothing).

## A date you name: five pre-registered rounds; round 5 ships as `--known-date` (2026-11-16)

The question: a law, launch or price change happened on a date fixed before anyone looked at the chart; did the
level or the slope change there? That is an interrupted time series (segmented regression; Wagner et al. 2002,
Bernal, Cummins and Gasparrini 2017). The module `known-date.mjs` fits a line, a step and a slope change at the
given date (plus seasonal dummies with a period), AR(1) noise by iterated Prais-Winsten, and calibrates the joint
F and both t statistics with a parametric bootstrap from the null fit. A 95% range for the step and the slope
change uses the bootstrap's 97.5th percentile of |t|. The bar to ship (CLI `--known-date`, the page, the engine)
was size within 2-8% at p 0.05 in every synthetic cell plus four real predictions. Rounds 1-3 were too eager in
short sticky series; round 4 fixed that and became too cautious in one cell; **round 5 (below) met every bar and
ships in the CLI** (`--known-date <label>`, with `--period` and `--log`; on the page and in `analyze({ knownDate })`
since round 6). Series that only the random-walk cut lets through are reported as not calibrated (round 5, "after the run").

| Round (pre-registration) | Generator rho; guard | Worst size cells (of series tested) | Random walks rejected (of all) | Real A-D |
|---|---|---|---|---|
| 1 (`eval/known-date-prereg-2026-11-16.md`) | Kendall-corrected, capped at the guard; full-model residuals | n 40 rho 0.8: 13.6% (date at 50%), 8.9% (80%) | 18.0% (n 40), 10.8% (n 120) | all met |
| 2 (`...-round2-2026-11-16.md`) | matched by indirect inference, capped at 0.95; same | n 40 rho 0.8 date 80%: 9.2% | 5.0%, 8.7% | (not rerun) |
| 3 (`...-round3-2026-11-16.md`) | matched; plus the hinge test's random-walk cut guard | n 40 rho 0.8 date 80%: 9.4%; n 60 rho 0.8: 8.9% | 1.3%, 1.0% | all met |
| 4 (`...-round4-2026-11-16.md`) | round 3, plus a 90% upper bound for rho; the larger p of the two | every cell 1.1-5.9% (max n 60 rho 0.8); **n 40 rho 0.4 date 80%: 1.8%, under the 2% floor** | 0.3%, 1.0% | all met |
| 5 (`...-round5-2026-11-16.md`) | round 4's upper bound only when the line rho is above 0.5 | every cell 1.0-5.8%; rho 0 / 0.4 cells 3.3-5.8% | 0.3%, 0.5% | all met; **ships** |

400 series per cell, 199 replicates; outputs in
`eval/known-date-sim-round1.out.txt`, `-round2`, and `eval/known-date-sim.out.txt` (round 3). Every other size cell
in round 3 was 3.8-7.3%, and as a share of *all* series (refusals count as no rejection) no cell rejected more than
7.3%: the excess is among the short sticky series the guard lets through, whose rho reads low.

**Real series, 999 replicates** (`eval/known-date-real.out.txt`, round 3's code; round 1's in `-round1`):

- A. UK car drivers killed or seriously injured, logs, monthly seasons, date 1983-02 (the front-seat belt law of
  31 January 1983): step -0.237 (a 21% fall), range -0.354 to -0.119, p 0.001; slope change p 0.13. Met.
- B. Front-seat passengers: step -0.309 (27%), p 0.001. Met.
- C. Rear-seat passengers, whom the 1983 law did not cover (the control): step +0.043, range -0.080 to 0.165, p 0.50.
  Met. The joint test is significant (p 0.006), because the slope after 1983 rises in all three series by the same
  0.007 a month: whatever moved the post-law trend was not the belt law, which is why a control series matters.
- D. Nile flow, date 1899 (after the 1898 Aswan dam): step -289, range -436 to -143, p 0.001; slope change p 0.90. Met.
- E. Placebo dates on Nottingham temperatures (1925, 1930, 1935): p 0.30, 0.39, 0.97.

**What a reader can use now.** The F table (what a regression package reports) is far too eager on autocorrelated
data even with the AR(1) correction: on straight lines with rho 0.4 it rejected 13-15% of 40-point series at p 0.05,
and with rho 0.8 11-30% at every length (round 3 table). The bootstrap brings every 120-point cell to 3.8-6.8%.

### Round 4: an upper bound for rho fixes the eager cells and overshoots (2026-11-16, pre-registered; fails one line)

Round 3's excess came from short sticky series whose rho reads low, so the bootstrap drew too-tame nulls. Round 4
(`eval/known-date-prereg-round4-2026-11-16.md`, written after a 200-series exploratory run on seed base 333 and before
the confirmatory run on fresh base 13000) adds one thing: a one-sided 90% upper bound for rho by test inversion (the
grid rho whose simulated 10th-percentile estimate reaches the observed one, 200 null series per design, cached), a
second bootstrap at that rho, and the larger p and wider range of the two: a two-point version of a maximised Monte
Carlo test (Dufour 2006; Berger and Boos 1994). The exploratory run already showed it conservative, so before the
confirmatory run the 2% size floor was restricted to the eight rho 0 and 0.4 cells and two power lines were added.
`node eval/known-date-sim.mjs 400 199 upper` (`eval/known-date-sim-round4.out.txt`):

| Bar (pre-registered) | Round 3 | Round 4 | |
|---|---|---|---|
| 1a. size at most 8% of tested, 12 cells + n 60 rho 0.8 | worst 9.4% | worst 5.9% (n 60 rho 0.8); n 40 rho 0.8 date 80%: 3.7% | holds |
| 1b. size at least 2% in the eight rho 0 / 0.4 cells | (all met) | n 40 rho 0.4 date 80%: **1.8%** (7 of 391); date 50%: 2.3% | **fails** |
| 2. random walks rejected, share of all | 1.3%, 1.0% | 0.3%, 1.0% | holds |
| 3. power, step 1 sd, n 120: rho 0 at least 55%, rho 0.4 at least 20% | 64.8%, 26.0% | 62.8%, 27.3% | holds |
| 4. real series A-D (`eval/known-date-real-round4.out.txt`) | met | met (seat belts: step -0.237, p 0.001; rear-seat control p 0.50; Nile -289, p 0.001; placebos 0 of 3) | holds |

Reported without a bar: n 60 rho 0.9, 7.3% of tested (round 3: 24.5%). The price is power on short series: a step of
1 sd at n 40 is found 15.8% of the time with white noise (round 3: 19.3%) and 4.8% with rho 0.4 (9.3%), where the
test now rejects less often under the change than its nominal size under none. At n 120 power is near round 3's.

**Reading.** The over-eager cells are gone at every length and stickiness tried, and the real predictions hold, but
at n 40 the upper bound is far above the truth even at rho 0.4 (40 points carry little information about rho), so
the two-point maximum spends the error budget on a worst case that rarely holds. By its own pre-registration nothing
ships. **Next round** (fresh pre-registration and seeds): use the upper bound only when the guard's line-residual rho
is above a value fixed in advance (where round 3 failed), or a Berger-Boos p (the maximum over the bound's interval
plus its gamma) with a narrower 1-gamma; either way state the 2% floor for every cell again. The CLI wiring
(`--known-date <label>` with a plain-text report) was written in this session and taken out when the bar failed.

### Round 5: the upper bound only where the line rho is high (2026-11-16, pre-registered; ships as `--known-date`)

Round 4's two-point test spent the error budget on rho 0.4 series at 40 points, where the 90% upper bound sits far
above the truth. Round 5 (`eval/known-date-prereg-round5-2026-11-16.md`, committed on its own before the
confirmatory run) runs it only when the plain line's residual rho (OLS, bias corrected, the guard's own reading) is
above **0.5**, and round 3's matched-rho bootstrap alone otherwise (`rhoGenMethod: 'gated'`). The gate was chosen on
an exploratory run (seed base 21000, 200 series; `eval/known-date-gate-explore.mjs`, `.out.txt`) that kept each
series' line rho and both p-values, so gates 0.3-0.7 were scored on the same series: 0.7 let n 60 rho 0.9 back to
11.8%, 0.5 and 0.6 differed little, and 0.5 is the safer. The 2% floor stays on the eight rho 0 and 0.4 cells, not
every cell as round 4's note suggested: where the gate fires the test takes a maximum of two p-values, the
exploratory run showed 1.0-1.2% in two rho 0.8 cells under any gate at or below 0.6, and a floor there would be a bar
set to fail; a power bar on the short rho 0.4 series (3b) takes its place.
Confirmatory run on fresh seed base 25000: `node eval/known-date-sim.mjs 400 199 gated`
(`eval/known-date-sim-round5.out.txt`), real series `node eval/known-date-real.mjs gated`
(`eval/known-date-real-round5.out.txt`):

| Bar (pre-registered) | Round 4 | Round 5 | |
|---|---|---|---|
| 1a. size at most 8% of tested, 12 cells + n 60 rho 0.8 | worst 5.9% | worst 5.8% (n 40 rho 0 date 50%); n 60 rho 0.8: 4.3% | holds |
| 1b. size at least 2% in the eight rho 0 / 0.4 cells | 1.8% (n 40 rho 0.4 date 80%) | lowest 3.3% (same cell) | holds |
| 2. random walks rejected, share of all | 0.3%, 1.0% | 0.3%, 0.5% | holds |
| 3a. power, step 1 sd, n 120: rho 0 at least 55%, rho 0.4 at least 20% | 62.8%, 27.3% | 64.0%, 24.3% | holds |
| 3b. power, step 1 sd, n 40, rho 0.4: at least 5% | 4.8% | 10.4% | holds |
| 4. real series A-D | met | met: drivers step -0.237 (range -0.354 to -0.119), joint p 0.003; front -0.309, p 0.001; rear-seat control step p 0.50; Nile -289, p 0.001; placebos 0 of 3 | holds |

Power on 40 points came back: a 1 sd step at rho 0 is found 20.8% of the time (round 4: 15.8%), a slope change
9.0% (6.3%). The seat-belt series are sticky about a plain line (rho 0.62 and 0.66), so both bootstraps ran on them;
the rear-seat control and the Nile were below the gate.

**After the run: series passed only by the cut are not calibrated** (not pre-registered; a diagnosis,
`node eval/known-date-cut-admitted.mjs`, `eval/known-date-cut-admitted.out.txt`). Reported without a bar, n 60 rho
0.9 rejected 23.6% of the 55 series it tested (round 4: 7.3% on other seeds; 3.3% of all 400, since most are
refused). Replaying round 5's eight sticky null cells on the same seeds and splitting tested series by how they
passed the guard: those the line checks pass were rejected 0.7-4.9% in every cell (n 60 rho 0.9: 2 of 41); those
passed only by the random-walk cut were rejected **17 times in 26**. The cut admits a sticky series when a step at
the date makes its residuals much less sticky, and a spurious step that does that is just what the F test then
finds. The pre-registered rule is unchanged, but the CLI marks these results `calibrated: false` and its text says
"NOT A CALIBRATED TEST HERE", with the 17 of 26. None of the real series A-D took that path. **Next:** a bootstrap
that conditions on admission (simulate the null, apply the same guard, take the p among admitted replicates), and
the page and engine wiring.

### Round 6: a bootstrap conditioned on the cut is calibrated and blind (2026-11-17, exploratory then replicated; not shipped)

Round 5's diagnosis left one question: a series the line checks would refuse, let through only because a step at the
date cuts its stickiness more than random walks are cut, gets a p that ignores that selection. The textbook answer is
to condition on it (selective inference; Lee, Sun, Sun and Taylor 2016 for the lasso): simulate the null, keep only the
replicates the same guard lets through the same way, and take the p among those. `knownDateTest(..., { cutConditional:
true })` does that by Monte Carlo (admission runs 2-4% of null draws, so it draws until 199 are admitted, up to 200
times that many; 0.2-0.5 s a series). `eval/known-date-conditional.mjs` screens thousands of simulated series per cell,
keeps the first 40 the cut admits, and scores round 5's test and the conditional one on the same series.

Not pre-registered: the first run (seed base 41000, `eval/known-date-conditional-explore.out.txt`) was meant to pick
settings, and it showed the idea cannot ship whatever the settings, so the same script was rerun unchanged on fresh
seeds (base 45000, `node eval/known-date-conditional.mjs 4000 40 199`, `eval/known-date-conditional-replicate.out.txt`)
to fix the numbers the CLI and page quote:

| Series the cut lets through (fresh seeds) | admitted | round 5's p <= 0.05 | conditional p <= 0.05 |
|---|---|---|---|
| no change: AR(1) rho 0.8-0.95, n 40-120, and random walks (10 cells) | 306 | **77.5%** | 4.9% |
| a real step of 2-4 innovation sd at the date (5 cells) | 156 | 91.0% | **2.6%** |

Both rows matter. Round 5's p flags no-change series 77.5% of the time and real steps 91.0%: on this path it barely
tells them apart, worse than the 17 of 26 the round-5 diagnosis saw. The conditional p is calibrated (4.9%, cells
0-7.5%, walks 5.0-12.5%) but flags real steps less often than no-change series. The reason is the selection itself:
what admits a series is a step at the date cutting its stickiness, and that is the same evidence the F test reads, so
once you condition on it nothing is left to test. Two variants, scored on 25 series per cell
(`eval/known-date-conditional-sticky-explore.out.txt`, `-walkgen-`, `-sticky-walkgen-`), did no better.
Conditioning only on "sticky about a line" kept round 5's rates (60% no change, 92% step 4 at n 60). Adding a
random-walk generator to the full conditioning took walks to 12% and power to 0.

**What ships:** the test reaches the page ("Test a date you name") and `analyze({ knownDate: label | { date, reps,
seed } })`, with round 5's settings and the CLI's fields plus `calibrated` and `significant` (never true on a
cut-admitted series). The CLI and page warnings now quote 237 of 306 against 142 of 156. `cutConditional` and
`cutWalkGen` stay in `known-date.mjs` as off-by-default options, for reproducing the table. Tests:
`known-date-page.test.mjs`. **Next:** a test for this path needs evidence the guard does not use: a control series
(the rear-seat passengers did this job for the seat-belt law), or several dates across series. A slower route is a
likelihood ratio of "step at the date" against "random walk" that is scored on its own, not after the cut.

**Use it.** `node cli.mjs data.csv --column deaths --known-date 1983-02 --period 12 --log` (the label is the first
row after the change; `--json` for the fields: `step`, `stepRange95`, `pStep`, `slopeChange`, `pSlope`, `p`,
`pTable`, `effectAverage`, `effectAtEnd`, `gated`, `rhoGen`, `calibrated`). Tests: `known-date.test.mjs`,
`known-date-cli.test.mjs`, `known-date-page.test.mjs`. On the page: type the label in "Test a date you name".

### A control series: sharper and calibrated in simulation, but a placebo check on real data fails (2026-11-17, pre-registered; not shipped)

Round 6 left one route for the sticky series the cut lets through: evidence the guard does not use, such as a control
series the change should not touch (comparative interrupted time series; Lopez Bernal, Cummins and Gasparrini 2018,
Int. J. Epidemiol. 47(6), 2082-2093). `knownDateTest(x, k, { control, controlMode: 'difference' })` runs round 5's test
on the series minus the control (on logs, their ratio), so a trend change or a wander both share cancels. A second
arm, the control as a regressor with a free coefficient (`controlMode: 'regress'`), was dropped after exploration: the
control's own noise shrinks the coefficient (errors in variables), and with a shared slope change it flagged 18.0% of
100 no-change pairs (`eval/known-date-control-explore-regress.out.txt`).

Pre-registration `eval/known-date-prereg-control-2026-11-17.md`, committed before the confirmatory run (seed base
67000, 400 pairs, 199 replicates; `eval/known-date-control-confirm.out.txt`, the treated series alone in
`-confirm-plain.out.txt`) and before the real placebos (`node eval/known-date-control-real.mjs`,
`eval/known-date-control-real.out.txt`):

| Bar (pre-registered) | With the control (difference) | The treated series alone (round 5) | |
|---|---|---|---|
| 1. size 2-8% of tested, five cells: common AR(1) 0.5-0.9 or a common random walk, some with a shared step or slope change at the date | 4.0, 5.5, 7.8, 3.3, 4.8% | 11.5, 22.6, 20.0, 5.5, 9.3% | holds |
| 2. at least 90% of pairs tested | 396-400 of 400 | 215-400 of 400 (the walks refused) | holds |
| 3. power, a treated-only step of 2 sd, share of all pairs: at least 40, 35, 10% and above the series alone | 55.8, 52.3, 10.5% | 10.8, 19.8, 4.3% | holds |
| 4a. seat belts, drivers minus rear-seat passengers, 1983-02 (seen in development) | step -0.277 (range -0.359 to -0.196), p 0.001; slope change -0.0002, p 0.95 | step -0.237, slope change +0.0066 | holds |
| 4b. front minus rear (seen) | step -0.360, p 0.001; slope change p 0.86 | step -0.309 | holds |
| 4c. **placebo**: drivers minus rear before the law, dates 1974-01, 1977-01, 1980-01; at most 1 of 3 with p <= 0.05 | **3 of 3** (joint p 0.018, 0.003, 0.002) | | **fails** |
| 4d. placebo: male minus female lung deaths 1974-79, dates 1976-01, 1977-01; at most 1 of 2 | 1 of 2 (p 0.033, 0.116) | | holds |

By its own rule nothing ships: the CLI, engine and page wiring written in this session was taken out, and `control`
stays in `known-date.mjs` as an off-by-default option for reproducing the table (`known-date-control.test.mjs`).
A control on another scale (cell S6, control = 2 x the common part, reported without a bar) was flagged 27.0% of the
time: a difference only cancels what both series carry in the same units, which is why logs matter.

**Why the placebo failed** (after the run, not pre-registered; `node eval/known-date-control-placebo-diag.mjs`,
`eval/known-date-control-placebo-diag.out.txt`). Three things together. (i) 1974-01 was a poor placebo: the 1973-74
fuel crisis is a real step in drivers, front and rear alike (each p 0.001 on its own), and the ratio still moved
(slope change p 0.011). (ii) The drivers-to-rear ratio is almost free of short-run noise (rho -0.05 to -0.01 against
0.27-0.52 for drivers alone), so the test is far sharper, and a slow bend in the ratio before 1983 that drivers alone
hide in their noise is now enough to flag: at 1977-01 and 1980-01 drivers alone give p 0.81 and 0.83, drivers minus
rear 0.003 and 0.002. (iii) The steps at the placebo dates are small and mostly not significant (p 0.68, 0.11, 0.055):
the slope term carries the rejections. So the control did its job on noise and shared shocks, and exposed that a
straight line is the wrong baseline for this ratio over 14 years. The seat-belt step itself is no weaker for it
(a 24% fall in the ratio, range 18-30%), but a test whose placebos fire cannot be called calibrated here.

**Next** (a fresh pre-registration, and real pairs not seen here): an in-time placebo check that ships beside the test
(the same test at dates in the before-period; refuse or warn when they fire), or a step-only test with the control,
since the steps passed every placebo (0 of 5 at p 0.05, real pairs 4c and 4d); and real pairs beyond road deaths, such as a policy that
covered some regions and not others.

### In-time placebos: a warning beside the test when the line before your date is not a line (2026-11-17, pre-registered; ships)

The control round above ended asking for "an in-time placebo check that ships beside the test". This is it, for the
shipped one-series test: `placeboCheck(x, k, { period })` in `known-date.mjs` runs the same test (round 5's settings,
199 replicates) on the points before your date only, at up to three dates spread through that before-period (each with
`8 + period` points on both sides), where the event you named cannot act. It **warns** when 2 or more of the tested
placebo dates give joint p <= 0.05. It is a warning beside the result; it does not change the named-date p. This is
the "falsification" check of the interrupted-time-series tutorials (Lopez Bernal, Cummins and Gasparrini 2017).

Pre-registration `eval/known-date-prereg-placebo-2026-11-17.md`, committed after an exploratory run (seed base 81000,
100 series, `eval/known-date-placebo-explore.out.txt`) and before the confirmatory run (fresh seed base 87000, 200
series per cell, `eval/known-date-placebo-confirm.out.txt`; `KD_SEED_BASE=87000 KD_SHARD=i/4 node
eval/known-date-placebo-sim.mjs 200 199`) and the real series (`node eval/known-date-placebo-real.mjs`,
`eval/known-date-placebo-real.out.txt`):

| Bar (pre-registered) | Confirmatory | |
|---|---|---|
| 1. false warnings at most 8% of tested, 14 straight-line cells (n 40-240, rho 0-0.8) and a real 2 sd step at the date | 0-4.0% (the step cell 1.0%) | holds |
| 2. warnings: a quadratic bend of 8 sd, n 120, rho 0, at least 70%; an earlier 3 sd shock, n 240 / n 120, rho 0, at least 80% / 25% | 91.5%; 92.5% / 44.5% | holds |
| 3. among the named-date test's false rejections (bends and earlier shocks, no change at the date), at least 25% warned | 677 of 1,830 (37.0%) | holds |
| 4. drivers / rear-seat ratio before 1983-02 warns (seen); Nile before 1899 and Nottingham before 1935-01 and 1930-01 do not | ratio 3 of 3 fired, warns; Nile 0 of 3, Nottingham 0 of 3 twice | holds |

**What it catches and what it cannot.** Where the before-period itself bends or carries an earlier shock, the warning
comes up often (bends 15-91.5% at n 120, earlier shocks 8.5-92.5%; stickier noise hides more). Where the series bends
mostly *after* the date (a quadratic with the date at the middle of 240 points), the named-date test fires 59-100% of
the time with nothing at the date and the placebos warn only 3.5-19%: they see only the before-period. So no warning is
not a clean bill; a control series or a look at the after-period is still the check for that.

**Real series** (reported without a bar): drivers alone before the 1983 belt law, 1 of 3 (1973-05, the fuel crisis)
and no warning; front-seat passengers 2 of 3 and rear-seat passengers 2 of 3 both warn, which agrees with the control
round's reading that the joint test on those series partly reads a slope shared by all three. Australian cafe turnover
before the July 2000 GST would warn (2 of 2), but the named date is refused (a wander) so no placebos are reported;
quarterly cement is refused at every date.

**Use it.** Nothing to switch on: `--known-date` prints an "In-time placebos" line (and a WARNING line when it fires);
`--json` has `placebo: { dates: [{ label, p }], tested, fired, warn }`; `analyze({ knownDate })` has the same field
(`knownDate: { date, placebo: false }` leaves it out), and the page adds a sentence to "Test a date you name". Tests:
`known-date-placebo.test.mjs`.

### The step alone, with a control series: calibrated in simulation, refused on real state pairs (2026-11-17, pre-registered; not shipped)

The control round above failed only on its placebo dates, where the joint test read a slow bend in the drivers-to-rear
ratio through its slope term; the step's own p fired at none of the five. So this round keeps the statistic and changes
the decision: with a control, a **finding** is the step's p (`pStep`, in the model that still fits a slope change) at
0.05 with the in-time placebos, run on the same difference, not warning. Pre-registration
`eval/known-date-prereg-control-step-2026-11-17.md`, committed after an exploratory run (seed base 91000,
`eval/known-date-control-step-explore.out.txt`) and before the confirmatory run (fresh base 97000, 400 pairs a cell,
`eval/known-date-control-step-confirm.out.txt`) and before any real pair was tested. The real pairs are new to this
tool: state cigarette tax rises (CDC's *Tax Burden on Tobacco*, 1970-2019, `data/us-cigarette-packs-per-capita.csv`),
each state's packs per head against the mean of Abadie, Diamond and Hainmueller's (2010) 38 donor states, on logs.

| Bar (pre-registered) | Confirmatory | |
|---|---|---|
| 1. step size 2-8% of tested, six no-change cells (n 31-120, shared slopes, steps and walks) | 4.3-6.8% (joint p 4.0-7.3%) | holds |
| 2. findings at most 8% where only the treated series bends or turns (six cells, no step) | 0-5.3%; the date-at-80% bends: step p fired 44.0% and 41.0%, the placebos warned 176 of 176 and 160 of 164 | holds |
| 3. power, findings as a share of all pairs: P1 55%, P2 50%, P3 20%, P5 30%, and the step above the joint p | 65.5, 60.8, 24.0, 40.0% (joint 51.3, 49.5, 14.0, 14.0%) | holds |
| 4. placebos warn at most 8% in the no-change cells | 1.3-4.3% | holds |
| 5a. California, Proposition 99, 1989: a fall found | **refused** (the log ratio about a line has rho 0.98; the cut at 1989 is 0.67 against a walk bar of 0.72) | **fails** |
| 5b. Massachusetts 1993, Arizona 1995, Oregon 1997: 2 of 3 found | **0 of 3: all three refused** as wanders | **fails** |
| 5c. nine placebo states (state tax unchanged FY1985-FY1995), 1989: at most 1 of 9 found | 1 of 9 (Tennessee, +8.9%, step p 0.007); 7 of the 9 refused | holds |

By its own rule nothing ships, and `control` stays an off-by-default option of `known-date.mjs`. In simulation the rule
does what it was built to do: as calibrated as the joint test, more powerful wherever the change is a step (a 2 sd step
at n 40 found 24% of the time against 14%), and the bends that fool the step are the ones the placebos see. The real
pairs failed for a reason the simulation did not contain.

**Why the real pairs were refused** (after the run, not pre-registered; `node eval/known-date-control-step-real-diag.mjs`,
`eval/known-date-control-step-real-diag.out.txt`). The simulated pairs share a wander that the difference removes
exactly and leave AR(1) noise at rho 0.4; a real state's share of national cigarette sales wanders on its own
(cross-border buying, smuggling, demographics). Across all 38 donor states against the other 37 over 1970-2000, the
log ratio about a straight line has a median bias-corrected rho of 0.76, and 26 of 38 are above the guard's 0.7 for
series under 100 points; about the before-and-after lines at 1989, 14 of 38 still are. On 31 annual points the guard
cannot tell such a ratio from a random walk, and that is a correct refusal, not a fault to tune away. With the guard
switched off (not a calibrated test), California's ratio shows a step of -5.6% (step p 0.051) and a slope change of
-0.033 a year (p 0.002): Proposition 99's effect grows over the decade, as in Abadie et al.'s synthetic-control
estimate, so even uncensored a step-only rule would set aside the part of the effect a tobacco programme produces.
Massachusetts and Oregon stay above 0.7 about their own before-and-after lines; Arizona shows -6.9% (p 0.14).

**What a reader can use now.** A control series and a named date make a sharp test only where the control removes the
wander, and a state against a national average on annual data usually does not: check the ratio's own stickiness first
(this tool's refusal says it for you). **Next** (fresh pre-registration): monthly or quarterly state series, where 31
years are 124-372 points and the guard reads rho on enough data; a synthetic control (weights fitted on the
before-period, Abadie et al. 2010) instead of a plain mean; and, for programmes rather than one-off price changes, a
test of the effect's path (the slope change) with the placebo warning, since that is where the real effect sat.

### A synthetic control: Proposition 99's published gap, but California ranks third (2026-11-17, pre-registered; not shipped)

The step-alone round ended asking for "a synthetic control (weights fitted on the before-period, Abadie et al. 2010)
instead of a plain mean". `synthControlTest(y, donors, k)` in `synth-control.mjs` builds one: weights at least zero and
summing to one, fitted so a mix of donor series tracks the treated series over every point before your date
(accelerated projected gradient on the simplex), and the gap after the date is the estimate. The test is Abadie,
Diamond and Hainmueller's (2010) in-space placebo: each donor is fitted the same way as if it were treated, and the
treated series' ratio of after-date to before-date root mean squared gap is ranked among them, p = rank / (donors + 1).
It matches on the outcome only, no covariates. A fit warning says when the treated series is matched worse before the
date than 80% of the donors are.

Pre-registration `eval/synth-prereg-2026-11-17.md`, committed after an exploratory run (seed base 11000,
`eval/synth-explore.out.txt`) and before the confirmatory run (fresh base 13000, 400 panels a cell,
`eval/synth-confirm.out.txt`) and before any real state was fitted (`node eval/synth-real.mjs`,
`eval/synth-real.out.txt`):

| Bar (pre-registered) | Confirmatory (400 panels a cell) | |
|---|---|---|
| 1. size, p <= 0.05 at most 6% and p <= 0.10 at most 14%, five no-change cells (exact: 2.6% and 10.3% with 38 donors, 5.0% and 10.0% with 19) | 5.5, 4.3, 5.0, 4.8, 3.3%; 9.0, 8.5, 9.3, 9.0, 10.0% | holds |
| 2. treated outside the donors' range (E1): p <= 0.05 at most 6%, fit warning at least 90% | 1.3%; 99.5% | holds |
| 3. power, p <= 0.05: a 2 sd step (P1) at least 28%; the same step with every unit wandering (P3) at least 18% | 34.8%; 22.8% (an effect growing to 3 sd in sticky noise, P2: 11.8%; short series, P4: 6.8%) | holds |
| 4a. T1 California 1989: p <= 0.05, average gap -30 to -10 packs, gap at 2000 below 0 | gap -19.5 average, -26.5 at 2000; **rank 3 of 39, p 0.077** | **fails** |
| 4b. T2-T4 Massachusetts 1993, Arizona 1995, Oregon 1997: 2 of 3 at p <= 0.10 with a negative gap | **0 of 3** (p 0.21, 0.50, 0.39; gaps -15.7, -8.1, -15.6) | **fails** |
| 4c. in-time placebos, California cut at 1988, fake dates 1980 and 1984: neither p <= 0.05 | p 0.46, 0.28 | holds |
| 4d. nine placebo states at 1989: at most 1 of 9 p <= 0.05 | 0 of 9 (Virginia closest, rank 2 of 38, p 0.053) | holds |

N1's 5.5% is twice its exact level. A post-hoc re-run on fresh seeds (base 15000, `eval/synth-pool-without.out.txt`)
gives 2.5% and 3.0% in N1 and N2, and the paper's placebo pool (the treated unit moved into each placebo's pool,
`placeboPool: 'with'`, `eval/synth-pool-with.out.txt`) gives the same, so the excess is not the pool. It looks
seed-specific: `eval/synth-sim.mjs` seeds a xorshift generator with consecutive integers and no scrambling, which can
correlate neighbouring panels. A later round should hash its seeds.

**The estimate replicates the paper.** California's synthetic control is Utah 0.391, Montana 0.227, Nevada 0.207,
Connecticut 0.109, New Hampshire 0.043 and Colorado 0.024 (the paper's, with covariates: Utah 0.394, Nevada 0.234,
Montana 0.199, Colorado 0.164, Connecticut 0.069). Before 1989 the gap is 1.66 packs a head (root mean square); after,
it opens to -8.4 packs in 1989, -17.5 in 1993 and -26.5 in 2000, an average of -19.5 over 1989-2000. The paper reports
"about 26 packs" by 2000 and about 20 on average. With the window cut at 1988, fake dates 1980 and 1984 give p 0.46 and
0.28, and none of the nine placebo states is found.

**The test does not.** California's ratio (12.4) ranks 3rd of 39, p 0.077, against the paper's 1st, p 0.026. Massachusetts
(rank 8 of 39, gap -15.7), Arizona (18 of 36, -8.1) and Oregon (11 of 28, -15.6) all have negative gaps and none is
near p 0.10, so T1 and T2-T4 fail and `--synth-control` is not offered (the CLI wiring written in this session was taken
out; the module stays for reproducing these tables, `synth-control.test.mjs`).

**Why California ranks third** (after the run, not pre-registered; `node eval/synth-real-diag.mjs`,
`eval/synth-real-diag.out.txt`). The two states above it are Missouri (ratio 26.5) and Virginia (16.9), whose
before-period fits are almost exact (RMSPE 0.41 and 0.86 packs against California's 1.66): a ratio divides by the
before-gap, so a donor that a mix of other states tracks to under a pack gets a large ratio from a modest later gap
(Missouri's after-gap is 10.9 packs, California's 20.5). Matching on all 19 before-years and no covariates fits the
middle of the donor cloud too well; the paper's covariate-and-three-lags match leaves those placebos looser. The
paper's own filters do not rescue it here: keeping placebos with before MSPE at most 20, 5 or 2 times California's
leaves it 3rd of 35, 31 and 20 (p 0.086, 0.097, 0.150), and with California moved into each placebo's pool, as the
paper does, it is still 3rd of 39, behind Missouri and Virginia again.

**What a reader can use now.** For a single treated unit with a long before-period and a donor pool, this module gives
the published-quality estimate of the gap (`node -e` with `synthControlTest`), but its p should not be read as a test
when some donors fit almost exactly. **Next** (fresh pre-registration): a statistic that does not divide by a tiny
before-gap (the after-gap alone, or the ratio with the before-gap floored at the donors' median), checked in simulation
against cells where some donors are near-copies of others; monthly series; and the effect's path as the statistic.

### A floored ratio: California ranks first, as in the paper (2026-11-17, pre-registered; module default, CLI not shipped)

The synthetic-control round above ranked California 3rd of 39 because Missouri and Virginia are fitted almost exactly
before 1989 and the paper's statistic divides by that before-gap. `synthControlTest` now scores every placebo with
three statistics from the same fits (`r.tests`): **floored**, the after-gap over the before-gap floored at the median
before-gap of all units, treated and donors alike (`r.floor`); ratio, the paper's after-gap over before-gap; and post,
the after-gap alone. The floor is one number computed symmetrically from every unit's fit, so when nothing happened
and the treated unit is like the donors, the ranks stay exchangeable and the test stays exact.

Pre-registration `eval/synth-floor-prereg-2026-11-17.md`, committed after an exploratory run (hashed seed base 21000,
`eval/synth-floor-explore.out.txt`) and before the confirmatory run (base 23000, 400 panels a cell,
`eval/synth-floor-confirm.out.txt`) and before the floored ratio was computed on any real state
(`SC_STAT=floored node eval/synth-real.mjs`, `eval/synth-floor-real.out.txt`). Seeds are now hashed (splitmix32), as
the last round asked. New cells: N6/P5 eight near-copy donor pairs; N7/P6 a treated unit inside the donors' range
but near its corner.

| Bar (pre-registered, floored statistic) | Confirmatory (400 panels a cell) | |
|---|---|---|
| 1. size, N1-N7: p <= 0.05 at most 6%, p <= 0.10 at most 14% | 2.3-5.3%; 6.8-14.0% (N6, the near copies, at the cap) | holds |
| 2. treated outside the donors' range (E1): p <= 0.05 at most 6% | 5.8% (ratio 0.5%; p <= 0.10 16.5%, no bar; the fit warning fires on 100%) | holds |
| 3. power, p <= 0.05: no cell below the ratio by more than 2 points; P1 and P6 at least 10 above | P1 56.5 vs 33.8%; P2 18.8 vs 12.0; P3 26.0 vs 20.0; P4 25.3 vs 6.8; P5 57.3 vs 41.8; P6 45.5 vs 18.8 | holds |
| 4a. T1 California 1989: p <= 0.05, average gap -30 to -10, gap at 2000 below 0 | **rank 1 of 39, p 0.026**; gap -19.5 average, -26.5 at 2000 | holds |
| 4b. T2-T4 MA 1993, AZ 1995, OR 1997: 2 of 3 at p <= 0.10, negative gap | 0 of 3 (p 0.154, 0.361, 0.214; ranks 6, 13, 6, up from 8, 18, 11) | **fails** |
| 4c. in-time placebos (1980, 1984 in a window cut at 1988): neither p <= 0.05 | p 0.385, 0.359 | holds |
| 4d. nine placebo states at 1989: at most 1 of 9 p <= 0.05 | 0 of 9 (Virginia now rank 5 of 38, p 0.132, from 2nd) | holds |

The after-gap alone was ruled out in exploration (49% rejections in E1, 54.8% confirmatory: a series no mix of donors
can match drifts away after any date). With the hashed seeds the paper's ratio holds its exact size in N1 (3.0%
against 2.6% exact), consistent with the last round's 5.5% being a seed artefact (one run does not prove it).

**What changed.** The floor on the real data is 2.15 packs (the median before-gap of the 39 states). California's
before-gap, 1.66, is under it, so its statistic is 20.5 / 2.15 = 9.5; Missouri's (10.9 after, 0.41 before) drops from
26.5 to 5.1 and Virginia's from 16.9 to 6.7, and California ranks 1st (the next are Oklahoma 7.4 and Texas 7.2), p 1/39 = 0.026, the paper's result without
the paper's covariates. On simulated panels the floored ratio finds a 2 sd step 57% of the time against 34%, and a
treated unit near the edge of the donors' range 46% against 19%. The cost is in E1, the case the fit warning is for:
when no mix of donors can match the treated series, p <= 0.10 comes up 16.5% of the time against 3.5%, so read p
only when the fit warning is off.

**Decision, as pre-registered.** Bars 1-3 hold, so `synthControlTest`'s default statistic is now `'floored'`
(`{ statistic: 'ratio' }` gives the paper's; the last round's scripts pass it and reproduce their tables). Bar 4b
fails: Massachusetts, Arizona and Oregon have negative gaps of 8 to 16 packs, ranked 6th to 13th, so `--synth-control`
stays out of the CLI and the module stays a library function. **Next** (fresh pre-registration): those three states
have before-gaps of 3.0 to 5.5 packs, worse than 55-78% of the donors', so they are matched loosely, not over-fitted:
covariates (income, price, the 15-24 share) or monthly series would give the fit something more to go on; and the
effect's path (a slope change) as the statistic.

### Matched on covariates: looser fits, California second (2026-11-17, pre-registered; fails two bars, not the default)

The floored-ratio round asked for covariates, so Massachusetts, Arizona and Oregon, matched loosely on their own
sales, would have more to go on. `synthControlTest(y, donors, k, { predictors })` now fits the way the paper does:
each unit gets a few predictors, each divided by its spread over all units; for diagonal weights V on those predictors
the donor weights W(V) minimise the V-weighted predictor gap on the simplex (`simplexLeastSquaresRows`, FISTA on the
few rows), and V is chosen (softmax, Nelder-Mead from equal weights, at most 160 evaluations) to minimise the
before-date gap in the outcome, Synth's "data-driven" V. Every placebo goes through the same search. The real
predictors are ln per capita personal income (BEA SAINC1, `data/us-personal-income-per-capita.csv`) and the average
retail price per pack (CDC, `data/us-cigarette-retail-price.csv`), each averaged over the nine years before the date,
and packs per head 14, 9 and 1 years before it (1975, 1980 and 1988 for California). **The paper's 15-24 population
share and beer consumption are left out**: neither had a reachable, documented source this session, so this is the
paper's design less two of its seven predictors.

Pre-registration `eval/synth-cov-prereg-2026-11-17.md`, committed after an exploratory run (hashed base 31000, 50
panels a cell, `eval/synth-cov-explore.out.txt`) and before the confirmatory run (base 33000, 200 panels a cell,
`eval/synth-cov-confirm.out.txt`) and before any real state was fitted with covariates (`node eval/synth-cov-real.mjs`,
`eval/synth-cov-real.out.txt`). Simulated covariates are each unit's two factor loadings measured with N(0, 0.15)
noise, plus the same three lags.

| Bar (pre-registered, covariate fit, floored ratio) | Confirmatory (200 panels a cell) / real | |
|---|---|---|
| 1. size, N1-N7: p <= 0.05 at most 7%, p <= 0.10 at most 15% | 1.0-5.5%; 4.5-14.0% | holds |
| 2. treated outside the donors' range (E1): p <= 0.05 at most 8% | **17.5%** (the outcome fit on the same panels: 9.0%; fit warning 99%) | **fails** |
| 3. power: no cell more than 10 points below the outcome fit | P1 50.0 vs 55.0; P2 16.5 vs 15.5; P3 32.0 vs 36.0; P4 29.0 vs 27.5; P5 52.5 vs 48.0; P6 52.0 vs 50.5 | holds |
| 4a. T1 California 1989: p <= 0.05, average gap -30 to -10, gap at 2000 below 0 | **rank 2 of 39, p 0.051**; gap -17.4 average, -23.9 at 2000 | **fails** |
| 4b. T2-T4 MA 1993, AZ 1995, OR 1997: 2 of 3 at p <= 0.10, negative gap | **1 of 3**: MA rank 3, p 0.077 (from 6th); AZ rank 5, p 0.139 (from 13th); OR rank 21 of 28, p 0.750, fit warning (from 6th) | **fails** |
| 4c. in-time placebos (1980, 1984 in a window cut at 1988): neither p <= 0.05 | p 0.077, 0.436 | holds |
| 4d. nine placebo states at 1989: at most 1 of 9 p <= 0.05 | 0 of 9 (West Virginia closest, p 0.105) | holds |

**What the covariates do.** California's synthetic control becomes Utah 0.405, Colorado 0.352, Nevada 0.221 and New
Hampshire 0.015, close to the paper's (Utah 0.394, Nevada 0.234, Montana 0.199, Colorado 0.164, Connecticut 0.069),
with V almost all on price (0.61) and the 1980 lag (0.22); the gap after 1989 is -17.4 packs on average and -23.9 by
2000, against the paper's "about 26". But the fit before 1989 loosens (RMSPE 2.02 against 1.66 packs), the donors'
fits loosen more, so the floor rises from 2.15 to 3.63 packs, and California's floored statistic (18.4 / 3.63 = 5.1)
falls just behind one donor: rank 2, p 0.051. With the paper's unfloored ratio it ranks 1st (p 0.026), the paper's
result. Massachusetts moves from 6th to 3rd (p 0.077, a gap of -14.0 packs) and Arizona from 13th to 5th, so for the
two loosely fitted states the covariates help, as the last round guessed. Oregon is the failure: its fit is far worse
(19.6 packs before 1997, against 5.5 matched on its own sales), a fit warning fires and it ranks 21st.

**Why Oregon fails** (after the run, not pre-registered). Oregon's predictors sit inside the donors' range (its price
above 32 of 38 donors, its income above 24), so a close match exists; the search did not find it. Its V ended at
0.149, 0.405, 0.149, 0.149, 0.149, one simplex step from the start: the before-gap is piecewise flat in V (W jumps
between donor sets), and Nelder-Mead from one start stalls. Georgia's V (the same values) and Montana's (equal fifths)
show the same stall among the placebos. Synth's practice of several starts, one per predictor and a regression-based
one, would likely fix it, but that is a new method and needs a fresh pre-registration. E1's 17.5% is the other cost:
when no mix of donors can match the treated unit, a looser fit lets its after-gap look larger than the placebos'.

**Decision, as pre-registered.** Bars 1 and 3 hold, 2 and 4 fail, so the `predictors` option stays in the module as a
library function, not calibrated, and the outcome-only fit stays the default and the recommended one. On the same
fresh panels the shipped outcome fit gave 2.5% at p 0.05 in N1 and 17.0% at p 0.10 in N6, the near-copy cell (the last
round's 400 panels: 14.0%, at its cap), so the shipped default's p 0.10 is loose when donors come in near-copy pairs;
its p 0.05 (7.0% there) is the one to read. **Next** (fresh pre-registration): a multi-start V search (one start per
predictor plus equal weights), with the paper's 15-24 share and beer covariates if a source can be found; monthly
series.

### Several starts for V: tighter fits, the same ranks; Oregon's covariates cannot fit it (2026-11-17, pre-registered; fails three bars)

The covariate round ended with a diagnosis: Oregon's V stopped one simplex step from its start, so "a multi-start V
search (one start per predictor plus equal weights)" might find the close match its predictors suggested.
`synthControlTest(y, donors, k, { predictors, vSearch: 'multi' })` now runs Nelder-Mead from equal weights and then
from each predictor's corner (theta_m = 3, v_m about 0.83), each with its own 160-evaluation budget, and keeps the
best before-gap any start reached. The first start is the one-start search, evaluation for evaluation, so no fit can
come out looser (`synth-control.test.mjs` checks the treated fit and every placebo). It costs about six times as much.

Pre-registration `eval/synth-multi-prereg-2026-11-17.md`, committed after an exploratory run (hashed base 41000, 20
panels a cell, `eval/synth-multi-explore.out.txt`) and before the confirmatory run (base 43000, 80 panels a cell,
`eval/synth-multi-confirm.out.txt`) and before any real state was fitted with it (`node eval/synth-multi-real.mjs`,
`eval/synth-multi-real.out.txt`). The method, cells, predictors and real windows are the covariate round's; only the
starts changed.

| Bar (pre-registered, multi-start covariate fit, floored ratio) | Confirmatory (80 panels a cell) / real | |
|---|---|---|
| 1. size, N1-N7: p <= 0.05 at most 8%, p <= 0.10 at most 16% | 0-6.3% and 3.8-10.0% in N1-N6; **N7 11.3% and 17.5%** (one start on the same panels: 8.8%, 18.8%; outcome: 8.8%, 15.0%) | **fails** |
| 2. treated outside the donors' range (E1): p <= 0.05 at most 8% | **16.3%** (one start 17.5%, outcome 10.0%; fit warning 99%) | **fails** |
| 3. power: no cell more than 10 points below the outcome fit | P1 53.8 vs 62.5; P2 18.8 vs 15.0; P3 28.8 vs 23.8; P4 26.3 vs 21.3; P5 58.8 vs 58.8; P6 43.8 vs 36.3 | holds |
| 4a. T1 California 1989: p <= 0.05, average gap -30 to -10, gap at 2000 below 0 | **rank 2 of 39, p 0.051** (unchanged); gap -17.6 average, -24.0 at 2000 | **fails** |
| 4b. T2-T4 MA 1993, AZ 1995, OR 1997: 2 of 3 at p <= 0.10, negative gap | **0 of 3**: MA rank 4, p 0.103 (one start: 3rd, 0.077); AZ rank 8, p 0.222 (5th); OR rank 19 of 28, p 0.679, fit warning (21st) | **fails** |
| 4c. in-time placebos (1980, 1984 in a window cut at 1988): neither p <= 0.05 | p 0.077, 0.385 | holds |
| 4d. nine placebo states at 1989: at most 1 of 9 p <= 0.05 | 1 of 9: **West Virginia rank 1 of 38, p 0.026** (one start: 4th, p 0.105) | holds, at the bar |

**What the extra starts do.** They find a better V in most fits, but not a much better one. California's before-gap
goes from 2.02 to 1.92 packs with V moved almost wholly onto the 1975 and 1980 lags (0.81, 0.19) from price (0.61);
its synthetic control stays Utah, Colorado and Nevada, the gap and the rank do not move, and the floor drops from 3.63
to 3.40. Massachusetts tightens from 4.65 to 3.70 packs but its after-gap shrinks with it (14.0 to 13.0 packs), so it
slips from 3rd to 4th. Arizona tightens from 4.95 to 4.72 and slips from 5th to 8th. A tighter V-search fit is
a closer copy of the treated unit's own before-period; for these states it also follows less of what came after.
West Virginia, a placebo state with no tax change, moves from 4th to 1st with a positive gap of 17 packs (sales above
its synthetic control): the one Q placebo the bar allows.

**Why Oregon still fails** (after the run, not pre-registered; `node eval/synth-multi-oregon-diag.mjs`,
`eval/synth-multi-oregon-diag.out.txt`). The multi-start search took Oregon's before-gap from 19.6 to 17.5 packs.
4,000 V drawn uniformly on the simplex do no better than 15.8, and the best corner (all weight on ln income, which the
softmax search can only approach) gives 12.9. The outcome-only fit gives 5.5. So the stall the last round saw was
real but cost little: no V on these five predictors fits Oregon. Its sales fell from 157 packs a head in 1970 (the
donors' mean: 118) to 97 in 1994 (donors: 105), from 40 packs above the pool to below it, and predictors read in
1983, 1988 and 1996 say nothing about the 1970s, where most of the before-gap is. The paper's lags were chosen for
California, whose before-period runs close to its donors throughout. For a unit whose path crosses the pool's, a few
lags cannot stand in for the whole before-period; the outcome-only fit matches every year and does.

**In simulation the extra starts change almost nothing.** The multi-start treated fit is tighter than the one-start
fit in 65-93% of panels, but mean before RMSPE falls only 1-4% per cell, and rejection rates move by at most 2.5 points
either way. E1 stays where the one-start fit left it (16.3% against 17.5%), so the excess there is the covariate
design, not the search. N7, a treated unit near the corner of the donors' range, is over its size bar for every
covariate fit (11.3% multi, 8.8% one start at p 0.05; both over 16% at p 0.10); at 80 panels a cell its standard
error is about 3 points, so this says the corner case is loose, not how loose.

**Decision, as pre-registered.** Bar 3 holds, bars 1, 2 and 4 fail, so `vSearch: 'multi'` stays an option (default `'single'`), documented with
these tables, and the outcome-only fit stays the default and the recommended one. **Next** (fresh pre-registration, if covariates are tried again): lags
spread over the whole before-period (every fifth year, or the before-period's mean and slope), so a unit whose level
crosses the pool's is matched on its path; or drop the predictor search and add covariates as a check on the
outcome-only fit's weights (Abadie 2021, section 7: report the covariate balance of the outcome fit). Until then the
outcome-only fit with the floored ratio is the one to use (California 1st of 39).

### Covariate balance of the outcome-only fit: California is matched on sales, not on income (2026-11-17, a diagnostic; not pre-registered, changes no p)

The multi-start round ended recommending the outcome-only fit and, as the alternative to more predictor searches,
"add covariates as a check on the outcome-only fit's weights (Abadie 2021, section 7)". `covariateBalance(r,
covariates)` in `synth-control.mjs` does that. It takes a `synthControlTest` result and any per-unit covariates, and
for each one prints the treated value, the synthetic control's (the fit's donor weights applied to the donors' values),
the plain donor average, and both gaps divided by the covariate's spread over all units (a standardised difference,
flagged past 0.25, the usual matching rule of thumb, Stuart 2010). It also puts the treated fit among the placebos:
every donor's own synthetic control (now kept on `r.placebos[i].donorWeights`) is scored the same way, and
"placebos matched better" is the share closer on that covariate than the treated fit is. It is a description of the
fit, not a test, and no p moves.

Run on the four real tax rises with the covariate round's definitions plus the before-period mean of packs per head
(`node eval/synth-balance-real.mjs`, `eval/synth-balance-real.out.txt`; standardised gaps, synthetic vs treated):

| State, date | ln income | price per pack | packs, three lags | packs, before mean | floored p |
|---|---|---|---|---|---|
| California 1989 | **+1.66** (89% of placebos better) | **-0.33** (34%) | +0.01, -0.00, -0.08 | -0.00 | 0.026 |
| Massachusetts 1993 | +0.13 | -0.05 | -0.17, -0.01, -0.02 | -0.00 | 0.154 |
| Arizona 1995 | +0.17 | **-0.67** (60%) | -0.24, +0.15, -0.10 | -0.00 | 0.361 |
| Oregon 1997 | **+0.39** (26%) | **+0.97** (81%) | **-0.33**, +0.03, -0.10 | -0.00 | 0.214 |

**What it shows.** Matching every before-year of sales balances the sales lags and the before mean almost exactly, as it
must. It does not balance income: California's synthetic control (Utah, Montana, Nevada, Connecticut) is 1.66 standard
deviations poorer than California, worse than 89% of the placebos' own fits, and the plain donor average is no closer
(1.73). The price gap is small in cents (2.3 cents a pack) but past the flag. So the published gap of about 20 packs a
head rests on the assumption that income does not move cigarette sales differently in California and in its poorer
synthetic control after 1989; a reader should say so when quoting it. **Massachusetts is the useful negative:** its
outcome-only fit balances all six covariates (no gap past 0.13) and it still ranks 6th of 39 (p 0.154), so the earlier
rounds' hope that covariates would rescue it is not supported: its weak rank is not an imbalance the covariates
measure. Oregon's synthetic control is cheaper than Oregon by 13 cents a pack before 1997 (0.97 sd, worse than 81% of
placebos), which is consistent with the covariate round's finding that no predictor weighting fits it.

**Limits.** The paper's 15-24 population share and beer consumption are still missing (no documented source reached),
the 0.25 flag is a convention, not a calibrated bar, and four states cannot say whether imbalance predicts a biased gap;
a simulation where a covariate drives the outcome after the date would. **Next:** that simulation (does the flag pick
out the panels whose gap is biased?), then print the balance table with the synthetic-control result once the CLI
offers one.

Sources: Abadie, A. (2021), "Using synthetic controls: feasibility, data requirements, and methodological aspects",
Journal of Economic Literature 59(2), 391-425, doi:10.1257/jel.20191450; Abadie, A., Diamond, A. and Hainmueller, J.
(2010), JASA 105(490), 493-505, doi:10.1198/jasa.2009.ap08746; Stuart, E. A. (2010), "Matching methods for causal
inference: a review and a look forward", Statistical Science 25(1), 1-21, doi:10.1214/09-STS313.

### Which imbalance biases the gap: read "placebos matched better", not the 0.25 flag (2026-11-17, pre-registered, all five bars passed)

The balance round ended: "four states cannot say whether imbalance predicts a biased gap; a simulation where a
covariate drives the outcome after the date would." `eval/synth-bias-sim.mjs` is that simulation (pre-registration
`eval/synth-bias-prereg-2026-11-17.md`, committed before the confirmatory run). Panels are the shipped generator's
(39 units, 19 points before the date, 12 after). Each unit gets one covariate Z (think income); before the date Z does
nothing, and from the date on every unit, treated and donors alike, moves by beta x Z. The treated unit has no effect
of its own, so any gap after the date is bias, and the part Z explains is exactly beta x sd(Z) x the standardised gap.
Each panel is fitted the shipped way (outcome only, floored ratio) and scored with `covariateBalance`. Two candidate
warnings: the 0.25 flag (`imbalanced`) and "placebos matched better" at 80% or more (the treated unit is matched worse
on Z than at least 80% of the donors are by their own synthetic controls).

Confirmatory run, fresh seeds (base 43000), 200 panels a cell (`eval/synth-bias-confirm.out.txt`):

| cell | 0.25 flag fires | 80% warning fires | p <= 0.05, warned vs not | mean abs. bias, warned vs not | p <= 0.05 overall |
|---|---|---|---|---|---|
| B0 Z does nothing | 84% | 21% | 2.4% vs 1.3% | 0.40 vs 0.32 | 1.5% |
| B1 beta 0.5 | 85% | 24% | **20.8% vs 0.0%** | **1.04 vs 0.43** | 5.0% |
| B2 beta 1.0 | 84% | 20% | **12.8% vs 0.0%** | **1.88 vs 0.74** | 2.5% |
| B3 beta 0.5, treated Z at 1.8 | 100% | 75% | 12.1% vs 2.0% | 1.04 vs 0.62 | 9.5% |
| B4 beta 0.5, Z tied to the loadings | 79% | 21% | **16.7% vs 0.6%** | **0.80 vs 0.40** | 4.0% |
| B5 = B3 + a true step of -1 | 100% | 71% | 0% vs 0% | | **0.0%** (power) |
| B6 = B5 with beta 0 | 100% | 73% | | | **58.5%** (power) |

Bars: (1) the 0.25 flag fires in at least 50% of B0: 84%, passed. (2) In B1, B2 and B4 the 80% warning's panels
have at least 1.5x the mean absolute bias (2.4x, 2.5x, 2.0x) and a p <= 0.05 share at least 5 points higher (+20.8,
+12.8, +16.1): passed. (3) In B0 it fires in 10-30% of panels: 21%, passed. (4) Size at most 10% in B0-B4: 1.5-9.5%,
passed (B3 is close). (5) B5's power at most half of B6's: 0% vs 58.5%, passed.

**What it says.**
- **The 0.25 flag is not a warning.** An outcome-only fit leans on four or five donors, so on any covariate it was not
  matched on its gap is past 0.25 sd about five times in six, whether or not that covariate matters. It stays in the
  output as a description.
- **"Placebos matched better" is the one to read.** At 80% or more it fires on about one panel in five when nothing is
  wrong, and when a covariate does move the outcome it holds every false finding: 13-21% of warned panels reach
  p <= 0.05 with no effect at all, against 0-0.6% of the rest, and their gaps are 2-2.5x as biased. The placebo test
  protects itself when the treated unit is matched no worse than the donors are (their gaps are biased the same way);
  it stops protecting exactly when the treated unit is the outlier. `covariateBalance` now returns `placeboWarning`
  (placeboShare >= 0.8, option `placeboQuantile`).
- **An imbalance can hide a real effect as easily as invent one.** With the treated unit's Z at 1.8 (where
  California's income sits) and a true drop of 1, the shock pushed the gap up by about as much as the drop, and the
  test found it in 0 of 200 panels against 58.5% without the shock.

**On the real states** (`eval/synth-balance-real.out.txt`, `!` marks the warning): California's income (89%) and
Oregon's price (81%) are warned; so are one outcome lag each in MA, AZ and OR (85-87%, gaps of only 0.17-0.33 sd,
on numbers the fit already matches year by year). So the published California gap carries the warning this simulation
calibrates: if income moved cigarette sales differently after 1989, the gap and its p of 0.026 can be off in either
direction, and the simulation cannot say which way. A post-hoc check found the warning never fired on a gap of 0.25 or
under in simulation, so pairing it with the 0.25 flag would change nothing there; on real outcome lags it would drop
the three small-gap warnings. Not adopted: not pre-registered.

**Limits.** One covariate, a step shock and the N1 panel shape; real covariates are several and correlated, and their
shocks need not be steps. The 80% cut was chosen from the exploratory run (50 a cell) before the confirmatory one.
**Next:** print the balance table, with the warning, from the CLI once it offers a synthetic control; a two-covariate
cell (one that matters, one that does not) to check the warning names the right one.

### A synthetic control from the command line, with its balance table (2026-11-17)

The balance rounds ended "print the balance table, with the warning, from the CLI once it offers a synthetic control".
It now does:

```
node cli.mjs data/us-cigarette-packs-per-capita.csv --window 1970:2000 --column CA --known-date 1989 \
  --donors AL,AR,CO,CT,DE,GA,IA,ID,IL,IN,KS,KY,LA,ME,MN,MO,MS,MT,NC,ND,NE,NH,NM,NV,OH,OK,PA,RI,SC,SD,TN,TX,UT,VA,VT,WI,WV,WY \
  --covariates data/prop99-covariates-1989.csv
```

`--donors` (a list, or `all` for every other numeric column) turns `--known-date` into a synthetic control on a wide
CSV, one column per unit, with the shipped defaults (outcome-only fit, floored ratio). `--window from:to` cuts the rows;
`--log` takes logs; a blank in any used column is refused, not carried forward. `--covariates` takes a file with one
row per unit (the column's name, then one number per covariate, a header naming them; `data/prop99-covariates-1989.csv`
is written by `node eval/prop99-covariates.mjs` with the balance round's definitions). The text gives the weights,
the before-gap and how many placebos fit better (with the fit warning), the gap after the date, the floored rank and p
and the paper's ratio rank, and the balance table with `WARNING` on each covariate where 80% or more of the placebos
are matched better. The run above prints exactly the recorded numbers: UT 0.391, MT 0.227, NV 0.207; gap -19.5 on
average, -26.5 at 2000; rank 1 of 39, p 0.026 (ratio: 3rd); ln income 1.66 sd, 89%, `WARNING` (`synth-cli.test.mjs`).

**Why it ships now, against the floored-ratio round's "stays out of the CLI".** That round held the CLI back because
three of four real tax rises were not found (bar 4b, a power bar on real data); size held in every round (2.3-5.3% at
p 0.05). A size-calibrated test with low power is usable if it says so, and the balance diagnostic it lacked then now
exists. So the CLI prints the power record with every result ("a large p is not evidence of no effect"), and the fit
and placebo warnings beside the p. The decision is a product call by this run, not a new pre-registered result.

### A synthetic control on the page, with its balance table (2026-11-17)

The CLI's synthetic control ran only from a terminal; the people it is for (an analyst asking whether a store,
region or state really moved after a change, against the others that did not) mostly will not install Node. The page
now has it. In "One column" mode, name the treated column in **Column**, the date in **Test a date you name**, and
put `all` or a list of column names in **Compare with other columns at that date**; optionally paste a covariates
table (the CLI's `--covariates` format: one row per unit, the column name first, a header naming the covariates).
A new card, "Against a synthetic control", shows what `synthText` prints: the gap after the date, the weights, the
before-fit with the fit warning, the floored placebo rank and p and the paper's ratio, the covariate balance table
with a **Warning** cell where 80% or more of the placebos are matched better, the power caveat, a chart of the treated
series against its synthetic with the date marked, and a CSV of treated, synthetic and gap per row.

It runs in the page's existing worker job (`analyze-job.mjs`: `{ kind: 'one', opts, synth }` returns
`result.synth`, or `result.synthError` with the one-column result left standing), so the panel never blocks the page.
The view is `synth-view.mjs` (pure functions). **Load example: California's 1989 tobacco tax against 38 states**
fills the boxes from `example-prop99.mjs`, a copy of `data/us-cigarette-packs-per-capita.csv` cut at 2000 and
`data/prop99-covariates-1989.csv` with the 38-state donor pool of `synth-cli.test.mjs`; the page then shows the
CLI's numbers exactly (rank 1 of 39, p 0.026; UT 0.391, MT 0.227, NV 0.207; gap -19.5 on average; the
`ln income 1980-88` warning, 89% of placebos matched better). `synth-page.test.mjs` checks the copies match the data
files, the worker job gives those numbers, a bad donor name reports an error without losing the one-column result,
and the page is wired; a headless Chromium run of the example (2026-11-17) showed the card with no console errors
and no horizontal scroll at 390 px. Counted as `synth_run` / `synth_balance_run` (local counters only). No new
method or measurement: every number shown comes from the CLI's tested code.

### Two covariates: the warning carries the false finds, but does not always name the culprit (2026-11-17, pre-registered; one bar failed)

The balance round asked for "a two-covariate cell (one that matters, one that does not) to check the warning names
the right one". `eval/synth-two-cov-sim.mjs` (pre-registration `eval/synth-two-cov-prereg-2026-11-17.md`, committed
after an exploratory run at base 51000 and before the confirmatory run): the same N1 panels, each unit with Z, which
moves every unit by beta x Z from the date on, and W, which moves nothing; no true effect, so every gap is bias.
Confirmatory, base 53000, 400 panels a cell (`eval/synth-two-cov-confirm.out.txt`):

| cell | Z warns | W warns | p <= 0.05: Z warned / W alone / neither | mean abs. bias: Z warned / W alone / neither |
|---|---|---|---|---|
| C1 beta 0.5, independent | 21.5% | 19.5% | 14.0% (86) / 0.0% (58) / 1.2% (256) | 0.912 / **0.532** / 0.418 |
| C2 beta 0.5, corr 0.7 | 22.8% | 22.3% | 14.3% (91) / 0.0% (43) / 0.8% (266) | 1.030 / 0.422 / 0.444 |
| C3 beta 1.0, independent | 18.3% | 20.8% | 12.3% (73) / 0.0% (69) / 0.0% (258) | 1.878 / 0.831 / 0.683 |

Bars: (1) W's warning fires in 10-30% of C1 and C3: 19.5%, 20.8%, holds. (2) Z-warned bias at least 1.5x the
neither group's (2.2x, 2.7x, holds) and W-alone at most 1.25x (C3 1.22x holds; **C1 1.27x fails**). (3) In C3, Z-warned
p <= 0.05 share at least 5 points above neither (+12.3) and W-alone at most 2 above (+0.0): holds. (4) In C2, Z-warned
bias above W-alone's (1.03 vs 0.42): holds.

**What it says.** Every false finding sat in a panel warned on the covariate that mattered: 12-14% of those reach
p <= 0.05 with no effect, against none of the 170 warned only on the harmless one and 0-1.2% of the unwarned. So a
`WARNING` row still marks the result to distrust. But the bias in panels warned only on W is a little above the
unwarned (1.22-1.27x), past the pre-registered cap in C1: a treated unit matched worse than the placebos on one
covariate tends to be matched a little worse on others too (a post-hoc reading, not tested). With correlated
covariates (C2) the two warnings fire together on half their panels (11.5 of 22-23%). **As pre-registered for a
failed bar 2,** the CLI's warning text now says the warned covariate need not be the one that moved the outcome, and
that correlated covariates share warnings. **Next:** the balance table on the page; covariates with shocks that are
not steps (a slope from the date).

### Shocks that are not steps: a slope from the date and a pulse that fades (2026-11-18, pre-registered; all four bars passed)

The balance rounds calibrated the warning on covariates whose shock is a step at the date and listed "their shocks
need not be steps" as a limit; "Two covariates" ended "covariates with shocks that are not steps (a slope from the
date)". `eval/synth-shape-sim.mjs` (pre-registration `eval/synth-shape-prereg-2026-11-18.md`, committed after an
exploratory run at base 61000 and before the confirmatory run): the same N1 panels; each unit has Z, which moves every
unit by beta x Z x shape(h) at h = 0..11 points after the date, and W, which moves nothing. Both shapes average 1 over
the 12 points, so beta means what it meant for steps. **Slope**: (h + 1) / 6.5, from 0.15 at the first point to 1.85
at the last. **Pulse**: 3 for four points, then 0. No true effect, so every gap is bias. Confirmatory, base 63000,
400 panels a cell (`eval/synth-shape-confirm.out.txt`):

| cell | p <= 0.05 | Z warns | p <= 0.05: Z warned / not | mean abs. bias: Z warned / not | abs. gap at the last point: Z warned / not | p <= 0.05: W alone / neither |
|---|---|---|---|---|---|---|
| S0 beta 0 | 2.8% | 18.5% | 1.4% / 3.1% | 0.32 / 0.32 | 0.60 / 0.63 | 2.7% / 3.2% |
| S1 slope 0.5 | 1.8% | 18.3% | **8.2% / 0.3%** | **0.96 / 0.44** | 1.93 / 0.78 | 0.0% / 0.4% |
| S2 slope 1.0 | 2.5% | 19.8% | **12.7% / 0.0%** | **1.88 / 0.70** | 3.55 / 1.34 | 0.0% / 0.0% |
| P1 pulse 0.5 | 2.8% | 22.3% | **12.4% / 0.0%** | **1.05 / 0.48** | 0.58 / 0.62 | 0.0% / 0.0% |
| P2 pulse 1.0 | 3.8% | 19.8% | **19.0% / 0.0%** | **1.98 / 0.74** | 0.50 / 0.59 | 0.0% / 0.0% |

Bars: (1) Z's warning fires in 10-30% of S0 (18.5%) and size is at most 10% everywhere (1.8-3.8%): holds. (2) Slopes:
Z-warned bias 2.2x and 2.7x the unwarned, p <= 0.05 share +7.9 and +12.7 points: holds. (3) Pulses: (a) bias 2.2x and
2.7x, (b) +12.4 and +19.0 points: holds. (4) W warned alone vs neither, S2 and P2: 0.0% vs 0.0% both: holds.

**What it says.**
- **The warning's calibration carries over.** For a covariate that moves the outcome gradually from the date, or
  briefly after it, of the 43 false p <= 0.05 in the four shock cells (1,600 panels), 42 sat in a panel carrying the
  warning on that covariate (the other: S1, 1 of 327 unwarned), and warned panels' gaps were 2.2-2.7x as biased, as for steps (2.0-2.5x). The base rate
  with nothing wrong is unchanged (18.5% against 21%), and the harmless covariate's warning alone held no false
  finding in any cell (0 of 253).
- **A pulse fools the test as easily as a step, then leaves no trace at the end.** In P2 19% of warned panels reach
  p <= 0.05 with no effect, more than in any step cell, yet the gap at the last point is no larger in warned panels
  (0.50) than in the rest (0.59): the ratio test reads the whole after-period, so a short covariate shock right after
  the date can pass as an effect that "wore off". Read a significant gap that fades with the balance table in view.
- **A slope's bias grows.** In S2 the warned panels' gap at the last point is 3.55, about twice their average gap,
  so `effectAtEnd` overstates a slope-driven bias more than `effectAverage` does.
- The exploratory run's P2 had no false finds in 13 warned panels; 400 a cell gave 15 of 79. Fifty a cell was too few
  to say anything about rare events, as the pre-registration's wording assumed.

**As pre-registered for bars 1-3 holding,** the CLI's warning text and the page's note now say the calibration holds
for a shock that is a slope from the date or a pulse that fades, citing this file. Real states are not refitted.
**Limits.** Two shapes, one panel shape (N1), independent covariates. **Next:** a shock that starts before the date
(anticipation), and a real deployer's panel.

### A shock before the date: backdate with `--anticipation N` (2026-11-18, pre-registered; five of six bars passed, one failed)

"Shocks that are not steps" ended: "Next: a shock that starts before the date (anticipation)". Two things can start
early: a covariate's shock (people move before a law takes effect), which puts part of it inside the window the
synthetic control is fitted on; and the true effect itself (smokers cut down when a tax is announced, before it binds),
which the fit then partly absorbs. Abadie (2021) advises backdating the date to the first point people could react.
`eval/synth-anticip-sim.mjs` (pre-registration `eval/synth-anticip-prereg-2026-11-18.md`, committed after an
exploratory run at base 71000 and before the confirmatory run): N1 panels; covariate cells move every unit by 1.0 x Z
from L points before the stated date; effect cells drop the treated unit by 1 from L points before it. Each panel is
scored at the stated date and backdated by 2 and by 4. Confirmatory, base 73000, 400 panels a cell
(`eval/synth-anticip-confirm.out.txt`):

| cell | p <= 0.05 stated / back 2 / back 4 | mean gap over the stated window, stated / back 2 / back 4 |
|---|---|---|
| E0 effect -1 at the date | 61.8% / 52.0% / 43.3% | -1.02 / -1.02 / -1.01 |
| E2 effect -1, 2 points early | 39.8% / **55.0%** / 45.8% | -0.86 / **-1.00** / -1.00 |
| E4 effect -1, 4 points early | 25.3% / 35.3% / **53.5%** | -0.75 / -0.85 / **-0.98** |

| cell (no effect) | false p <= 0.05 stated / back 2 / back 4 | of those, Z-warned | Z warns (stated) | mean abs. gap stated: Z warned / not |
|---|---|---|---|---|
| A0 nothing | 5.8% / 4.3% / 1.8% | 6 of 23 / 2 of 17 / 1 of 7 | 21.5% | 0.33 / 0.30 |
| A2 Z from 2 points early | 2.8% / 2.0% / 2.3% | 6 of 11 / 7 of 8 / 8 of 9 | 18.3% | 0.97 / 0.45 |
| A4 Z from 4 points early | 2.0% / 2.0% / 2.0% | **4 of 8** / 5 of 8 / **8 of 8** | 19.8% | 0.84 / 0.35 |

Bars: (1) size at most 10% in A0, A2, A4 at every date: 1.8-5.8%, holds. (2) A4 at the stated date, warned bias at
least 1.5x the unwarned (2.4x, holds) **and** a warned p <= 0.05 share 5 points above the unwarned (5.1% vs 1.2%,
+3.9: **fails**). (3) Reported: Z's warning in A2 fires 18.3% against A0's 21.5%, under the 5-point line, so no text
change. (4) Anticipation costs power: E2 -22.0 and E4 -36.5 points against E0, holds. (5) Backdating by the lead wins
it back: +15.2 (E2) and +28.2 (E4) points, gaps -0.86 to -1.00 and -0.75 to -0.98, holds. (6) Reported: backdating
when nothing was anticipated costs 9.8 (by 2) and 18.5 (by 4) points of power; backdating too far (E2 by 4) still
beats the stated date (45.8% vs 39.8%) but loses to the right lead (55.0%).

**What it says.**
- **An effect people saw coming is half-hidden at the stated date.** Two points of anticipation cost a third of the
  power and four points cost three fifths, and the gap read from the date shrinks by 14-25%, because the fit already
  bends toward the early drop. Backdating to the true lead recovers both. Needless backdating has a cost too (a
  shorter fit), so the lead should come from what is known about the change (when the law passed, when the price
  rise was announced), not from trying several and keeping the smallest p.
- **The placebo warning's calibration is for covariate shocks that start at the date.** When Z moved 4 points before
  it, warned panels were still 2.4x as biased, but the warning held only half the false finds: the fit saw four of
  the shifted points and matched part of Z through the outcome, so some biased panels no longer looked imbalanced.
  Fitted before the covariate moved (`--anticipation 4`), the warning held all 8 again. The CLI's and the page's
  warning text now say so.
- **On Proposition 99** (an illustration, not part of the pre-registration): the ballot passed in November 1988 and
  the tax began in January 1989. Backdated one or two years, California keeps rank 1 of 39 (p 0.026) with a gap from
  1989 on of -19.7 and -18.5 packs (-19.5 undated); Massachusetts 1993 stays 6th either way. The published result
  does not lean on a year of anticipation.

**Ships.** `node cli.mjs panel.csv --column CA --known-date 1989 --donors all --anticipation 1` ends the fit N points
before the named date, reads the gap and the placebo test from there, keeps the named date as the label and prints
`gapFromDate` (the mean gap from the named date on). The page has the same box ("Points people saw it coming").
Without it the CLI and the page print one line on when to use it. **Limits.** One panel shape (N1), step effects and
step covariate shocks, the lead known exactly. **Next:** a real deployer's panel; a lead that is uncertain (a range of
backdates reported together without picking the best p).

### An uncertain lead: a range of backdates with one p, `--anticipation 0-4` (2026-11-18, pre-registered; all four bars passed)

"A shock before the date" shipped `--anticipation N` for a lead known exactly and ended "Next: a lead that is
uncertain (a range of backdates reported together without picking the best p)". `synthLeadRange(y, donors, k, leads)`
in `synth-control.mjs` fits the synthetic control at every backdate in the range and reads three range statistics,
each a placebo test that ranks the treated unit's value among all units' values computed the same way, so no lead is
picked: **max-scaled** (each unit's largest floored statistic over the leads, each lead's divided by its median over
all units), **mean** (the floored statistic averaged over the leads) and **min-p** (the Westfall-Young permutation
min-p of the per-lead placebo p's). `eval/synth-lead-range-sim.mjs` (pre-registration
`eval/synth-lead-range-prereg-2026-11-18.md`, committed after two exploratory runs at bases 81000 and 82000,
`eval/synth-lead-range-explore.out.txt`, and before the confirmatory run): the anticipation panels (N1, 39 units, 19
points before the stated date, 12 after), leads 0 to 4. The exploration dropped min-p as a candidate: with 39 units
p <= 0.05 means rank 1, and some placebo is nearly always rank 1 at one of five leads. Confirmatory, base 83000, 400
panels a cell (`eval/synth-lead-range-confirm.out.txt`), p <= 0.05 shares:

| cell | stated date | oracle (true lead) | smallest p of 5 | min-p | mean | **max-scaled** | Bonferroni | largest p |
|---|---|---|---|---|---|---|---|---|
| A0 nothing | 2.0% | 2.0% | 5.3% | 0.8% | 3.5% | **3.8%** | 0.0% | 0.8% |
| A4 covariate shock 4 early, no effect | 2.0% | 3.3% | 7.8% | 0.0% | 2.5% | **3.3%** | 0.0% | 0.0% |
| E0 effect -1 at the date | 59.0% | 59.0% | 64.0% | 36.3% | 53.5% | **53.5%** | 0.0% | 36.3% |
| E2 effect -1, 2 points early | 34.8% | 56.8% | 66.3% | 26.8% | 50.0% | **54.8%** | 0.0% | 26.8% |
| E4 effect -1, 4 points early | 27.8% | 59.3% | 64.3% | 23.0% | 48.3% | **55.5%** | 0.0% | 23.0% |

Bars (max-scaled): (1) size at most 10% in A0 and A4: 3.8% and 3.3%, holds. (2) E2 and E4 at least 10 points above the
stated date: +20.0 and +27.7, holds. (3) E0 at most 15 points below the stated date: -5.5, holds. (4) E2 and E4 within
10 points of the oracle: -2.0 and -3.8, holds. (5) Reported: keeping the smallest of the five p's raised the
no-effect share from 2.0% to 5.3% (A0) and 7.8% (A4); the smallest p sat at lead 0 in 41% of A0 panels and at lead 4
in 20%.

**What it says.**
- **Not knowing the lead costs little.** Read over leads 0-4, an effect that began 2 or 4 points early was found
  nearly as often as with the true lead known (55% and 56% against 57% and 59%) and twice as often as at the stated
  date (35% and 28%). When nothing was anticipated the range cost 5.5 points, less than backdating by a fixed 2 (9.8)
  or 4 (18.5) did in "A shock before the date".
- **Trying leads and keeping the smallest p is the trap it replaces.** It found more (64-66%) because it also found
  more where there was nothing: 5.3% and 7.8% of no-effect panels against 2.0%. Bonferroni over five leads is useless
  here: with 39 units its smallest possible p is 5/39 = 0.128, so it never reaches 0.05.
- **Size.** The range test's no-effect share (3.8%) sits above the single-date test's (2.0%) and above the 2.6% a
  rank-1 cut gives under exact exchangeability, within the sampling error of 400 panels (about 1 point). It is under
  the 5% people read p 0.05 as.
- **On Proposition 99** (an illustration, not part of the bars): `--anticipation 0-2` gives California p 0.026 at
  each lead (gaps from 1989 on -19.5, -19.7, -18.5) and a range p of 0.026.

**Ships.** `node cli.mjs panel.csv --column CA --known-date 1989 --donors all --anticipation 0-4` prints every
lead's fit end, mean gap from the named date and placebo p in a table, then the max-scaled range p as the one to read,
with the line that the table's smallest p is not a test (`--json`: `leadRange`). The main fit shown is the range's
shortest backdate. The page's "Points people saw it coming" box takes the same `a-b` range and shows the table.
**Limits.** One panel shape (N1), step effects, leads 0-4 only, an effect of one size; a range wider than the lead
costs power that was not measured beyond 4. **Next:** a real deployer's panel; a range on a series whose donors are
few (fewer than 20 units).

### Few donors: the Basque Country and West Germany (2026-11-18, pre-registered; three of six bars passed)

Every real test so far used Proposition 99's 38 donor states; "An uncertain lead" ended asking for a series whose
donors are few, and the flagship row for "a real deployer's panel, few donors", the case a user is likelier to have
(a handful of stores, regions or countries). Two published 17-unit panels, reshaped with no value changed by
`node eval/few-donor-panels.mjs` (`data/SOURCE.md`): **West Germany**, reunification 1990, GDP per head of 17 OECD
countries 1960-2003 (Abadie, Diamond and Hainmueller 2015), and the **Basque Country**, terrorism from about 1970,
GDP per head of 17 Spanish regions 1955-1997 (Abadie and Gardeazabal 2003). Pre-registration
`eval/synth-few-donors-prereg-2026-11-18.md`, committed before any fit; the shipped CLI defaults only (outcome-only
fit, floored ratio), `node eval/synth-few-donors-real.mjs` (`eval/synth-few-donors-real.out.txt`):

| Bar (pre-registered) | Result | |
|---|---|---|
| 1. West Germany: mean gap 1990-2003 between -2,500 and -800 USD, below 0 at 2003, at least 60% of the weight on the paper's five countries | -1,297 on average, -3,446 at 2003; USA 0.343, Austria 0.323, Switzerland 0.108 (77% on the five) | holds |
| 2. West Germany: floored rank 1 of 17 | **rank 3 of 17, p 0.176** (the paper's plain ratio: rank 1, p 0.059) | **fails** |
| 3. Basque: mean gap 1970-1997 below 0 and above -1.5 thousand USD, at least 60% of the weight on Catalonia and Madrid | -0.895 (about 10% of GDP per head, as published), but Madrid 0.483, Baleares 0.311, La Rioja 0.206: **48%** | **fails** |
| 4. Basque: floored rank at most 3 of 17 | **rank 4 of 17, p 0.235**, with the fit warning (81% of placebos fit better) | **fails** |
| 5. In-time placebos (West Germany at 1975 on 1960-1989, Basque at 1965 on 1955-1969): neither ranks 1 | ranks 2 and 7 of 17 | holds |
| 6. Leave-one-out (each donor of weight at least 0.05 removed): every refit keeps a negative mean gap | 5 of 5 (-1,354 to -1,815) and 3 of 3 (-0.54 to -0.91) | holds |

**The estimates survive; the test does not find them.** Both published gaps come back from an outcome-only fit:
West Germany about 1,300 USD a head a year below its synthetic control from 1990 to 2003 (the paper, with covariates:
about 1,600), opening after a brief reunification boom (+750 in 1991) to -3,400 by 2003, and the Basque Country about
0.9 thousand USD a head (about 10%) below from the late 1970s. Every leave-one-out refit keeps the sign. But neither
reaches rank 1, and with 17 units nothing else counts: **the smallest p 17 units allow is 1/17 = 0.059, so p <= 0.05
was out of reach before any fit was run.**

**Why they rank 3rd and 4th** (after the run, not pre-registered; numbers from `--json`, which now lists them):
- *West Germany is the best-fitted unit of all 17* (before-gap 61 USD; 0% of placebos fit better), and the floored
  ratio, built so a near-exact *donor* cannot win on a tiny denominator (Missouri and Virginia, "A floored ratio"),
  floors the treated unit's own denominator too, at the 144 USD median. That gives up the advantage the paper's ratio
  rests on (30.4 against the next unit's 20.5). Above it: the Netherlands (after-gap 2,428) and Norway (5,036, the
  North Sea oil years): donors with large shocks of their own after 1990.
- *The Basque Country is hard to fit*: the third richest region, with an industry share of 45% against a synthetic
  23% (2.31 sd, 100% of placebos matched better, `WARNING`), so it carries the fit warning; above it Asturias (coal and
  steel decline), Cantabria and Valencia. Its synthetic control is not the paper's Catalonia-Madrid mix: matched on
  every point from 1955 rather than on 1960s covariates, Madrid, Baleares and La Rioja track it closer (before-gap
  0.076). Dropping Madrid gives Catalonia 1.00 and halves the gap (-0.54); the paper's mix is the leave-Madrid-out
  direction, not the default.
- The paper's ratio would have ranked West Germany 1st, the Basque Country 7th; the after-gap alone 7th and 2nd. With
  few donors the choice of statistic moves the rank by several places, so it has to be fixed before the result, as the
  floored ratio was (2026-11-17, on 39-unit panels). Changing the default now, after seeing which one ranks West
  Germany first, would be the forking path the pre-registration exists to stop; **the default stays**.

**Ships (decided in the pre-registration, whatever the bars said).**
- Under 19 donors the CLI prints `FEW DONORS: With 17 units the placebo p cannot go below 0.059: p <= 0.05 is out of
  reach whatever happened, so rank 1 (p 0.059) is the strongest result this test can give, not a near-miss ...`, and
  the page shows the same note (`fewDonorsNote` in `synth-view.mjs`); a rank-1 result with few units says "the largest
  of all N units (the smallest p this many units allow)" on the page's summary line.
- When the treated unit is not ranked 1, the CLI and the page name the placebos ranked at or above it, with their
  statistic and before- and after-gaps (`above` in `--json`; `aboveNote`), and say that a donor's own shock is a reason
  to look into it and report it, not to drop it after seeing the result. Descriptive: it changes no p.
- `synth-few-donors.test.mjs` pins the recorded numbers.

**What a user with a handful of units can take from this.** The synthetic control gives a usable estimate of the gap
with 16 donors (both published gaps, both signs robust to dropping any heavy donor). The placebo test, with fewer than
19 units, can at best say "the largest of all", and one donor with its own after-date shock is enough to take that
away; read the named units above the treated one before reading the p. **Limits.** Two panels, one statistic fixed
in advance, levels only, no covariate fit. **Next:** a size and power check at 10-20 units in simulation (how often
rank 1 is reached with a real 2 sd step when one donor has its own shock); a real deployer's panel of stores or regions.

### Few donors: size and power, and one donor with its own shock (2026-11-18, pre-registered; all six bars passed)

"Few donors" ended: "a size and power check at 10-20 units in simulation (how often rank 1 is reached with a real
2 sd step when one donor has its own shock)". `eval/synth-few-power-sim.mjs` (pre-registration
`eval/synth-few-power-prereg-2026-11-18.md`, committed after an exploratory run at base 81000 and before the
confirmatory run): the shipped generator in N1's shape (19 points before, 12 after, noise sd 0.5) at 11, 16 and 21
units. The treated unit drops by 1.0 (two noise sd) from the date in the P cells; donor 1 moves by 1.0 (D) or 2.0 (E)
from the date, its own event, sign drawn per panel. Shipped defaults. Each panel is also refitted with donor 1 left out
of the pool beforehand. Confirmatory, base 83000, 400 panels a cell (`eval/synth-few-power-confirm.out.txt`); "rank 1"
is p = 1/units, the strongest result the test allows:

| units | no effect: rank 1 (1/units) | ... donor shocked | 2 sd step: rank 1 | ... one donor shocked by the same | ... by twice | ... that donor left out beforehand | mean gap (truth -1), shocked |
|---|---|---|---|---|---|---|---|
| 11 | 9.5% (9.1%) | 3.5% | **53.5%** | **38.0%** | **12.8%** | 58.3% | -0.995 |
| 16 | 6.5% (6.3%) | 2.3% | **60.0%** | **40.3%** | **9.0%** | 56.0% | -1.029 |
| 21 | 6.5% (4.8%) | 3.0% | **58.8%** | **34.8%** | **6.0%** | 57.5% | -1.007 |

Bars: (1) size at most 1/units + 4 points in all six no-effect cells: holds. (2) power at least 40% with clean donors:
53.5-60.0%, holds. (3) a same-size donor shock costs at least 8 points: 15.5, 19.7 and 24.0, holds. (4) a donor shock
twice the effect leaves at most 15%: 6.0-12.8%, holds. (5) leaving the donor out beforehand comes within 8 points of
the clean rate: -4.7 to +4.8, holds. (6) of PD and PE panels not at rank 1, the shocked donor is among the units
listed above the treated one in 88.9% (1,633 of 1,837; bar 70%): holds.

**What it says.**
- **One donor's own event is enough to take the test away; it does not touch the estimate.** With clean donors a
  2 sd step reaches rank 1 in 54-60% of panels at every size from 11 to 21 units; one donor with a shock as large
  as the effect drops that to 35-40%, one twice as large to 6-13%, close to the 5-9% of no effect at all. The gap
  stays right in every cell (mean -0.94 to -1.08 against the true -1): the shocked donor rarely carries much weight
  (0.05-0.11 on average), so it spoils the placebo ranking, not the synthetic control. This is the pattern of West
  Germany and the Basque Country: published gaps recovered, ranks 3rd and 4th.
- **More units do not buy it back.** Power with clean donors is flat from 16 to 21 units (60.0%, 58.8%), and the
  shocked donor costs the most at 21 (24 points): rank 1 is a single slot, and one unit with a larger statistic
  takes it whatever the pool's size.
- **Leaving the donor out beforehand restores the clean rate** (56-58%), at the price of one unit (the smallest p
  rises from 1/21 to 1/20, or 1/11 to 1/10). Done before the fit, because its event is known (a store refit, a plant
  closure, a region's own policy), this is Abadie (2021)'s advice to keep units with large idiosyncratic shocks out of
  the pool; done after seeing the ranks, it is the forking path the "above" note warns about. The simulation scores
  the pre-declared kind only.
- The "ranked above" list names the culprit in 89% of the panels where the treated unit missed rank 1, so the note
  added in "Few donors" points the reader at the right unit.
- Reported, no bar: the plain ratio's rank-1 shares follow the floored ratio's (43-49% clean, 31-37% one shocked);
  the after-gap alone is weak everywhere (16-19% clean).

**Ships (decided in the pre-registration).** The FEW DONORS note in the CLI and on the page now quotes these rank-1
shares at the nearest of 11, 16 and 21 units (`FEW_POWER`, `fewPowerRow` in `synth-view.mjs`) and says to leave out of
`--donors`, before fitting, any unit whose own after-date event is already known, and to say so.
`synth-few-power.test.mjs` pins the panel construction and checks the note's numbers against the confirmatory file.

**Limits.** One panel shape (N1's), independent factor loadings, one shocked donor with a step; a donor with a slope or
pulse, two shocked donors and a shocked donor that is also the treated unit's best match are untested. **Next:** a
real deployer's panel of stores or regions; two shocked donors at 11-16 units.

### Two shocked donors, and a shocked best match (2026-11-18, pre-registered; all eight bars passed)

"Few donors: size and power" left "two shocked donors and a shocked donor that is also the treated unit's best match"
untested. West Germany had two donors above it and the Basque Country three, and a user often knows of one donor's
event and not another's. `eval/synth-two-shock-sim.mjs` (pre-registration `eval/synth-two-shock-prereg-2026-11-18.md`,
committed after an exploratory run at base 84000 and before the confirmatory one): the same generator and N1 shape at
11 and 16 units, the treated unit dropping by 1.0 (two noise sd); two donors each moved by 1.0 (PDD) or 2.0 (PEE)
with independent signs, or one donor moved by 1.0 that is the treated fit's heaviest (PB, weights found from the
before-period before the shock is added; it carries 0.50-0.55 of the weight on average). Each panel is refitted with
the first shocked donor left out beforehand and with all of them left out. Confirmatory, base 85000, 400 panels a
cell (`eval/synth-two-shock-confirm.out.txt`):

| units | 2 sd step, clean: rank 1 | one donor shocked | two shocked | ... one of the two left out | ... both left out | two shocked by twice | ... one left out | gap error: clean / best match shocked / it left out |
|---|---|---|---|---|---|---|---|---|
| 11 | 53.8% | 40.3% | **28.0%** | 35.0% | **52.5%** | **8.0%** | 12.5% | 0.507 / **0.673** / 0.689 |
| 16 | 55.8% | 38.0% | **27.3%** | 35.8% | **55.5%** | **4.8%** | 7.0% | 0.417 / **0.657** / 0.568 |

Bars: (1) size with two shocked donors and no effect at most 1/units + 4: 4.5% and 1.5%, holds. (2) two shocks cost
at least 5 points more than one: 12.3 and 10.7, holds. (3) two shocks of twice the effect leave at most 10%: 8.0% and
4.8%, holds. (4) leaving both out comes within 8 points of clean: -1.3 and -0.3 (PDD), +1.7 and -1.8 (PEE), holds.
(5) leaving out one of two twice-size shocks leaves at most 15%: 12.5% and 7.0%, holds. (6) a shocked best match
raises the gap's mean absolute error at least 1.3x: 1.33x and 1.58x, holds (11 units only just). (7) leaving the best
match out does not buy the precision back, at least 1.15x: 1.36x and 1.36x, holds. (8) of PDD and PEE panels not at
rank 1, a shocked donor is listed above the treated unit in 94.7% (1,258 of 1,328; bar 80%): holds.

**What it says.**
- **Each donor's own event takes its share; leaving out the one you know of leaves the other's.** One shocked donor
  costs 14-18 points of rank-1 share, two cost 26-29, and with two shocks twice the effect's size the test is back at
  its no-effect rate (5-8%). Leaving out both beforehand restores the clean rate to within 2 points (52.5-55.5% against
  53.8-55.8%); leaving out one of two restores 35-36%, about the one-shocked rate, and next to nothing when the other
  is large (7-12.5%). Size stays honest throughout (1.5-4.5% with no effect): donors' shocks make the test blind, never
  eager.
- **A shocked best match spoils the estimate more than the test.** When the shocked donor is the treated unit's
  heaviest (half its synthetic control), rank 1 drops only 9-13 points (45.0%, 42.5%), less than a random donor's
  shock, because a donor that tracks the treated unit closely has a small placebo statistic. But the gap's error rises
  1.3-1.6x (the gap moves by about weight times shock), and leaving that donor out beforehand does not buy it back
  (1.36x both sizes): the remaining donors fit the treated unit worse. The mean gap stays near -1 only because the
  shock's sign is drawn at random; a single real panel gets one sign.
- On the two real panels the units above the treated one carry almost no weight (Netherlands 0.000, Norway 0.028;
  Asturias, Cantabria, Valencia 0.000), so their events moved the rank and not the estimate, the "one shocked donor"
  case.

**Ships (decided in the pre-registration).** The FEW DONORS note quotes the two-shocked rank-1 shares at the nearest
of 11 and 16 units (`TWO_SHOCK`, `twoShockRow` in `synth-view.mjs`) and says leaving out the one event you know of is
not enough when another donor had one too. The "ranked above" note now names any listed unit carrying at least 0.2 of
the treated unit's weight (`HEAVY_WEIGHT`; `above` in `--json` gains `weight`), says an event of its own moves the
estimated gap too, quotes the simulated error ratios, and says to report the gap with and without it.
`synth-two-shock.test.mjs` pins the panels, checks the numbers against the confirmatory file and re-checks every bar.

**Limits.** One panel shape, step shocks only, independent loadings; the error ratios are averaged over random signs.
**Next:** a real deployer's panel of stores or regions; a donor with a slope or pulse rather than a step.

### A donor's own event that is not a step: a slope, a pulse, and a word for each listed unit's gap (2026-11-18, pre-registered; all six bars passed)

"Two shocked donors" ended: "a donor with a slope or pulse rather than a step." A donor's own event is often neither
a step nor lasting: a promotion or a strike that wears off, a competitor opening and taking share month by month.
`eval/synth-donor-shape-sim.mjs` (pre-registration `eval/synth-donor-shape-prereg-2026-11-18.md`, committed after an
exploratory run at base 86000 and before the confirmatory one): the same generator and N1 shape at 11 and 16 units,
the treated unit dropping by 1.0 (two noise sd); one donor moved by a step, a **slope** ((h + 1) / 6.5, 0.15 at the
first point after the date to 1.85 at the last) or a **pulse** (3 for four points, then 0), each averaging 1.0 (or
2.0) over the 12 points, sign drawn per panel; in the PB cells the shocked donor is the treated fit's heaviest. Each
panel refitted with that donor left out beforehand. Confirmatory, base 87000, 400 panels a cell
(`eval/synth-donor-shape-confirm.out.txt`):

| units | clean | step 1.0 | slope 1.0 | pulse 1.0 | slope 2.0 | pulse 2.0 | slope / pulse left out | no effect: slope / pulse |
|---|---|---|---|---|---|---|---|---|
| 11 | 54.0% | 40.3% | **34.8%** | **12.3%** | 10.8% | 3.0% | 58.8% / 51.5% | 6.0% / 1.8% |
| 16 | 55.8% | 37.3% | **29.3%** | **14.3%** | 7.3% | 2.8% | 55.5% / 55.3% | 3.8% / 2.0% |

Rank-1 shares (p = 1/units). Bars: (1) size at most 1/units + 4 with a slope or pulse donor and no effect: 1.8-6.0%,
holds. (2) a pulse costs at least 8 points more than a step of the same average: 28.0 and 23.0, holds. (3) a slope
costs at least as much as a step: 5.5 and 8.0 points more, holds. (4) twice the size leaves at most 20% (slope) and
10% (pulse): 7.3-10.8% and 2.8-3.0%, holds. (5) leaving the donor out beforehand comes within 8 points of clean:
51.5-60.8% against 54.0-55.8%, holds. (6) the gap-shape word, below: holds in all four parts.

**What it says.**
- **A short burst takes the rank more often than a lasting step.** A donor's pulse of the same average size as the
  effect leaves rank 1 to the treated unit 12-14% of the time, against 37-40% for a step: the statistic reads the
  after-gap's root mean square, and four points at three times the step have 1.73 times its RMS. A slope sits
  between (29-35%). Size stays honest (1.8-6.0% with no effect), and leaving the donor out beforehand restores the
  clean rate whatever the shape: the advice of "Few donors" holds for any kind of donor event.
- **A light donor's shape leaves the estimate alone; a heavy donor's moves it, whatever the shape.** The mean gap
  stays at -0.92 to -1.07 against the true -1 in every cell with an effect. With the heaviest donor shocked, the average gap's
  error rises 1.4-1.6x for a step, slope or pulse alike (0.600-0.764 against 0.406-0.510); for a slope the
  last-point error rises about as much (1.48x and 1.52x), not more, in these 12-point panels: reported, no bar.
- **A word for the shape of each listed unit's own gap.** `gapShape` (synth-control.mjs) compares the mean square of
  the first third of a placebo's after-gap with the last third's: 'faded' at 6x one way, 'grew' at 6x the other,
  else 'held' (none under 6 points after the date). The ratio was read off the exploratory run (3, 4, 6, 9 and 16
  compared; explore file, last lines) and frozen before the confirmatory run. Pooled over 11 and 16 units, of
  shocked donors listed at or above the treated unit, a pulse was called 'faded' 90.4% of the time (2,383 of 2,635;
  bar 85%), a step 'held' 91.9% (bar 85%), a slope of twice the effect 'grew' 75.0% (bar 65%), a slope of the
  effect's size only 41.8% (reported). Of listed units with no event of their own, 20.2% got a word anyway (4,940 of
  24,463; bar 25%), most in the pulse cells (up to 48% in PPE11), where they carry the shocked donor in their own
  synthetic control: the word then points at a neighbour's event, not their own.

**On the two real panels** (`eval/synth-donor-shape-real.mjs`, `eval/synth-donor-shape-real.out.txt`; a description
run after the confirmatory one, nothing pre-registered): every unit listed above the treated one gets 'grew'
(the Netherlands and Norway above West Germany; Asturias, Cantabria and Valencia above the Basque Country), and so
does each treated unit's own gap. That is not five events found: 12 of West Germany's 16 placebos grew too, as gaps
in GDP per head compound over 14 and 28 years after the date (the Basque panel: 5 grew, 10 held, 1 faded). So,
outside the pre-registration and changing no p, `synthResult` also returns `placeboShapes` (how many of all the
placebos' gaps faded, grew and held), and the note prints that count and, when more than half share a word, says it
singles out no one. The simulation's 12 trendless points are the case where the word helps; a long compounding
after-period is the case where it does not.

**Ships (decided in the pre-registration).** The FEW DONORS note in the CLI and on the page quotes the slope and pulse
rank-1 shares, and with the donor left out, at the nearest of 11 and 16 units (`DONOR_SHAPE`, `donorShapeRow` in
`synth-view.mjs`), and says a short burst in one donor takes the rank more often than a lasting step of the same
average size. The "ranked above" note gives each listed unit's own gap shape when it faded or grew, then says what
the word means and quotes the rates, including the 1 in 5 units with no event that get one (`SHAPE_RATES`); `--json`'s
`above` gains `gapShape`. `synth-donor-shape.test.mjs` pins the panels and `gapShape`, checks the numbers against
the confirmatory file and re-checks every bar.

**Limits.** One panel shape (N1, 12 points after the date; the thirds are 4 points each, so shorter after-periods
label less reliably), two non-step shapes, independent loadings, one shocked donor. **Next:** a real deployer's panel
of stores or regions (short after-periods, where the word should help); a slope or pulse on two donors; a shape word
read against the panel's own trend (detrended thirds) for long compounding series.

### The shape word against the panel's own trend (2026-11-18, pre-registered; bar 1 fails by 0.4 points, not shipped)

"A donor's own event that is not a step" ended: "a shape word read against the panel's own trend (detrended thirds)
for long compounding series". On West Germany 1990, 12 of 16 placebos' gaps 'grew', because gaps in GDP per head
compound for 14 years whatever happened, so the word named nearly everyone. `panelShapes` (synth-control.mjs) takes
every unit's gap (treated and placebos), finds the median of log(last-third over first-third mean square), the
panel's **centre**, and, when the centre itself reaches the frozen ratio 6 (the median unit would be called 'grew'),
words each unit by how far it stands from the centre at the same ratio; otherwise the plain word stands. No new
constant. An all-relative variant (always subtract the centre) was tried first in the exploratory run and cost the
trendless panels' sensitivity, so it was not tested.

`eval/synth-shape-trend-sim.mjs` (pre-registration `eval/synth-shape-trend-prereg-2026-11-18.md`, committed after
the exploratory run at base 88000 and before the confirmatory one): three families at 11 and 16 units, one donor with
its own step, slope or pulse. **Trendless**: the donor-shape cells, unchanged. **Wandering**: a random walk of step sd
0.15 or 0.3 on top of noise. **Growing**: compounding levels like GDP per head, each unit with its own persistent
growth deviation, calibrated so the median panel's centre is 6-8. Confirmatory, base 89000, 400 panels a cell
(`eval/synth-shape-trend-confirm.out.txt`), pooled:

| family | line | plain | hybrid |
|---|---|---|---|
| trendless | pulse 'faded' / step 'held' / big slope 'grew' | 90.3% / 93.2% / 77.0% | 90.3% / 93.2% / 76.8% |
| trendless | clean units listed above given a word | 20.3% | 20.3% |
| wandering | big slope 'grew' | 70.7% | **68.8%** |
| wandering | clean units listed above given a word | 29.2% | 28.7% |
| growing | clean units listed above given a word | **70.1%** | **41.6%** |
| growing, panels where the rule switched on (49%) | clean units listed above given a word | 80.2% | **22.2%** |
| growing | all placebos 'grew' | 51.1% | 27.2% |
| growing | pulse 'faded' | 74.3% | 78.4% |
| growing | slope 'grew' (1x / 2x the effect) | 86.9% / 96.0% | 32.7% / 33.0% |

Bars: (1) hybrid within 1.5 points of plain on every trendless and wandering line: **fails** on one line, wandering
big slope 'grew', 1.9 points (70.7% to 68.8%; the rule switched on in 1-3% of wandering panels and there it can
read a donor's slope as the panel's own trend); every other line within 0.6. (2) the earlier bars under the hybrid
word: 90.3%, 93.2%, 76.8%, 20.3%, all hold. (3) growing, clean units given a word at least 20 points fewer: 28.5,
holds. (4) where the rule switched on, at most 30%: 22.2%, holds. (5) pulses still named: 78.4% against 74.3%,
holds. (6) 'grew' at most 60% of plain's share: 27.2% against 51.1%, holds.

**What it says.**
- **On compounding panels the plain word names most units; read against the panel it names about one in five.**
  Where the median gap grew six times or more, 80% of clean units listed above the treated one got a word, against
  22% with the hybrid word, about the trendless panels' 20%.
- **A donor's own slope cannot be told from the panel's growth.** With the hybrid word a slope donor in a growing
  panel is called 'grew' about a third of the time, close to the 27% of all placebos that get it. The plain word's
  86-96% was no better: 70% of clean units got a word too. On these panels, neither word picks out a slope.
- **On West Germany 1990** (`eval/synth-shape-trend-real.mjs`, a description run after the confirmatory one): the
  centre is 21.8 and the hybrid word calls 2 of 16 placebos 'grew' (Norway, Spain), 4 'faded' (Japan, Greece,
  Australia, New Zealand: their gaps grew much less than the panel's) and 10 'held'; West Germany's own gap 'held'.
  The Basque panel's centre is 2.4, so its words are unchanged.

**Not shipped (decided in the pre-registration).** Bar 1 failed, so `panelShapes` and `relShape`, `shapeCentre`
and `shapeRelative` on `synthControlTest`'s result stay in the module only. The CLI, page and `--json` keep the
plain word and the existing "most share the word" note. `synth-shape-trend.test.mjs` pins `panelShapes`, the two
real panels, the unchanged CLI output, and re-checks every bar against the confirmatory file.

**Limits.** The growing family is one generator with one persistence (AR 0.9). Twelve points after the date. The
switch is all or nothing at the centre 6. **Next:** a fresh pre-registration whose bar 1 is scored only on the
panels where the rule switches on, with the wandering cost reported beside it; or the hybrid word offered as an
option, not the default, with this table quoted.

### The panel word as an option: `--shape-word panel` (2026-11-18, later; an opt-in, no new test)

The section above ended with two ways forward; this takes the second. The pre-registration said a failed bar 1 keeps
the panel-relative word off the default, and it stays off. But on a long compounding panel the default word is close
to useless (80% of clean units listed above the treated one got a word where the rule switches on), and the one bar
that failed was missed by 0.4 points on a line where the rule switched on in 1-3% of panels. So a person reading a
GDP-per-head panel can now ask for the panel word, and the note tells them what it buys and what it costs, quoting the
confirmatory file:

- **CLI:** `--shape-word plain|panel` with `--donors` (default `plain`; anything else is refused; without `--donors`
  it is refused like `--anticipation`).
- **Library:** `synthResult({ ..., shapeWord: 'panel' })` words `above[].gapShape` and `placeboShapes` with
  `relShape`, and adds `shapeWord`, `shapeCentre` (the median unit's last-third over first-third mean-square ratio) and
  `shapeRelative` (whether that centre reached 6) to the result and `--json`. The default result has none of the three,
  so existing `--json` readers see no change.
- **Page:** a "Word the donors ranked above it" select beside the anticipation box, passed through the worker job.
- **The note** (`synth-view.mjs` `panelShapeNote`, rates in `PANEL_SHAPE`, each pinned to its line in
  `eval/synth-shape-trend-confirm.out.txt`): where the centre reached 6, it gives the centre, what each word now means,
  the panel's own counts, and then the confirmatory rates: 22% of clean listed units worded against 80% for the plain
  word; pulses still called 'faded' 78% (plain 74%); a donor's own big slope called 'grew' only 33%, about the 27% of
  all placebos, so 'held' does not clear a unit of a slope; and the wandering-panel cost (68.8% against 70.7%) that kept
  it off the default. Below a centre of 6 it says the plain words stand, and gives the plain note.
- **The plain note** now ends its "most share the word" clause with a pointer to `--shape-word panel`.

What it prints on West Germany 1990 (`node cli.mjs data/oecd-gdp-per-capita-1960-2003.csv --column WestGermany
--known-date 1990 --donors all --window 1960:2003 --shape-word panel`): the centre is 21.8; of the two units ranked
above West Germany, the Netherlands' gap 'held' and Norway's 'grew' (plain: both 'grew'); over all 16 placebos 4
faded, 2 grew and 10 held (plain: 0, 12, 4). Rank 3 of 17 and p 0.176 are the same under either word: the word is a
description and changes no p. The Basque Country 1970 (centre 2.36) reads the same either way.

`synth-shape-trend.test.mjs` pins the West German and Basque outputs, that the test is identical under both words, the
default `--json` unchanged, every `PANEL_SHAPE` rate against the confirmatory file, the refused values, and the
option's path through the CLI, the worker job and the page.

**Not done:** the fresh pre-registration scored only where the rule switches on, which would decide whether the panel
word can become the default.

### The panel word scored where it switches on (2026-11-18, pre-registered; bars 3 and 4 fail, the plain word stays the default)

"The panel word as an option" left one thing undone: a fresh pre-registration scored only on the panels where the rule
switches on, to decide whether `--shape-word panel` can be the default. The two words are identical on every panel
where the panel's centre stays under 6, so the earlier bar 1, pooled over all wandering panels, was diluted by panels
where nothing could differ. This round scores only the switched panels, and asks a question the earlier one did not:
is a donor with its own event worded **more often than a clean unit** where the panel word is in force?

`eval/synth-shape-switch-sim.mjs` (pre-registration `eval/synth-shape-switch-prereg-2026-11-18.md`, committed after
the exploratory run at base 89000 and before the confirmatory one) runs every cell of the earlier simulation plus two
growing generators it did not have (growth deviations AR(0.7) and AR(0.97)), 80 cells. Confirmatory, base 93000, 400
panels a cell, 32,000 panels (`eval/synth-shape-switch-confirm.out.txt`). The rule switched on in 41.5% of growing
panels (28.5% at AR(0.7), 50.7% at AR(0.97)), 0.8% of wandering ones and 1 of 8,000 trendless ones. On the 5,982
switched growing panels:

| line | plain | panel |
|---|---|---|
| clean units given a word (all placebos / listed above the treated one) | 67.5% / 80.1% | **28.9% / 22.6%** |
| pulse donors called 'faded'; lift over clean units | 71.5%; 68.7 pts | **92.6%; 77.1 pts** |
| slope donors called 'grew'; lift over clean units | 86.6%; 21.9 pts | **8.6%; -4.9 pts** |
| slope donors given any word; lift over clean units | 87.8%; 20.3 pts | **14.2%; -14.7 pts** |
| big slope (twice the effect) called 'held' | 7.2% | **89.6%** |
| step donors called 'held' | 69.8% | 63.9% |

Bars: (1) clean units worded at least 25 points less: 38.6, holds. (2) pulse lift at least plain's: 77.1 against 68.7,
holds. (3) slope lift at least plain's minus 5: -4.9 against 21.9, **fails**. (4) slope flag lift at least 0: -14.7,
**fails**. (5) bar 1 in each growing generator: 37.7, 35.0 and 41.3 points, holds. The exploratory run had predicted
3 and 4 would fail (slope flag lift -13.7); the pre-registration said so and kept the bars.

**What it says.**
- **Where it is in force, the panel word hides a donor's own slope.** A slope from the date grows linearly; a
  compounding gap grows faster, so against the panel's centre a slope looks ordinary and reads 'held'. A big slope was
  called 'held' 90% of the time, and slope donors were worded less often than units with no event of their own. The
  earlier test's 33% 'grew' was pooled over growing panels where the rule mostly stayed off; where it was on, 9%.
- **It is better at everything else.** Clean units worded 29% against 68%, pulses named 92.6% against 71.5%.
- **Neither word is enough alone.** The plain word flags slopes (lift 20 points) but words two thirds of clean units;
  the panel word is quiet and names pulses but cannot see slopes. Reading both is what tells them apart.

**Shipped (decided in the pre-registration).** The plain word stays the default. Under `--shape-word panel`:
- every unit in `above` (and `--json`) carries `plainShape`, its plain word, beside `gapShape`; the default result
  has no `plainShape`, so default `--json` readers see no change;
- where the rule is on and the two words differ, the "ranked above" list gives both: on West Germany 1990, "the
  Netherlands ... its own gap held against the panel's growth, but grew towards the end on its own reading";
- the note quotes the switched-panel rates (`PANEL_SHAPE` in `synth-view.mjs`, each pinned to the confirmatory block
  "growing-all | switched"), says a big slope was called 'held' 90% of the time (plain 7%), and that a unit held
  against the panel that grew on its own reading is the one to look into for a slope. The earlier rates, pooled over
  panels where the rule was off, are no longer quoted.

`synth-shape-switch.test.mjs` re-checks every bar against the confirmatory file, pins `PANEL_SHAPE` to it, and the
simulation's 80 cells; `synth-shape-trend.test.mjs` pins `plainShape` and the two-word wording on West Germany and the
Basque Country (centre 2.36: the words agree, so nothing changes).

**Limits.** Twelve points after the date and thirds of four points each: a slope and a compounding gap differ in
curvature, which four-point thirds barely see. One shape of slope (linear from the date). Wandering panels switched in
81 of 9,600, too few for a bar. **Next:** a word that reads curvature (the middle third against the line through the
outer two) so a linear slope can be told from compounding growth, pre-registered on these cells.

### A curvature word: a slope runs straight, a compounding gap bends (2026-11-18, pre-registered; all six bars passed, ships under `--shape-word panel`)

"The panel word scored where it switches on" ended: "a word that reads curvature (the middle third against the line
through the outer two) so a linear slope can be told from compounding growth, pre-registered on these cells." On
growing panels where the panel word is in force, it called a donor's own big slope 'held' 90% of the time, while the
plain word flagged slopes but also worded two thirds of the units with no event of their own.

`gapBend` (synth-control.mjs) takes the after-gap's signed means over its first, middle and last thirds a, b, c and
returns (b - (a + c) / 2) / (c - a): how far the middle third sits from the straight line through the outer two, as a
share of that line's rise. 0 for a straight line, below 0 when the gap speeds up, above 0 when it slows.

**What the exploratory run showed first** (`eval/synth-shape-curve-explore.out.txt`, base 95000, 8,000 panels): the
idea as named was wrong in one way. Clean units' gaps on compounding panels are **not** systematically convex: the bend
of the clean units the plain word calls 'grew' has median -0.07 and spreads from -0.31 to 0.16 (10th to 90th
percentile). Their spread grows with time, but each gap is a smooth random path that bends either way. A donor's slope
is a straight ramp added on top, so its bend stays near the line (-0.15 to 0.04). So the reading is two-sided:
**straight** means the plain word is 'grew' and the bend lies in [-0.15, 0.10] (`STRAIGHT_BAND`, `gapStraight`), the
band with the best odds ratio of nine candidates listed in the exploratory file, frozen in
`eval/synth-shape-curve-prereg-2026-11-18.md` before the confirmatory run.

`eval/synth-shape-curve-sim.mjs` runs the same 80 cells as the switched-panel re-test (trendless, wandering, three
growing generators, 11 and 16 units, one donor with its own step, slope or pulse) and records every placebo's plain
word, panel word and bend. Confirmatory, base 97000, 400 panels a cell, 32,000 panels
(`eval/synth-shape-curve-confirm.out.txt`). On the 5,995 growing panels where the panel word was in force:

| line | plain 'grew' | straight |
|---|---|---|
| slope donors flagged (shock 1 and 2) | 86.0% | 73.3% |
| big slope (twice the effect) flagged | 91.5% | **82.6%** |
| clean units flagged (all / listed above the treated one) | 64.6% / 78.6% | **36.7% / 51.7%** |
| slope lift over clean units | 21.4 pts | **36.6 pts** |
| odds ratio, slope donor against clean unit | 3.37 | **4.74** |
| pulse donors flagged | 3.9% | 0.0% |
| step donors flagged | 21.8% | 14.2% |
| share of flagged units that are the slope donor (panels with one) | 10.1% | 14.1% |

Bars: (1) lift at least plain + 8: 36.6 against 29.4, holds. (2) odds ratio at least 1.2x plain: 4.74 against 4.04,
holds. (3) clean units flagged at least 20 points below plain: 27.9, holds. (4) big slope at least 75%: 82.6%, holds.
(5) bar 1 in each growing generator: 34.6 against 28.0 (AR 0.9), 32.0 against 30.6 (AR 0.7, the closest), 41.4 against
29.9 (AR 0.97), holds. (6) pulses at most 5%: 0.0%, holds.

**What it says.**
- **A straight line is a sharper pointer at a slope than "grew".** On compounding panels it keeps three quarters of a
  donor's slopes and drops more than half of the clean units "grew" would flag; the odds that a flagged unit is a slope
  donor rather than a clean one rise 1.4x.
- **It is still only a pointer.** Half the clean units listed above the treated unit read straight too, and where a
  panel had one slope donor among 10-15 others, 14% of the units read straight were that donor. A straight line says
  which unit to look into first, not that it had an event.
- **Off compounding panels it would cost.** On trendless panels "grew" already separates slopes well (odds ratio 13);
  requiring a straight line halves the slopes found (50% to 23%). So the line is read only where the panel word is in
  force, which on these cells is almost only the growing panels (7 of 8,000 trendless, 70 of 9,600 wandering).
- **On West Germany 1990** (a description, not pre-registered): of the two units ranked above West Germany, the
  Netherlands (held against the panel, grew on its own reading) has bend -0.001, a straight line; Norway (grew on
  both) has bend -0.18, speeding up, the shape of an oil economy compounding rather than a ramp. The Basque Country 1970
  (centre 2.36) is unchanged: the panel word is not in force there, so no line is read.

**Shipped (decided in the pre-registration).** Under `--shape-word panel`, on panels where the panel word is in force,
each unit listed above the treated one whose plain word is 'grew' is said to have grown "along a straight line from the
date (the shape of a slope of its own)" or to be "bending like the panel's compounding gaps rather than along a
straight line"; `above[]` gains `bend` and `straight` in that mode only (default `--json` unchanged); the note quotes the
rates above (`CURVE` in `synth-view.mjs`, each pinned to the confirmatory block "growing-all | switched"), clean units
and precision included. The default word and every p are unchanged. `synth-shape-curve.test.mjs` re-checks every bar,
pins `CURVE`, `gapBend` on fixed shapes and the West German reading.

**Limits.** One slope shape (linear from the date); a slope that itself compounds (a share taken month by month on a
growing base) would read as bending. Twelve points after the date, thirds of four. **Next:** a real deployer's panel
of stores or regions with a known slope event; the line read on wandering panels if a set switches there often enough
to score.

## Currency pegs: the update-rate check against documented dates (2026-11-18, pre-registered; D1 fails, a hang fixed)

The update-rate check ("When a series starts updating less often") had only ever been scored in
simulation; on real series it was descriptive, because nothing labelled when a real feed began or
stopped repeating. A currency peg is a public, dated change in how often a price moves: while a
central bank holds the rate, the Federal Reserve's daily noon quote repeats; when the peg ends it
moves. `eval/update-rate-pegs.mjs` (header committed in 72a54cb22 before the script first ran on the
data) wrote down seven peg dates from the historical record, before any series was looked at, and
ran the shipped check, unchanged, on the H.10 daily rates (via FRED, repackaged under the PDDL by
github.com/datasets/exchange-rates; `sh eval/fx-pegs-fetch.sh fx-data`, not committed, 7.6 MB). An
event counts as dated when a change in the stated direction has a date range within 10 trading
days of it. Bars: D1, at least 5 of 7 dated; D2, median range width at most 60 rows.

| event | documented | the check (`eval/update-rate-pegs.out.txt`) |
|---|---|---|
| E1 China, peg ends | 2005-07-21 | **dated** 2005-07-22, range 07-14 to 07-29 (11 rows), repeats 88% to 6% |
| E2 China, re-peg near 6.83 | mid-2008 | missed |
| E3 China, re-peg ends | 2010-06-21 | missed |
| E4 Malaysia, peg at 3.80 | 1998-09-02 | **dated** 1998-09-09, range 08-31 to 09-10 (8 rows), 2% to 91% |
| E5 Malaysia, peg ends | 2005-07-21 | **dated** 2005-07-22, range 07-19 to 07-27 (6 rows), 91% to 7% |
| E6 Venezuela, fixed rate | 2003-02-05 | **dated** 2003-01-23, range 01-14 to 01-27 (9 rows), 8% to 91% |
| E7 Thailand, baht floated | 1997-07-02 | missed (a change on 1997-04-24, range to 05-27) |

**Verdict: D1 fails (4 of 7), D2 passes (median width 8.5 rows).** Nothing in the check changes on
this file. Where a peg froze the quote, the check dated it to within one to two weeks, and the
ranges held the date three times of four (E6's documented date, 2003-02-05, is when the fixed rate
was set; trading had been suspended on 2003-01-22, inside the range).

**Why the three misses** (post hoc, looked at after the verdict, deciding nothing):

- **E2, E3.** From mid-2008 to mid-2010 the yuan was held near 6.83, but the New York noon quote kept
  moving by a few hundredths every day (6.8215, 6.8429, 6.8510 in the first days of 2008-09): 0 to 6
  repeats a month before, during and after. In this record the second peg did not change how often the
  quote repeated, so silence is the right answer for an update-rate check; the event list assumed a
  peg means repeats, and for a band held by intervention it does not. A level or volatility model is
  the tool for that one.
- **E7.** The baht left its basket in practice before the announcement: speculative attacks from May
  1997 and a two-tier market from 1997-05-15 made the quote move daily (25.37 on 05-15, 22.75 on
  06-17). The check's change is dated 1997-04-24 with a range to 05-27, which holds the attacks, not
  the float. The record is right; the documented date is not when the quote changed.
- **The changes no event names** (D3, descriptive) are mostly real too: the yuan's 1994-02-15 change
  (61% to 12%) follows the 1994-01-01 unification of its official and swap rates; the Australian
  dollar's 1972-01 to 1974-12 stretch of 85% repeats is its fixed US dollar link from the Smithsonian
  agreement to the trade-weighted basket of 1974-09-25 (dated late, 1974-12-24, range from 10-31). The
  other floating currencies' changes are all in the 1970s, where repeats fell from 4-24% to 1-6%,
  consistent with quotes gaining precision; nothing here labels them.

**A hang, found and fixed.** Cut to its 1998-1999 window, the ringgit series made the check run for
hours (the whole 55-year series escaped only because its pegged stretch, 1998-09 to 2005-07, has a
median move of 4.5 ticks, so the one-tick test never ran on it; the first six months move 1 tick). One day of the peg reads
3.8950 among a hundred 3.8000s, 950 ticks off. The pegged stretch moves mostly one tick, so the
one-tick stale-feed likelihood ran on it, and its grid's kernel spans the stretch's largest move: the
work grows roughly with that move's square (on 120 steps, 16 s at 5 ticks, about a minute at 20 to 40),
so a pasted pegged-currency series would hang the CLI and the page's worker. `staleLRMarkov` now has
`maxJump: 50`: a stretch with a move over 50 ticks is not a slow walk, so the test is not run (null),
as for a stretch too short or too long, and the median-move test alone decides "rounding". Every
simulated series in the threshold's calibration and the pre-registered rounds (seeds 6, 31, 20261216,
20261217, all cells) moves at most 45 ticks anywhere, so no committed verdict moves; the peg run's
output is byte-identical with and without the cap. Test: `update-rate-pegs.test.mjs` (the 1998 window
dated and finishing in milliseconds, Venezuela 2003, the cap, the committed verdict).

Next: an update-rate check that can be wrong about a band, not only a fixed quote, needs a fresh
labelled set of documented feed changes (a provider's announced switch from daily to weekly
publication, a sensor's logged firmware change), not more pegs.

## A provider's own schedule changes: US states moving to weekly COVID-19 reporting (2026-11-18, pre-registered; D1 and D2 pass)

The peg round above asked for "a fresh labelled set of documented feed changes (a provider's announced
switch from daily to weekly publication)". Johns Hopkins CSSE's COVID-19 repository keeps exactly that:
its README's "Irregular Update Schedules" section records, state by state, when each health department
moved to publishing fewer days a week ("Minnesota: Providing data once per week (Thursdays) (as of June
30, 2022). ~~Providing data Monday-Friday.~~"). In JHU's daily time series a day with no publication
repeats the day before, so Monday-Friday reporting repeats on about 2 days in 7 and weekly reporting on 6.

`eval/update-rate-covid-schedules.mjs` (header committed in 6579a37ec before the script first ran on the
series; only the README had been read) wrote down 27 primary events, every US line giving a dated switch
to once a week *and* naming the more frequent schedule it replaced, and 19 secondary schedule changes,
with the rules for leaving lines out (weekly to weekly, no prior schedule, state and county figures on
different schedules, undated, too close to the series' end). It ran the shipped check, unchanged, on each
state's cumulative confirmed cases (county rows summed, 2020-01-22 to 2023-03-09, 1,143 days;
`sh eval/covid-schedules-fetch.sh covid-data`, 17.8 MB, not committed). Same scoring as the pegs: an event
is dated when a change in the stated direction has a range within 10 days of it. Bars: D1, at least 19 of
27 dated; D2, median range width at most 60 rows.

**Verdict: D1 passes (20 of 27), D2 passes (median width 13.5 days)** (`eval/update-rate-covid-schedules.out.txt`).
Sixteen of the twenty are dated within three days of the README's date (all within ten), most with repeats
rising from 30-35% to 82-86%; the switches from a sparser schedule (Monday/Wednesday/Friday, Monday-Saturday;
mostly about 60% repeats) to weekly are dated with wider ranges (17-31 days against 8-16), as the smaller jump predicts.
Nothing in the check changes on this file.

| | events | dated | typical move in repeats |
|---|---|---|---|
| Mon-Fri or daily to weekly (or Thursdays only) | 19 | 14 | 30% to 85% |
| Mon/Wed/Fri, Tue+Fri or Mon-Sat to weekly | 8 | 6 | 59% to 84% |

**The seven misses** (post hoc, read after the verdict, deciding nothing):

- **The schedule never reached JHU's numbers (4).** California and Texas repeat on 0% of days through 2022
  (the series moves every day, so whatever the state's own schedule, JHU's figures for it kept changing
  daily, presumably from county sources; the README does not say); Missouri and New Hampshire stay at 22-47% repeats a
  month, a Monday-Friday pattern, until 2023. The record has no switch to date, so silence is the right answer,
  as for the yuan's 2008 re-peg.
- **The record switched at another time (2).** District of Columbia and Kentucky rose to 55-74% repeats in
  March-April 2022, then fell back to 20-55% for months; the lasting weekly pattern starts in October 2022, and
  the check dates it there (DC 2022-10-14, Kentucky 2022-09-20).
- **Two days outside the window (1).** South Dakota is weekly in the record from mid-March 2022; the check dates
  2022-03-18 with a range to 03-31, the window opens on 04-02 (README date 04-12).

**Secondary changes (D3, descriptive).** Moves to fewer days that are not weekly: 5 of 11 dated (Indiana and
Idaho to Monday/Wednesday/Friday within six days; Alaska 2021-12; Oregon to Monday-Friday 2021-07, early
by a week). Moves back to more days: **0 of 8**. They were short and small: Vermont, Arkansas and Alabama
returned to daily publication in late summer 2021 (Delta) and repeats fell from 13-32% to 0% for a few months.
At the shipped penalty (2 x 2 log n per cut, about 28 here) two cuts around a two-month stretch with no
repeats inside a stretch averaging about 20% do not pay for themselves, so the check stays quiet. That is the
cost of the setting chosen for 0.010 false changes a series in simulation: it dates large, lasting changes in
how often a feed publishes and misses brief, modest ones.

**Changes no event names (D4, descriptive).** On 16 of the 27 primary states the check dates a rise in repeats
between 2021-04 and 2021-07 (six of them at 2021-07-02 to 07-04), mostly from 0-4% to about 30%. That is a
Monday-Friday pattern starting in spring and summer 2021, six of them on the July 4 weekend, when many states stopped weekend reporting;
the README lists most of those states as "Monday-Friday" without a date, so nothing here scores it.

Test: `update-rate-covid.test.mjs` on `data/covid-schedules.csv` (six states, every day; CC BY 4.0, JHU CSSE,
`data/SOURCE.md`): Minnesota, Utah and Vermont dated to the committed days; South Dakota's change two days
before the window; California's empty 2022; Kentucky's autumn change; the committed verdict.

Next: a moving-back check (more often) needs either a lower penalty for that direction, which would have
to be pre-registered on simulated short returns first, or a set where publication resumes for longer than
a few months.

## Short returns to more frequent updates: a scan for them, pre-registered twice (2026-11-18; both rounds fail, not offered)

The COVID-schedules round above dated 0 of the 8 documented moves *back* to more frequent publication:
Vermont, Arkansas and Alabama resumed daily figures for a few months in late summer 2021, and two cuts at
2 x 2 log n each do not pay for a two-month dip in repeats. Its "Next" asked for a lower penalty for that
direction, pre-registered on simulated short returns first. This is that test.

**The pass** (`shortReturns` and `bestReturn` in `update-rate.mjs`). Inside each stretch the shipped check
finds, it looks for the single interval with fewer repeats than the rest of the stretch. The parts before and
after share one two-state chain, because the old schedule came back. The pass costs one penalty, `m x 2 log n`,
instead of two cuts. It never moves the shipped cuts. `eval/update-rate-returns.mjs` fixed the cells, the
choice rule and the bars before any cell ran (commit 8875e1fa2). Null cells: the six chains of the original
calibration at n 300 and 600, plus three publication schedules at n 1,100 (Monday-Friday, Monday/Wednesday/Friday,
and daily turning into Monday-Friday for good). Power cells: Monday-Friday with 30, 60 or 90 days of daily
publication, and independent repeats at 25% with 60 days at 2%. Choice: the smallest m whose false returns are at
most 0.010 a series in every null cell. Confirmation bars: R1, false returns at most 0.020 in every null cell; R2, the
60-day return found (start within 10 days) in at least 120 of 200 series; R3, at least 60 more than the shipped check
alone finds.

**Round 1, m from 0.5 to 2 (`eval/update-rate-returns.out.txt`): no m met the choice rule.** At m 2 the worst null
cells were Monday/Wednesday/Friday 0.085, M60 at n 600 0.050 and B60 at n 300 0.045 false returns a series. Taking
the best interval over every start and end is a scan statistic, and a scan needs a larger penalty than one cut.

**Round 2, m from 2 to 4, fresh seeds (pre-registered after round 1's file, before it ran;
`eval/update-rate-returns-2.out.txt`): m 3 chosen; R1 passes, R2 and R3 fail.**

| confirmation seed 20261221, m 3 | found of 200 | shipped check alone |
|---|---|---|
| worst null cell, false returns a series | 0.000 | |
| 30 days of daily inside Monday-Friday | 0 | 0 |
| 60 days | **0** (bar 120) | 0 |
| 90 days | 42 | 0 |
| 60 days at 2% inside independent 25% | 23 | 1 |

At the false-alarm budget the check already keeps (about 0.01 a series), a two-month return from 30% repeats to
3% cannot be told from chance clumps in the same series. The calibration seed shows how steep the trade is: the
60-day return is found in 105 of 200 at m 2 (0.090 false in the worst cell), 37 at m 2.5 (0.015) and 0 at m 3. The
real check (J1, JHU's eight returns) ran only if R1 to R3 passed, so it did not run. `shortReturns` stays in the
module with `SHORT_RETURNS.mult = null`, so it returns nothing unless a caller passes a penalty. Nothing the CLI or
the page prints changes.

**What binds** (post hoc, read off the two files, deciding nothing): the Monday/Wednesday/Friday null is the
highest cell in both rounds (0.090 at m 2, 0.015 at m 2.5, where every other cell is at most 0.005). A two-state
chain describes a fixed weekly schedule badly: whether today repeats depends on the day of the week, not on
yesterday. The scan then finds intervals where chance happens to line up with the chain's misfit. Short returns
cost that much because the cost model ignores the calendar, not because 60 days is too little data: a return to
daily publication changes about 17 weekend days from repeating to moving.

Next: a day-of-week repeat cost (one repeat probability per weekday in each stretch, for daily series with dates),
pre-registered on the same cells. It should tighten the periodic nulls and sharpen exactly these returns. Then
JHU's eight returns, which are seen data.

Test: `update-rate-returns.test.mjs` (the pass finds a planted return and its edges, looks only for fewer repeats,
is off by default, and both rounds' committed verdicts).

## Short returns, with the day of the week: a weekday cost, pre-registered (2026-11-18; round 3 fails R2 by 4 series, not offered)

The round above ended on its own diagnosis: the two-state chain ignores the calendar, so a fixed weekly
schedule looks like clumps, and the penalty that silences those clumps also buries a two-month return. This
round replaces the region model with the calendar. `bestReturnCost` in `update-rate.mjs` takes a weekday per
step and one of two costs: `'dow'`, one repeat probability per weekday in each region (7 inside, 7 shared by
the parts before and after), and `'dowchain'`, a two-state chain per weekday (14 a region). Its `'chain'` kind
reproduces the shipped pass's gain to 1e-6. `eval/update-rate-returns-dow.mjs` (header and module committed
in cc37d9d05 before any cell ran) kept rounds 1 and 2's 15 null cells, 4 power cells, FOUND rule and R1-R3
bars, and set the grid (m 2 to 6), fresh seeds and the choice: per cost the smallest m with at most 0.010 false
returns a series in every null cell, then the cost with more R60 finds at its m.

**Calibration (seed 20261222, `eval/update-rate-returns-dow.out.txt`).** The weekday cost finds what the chain
cannot: at m 3, 199 of 200 sixty-day returns and 161 of 200 thirty-day ones, against 0 and 0 for round 2's
chain on the same series. It fails the null budget on the clumpy chains, not the schedules: M60 still raises
0.020 false returns a series at m 6 (W3, round 2's worst cell, is at 0.000 from m 3). A weekday Bernoulli has no
memory, so a run of repeats in a series that clumps reads as a calendar stretch. The weekday chain adds that
memory and pays for 14 parameters a region: it meets the budget only at m 5, where R60 is found in 123 of 200.

| calibration, found of 200 (worst null cell) | m 3 | m 4 | m 5 | m 6 |
|---|---|---|---|---|
| `'dow'` R60 | 199 (M60 0.575) | 199 (0.225) | 198 (0.075) | 170 (0.020) |
| `'dowchain'` R60 | 184 (B60 0.780) | 184 (B60 0.060) | **123 (0.005)** | 7 (0.000) |
| round 2's `'chain'`, m 3 | 0 (0.000) | | | |

**Confirmation (seed 20261223, `'dowchain'` at m 5): R1 passes (no false return in any null cell), R3 passes
(116 more than the shipped check's 0), R2 fails: 116 of 200, bar 120.** So the pass is not offered, and the
JHU check (J1, the eight documented returns, seen data) did not run, as pre-registered. `SHORT_RETURNS.mult` stays
null; nothing the CLI or the page prints changes. The thirty-day return is found in 0 and the independent-repeats
cell I60 in 0 (it has no weekly pattern for the weekday cost to use, and the chain reference finds 31).

**What binds** (post hoc, read off the file, deciding nothing): the two costs fail on different cells. `'dow'` has
the power (199 of 200 at every m to 5) and loses only the clumpy chains with no weekly schedule; `'dowchain'` holds
every null but spends its margin on parameters a fixed schedule does not need. That points at choosing the model
per stretch rather than one cost for all: the weekday cost where the stretch shows a weekly pattern (a weekday
share test on the stretch, the same kind of test that already chooses "rounding" over a stale feed), the chain
where it does not. Pre-registered on fresh seeds, with these cells.

Test: `update-rate-returns-dow.test.mjs` (the generic chain cost equals `bestReturn`, the weekday costs find the
planted return with about twice the chain's gain or more, a fixed weekly schedule gains nothing, weekdays from ISO
dates, and the committed verdict).

## Short returns: the model chosen per stretch (2026-11-18, pre-registered; R1-R3 pass, the real check J1 fails 3 of 8, not offered)

Round 3 above ended by pointing at a choice per stretch: the weekday cost where the stretch has a weekly
pattern, the chain where it does not. This round tests exactly that. `weeklyPatternLR` in `update-rate.mjs`
scores a stretch by the likelihood ratio of a two-state chain per weekday (14 parameters) against one two-state
chain (2). Under a chain with no calendar it is about chi-square on 12 degrees of freedom, so clumps alone do not
read as a schedule (the plain weekday-share test would: a sticky chain inflates it). `WEEKLY_TEST.crit` is the
0.999 quantile, 32.909, fixed before any cell ran, not tuned. A stretch above it has its return scored with
`'dow'`, any other with the fallback. `eval/update-rate-returns-auto.mjs` (header, rule and function committed in
73e05bb58 before any cell ran) kept the 15 null cells, the 4 power cells, FOUND, R1-R3 and the J1 bar, with fresh
seeds and two arms by fallback: `'dow|chain'` and `'dow|dowchain'`.

**Calibration (seed 20261224, `eval/update-rate-returns-auto.out.txt`).** The test sorts the cells as intended:
every Monday-Friday and Monday/Wednesday/Friday stretch reads as weekly, W5c's daily half does not, and at most
0.5% of the chain-null stretches do. `'dow|chain'` meets the null budget at m 3 and finds 198 of 200 sixty-day
returns there. `'dow|dowchain'` needs m 5 (196), so `'dow|chain'` at m 3 was chosen.

**Confirmation (seed 20261225, `'dow|chain'` at m 3): all three simulation bars pass.**

| confirmation, found of 200 | per stretch, m 3 | `'dow'` alone, m 3 | round 2's chain, m 3 |
|---|---|---|---|
| worst null cell, false returns a series | **0.000** (R1, bar 0.020) | 0.590 (M60 n600) | 0.000 |
| 30 days of daily inside Monday-Friday | 167 | 167 | 0 |
| 60 days | **200** (R2, bar 120) | 200 | 0 |
| 90 days | 200 | 200 | 42 |
| 60 days at 2% inside independent 25% | 23 | 8 | 23 |

R3 passes too (200 more than the shipped check alone). So the real check ran, as pre-registered: JHU's eight
documented returns to more frequent reporting, seen data (README "A provider's own schedule changes").

**J1 fails: 3 of 8 dated, bar 4.** Idaho (Monday-Friday to daily, 2021-09-11) is dated 2021-09-06, a 62-day
return with 3% repeats inside and 24% around; Vermont (2021-08-21) on the day; Michigan (Tuesday and Friday to
Monday/Wednesday/Friday, 2021-08-09) the day before. Arkansas, Alaska, Nebraska and South Dakota are missed.
Alabama's return is found but dated 2021-07-17, two months before the documented 2021-09-17, so it does not
count. The pass stays in the module, off: `SHORT_RETURNS.mult` is still null, and nothing the CLI or the page
prints changes.

**What the real series show** (post hoc, read off J2, deciding nothing). Five of the twelve returns on the 27
primary states have about the same share of repeats inside as around them (85% and 85% for Alaska 2022,
Michigan 2022 and Utah's 20 days, 86% and 86% for Alabama 2022). They are not returns to more frequent
publication at all. They are changes in *which* days publish. The weekday cost gains from any change in the
weekday pattern, and the pass's only direction guard is that the raw share inside is lower, which a reshuffled
schedule passes by a hair. The simulated nulls never moved publication from one set of days to another set of
the same size, so the calibration could not see this. Next, pre-registered: a null cell that keeps the count of
publication days and moves them (Tuesday/Friday to Monday/Thursday, and Wednesday to Monday), and a direction
guard that asks for a real drop in repeats (for example, the repeat share inside at most half of the share
around, fixed before it runs). Then J1 again. It is now seen twice, so it can only confirm, not choose.

Test: `update-rate-returns-auto.test.mjs` (a Monday-Friday schedule reads as weekly and a clumpy chain does not,
the statistic is a non-negative likelihood ratio, each stretch is scored with the cost its test picks, and the
committed verdict).

## Short returns: a real drop in repeats (2026-11-19, pre-registered; R1-R4 pass in simulation, J1 fails 2 of 8, not offered)

Round 4 above passed its simulation bars and then, on JHU's eight documented returns, found five "returns" whose
repeat share inside matched the share around (85% and 85%): changes in *which* days publish, which the weekday
cost reads as a pattern change and the pass's only direction rule ("fewer repeats inside", by any margin) let
through. No simulated null had moved publication between two sets of days of the same size. This round adds
those nulls and a guard. `eval/update-rate-returns-guard.mjs` (header, cells, rules and `returnGuardPasses` with the
`guard` option of `bestReturnCost` and `returnCandidates` in `update-rate.mjs`, committed in 41343d76f before any
cell ran) kept round 4's per-stretch model and every earlier cell, and added four shift nulls at n 1100:
Tuesday/Friday moved to Monday/Thursday for 60 days (S2t) or for good (S2p), and Wednesday moved to Monday for 60
days (S1t) or for good (S1p). The guard replaces "fewer repeats inside" in the search itself, so another interval
can win. Two guards: `half` (share inside at most half the share around) and `z01` (a one-sided pooled
two-proportion z of the drop of at least 2.326). Choice on calibration, R1-R3 as before plus R4 (every shift cell
at most 0.010 false returns a series), then J1 again. The header discloses that round 4's J2 shares had been read
when the guards were written, and that Michigan 2021's documented return (58% inside, 66% around) fails `half`; so
the choice was on simulation only, and J1 could only refuse.

**Calibration (seed 20261226, `eval/update-rate-returns-guard.out.txt`).** The new nulls bite without a guard:
round 4's pass reports a return in 98-100% of shift series at m 3 (S1t falls to 58% only at m 6). `half` removes
every one of them at every m and costs nothing elsewhere: the power rows are identical to round 4's on the same
series (R30 162, R60 199, R90 198, I60 23 at m 3). `z01` lets through 5% of the Wednesday-to-Monday shifts at m 3
and meets the budget only at m 6, where R30 is 0. `half` at m 3 was chosen.

**Confirmation (seed 20261227, `half` at m 3): all four simulation bars pass.**

| confirmation | `half`, m 3 | round 4 (no guard), m 3 |
|---|---|---|
| worst null or shift cell, false returns a series | **0.005** (R1, bar 0.020; M60 n300) | 1.000 (S2t, S2p, S1p) |
| worst shift cell | **0.000** (R4, bar 0.010) | 1.000 |
| 30 days of daily inside Monday-Friday, found of 200 | 159 | 159 |
| 60 days | **196** (R2, bar 120; R3 +196) | 196 |
| 90 days | 197 | 197 |
| 60 days at 2% inside independent 25% | 29 | 29 |

**J1 fails: 2 of 8 dated, bar 4.** Idaho and Vermont are dated as in round 4. Michigan's Tuesday+Friday to
Monday/Wednesday/Friday is lost, as the header said it would be: one more publishing day a week is a drop from about
71% to 57% repeats, not a halving. The other five stay missed. The pass stays in the module, off
(`SHORT_RETURNS.mult` null); nothing the CLI or the page prints changes.

**What changed on the real series** (J2, post hoc, deciding nothing). The 12 returns on the 27 primary states fall
to 6, and every one left is a real drop (0-20% repeats inside against 24-43% around: Alabama, Idaho, Indiana,
Kentucky, Vermont, Washington). The five same-share "returns" and Kansas' and Michigan's 59/68% and 58/66% are gone.
So the guard does what it was built for on real data too; what it cannot do is find the returns the pass never
proposed. Read against the documented list (`eval/update-rate-covid-schedules.mjs`, SECONDARY), the other five misses
are not two-month returns either: by the documented dates the move to more days lasted about four months in Alaska
(2021-08-02 to 2021-12-07), eight in South Dakota (2021-08-16 to 2022-04-12), five and a half in Alabama
(2021-09-17 to 2022-03-04, read from struck-through text; the data's drop is dated two months earlier), and has no
listed end in Arkansas and Nebraska. Those are lasting changes of schedule, which the shipped partition should cut,
and it misses them too (D3 in `eval/update-rate-covid-schedules.out.txt`). J1 as written counts only the return
pass's finds, so it mixes two questions: short returns and lasting moves to more days.

Next, pre-registered: why the shipped cut misses lasting moves to more days, with power cells no round has
simulated (Wednesdays only to Monday-Friday, Monday/Wednesday/Friday to Monday-Friday, each for four to eight
months), scored by the shipped check and the guarded pass together. A fraction-of-a-day guard (a drop of at least one
publishing day a week, about 0.14 of the share) would keep Michigan, but it was seen here and needs fresh real
returns to test.

Test: `update-rate-returns-guard.test.mjs` (both guards on known shares, no guard leaves the search unchanged, a
same-count shift is a return without the guard and none with it while a real return survives, the committed
verdict, the pass off by default).

## Lasting moves to more days: does the shipped cut have the power? (2026-11-19, pre-registered; H1 fails on one cell of nine)

The round above found that five of JHU's eight documented moves back to more frequent reporting were, by the
documented dates, lasting changes of schedule (four to eight months, or no listed end). The shipped partition
should cut those, and it dated none of them. That round's "Next" asked why, with simulated cells no round had
tried. `eval/update-rate-lasting-more.mjs` (header committed in 0b2fb6c07 before any cell ran; one amendment
in the next commit, before any cell finished: Part A turns off the stale-feed verdict, which took 20 s a series
and never moves a cut or its direction) asks it in two parts.

**Part A, simulation (seed 20261228, 200 series a cell, n 1,100).** Three moves from the documented list, each
starting at step 500 and lasting 120 days, 240 days or for good, under rounds 1-5's schedule model. One bar, H1:
the shipped check alone finds the start (a 'more often' cut within 10 steps) in at least 180 of 200 in every cell.

| move (repeats before to inside) | 120 days | 240 days | for good |
|---|---|---|---|
| Wednesdays only to Mon-Fri (82% to 29%) | 198 | 199 | 199 |
| Mon/Wed/Fri to Mon-Fri (55% to 29%) | 191 | 182 | 186 |
| Mon-Fri to daily (29% to 3%) | **13** (197 with the guarded pass) | 186 | 195 |

**H1 fails, on one cell.** The shipped cut has the power for a lasting move to more days from a sparse schedule,
and for a move from Monday-Friday to daily once it lasts eight months. It misses a four-month Monday-Friday to
daily stretch (13 of 200), which round 5's guarded return pass finds (197 of 200, off by default). Ends are cut
as reliably as starts (185-198 of 200 where the move ends; 14 for the four-month daily stretch). So at the lengths the documented record gives, the
cut alone should have dated Alaska, Nebraska and South Dakota.

**Part B, the eight real events (seen data; sorted by a rule fixed in the header).** Repeat shares in the 56
days either side of each documented date, against what the two schedules imply:

- **N, not in the data (3).** Alabama (11% to 0%; Monday-Friday implies 29%), Michigan (55% to 57%; the
  weekday shares show the days moving, not a third day added) and Nebraska (46% to 36%; Wednesdays only
  implies 82%). The schedule the record names before the date never shows in JHU's figures.
- **E, cut elsewhere (1).** Arkansas (14% to 0%), sorted E only because the 2020 cut's range runs to
  2021-06-26; the data show weekends half-repeating, so it is close to N.
- **C, in the data, not cut (4).** Alaska (57% to 32%), Idaho (30% to 2%), South Dakota (66% to 30%) and
  Vermont (32% to 0%). Each matches its documented schedules within a few points.

**Why the four are missed** (post hoc, monthly shares read after the sort, deciding nothing). In every one the
*short* leg is in the data, not the lasting one. Alaska's Monday/Wednesday/Friday spell is June-July 2021 (50%,
58%; 27-35% either side), and South Dakota's Wednesdays-only spell is about July 2021 (77%; 30-48% either side):
one to two months of *fewer* days before the documented return, so the lasting Monday-Friday that follows is the
same schedule as the months before the spell. Idaho's and Vermont's daily stretches are about two months
(September-October 2021, 3-10% and 0%), and round 5's pass already dates both. So the real series are short
spells, not the cells Part A simulated, and Part A says the cut would have caught the lasting version.

Nothing in the check changes. Next: the mirror of the return pass, a short spell of *fewer* publishing days
inside a stretch (the guarded pass with the guard reversed: share inside at least twice the share around),
pre-registered on simulated 30- to 60-day sparse spells with the round 5 nulls; then Alaska's and South Dakota's
spells, which are seen.

Test: `update-rate-lasting-more.test.mjs` (the nine cells, a Wednesdays-only move cut at both ends, the 120-day
daily stretch needing the pass, the sorting rule, the committed verdict).

## Short sparse spells: the return pass reversed (2026-11-19, pre-registered; S1-S4 and the real check K1 pass, an opt-in)

The round above found that in each of JHU's four documented moves to more days that are in the data, the short
leg is what the data show: one to two months of *fewer* publishing days just before the documented return
(Alaska's Monday/Wednesday/Friday spell in June-July 2021, South Dakota's Wednesdays-only July). The shipped cut
pays two cuts for such a spell and rarely gets them. This round tests the mirror of the return pass:
`bestReturnCost(..., { sparse: true })` looks for the one interval with *more* repeats inside a stretch than in
the parts around it, which share one model. `eval/update-rate-sparse-spells.mjs` (header and option committed in
40cc79ce8 before any cell ran) kept round 5's per-stretch model and its 19 null and shift cells, read round 1's
four return cells as nulls for this direction (a short return is not a sparse spell), and added five power cells:
Monday-Friday with 30 or 60 days of Wednesdays only, 30 or 60 days of Monday/Wednesday/Friday, and daily with 60
days of Monday-Friday. Two guards, round 5's mirrored: `twice` (share inside at least twice the share around)
and `z01` (a one-sided z of the rise of at least 2.326). The header discloses that Alaska's monthly shares had been
read and that its spell fails `twice` on them, so the choice was on simulation only and K1 could only refuse.
The shipped check ran with the stale-feed verdict off, as in the round above (it never moves a cut); the whole
round took 163 s.

**Calibration (seed 20261229).** No guard raises a false spell in the chains, schedules or return cells at m 3
except `z01`'s R90 cell (0.030); `z01` meets the budget at m 3.5. At their m, `twice` finds 563 of 600 in the
three 60-day cells and `z01` 567, so `z01` at m 3.5 was chosen. Where they differ is the Monday/Wednesday/Friday
spell: about 56% repeats against 29% around is a ratio just under 2, so `twice` finds 118 thirty-day spells at
m 3.5 and `z01` 167.

**Confirmation (seed 20261230, `z01` at m 3.5): all four bars pass.**

| confirmation, found of 200 | pass + shipped | shipped alone |
|---|---|---|
| worst null cell, false spells a series | **0.015** (S1, bar 0.020; R90 read as a null) | |
| worst shift cell | **0.005** (S4, bar 0.010) | |
| Wednesdays only for 30 days inside Monday-Friday | 200 | 0 |
| Wednesdays only for 60 days | **200** (S2, bar 120) | 17 |
| Mon/Wed/Fri for 30 days | 172 | 0 |
| Mon/Wed/Fri for 60 days | **195** | 162 |
| Monday-Friday for 60 days inside daily | **157** | 10 |

S3, the three 60-day cells' gain over the shipped check alone, is 363 (bar 60).

**The real check K1 passes: both seen spells end in their documented return's window.** Alaska: a spell
2021-06-08 to 2021-07-29 (52 days, 58% repeats inside, 32% around) against the documented return to Monday-Friday
on 2021-08-02. South Dakota: 2021-07-03 to 2021-08-10 (39 days, 85% inside, 32% around) against 2021-08-16. Both
were seen before the header was written, so this confirms; it does not choose.

**Every spell on the 35 states** (K2, descriptive, deciding nothing): eight. Besides the two above, Arkansas has a
30-day spell ending 2021-07-20 (27% repeats inside, 1% around), four days before its documented move back to
daily (weekends resume, 2021-07-24): a documented event K1 did not name, dated by its spell. Kentucky's 27 days
in March 2022 (85% inside, 30% around) is a spell of the same kind. Four are long (127-183 days) and sit next to
a return the other pass finds: Idaho's 2021-03-28 to 2021-09-05 ends the day before its documented daily return
starts, and Washington's 2021-07-03 to 2022-01-01 follows its return; inside one stretch the two passes model the
same two-schedule split from either side. Alabama's and DC's 2022 spells match no documented event.

**What ships.** `shortSpells(values, { days })` in `update-rate.mjs` with `SHORT_SPELLS` (`z01`, m 3.5): an opt-in
for callers with a date per value (`daysFromDates`). As pre-registered, it is not a default line: nothing the CLI
or the page prints changes in this round. The return pass stays off (`SHORT_RETURNS.mult` null). Next: offer the
spell line behind a flag on the CLI and the page (dated series only), and a fresh real check on spells nobody has
read, from another provider's documented schedule changes.

Test: `update-rate-sparse-spells.test.mjs` (the reversed search finds a planted spell and leaves the default
search unchanged, a Wednesdays-only spell is found with its edges while same-count shifts are not, the module
function equals the eval file's, the committed verdict).

## Short sparse spells on the CLI and page (2026-11-19, later)

The spell search from the section above is now something a person can ask for, still off by default. CLI:
`--spells` (text, `--json` as `shortSpells` and `spellsWarning`, and `--consensus`); page: the box "Look for short
spells of fewer updates"; the printed change report carries the same line. It runs beside the mean, meanvar,
trend and poisson models and never moves a cut. It needs a date (YYYY-MM-DD) on every row, because the search
reads each step's weekday; an undated series is refused with that reason rather than given made-up weekdays. It
stops at 4,000 points: the search is quadratic in each stretch (about 1 s on 1,143 daily values here), and the
calibration only covered series of 500 to 1,100 steps.

On South Dakota's committed JHU series (`data/covid-schedules.csv`):

```
node cli.mjs sd.csv --spells
...
Short spells of fewer updates: one spell where the series was refreshed on fewer days for a while and then went
back to its old schedule: 2021-07-03 to 2021-08-10 (39 steps): the value repeated on 85% of steps inside, against
32% before and after, read weekday by weekday because the stretch runs on a weekly schedule. ...
```

That is the K1 spell from the round above, ending six days before the documented return to Monday-Friday on
2021-08-16. On the other five committed states it says "none found" for Minnesota, California, Utah and Vermont
and dates Kentucky's 2022-03-05 to 2022-03-31 (the K2 spell; no documented event). Nothing here is new
evidence: the setting and its checks are the round above's. Still open: a fresh real check on another
provider's documented schedule changes, spells nobody has read.

Test: `spells-cli.test.mjs` (South Dakota's spell in text, JSON and `--consensus`; off unless asked; undated and
over-long series refused; Minnesota's "none found"; the page's box, its option and its note; the printed report).

## Short spells on a second provider: The New York Times' state series (2026-11-19, pre-registered; N1 and N2 fail, a restated edge-spell line ships)

The two sections above asked for a fresh real check of the spell search on another provider, on spells nobody
had read. `eval/update-rate-spells-nyt.mjs` (header committed in 973ea2dbf before the script ran) ran the shipped
`spellsResult` (the function behind `--spells`, unchanged) on The New York Times' covid-19-data `us-states.csv`:
cumulative cases per state per day, NYT's own collection, independent of JHU's. No NYT state series had been read
before. The labels are the same documented state schedule changes as the JHU rounds, since a health department's
schedule is the state's, not the aggregator's. The NYT file is fetched by `eval/nyt-states-fetch.sh` and not
committed (its terms are attribution, non-commercial; only derived verdicts are here).

**Both bars fail** (`eval/update-rate-spells-nyt.out.txt`, 3 s):

| bar | result |
|---|---|
| N1: a spell ending within 10 days of each of four documented returns after a short spell (bar 3 of 4) | **2 of 4** (South Dakota 2021-07-03..08-10 and Arkansas 2021-06-21..07-20, the same days as on JHU; Alaska and Nebraska missed) |
| N2: spells with no documented event within 10 days of either end (bar at most 3; JHU had 1 of 8) | **5 of 9** (Idaho 372 days, Kentucky 185, Michigan 106, Nevada 95, Nebraska 178) |
| N3, descriptive: the same spell on both providers | 3 of 8 JHU spells seen on NYT; 3 of 9 NYT spells seen on JHU |

**Why, read afterwards** (`eval/update-rate-spells-nyt-why.mjs`, post hoc, deciding nothing about the search):

- *Alaska is in NYT's series, and the default line already dates it.* Month by month NYT's Alaska is almost
  JHU's (repeats 50% and 61% in June and July 2021, against 50% and 58%). But NYT's series starts on 2020-03-12,
  not 2020-01-22, and with the shorter opening the default update-rate line cuts **2021-06-04 (fewer updates) and
  2021-08-01 (back to more)**, the day before the documented return. The spell search looks *inside* that line's
  stretches, so with both edges already cut it had nothing left to find, at any penalty down to m 2.5. The spell
  was not missed by the tool a user runs; it was missed by the search, and the line said "none found". That
  sentence was misleading.
- *Nebraska's documented Wednesdays-only spell (2021-08-11 to 2021-09-25) is in neither series.* NYT's Nebraska
  moved on every weekday through August and September 2021 (Mon 5/5, Tue 5/5, Wed 4/4, ... in August); JHU's sits
  near 45% repeats throughout with no spell shape. Whatever the state published on its own dashboard, neither
  aggregator's series shows a Wednesdays-only spell, so no search over these series could date it. This miss is
  the label's, as far as the data can say.
- *"Unexplained" is not "false" here.* Nebraska's 2022-05-06..10-30 spell is in both providers' series (repeats
  55%, 50%, 52%, 52%, 43%, 74% from May to October on both, publishing on two to three weekdays a week, against
  27% in April); it is a real schedule change JHU's README does not list. The other four NYT-only spells are long
  (95-372 days) with small rises (e.g. Kentucky 17% inside against 5%), closer to slow drifts in the schedule than
  to a short spell. Without a label for them, N2's bar counts them against the search, as it was written to.

**What ships.** Nothing in the search or its setting changes, and it stays an opt-in: it failed a fresh provider.
One reporting fix ships, because the Alaska case showed the line contradicting the default line beside it:
`edgeSpellsOf` in `update-rate.mjs` restates the default update-rate line's own pair of changes, fewer updates
then back to more within 120 steps (`EDGE_SPELL_MAX_STEPS`), as a spell, and the `--spells` line (CLI, page,
printed report) now says so instead of "none found":

```
Short spells of fewer updates: none inside the update-rate line's stretches. The update-rate line already dates a
spell as two changes, fewer updates and then back to more: 2021-06-04 to 2021-07-31 (58 steps, 59% repeats inside,
31% before, 31% after).
```

It adds no test and no new p: it is the default line's two cuts, already printed, read together. On the 35
states it fires on 0 JHU series and 2 NYT series: Alaska (next to the documented return) and Alabama 2021-05-29..
07-12 (49% repeats inside, 0% before, 4% after; no documented event). The six committed JHU states print exactly
what they printed before.

Next: the spell search is fragile to where a series starts (Alaska's opening shifted the default cuts by enough to
take the spell from the search); a check would plant the same spell in series with different openings and count
how often it falls to the search, the default line, both, or neither. A provider that documents its own schedule
changes (rather than JHU's labels reused) is still wanted.

Test: `spells-edge.test.mjs` (a fewer-then-more pair is one edge spell, a long or same-direction pair is not; the
line's new wording; the committed JHU states unchanged; the committed NYT verdicts).

## Short spells under different series openings (2026-11-19, pre-registered; O3 and O4 pass, O1 and O2 fail, nothing changes)

The section above found the spell search fragile to where a series starts: NYT's Alaska opens 50 days later than
JHU's, the default line then cut both edges of the spell, and the search, which looks inside that line's
stretches, had nothing left to find. `eval/update-rate-spells-openings.mjs` (header committed in c99ca0229 before
any cell ran) plants the spells round's five spell shapes after six openings (120, 250, 500 or 800 steps of the
base schedule, or a quiet start of 50 all-but-always-repeating steps, as a series that begins with its zeros, then
250 or 500), 200 series a cell, and asks which line dates the spell: the search, the default line's two cuts
(`edgeSpellsOf`, restated since the round above), both, or neither. It also gives the edge restatement the null
check it shipped without, on four no-spell schedules (Monday-Friday, Monday/Wednesday/Friday, daily, and a lasting
move to Wednesdays only) under the same six openings. Module functions unchanged; 142 s.

**The edge restatement is needed, and costs nothing on the nulls (O3, O4 pass).** No null series at any opening
printed a false spell or produced an edge spell (0.000 a series in all 24 null cells; bar 0.020). Meanwhile, on
Alaska's own shape (Monday/Wednesday/Friday for 60 days inside Monday-Friday) the default line's two cuts are what
date the spell in 149 to 186 of 200 series at every opening, the search in 10 to 43. Before the round above the
line said "none found" for those. On South Dakota's shape (Wednesdays only, 60 days) the prediction from Alaska
holds exactly: the shorter the opening, the more spells move from the search to the edges (edge only 98 of 200
at 120 steps, 52 at 250, 19 at 500, 3 at 800), and the line a user reads dates all 200 at every opening. Spells
the search and the edges both date: none in any cell, as built (the search never looks across a cut).

| found of 200 by the `--spells` line | 120 | 250 | 500 | 800 | quiet + 250 | quiet + 500 |
|---|---|---|---|---|---|---|
| Wednesdays only, 30 days | 199 | 200 | 200 | 199 | 200 | 200 |
| Wednesdays only, 60 days | 200 | 200 | 200 | 200 | 200 | 200 |
| Mon/Wed/Fri, 30 days | 174 | **135** | 181 | 160 | **139** | **141** |
| Mon/Wed/Fri, 60 days | 196 | 194 | 193 | 197 | 198 | 192 |
| Monday-Friday inside daily, 60 days | **146** | **178** | **156** | **141** | **145** | **162** |

**O1 fails** (each shape within 30 of its 500-step cell): the 30-day Mon/Wed/Fri spell falls to 135-141 at three
openings. **O2 fails** (at most 20 of 200 with neither line, 60-day cells): the 60-day Monday-Friday spell inside
daily has 22 to 59 at every opening; at the 500-step opening this is the spells round's own cell (157 there, 156
here), so O2 was set above a power the confirmation had already measured. That bar was wrongly written, not a
new loss.

**Why O1 failed, read afterwards** (`eval/update-rate-spells-openings-why.mjs`, post hoc, deciding nothing,
fresh seed): changing the opening's length also changed the spell's first weekday, and the three failing cells
are the three whose spells start Friday, Saturday or Sunday. A Mon/Wed/Fri spell differs from Monday-Friday only on
Tuesdays and Thursdays; 30 days hold 9 of them from a Monday to Thursday start and 8 otherwise. Holding the
opening at 500 and moving only the first step over one week:

| first day of the spell | Thu | Fri | Sat | Sun | Mon | Tue | Wed |
|---|---|---|---|---|---|---|---|
| Mon/Wed/Fri 30 days: informative days | 9 | 8 | 8 | 8 | 9 | 9 | 9 |
| found of 200 | 164 | 146 | 120 | 139 | 163 | 167 | 174 |
| Monday-Friday in daily, 60 days: weekend days | 18 | 18 | 18 | 17 | 16 | 16 | 17 |
| found of 200 | 172 | 170 | 177 | 138 | 144 | 134 | 144 |

One weekday's difference in where a spell starts moves its power as much as any opening did (120 to 174 at one
opening). The 60-day shapes with many informative days (Wednesdays only: 34-35; Mon/Wed/Fri: 16-18 inside
Monday-Friday, 195-199 found) do not move. So the opening matters to *which* line dates a spell, not to *whether*
the line a user reads does; what limits the line is how many days inside the spell the two schedules differ on,
about 16 or more for 60-day spells and more than a 30-day Mon/Wed/Fri spell's 8 or 9.

**What ships.** Nothing in the search, the restatement or their settings changes; both stay behind `--spells`.
The round adds the null check the edge restatement lacked (it passes) and a measured caveat for the line: a
spell with fewer than about 16 days on which the schedules differ (a one-month spell of three publishing days
inside five, or a two-month weekdays-only spell inside daily) is dated in 60-87% of series, depending on its
weekdays. Next: a spell search that counts informative days directly (a score on the differing weekdays only),
pre-registered against these cells; and still a provider that documents its own schedule changes.

Test: `spells-openings.test.mjs` (the series builder; a Wednesdays-only spell after the shortest opening is dated
by the line, and no printed edge spell overlaps a search spell; the committed verdicts and the post hoc table).

## Short spells scored on the weekdays that differ (2026-11-19, pre-registered; C1-C5 and K1 pass, ships behind `--spells`)

The round above found that what limits the `--spells` line is how many days inside a spell the two schedules
differ on, and asked for a search that counts those days directly. The weekday search's gain is a sum over the
seven weekdays of one likelihood ratio each (inside against around). On weekdays where the old and the spell
schedule agree (a Mon/Wed/Fri spell inside Monday-Friday agrees on five of seven) that ratio is noise, and the
penalty has to sit above the noise of all seven. A diagnostic of the shipped search on a scratch seed, read before
the header and disclosed in it, showed both weak cells' misses: 11 of 11 missed one-month Mon/Wed/Fri spells had
the search's best interval at the spell with gain 25-46 against a penalty of 49; 12 of 12 missed Monday-Friday
spells inside daily had a weekday candidate at the spell, but the stretch failed the weekly-pattern test (it is
daily outside the spell), so the two-state chain was used.

`eval/update-rate-spells-weekdays.mjs` (header committed in 18bfdf885 before any cell ran) scores an interval by
summing only the weekdays whose repeat share rises inside and whose ratio clears a floor beta, each less beta
(`bestSpellWeekdays` in `update-rate.mjs`). Arm A keeps round 5's choice of model per stretch; arm B also tries the
score where the weekly test says the stretch is not weekly. Beta in {0, 2, 4, 6}, m in {1.5 ... 5}: per arm and
beta the smallest m with every null cell at most 0.010 false spells a series, then the most spells found. 394 s.

**Calibration (seed 20261232): arm A, beta 4, m 2.5.** Arm A at beta 0 is close to the shipped search and needs its
m 3.5 (926 of 1,000 found over the five spell cells); with beta 4 the weekdays that agree stop adding noise, the
null budget is met at m 2.5, and 971 are found. Arm B raises false spells on the clumpy two-state chains (0.235
a series at beta 0, m 3.5): on a stretch with no weekly pattern a weekday score reads clumps as a calendar, the
reason round 5 chose the model per stretch. It was not chosen.

**Confirmation (fresh seeds 20261233 and 20261234): all five bars pass.**

| bar | result |
|---|---|
| C1 spells round's 23 null cells, false spells a series (bar 0.020) | worst **0.010** (S1p) |
| C2 shift cells (bar 0.010) | worst **0.010** |
| C3 openings round's 24 null cells, false spells the line prints (bar 0.020) | **0.000** in every cell |
| C4 the 12 weak cells (one-month Mon/Wed/Fri, two-month Monday-Friday inside daily, six openings): line found, new minus shipped on the same series (bar 150) | **+283** |
| C5 no spell cell loses more than 10 | **pass** (worst: P3w60 at P120, 196 vs 197) |
| C6, reported: the openings round's O1 (each shape within 30 of its 500-step cell) | fails once: one-month Mon/Wed/Fri after a quiet start, 148 vs 184 |

| line found of 200, new / shipped | 120 | 250 | 500 | 800 | quiet + 250 | quiet + 500 |
|---|---|---|---|---|---|---|
| Mon/Wed/Fri, 30 days | 177 / 167 | 158 / 141 | 184 / 177 | 178 / 155 | 148 / 131 | 154 / 134 |
| Monday-Friday inside daily, 60 days | 186 / 144 | 187 / 171 | 194 / 173 | 184 / 131 | 188 / 145 | 190 / 176 |

The other three shapes are unchanged within one series (Wednesdays only: 199-200 both; Mon/Wed/Fri 60 days:
193-198 both). The Monday-Friday-inside-daily gain comes from arm A, which never applies the weekday score to a
stretch the weekly test calls not weekly; but arm A applies the chosen penalty (m 2.5, was 3.5) to the chain
search on those stretches too, which is one likely source. Which part of the gain is the chain's and which the
score's was not measured. The one-month Mon/Wed/Fri spell is
still the hardest shape (8 or 9 informative days); the score lifts it by 7 to 23 a cell, but it stays 30 below
its own 500-step cell after a quiet start, so the measured caveat from the round above stands in a smaller form.

**The real check K1 passes** (seen data): Alaska's spell 2021-06-04 to 2021-07-29 (four days earlier than the
shipped search's start, 2021-06-08) and South Dakota's 2021-07-03 to 2021-08-10 both end in their documented
return's window. On the 35 states (K2) the new search reports the same eight spells as the shipped one, with edges
within 11 days of the old ones.

**What ships.** `SHORT_SPELLS` is now `{ score: 'weekdays', arm: 'A', beta: 4, mult: 2.5 }`, still behind
`--spells` and the page's box, still not a default line. The line names the weekdays it read: on South Dakota's
Wednesdays-only spell inside Monday-Friday, "read on the weekdays where the schedule changed (Mondays, Tuesdays,
Thursdays and Fridays)"; on Kentucky's March 2022 spell, Tuesdays, Wednesdays and Fridays. Kentucky's spell now
runs to 2022-04-05 (was 03-31); the other committed states print what they printed. Round 5's search stays
reachable as `score: 'dow'` (`SHORT_SPELLS_DOW`), and the earlier rounds' eval files now pass it, so their committed
outputs reproduce. Simulated and seen evidence only; the NYT check that failed the shipped search has not been
rerun on this score. Next: that rerun as a fresh pre-registered check (NYT's file is fetched, not committed), and
still a provider that documents its own schedule changes.

Test: `spells-weekdays.test.mjs` (beta 0 is the weekday gain less falling weekdays, beta 4 keeps Tuesdays and
Thursdays on a planted Mon/Wed/Fri spell; the two arms; the committed verdicts; the shipped setting, South
Dakota's spell under both scores, the weekday names in the line).

## The weekday spell score on NYT's state series (2026-11-19, pre-registered; W1 passes, W2 fails 4 of 8, stays an opt-in)

The section above shipped the weekday score behind `--spells` on simulated and seen evidence and asked for a fresh
rerun of the NYT check that had failed the earlier `dow` search. `eval/update-rate-spells-weekdays-nyt.mjs` (header
committed in d07f29184 before the script first ran) runs the shipped `spellsResult` (default `SHORT_SPELLS`:
weekdays, arm A, beta 4, m 2.5; nothing changed) on the same NYT `us-states.csv`, with the same 35 states, labels,
+-10 day rule and "explained" rule, imported from the NYT round's script. What was known beforehand is disclosed in
the header: Alaska's spell is dated by the default line's two cuts on NYT whatever the score does, and Nebraska's
documented Wednesdays-only spell is in neither provider's series, so the old N1 (search only) could not pass. The
bars were restated on the line a user reads. 4.5 s.

| bar | result |
|---|---|
| W1: the line (search spells plus the edge spells it prints) ends a spell within 10 days of each documented return (bar 3 of 4) | **3 of 4: pass** (Alaska by the edge restatement 2021-06-04..07-31; South Dakota 2021-07-03..08-10 and Arkansas 2021-06-21..07-18 by the score; Nebraska missed, as disclosed) |
| W2: unexplained search spells on the 35 states (bar at most 3; `dow` had 5 of 9) | **4 of 8: fail** (Idaho 372 days, Kentucky 182, Michigan 105, Nebraska 175) |
| W3, reported: everything the line prints | 10 spells (8 search, 2 edge), 5 unexplained (the four above and Alabama's edge spell 2021-05-29..07-12) |
| W4, reported: against `dow` on the same series | same spells within 4 days on eight states; Nevada's 95-day spell (2022-05-07..08-09, unexplained) is gone; 3 of 8 JHU spells seen on NYT, as before |

So the weekday score is one false-looking spell better than the search it replaced on a fresh provider, and keeps
both short spells the search had found, but it does not meet the bar the first NYT round set. The opt-in stays an
opt-in; nothing in `update-rate.mjs` changes.

**Read afterwards (post hoc, deciding nothing):** the four unexplained spells are the four longest the score
reports (105-372 days), with small rises in repeats for three of them (Kentucky 17% inside against 5%, Idaho 33% against
20%, Michigan 86% against 72%), and Nebraska 2022 is the real schedule change on both providers that the JHU
README does not list (read in the first NYT round). Every documented spell that ends in a return runs 28-58 days.
A length cap is the obvious next idea and the data already argue against it: at 120 days it would remove all four
here but also DC's explained 126-day spell on NYT, and on JHU it would remove three of the seven explained spells
(Alabama 130 days, DC 127, Idaho 162) with the one unexplained (Washington 184). What would settle it is a
provider that documents its own schedule changes, including the slow ones, which is still the open item.

Test: `spells-weekdays-nyt.test.mjs` (the line's spell list skips an edge the search overlaps; the committed
verdicts).

## A real carried-forward feed: last-trade prices (2026-11-19, pre-registered; B1 and B3 pass, B2 fails, the one-tick gate stays)

Every round of the stale-feed test ("One-tick stale feeds", rounds one to five) was scored on simulation, and this
README has asked since 2026-11-12 for "a real series with documented carry-forward to check a call against". A
last-trade price sampled every D seconds is one: a sample with no trade in its D seconds repeats the last trade, and
the trade times say exactly which samples were carried. The trade prints themselves, one step per trade, carry
nothing forward, so they are the real null. Data: the trade samples of the R package highfrequency (Boudt, Kleen and
Sjoerup 2022, GPL >= 2, fetched by `python3 eval/hf-trades-fetch.py <dir>`, not committed). Judged: one day of a
European stock (33,488 trades, price about 39.5). Reported only: two days of a pseudonymised NYSE stock, because its
package page calls the raw sample it was cleaned from "imaginary".

`eval/stale-real-trades.mjs` (header committed in 7f6fe11f7 before the first run) calls the shipped
`staleTestMarkov` (threshold 6.56) on non-overlapping 300-step windows at D = 1, 2 and 5 s and on the prints. It
calls the test directly, because these prices move 2 to 4 ticks at the median and the shipped one-tick gate
(median move <= 1.5 ticks) never runs it on them; the gate's verdict is recorded per window (it ran on none). Each
window's truth is its share of steps with no trade. The fitted share is the Markov fit's stationary carry share.

**Run 1 found a bug in the product, not the test.** The European file holds prices such as 39.8025 beside
39.802499999999995, written after float arithmetic. The shipped `smallestStep` took their difference, 7e-15, as the
tick, so every real move read as 10^12 ticks, the 50-tick guard refused the D = 1 and D = 2 windows, and B1 could not
be scored (`eval/stale-real-trades-run1.out.txt`). Two values that agree to nine significant digits are now one value
written twice: they set no tick and are no move (`floatNoise` in `update-rate.mjs`; exact repeats are still counted
exactly). Any user file with such values had the same broken tick. Run 2 is the same script and bars, with the fix
(`eval/stale-real-trades.out.txt`, 98 min on four threads):

| bar (Europe) | result |
|---|---|
| B1 power: windows with carried share >= 0.30 called stale (bar 80%) | **84 of 85: pass** |
| B2 size: trade-print windows (nothing carried) called stale (bar <= 10%) | **56 of 56: fail** |
| B3 the estimate: fitted carry share within 0.10 of the true share, among windows called stale (bar 80%) | **112 of 119: pass** (median error 0.04 at D = 1, 0.05 at D = 2, 0.06 at D = 5) |
| reported: carried share under 0.30 | 35 of 36 called stale (10 of 11 under 0.10) |
| reported: the US sample | 12 of 48 carried windows called stale; most windows are refused by the 50-tick guard (ticks of 0.0005, moves of 20 to 40 ticks) |

So on a real carried feed the test is sharp and its estimate is good: it says how much of the feed was carried
forward to within about 0.05. But it says the same of the trade prints, where nothing was carried, with a fitted
share of 0.27 against a truth of 0. By the pre-registered rule nothing ships and the gate stays as it is.

**Read afterwards (post hoc, deciding nothing).** The prints show no catch-up. The move that ends a run of repeats
is no bigger after a long run than after none (RMS 3.6 ticks after no repeat, 3.2 after three or more). In the
carried D = 1 series it grows only from 4.8 to 5.6. What the prints do have is repeats: 40% of steps, far more than a
walk with 3.5-tick steps would land on the same price by chance. M0 cannot make that many exact zeros without
shrinking its step, and M1 can, so the likelihood ratio rewards M1 for excess repeats, not for catch-ups. In the
one-tick regime the simulations covered, excess repeats beyond rounding do mean staleness, and that is what the gate
protects. Above about 1.5 ticks the test is a test for zero inflation, and any market where the price sits at a
quote (trades at the bid until the queue empties) is zero-inflated. So opening the gate would mislabel real tick
data as stale, and the gate stays closed. A test for staleness at multi-tick moves would have to score the growth
of the move after a run (round two's ratio idea) rather than the share of zeros. The prints here are the null to
check it on.

Tests: `stale-real-trades.test.mjs` (the sampling that labels each repeat, the windows, the bars, the float-noise
tick rule and the committed verdicts).

## A catch-up test for multi-tick feeds (2026-11-19, pre-registered; G1, G2 and R1 pass, R2 fails, not offered)

The section above ends with the shipped stale test calling every real trade-print window stale (B2, 56 of 56):
above about 1.5 ticks it scores excess exact repeats, and prices that sit at a quote have them with nothing carried.
It named what a test at multi-tick moves would have to score instead: the growth of the move that ends a run, since
a carried figure's next move sums the k + 1 hidden moves it missed and a quote's does not.

`catchUpGrowth` (`update-rate.mjs`) is that test, with nothing fitted. For each move that ends a run, k is the
repeats directly before it (0 after a move); it correlates the ranks of k and |move| (Pearson on mid-ranks). Under
the null that the move does not depend on k, the permutation variance of that correlation is exactly 1 / (n - 1)
whatever the ties, so z = r sqrt(n - 1) needs no simulation. Stale when z >= 1.645 (one-sided 5%), with at least 30
moves, 10 of them after a run. It runs in microseconds a window; the likelihood test took about a minute.
`eval/stale-growth.mjs` (header and code committed in aa5ebc85e before the first run) scored it on simulation and
on the same highfrequency files, windows and plan as the section above (`eval/stale-growth.out.txt`):

| bar | result |
|---|---|
| G1 size in simulation: zero-inflated walks (30% quote holds, 3.5-tick Gaussian or t3 steps) called stale (bar <= 7% each) | 5.0% and 5.7%: **pass** |
| G2 power in simulation: a walk carried forward in runs (share 0.55) called stale (bar 80%) | 96.3%: **pass** |
| R1 size on the real null: Europe trade-print windows called stale (bar <= 10%) | **1 of 56: pass** (the likelihood test: 56 of 56) |
| R2 power on the real carried feed: Europe windows with carried share >= 0.30 called stale (bar 80%) | **22 of 85: fail** |
| reported: share 0.30 carried, t3 steps, volatility regimes in the null | 85.5%, 97.0%, 1.4% |
| reported: the US sample | prints 0 of 6; carried windows 2 of 48 |

So the test does what the likelihood test could not: it leaves real trade prints alone (whole day pooled, z = -4.8:
on the prints a move after repeats is if anything smaller). But on a real carried feed it misses most 300-step
windows. By the pre-registered rule nothing changes in `updateRateChanges` or the lines; `catchUpGrowth` stays an
exported function with no sentence.

**Why the real feed is harder than the simulation (read afterwards, deciding nothing).** In simulation the mean
correlation in a carried window is 0.31; on the real D = 1 feed it is 0.09 (whole day 0.08, z = 7.95 over 10,620
moves). The simulated hidden price moves every second whether anyone trades or not. A real price moves in trade
time: the seconds with no trade are mostly the seconds when nothing happened, so a carried run hides much less
movement than k + 1 clock steps would. The growth is real but small, and it takes length to see.
`eval/stale-growth-length.mjs` (post hoc, `eval/stale-growth-length.out.txt`) reruns the same test on longer windows:

| Europe | 300 steps | 1,000 | 2,000 | 4,000 |
|---|---|---|---|---|
| D = 1, carried >= 0.30: called stale | 29 of 99 | 15 of 30 | 11 of 15 | 7 of 7 |
| D = 2, carried >= 0.30 | 9 of 34 | 5 of 11 | 4 of 5 | 2 of 3 |
| trade prints | 3 of 111 | 0 of 33 | 0 of 16 | 0 of 8 |

A stale stretch with roughly a thousand moves in it (about 2,000 one-second samples here) is caught most of the
time, and the prints stay clean at every length. The next item is a pre-registered round on fresh data with a bar
stated by stretch length (moves >= 600, say), so a user is told the test's reach rather than given a coin flip on a
short stretch. These prints and samples are now spent for choosing that length.

Tests: `stale-growth.test.mjs` (run lengths, float-noise repeats, the standardised z, the simulation cells, the
committed verdicts, and that `updateRateChanges` does not call the test).

## The catch-up test by stretch length, on five fresh stocks (2026-11-19, pre-registered; L2 and L3 pass, L1 fails 29 of 38, not offered)

The section above ends with a table read afterwards: on highfrequency's European stock, a carried stretch with
about a thousand moves was caught most of the time and the prints stayed clean at every length. That table chose
the length; this round asks whether it holds on data it has not seen, with the bar stated in moves rather than
samples, so that a user could be told the test's reach.

Data: LOBSTER's free sample files (lobsterdata.com; Nasdaq, 2012-06-21, 09:30 to 16:00; AAPL, AMZN, GOOG, INTC,
MSFT), fetched from a public mirror by `node eval/lobster-fetch.mjs <dir>` and not committed. A trade is an
execution message (visible or hidden); executions sharing a timestamp are one print at the last price. The series
are the prints (the real null) and the last-trade price every 0.5, 1, 2 and 5 seconds (the print times say which
samples were carried). `eval/stale-growth-lobster.mjs` (header and code committed in 7218ed4ab before the first
run) cuts each series into consecutive stretches that each hold exactly M moves as `catchUpGrowth` counts them
(M = 300, 600, 1000, 2000) and calls the unchanged test on each. Which stocks are judged was fixed by a rule
before scoring: multi-tick when the day's median print move, in the file's own tick, is above 1.5. Output:
`eval/stale-growth-lobster.out.txt` (one second to run).

| bar (multi-tick stocks: AAPL, AMZN, GOOG, MSFT) | result |
|---|---|
| L1 power: grid stretches of 1,000 moves with carried share >= 0.30 called stale (bar 80%) | **29 of 38 (76%): fail** |
| L2 size: print stretches of 1,000 moves called stale (bar <= 10%) | **2 of 25: pass** |
| L3 size at every length (bar <= 10% each) | 300 moves 7 of 90, 600 3 of 45, 1,000 2 of 25, 2,000 1 of 12: **pass** |
| reported: power at 300, 600 and 2,000 moves | 77 of 145, 49 of 70, 14 of 15 |
| reported: INTC (one-tick by the rule) | carried 0 of 4 at 1,000 moves; prints 2 of 2 called stale |

By the pre-registered rule nothing ships: `catchUpGrowth` stays an exported function with no sentence, and the
update-rate line is unchanged.

**Where the misses fall (read afterwards, deciding nothing;** `eval/stale-growth-lobster-read.mjs`,
`eval/stale-growth-lobster-read.out.txt`**).** The files set a tick of half a cent, because hidden orders execute
at the midpoint. That put MSFT past the gate with a median move of two half-cents, though it is a one-cent stock
like INTC: in both, 43-52% of moves are an odd number of half-cents (1-2% in the others).

| stock | price | median move | 1,000 moves: carried caught | prints called stale | 2,000 moves: carried | prints | whole day's prints, z |
|---|---|---|---|---|---|---|---|
| AAPL | 583 | 2 cents | 16 of 19 | 0 of 15 | 8 of 8 | 0 of 7 | -5.1 |
| AMZN | 222 | 2 cents | 7 of 7 | 0 of 4 | 3 of 3 | 0 of 2 | -1.6 |
| GOOG | 568 | 4 cents | 5 of 7 | 0 of 4 | 3 of 3 | 0 of 2 | -2.0 |
| MSFT | 30 | 1 cent | 1 of 5 | 2 of 2 | 0 of 1 | 1 of 1 | +6.7 |
| INTC | 27 | half a cent | 0 of 4 | 2 of 2 | 0 of 0 | 1 of 1 | +8.9 |

On the three stocks that move several cents, the length rule held: 28 of 33 carried stretches caught at 1,000
moves, 14 of 14 at 2,000, and none of 34 print stretches (23 at 1,000 moves, 11 at 2,000) called stale. On the two penny-spread stocks it reverses.
Their prints bounce between bid, ask and midpoint, so a move after a run of same-price prints (a queue being worked
at one side) is the jump across the spread, larger than the half-cent steps between midpoint prints: the prints
grow with the run (z = 6.7 and 8.9 over the day) with nothing carried. And a carried run hides little, because the
price is pinned inside a one-cent spread: whatever happened while it was carried, the catch-up is one cent. So the
growth test is a test for staleness only where moves are several quoted ticks, which is what the gate was meant to
select; a tick inferred from the data's smallest step (here half the quoted tick) selects the wrong stocks.

Next: a fresh-data round that gates on the quoted tick (or on the share of odd half-tick moves) rather than the
smallest step, judged at 2,000 moves. LOBSTER's five sample files are now spent for choosing that gate.

Tests: `stale-growth-lobster.test.mjs` (the stretch cutting, the LOBSTER reader, the bars, the committed verdicts,
and that `updateRateChanges` still does not call the growth test).

## The catch-up test gated on the quoted tick, on twelve exchange pairs (2026-11-19, pre-registered; unscorable: every pair is one-tick, Q1 and Q2 fail)

The section above asked for a fresh round that gates on the quoted tick rather than the data's smallest step,
judged at 2,000 moves. `eval/stale-growth-quoted-tick.mjs` (header and code committed in 78928f6bf before any file
was downloaded) takes Binance's public spot trades for one UTC day (2026-11-02) on twelve large USDT pairs, chosen
before download to span prices from a few cents (DOGE) to about a hundred thousand dollars (BTC), and each pair's
quoted tick (`PRICE_FILTER tickSize` from Binance's public market-data mirror). Data fetched by
`node eval/binance-fetch.mjs <dir>`, not committed. Series, stretches and the test are the LOBSTER round's,
unchanged. Gate: a pair is multi-tick when its prints' median move is above 1.5 quoted ticks.

| bar | result |
|---|---|
| gate | **all 12 pairs one-tick**: median print move exactly 1 quoted tick on every pair; the smallest step equals the quoted tick on every pair |
| Q1 power at 2,000 moves (multi-tick pairs, carried >= 0.30, bar 80%, n >= 10) | 0 of 0: unscorable, **fail** |
| Q2 size at 2,000 moves (multi-tick prints, bar <= 10%, n >= 10) | 0 of 0: unscorable, **fail** |
| reported: the one-tick pairs on the same rules | carried caught 7 of 234 at 2,000 moves (71 of 1,625 at 300); prints called stale 31 of 368 (124 of 2,474) |

Nothing ships. What the round shows: on a venue whose ticks are small against its prices, every large pair trades
one tick at a time, and from BTC to DOGE the prints sit on the bid or the ask. The multi-tick regime the growth test
was built for, where Apple and Amazon were caught on LOBSTER, does not occur here, so the quoted-tick gate selects
nothing. On these one-tick feeds the growth test is blind (a carried run's catch-up is pinned at one tick) and
reads bounce as staleness on some pairs (XRP prints 19 of 40 at 1,000 moves, SOL 15 of 53), as it did on the two
penny-spread stocks. One-tick stretches belong to the shipped likelihood route, and these pairs give that route its
first real one-tick carried feed. That is the next section.

## The shipped one-tick stale test on real one-tick feeds (2026-11-19, pre-registered; T1, T2 and T3 fail, a caveat ships)

Rounds one to five of the stale test ("One-tick stale feeds") were scored on simulation only, and the one real
carried feed so far moves 2-4 ticks, where the shipped gate never runs the test. The twelve Binance pairs above
all move one quoted tick: the regime the shipped route serves. `eval/stale-one-tick-binance.mjs` (header and code
committed in 8796a6d15 before any likelihood was computed on real data; amended twice before any result was read,
both recorded in its header: 20 windows a series cut to 6 when the first run hit the session's time limit, and a
worker-flag clash that made the second run compute each window twice and print nothing) runs the shipped
`staleTestMarkov` (threshold 6.56) behind the shipped one-tick gate, in the quoted tick, on 300-step windows of
the prints and of the last-trade price every 0.5, 1, 2 and 5 s: 6 evenly spaced windows a series, 360 in all, 299
of them passed by the gate. Output `eval/stale-one-tick-binance.out.txt` (44 min on four threads).

| bar (gated windows, pooled) | result |
|---|---|
| T1 power: carried share >= 0.30 called stale (bar 80%, n >= 10) | **128 of 164 (78%): fail** |
| T2 size on the real null: trade-print windows called stale (bar <= 10%) | **16 of 68 (24%): fail** |
| T3 the estimate: fitted carry share within 0.10, among grid windows called stale (bar 80%) | **93 of 143 (65%): fail** |
| reported: carried share 0-0.1, 0.1-0.2, 0.2-0.3 | 3 of 36, 4 of 11, 8 of 20 called stale |
| reported: windows the gate refuses | 61 of 360 (4 of them print windows) |

So the shipped route fails on its first real feed, and fails worst where it matters most to a reader: about one
window of real trade prints in four, with nothing carried, is called stale. By the pre-registered rule for a T2
failure, the catch-up sentence (`updateRateLines`) now adds that trade prints resting at a bid or ask one tick wide
can show the same pattern with nothing carried, and asks the reader of trade or quote data to check the source's
own timestamps before reading it as a stale feed. The test and its threshold are unchanged.

**Where it went wrong (read afterwards, deciding nothing).** The 16 false calls come from seven of the twelve
pairs (ETH, SOL, XRP, DOGE, LINK, AVAX, DOT; none from BTC, BNB, ADA, LTC or TRX), on windows where 42-84% of
prints repeat the last price, with fitted carry shares of 0.17 to 0.55. A print that sits on one side of a
one-tick book until the queue there is worked off makes clumped exact repeats, which is what the Markov carry
model was built to find; a rounded walk cannot make that many with steps as large as the bounce. This is the
LOBSTER penny-spread finding again, now in the likelihood route rather than the growth test, so neither route
tells resting at a quote from carrying forward on one-tick trade data. Power misses fall mostly on TRX (4 of 16)
and SOL (4 of 10); AVAX, LINK and BNB were caught 34 of 34. A test that could separate the two would need
something the prices alone do not hold, such as the trade side (the files carry the buyer-is-maker flag: a print
resting at the bid is a run of sells), and its own pre-registered round on a fresh day.

Tests: `stale-growth-quoted-tick.test.mjs` (the Binance reader, both rounds' bars, the window picker, the
committed verdicts and the new clause) and `rounded-walk-heavy.test.mjs` (the clause in a produced line).

## The trade side: the shipped one-tick stale test on side-adjusted prices (2026-11-19, pre-registered; S2 passes, S1 and S3 fail, nothing changes)

The section above ends with the shipped one-tick route calling 16 of 68 real trade-print windows stale with
nothing carried, and names what the prices alone do not hold: the trade side. Each Binance trade row says
whether the buyer was the maker (a taker sold, so the print is at the bid). Moving each print half a quoted tick
toward the middle of the book (bid + tick/2, ask - tick/2) removes the bid-ask bounce when the book is one tick
wide, so the series moves only when the book does. `eval/stale-side-mid-binance.mjs` (header and code committed in
9ec8f5430 before any file of the day was downloaded; amended once in fb7571384 before any result was read: the
first run, with an unadjusted arm for comparison, would have passed the session's two-hour limit, so the
unadjusted arm, which decided nothing, was dropped) runs the unchanged `staleTestMarkov` behind the unchanged
one-tick gate on a fresh day, 2026-11-09, on the same twelve pairs: the side-adjusted prints and their last value
every 0.5, 1 and 2 s, four evenly spaced 300-step windows a series, 192 windows. Output
`eval/stale-side-mid-binance.out.txt` (32 min on four threads).

| bar (side-adjusted, gated windows, pooled) | result |
|---|---|
| S1 size on the real null: trade-print windows called stale (bar <= 10%, n >= 10) | **21 of 39 (54%): fail** |
| S2 power: carried share >= 0.30 called stale (bar 80%) | **88 of 88: pass** |
| S3 the estimate: fitted carry share within 0.10, among grid windows called stale (bar 80%) | **55 of 97 (57%): fail** |
| reported: windows the gate refuses | 56 of 192 (all 32 of BTC's and ETH's: once the bounce is gone their nonzero moves are tens of ticks) |
| reported: price repeats among prints that keep the side of the print before | 62% (DOT) to 99% (TRX) |

By the pre-registered rule for an S1 failure, nothing in code changes: the trade side does not let this test tell
resting at a quote from carrying forward, and the shipped caveat (check the source's own timestamps) stands.

**Why it went the wrong way (read afterwards, deciding nothing).** The adjustment removes the bounce, but a
bounce is a move: a sell at the bid followed by a buy at the ask now lands on the same value, so the adjusted
prints repeat more than the raw ones, and the repeats come in long runs while the book stands still. That is the
clumped-repeat pattern the Markov carry model finds. Among the adjusted print windows the gate passed, 18 of
the 22 with at least half their steps repeating were called stale, against 3 of 17 below that; TRX's adjusted
prints repeat 92-99% of the time, and all four windows were called stale with fitted carry shares of 0.83 to 0.95.
A book that does not move for minutes is, to a price series, the same thing as a feed that stopped. So on
exchange trades the two can only be told apart by something outside the price: the trade timestamps or ids, which
show that a new trade happened. This line of rounds (real carried feeds, 2026-11-19) ends here; the stale test is
for sampled series whose source does not say when it last changed, and the README caveat says so.

Tests: `stale-side-mid.test.mjs` (the sided reader, the half-tick transform, the windows, the bars and the
committed verdicts).

## Self-deploy with no terminal: the watch's repository made on the page (2026-11-19)

The flagship's finish line for a venture is a stranger opening its page, entering their own settings and ending up
with their own running copy. The metric watch got close (`deploy/make-watch-repo.sh`, a `curl ... | sh` line), but
that still asked for a terminal, Node, curl and a `git push`: the step most people who want a Slack ping about
their sign-ups will not take. The watch page now has a **"No terminal?"** box that does the same without one.

- **What it does.** Type the repository you just created (`owner/name`, or its URL), optionally paste your rows,
  press **Download the files**: `watch-repo.mjs` fetches the watch's modules from the site that served the page,
  builds a stored zip in the browser (its own CRC-32 and zip writer, no dependency; same inputs, same bytes) and
  hands it over. Then four links fill in: the repository's upload page (drag the unzipped files in), GitHub's
  new-file editor opened with `.github/workflows/watch-metric.yml` already in it (the `filename` and `value` query
  parameters; about 7 KB of URL), the new-variable page for `METRIC_CSV`, and the workflow's page to start the
  first run. The workflow is a link, not a file in the zip, because a `.github` folder is hidden in most file
  managers and is the file a drag-and-drop upload would silently miss.
- **One source.** `deploy/build-watch-repo-files.mjs` reads the README heredoc, `package.json`, `.gitignore` and
  the module list out of `make-watch-repo.sh`, plus `deploy/watch-metric.yml` and `LICENSE`, into
  `watch-repo-files.mjs` (the site does not serve `.sh`, `.yml` or `LICENSE`). Its `--check` runs in the test, so
  editing the script without regenerating fails CI.
- **How it was checked** (`watch-repo.test.mjs`, 7 tests). The zip, unpacked with Info-ZIP `unzip`, is the folder
  `make-watch-repo.sh` writes, file for file and byte for byte, less the workflow; `unzip -t` reports no errors;
  the unpacked folder runs `node watch.mjs data/metric.csv` on 130 pasted tab-separated rows and dates the step at
  2026-05-01; the workflow link's `value` decodes to the workflow file exactly; repository-name parsing accepts
  the five usual spellings and refuses eight malformed ones. In headless Chromium at phone width the page made a
  463 KB zip of 20 files from its own server, the pasted rows came out as `data/metric.csv`, the links filled in,
  no console errors and no sideways scroll.
- **Not checked.** No GitHub account was used: the four links follow GitHub's URL patterns (`/upload/<branch>`,
  `/new/<branch>?filename=&value=`, `/settings/variables/actions/new`, `/actions/workflows/<file>`) but were not
  opened against a live repository from this session. Whether the upload page accepts a first commit on a
  brand-new empty repository is the first thing a person trying it would find out; the script route still works
  if it does not.
- **Counted.** `watch_repo_zip` and `watch_repo_link`, in local storage only, like the page's other events
  (listed in the index page's privacy line).

## A shop shut one weekday: revenue's slow climb (2026-11-19, pre-registered twice; round 1 fails F1, round 2 fails F4; not offered)

"A real shop's daily series" left one item open: on the UCI Online Retail shop, **Quiet and Middle never alerted on
daily revenue while it climbed from about £26k to £50k a day** (September to November 2011), and the suggested fix
was `--log`. Exploring on that year (the design year) pointed away from the heavy tails. `--log` on the trading days
made Quiet deafer (0 alerts). The shop never trades on Saturdays, so one row in seven is a 0 that belongs to the
week; with those rows left out, Quiet heard the build-up (dated 2011-09-15, sent 2011-09-21) at 2 alerts in 257
checks (2 in 300 before, neither of them the climb).

**The rule tested** (`watch-core.mjs` `shutWeekdays`, `dropShutWeekdays`): on labels that are consecutive calendar
days, a weekday whose value is 0 in each of its **last 8 weeks** (round 2; round 1: on every occurrence) is left out
before a level model reads the series, and `--period 7` becomes 7 minus the days left out. Counts would be untouched.

**Pre-registered** (`eval/shut-weekday.prereg.md`), on the fresh year (UCI Online Retail II, 2009-12 to 2010-12, the
same shop's earlier year) and on 200 simulated shops (`eval/shut-weekday-sim.mjs`: Saturdays shut, lognormal revenue
(sd 0.35) with 3% wholesale days x4, a weekday pattern, five random one-day closures, an AR(1) wobble in the level;
100 with no change and 100 with a +30% step). Arms, Quiet only: **D** the default with `--period 7`; **T** the rule.

| bar | D | T | result |
|---|---|---|---|
| F1, fresh year: a revenue alert dated 2010-08-15..11-30, sent within 14 days | dated 2010-09-28, sent 2010-11-26 (59 days) | round 1: same run (never fired); round 2: sent **2010-10-04 (6 days)** | round 1 **fails**, round 2 passes |
| F2, fresh year: at most 2 alerts per 100 checks | 0.33 | 0.39 | passes |
| F3, simulation, no step: T at most 2 false alerts per 100 checks | 1.93 (572 / 29,700) | 1.89 (480 / 25,400) | passes |
| F4, simulation, +30% step: T catches at least 60 and D + 15 | 38 | 34 | **fails** |

Outputs: `eval/shut-weekday.out.txt` (round 1), `eval/shut-weekday-r2.out.txt` (round 2, both years),
`eval/shut-weekday-sim.out.txt` (every shop). The simulation's rows count for both rounds: every simulated Saturday
is 0, so both rules leave out the same rows.

What it shows:

- **Round 1 failed because of one Saturday.** The fresh year's first Saturday, 2009-12-05, took £9,803 (30 orders),
  so "zero on every occurrence" left nothing out. Round 2, written down before it ran, changed only that test.
- **On the real shop the drop works in both years; in the simulation it does nothing.** The simulated default was
  not deaf (38 of 100 steps caught, 31 of them by both arms), so the shut Saturday is not, by itself, what deafened
  the real watch. Something the simulation lacks does: the real climb is gradual over weeks rather than a step, and
  the real Saturday zeros may interact with the AR(1) estimate on a rising level in a way an i.i.d. wobble does not
  show. The pre-registered bar asked for a gain on simulated steps, and there was none.
- **Not offered.** The CLI and the page are unchanged. The helpers stay in `watch-core.mjs` for the eval and a later
  round. A shop owner can do the same by hand today: drop the shut weekday's rows from the CSV and use `--period 6`.
  On this shop that would have sent the autumn climb within a week in both years; on simulated steps it gives no
  gain and loses 4 in 100.
- **Middle is deaf to the climb** on both years, with or without the drop, and `--suggest` picks it at the default
  budget because it is "more eager" and under budget.

**Checked:** `shut-weekday.test.mjs` (4 tests): the rule on toy shops (an every-week zero, a one-off zero Friday, a
recent trading Saturday, short, non-daily and all-zero series); round 1 against round 2 on a trading first Saturday;
both real years' Quiet alerts with and without the drop.

Next (most useful first): a simulation with a gradual climb (a ramp over 4 to 8 weeks) instead of a step, to see
whether the real result is about ramps; Middle's deafness to slow climbs (the suggestion picks it); a deployer's real
Stripe series; a shop with two shut days, which no data here has.
