# Does a physics digital twin beat black-box models on a real two-tank rig? An 8-parameter twin reaches 0.53 V test RMSE; the best black box needs 9 parameters and gets 0.66 V

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/free-tanktwin/

A free-choice project. Why it seemed worth doing: the portfolio's central theme is digital twins, but nearly every twin here is fitted to another simulator's output. This one is fitted to **measurements from a real physical rig** (the Cascaded Tanks benchmark, a lab setup of two water tanks fed by a pump) and asks the practical twin question: does encoding the physics (Torricelli outflow, an overflow path) generalise to a held-out experiment better than a black-box model with a similar number of parameters? Relates to the sim-to-real and system-identification themes of ARPG and CAIRO; no lab's code is reused. Produced with AI assistance (Claude).

## Data

Schoukens, Mattsson, Ljung, Noël (2016), *Cascaded tanks benchmark combining soft and hard nonlinearities*, Workshop on Nonlinear System Identification Benchmarks. Loaded with the `nonlinear-benchmarks` Python package (BSD-3), which downloads the files on first use. 1,024 samples at 4 s for estimation and 1,024 for test; input = pump voltage, output = lower-tank level sensor in volts (saturates at 10 V). The test set uses a different input realisation, and its first 50 samples are reserved for state initialisation (`state_initialization_window_length`); scores skip them.

## Models (all scored by free-run simulation, no measured output fed back)

| model | parameters | note |
|---|---|---|
| twin (no overflow) | 6 | two-tank Torricelli ODE (`x1' = -a1 sqrt(x1) + b u`, `x2' = a1 sqrt(x1) - a2 sqrt(x2)`), sensor offset, two initial states |
| twin (overflow) | 8 | adds a spill law above a fitted tank-1 level: excess flows on to tank 2 linearly |
| linear ARX 2/2, 4/4 | 5, 9 | output-error free-run of least-squares ARX |
| NARX quadratic 2/2, 3/3, 4/4 | 15, 28, 45 | quadratic polynomial regressors, ridge 1e-6 |

Twins are fitted by simulation-error least squares (`scipy.optimize.least_squares`, 8 Euler sub-steps per sample). On the test set only the two initial states are re-estimated, on the 50-sample window; the physics stays fixed. ARX/NARX are fitted one-step-ahead and then free-run.

## Results (`experiments/results.txt`, figure `experiments/traces.png`)

| model | params | train RMSE (V) | test RMSE (V) | test, saturated samples only (37) | test with output clipped at 10 V |
|---|---|---|---|---|---|
| twin (no overflow) | 6 | 0.566 | 0.659 | 1.238 | 0.654 |
| **twin (overflow)** | 8 | **0.462** | **0.528** | **0.971** | **0.512** |
| linear ARX 2/2 | 5 | 0.622 | 0.715 | 1.235 | 0.714 |
| linear ARX 4/4 | 9 | 0.563 | 0.655 | 1.103 | 0.651 |
| NARX quadratic 2/2 | 15 | 0.681 | 0.808 | 1.417 | 0.808 |
| NARX quadratic 3/3 | 28 | 0.765 | 7.416 | 1.407 | 2.871 |
| NARX quadratic 4/4 | 45 | 39.282 | 42.193 | 39.960 | 20.370 |

- The overflow twin has the lowest test error (0.53 V; 0.51 V once its output is clipped at the sensor's 10 V limit) with 8 parameters. The best black box, a linear ARX 4/4 with 9, gets 0.66 V: the twin is about 20% lower. The no-overflow twin (0.66 V) ties it, so the gain over black-box models comes from the overflow term, not from the Torricelli structure alone.
- More black-box flexibility did not help: quadratic NARX is worse than linear ARX at every order, and the 3/3 and 4/4 models **diverge in free run** (7.4 V and 42 V) even though they fit one step ahead. This is a failure of one-step fitting with a weak ridge, not proof that NARX cannot do this task; a simulation-error fit or stronger regularisation would likely fix it and was not tried.
- Every model is worst on the 37 test samples where the sensor saturates at 10 V (RMSE 1.0 to 1.4 V for the stable ones), the regime the training run barely reaches.

## Limitations

- One rig, one train/test split, one random seed-free fit: the 0.53 vs 0.66 V gap has no confidence interval, and with 974 autocorrelated test samples it is not a significance test. The comparison is suggestive.
- The overflow law is a fitted two-parameter closure, not a measured one; its fitted spill gain (4.2) sits near its upper bound of 5, so the bound shapes that result.
- Hyper-parameters (sub-steps, ridge, orders) were set once, not tuned on the test set; the test set was scored once per model. Fitted twin values are in `results.json` (`theta`: a1, a2, b, offset, x1(0), x2(0), spill level, spill gain; the units are those of the voltage-scaled states, not litres).
- Published results on this benchmark use other metrics and initialisation conventions; no published number is reproduced here, so this project makes no claim about the state of the art. The check against ground truth is synthetic: the tests show the fit recovers a known twin from noiseless data and that ARX recovers a known linear system.

## Reproduce

```
PY=$(python3 platform/ci/pyenv.py pytest numpy scipy matplotlib nonlinear-benchmarks)
"$PY" -m pytest -q research/free-tanktwin/tests
"$PY" research/free-tanktwin/experiments/run.py      # about 1 minute, downloads the data once
"$PY" research/free-tanktwin/experiments/figure.py
```

## Next steps

- Refit the NARX models by simulation error and compare at equal parameter count.
- A bootstrap over blocks of the test trace for an interval on the twin-vs-ARX gap.
- Replace the fitted spill law with a geometry-based weir equation and see whether the fit improves.

## Outside dependencies

The `nonlinear-benchmarks` package and its dataset host (a Google Drive file); numpy, scipy and matplotlib. The physical rig is the benchmark authors'.
