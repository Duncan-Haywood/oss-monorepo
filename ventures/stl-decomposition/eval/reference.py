"""Reference decompositions for stl-decomposition, from another implementation.

Run:  python3 eval/reference.py > eval/reference.json   (needs numpy, statsmodels)
Nothing here is imported by the tool: the JavaScript engine is checked
against this file's output (engine.test.mjs).

Each case runs statsmodels.tsa.seasonal.STL (a port of the authors' Fortran
by the statsmodels developers) on a series with the stated settings and
records trend, seasonal, remainder and robustness weights. Synthetic series
are drawn from a seeded numpy generator, so the file is reproducible.
"""
import csv
import json
import os

import numpy as np
import statsmodels
from statsmodels.tsa.seasonal import STL

HERE = os.path.dirname(os.path.abspath(__file__))


def co2():
    with open(os.path.join(HERE, "..", "data", "mauna-loa-co2-monthly.csv")) as f:
        return [float(r["co2_ppm"]) for r in csv.DictReader(f)]


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
print(json.dumps(out))
