"""Reference values from statsmodels' UnobservedComponents (BSD-3), for engine.test.mjs.

statsmodels is used only as an independent implementation to check against; no
code from it is ported. Every case uses the exact diffuse initialisation
(`use_exact_diffuse=True`), which is what the engine implements (Durbin &
Koopman 2012, sec. 5.2-5.3; Koopman 1997).

For each case the script fixes the variances (statsmodels' own fit, refined
with Nelder-Mead and then BFGS), and records at those variances:
the diffuse loglikelihood, smoothed states and their variances, the smoothed
irregular and state disturbances with their variances, one-step forecast
errors and variances, and out-of-sample forecasts. The engine is run at the
same variances in the tests, so filter and smoother are compared at equal
inputs; the engine's own MLE is compared separately (its loglikelihood must
be at least statsmodels').

Run from the repository root (needs statsmodels, numpy, pandas):
    python3 ventures/kalman-smoother/eval/reference.py
It rewrites eval/reference.json.
"""

import json
import pathlib

import numpy as np
import pandas as pd
import statsmodels
import statsmodels.api as sm

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parent / "data"

nile = pd.read_csv(DATA / "nile.csv")["volume"].to_numpy(float)
uk = np.log(pd.read_csv(DATA / "uk-driver-deaths.csv")["deaths"].to_numpy(float))
nile_gaps = nile.copy()
nile_gaps[[0, 1, 30, 31, 32, 60, 99]] = np.nan

# name, data, engine spec, statsmodels kwargs
CASES = [
    ("nile-level", nile, {"slope": "none", "season": 0}, {"level": "llevel"}),
    ("nile-drift", nile, {"slope": "fixed", "season": 0}, {"level": "lldtrend"}),
    ("nile-trend", nile, {"slope": "stochastic", "season": 0}, {"level": "lltrend"}),
    ("nile-gaps-trend", nile_gaps, {"slope": "stochastic", "season": 0}, {"level": "lltrend"}),
    ("uk-log-level-seasonal", uk, {"slope": "none", "season": 12}, {"level": "llevel", "seasonal": 12, "stochastic_seasonal": True}),
]
NAMES = {"sigma2.irregular": "irregular", "sigma2.level": "level", "sigma2.trend": "slope", "sigma2.seasonal": "seasonal"}


def arr(x):
    return [None if not np.isfinite(v) else float(v) for v in np.asarray(x, float).ravel()]


out = {"statsmodels": statsmodels.__version__, "cases": []}
for name, y, spec, kw in CASES:
    mod = sm.tsa.UnobservedComponents(y, use_exact_diffuse=True, **kw)
    res = mod.fit(method="nm", maxiter=20000, disp=0)
    res = mod.fit(start_params=res.params, method="bfgs", maxiter=2000, disp=0)
    params = res.params
    variances = {NAMES[k]: float(v) for k, v in zip(mod.param_names, params)}
    r = mod.smooth(params)
    k_states = r.smoothed_state.shape[0]
    fc = r.get_forecast(8)
    # state disturbance of the level is the first selected disturbance in every model here
    case = {
        "name": name,
        "spec": spec,
        "y": arr(y),
        "variances": variances,
        "statsmodelsMleLoglik": float(res.llf),
        "loglik": float(r.llf),
        "nobsDiffuse": int(r.nobs_diffuse),
        "smoothedState": [arr(r.smoothed_state[i]) for i in range(k_states)],
        "smoothedStateVar": [arr(r.smoothed_state_cov[i, i]) for i in range(k_states)],
        "smoothedIrregular": arr(r.smoothed_measurement_disturbance[0]),
        "smoothedIrregularVar": arr(r.smoothed_measurement_disturbance_cov[0, 0]),
        "smoothedLevelDisturbance": arr(r.smoothed_state_disturbance[0]),
        "smoothedLevelDisturbanceVar": arr(r.smoothed_state_disturbance_cov[0, 0]),
        "forecastError": arr(r.filter_results.forecasts_error[0]),
        "forecastErrorVar": arr(r.filter_results.forecasts_error_cov[0, 0]),
        "forecastMean": arr(fc.predicted_mean),
        "forecastVar": arr(fc.var_pred_mean),
    }
    out["cases"].append(case)
    print(name, variances, round(r.llf, 6), "mle", round(res.llf, 6))

(HERE / "reference.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
