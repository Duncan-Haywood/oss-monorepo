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
  `ruptures` has no Poisson cost and R's `changepoint::cpt.meanvar(test.stat =
  "Poisson")` was not available, so agreement with an outside implementation
  is unchecked for this model.
- **Behaviour:** planted mean shifts are recovered within 2 points; a pure
  variance change is found by the mean-and-variance model; BIC splits at most
  3 of 30 pure-noise series of length 300; the robust noise estimate ignores a
  level shift; CSV parsing handles headers, named columns, quoted thousands,
  blank rows and semicolons.

Not verified: an outside implementation of the Poisson model (above).

Seasonal and autocorrelated series (`--period n`, `--ar1`; seeded synthetic
series, 40 each, in `engine.test.mjs`):

- **Autocorrelation.** Both methods assume independent noise, so AR(1) noise
  (rho 0.8, 300 points, no change at all) gave a false PELT change in 40 of 40
  runs. With `--ar1` the noise scale becomes the long-run sd (difference-based
  sd x sqrt(1+rho)/(1-rho), rho estimated from the lag-1 correlation of the
  clipped first differences, which a level shift barely touches) and false-change
  runs fall to 4 of 40. A real shift of 8 in the same noise was found exactly
  once within 10 points of the truth in 35 of 40 runs, so the correction costs
  some power. Mean model only. The Bayesian pass runs on the
  AR(1)-prewhitened series (x[t] - rho x[t-1]), where the noise is independent
  again: on the same 40 no-change series it raised a detection in 40 of 40 runs
  uncorrected and 1 of 40 with `--ar1`. The price is power: the shift of 8 was
  detected within 10 points in 25 of 40 runs (40 of 40 uncorrected, which
  also fires on every no-change series), because prewhitening shrinks a
  persistent shift by (1 - rho).
- **Joint fit (`--ar1 joint`).** Instead of widening the noise scale, PELT runs on the
  exact Gaussian AR(1) likelihood (each segment's first point stationary, its mean fitted
  in closed form from prefix sums), and rho and the innovation sd are re-estimated from the
  residuals about the fitted segment means, three passes in all. Same 40 series: false
  changes on the 300-point no-change series 4 of 40 (the same as the long-run scale), and a
  shift of 4 found exactly once within 10 points in 34 of 40 runs against 28 of 40 for the
  long-run scale (shift 8: 34 against 35, no gain). A first version with rho taken once from
  the differences gave 7 of 40 false runs; with rho known the figure is 2 of 40, so the
  residual re-estimate is what keeps it honest. PELT on this cost equals optimal
  partitioning (tested). The Bayesian pass still runs on the prewhitened series.
- **Seasonality.** A level shift of 4 under a sine of amplitude 10 (period 12,
  144 points) gave exactly one change in 0 of 40 runs without adjustment and
  exactly one change within 1 point of the truth in 33 of 40 with `--period 12`
  (centred moving average, per-phase median, profile centred at zero). It needs
  two full cycles and is not offered for counts.

## Limits

Steps, not trends: a gradual drift is approximated by several steps. Seasonality is
removed with `--period` (a fixed cycle only; no trend-seasonal STL). A changepoint describes the data, not its cause.
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
