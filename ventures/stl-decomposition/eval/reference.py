"""Reference decompositions for stl-decomposition, from another implementation.

Run:  python3 eval/reference.py > eval/reference.json   (needs numpy, statsmodels)
Nothing here is imported by the tool: the JavaScript engine is checked
against this file's output (engine.test.mjs).

Each case runs statsmodels.tsa.seasonal.STL (and, under "mstl", MSTL) (a port of the authors' Fortran
by the statsmodels developers) on a series with the stated settings and
records trend, seasonal, remainder and robustness weights. Synthetic series
are drawn from a seeded numpy generator, so the file is reproducible.
"""
import csv
import json
import os

import numpy as np
import statsmodels
from statsmodels.tsa.seasonal import MSTL, STL

HERE = os.path.dirname(os.path.abspath(__file__))


def co2():
    with open(os.path.join(HERE, "..", "data", "mauna-loa-co2-monthly.csv")) as f:
        return [float(r["co2_ppm"]) for r in csv.DictReader(f)]


def column(name, col):
    with open(os.path.join(HERE, "..", "data", name)) as f:
        return [float(r[col]) for r in csv.DictReader(f)]


def multi(n, periods, seed):
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    y = 100 + 0.02 * t + rng.normal(0, 1, n)
    for k, p in enumerate(periods):
        y += (6 - 2 * k) * np.sin(2 * np.pi * t / p + k)
    return [float(v) for v in y]


def synthetic(n, period, seed, outliers=0):
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    y = 50 + 0.05 * t + 8 * np.sin(2 * np.pi * t / period) + 3 * np.cos(4 * np.pi * t / period) + rng.normal(0, 1.5, n)
    if outliers:
        idx = rng.choice(n, outliers, replace=False)
        y[idx] += rng.choice([-1, 1], outliers) * 25
    return [float(v) for v in y]


CASES = [
    ("co2-default", co2(), dict(period=12)),
    ("co2-robust", co2(), dict(period=12, robust=True)),
    ("co2-jumps-deg0", co2(), dict(period=12, seasonal=13, seasonal_deg=0, trend_deg=0, low_pass_deg=0, seasonal_jump=3, trend_jump=5, low_pass_jump=2)),
    ("co2-wide", co2(), dict(period=12, seasonal=35, trend=61, low_pass=13)),
    ("daily-outliers-robust", synthetic(210, 7, 1, outliers=8), dict(period=7, robust=True)),
    ("daily-outliers-plain", synthetic(210, 7, 1, outliers=8), dict(period=7)),
    ("short-window-exceeds-n", synthetic(25, 4, 2), dict(period=4, seasonal=15)),
    ("quarterly-even-period-jumps", synthetic(40, 4, 3), dict(period=4, seasonal=9, seasonal_jump=2, trend_jump=3, low_pass_jump=4)),
    ("hourly-24", synthetic(24 * 21, 24, 4, outliers=5), dict(period=24, seasonal=11, robust=True)),
]

# MSTL (Bandara, Hyndman & Bergmeir 2021). "periods"/"windows"/"iterate" go to
# MSTL; "stl" is passed as stl_kwargs to every STL fit inside it.
MSTL_CASES = [
    ("aep-hourly-24-168", column("aep-hourly-load-2017.csv", "load_mw"), dict(periods=(24, 168))),
    ("aep-hourly-robust", column("aep-hourly-load-2017.csv", "load_mw"), dict(periods=(24, 168), stl=dict(robust=True))),
    ("births-7-365", column("us-births-daily.csv", "births"), dict(periods=(7, 365))),
    ("three-periods-unsorted-windows-iterate3", multi(600, (30, 5, 12), 5), dict(periods=(30, 5, 12), windows=(9, 13, 21), iterate=3)),
    ("long-period-dropped", multi(100, (4, 60), 6), dict(periods=(4, 60))),
    ("single-period-default-window", multi(120, (12,), 7), dict(periods=(12,))),
    ("jumps-and-trend", multi(400, (7, 30), 8), dict(periods=(7, 30), stl=dict(trend=61, seasonal_jump=2, trend_jump=3, low_pass_jump=2, seasonal_deg=0))),
]

out = {"statsmodels": statsmodels.__version__, "numpy": np.__version__, "cases": []}
for name, y, kw in CASES:
    res = STL(np.asarray(y), **kw).fit()
    out["cases"].append({
        "name": name,
        "settings": kw,
        "y": y,
        "trend": res.trend.tolist(),
        "seasonal": res.seasonal.tolist(),
        "resid": res.resid.tolist(),
        "weights": res.weights.tolist(),
    })
out["mstl"] = []
for name, y, kw in MSTL_CASES:
    import warnings
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        model = MSTL(np.asarray(y), periods=kw["periods"], windows=kw.get("windows"), iterate=kw.get("iterate", 2), stl_kwargs=dict(kw.get("stl", {})))
        res = model.fit()
    seas = np.asarray(res.seasonal)
    if seas.ndim == 1:
        seas = seas[:, None]
    out["mstl"].append({
        "name": name,
        "settings": {k: (list(v) if isinstance(v, tuple) else v) for k, v in kw.items()},
        "y": y,
        "periods": [int(p) for p in model.periods],
        "windows": [int(w) for w in model.windows],
        "warned": [str(w.message) for w in caught],
        "trend": res.trend.tolist(),
        "seasonal": seas.T.tolist(),
        "resid": res.resid.tolist(),
        "weights": res.weights.tolist(),
    })
print(json.dumps(out))
