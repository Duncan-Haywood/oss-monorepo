# Kalman smoother: the real level under a noisy series, and did it shift?

**Live:** https://marisstella.app/kalman-smoother/ · free, runs in the browser, nothing uploaded.

Paste a time series (monthly sales, weekly sign-ups, a sensor, a river's flow,
a lab value over visits) and get:

- the **underlying level** at every period, from all the data before and after
  it, with a band (80, 90 or 95%);
- the amount of smoothing **chosen by the data** (maximum likelihood), not a
  window you pick;
- **missing values filled** from both sides, with a wider band there;
- a **seasonal pattern** removed (monthly 12, quarterly 4, weekly 7, or any
  period), and the seasonally adjusted series;
- a **slope** (drift or a drifting trend) when the data favour one by AIC;
- **forecasts** with intervals;
- which points are **outliers** (one value off) and which are **level shifts**
  (the level moved and stayed moved), with a t value for each;
- residual checks: Ljung-Box autocorrelation, Bowman-Shenton normality, and
  the H test for a change in noise level.

It is the structural time-series model of Harvey (1989) in state-space form,
filtered and smoothed as in Durbin & Koopman (2012), with the exact diffuse
initialisation of Koopman (1997) and the auxiliary residuals of Harvey &
Koopman (1992) and de Jong & Penzer (1998).

## Use it

- **Browser:** open the page, paste or open a CSV, or load one of the two examples.
- **Command line** (Node 18+, no dependencies):

  ```
  node cli.mjs data/nile.csv --horizon 5
  node cli.mjs data/uk-driver-deaths.csv --log --season 12
  node cli.mjs sales.csv --column revenue --slope stochastic --csv > smoothed.csv
  ```

  `--help` lists every option and prints the citations.
- **Agents:** `node platform/agents/tools.mjs call kalman-smoother analyze --input '{"csv":"year,v\n2001,3\n..."}'`,
  or `{"y":[3, null, 4.1, ...], "season": 4}`; the same through the MCP server.
- **JavaScript:** `analyze(input)` returns JSON with a plain-language `summary`;
  `buildModel`, `kalmanFilter`, `kalmanSmoother` and `fitModel` are exported for
  your own models.

Input is one row per period, equally spaced, in time order. The time column is
used for labels only; blank, `NA` or `.` cells are missing values.

## Model

`y_t = μ_t + γ_t + ε_t`, `μ_{t+1} = μ_t + β_t + η_t`, with the slope `β` absent
(local level), fixed (random walk with drift) or a random walk itself (local
linear trend), and `γ` an optional dummy seasonal of period `s`. All
disturbances are normal and independent. With `--slope auto` (the default) the
three trend forms are fitted and compared by AIC = −2 log L_d + 2(q + w), where
`q` counts the variances and `w` the diffuse initial state elements (Durbin &
Koopman 2012, section 7.4). Variances are maximised on the diffuse
loglikelihood with the irregular variance concentrated out (section 2.10),
by Nelder-Mead over log variance ratios from a grid of starts; a ratio below
1e-9 is reported as zero.

A one-step-ahead filter on flat arrays with the steady-state shortcut does the
likelihood evaluations; the full exact diffuse filter and smoother run once at
the estimate. The longest example (192 months, 13 states, three trend forms)
fits in about 2.5 s in Node.

## Verification

- `eval/reference.py` runs **statsmodels 0.15.0**'s `UnobservedComponents`
  with `use_exact_diffuse=True` on five cases (the Nile as a local level, with
  drift and as a local linear trend; the Nile with seven values removed, two of
  them at the start, inside the diffuse period; and the log UK driver series
  with a 12-month seasonal) and writes `eval/reference.json`.
- `engine.test.mjs` runs the engine at the **same variances** and compares the
  loglikelihood, smoothed states and their variances, the smoothed irregular
  and level disturbances and their variances, and the one-step errors and
  variances at every period. `eval/agreement.mjs` prints the largest relative
  differences: loglikelihood 5.4e-16, smoothed states 1.5e-13, state variances
  4.0e-12, smoothed level disturbance 1.1e-11; every quantity agrees to 1e-10
  or better.
- The engine's own maximum likelihood fit reaches at least statsmodels' fitted
  loglikelihood in all five cases. On the Nile local level model it gives
  σ²_ε = 15,098.5 and σ²_η = 1,469.2; Durbin & Koopman (2012, chapter 2)
  report 15,099 and 1,469.1. (Those two figures are quoted as the book is
  widely cited for them; the book was not re-read in this session.)
- An independent internal check: the exact diffuse smoother is compared with
  an ordinary Kalman smoother started from a huge prior variance (κ = 1e9) on
  the gap case.
- Property tests: affine invariance (scaling and shifting the data scales and
  shifts the level and leaves every t unchanged), a pure-noise series gives a
  zero level variance and a flat line, a planted step and a planted spike are
  found as a shift and an outlier at the right periods, gaps widen the band,
  the concentrated scale maximises the likelihood, and the χ², F, incomplete
  beta and normal-quantile functions match known values.
- What the examples show, checked by `page.test.mjs` against the engine: on the
  Nile the largest level shift is 1898 to 1899 (t ≈ −3; the drop usually linked
  to the first Aswan dam) and 1913 is the largest outlier; on the UK series
  (logs, 12-month seasonal) the largest shift is January to February 1983
  (t ≈ −3.8), when the front-seat belt law took effect on 31 January 1983.
  Neither date is given to the tool.

Run the tests: `node --test` in this folder (about 6 s).
Regenerate the reference (needs statsmodels, numpy, pandas):
`python3 ventures/kalman-smoother/eval/reference.py`.

## Limits

- Equally spaced periods only; keep a gap as a blank row.
- Flags are leads, not verdicts: every period is tested at |t| 2.5 with no
  multiple-testing correction.
- Normal disturbances; with the log option, levels and bands are reported back
  in the original units as medians.
- Not modelled: trigonometric seasonals, cycles, regressors and intervention
  dummies, several series at once, count (Poisson) noise.

## Credit and licence

Implemented from the papers' mathematics; no third-party code was ported.
The regularised gamma function and normal quantile are this repository's own
(from `ventures/mann-kendall-trend` and `ventures/survival-analysis`).
statsmodels (BSD-3) was used only to produce the reference values.
Example data: the Nile series (public domain; Cobb 1978) and the UK driver
series (Harvey & Durbin 1986); see `data/SOURCE.md`.

FSL-1.1-MIT licence. **No warranty.** Statistical output from data you supply, not
legal, tax, financial or professional advice; a smoothed level is a model's
reading, a flag is not proof that anything happened, and a forecast is not a
promise.
