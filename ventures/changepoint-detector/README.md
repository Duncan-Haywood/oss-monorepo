# Changepoint Detector: find when a time series changed

A free, in-browser **changepoint detection** tool: paste or upload a time series
(sales, sign-ups, sensor readings, latency, prices) and see **when its level or
volatility changed**, with the exact best segmentation from **PELT** and a
probability for each change from **Bayesian online changepoint detection**.
Nothing is uploaded. Also a command-line tool and an engine AI agents can call.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/changepoint-detector/

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
  two full cycles and is not offered for counts.
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
  worked out. Next: a dynamic-programming knot search, which would also remove the 20 to 80% limit.
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
  `--ar1` and not offered for counts; with `--period` the profile is removed first.

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
