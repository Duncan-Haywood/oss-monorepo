# Gaussian process regression

**What smooth curve runs through my data, how sure is it at each point, and
how far past the last point can I trust it?** Paste an x column (numbers, or
dates as `YYYY-MM` / `YYYY-MM-DD`) and a y column. The tool fits a Gaussian
process (Rasmussen & Williams 2006), chooses the kernel's settings by
maximising the log marginal likelihood, and reports:

- the fitted curve with a 95% band for the curve and for a single new reading,
  continued past the last point as a forecast, and predictions at x values you
  choose;
- the settings in your units: how far apart two points must be before the curve
  forgets one from the other (length scale), whether and how often it repeats
  (period), and how much readings scatter around it (noise SD), plus the slope
  of the straight-line mean;
- seven kernels ranked by evidence (RBF, Matern 5/2 and 3/2, rational
  quadratic, periodic, quasi-periodic, smooth + quasi-periodic);
- a closed-form leave-one-out check: how many points fall inside their own 95%
  band when left out, and which points sit more than 3 SD from it.

Live: https://marisstella.app/gaussian-process-regression/ . Everything runs in
the browser (the fit runs in a Web Worker); nothing is uploaded.

## Use it

```
node cli.mjs data/mauna-loa-co2-2010-2026.csv --predict 2027-01,2030-01
node cli.mjs series.csv --x day --y load --kernel quasiperiodic --period 7 --fix-period --json
node ../../platform/agents/tools.mjs call gaussian-process-regression analyze --input '{"x":[0,1,2,3,4,5],"y":[1.2,1.9,3.1,3.8,5.2,6.1],"kernel":"rbf","predictAt":[7]}'
```

Options: `--kernel auto|rbf|matern52|matern32|rq|periodic|quasiperiodic|smooth-quasiperiodic`,
`--mean linear|constant`, `--period P`, `--fix-period`, `--restarts N`,
`--seed S`, `--horizon H`, `--predict a,b,c`, `--csv` (the curve on a grid),
`--json`. The agent call runs in a child process with a 20-second limit: the
seven-kernel `auto` on 200 points takes about 15 s in Node, so name one kernel
for larger inputs.

## Method

- **Model** (R&W Algorithm 2.1). `K` = kernel matrix + noise variance on the
  diagonal + 1e-10; `L` its Cholesky factor; `α = K⁻¹y`. Posterior mean
  `k*ᵀα`, variance `k(x*,x*) − vᵀv`, `v = L⁻¹k*`. y is centred and scaled
  first (scikit-learn's `normalize_y`).
- **Fitting** (R&W section 5.4.1). Maximise `log p(y|X,θ) = −yᵀα/2 − Σ log Lᵢᵢ −
  (n/2) log 2π` over log θ with its exact gradient `½ tr((ααᵀ − K⁻¹) ∂K/∂θ)`
  (eq. 5.9), by a projected L-BFGS (Liu & Nocedal 1989) inside box bounds,
  from a default start plus seeded random restarts drawn log-uniformly from a
  plausible sub-range of the bounds.
- **Linear mean** (R&W section 2.7, eqs. 2.41-2.42). The kernels are fitted to
  what a least-squares line leaves; predictions use `h(x)ᵀβ̄` with `β̄`
  estimated by generalised least squares under `K`, and add `Rᵀ(HK⁻¹Hᵀ)⁻¹R`
  to the variance, so the line's own uncertainty widens the band far from the
  data.
- **Leave-one-out** (R&W eqs. 5.10-5.12): `μᵢ = yᵢ − [K⁻¹y]ᵢ/[K⁻¹]ᵢᵢ`,
  `σᵢ² = 1/[K⁻¹]ᵢᵢ`, from the one fit (with the linear mean, the line is
  treated as known).
- **Kernels.** RBF `exp(−r²/2l²)`; Matern 3/2 and 5/2; rational quadratic
  `(1 + r²/2αl²)^−α`; periodic `exp(−2 sin²(πr/p)/l²)` (MacKay 1998); their
  products and sums, each term with its own signal variance. Parameter order
  follows scikit-learn's `theta`, so the reference comparison is one to one.

What we chose that the book leaves open, and every deviation, is in `PAPERS`
in [`engine.mjs`](engine.mjs).

## Verification

- `eval/reference.py` builds the same seven kernels in **scikit-learn 1.9.1**
  (numpy 2.5.3) on the bundled file (inputs from `eval/inputs.mjs`).
  `engine.test.mjs` checks, for every kernel: the log marginal likelihood and
  each component of its gradient (to 1e-9; observed about 1e-12), and the
  predictive mean and standard deviation at six x values inside and beyond the
  data (to 1e-9). From scikit-learn's own start and bounds with no restarts,
  our optimiser reaches the same optimum for five kernels and a higher one for
  the quasi-periodic kernel (329.47 vs 328.62). For the periodic kernel alone it
  stops at the all-noise corner (−285.21) where scikit-learn's L-BFGS-B
  reaches −58.37; the test checks ours is a genuine KKT point and records the
  difference rather than hiding it.
- The gradient matches central finite differences for every kernel at random
  settings; the closed-form leave-one-out equals refitting without the point;
  a noise-free GP interpolates its data and reverts to the prior far away; the
  linear mean recovers an exact line and its variance grows with distance.
- **Out-of-sample** (`eval/holdout.mjs`, stored in `eval/holdout.json`,
  re-checked by the tests). Fit on 2010-01 to 2023-09 (165 months), forecast
  the 36 months to 2026-09, score against what NOAA measured:

  | Mean | Best-evidence kernel | RMSE (ppm) | Mean error (ppm) | Inside 95% band |
  | --- | --- | ---: | ---: | ---: |
  | constant | smooth + quasi-periodic | 2.47 | +2.36 | 6% |
  | linear | smooth + quasi-periodic | 1.08 | +0.99 | 42% |
  | seasonal naive (last year's month + last year's rise) | | 1.07 | | |

  The linear mean halves the error, but the forecast is no better than the
  naive one and its band is far too narrow out of sample, while inside the
  data the leave-one-out band holds 96% of points. CO2 rose faster than the
  2010-2023 line (positive mean error). The page says so in its limits and FAQ.

Run: `node --test` in this directory (about 30 s). Regenerate the reference
with `node eval/inputs.mjs` then `python3 eval/reference.py` (from the
repository root, paths as in their headers), and the holdout with
`node eval/holdout.mjs`.

## Data

`data/mauna-loa-co2-2010-2026.csv`: NOAA GML monthly mean CO2 at Mauna Loa,
2010-01 to 2026-09, credit NOAA GML; source, terms and caveats in
[`data/SOURCE.md`](data/SOURCE.md).

## Limits

One input column; Gaussian noise of constant size; type-II maximum likelihood
(no priors on the settings); n³ cost (the page takes up to 1,500 points); the
likelihood can have several peaks, and restarts make the higher one likelier,
not certain. Not modelled: several inputs (ARD), heteroscedastic noise,
sparse approximations, the book's four-term Mauna Loa kernel.

**No warranty.** Free and as-is (MIT). Statistical estimates from the data you
supply; not legal, tax, financial or engineering advice, and a forecast band is
not a guarantee. Not affiliated with the authors of the cited works, NOAA or
scikit-learn.
